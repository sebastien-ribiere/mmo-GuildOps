// Charge reproductible : rejoue le parcours joueur existant (5 requêtes) et écrit un CSV par requête + un JSON de synthèse.
// Usage : node scripts/load.mjs [--base URL] [--journeys N] [--concurrency C] [--out PREFIXE]
// ATTENTION : chaque parcours CRÉE un joueur dans la base visée (voir `npm run reset`).
import { writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { dirname } from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parseArgs, assertLabTarget, percentile, csvLine, round, timedFetch, UsageError } from './lib/common.mjs';

const MAX_SAFE_CONCURRENCY = 150;
const spec = {
  base: { default: 'http://127.0.0.1:8080' },
  journeys: { type: 'number', default: 1000 },
  concurrency: { type: 'number', default: 10 },
  out: { default: 'artifacts/load/run' },
  'timeout-ms': { type: 'number', default: 10000 },
  'allow-high-concurrency': { type: 'boolean' },
  'allow-remote': { type: 'boolean' }
};
const HEADER = ['ts', 'journey', 'step', 'method', 'path', 'status', 'ok', 'latency_ms', 'bytes_in', 'error'];

export async function run(argv) {
  const o = parseArgs(argv, spec);
  const base = o.base.replace(/\/$/, '');
  if (!Number.isInteger(o.journeys) || !Number.isInteger(o.concurrency)) throw new UsageError('--journeys et --concurrency sont des entiers');
  if (o.concurrency > MAX_SAFE_CONCURRENCY && !o['allow-high-concurrency'])
    throw new UsageError(`Concurrence ${o.concurrency} > ${MAX_SAFE_CONCURRENCY} refusée. Sur la machine de référence, à 200 connexions par le port publié par Docker, la redirection de port s'est arrêtée (cause non établie). Visez le conteneur directement ou ajoutez --allow-high-concurrency.`);
  const address = await assertLabTarget(base, o['allow-remote']);
  mkdirSync(dirname(o.out), { recursive: true });
  const csvPath = o.out + '.csv', jsonPath = o.out + '.json';
  writeFileSync(csvPath, csvLine(HEADER));

  const rows = [];
  const call = async (journey, step, method, path, options = {}) => {
    const r = await timedFetch(base + path, { method, ...options }, o['timeout-ms']);
    const row = [r.ts, journey, step, method, path, r.status, r.ok, round(r.ms, 3), r.bytes, r.error];
    rows.push({ step, ok: r.ok, ms: r.ms, error: r.error, status: r.status });
    appendFileSync(csvPath, csvLine(row));
    return r;
  };
  let failedJourneys = 0;
  async function journey(i) {
    const nonce = `${Date.now().toString(36)}-${i}`;
    const created = await call(i, 'create', 'POST', '/api/players', { body: JSON.stringify({ name: 'Charge ' + i }) });
    const token = created.json?.token;
    if (!token) { failedJourneys++; return; }
    const h = { Authorization: 'Bearer ' + token };
    const post = (step, path, key, body) => call(i, step, 'POST', path, { headers: { ...h, 'Idempotency-Key': `${nonce}-${key}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const results = [
      await post('accept', '/api/quests/welcome/accept', 'a'),
      await post('talk', '/api/interactions', 't', { action: 'talk', target: 'guildmaster' }),
      await call(i, 'inventory', 'GET', '/api/inventory', { headers: h }),
      await call(i, 'me', 'GET', '/api/players/me', { headers: h })
    ];
    if (results.some(r => !r.ok)) failedJourneys++;
  }

  const startedAt = new Date();
  const t0 = performance.now();
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(o.concurrency, o.journeys) }, async () => {
    while (next < o.journeys) await journey(next++);
  }));
  const seconds = (performance.now() - t0) / 1000;

  const stat = list => {
    const ms = list.map(r => r.ms);
    return { count: list.length, errors: list.filter(r => !r.ok).length, p50_ms: round(percentile(ms, 0.5)), p95_ms: round(percentile(ms, 0.95)), p99_ms: round(percentile(ms, 0.99)), max_ms: round(ms.length ? Math.max(...ms) : null) };
  };
  const byStep = {};
  for (const step of [...new Set(rows.map(r => r.step))]) byStep[step] = stat(rows.filter(r => r.step === step));
  const errorKinds = {};
  for (const r of rows.filter(r => !r.ok)) { const k = r.error || 'HTTP ' + r.status; errorKinds[k] = (errorKinds[k] || 0) + 1; }
  const summary = {
    tool: 'scripts/load.mjs',
    model: 'boucle fermée : chaque client enchaîne ses parcours sans pause',
    config: { base, resolved_address: address, journeys: o.journeys, concurrency: o.concurrency, timeout_ms: o['timeout-ms'] },
    started_at: startedAt.toISOString(), duration_s: round(seconds, 3),
    requests: rows.length, errors: rows.filter(r => !r.ok).length, failed_journeys: failedJourneys,
    throughput_req_s: round(rows.length / seconds, 1),
    overall: stat(rows), by_step: byStep, error_kinds: errorKinds,
    client: { node: process.version, cpus: os.cpus().length, platform: process.platform },
    limits: 'Une exécution ne prouve rien : répéter. Le client tourne sur la machine mesurée si la cible est locale, et un client peut saturer avant le serveur. Les joueurs créés restent en base.'
  };
  writeFileSync(jsonPath, JSON.stringify(summary, null, 2) + '\n');
  return { summary, csvPath, jsonPath };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { summary, csvPath, jsonPath } = await run(process.argv.slice(2));
    console.log(`${summary.requests} requêtes en ${summary.duration_s} s = ${summary.throughput_req_s} req/s ; erreurs : ${summary.errors} ; p50/p95/p99 : ${summary.overall.p50_ms}/${summary.overall.p95_ms}/${summary.overall.p99_ms} ms`);
    console.log('CSV  : ' + csvPath + '\nJSON : ' + jsonPath);
  } catch (err) {
    if (err instanceof UsageError) { console.error(err.message); process.exit(2); }
    throw err;
  }
}
