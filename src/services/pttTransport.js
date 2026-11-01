/**
 * Transport Push-to-Talk.
 *
 * DUA node RTDB, sengaja dipisah:
 *
 *   rooms/{code}/pttLive  — beberapa byte. Indikator "sedang bicara" + mutex
 *                           (siapa yang boleh merekam) via runTransaction.
 *   rooms/{code}/ptt      — ~40 KB base64 per pesan. Audionya.
 *
 * Kalau digabung, setiap perubahan indikator akan menyeret puluhan kilobyte
 * audio bolak-balik ke semua pemain.
 *
 * Mode lokal (tanpa Firebase) memakai BroadcastChannel untuk audio maupun
 * status bicara, sehingga PTT tetap jalan di mode simulasi.
 */

import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getDatabase,
  limitToLast,
  onChildAdded,
  onValue,
  push,
  query,
  ref,
  remove,
  runTransaction,
  set,
} from 'firebase/database';
import { firebaseActive, serverNow } from './realtimeService.js';
import {
  MAX_AUDIO_BASE64,
  RETAIN_MS,
  isAudioFresh,
  isLockExpired,
  validateAudioPayload,
} from './pttService.js';

const LIVE_NODE = 'pttLive';
const AUDIO_NODE = 'ptt';
const LIVE_CHANNEL = 'remi-ptt-live';
const AUDIO_CHANNEL = 'remi-ptt';

/** Instance database bersama, mengikuti pola TauntThrowSystem. */
function databaseInstance() {
  try {
    if (!getApps().length) {
      initializeApp({
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        appId: import.meta.env.VITE_FIREBASE_APP_ID,
      });
    }
    return getDatabase(getApp());
  } catch {
    return null;
  }
}

/**
 * Siarkan status bicara di mode lokal (tanpa Firebase).
 *
 * Di mode Firebase, `pttLive` di RTDB sudah jadi sumber kebenaran untuk semua
 * klien. Di mode lokal tidak ada otoritas pusat, jadi status disiarkan lewat
 * BroadcastChannel kecil tersendiri. Tanpa ini indikator "sedang bicara" tidak
 * pernah muncul di mode simulasi.
 *
 * @param {{roomCode: string, clientId: string, name: string, maxDurationMs: number}|null} state
 *   null = berhenti bicara.
 */
function broadcastLiveState(state) {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const channel = new BroadcastChannel(LIVE_CHANNEL);
    channel.postMessage(state);
    // postMessage baru diantrekan; menutup kanal seketika bisa membuang pesan.
    setTimeout(() => { try { channel.close(); } catch { /* sudah tertutup */ } }, 0);
  } catch {
    // BroadcastChannel bisa diblokir mode privasi tertentu; indikator saja.
  }
}

/**
 * Coba ambil kunci bicara (mutex) secara atomik.
 *
 * Transaksi server-side, bukan cek-lalu-tulis: dua pemain yang menekan tombol
 * pada milidetik yang sama tidak boleh dua-duanya dapat. Transaksi Firebase
 * menjalankan ulang mutator pada state terbaru sampai berhasil, jadi hasilnya
 * selalu konsisten.
 *
 * Kunci boleh diambil bila:
 *   - node kosong, ATAU
 *   - sudah kedaluwarsa (`ts + dur + grace < now`) → pemilik sebelumnya crash
 *   - kunci itu milik kita sendiri (mis. sisa percobaan sebelumnya)
 *
 * @param {object} options
 * @param {string} roomCode
 * @param {string} clientId
 * @param {string} name
 * @param {number} maxDurationMs
 * @returns {Promise<{ granted: boolean, holderName?: string }>}
 */
