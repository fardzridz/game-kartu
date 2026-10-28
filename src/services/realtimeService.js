import { initializeApp } from 'firebase/app';
import { makeId } from '../utils/id.js';
import { get, getDatabase, onDisconnect, onValue, ref, runTransaction, serverTimestamp, set, update as firebaseUpdate } from 'firebase/database';

const firebaseKeys = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_DATABASE_URL', 'VITE_FIREBASE_PROJECT_ID'];
const configured = firebaseKeys.every(key => Boolean(import.meta.env[key]));
const forcedLocal = () => {
  try { return localStorage.getItem('remi-force-local') === '1'; } catch { return false; }
};

// Kategori masalah: 'config' = salah setting project (tidak akan pulih sendiri),
// 'network' = gangguan jaringan/server (harus DITUNGGU + auto-retry, bukan
// dipaksa pindah ke mode lokal), 'unknown' = sisanya.
export function classifyFirebaseError(error) {
  const code = String(error?.code || '').toLowerCase();
  const text = `${error?.code || ''} ${error?.message || ''}`.toLowerCase();
  if (code.includes('permission') || code.includes('denied') || code.includes('database-url') || code.includes('database_url') || code.includes('databaseurl') || code.includes('database_not_found')) return 'config';
  if (code.includes('unavailable') || code.includes('disconnect') || code.includes('network') || code.includes('timeout')
    || text.includes('offline') || text.includes('network') || text.includes('unavailable') || text.includes('disconnect') || text.includes('timed out')) return 'network';
  return 'unknown';
}

// Pesan yang dipakai banner koneksi (bukan modal) — jangan menakut-nakuti
// pemain saat internet cuma kedip sebentar.
export function friendlyConnectionMessage(reason) {
  switch (reason) {
    case 'offline': return 'Perangkat kamu sedang offline. Permainan dijeda, menunggu internet kembali…';
    case 'timeout': return 'Server tidak menjawab. Menghubungkan ulang otomatis…';
    case 'permission': return 'Server menolak akses meja ini (aturan database). Hubungi host.';
    case 'config': return 'Konfigurasi server tidak cocok. Hubungi host untuk memperbaiki pengaturan.';
    case 'closed': return 'Koneksi ke server terputus. Menghubungkan ulang…';
    default: return 'Koneksi ke server terganggu. Menghubungkan ulang…';
  }
}

export function explainFirebaseError(error) {
  const code = String(error?.code || error?.message || '');
  if (code.includes('PERMISSION_DENIED')) return { code: 'PERMISSION_DENIED', title: 'Izin Firebase ditolak', detail: 'Aturan keamanan Realtime Database belum mengizinkan baca/tulis pada path rooms/. Buka Firebase Console → Realtime Database → Rules, lalu izinkan akses untuk rooms/{code} (mode pengujian: read/write true).' };
  if (code.includes('DATABASE_URL_INVALID') || code.includes('databaseURL')) return { code: 'DATABASE_URL_INVALID', title: 'URL Realtime Database tidak valid', detail: 'Nilai VITE_FIREBASE_DATABASE_URL salah atau Realtime Database belum diaktifkan di project ini. Cek URL default di Firebase Console (perhatikan region, mis. asia-southeast1).' };
  if (code.includes('NETWORK_ERROR') || code.includes('network')) return { code: 'NETWORK_ERROR', title: 'Koneksi internet terputus', detail: 'Browser tidak bisa menjangkau server Firebase. Periksa koneksi internet kamu, lalu coba lagi.' };
  if (code.includes('UNAVAILABLE') || code.includes('disconnect')) return { code: 'UNAVAILABLE', title: 'Server Firebase tidak dapat dijangkau', detail: 'Server Realtime Database sedang tidak bisa dihubungi. Game akan menghubungkan ulang otomatis; permainan aman menunggu sampai koneksi kembali.' };
  if (code.includes('quota') || code.includes('RESOURCE_EXHAUSTED')) return { code: 'QUOTA', title: 'Kuota Firebase habis', detail: 'Kuota gratis Realtime Database (bandwidth/penyimpanan) untuk project ini sudah terlampaui. Kamu bisa lanjut bermain di Mode Simulasi Lokal.' };
  return { code: code || 'UNKNOWN', title: 'Terjadi error Firebase', detail: error?.message || 'Error tidak diketahui saat menghubungi Firebase.' };
}

