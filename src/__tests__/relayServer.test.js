import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, request as httpRequest } from 'node:http';
import { createRelay } from '../../server/relay.mjs';

let server;
let base;

function call(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = httpRequest(
      `${base}${path}`,
      {
        method,
        headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {},
      },
      res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed = null;
          try { parsed = JSON.parse(text); } catch { parsed = text; }
          resolve({ status: res.statusCode, body: parsed });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

beforeAll(async () => {
  const relay = createRelay();
  server = createServer((req, res) => relay.middleware(req, res, () => {
    res.writeHead(404);
    res.end('no');
  }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
});

describe('relay meja lokal', () => {
  it('membuat meja lalu menolak tulis dengan baseRev basi (CAS)', async () => {
    const created = await call('POST', '/relay/room/pokerRooms/CAS001', { baseRev: 0, value: { code: 'CAS001', seats: [] } });
    expect(created.status).toBe(200);
    expect(created.body.rev).toBe(1);

    const stale = await call('POST', '/relay/room/pokerRooms/CAS001', { baseRev: 0, value: { code: 'CAS001', seats: ['x'] } });
    expect(stale.status).toBe(409);
    expect(stale.body.rev).toBe(1);
    // State lama tidak tertimpa oleh penulis yang kalah balapan.
    expect(stale.body.value.seats).toEqual([]);

    const fresh = await call('POST', '/relay/room/pokerRooms/CAS001', { baseRev: 1, value: { code: 'CAS001', seats: ['y'] } });
    expect(fresh.status).toBe(200);
    expect(fresh.body.rev).toBe(2);
  });

  it('polling ?since=rev menjawab ringkas bila tidak ada perubahan', async () => {
    const unchanged = await call('GET', '/relay/room/pokerRooms/CAS001?since=2');
    expect(unchanged.status).toBe(200);
    expect(unchanged.body.unchanged).toBe(true);
    expect(unchanged.body.value).toBeUndefined();

    const changed = await call('GET', '/relay/room/pokerRooms/CAS001?since=1');
    expect(changed.status).toBe(200);
    expect(changed.body.value.seats).toEqual(['y']);
  });

  it('meja yang belum ada menjawab 404', async () => {
    const missing = await call('GET', '/relay/room/rooms/TIDAK1');
    expect(missing.status).toBe(404);
  });

  it('presence tercatat dan ikut pada pembacaan meja', async () => {
    await call('POST', '/relay/room/rooms/PRES01', { baseRev: 0, value: { code: 'PRES01', seats: [] } });
    await call('POST', '/relay/presence/rooms/PRES01/pemain-a', { online: true });
    const read = await call('GET', '/relay/room/rooms/PRES01');
    expect(read.body.presence['pemain-a'].online).toBe(true);

    await call('POST', '/relay/presence/rooms/PRES01/pemain-a', { online: false });
    const offline = await call('GET', '/relay/room/rooms/PRES01');
    expect(offline.body.presence['pemain-a'].online).toBe(false);
  });

  it('health melaporkan jumlah meja', async () => {
    const health = await call('GET', '/relay/health');
    expect(health.status).toBe(200);
    expect(health.body.ok).toBe(true);
    expect(health.body.rooms).toBeGreaterThanOrEqual(2);
  });
});