export async function acquireTalkLock({ roomCode, clientId, name, maxDurationMs }) {
  if (!firebaseActive()) {
    // Mode lokal: tidak ada otoritas pusat. Kunci "selalu granted" di sini dan
    // status bicara disiarkan lewat BroadcastChannel supaya indikator tetap
    // berfungsi. Tab yang menahan lebih dulu akan terlihat oleh tab lain.
    broadcastLiveState({
      roomCode,
      from: clientId,
      name: String(name || '').slice(0, 18),
      ts: serverNow(),
      dur: Math.max(1, Math.round(maxDurationMs)),
    });
    return { granted: true };
  }
  const database = databaseInstance();
  if (!database) return { granted: false, holderName: '' };

  const liveRef = ref(database, `rooms/${roomCode}/${LIVE_NODE}`);
  let holderName = '';
  try {
    const result = await runTransaction(liveRef, current => {
      const now = serverNow();
      if (current && !isLockExpired(current, now) && current.from !== clientId) {
        // Dipegang orang lain yang masih aktif: batalkan transaksi.
        holderName = String(current.name || '');
        return undefined;
      }
      return {
        from: clientId,
        name: String(name || '').slice(0, 18),
        ts: now,
        dur: Math.max(1, Math.round(maxDurationMs)),
      };
    });

    if (!result.committed) return { granted: false, holderName };
    const value = result.snapshot?.val?.() ?? result.snapshot;
    if (value && value.from && value.from !== clientId) {
      return { granted: false, holderName: String(value.name || '') };
    }
    return { granted: true };
  } catch {
    return { granted: false, holderName: '' };
  }
}

/**
 * Lepas kunci bicara. Hanya menghapus bila kunci masih milik kita — kalau
 * pemain lain sudah merebutnya (kita crash lama), jangan hapus miliknya.
 *
 * @param {{roomCode: string, clientId: string}} options
 * @returns {Promise<void>}
 */
export async function releaseTalkLock({ roomCode, clientId }) {
  if (!firebaseActive()) {
    // Mode lokal: beri tahu tab lain bahwa bicara sudah selesai.
    broadcastLiveState(null);
    return;
  }
  const database = databaseInstance();
  if (!database) return;
  const liveRef = ref(database, `rooms/${roomCode}/${LIVE_NODE}`);
  try {
    await runTransaction(liveRef, current => {
      if (!current) return null;
      if (current.from !== clientId) return undefined; // bukan milik kita
      return null;
    });
  } catch {
    // Gagal lepas bukan bencana: kunci akan kedaluwarsa sendiri.
  }
}

/**
 * Tulis satu rekaman ke /ptt lalu jadwalkan pembersihannya.
 *
 * @param {object} options
 * @param {string} options.roomCode
 * @param {object} options.payload
 * @returns {Promise<{ ok: boolean, reason?: string, eventId?: string }>}
 */
export async function publishAudio({ roomCode, payload }) {
  const check = validateAudioPayload(payload);
  if (!check.ok) return { ok: false, reason: check.reason };

  if (firebaseActive()) {
    const database = databaseInstance();
    if (!database) return { ok: false, reason: 'database tidak siap' };
    try {
      const node = push(ref(database, `rooms/${roomCode}/${AUDIO_NODE}`));
      await set(node, payload);
      // Pengirim membersihkan jejaknya sendiri; host juga menyapu sisa.
      setTimeout(() => { remove(node).catch(() => {}); }, RETAIN_MS);
      return { ok: true, eventId: node.key };
    } catch {
      return { ok: false, reason: 'gagal mengirim audio' };
    }
  }

  // Mode lokal: siarkan lewat BroadcastChannel.
  if (typeof BroadcastChannel === 'undefined') return { ok: false, reason: 'kanal tidak tersedia' };
  try {
    const channel = new BroadcastChannel(AUDIO_CHANNEL);
    channel.postMessage({ ...payload, roomCode });
    // JANGAN close() langsung: postMessage baru diantrekan dan menutup kanal
    // seketika bisa membuang pesan sebelum terkirim ke tab lain. Beri satu
    // putaran event loop, lalu tutup.
    setTimeout(() => { try { channel.close(); } catch { /* sudah tertutup */ } }, 0);
    return { ok: true, eventId: String(serverNow()) };
  } catch {
    return { ok: false, reason: 'gagal mengirim audio' };
  }
}