let database = null;
let startupError = null;
if (configured && !forcedLocal()) {
  try {
    const app = initializeApp({
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    });
    // Satu-satunya instance database modul ini. Dikirim lewat komponen
    // Firebase sebagai "service" (SDK mengekstraknya saat get/ref/set).
    database = getDatabase(app);
  } catch (error) {
    startupError = explainFirebaseError(error);
    database = null;
  }
}

// ---------------------------------------------------------------------------
// JAM SERVER
// Semua penjaga waktu di engine (turn timeout, dealing) dibandingkan dengan
// `Date.now()` di klien lain. Bila jam salah satu perangkat meleset, engine
// menganggap giliran sudah lewat batas → kursi pemain itu ditandai AFK dan
// gilirannya dijalankan bot padahal ia masih online. Karena itu skor waktu
// (now) diambil dari jam server Firebase bila tersedia.
// ---------------------------------------------------------------------------
let clockOffset = 0;            // serverNow - deviceNow
let clockReady = false;

export function serverNow() {
  return Date.now() + clockOffset;
}

export const isClockSynced = () => clockReady;

async function syncClock() {
  if (!database) return;
  try {
    const probeRef = urlReference('.info/serverTimeOffset');
    onValue(probeRef, snapshot => {
      const offset = Number(snapshot.val());
      if (Number.isFinite(offset)) {
        clockOffset = offset;
        clockReady = true;
      }
    }, () => {});
  } catch {
    // tanpa offset: pakai jam perangkat
  }
}

syncClock();

// Status koneksi aplikasi: jawaban terakhir dari server (cek REST ringan),
// diperbarui saat start, saat browser kembali online, dan tiap 10 detik.
let connectionReason = '';
let lastConnectedValue = null;   // null = belum ada jawaban, true/false = jawaban server
let hadConnection = false;       // pernah tersambung minimal sekali

const connectionListeners = new Set();

const connectionProbes = new Set();
const probeTimers = new Set();

export function appConnection() {
  if (!database) return 'offline-config';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'disconnected';
  if (lastConnectedValue === true) return 'connected';
  // Pernah tersambung lalu putus: SDK sedang reconnect (bukan offline perangkat).
  if (lastConnectedValue === false && hadConnection) return 'connecting';
  return 'connecting';
}

function publishConnection() {
  const value = appConnection();
  connectionListeners.forEach(listener => listener(value));
}

export function subscribeFirebaseConnection(callback) {
  if (!database) {
    callback(appConnection());
    return () => {};
  }
  connectionListeners.add(callback);
  callback(appConnection());
  return () => connectionListeners.delete(callback);
}

export function noteConnectionReason(reason) {
  connectionReason = reason || connectionReason;
}
export const lastConnectionReason = () => connectionReason;

