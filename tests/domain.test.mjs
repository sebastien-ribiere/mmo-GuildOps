import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/domain.mjs';

test('quête, récompense, replay, isolation', () => {
  const g=createGame(), a=g.create('A'), b=g.create('B');
  assert.equal(g.action(a.token,'0','talk','guildmaster').player.quest,'available');
  g.action(a.token,'1','accept','welcome');
  const result=g.action(a.token,'2','talk','guildmaster');
  assert.equal(result.player.quest,'complete');
  assert.deepEqual(g.action(a.token,'2','talk','guildmaster'),result);
  assert.throws(()=>g.action(a.token,'2','accept','welcome'),{status:409});
  g.action(a.token,'3','talk','guildmaster');
  assert.equal(g.get(a.token).inventory['badge-guilde'],1);
  assert.deepEqual(g.get(b.token).inventory,{});
  assert.throws(()=>g.get('bad'),{status:401});
});
test('validation et état volatile explicite',()=>{
  const g=createGame();
  assert.throws(()=>g.create(' '),{status:400});
  const {token}=g.create('A');
  assert.throws(()=>g.action(token,undefined,'accept','welcome'),{status:400});
  assert.throws(()=>g.action(token,'x','cheat','gold'),{status:400});
  assert.throws(()=>createGame().get(token),{status:401});
});
