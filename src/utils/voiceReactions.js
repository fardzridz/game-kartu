/**
 * Katalog voice reaction — klip pendek siap pakai.
 *
 * Ini BUKAN rekaman pemain. Aset tetap: risiko moderasi nol, biaya nyaris nol.
 * Sekali tekan, semua pemain di meja mendengar klip yang sama.
 *
 * ---------------------------------------------------------------------------
 * SUMBER & LISENSI ASET
 * ---------------------------------------------------------------------------
 * Berkas di `public/voices/` HARUS direkam sendiri oleh pemilik project atau
 * memakai aset berlisensi jelas (CC0 / public domain / lisensi komersial yang
 * dibeli). JANGAN mengambil dari game lain — itu pelanggaran hak cipta dan
 * bisa membuat aplikasi diturunkan dari store.
 *
 * Status saat ini: **berkas audio belum disertakan.** Kode di bawah sudah
 * lengkap dan siap pakai; selama berkasnya belum ada, bar tombol tidak
 * dirender sama sekali (tidak ada tombol rusak, tidak ada request 404 yang
 * berulang). Cukup taruh 4 berkas dengan nama sesuai `file` di bawah, dan
 * fitur langsung hidup tanpa perubahan kode.
 *
 * Format yang disarankan: mono, Opus di dalam WebM atau Ogg, ~1–2 detik,
 * target ±15 KB per klip. Kalau memakai MP3/M4A, ganti `file` sesuai nama
 * berkasnya — browser yang men-decode, bukan kita.
 */

/**
 * @typedef {object} VoiceReaction
 * @property {string} id - kunci stabil untuk event (jangan diubah sembarangan).
 * @property {string} label - teks tombol.
 * @property {string} file - path di public/, relatif ke root.
 * @property {string} text - kalimat yang diucapkan (dokumentasi & aria-label).
 */

/** @type {readonly VoiceReaction[]} */
export const VOICE_REACTIONS = Object.freeze([
  { id: 'mantap', label: 'Mantap!', file: '/voices/mantap.webm', text: 'Mantap!' },
  { id: 'waduh', label: 'Waduh!', file: '/voices/waduh.webm', text: 'Waduh!' },
  { id: 'hahaha', label: 'Hahaha', file: '/voices/hahaha.webm', text: 'Hahaha' },
  { id: 'mati-sampah', label: 'Mati Sampah!', file: '/voices/mati-sampah.webm', text: 'Mati Sampah!' },
]);

/** Rate limit: satu reaksi per 3 detik. */
export const VOICE_COOLDOWN_MS = 3000;

/**
 * Cari reaksi berdasarkan id.
 *
 * @param {string} id
 * @returns {VoiceReaction|null} null bila id tidak dikenal — pemanggil harus
 *   mengabaikan event asing, bukan merender tombol kosong.
 */
export function findVoiceReaction(id) {
  if (typeof id !== 'string' || !id) return null;
  return VOICE_REACTIONS.find(item => item.id === id) || null;
}

/**
 * Apakah sebuah id reaksi valid.
 * @param {string} id
 * @returns {boolean}
 */
export function isValidVoiceReaction(id) {
  return findVoiceReaction(id) !== null;
}

/**
 * Payload event untuk node `taunts` yang sudah ada.
 *
 * CATATAN PENTING soal `type`: node `taunts` hanya menerima `type` bernilai
 * `taunt` atau `throw` (lihat firebase.rules.json). Brief menyebut
 * `type: 'voice'`, tapi nilai itu akan DITOLAK rules yang sudah ada. Karena
 * syaratnya "tidak perlu rules baru", event ini memakai `type: 'taunt'` +
 * pembeda `kind: 'voice'`.
 *
 * Supaya tidak mengganggu TauntThrowSystem, event ini TIDAK membawa `tauntId`
 * maupun `throwableId` — `handleEvent` di sana akan berhenti lebih awal dan
 * tidak merender balon ejekan. `id` sengaja unik per event (bukan id reaksi)
 * agar tidak bertabrakan dengan dedupe milik TauntThrowSystem.
 *
 * @param {object} options
 * @param {string} options.id - id reaksi ('mantap', 'waduh', ...).
 * @param {string} options.from - id pengirim.
 * @param {number} [options.ts] - timestamp; pemanggil mengisi serverNow().
 * @param {string} [options.eventId] - id unik event; dibuat bila tidak diberi.
 * @returns {{type: string, kind: string, reactionId: string, id: string, from: string, ts: number}|null}
 */
export function makeVoiceEvent({ id, from, ts, eventId }) {
  const reaction = findVoiceReaction(id);
  if (!reaction) return null;
  if (typeof from !== 'string' || !from) return null;
  const stamp = Number.isFinite(Number(ts)) ? Number(ts) : 0;
  return {
    type: 'taunt',
    kind: 'voice',
    reactionId: reaction.id,
    // id unik per event, dipakai dedupe klien penerima.
    id: typeof eventId === 'string' && eventId ? eventId : `voice-${from}-${stamp}-${reaction.id}`,
    from,
    ts: stamp,
  };
}

/**
 * Apakah event dari jaringan adalah voice reaction yang kita kenal.
 *
 * Event ejekan/lemparan biasa tidak punya `kind`, jadi disaring di sini dan
 * tidak mengganggu jalur TauntThrowSystem.
 *
 * @param {object} payload
 * @returns {boolean}
 */
export function isVoiceEvent(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.kind !== 'voice') return false;
  return isValidVoiceReaction(payload.reactionId);
}

/**
 * Sisa waktu cooldown dalam milidetik.
 *
 * @param {number} lastAt - waktu kirim terakhir.
 * @param {number} now - waktu sekarang.
 * @param {number} [cooldownMs]
 * @returns {number} 0 bila sudah boleh mengirim lagi.
 */
export function cooldownLeft(lastAt, now, cooldownMs = VOICE_COOLDOWN_MS) {
  const last = Number(lastAt);
  if (!Number.isFinite(last) || last <= 0) return 0;
  const remaining = last + cooldownMs - Number(now);
  return remaining > 0 ? remaining : 0;
}
