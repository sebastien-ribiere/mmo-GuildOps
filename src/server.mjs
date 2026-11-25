import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createGame, GameError, world } from './domain.mjs';
import { createPostgresGame } from './postgres.mjs';

const assets = new Map([['/', ['index.html','text/html; charset=utf-8']], ['/app.js',['app.js','text/javascript; charset=utf-8']], ['/style.css',['style.css','text/css; charset=utf-8']]]);
const root = new URL('../public/', import.meta.url);
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
async function body(req) {
  let size = 0, chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8192) throw new GameError(413, 'Requête trop grande');
    chunks.push(chunk);
  }
  try { const value = JSON.parse(Buffer.concat(chunks).toString()); if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(); return value; }
  catch { throw new GameError(400, 'JSON invalide'); }
}
export function makeServer(game = createGame()) {
  return createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      const method = req.method;
      const token = req.headers.authorization?.match(/^Bearer ([^ ]+)$/)?.[1];
      if (method === 'GET' && path === '/healthz') return json(res, 200, { status: 'ok' });
      if (method === 'GET' && path === '/readyz') {
        let ready = false;
        try { ready = await game.ready(); } catch {}
        return json(res, ready ? 200 : 503, { status: ready ? 'ok' : 'unavailable', storage: game.storage });
      }
      if (method === 'GET' && path === '/api/world') return json(res, 200, world);
      if (method === 'POST' && path === '/api/players') return json(res, 201, await game.create((await body(req)).name));
      if (method === 'GET' && path === '/api/players/me') return json(res, 200, await game.get(token));
      if (method === 'GET' && path === '/api/inventory') return json(res, 200, (await game.get(token)).inventory);
      if (method === 'GET' && path === '/api/quests') return json(res, 200, [{ ...world.quest, status: (await game.get(token)).quest }]);
      if (method === 'POST' && path === '/api/quests/welcome/accept') return json(res, 200, await game.action(token, req.headers['idempotency-key'], 'accept', 'welcome'));
      if (method === 'POST' && path === '/api/interactions') {
        const data = await body(req);
        return json(res, 200, await game.action(token, req.headers['idempotency-key'], data.action, data.target));
      }
      if (method === 'GET' && assets.has(path)) {
        const [file, type] = assets.get(path);
        const content = await readFile(new URL(file, root));
        res.writeHead(200, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
        return res.end(content);
      }
      return json(res, 404, { error: 'Introuvable' });
    } catch (error) {
      if (!res.headersSent) json(res, error.status || 500, { error: error.status ? error.message : 'Erreur serveur' });
      if (!error.status) console.error('Request failed:', error.code || error.name);
    }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.env.DATABASE_URL && process.env.GUILDOPS_VOLATILE !== '1') {
    throw new Error('DATABASE_URL requise ; GUILDOPS_VOLATILE=1 uniquement pour le prototype sans persistance.');
  }
  const game = process.env.DATABASE_URL ? await createPostgresGame(process.env.DATABASE_URL) : createGame();
  const server = makeServer(game);
  server.listen(Number(process.env.PORT || 8080), process.env.HOST || '127.0.0.1', () => console.log('GuildOps Web prêt — ' + game.storage));
  for (const signal of ['SIGTERM','SIGINT']) process.once(signal, () => {
    server.close(async () => { await game.close?.(); process.exit(0); });
  });
}
