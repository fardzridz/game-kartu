/**
 * Logika murni Push-to-Talk.
 *
 * Semua fungsi di sini bebas DOM dan bebas Firebase supaya bisa dites tanpa
 * browser: encode/decode base64, validasi payload, filter timestamp, dan
 * perhitungan kedaluwarsa mutex.
 *
 * Alur lengkapnya (I/O-nya ada di `src/hooks/usePTT.js`):
 *
 *   [Tahan]  → runTransaction pttLive → dapat kunci → MediaRecorder.start()
 *   [Lepas]  → MediaRecorder.stop() → blob → base64 → tulis /ptt/{id}
 *   [Dengar] → onChildAdded /ptt → buang ts basi → decodeAudioData → pttBus
 *
 * Bukan voice call: tidak ada WebRTC, tidak ada TURN, tidak ada streaming.
 * Rekam dulu (~2 detik) lalu kirim. Latensi total 300–800 ms.
 */

import { serverNow } from './realtimeService.js';

/** Batas keras panjang base64 yang diterima dari jaringan (sama dengan rules). */
export const MAX_AUDIO_BASE64 = 60000;
/** Batas durasi rekaman di meja main. */
export const MAX_DURATION_GAME_MS = 10000;
/** Batas durasi rekaman di ruang tunggu. */
export const MAX_DURATION_LOBBY_MS = 15000;
/** Audio yang lebih tua dari ini tidak boleh diputar (jebakan #1). */
export const MAX_AUDIO_AGE_MS = 5000;
/** Mutex dianggap bocor bila `ts + dur + grace` sudah lewat (jebakan #5). */
export const LOCK_GRACE_MS = 3000;
/** Umur entri audio di RTDB sebelum dibersihkan host. */
export const RETAIN_MS = 30000;

/**
 * Format audio yang didukung, diurutkan dari yang paling diinginkan.
 *
 * JANGAN memakai user-agent untuk menebak format — Safari lama dan Chrome di
 * iOS sama-sama "Safari" di UA. `MediaRecorder.isTypeSupported()` adalah
 * satu-satunya cara yang benar.
 */
export const AUDIO_CANDIDATES = Object.freeze([
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/ogg;codecs=opus',
]);

/**
 * Bitrate rekaman, dalam bit per detik.
 *
 * WAJIB diisi. Tanpa ini `MediaRecorder` memakai default browser (~128 kbps di
 * Chrome), dan kuota `MAX_AUDIO_BASE64` (60.000 karakter ≈ 45 KB biner) hanya
 * cukup untuk ±2,8 detik — padahal batas durasi 10/15 detik. Akibatnya rekaman
 * 10 detik ditolak dengan pesan "terlalu panjang", padahal yang melebihi kuota
 * adalah UKURAN berkasnya, bukan durasinya.
 *
 * Hitungan untuk 15 detik (batas terpanjang): 24 kbps → 45 KB → 60.000 char
 * base64, tepat di kuota. 20 kbps menyisakan ruang aman untuk overhead
 * container, jadi itu yang dipakai. Opus di 20 kbps mono masih sangat jelas
 * untuk suara bicara (Opus memang dirancang untuk ini).
 */
export const AUDIO_BITS_PER_SECOND = 20000;

/**
 * Bitrate efektif per detik rekaman, termasuk overhead container (~5%).
 * Dipakai untuk memperkirakan apakah rekaman akan muat sebelum dikirim.
 *
 * @param {number} [bitsPerSecond]
 * @returns {number} byte per detik.
 */
export function audioBytesPerSecond(bitsPerSecond = AUDIO_BITS_PER_SECOND) {
  const rate = Number(bitsPerSecond);
  const safe = Number.isFinite(rate) && rate > 0 ? rate : AUDIO_BITS_PER_SECOND;
  // +5% untuk header container/WebM cluster.
  return (safe / 8) * 1.05;
}

