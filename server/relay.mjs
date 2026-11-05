/**
 * Relay meja untuk mode pengembangan / tunnel.
 *
 * Kenapa ada: aplikasi ini aslinya bersandar pada Firebase Realtime Database.
 * Tanpa kredensial, mode "Simulasi Lokal" hanya menyinkronkan tab di SATU
 * browser — dua HP tidak bisa masuk meja yang sama. Relay kecil ini menutup
 * celah itu saat dijalankan di mesin pengembang (atau lewat tunnel), tanpa
 * perlu akun Firebase.
 *
 * Desain:
 *  - State meja disimpan di memori proses (bukan disk): cukup untuk sesi main,
 *    dan hilang saat server dimatikan.
 *  - Tulis memakai CAS (`baseRev`), jadi dua klien yang menekan tombol
 *    bersamaan tidak saling menimpa. Klien yang kalah mendapat 409 + state
 *    terbaru lalu mengulang mutator-nya — semantik yang sama dengan
 *    `runTransaction` Firebase.
 *  - Klien berlangganan lewat Server-Sent Events (satu koneksi HTTP), bukan
 *    WebSocket, supaya tidak butuh dependensi tambahan dan tetap lolos proxy
 *    tunnel.
 *
 * Server TIDAK tahu aturan permainan: ia hanya menyimpan dan menyiarkan state.
 * Semua aturan tetap di `engine/roomEngine.js` dan `poker/pokerEngine.js`.
 */