/**
 * Dengarkan audio baru.
 *
 * Filter umur WAJIB ada di sini (jebakan #1): `onChildAdded` memicu untuk
 * seluruh data lama saat klien baru join / reconnect. Tanpa filter, pemain yang
 * baru masuk akan mendengar semua rekaman lama beruntun.
 *
 * @param {object} options
 * @param {string} roomCode
 * @param {string} selfClientId
 * @param {(payload: object) => void} onAudio
 * @param {number} [limit] - jumlah event terakhir yang diambil.
 * @returns {() => void} fungsi berhenti mendengarkan
 */
export function subscribeAudio({ roomCode, selfClientId, onAudio, limit = 8 }) {
  if (!roomCode) return () => {};

  if (firebaseActive()) {
    const database = databaseInstance();
    if (!database) return () => {};
    try {
      const audioRef = ref(database, `rooms/${roomCode}/${AUDIO_NODE}`);
      const stop = onChildAdded(query(audioRef, limitToLast(limit)), snapshot => {
        const value = snapshot.val();
        if (!value || typeof value !== 'object') return;
        // Jangan putar rekaman sendiri: bikin bingung (aturan produk).
        if (value.from === selfClientId) return;
        if (!isAudioFresh(value.ts)) return;
        onAudio(value);
      }, () => {});
      return () => { try { stop(); } catch { /* sudah lepas */ } };
    } catch {
      return () => {};
    }
  }

  if (typeof BroadcastChannel === 'undefined') return () => {};
  const channel = new BroadcastChannel(AUDIO_CHANNEL);
  channel.onmessage = event => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.roomCode !== roomCode) return;
    if (data.from === selfClientId) return;
    if (!isAudioFresh(data.ts)) return;
    if (typeof data.data !== 'string' || data.data.length > MAX_AUDIO_BASE64) return;
    onAudio(data);
  };
  return () => { try { channel.close(); } catch { /* sudah tertutup */ } };
}

/**
 * Dengarkan status "sedang bicara" (pttLive).
 *
 * Dipakai untuk indikator 🔴 dan untuk menampilkan nama pemain yang menahan
 * mikrofon lebih dulu.
 *
 * @param {object} options
 * @param {string} roomCode
 * @param {string} selfClientId
 * @param {(state: {from: string, name: string}|null) => void} onChange
 * @returns {() => void}
 */
export function subscribeLiveState({ roomCode, selfClientId, onChange }) {
  if (!roomCode) return () => {};

  if (firebaseActive()) {
    const database = databaseInstance();
    if (!database) return () => {};
    try {
      const liveRef = ref(database, `rooms/${roomCode}/${LIVE_NODE}`);
      const stop = onValue(liveRef, snapshot => {
        const value = snapshot.val();
        if (!value || typeof value !== 'object') { onChange(null); return; }
        // Kunci bocor tidak boleh menahan indikator selamanya.
        if (isLockExpired(value)) { onChange(null); return; }
        if (value.from === selfClientId) { onChange(null); return; }
        onChange({ from: String(value.from || ''), name: String(value.name || 'Pemain') });
      }, () => {});
      return () => { try { stop(); } catch { /* sudah lepas */ } };
    } catch {
      return () => {};
    }
  }

  // Mode lokal: status disiarkan lewat BroadcastChannel kecil tersendiri.
  // Tidak memakai openEphemeralChannel karena payload "berhenti bicara" adalah
  // `null` — kanal generik itu menyaring semua non-object.
  if (typeof BroadcastChannel === 'undefined') return () => {};
  const channel = new BroadcastChannel(LIVE_CHANNEL);
  channel.onmessage = event => {
    const data = event.data;
    if (data === null) { onChange(null); return; }
    if (!data || typeof data !== 'object') return;
    if (data.roomCode !== roomCode) return;
    if (data.from === selfClientId) return;
    // Kunci bocor tidak boleh menahan indikator selamanya.
    if (isLockExpired(data)) { onChange(null); return; }
    onChange({ from: String(data.from || ''), name: String(data.name || 'Pemain') });
  };
  return () => { try { channel.close(); } catch { /* sudah tertutup */ } };
}

export { LIVE_NODE, AUDIO_NODE };