/**
 * Perkiraan panjang base64 untuk rekaman selama `durationMs`.
 *
 * Murni, supaya bisa dites tanpa MediaRecorder.
 *
 * @param {number} durationMs
 * @param {number} [bitsPerSecond]
 * @returns {number} perkiraan jumlah karakter base64.
 */
export function estimateBase64Length(durationMs, bitsPerSecond = AUDIO_BITS_PER_SECOND) {
  const ms = Number(durationMs);
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  const bytes = audioBytesPerSecond(bitsPerSecond) * (ms / 1000);
  return Math.ceil((bytes * 4) / 3);
}

/**
 * Pilih mimeType pertama yang didukung browser.
 *
 * @param {(type: string) => boolean} isTypeSupported - biasanya
 *   `MediaRecorder.isTypeSupported` yang sudah di-bind.
 * @returns {string|null} null bila tidak ada yang didukung → tombol mic
 *   harus disembunyikan, bukan dipaksa tampil lalu gagal.
 */
export function pickAudioMimeType(isTypeSupported) {
  if (typeof isTypeSupported !== 'function') return null;
  for (const type of AUDIO_CANDIDATES) {
    try {
      if (isTypeSupported(type)) return type;
    } catch {
      // Browser aneh bisa melempar; lanjut ke kandidat berikutnya.
    }
  }
  return null;
}

/**
 * Apakah perekaman mungkin dilakukan di lingkungan ini.
 *
 * @param {object} [env] - override untuk pengujian.
 * @returns {boolean}
 */
export function canRecordAudio(env = {}) {
  const win = env.window ?? (typeof window !== 'undefined' ? window : undefined);
  if (!win) return false;
  const Recorder = env.MediaRecorder ?? win.MediaRecorder;
  if (typeof Recorder !== 'function' || typeof Recorder.isTypeSupported !== 'function') return false;
  const media = env.navigator ?? (typeof navigator !== 'undefined' ? navigator : undefined);
  if (!media?.mediaDevices?.getUserMedia) return false;
  return pickAudioMimeType(type => Recorder.isTypeSupported(type)) !== null;
}

// ---------------------------------------------------------------------------
// Base64
// ---------------------------------------------------------------------------

/**
 * ArrayBuffer → base64 (tanpa data URL, supaya payload RTDB sekecil mungkin).
 *
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
export function bufferToBase64(buffer) {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  // Dicicil per 8 KB: String.fromCharCode(...bytes) pada 40 KB bisa melampaui
  // batas argumen fungsi dan melempar RangeError di sebagian browser.
  const CHUNK = 0x2000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  if (typeof btoa === 'function') return btoa(binary);
  // Fallback Node (dipakai test).
  return Buffer.from(bytes).toString('base64');
}

/**
 * base64 → ArrayBuffer untuk `decodeAudioData`.
 *
 * @param {string} base64
 * @returns {ArrayBuffer|null} null bila input tidak valid.
 */
export function base64ToBuffer(base64) {
  if (typeof base64 !== 'string' || !base64) return null;
  try {
    let binary;
    if (typeof atob === 'function') {
      binary = atob(base64);
    } else {
      binary = Buffer.from(base64, 'base64').toString('binary');
    }
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  } catch {
    return null;
  }
}

/**
 * Ukuran payload base64 dalam byte audio sesungguhnya.
 * @param {string} base64
 * @returns {number}
 */
