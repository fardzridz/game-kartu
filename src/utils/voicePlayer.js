/**
 * Pemuat & pemutar klip voice reaction.
 *
 * Menumpang jalur yang sudah dibangun PTT:
 *   - decode lewat `audioContext()` (singleton, sudah di-unlock)
 *   - putar lewat `pttBus` (bukan sfxBus) supaya musik ikut mengecil
 *
 * Preload saat idle, tapi DILEWATI kalau mode hemat data aktif — dan tetap
 * bisa diputar saat ditekan (diunduh saat itu juga).
 */

import { audioContext, playVoiceBuffer } from '../sound/soundFX.js';
import { isDataSaverActive } from './dataSaver.js';

// Buffer hasil decode ditahan di memori modul. Kunci = path berkas.
const cache = new Map();
// Permintaan yang sedang berjalan, supaya preload + tekan tombol tidak
// mengunduh berkas yang sama dua kali.
const inflight = new Map();

/**
 * Unduh dan decode satu klip.
 *
 * @param {string} url - path di public/, mis. '/voices/mantap.webm'.
 * @returns {Promise<AudioBuffer|null>} null bila gagal (404, decode gagal,
 *   atau Web Audio tidak tersedia).
 */
export async function loadVoiceClip(url) {
  if (typeof url !== 'string' || !url) return null;
  if (cache.has(url)) return cache.get(url);
  if (inflight.has(url)) return inflight.get(url);

  const task = (async () => {
    const ctx = audioContext();
    if (!ctx) return null;
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const bytes = await response.arrayBuffer();
      const decoded = await new Promise((resolve, reject) => {
        const result = ctx.decodeAudioData(bytes, resolve, reject);
        if (result && typeof result.then === 'function') result.then(resolve).catch(reject);
      });
      cache.set(url, decoded);
      return decoded;
    } catch {
      // Berkas belum tersedia atau format tidak dikenal: diam saja. Tombol
      // tetap ada, tapi tidak berbunyi — bukan alasan untuk crash.
      return null;
    } finally {
      inflight.delete(url);
    }
  })();

  inflight.set(url, task);
  return task;
}

/**
 * Putar satu klip reaksi lewat pttBus.
 *
 * @param {string} url
 * @returns {Promise<boolean>} true bila benar-benar berbunyi.
 */
export async function playVoiceClip(url) {
  const buffer = await loadVoiceClip(url);
  if (!buffer) return false;
  return playVoiceBuffer(buffer);
}

/**
 * Panaskan semua klip saat idle. Idempoten dan aman dipanggil berkali-kali.
 *
 * @param {Array<{file: string}>} reactions
 * @returns {Promise<number>} jumlah klip yang berhasil dimuat.
 */
export async function preloadVoiceReactions(reactions = []) {
  // Mode hemat data: jangan unduh apa pun di latar. Klip tetap bisa diputar
  // saat ditekan (diunduh saat itu juga) — jadi fiturnya tidak hilang.
  if (isDataSaverActive()) return 0;
  if (!Array.isArray(reactions) || reactions.length === 0) return 0;

  const results = await Promise.all(reactions.map(item => loadVoiceClip(item.file)));
  return results.filter(Boolean).length;
}

/**
 * Apakah klip sudah siap di memori (untuk indikator/tes).
 * @param {string} url
 * @returns {boolean}
 */
export function isVoiceClipCached(url) {
  return cache.has(url);
}

/** Kosongkan cache (dipakai tes). */
export function clearVoiceCache() {
  cache.clear();
  inflight.clear();
}
