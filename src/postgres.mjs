import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { GameError, normalizeName, validateKey, applyAction } from './domain.mjs';

const hash = token => createHash('sha256').update(token).digest('hex');
const tokenHash = token => {
  if (typeof token !== 'string' || !token) throw new GameError(401, 'Session inconnue');
  return hash(token);
};
async function transaction(pool, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally { client.release(); }
}
export async function createPostgresGame(connectionString, { migrate = true } = {}) {
  const pool = new pg.Pool({ connectionString, max: 10, connectionTimeoutMillis: 3000, query_timeout: 5000, statement_timeout: 4500 });
  pool.on('error', err => console.error('Database pool:', err.code || err.name));
  try {
    if (migrate) {
      const sql = await readFile(new URL('../migrations/001_init.sql', import.meta.url), 'utf8');
      await transaction(pool, async c => {
        await c.query('SELECT pg_advisory_xact_lock(105001)');
        await c.query(sql);
      });
    }
  } catch (err) { await pool.end(); throw err; }
  async function find(c, token, lock = false) {
    const { rows } = await c.query('SELECT id, name, quest FROM players WHERE token_hash = $1' + (lock ? ' FOR UPDATE' : ''), [tokenHash(token)]);
    if (!rows[0]) throw new GameError(401, 'Session inconnue');
    return rows[0];
  }
  async function snapshot(c, p) {
    const { rows } = await c.query('SELECT item_id, quantity FROM inventory WHERE player_id = $1', [p.id]);
    return { id: p.id, name: p.name, quest: p.quest, inventory: Object.fromEntries(rows.map(r => [r.item_id, r.quantity])) };
  }
  return {
    storage: 'postgresql',
    async ready() { await pool.query('SELECT 1 FROM players LIMIT 1'); return true; },
    async close() { await pool.end(); },
    async create(name) {
      name = normalizeName(name);
      const id = randomUUID(), token = randomUUID();
      await pool.query('INSERT INTO players (id, name, token_hash) VALUES ($1,$2,$3)', [id, name, hash(token)]);
      return { token, player: { id, name, quest: 'available', inventory: {} } };
    },
    async get(token) {
      return transaction(pool, async c => snapshot(c, await find(c, token, true)));
    },
    async action(token, key, action, target) {
      validateKey(key);
      return transaction(pool, async c => {
        const p = await find(c, token, true);
        const signature = JSON.stringify([action, target]);
        const previous = await c.query('SELECT signature, result FROM interactions WHERE player_id = $1 AND request_key = $2', [p.id, key]);
        if (previous.rows[0]) {
          if (previous.rows[0].signature !== signature) throw new GameError(409, 'Clé déjà utilisée pour une autre action');
          return previous.rows[0].result;
        }
        const state = await snapshot(c, p);
        const message = applyAction(state, action, target);
        await c.query('UPDATE players SET quest = $2 WHERE id = $1', [p.id, state.quest]);
        for (const [item, quantity] of Object.entries(state.inventory)) {
          await c.query('INSERT INTO inventory (player_id,item_id,quantity) VALUES ($1,$2,$3) ON CONFLICT (player_id,item_id) DO UPDATE SET quantity = EXCLUDED.quantity', [p.id, item, quantity]);
        }
        const result = { message, player: state };
        await c.query('INSERT INTO interactions (player_id,request_key,signature,result) VALUES ($1,$2,$3,$4::jsonb)', [p.id,key,signature,JSON.stringify(result)]);
        return result;
      });
    }
  };
}
