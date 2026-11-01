/**
 * Deteksi mode hemat data.
 *
 * Pemain yang menyalakan "Hemat data" (Chrome: Settings → Lite mode / Save
 * data, atau header `Save-Data: on` dari operator) sudah memberi tahu kita
 * bahwa setiap byte itu mahal. Yang kita lakukan:
 *
 *   - JANGAN mulai musik latar (streaming nada berkelanjutan, paling berat)
 *   - LEWATI preload aset berat (potret & muka kartu tetap diunduh saat dipakai)
 *   - Kurangi animasi berat
 *   - TETAP mainkan SFX — ukurannya beberapa kilobyte, dan tanpa bunyi kartu
 *     permainan jadi tidak terbaca
 *
 * Jebakan: `navigator.connection` TIDAK ADA di Firefox dan Safari. Semua akses
 * di modul ini lewat optional chaining dan dibungkus try/catch, jadi browser
 * tanpa dukungan berjalan normal tanpa error.
 */

// Jaringan yang dianggap lambat. `slow-2g` dan `2g` praktis tidak bisa memutar
// audio tanpa terputus; `3g` masih bisa, tapi musik latar tetap dilewati karena
// pemain sudah menyatakan tidak mau boros.
const SLOW_TYPES = ['slow-2g', '2g', '3g'];

/**
 * Ambil objek Network Information API bila ada.
 * @returns {object|null}
 */
function getConnection() {
  try {
    if (typeof navigator === 'undefined') return null;
    return navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
  } catch {
    return null;
  }
}

/**
 * Apakah pengguna meminta penghematan data.
 *
 * @returns {boolean} true bila `navigator.connection.saveData === true` atau
 *   browser melaporkan sedang offline.
 */
export function isDataSaverActive() {
  const connection = getConnection();
  try {
    if (connection?.saveData === true) return true;
    // Offline juga berarti "jangan buang byte": mencoba memulai musik hanya
    // menghasilkan error dan percobaan request yang gagal.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  } catch {
    // Akses properti bisa diblokir mode privasi tertentu; anggap normal.
  }
  return false;
}

/**
 * Kualitas koneksi kasar untuk memutuskan preload aset.
 *
 * @returns {'offline'|'slow'|'ok'|'unknown'} `unknown` saat browser tidak
 *   menyediakan Network Information API (Firefox/Safari).
 */
export function connectionQuality() {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  } catch {
    // abaikan, lanjut ke pemeriksaan berikutnya
  }
  const connection = getConnection();
  if (!connection) return 'unknown';
  const type = connection.effectiveType;
  if (typeof type !== 'string' || !type) return 'unknown';
  if (SLOW_TYPES.includes(type)) return 'slow';
  // '4g' dan apa pun yang lebih baru dianggap cukup.
  return 'ok';
}

/**
 * Preload aset berat sebaiknya dilewati?
 *
 * @returns {boolean}
 */
export function shouldSkipHeavyPreload() {
  return isDataSaverActive() || connectionQuality() === 'slow' || connectionQuality() === 'offline';
}

/**
 * Animasi berat boleh dimatikan?
 *
 * @returns {boolean}
 */
export function shouldReduceMotion() {
  return isDataSaverActive();
}

/**
 * Berlangganan perubahan kondisi jaringan (termasuk event online/offline yang
 * tersedia di semua browser).
 *
 * @param {(state: {dataSaver: boolean, quality: string}) => void} callback
 * @returns {() => void} fungsi berhenti berlangganan
 */
export function subscribeConnectionChange(callback) {
  if (typeof callback !== 'function') return () => {};
  const emit = () => {
    try {
      callback({ dataSaver: isDataSaverActive(), quality: connectionQuality() });
    } catch {
      // Callback milik pemanggil; jangan sampai merusak listener.
    }
  };
  const connection = getConnection();
  const target = typeof window !== 'undefined' ? window : null;

  if (connection && typeof connection.addEventListener === 'function') {
    connection.addEventListener('change', emit);
  }
  if (target) {
    target.addEventListener('online', emit);
    target.addEventListener('offline', emit);
  }

  return () => {
    if (connection && typeof connection.removeEventListener === 'function') {
      connection.removeEventListener('change', emit);
    }
    if (target) {
      target.removeEventListener('online', emit);
      target.removeEventListener('offline', emit);
    }
  };
}

/**
 * Label indikator untuk pemain. Null bila mode hemat data tidak aktif.
 * @returns {string|null}
 */
export function dataSaverLabel() {
  return isDataSaverActive() ? 'Mode hemat data' : null;
}
