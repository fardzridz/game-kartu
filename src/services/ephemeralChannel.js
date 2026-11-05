/**
 * Kanal pesan singkat antar pemain dalam satu meja.
 *
 * Firebase RTDB saat online, BroadcastChannel saat mode simulasi lokal.
 * Tidak pernah menyentuh transaksi state room utama — jadi tidak ada risiko
 * konflik `rev`, dan tidak ada validasi room-level yang bisa menolaknya.
 *
 * Pola ini disalin dari `openTauntChannel` di TauntThrowSystem.jsx (baris
 * 177–235), dengan empat sifat yang sama:
 *
 *   1. Mandiri — node sendiri di bawah rooms/{code}
 *   2. Dual-mode — RTDB online, BroadcastChannel lokal
 *   3. Filter riwayat lama — klien baru tidak "dibanjiri" event basi
 *   4. Self-cleanup — pengirim menghapus jejaknya sendiri
 *
 * UTANG TEKNIS: TauntThrowSystem sengaja TIDAK dimigrasikan ke modul ini.
 * File itu punya 99 referensi + 2 file test; refactor-nya berisiko tanpa
 * manfaat. Kalau suatu saat disentuh, arahkan ke modul ini.
 */

import { getApp, getApps, initializeApp } from 'firebase/app';
import { getDatabase, limitToLast, onChildAdded, push, query, ref, remove, set } from 'firebase/database';
import { firebaseActive, serverNow } from './realtimeService.js';

/** Batas atas umur pesan agar riwayat lama tidak meledak ulang. */
const DEFAULT_STALE_MS = 30000;
/** Umur jejak pesan sendiri sebelum dibersihkan pengirim. */
const DEFAULT_RETAIN_MS = 30000;

/**
 * Apakah sebuah event sudah terlalu tua untuk diproses?
 *
 * Dipakai untuk dua hal yang berbeda dan sama pentingnya:
 *   - chat: jangan tampilkan obrolan lama beruntun saat klien baru join
 *   - PTT: jangan putar ulang rekaman lama saat reconnect
 *
 * `ts` harus berasal dari `serverNow()` (jam server), bukan `Date.now()`
 * mentah. HP pemain punya jam berbeda-beda; tanpa koreksi ini pesan yang baru
 * saja dikirim bisa dibuang, atau pesan lama justru lolos.
 *
 * @param {number} ts - timestamp event.
 * @param {number} bootTs - timestamp saat kanal dibuka.
 * @param {number} staleMs - toleransi umur.
 * @returns {boolean} true bila event harus diabaikan.
 */
export function isStaleEvent(ts, bootTs, staleMs = DEFAULT_STALE_MS) {
  const value = Number(ts);
  if (!Number.isFinite(value)) return true;
  return value < bootTs - staleMs;
}

/**
 * Tulis payload ke node lalu jadwalkan pembersihannya sendiri.
 *
 * Dipisah dari `openEphemeralChannel` supaya bisa dites dengan fungsi tiruan —
 * tidak perlu Firebase, tidak perlu timer sungguhan.
 *
 * Pembersihan dilakukan PENGIRIM saja (bukan semua pendengar). Kalau semua
 * klien menghapus, akan ada tabrakan hapus dan pesan bisa lenyap sebelum
 * pendengar yang lambat sempat membacanya.
 *
 * @param {object} options
 * @param {object} options.node - referensi node hasil push().
 * @param {(node: object, payload: object) => Promise<unknown>} options.write
 * @param {(node: object) => Promise<unknown>} options.remove
 * @param {number} [options.retainMs] - umur sebelum dihapus.
 * @param {(fn: () => void, ms: number) => unknown} [options.schedule]
 * @param {object} options.payload
 * @returns {boolean} true bila penulisan berhasil dijadwalkan.
 */
