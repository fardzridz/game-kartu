/**
 * Utilitas obrolan meja main (chat in-game).
 *
 * Semua fungsi di sini MURNI: tidak menyentuh DOM, tidak membuka kanal, tidak
 * membaca jam sendiri. Tujuannya supaya bisa dites tanpa browser, dan supaya
 * komponen/hook tinggal memanggil.
 *
 * KENAPA NODE TERPISAH: obrolan meja memakai node `tableChats`, bukan `chats`
 * milik ruang tunggu. Alasannya bukan kerapian kosmetik — retensi, jumlah
 * riwayat, dan audiensnya beda (di meja semua orang sedang menonton kartu,
 * jadi pesan harus lebih singkat umurnya). Aturan validasi di
 * `firebase.rules.json` menyalin batas 200 karakter dari node `chats`.
 */

import { MAX_CHAT_LENGTH, sanitizeName } from './chatFilter.js';

/** Nama node RTDB di bawah rooms/{code}. */
export const TABLE_CHAT_NODE = 'tableChats';
/** Nama BroadcastChannel untuk mode simulasi lokal. */
export const TABLE_CHAT_CHANNEL = 'remi-table-chats';
/**
 * Umur pesan di kanal (dan batas umur tampilan): 5 MENIT.
 *
 * Dulu 30 detik — terlalu pendek untuk meja yang ramai: pemain yang sedang
 * fokus memilih kartu kehilangan konteks obrolan sebelum sempat membacanya.
 * Permintaan pemilik project: riwayat obrolan meja ditahan lebih lama.
 */
export const TABLE_CHAT_RETAIN_MS = 300000;
/** Rate limit klien: satu pesan per 2 detik, sama dengan ruang tunggu. */
export const TABLE_CHAT_COOLDOWN_MS = 2000;
/**
 * Jumlah pesan terakhir yang disimpan di layar. Dinaikkan dari 20 supaya
 * jendela 5 menit di atas benar-benar terpakai — kalau meja ramai, 20 pesan
 * bisa habis dalam satu menit dan riwayat lama hilang karena batas jumlah,
 * bukan karena umur.
 */
export const TABLE_CHAT_HISTORY = 50;
/** Lama banner pesan masuk (ticker) menempel di layar. */
export const TABLE_CHAT_TICKER_MS = 4500;

/**
 * Frasa cepat. Ada karena alasan produk: di meja main keyboard HP menutupi
 * 40-50% layar sementara timer giliran tetap berjalan. Frasa cepat membuat
 * pemain bisa "ngomong" tanpa membuka keyboard sama sekali.
 */
export const QUICK_PHRASES = [
  'Mantap!',
  'Waduh!',
  'Giliran lo',
  'Awas ya',
  'wkwk',
  'Tunggu bentar',
];

/**
 * Normalisasi payload kanal menjadi entri yang aman dirender.
 *
 * Nilai dari jaringan TIDAK dipercaya: nama dipotong, avatar dibatasi 32
 * karakter, teks dipotong 200 karakter. Render tetap sebagai teks murni
 * (React meng-escape sendiri) — tidak ada HTML mentah di mana pun.
 *
 * @param {object} payload - isi node dari RTDB / BroadcastChannel.
 * @param {string|null} viewerId - id pemain lokal, untuk menandai pesan sendiri.
 * @returns {{id: string, from: string, name: string, avatar: string, text: string, ts: number, mine: boolean}}
 */
export function toChatEntry(payload, viewerId = null) {
  const safe = payload && typeof payload === 'object' ? payload : {};
  const from = String(safe.from || '');
  const ts = Number(safe.ts) || 0;
  const text = String(safe.text || '').slice(0, MAX_CHAT_LENGTH);

  return {
    // Id cadangan harus stabil: pesan tanpa id tetap tidak boleh tampil ganda.
    id: String(safe.id || `${from}-${ts}-${text}`),
    from,
    name: sanitizeName(safe.name) || 'Pemain',
    avatar: typeof safe.avatar === 'string' ? safe.avatar.slice(0, 32) : '',
    text,
    ts,
    mine: Boolean(viewerId) && from === viewerId,
  };
}

/**
 * Buang pesan yang sudah lewat umur tampilan.
 *
 * @param {Array<{ts: number}>} list
 * @param {number} now - waktu acuan (pakai serverNow()).
 * @param {number} [retainMs]
 * @returns {Array} daftar baru tanpa pesan kedaluwarsa.
 */
export function pruneExpired(list, now, retainMs = TABLE_CHAT_RETAIN_MS) {
  if (!Array.isArray(list)) return [];
  const cutoff = Number(now) - retainMs;
  return list.filter(item => Number(item?.ts || 0) >= cutoff);
}

/**
 * Tambahkan entri ke daftar: buang duplikat id, urutkan, batasi panjang.
 *
 * @param {Array<object>} list
 * @param {object} entry
 * @param {number} [limit]
 * @returns {Array<object>} daftar baru.
 */
export function appendMessage(list, entry, limit = TABLE_CHAT_HISTORY) {
  const base = Array.isArray(list) ? list : [];
  if (!entry?.id) return base;
  if (base.some(item => item.id === entry.id)) return base;
  const next = [...base, entry].sort((a, b) => (a.ts || 0) - (b.ts || 0));
  return next.slice(-limit);
}

/**
 * Sisa waktu cooldown pengiriman.
 *
 * @param {number} cooldownUntil - timestamp kapan boleh kirim lagi.
 * @param {number} now
 * @returns {number} milidetik tersisa (0 bila sudah boleh).
 */
export function cooldownLeftAt(cooldownUntil, now) {
  const left = Number(cooldownUntil) - Number(now);
  return Number.isFinite(left) && left > 0 ? left : 0;
}

/**
 * Boleh kirim sekarang atau belum?
 *
 * @param {number} lastSentAt - timestamp kiriman terakhir.
 * @param {number} now
 * @param {number} [cooldownMs]
 * @returns {{allowed: boolean, until: number}}
 */
export function sendGate(lastSentAt, now, cooldownMs = TABLE_CHAT_COOLDOWN_MS) {
  const last = Number(lastSentAt) || 0;
  const current = Number(now) || 0;
  const until = last + cooldownMs;
  return { allowed: current >= until, until };
}