// Cek koneksi nyata: request ringan ke server Realtime Database. Tidak
// memakai `.info` (bukan path data) dan tidak membaca root database.
export async function refreshConnection(code, timeoutMs = 5000) {
  if (!configured) return 'offline-config';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    connectionReason = 'offline';
    lastConnectedValue = false;
    publishConnection();
    return 'disconnected';
  }
  const base = String(import.meta.env.VITE_FIREBASE_DATABASE_URL || '').replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${base}/rooms/${code}.json?shallow=true`, { signal: controller.signal, cache: 'no-store' });
    // 200 = server menjawab. 401/403 = server hidup tapi aturan menolak.
    if (response.ok || response.status === 401 || response.status === 403) {
      lastConnectedValue = true;
      hadConnection = true;
      connectionReason = '';
    } else {
      // Jawaban aneh: jangan langsung klaim putus jika socket meja masih hidup.
      noteConnectionReason(`http-${response.status}`);
    }
  } catch {
    // Cek REST gagal; kalau perangkat online dan socket meja masih hidup,
    // anggap masih tersambung (jangan flip ke "menyambung" tanpa alasan).
    lastConnectedValue = false;
    noteConnectionReason('timeout');
  } finally {
    clearTimeout(timer);
  }
  publishConnection();
  return appConnection();
}

// Catat alasan terakhir saat browser offline/online. Reconnect data tetap
// sepenuhnya diurus SDK Firebase; yang kita lakukan hanya memperbarui status.
if (typeof window !== 'undefined') {
  // Saat browser kembali online, langsung cek sekali (jangan tunggu backoff).
  window.addEventListener('online', () => {
    noteConnectionReason('');
    for (const probe of connectionProbes) probe().catch(() => {});
  });
  window.addEventListener('offline', () => { noteConnectionReason('offline'); });
}

// Evaluasi presence daftar kursi → { online, offline, bots, known }.
// "online" berarti heartbeat masih segar, bukan tebakan dari socket.
export function evaluatePresence(seats = [], presence = {}, now = Date.now(), staleAfterMs = 45000) {
  const online = [];
  const offline = [];
  let bots = 0;
  for (const seat of seats) {
    if (seat.bot) { bots += 1; online.push(seat); continue; }
    const entry = presence?.[seat.id];
    const lastSeen = Number(entry?.lastSeen) || 0;
    if (entry?.online !== false && now - lastSeen < staleAfterMs) online.push(seat);
    else offline.push(seat);
  }
  const known = Object.keys(presence || {}).length > 0;
  return { online, offline, bots, known, stale: known && online.length === 0 && seats.length > 0 };
}


export const isFirebaseConfigured = configured;
export const firebaseStartupError = startupError;
// Masalah setting yang mustahil pulih sendiri (mis. URL database salah).
export const firebaseConfigBroken = Boolean(startupError) || !configured;
const testMode = import.meta.env.MODE === 'test';
export const firebaseActive = () => configured && !forcedLocal() && Boolean(database) && !testMode;

// Preflight: pastikan Realtime Database benar-benar ada dan dapat dijangkau
// sebelum menggantungkan UI pada SDK yang retry tanpa batas waktu.
export async function probeDatabase(timeoutMs = 5000) {
  if (!configured || testMode) return { ok: true };
  const url = String(import.meta.env.VITE_FIREBASE_DATABASE_URL || '').replace(/\/$/, '');
  const controller = new AbortController();
  const giveUp = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${url}/.json?shallow=true`, { signal: controller.signal });
    if (response.status === 404) {
      return { ok: false, problem: { code: 'DATABASE_NOT_FOUND', title: 'Realtime Database belum dibuat', detail: `Server menjawab 404 untuk ${url}. Buka Firebase Console → project ini → Realtime Database → "Create Database" (catat URL region-nya, lalu sesuaikan VITE_FIREBASE_DATABASE_URL di file .env), atau lanjutkan bermain di Mode Simulasi Lokal.` } };
    }
    // 401/403 berarti database ADA tapi aturan keamanan menutup /.json —
    // path rooms/ mungkin tetap terbuka; biarkan SDK yang melanjutkan.
    return { ok: true };
  } catch (error) {
    // Jaringan lambat / server belum bangun BUKAN alasan memaksa mode lokal:
    // SDK Firebase punya antrean + retry sendiri, jadi biarkan dia mencoba.
    const timedOut = error?.name === 'AbortError';
    return { ok: true, slow: true, note: timedOut ? 'Preflight server habis waktu; mencoba lewat SDK Firebase.' : 'Preflight gagal; mencoba lewat SDK Firebase.' };
  } finally {
    clearTimeout(giveUp);
  }
}

// Objek database "mentah" untuk dipakai SDK. Kalau modul database dan modul app
// di-bundle terpisah, `database` bisa berupa pembungkus { _delegate: Database };
// SDK lalu menerima objek yang salah ("db._checkNotDeleted is not a function").
function dbInstance() {
  const value = database;
  return value && typeof value._checkNotDeleted !== 'function' && value._delegate ? value._delegate : value;
}

// Semua referensi aplikasi dibuat di sini, memakai instance database yang sama
// dengan yang dipakai SDK untuk koneksi.
function urlReference(path = '') {
  return path ? ref(dbInstance(), path) : ref(dbInstance());
}

function roomReference(code) {
  return ref(dbInstance(), `rooms/${code}`);
}

