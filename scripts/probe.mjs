// Sonde HTTP : à intervalle fixe, interroge /healthz, /readyz et une route de jeu ; une ligne CSV par sonde.
// Usage : node scripts/probe.mjs [--base URL] [--interval-ms 1000] [--duration-s N] [--out FICHIER.csv] [--token T]
// Sans --duration-s, tourne jusqu'à Ctrl-C. Ajoute au fichier s'il existe : relancer pendant une panne ne perd rien.
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, assertLabTarget, percentile, csvLine, round, timedFetch, UsageError } from './lib/common.mjs';

const spec = {
  base: { default: 'http://127.0.0.1:8080' },
  'interval-ms': { type: 'number', default: 1000 },
  'duration-s': { type: 'number', default: 0 },
  out: { default: 'artifacts/probe/probe.csv' },
  token: { default: '' },
  'timeout-ms': { type: 'number', default: 2000 },
  'allow-remote': { type: 'boolean' }
};
const HEADER = ['ts', 'probe', 'status', 'ok', 'latency_ms', 'error'];

export async function probe(argv, { signal } = {}) {
  const o = parseArgs(argv, spec);
  const base = o.base.replace(/\/$/, '');
  await assertLabTarget(base, o['allow-remote']);
  mkdirSync(dirname(o.out), { recursive: true });
  if (!existsSync(o.out)) appendFileSync(o.out, csvLine(HEADER));
  let token = o.token || null;
  const fixedToken = Boolean(o.token);
  const stats = {};
  const record = (name, r) => {
    const s = (stats[name] ??= { total: 0, ok: 0, ms: [] });
    s.total++; if (r.ok) { s.ok++; s.ms.push(r.ms); }
    appendFileSync(o.out, csvLine([r.ts, name, r.status, r.ok, round(r.ms, 3), r.error]));
  };
  const deadline = o['duration-s'] ? Date.now() + o['duration-s'] * 1000 : Infinity;
  while (Date.now() < deadline && !signal?.aborted) {
    const tick = Date.now();
    record('healthz', await timedFetch(base + '/healthz', {}, o['timeout-ms']));
    record('readyz', await timedFetch(base + '/readyz', {}, o['timeout-ms']));
    if (!token) { // jeton de sonde créé à la volée ; son échec est lui-même une mesure (API ou base en panne)
      const c = await timedFetch(base + '/api/players', { method: 'POST', body: JSON.stringify({ name: 'Sonde' }) }, o['timeout-ms']);
      if (c.json?.token) token = c.json.token;
      else record('game', { ...c, ok: false, error: c.error || 'création du jeton de sonde : HTTP ' + c.status });
    }
    if (token) {
      const g = await timedFetch(base + '/api/inventory', { headers: { Authorization: 'Bearer ' + token } }, o['timeout-ms']);
      if (g.status === 401 && !fixedToken) token = null;
      record('game', g);
    }
    const wait = o['interval-ms'] - (Date.now() - tick);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
  }
  return Object.fromEntries(Object.entries(stats).map(([k, s]) => [k, { total: s.total, ok: s.ok, failed: s.total - s.ok, p95_ms: round(percentile(s.ms, 0.95)) }]));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ctl = new AbortController();
  for (const s of ['SIGINT', 'SIGTERM']) process.once(s, () => ctl.abort());
  try {
    const summary = await probe(process.argv.slice(2), { signal: ctl.signal });
    console.log('Sonde terminée (comptes bruts, à interpréter) :');
    console.table(summary);
  } catch (err) {
    if (err instanceof UsageError) { console.error(err.message); process.exit(2); }
    throw err;
  }
}
