import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createPostgresGame } from '../src/postgres.mjs';
import { resetToSeed, demoPlayers } from '../src/seed.mjs';

const url = process.env.TEST_DATABASE_URL;
async function dump() {
  const c = new pg.Client({ connectionString: url }); await c.connect();
  try {
    const players = (await c.query('SELECT id,name,token_hash,quest,created_at FROM players ORDER BY id')).rows;
    const inventory = (await c.query('SELECT player_id,item_id,quantity FROM inventory ORDER BY 1,2')).rows;
    const interactions = (await c.query('SELECT count(*)::int AS n FROM interactions')).rows[0].n;
    return { players, inventory, interactions };
  } finally { await c.end(); }
}

test('Seed : reset déterministe et réutilisable', { skip: !url }, async t => {
  const game = await createPostgresGame(url); // applique les migrations
  t.after(() => game.close());
  assert.equal(await resetToSeed(url), demoPlayers.length);
  const first = await dump();
  assert.equal(first.players.length, 3);
  assert.equal(first.interactions, 0);

  // Les jetons de démo ouvrent les sessions attendues.
  assert.equal((await game.get('demo-token-nouveau')).quest, 'available');
  assert.equal((await game.get('demo-token-termine')).inventory['badge-guilde'], 1);

  // Du jeu réel pollue la base, un joueur hors seed est créé : le reset rétablit l'état exact.
  await game.action('demo-token-nouveau', 'k1', 'accept', 'welcome');
  await game.action('demo-token-nouveau', 'k2', 'talk', 'guildmaster');
  await game.create('Intrus');
  assert.notDeepEqual(await dump(), first);
  await resetToSeed(url);
  assert.deepEqual(await dump(), first);
  assert.deepEqual((await game.get('demo-token-nouveau')).inventory, {});
  await assert.rejects(game.get('inconnu'), { status: 401 });
});
