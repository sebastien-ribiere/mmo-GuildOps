import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const base = process.env.SMOKE_URL || 'http://127.0.0.1:8080';
const compose = (...args) => execFileSync('docker',['compose',...args],{stdio:'inherit'});
async function json(path,options) {
  const r = await fetch(base+path,options);
  assert.ok(r.ok, path + ' HTTP ' + r.status);
  return r.json();
}
async function wait() {
  for(let i=0;i<60;i++) {
    try { if((await fetch(base+'/readyz')).ok) return; } catch {}
    await new Promise(r=>setTimeout(r,1000));
  }
  throw Error('API non prête');
}
await wait();
const {token} = await json('/api/players',{method:'POST',body:JSON.stringify({name:'Smoke'})});
const headers = {Authorization:'Bearer '+token,'Idempotency-Key':'accept'};
await json('/api/quests/welcome/accept',{method:'POST',headers});
const options={method:'POST',headers:{...headers,'Idempotency-Key':'talk'},body:JSON.stringify({action:'talk',target:'guildmaster'})};
const first=await json('/api/interactions',options);
assert.equal(first.player.inventory['badge-guilde'],1);
compose('up','-d','--force-recreate','--no-deps','app');
await wait();
assert.equal((await json('/api/players/me',{headers})).quest,'complete');
assert.deepEqual(await json('/api/interactions',options),first);
compose('up','-d','--force-recreate','db');
await wait();
assert.equal((await json('/api/inventory',{headers}))['badge-guilde'],1);
compose('exec','-T','app','node','src/seed.mjs','--yes');
const demo = t => ({Authorization:'Bearer '+t});
assert.equal((await json('/api/players/me',{headers:demo('demo-token-termine')})).quest,'complete');
assert.deepEqual(await json('/api/inventory',{headers:demo('demo-token-nouveau')}),{});
assert.equal((await fetch(base+'/api/players/me',{headers})).status,401);
console.log('PASS: reset déterministe : jeu de démo restauré, ancienne session supprimée');
console.log('PASS: session, inventaire, replay après recréation API et DB sans suppression de volume');
