import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresGame } from '../src/postgres.mjs';

test('PostgreSQL : deux instances, concurrence, idempotence et reconnexion', {skip: !process.env.TEST_DATABASE_URL}, async t => {
  const a = await createPostgresGame(process.env.TEST_DATABASE_URL);
  t.after(() => a.close());
  const b = await createPostgresGame(process.env.TEST_DATABASE_URL);
  t.after(() => b.close());
  assert.equal(await a.ready(),true);
  const {token} = await a.create('Miette');
  const other = await b.create('Autre');
  await a.action(token,'accept','accept','welcome');
  const [first,second] = await Promise.all([a.action(token,'talk','talk','guildmaster'), b.action(token,'talk','talk','guildmaster')]);
  assert.deepEqual(first,second);
  await Promise.all([a.action(token,'talk2','talk','guildmaster'),b.action(token,'talk3','talk','guildmaster')]);
  assert.equal((await b.get(token)).inventory['badge-guilde'],1);
  assert.deepEqual((await a.get(other.token)).inventory,{});
  await assert.rejects(b.action(token,'talk','accept','welcome'),{status:409});
  await assert.rejects(b.get('unknown'),{status:401});
  const fresh = await createPostgresGame(process.env.TEST_DATABASE_URL);
  try { assert.equal((await fresh.get(token)).quest,'complete'); assert.deepEqual(await fresh.action(token,'talk','talk','guildmaster'),first); }
  finally { await fresh.close(); }
});
