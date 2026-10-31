/**
 * Preloader aset UI.
 *
 * Semua potret avatar dan muka kartu diunduh + di-decode sekali di awal, lalu
 * referensinya ditahan di memori modul. Dengan begitu pergantian ronde,
 * lemparan kartu, dan buka-tutup panel tidak memicu request baru atau flicker
 * saat sinyal sedang jelek. Simbol kembang ♠♥♦♣ yang tampil sebagai teks
 * juga dipanaskan lewat canvas.
 */
import { ALL_CARD_PATHS } from './cardAssets.js';
import { AVATAR_ASSET_PATHS } from './avatarAssets.js';

export const SUIT_SYMBOL_GLYPHS = Object.freeze(['♠', '♥', '♦', '♣']);

// Aset yang benar-benar dipakai UI. cardAssets sudah mencakup seluruh kembang
// (spades/hearts/diamonds/clubs), joker, dan punggung kartu.
export const STATIC_ASSET_PATHS = Object.freeze([
  ...new Set([...AVATAR_ASSET_PATHS, ...ALL_CARD_PATHS]),
]);

export const ASSET_GROUPS = Object.freeze({
  avatars: AVATAR_ASSET_PATHS,
  cards: ALL_CARD_PATHS,
  suits: SUIT_SYMBOL_GLYPHS,
});

// Referensi hidup agar gambar yang sudah di-decode tidak dibuang browser dan
// canvas glyph tetap tersimpan selama sesi.
const retained = [];
let preloadPromise = null;

const canUseDom = () => typeof window !== 'undefined' && typeof document !== 'undefined';

function idle(callback, timeout = 1500) {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(callback, { timeout });
    return;
  }
  window.setTimeout(callback, 32);
}

function preloadImage(src) {
  return new Promise(resolve => {
    if (typeof Image === 'undefined') {
      resolve(false);
      return;
    }
    const image = new Image();
    image.decoding = 'async';
    image.loading = 'eager';
    image.onload = () => {
      retained.push(image);
      // decode() memastikan bitmap benar-benar siap dilukis, bukan hanya
      // "selesai diunduh" — inilah yang menghilangkan flicker frame pertama.
      if (typeof image.decode === 'function') {
        image.decode().catch(() => {}).finally(() => resolve(true));
      } else {
        resolve(true);
      }
    };
    image.onerror = () => resolve(false);
    image.src = src;
  });
}

async function preloadPool(urls, concurrency = 6) {
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
    while (next < urls.length) {
      const src = urls[next];
      next += 1;
      await preloadImage(src);
    }
  });
  await Promise.all(workers);
  return urls.length;
}

function warmGlyphs(glyphs) {
  if (typeof document.createElement !== 'function') return;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.font = '64px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    for (const glyph of glyphs) context.fillText(glyph, 48, 48);
    retained.push(canvas);
  } catch {
    // Canvas bisa diblokir mode privasi tertentu; preload gambar tetap jalan.
  }
}

/**
 * Dipanggil sekali saat aplikasi mount. Idempoten: pemanggilan berikutnya
 * mengembalikan promise yang sama, sehingga React StrictMode tidak menggandakan
 * unduhan.
 *
 * @returns {Promise<number>} jumlah aset gambar yang dipanaskan.
 */
export function preloadAssets({ concurrency = 6 } = {}) {
  if (preloadPromise) return preloadPromise;
  if (!canUseDom()) {
    preloadPromise = Promise.resolve(0);
    return preloadPromise;
  }

  warmGlyphs([...SUIT_SYMBOL_GLYPHS]);

  preloadPromise = new Promise(resolve => {
    idle(() => {
      preloadPool(STATIC_ASSET_PATHS, concurrency).then(resolve).catch(() => resolve(0));
    });
  });
  return preloadPromise;
}

export function isPreloaded() {
  return retained.length > 0;
}
