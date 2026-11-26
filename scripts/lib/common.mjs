import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export class UsageError extends Error {}

export function parseArgs(argv, spec) {
  const out = {};
  for (const [k, v] of Object.entries(spec)) out[k] = v.default;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new UsageError('Argument inattendu : ' + a);
    const key = a.slice(2);
    const def = spec[key];
    if (!def) throw new UsageError('Option inconnue : ' + a);
    if (def.type === 'boolean') { out[key] = true; continue; }
    const value = argv[++i];
    if (value === undefined) throw new UsageError('Valeur manquante pour ' + a);
    if (def.type === 'number') {
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) throw new UsageError(a + ' doit être un nombre > 0');
      out[key] = n;
    } else out[key] = value;
  }
  return out;
}

// Loopback, réseaux privés (RFC 1918), lien local, ULA IPv6 : cibles de laboratoire.
export function isLabAddress(ip) {
  if (ip.includes(':')) {
    const v = ip.toLowerCase();
    return v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

// Refuse une cible qui n'est pas locale/privée, sauf demande explicite : évite de charger un service tiers.
export async function assertLabTarget(base, allowRemote) {
  const url = new URL(base);
  const { address } = isIP(url.hostname) ? { address: url.hostname } : await lookup(url.hostname);
  if (!allowRemote && !isLabAddress(address))
    throw new UsageError(`Cible refusée : ${url.hostname} (${address}) n'est pas une adresse locale ou privée. Ces outils servent aux laboratoires ; --allow-remote lève la garde, à vos risques et seulement sur une cible dont vous êtes responsable.`);
  return address;
}

// Rang le plus proche : le plus petit x tel qu'au moins p % des valeurs sont <= x.
export function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

export const csvCell = v => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
};
export const csvLine = cells => cells.map(csvCell).join(',') + '\n';
export const round = (n, d = 2) => n === null ? null : Math.round(n * 10 ** d) / 10 ** d;

// Un appel HTTP qui ne lève jamais : un échec réseau est une mesure, pas un crash.
export async function timedFetch(url, options = {}, timeoutMs = 10000) {
  const t0 = performance.now();
  const ts = new Date().toISOString();
  try {
    const res = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { ts, status: res.status, ok: res.ok, ms: performance.now() - t0, bytes: Buffer.byteLength(text), json, error: '' };
  } catch (err) {
    const cause = err.cause?.code || err.name;
    return { ts, status: 0, ok: false, ms: performance.now() - t0, bytes: 0, json: null, error: cause === 'TimeoutError' ? 'timeout' : String(cause) };
  }
}