export function publishEphemeral({ node, write, remove, retainMs = DEFAULT_RETAIN_MS, schedule, payload }) {
  try {
    const pending = write(node, payload);
    if (pending && typeof pending.catch === 'function') pending.catch(() => {});
    const timer = schedule || ((fn, ms) => setTimeout(fn, ms));
    timer(() => {
      try {
        const result = remove(node);
        if (result && typeof result.catch === 'function') result.catch(() => {});
      } catch {
        // Node sudah hilang (dibersihkan host atau koneksi putus) — abaikan.
      }
    }, retainMs);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ambil instance database yang sudah dipakai aplikasi. Kalau belum ada
 * (mis. kanal dibuka sebelum service room siap), bangun dari env — persis
 * seperti yang dilakukan TauntThrowSystem.
 *
 * @returns {object|null} instance Database atau null bila gagal.
 */
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
 * Buka kanal ephemeral.
 *
 * @param {object} options
 * @param {string|null} options.roomCode - kode meja; null/'' memaksa mode lokal.
 * @param {string} options.nodeName - nama node di bawah rooms/{code}, mis. 'chats'.
 * @param {string} options.channelName - nama BroadcastChannel, mis. 'remi-chats'.
 * @param {string} options.selfClientId - id klien sendiri, untuk menyaring echo.
 * @param {number} [options.staleMs] - abaikan pesan lebih tua dari ini.
 * @param {number} [options.retainMs] - hapus pesan sendiri setelah ini.
 * @param {number} [options.limit] - jumlah pesan terakhir yang diambil.
 * @param {(payload: object) => void} options.onEvent - dipanggil per pesan.
 * @returns {{ send: (payload: object) => boolean, close: () => void }}
 */
export function openEphemeralChannel({
  roomCode,
  nodeName,
  channelName,
  selfClientId,
  root = 'rooms',
  staleMs = DEFAULT_STALE_MS,
  retainMs = DEFAULT_RETAIN_MS,
  limit = 20,
  onEvent,
}) {
  const emit = typeof onEvent === 'function' ? onEvent : () => {};

  // Timestamp patokan: memakai jam server (serverNow), bukan Date.now mentah.
  // HP pemain punya jam berbeda-beda; tanpa koreksi ini filter pesan basi bisa
  // membuang pesan yang baru saja dikirim, atau justru meloloskan pesan lama.
  const bootTs = serverNow();

  if (roomCode && firebaseActive()) {
    const database = databaseInstance();
    if (database) {
      try {
        const nodeRef = ref(database, `${root}/${roomCode}/${nodeName}`);
        const stop = onChildAdded(
          query(nodeRef, limitToLast(limit)),
          snapshot => {
            const value = snapshot.val();
            if (!value || typeof value !== 'object') return;
            // Riwayat lama saat baru join / reconnect tidak boleh diputar ulang.
            if (isStaleEvent(value.ts, bootTs, staleMs)) return;
            emit(value);
          },
          () => {},
        );

        return {
          send(payload) {
            try {
              const node = push(nodeRef);
              return publishEphemeral({
                node,
                write: set,
                remove,
                retainMs,
                payload,
              });
            } catch {
              return false;
            }
          },
          close() {
            try { stop(); } catch { /* listener sudah lepas */ }
          },
        };
      } catch {
        // Node tidak bisa diakses (rules menolak / SDK belum siap): jatuh ke
        // BroadcastChannel supaya fitur tidak mati total.
      }
    }
  }

  if (typeof BroadcastChannel === 'undefined') {
    return { send: () => false, close: () => {} };
  }

  const channel = new BroadcastChannel(channelName);
  channel.onmessage = event => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.clientId === selfClientId) return;
    if (data.roomCode !== roomCode) return;
    emit(data);
  };

  return {
    send(payload) {
      try {
        // BroadcastChannel tidak meng-echo ke pengirim, jadi echo manual —
        // perilaku ini sama dengan openTauntChannel.
        channel.postMessage({ ...payload, clientId: selfClientId, roomCode });
        emit({ ...payload, clientId: selfClientId, roomCode });
        return true;
      } catch {
        return false;
      }
    },
    close() {
      try { channel.close(); } catch { /* sudah tertutup */ }
    },
  };
}

export default openEphemeralChannel;
