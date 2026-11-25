// Parcours navigateur réel : création → quête → récompense → inventaire → reconnexion.
// Usage : E2E_URL=http://127.0.0.1:8080 node tests/e2e/browser.mjs [--compose]
// --compose : recrée le conteneur API et vérifie aussi le symptôme visible d'une panne d'API.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const base = process.env.E2E_URL || 'http://127.0.0.1:8080';
const compose = process.argv.includes('--compose');
const dc = (...a) => execFileSync('docker', ['compose', ...a], { stdio: 'inherit' });
const shots = 'artifacts/e2e';
mkdirSync(shots, { recursive: true });

async function ready() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(base + '/readyz')).ok) return; } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
  throw Error('API non prête');
}
await ready();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
try {
  const page = await (await browser.newContext()).newPage();
  page.on('pageerror', e => errors.push(String(e)));
  const text = id => page.locator('#' + id).innerText();
  const step = async (n, fn) => { await fn(); console.log('ok  ' + n); };

  await step('création du joueur', async () => {
    await page.goto(base);
    await page.fill('#name', 'Navigateur ' + Date.now());
    await page.click('#join button');
    await page.locator('#play').waitFor({ state: 'visible' });
    assert.equal(await text('quest'), 'Bienvenue à la guilde — disponible');
    assert.equal(await text('inventory'), 'Vide');
    assert.equal(await page.locator('#accept').isDisabled(), true, 'loin du PNJ');
  });
  await step('déplacement jusqu’au maître de guilde (clavier)', async () => {
    for (const k of ['ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowDown']) await page.keyboard.press(k);
    await page.waitForFunction(() => !document.getElementById('accept').disabled);
    await page.screenshot({ path: shots + '/1-pres-du-pnj.png', fullPage: true });
  });
  await step('acceptation puis récompense', async () => {
    await page.click('#accept');
    await page.waitForFunction(() => document.getElementById('quest').textContent === 'Parle au maître de guilde');
    await page.click('#talk');
    await page.waitForFunction(() => document.getElementById('quest').textContent === 'Quête terminée');
    assert.equal(await text('inventory'), 'badge-guilde × 1');
    await page.screenshot({ path: shots + '/2-quete-terminee.png', fullPage: true });
  });
  await step('double clic : pas de doublon', async () => {
    await page.click('#talk');
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('déjà membre'));
    assert.equal(await text('inventory'), 'badge-guilde × 1');
  });
  await step('reconnexion (rechargement de page)', async () => {
    await page.reload();
    await page.waitForFunction(() => !document.getElementById('play').hidden);
    assert.equal(await text('status'), 'Session retrouvée.');
    assert.equal(await text('quest'), 'Quête terminée');
    assert.equal(await text('inventory'), 'badge-guilde × 1');
    await page.screenshot({ path: shots + '/3-apres-rechargement.png', fullPage: true });
  });

  if (compose) {
    await step('panne d’API : symptôme visible, pas de succès fictif', async () => {
      for (const k of ['ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowDown']) await page.keyboard.press(k); // la position n'est pas persistée
      await page.waitForFunction(() => !document.getElementById('talk').disabled);
      dc('stop', 'app');
      await page.click('#talk');
      await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('Action non confirmée'));
      assert.equal(await text('inventory'), 'badge-guilde × 1');
      await page.screenshot({ path: shots + '/4-api-arretee.png', fullPage: true });
      dc('start', 'app');
      await ready();
    });
    await step('redémarrage de l’API puis reconnexion', async () => {
      dc('up', '-d', '--force-recreate', '--no-deps', 'app');
      await ready();
      await page.reload();
      await page.waitForFunction(() => document.getElementById('status').textContent === 'Session retrouvée.');
      assert.equal(await text('inventory'), 'badge-guilde × 1');
      await page.screenshot({ path: shots + '/5-apres-recreation-api.png', fullPage: true });
    });
  }
  assert.deepEqual(errors, [], 'erreurs JS non interceptées');
  console.log('PASS: parcours navigateur' + (compose ? ' + panne/reprise API' : ''));
} finally { await browser.close(); }