export function createRealtimeService(code, clientId = makeId()) {
  const storageKey = `remi-room-${code}`;
  const presenceKey = `remi-presence-${code}`;
  const firebaseMode = firebaseActive();
  const roomRef = firebaseMode ? roomReference(code) : null;
  // Presence selalu dibangun langsung dari ref meja. Kalau ref meja tidak bisa
  // dibentuk (mis. config rusak), presence dilewati — bukan sampai crash.
  let presenceRoot = null;
  if (roomRef?.ref) {
    try { presenceRoot = ref(roomRef.ref, 'presence'); } catch { presenceRoot = null; }
  }
  let channel = null;
  let pongResolve = null;
  const probeNow = () => (firebaseMode ? refreshConnection(code) : Promise.resolve('connected'));
  let heartbeat = null;
  connectionProbes.add(probeNow);
  if (firebaseMode) {
    // Probe pertama segera, lalu berkala. Timer ini juga yang menyelamatkan
    // badge tetap akurat walau WebSocket sempat beku.
    probeNow().catch(() => {});
    heartbeat = setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      probeNow().catch(() => {});
    }, 10000);
    probeTimers.add(heartbeat);
  }
  const subscribers = new Set();
  const cleanups = new Set();
  const presenceWatchers = new Set();
  let disconnectArmed = false;

  const readLocal = () => { try { return JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch { return null; } };
  const notify = value => subscribers.forEach(callback => callback(value));
  const readLocalPresence = () => {
    try {
      const map = JSON.parse(localStorage.getItem(presenceKey) || '{}');
      const fresh = {};
      // Selaras dengan heartbeat 15 detik: toleransi 2 miss.
      const staleAfter = Date.now() - 40000;
      for (const [id, entry] of Object.entries(map)) fresh[id] = { ...entry, online: Boolean(entry.online && (entry.lastSeen || 0) > staleAfter) };
      return fresh;
    } catch { return {}; }
  };
  const writeLocalPresence = entry => {
    try {
      const map = JSON.parse(localStorage.getItem(presenceKey) || '{}');
      map[clientId] = { ...map[clientId], ...entry, lastSeen: Date.now() };
      localStorage.setItem(presenceKey, JSON.stringify(map));
      channel?.postMessage({ type: 'presence', clientId });
    } catch { /* penyimpanan penuh/diblokir tidak boleh mematikan permainan */ }
  };

  if (!firebaseMode && typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(storageKey);
    channel.onmessage = event => {
      const data = event.data || {};
      if (data.clientId === clientId) return;
      if (data.type === 'value') notify(data.value);
      else if (data.type === 'presence') presenceWatchers.forEach(callback => callback(readLocalPresence()));
      else if (data.type === 'ping') channel.postMessage({ type: 'pong', clientId, to: data.clientId, t: data.t });
      else if (data.type === 'pong' && data.to === clientId) pongResolve?.(Date.now() - data.t);
    };
  }

  return {
    mode: firebaseMode ? 'firebase' : 'local',
    clientId,

    subscribe(callback, onError) {
      subscribers.add(callback);
      let stop;
      if (firebaseMode) {
        stop = onValue(roomRef, snapshot => { if (snapshot.exists()) callback(snapshot.val()); }, error => { onError?.(explainFirebaseError(error)); });
        // Status koneksi per meja (sinyal dari koneksi WebSocket yang dipakai
        // meja ini). Listener dilepas lagi di stop() di bawah.

        const previousStop = stop;
        stop = () => { previousStop?.(); };
      } else {
        const onStorage = event => { if (event.key === storageKey) callback(readLocal()); };
        window.addEventListener('storage', onStorage);
        stop = () => window.removeEventListener('storage', onStorage);
        const room = readLocal();
        if (room) callback(room);
      }
      const unsubscribe = () => { subscribers.delete(callback); stop?.(); cleanups.delete(unsubscribe); };
      cleanups.add(unsubscribe);
      return unsubscribe;
    },

    async create(value) {
      if (firebaseMode) await set(roomRef, value);
      else { localStorage.setItem(storageKey, JSON.stringify(value)); channel?.postMessage({ type: 'value', clientId, value }); notify(value); }
    },

    async update(patch) {
      if (firebaseMode) await firebaseUpdate(roomRef, patch);
      else {
        const room = readLocal();
        if (!room) throw new Error('Room tidak ditemukan.');
        const next = { ...room, ...patch };
        localStorage.setItem(storageKey, JSON.stringify(next));
        channel?.postMessage({ type: 'value', clientId, value: next });
        notify(next);
      }
    },

    // Penerap intent secara atomik: mutator menerima state termutakhir dari
    // server (bukan dari memori klien) dan mengembalikan room baru, atau null
    // untuk membatalkan (mis. bukan gilirannya = Turn Lock di sisi server).
    async transact(mutator) {
      if (firebaseMode) {
        const result = await runTransaction(roomRef, current => {
          const next = mutator(current);
          return next ?? undefined;
        }).catch(error => { throw explainFirebaseError(error); });
        return { committed: result.committed, value: result.snapshot.val() };
      }
      const next = mutator(readLocal());
      if (!next) return { committed: false, value: readLocal() };
      localStorage.setItem(storageKey, JSON.stringify(next));
      channel?.postMessage({ type: 'value', clientId, value: next });
      notify(next);
      return { committed: true, value: next };
    },

    async setPresence(online) {
      if (firebaseMode) {
        // Hanya lewat ref + timestamp server; jangan sentuh `database` langsung
        // atau auth, supaya tidak menambah koneksi ke root database.
        if (!presenceRoot) return;
        const presenceRef = ref(presenceRoot, clientId);
        try {
          await set(presenceRef, { online, lastSeen: serverTimestamp() });
        } catch (error) {
          // Gagal tulis presence tidak boleh diam-diam: tandai kenapa.
          noteConnectionReason(`presence-fail:${String(error?.code || error?.message || '').slice(0, 40)}`);
        }
        if (!disconnectArmed) {
          disconnectArmed = true;
          onDisconnect(presenceRef).set({ online: false, lastSeen: serverTimestamp() }).catch(() => {});
        }
      } else writeLocalPresence({ online });
    },

    watchPresence(callback) {
      presenceWatchers.add(callback);
      let stop = null;
      if (firebaseMode) {
        if (!presenceRoot) { callback({}); return () => {}; }
        stop = onValue(presenceRoot, snapshot => callback(snapshot.val() || {}), () => {});
      } else {
        callback(readLocalPresence());
        const timer = setInterval(() => callback(readLocalPresence()), 2000);
        stop = () => clearInterval(timer);
      }
      const unsubscribe = () => { presenceWatchers.delete(callback); stop?.(); };
      cleanups.add(unsubscribe);
      return unsubscribe;
    },

    async measurePing() {
      if (firebaseMode) {
        const started = performance.now();
        try {
          if (!presenceRoot) return null;
          await runTransaction(ref(presenceRoot, clientId), current => ({ ...(current || {}), ping: serverTimestamp() }));
          return Math.round(performance.now() - started);
        } catch { return null; }
      }
      if (!channel) return null;
      return new Promise(resolve => {
        const started = Date.now();
        const finish = () => { pongResolve = null; clearTimeout(giveUp); };
        const giveUp = setTimeout(() => { finish(); resolve(null); }, 1500);
        pongResolve = value => { finish(); resolve(value); };
        channel.postMessage({ type: 'ping', clientId, t: started });
      });
    },

    // Baca sekali dari server. Kalau SDK belum sempat menyambung (jaringan
    // lambat), cek cache lokal Firebase / localStorage dulu: kalau meja memang
    // ada, JANGAN bilang "meja tidak ditemukan" — transaksi berikutnya akan
    // menunggu server dan mencoba ulang otomatis.
    async firstValue(_timeoutMs = 12000) {
      if (firebaseMode) {
        // `get()` menunggu koneksi; bila offline, SDK memakai cache terakhir.
        try {
          const snapshot = await get(roomRef);
          return snapshot.val() || null;
        } catch (error) {
          // Setting project salah = tidak akan pulih sendiri → tampilkan.
          if (classifyFirebaseError(error) === 'config') throw explainFirebaseError(error);
          // Jaringan: biarkan sesi menunggu server, jangan bilang "meja hilang".
          noteConnectionReason(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'timeout');
          return null;
        }
      }
      return Promise.resolve(readLocal());
    },

    async refreshConnection() {
      if (firebaseMode) return refreshConnection(code);
      return navigator?.onLine === false ? 'disconnected' : 'connected';
    },

    connection() {
      if (firebaseMode) return appConnection();
      return typeof navigator === 'undefined' || navigator.onLine !== false ? 'connected' : 'disconnected';
    },

    connectionReason() {
      return firebaseMode ? connectionReason : (navigator?.onLine === false ? 'offline' : '');
    },

    subscribeConnection(callback) {
      if (firebaseMode) return subscribeFirebaseConnection(callback);
      const update = () => callback(navigator?.onLine === false ? 'disconnected' : 'connected');
      update();
      window.addEventListener('online', update);
      window.addEventListener('offline', update);
      return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
    },

    async rearmPresence() {
      if (firebaseMode) disconnectArmed = false;
    },

    close() {
      connectionProbes.delete(probeNow);
      if (heartbeat) { clearInterval(heartbeat); probeTimers.delete(heartbeat); }
      cleanups.forEach(cleanup => cleanup());
      cleanups.clear();
      subscribers.clear();
      presenceWatchers.clear();
      channel?.close();
      channel = null;
    },
  };
}
