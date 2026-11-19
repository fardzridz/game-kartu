/**
 * Bus lokal untuk efek visual reaksi suara.
 *
 * Kenapa bus, bukan kanal jaringan kedua: efek harus muncul SEKETIKA di
 * perangkat penekan (tanpa menunggu round-trip) dan juga di semua perangkat
 * lain yang menerima event reaksi. `VoiceReactionBar` sudah memegang kanal
 * `taunts`; ia cukup meneruskan setiap event yang sah ke bus ini, dan
 * `VoiceProfileFx` merendernya. Tidak ada listener jaringan tambahan.
 *
 * Bus ini murni dalam memori: tidak menyentuh localStorage, tidak menyentuh
 * state room, dan tidak pernah mengirim apa pun ke jaringan.
 */

/** @typedef {{reactionId: string, fromId: string, id: string}} VoiceFxDetail */

/** @type {Set<(detail: VoiceFxDetail) => void>} */
const listeners = new Set();

/** Penanda urutan untuk event tanpa id (praktis hanya di test). */
let sequence = 0;

/**
 * @param {(detail: VoiceFxDetail) => void} listener
 * @returns {() => void} fungsi berhenti berlangganan.
 */
export function subscribeVoiceFx(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * Siarkan satu efek reaksi. Payload rusak diabaikan diam-diam: lapisan FX
 * bersifat dekoratif, tidak boleh menjatuhkan jalur audio/chat.
 *
 * @param {{reactionId?: string, fromId?: string, id?: string}} detail
 * @returns {boolean} true bila diteruskan ke pendengar.
 */
export function emitVoiceFx(detail) {
  if (!detail || typeof detail !== 'object') return false;
  const reactionId = typeof detail.reactionId === 'string' ? detail.reactionId : '';
  const fromId = typeof detail.fromId === 'string' ? detail.fromId : '';
  if (!reactionId || !fromId) return false;

  sequence += 1;
  /** @type {VoiceFxDetail} */
  const event = {
    reactionId,
    fromId,
    id: typeof detail.id === 'string' && detail.id ? detail.id : `vfx-${fromId}-${sequence}`,
  };

  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // Satu pendengar rusak tidak boleh memblokir pendengar lain.
    }
  }
  return listeners.size > 0;
}

/** Kosongkan semua pendengar (dipakai tes). */
export function resetVoiceFxBus() {
  listeners.clear();
}

/**
 * Titik jangkar (atas-tengah avatar) untuk satu pemain.
 *
 * Dicari lewat atribut, bukan selector ber-escape: id pemain bisa berisi
 * karakter apa saja, dan `CSS.escape` belum tentu ada di lingkungan tes.
 *
 * @param {string} playerId
 * @returns {{x: number, y: number}|null}
 */
export function resolvePlayerPoint(playerId) {
  if (!playerId || typeof document === 'undefined') return null;
  const nodes = document.querySelectorAll('[data-player-id]');
  for (const node of nodes) {
    if (node.getAttribute('data-player-id') !== playerId) continue;
    const rect = node.getBoundingClientRect();
    if (!rect.width && !rect.height) continue;
    return { x: rect.left + rect.width / 2, y: rect.top };
  }
  return null;
}

/** Titik cadangan: bawah-tengah layar, dekat profil sendiri. */
export function fallbackPlayerPoint() {
  const width = typeof window === 'undefined' ? 360 : window.innerWidth;
  const height = typeof window === 'undefined' ? 640 : window.innerHeight;
  return { x: width / 2, y: height * 0.72 };
}