export function base64ByteLength(base64) {
  if (typeof base64 !== 'string' || !base64) return 0;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

// ---------------------------------------------------------------------------
// Validasi payload
// ---------------------------------------------------------------------------

/**
 * Validasi payload audio sebelum ditulis ke RTDB.
 *
 * Aturan ini MIRROR dari firebase.rules.json. Klien memeriksa lebih dulu supaya
 * pemain mendapat pesan ramah, bukan kegagalan senyap dari server.
 *
 * @param {object} payload
 * @param {{maxDurationMs?: number}} [options]
 * @returns {{ ok: boolean, reason?: string }}
 */
export function validateAudioPayload(payload, { maxDurationMs = MAX_DURATION_LOBBY_MS } = {}) {
  if (!payload || typeof payload !== 'object') return { ok: false, reason: 'payload kosong' };
  if (typeof payload.from !== 'string' || !payload.from) return { ok: false, reason: 'pengirim tidak dikenal' };
  if (!Number.isFinite(Number(payload.ts))) return { ok: false, reason: 'timestamp tidak valid' };
  const dur = Number(payload.dur);
  if (!Number.isFinite(dur) || dur <= 0) return { ok: false, reason: 'durasi tidak valid' };
  if (dur > maxDurationMs) return { ok: false, reason: 'rekaman terlalu panjang' };
  if (typeof payload.mime !== 'string' || !payload.mime) return { ok: false, reason: 'format audio tidak dikenal' };
  if (typeof payload.data !== 'string' || !payload.data) return { ok: false, reason: 'audio kosong' };
  // Jebakan kuota: tanpa batas ini siapa pun bisa menulis 10 MB.
  if (payload.data.length > MAX_AUDIO_BASE64) return { ok: false, reason: 'audio terlalu besar' };
  return { ok: true };
}

/**
 * Apakah audio dari jaringan masih layak diputar?
 *
 * Jebakan #1: `child_added` ikut memicu untuk SEMUA data lama saat klien baru
 * join atau reconnect. Tanpa filter ini, pemain yang baru masuk akan mendengar
 * rekaman-rekaman lama beruntun.
 *
 * `now` HARUS dari `serverNow()`, bukan jam perangkat mentah — jam HP pemain
 * berbeda-beda sehingga audio baru bisa dianggap basi.
 *
 * @param {number} ts - timestamp audio dari pengirim (juga serverNow).
 * @param {number} [now] - waktu sekarang (serverNow).
 * @param {number} [maxAgeMs]
 * @returns {boolean}
 */
export function isAudioFresh(ts, now = serverNow(), maxAgeMs = MAX_AUDIO_AGE_MS) {
  const value = Number(ts);
  if (!Number.isFinite(value)) return false;
  // Sedikit toleransi untuk jam yang belum tersinkron sempurna: audio dengan
  // ts sedikit "di masa depan" tetap diputar, yang jelas basi dibuang.
  return now - value <= maxAgeMs;
}

/**
 * Apakah kunci pttLive sudah kedaluwarsa (pemilik crash saat menahan tombol)?
 *
 * Jebakan #5: tanpa ini, satu pemain yang aplikasinya mati di tengah rekaman
 * akan mengunci mikrofon SELURUH meja sampai ia kembali.
 *
 * @param {{ts?: number, dur?: number}|null} live
 * @param {number} [now] - serverNow.
 * @returns {boolean} true bila kunci boleh direbut.
 */
export function isLockExpired(live, now = serverNow()) {
  if (!live || typeof live !== 'object') return true;
  const ts = Number(live.ts);
  const dur = Number(live.dur);
  if (!Number.isFinite(ts)) return true;
  const held = Number.isFinite(dur) && dur > 0 ? dur : MAX_DURATION_LOBBY_MS;
  return ts + held + LOCK_GRACE_MS < now;
}

/**
 * Bentuk payload `pttLive` untuk kunci yang kita pegang.
 *
 * @param {{from: string, dur: number, name?: string}} options
 * @returns {{from: string, ts: number, dur: number, name: string}}
 */
export function makeLivePayload({ from, dur, name }) {
  return {
    from: String(from || ''),
    ts: serverNow(),
    // Durasi yang diklaim adalah batas maksimum, bukan durasi sebenarnya:
    // pendengar memakai angka ini untuk menghitung kedaluwarsa kunci.
    dur: Math.max(1, Math.round(Number(dur) || MAX_DURATION_LOBBY_MS)),
    name: String(name || '').slice(0, 18),
  };
}

/**
 * ID event unik untuk node /ptt.
 * @param {() => string} makeId
 * @returns {string}
 */
export function makeAudioEventId(makeId) {
  return typeof makeId === 'function' ? makeId() : String(serverNow());
}
