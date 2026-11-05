/**
 * Adapter realtime untuk relay lokal (`server/relay.mjs`).
 *
 * Antarmukanya SENGAJA dibuat identik dengan `createRealtimeService` supaya
 * App.jsx dan PokerApp tidak perlu tahu meja sedang dilayani Firebase, relay,
 * atau localStorage:
 *
 *   mode, clientId, subscribe, create, update, transact, setPresence,
 *   watchPresence, measurePing, firstValue, refreshConnection, connection,
 *   connectionReason, subscribeConnection, rearmPresence, close
 *
 * Perbedaan penting dengan Firebase: relay memakai CAS (`baseRev`) alih-alih
 * transaksi, dan Server-Sent Events alih-alih WebSocket. Efek sampingnya sama:
 * hanya satu penulis yang menang, yang kalah mengulang mutator dengan state
 * terbaru.
 */

const RETRY_LIMIT = 6;

async function requestJson(path, options = {}) {
  const { timeoutMs = 10000, ...rest } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(path, { ...rest, signal: controller.signal, cache: 'no-store' });
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    return { status: response.status, ok: response.ok, body };
  } finally {
    clearTimeout(timer);
  }
}

export function createRelayService(code, clientId, options = {}) {
  const root = options.root || 'rooms';
  const roomPath = `/relay/room/${root}/${encodeURIComponent(code)}`;
  const presencePath = `/relay/presence/${root}/${encodeURIComponent(code)}`;

  const stateSubs = new Set();
  const presenceSubs = new Set();
  const connectionSubs = new Set();

  let rev = 0;
  let value = null;
  let presence = {};
  let hasState = false;
  let closed = false;
  let connection = 'connecting';
  let lastReason = '';

  const merged = () => (value ? { ...value, presence } : null);

  function setConnection(next, reason = '') {
    if (connection === next && lastReason === reason) return;
    connection = next;
    lastReason = reason;
    connectionSubs.forEach(cb => {
      try { cb(next); } catch { /* diabaikan */ }
    });
  }

  function notifyState() {
    const snapshot = merged();
    if (snapshot) stateSubs.forEach(cb => { try { cb(snapshot); } catch { /* diabaikan */ } });
  }

  function notifyPresence() {
    presenceSubs.forEach(cb => { try { cb(presence); } catch { /* diabaikan */ } });
  }

  function applyState(payload) {
    if (!payload) return false;
    const nextRev = Number(payload.rev) || 0;
    const changed = nextRev !== rev || !hasState;
    rev = nextRev;
    if (payload.value !== undefined) value = payload.value;
    presence = payload.presence || presence;
    hasState = true;
    return changed;
  }

  /**
   * Polling, BUKAN SSE.
   *
   * Server relay memang menyediakan `/relay/stream` (SSE) dan itu jalan di
   * localhost — tetapi tunnel Cloudflare menahan respons streaming sampai
   * koneksi ditutup, jadi klien tidak pernah menerima satu pun event. Polling
   * dengan `?since=rev` tetap murah (balasan "unchanged" hanya puluhan byte)
   * dan lolos proxy apa pun. Latensinya di bawah 1 detik — cukup untuk game
   * berbasis giliran.
   */
  const POLL_ACTIVE_MS = 600;
  const POLL_IDLE_MS = 2200;

  let pollTimer = null;

  const pollDelay = () => (
    typeof document !== 'undefined' && document.visibilityState === 'hidden' ? POLL_IDLE_MS : POLL_ACTIVE_MS
  );

  async function pollOnce() {
    if (closed) return;
    try {
      const query = hasState ? `?since=${rev}` : '';
      const result = await requestJson(`${roomPath}${query}`, { timeoutMs: 8000 });
      if (result.status === 404) {
        hasState = true;
        setConnection('connected');
        return;
      }
      if (!result.ok) {
        setConnection('connecting', `http-${result.status}`);
        return;
      }
      setConnection('connected');
      if (result.body?.unchanged) {
        // Presence tetap bisa berubah walau state meja diam.
        const before = JSON.stringify(presence);
        presence = result.body.presence || presence;
        if (JSON.stringify(presence) !== before) {
          notifyPresence();
          notifyState();
        }
        return;
      }
      const changed = applyState(result.body);
      notifyPresence();
      if (changed) notifyState();
    } catch {
      setConnection('connecting', 'timeout');
    }
  }

  function ensurePolling() {
    if (pollTimer || closed) return;
    const loop = async () => {
      if (closed) return;
      await pollOnce();
      pollTimer = setTimeout(loop, pollDelay());
    };
    loop();
  }

  function stopPolling() {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
  }

  async function fetchState(timeoutMs = 10000) {
    const result = await requestJson(roomPath, { timeoutMs });
    if (result.status === 404) {
      rev = 0;
      value = null;
      hasState = true;
      return null;
    }
    if (!result.ok) throw new Error(`relay-http-${result.status}`);
    applyState(result.body);
    return merged();
  }

  async function ensureState() {
    if (hasState) return;
    try {
      await fetchState();
    } catch {
      hasState = true; // biarkan mutator berjalan dengan state kosong → ditolak engine
    }
  }

  return {
    mode: 'relay',
    clientId,

    subscribe(callback) {
      stateSubs.add(callback);
      ensurePolling();
      const snapshot = merged();
      if (snapshot) callback(snapshot);
      return () => { stateSubs.delete(callback); };
    },

    async create(next) {
      const result = await requestJson(roomPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseRev: 0, value: next }),
      });
      if (result.status === 409) {
        const error = new Error('Kode meja sudah dipakai. Coba buka meja lagi.');
        error.code = 'CODE_TAKEN';
        throw error;
      }
      if (!result.ok) throw new Error('Server meja menolak permintaan.');
      applyState(result.body);
      const snapshot = merged();
      if (snapshot) stateSubs.forEach(cb => cb(snapshot));
    },

    async update(patch) {
      return this.transact(current => (current ? { ...current, ...patch } : null));
    },

    // CAS + ulang: sama semantiknya dengan runTransaction Firebase.
    async transact(mutator) {
      await ensureState();
      for (let attempt = 0; attempt < RETRY_LIMIT; attempt += 1) {
        // Mutator menerima state + presence (sama seperti snapshot Firebase):
        // engine Jengges memakai `room.presence` untuk menentukan kursi mana
        // yang AFK, jadi tanpa ini host tidak bisa memulai walau lawannya
        // sudah jelas offline.
        const base = merged();
        const next = mutator(base); // boleh melempar (mis. intent ditolak)
        if (!next) return { committed: false, value: value };
        // Presence TIDAK ikut disimpan: ia hidup di kanal sendiri, dan kalau
        // ikut masuk value, data basi bisa "hidup lagi" saat klien lain menulis.
        const { presence: _ignored, ...stored } = next;
        let result;
        try {
          result = await requestJson(roomPath, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ baseRev: rev, value: stored }),
          });
        } catch (error) {
          lastReason = 'timeout';
          setConnection('connecting', 'timeout');
          throw error;
        }
        if (result.status === 409) {
          // Ada penulis lain lebih dulu: pakai state barunya lalu ulangi.
          applyState(result.body);
          continue;
        }
        if (!result.ok) throw new Error(`relay-http-${result.status}`);
        rev = Number(result.body?.rev) || rev + 1;
        value = stored;
        hasState = true;
        notifyState();
        return { committed: true, value: next };
      }
      throw new Error('Meja sedang ramai. Coba lagi sebentar.');
    },

    async setPresence(online) {
      try {
        await requestJson(`${presencePath}/${encodeURIComponent(clientId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ online }),
          timeoutMs: 6000,
        });
      } catch {
        lastReason = 'presence-fail';
      }
    },

    watchPresence(callback) {
      presenceSubs.add(callback);
      ensurePolling();
      callback(presence);
      return () => { presenceSubs.delete(callback); };
    },

    async measurePing() {
      const started = performance.now();
      try {
        const result = await requestJson('/relay/health', { timeoutMs: 4000 });
        if (!result.ok) return null;
        return Math.round(performance.now() - started);
      } catch {
        return null;
      }
    },

    async firstValue(timeoutMs = 12000) {
      try {
        return await fetchState(timeoutMs);
      } catch (error) {
        const wrapped = new Error('Server meja tidak bisa dihubungi.');
        wrapped.unreachable = true;
        wrapped.cause = error;
        throw wrapped;
      }
    },

    async refreshConnection() {
      try {
        const result = await requestJson('/relay/health', { timeoutMs: 5000 });
        setConnection(result.ok ? 'connected' : 'connecting', result.ok ? '' : 'health');
      } catch {
        setConnection('connecting', 'timeout');
      }
      return connection;
    },

    connection: () => connection,
    connectionReason: () => lastReason,

    subscribeConnection(callback) {
      connectionSubs.add(callback);
      callback(connection);
      return () => { connectionSubs.delete(callback); };
    },

    async rearmPresence() { /* tidak ada onDisconnect di relay */ },

    close() {
      closed = true;
      stopPolling();
      stateSubs.clear();
      presenceSubs.clear();
      connectionSubs.clear();
    },
  };
}

export default createRelayService;
