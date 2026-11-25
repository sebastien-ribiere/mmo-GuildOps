import { randomUUID } from 'node:crypto';

export const world = Object.freeze({
  size: 9, spawn: { x: 1, y: 1 },
  npc: { id: 'guildmaster', name: 'Maître de guilde', x: 4, y: 4 },
  quest: { id: 'welcome', title: 'Bienvenue à la guilde', reward: 'badge-guilde' }
});

export class GameError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function normalizeName(name) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 32)
    throw new GameError(400, 'Nom requis (1 à 32 caractères)');
  return name.trim();
}
export function validateKey(key) {
  if (typeof key !== 'string' || !key.trim() || key.length > 128)
    throw new GameError(400, 'Idempotency-Key requise');
}
export function applyAction(p, action, target) {
  let message;
  if (action === 'accept' && target === world.quest.id) {
    if (p.quest === 'available') p.quest = 'active';
    message = p.quest === 'complete' ? 'Quête déjà terminée.' : 'Bienvenue ! Parle au maître de guilde.';
  } else if (action === 'talk' && target === world.npc.id) {
    if (p.quest === 'active') {
      p.quest = 'complete';
      p.inventory[world.quest.reward] = 1;
      message = 'Quête terminée : badge de guilde reçu !';
    } else {
      message = p.quest === 'complete' ? 'Tu es déjà membre de la guilde.' : 'Accepte ma quête pour rejoindre la guilde.';
    }
  } else throw new GameError(400, 'Action ou cible inconnue');
  return message;
}
export function createGame() {
  const players = new Map();
  function snapshot(p) {
    return { id: p.id, name: p.name, quest: p.quest, inventory: { ...p.inventory } };
  }
  function player(token) {
    const p = players.get(token);
    if (!p) throw new GameError(401, 'Session inconnue');
    return p;
  }
  return {
    storage: 'volatile',
    async ready() { return true; },
    create(name) {
      name = normalizeName(name);
      const token = randomUUID();
      const p = { id: randomUUID(), name: name.trim(), quest: 'available', inventory: {}, requests: new Map() };
      players.set(token, p);
      return { token, player: snapshot(p) };
    },
    get(token) { return snapshot(player(token)); },
    action(token, key, action, target) {
      const p = player(token);
      validateKey(key);
      const signature = JSON.stringify([action, target]);
      const old = p.requests.get(key);
      if (old) {
        if (old.signature !== signature) throw new GameError(409, 'Clé déjà utilisée pour une autre action');
        return structuredClone(old.result);
      }
      const message = applyAction(p, action, target);
      const result = { message, player: snapshot(p) };
      p.requests.set(key, { signature, result });
      return structuredClone(result);
    }
  };
}
