import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeServer } from '../src/server.mjs';
import { run } from '../scripts/load.mjs';
import { probe } from '../scripts/probe.mjs';
import { percentile, isLabAddress, assertLabTarget, csvLine } from '../scripts/lib/common.mjs';

const lines = file => readFileSync(file, 'utf8').trim().split('\n');
const start = async () => {
  const server = makeServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return { server, base: 'http://127.0.0.1:' + server.address().port };
};

test('percentile : rang le plus proche, valeurs connues', () => {
  const v = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.equal(percentile(v, 0.5), 50);
  assert.equal(percentile(v, 0.95), 95);
  assert.equal(percentile(v, 0.99), 99);
  assert.equal(percentile([7], 0.99), 7);
  assert.equal(percentile([], 0.5), null);
});

test('CSV : échappement des virgules, guillemets et retours à la ligne', () => {
  assert.equal(csvLine(['a', 'b,c', 'd"e', 'f\ng', null]), 'a,"b,c","d""e","f\ng",\n');
});

test('garde de cible : locale/privée acceptée, publique refusée', async () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.18.0.5', '192.168.1.9', '::1']) assert.equal(isLabAddress(ip), true, ip);
  for (const ip of ['8.8.8.8', '172.32.0.1', '1.1.1.1']) assert.equal(isLabAddress(ip), false, ip);
  await assert.rejects(assertLabTarget('http://8.8.8.8', false), /Cible refusée/);
  assert.equal(await assertLabTarget('http://8.8.8.8', true), '8.8.8.8');
});

test('load : CSV et JSON cohérents sur un serveur réel', async t => {
  const { server, base } = await start();
  t.after(() => new Promise(r => server.close(r)));
  const out = join(mkdtempSync(join(tmpdir(), 'load-')), 'run');
  const { summary, csvPath } = await run(['--base', base, '--journeys', '20', '--concurrency', '4', '--out', out]);
  assert.equal(summary.requests, 100);
  assert.equal(summary.errors, 0);
  assert.equal(summary.failed_journeys, 0);
  assert.deepEqual(Object.keys(summary.by_step).sort(), ['accept', 'create', 'inventory', 'me', 'talk']);
  assert.ok(summary.overall.p50_ms <= summary.overall.p95_ms && summary.overall.p95_ms <= summary.overall.p99_ms);
  const rows = lines(csvPath);
  assert.equal(rows[0], 'ts,journey,step,method,path,status,ok,latency_ms,bytes_in,error');
  assert.equal(rows.length, 101);
  assert.ok(rows.slice(1).every(r => r.split(',')[5] === '200' || r.split(',')[5] === '201'));
  assert.equal(JSON.parse(readFileSync(out + '.json', 'utf8')).config.journeys, 20);
});

test('load : serveur injoignable = erreurs mesurées, pas de plantage', async () => {
  const { server, base } = await start();
  await new Promise(r => server.close(r));
  const out = join(mkdtempSync(join(tmpdir(), 'load-')), 'down');
  const { summary } = await run(['--base', base, '--journeys', '5', '--concurrency', '2', '--out', out, '--timeout-ms', '500']);
  assert.equal(summary.requests, 5);
  assert.equal(summary.errors, 5);
  assert.equal(summary.failed_journeys, 5);
  assert.ok(Object.keys(summary.error_kinds).length >= 1);
});

test('load : garde-fous (concurrence élevée, cible publique, option inconnue)', async () => {
  await assert.rejects(run(['--concurrency', '200']), /refusée/);
  await assert.rejects(run(['--base', 'http://8.8.8.8']), /Cible refusée/);
  await assert.rejects(run(['--nope']), /Option inconnue/);
  await assert.rejects(run(['--journeys', '0']), /nombre > 0/);
});

test('probe : trois sondes par cycle, puis panne visible, puis reprise', async t => {
  const { server, base } = await start();
  const out = join(mkdtempSync(join(tmpdir(), 'probe-')), 'p.csv');
  const args = (seconds, ...more) => ['--base', base, '--interval-ms', '50', '--duration-s', String(seconds), '--out', out, ...more];
  const up = await probe(args(0.3));
  assert.ok(up.healthz.total >= 2 && up.healthz.failed === 0 && up.readyz.failed === 0 && up.game.failed === 0, JSON.stringify(up));
  await new Promise(r => server.close(r));
  const down = await probe(args(0.2, '--timeout-ms', '300'));
  assert.ok(down.healthz.ok === 0 && down.readyz.ok === 0 && down.game.ok === 0, JSON.stringify(down));
  const rows = lines(out);
  assert.equal(rows[0], 'ts,probe,status,ok,latency_ms,error');
  assert.equal(rows.filter(r => r.startsWith('ts,')).length, 1, 'un seul en-tête malgré deux lancements (ajout au fichier)');
  assert.ok(rows.some(r => r.includes(',healthz,200,true')));
  assert.ok(rows.some(r => r.includes(',healthz,0,false')));
  // reprise sur un nouveau serveur au même port : la sonde recrée son jeton
  const again = makeServer(); again.listen(Number(new URL(base).port), '127.0.0.1'); await once(again, 'listening');
  t.after(() => new Promise(r => again.close(r)));
  const back = await probe(args(0.3));
  assert.ok(back.game.ok >= 2 && back.game.failed === 0, JSON.stringify(back));
});