const MAX_BODY_BYTES = 1_500_000;
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const PRESENCE_TTL_MS = 45_000;
const SWEEP_MS = 60_000;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('payload-too-large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve(null);
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('bad-json'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload ?? null);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

export function createRelay({ log = () => {} } = {}) {
  /** @type {Map<string, {rev:number, value:any, updatedAt:number, streams:Set<any>, presence:Map<string,{online:boolean,lastSeen:number}>}>} */
  const rooms = new Map();

  const keyOf = (root, code) => `${root}/${code}`;

  function getRoom(root, code) {
    const key = keyOf(root, code);
    let room = rooms.get(key);
    if (!room) {
      room = { rev: 0, value: null, updatedAt: Date.now(), streams: new Set(), presence: new Map() };
      rooms.set(key, room);
    }
    return room;
  }

  function presenceSnapshot(room) {
    const now = Date.now();
    const out = {};
    for (const [clientId, entry] of room.presence) {
      out[clientId] = {
        online: Boolean(entry.online) && now - entry.lastSeen < PRESENCE_TTL_MS,
        lastSeen: entry.lastSeen,
      };
    }
    return out;
  }

  function writeEvent(res, event, payload) {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    } catch {
      /* klien sudah pergi */
    }
  }

  function broadcast(room, event) {
    if (!room.streams.size) return;
    const payload = event === 'presence'
      ? { presence: presenceSnapshot(room) }
      : { rev: room.rev, value: room.value, presence: presenceSnapshot(room) };
    for (const res of room.streams) writeEvent(res, event, payload);
  }

  function openStream(req, res, room) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Cloudflare & proxy lain tidak boleh menahan/membundel stream ini.
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 1500\n\n');
    room.streams.add(res);
    writeEvent(res, 'state', { rev: room.rev, value: room.value, presence: presenceSnapshot(room) });
    const ping = setInterval(() => {
      try { res.write(': ping\n\n'); } catch { /* diabaikan */ }
    }, 25_000);
    const cleanup = () => {
      clearInterval(ping);
      room.streams.delete(res);
    };
    req.on('close', cleanup);
    req.on('error', cleanup);
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://relay.local');
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'relay') return false;

    // GET /relay/health
    if (parts[1] === 'health') {
      sendJson(res, 200, { ok: true, rooms: rooms.size, uptime: Math.round(process.uptime()) });
      return true;
    }

    // /relay/stream/:root/:code
    if (parts[1] === 'stream' && parts[2] && parts[3]) {
      const room = getRoom(parts[2], parts[3]);
      openStream(req, res, room);
      return true;
    }

    // /relay/presence/:root/:code[/:clientId]
    if (parts[1] === 'presence' && parts[2] && parts[3]) {
      const room = getRoom(parts[2], parts[3]);
      const clientId = parts[4];
      if (req.method === 'POST' && clientId) {
        const body = await readBody(req).catch(() => null);
        if (!body || typeof body !== 'object') {
          sendJson(res, 400, { error: 'bad-body' });
          return true;
        }
        room.presence.set(decodeURIComponent(clientId), {
          online: body.online !== false,
          lastSeen: Date.now(),
        });
        broadcast(room, 'presence');
        sendJson(res, 200, { ok: true });
        return true;
      }
      sendJson(res, 200, { presence: presenceSnapshot(room) });
      return true;
    }

    // /relay/room/:root/:code
    if (parts[1] === 'room' && parts[2] && parts[3]) {
      const room = getRoom(parts[2], parts[3]);

      if (req.method === 'GET') {
        // ?since=REV dipakai klien polling: kalau tidak ada perubahan, balas
        // ringkas supaya lewat tunnel tetap murah.
        const since = Number(url.searchParams.get('since'));
        const presence = presenceSnapshot(room);
        if (Number.isFinite(since) && since === room.rev && room.value) {
          sendJson(res, 200, { rev: room.rev, unchanged: true, presence });
          return true;
        }
        sendJson(res, room.value ? 200 : 404, { rev: room.rev, value: room.value, presence });
        return true;
      }

      if (req.method === 'POST') {
        const body = await readBody(req).catch(() => null);
        if (!body || typeof body !== 'object') {
          sendJson(res, 400, { error: 'bad-body' });
          return true;
        }
        const baseRev = Number(body.baseRev) || 0;
        if (baseRev !== room.rev) {
          // Klien kalah balapan: kirim state terbaru, dia yang mengulang.
          sendJson(res, 409, { rev: room.rev, value: room.value });
          return true;
        }
        room.rev += 1;
        room.value = body.value ?? null;
        room.updatedAt = Date.now();
        broadcast(room, 'state');
        sendJson(res, 200, { rev: room.rev, value: room.value });
        log(`tulis ${parts[2]}/${parts[3]} rev=${room.rev}`);
        return true;
      }

      sendJson(res, 405, { error: 'method-not-allowed' });
      return true;
    }

    sendJson(res, 404, { error: 'not-found' });
    return true;
  }

  function middleware(req, res, next) {
    if (!req.url || !req.url.startsWith('/relay/')) {
      next();
      return;
    }
    handle(req, res).catch(error => {
      if (res.headersSent) {
        try { res.end(); } catch { /* diabaikan */ }
        return;
      }
      sendJson(res, 500, { error: String(error?.message || error) });
    });
  }

  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, room] of rooms) {
      const idle = now - room.updatedAt > ROOM_TTL_MS && room.streams.size === 0;
      if (idle) rooms.delete(key);
    }
  }, SWEEP_MS);
  sweeper.unref?.();

  return { middleware, rooms, stats: () => ({ rooms: rooms.size }) };
}

/**
 * Plugin Vite: memasang relay langsung di dev server (dan `vite preview`),
 * jadi tidak perlu proses kedua dan tunnel tetap satu pintu.
 */
export function relayPlugin() {
  return {
    name: 'bawaslu-relay',
    configureServer(server) {
      const relay = createRelay({ log: message => server.config.logger.info(`[relay] ${message}`) });
      server.middlewares.use(relay.middleware);
      server.config.logger.info('[relay] meja multiplayer lokal aktif di /relay/*');
    },
    configurePreviewServer(server) {
      const relay = createRelay({ log: message => server.config.logger.info(`[relay] ${message}`) });
      server.middlewares.use(relay.middleware);
    },
  };
}

export default relayPlugin;
