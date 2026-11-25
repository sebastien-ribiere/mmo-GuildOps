import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import pg from 'pg';
import { world } from './domain.mjs';

// Jeu de données de labo déterministe. Jetons FICTIFS et publics : ne jamais réutiliser hors laboratoire.
const FIXED_DATE = '2026-11-30T08:00:00Z';
export const demoPlayers = Object.freeze([
  { id: '00000000-0000-4000-8000-000000000001', name: 'Demo Nouveau', token: 'demo-token-nouveau', quest: 'available', inventory: {} },
  { id: '00000000-0000-4000-8000-000000000002', name: 'Demo Quete', token: 'demo-token-quete', quest: 'active', inventory: {} },
  { id: '00000000-0000-4000-8000-000000000003', name: 'Demo Termine', token: 'demo-token-termine', quest: 'complete', inventory: { [world.quest.reward]: 1 } }
]);
const hash = token => createHash('sha256').update(token).digest('hex');

// Remplace TOUT le contenu des tables de jeu par le jeu de démo, en une transaction.
export async function resetToSeed(connectionString) {
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 3000 });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(105001)');
    await client.query('TRUNCATE players, inventory, interactions CASCADE');
    for (const p of demoPlayers) {
      await client.query('INSERT INTO players (id,name,token_hash,quest,created_at) VALUES ($1,$2,$3,$4,$5)', [p.id, p.name, hash(p.token), p.quest, FIXED_DATE]);
      for (const [item, qty] of Object.entries(p.inventory))
        await client.query('INSERT INTO inventory (player_id,item_id,quantity) VALUES ($1,$2,$3)', [p.id, item, qty]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally { await client.end(); }
  return demoPlayers.length;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL requise.'); process.exit(2); }
  if (!process.argv.includes('--yes')) {
    console.error('Refus : ce reset EFFACE tous les joueurs de la base ' + new URL(url).host + '. Relancer avec --yes (base de laboratoire uniquement).');
    process.exit(2);
  }
  console.log('Reset terminé : ' + await resetToSeed(url) + ' joueurs de démo.');
}
