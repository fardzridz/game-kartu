/**
 * Saklar cheat Jengges.
 *
 * Default **MATI** (main sehat). Selama mati, semua perintah rahasia
 * (`/pleeer`, `/nyocot`, `/pelumas/plir`) tidak berfungsi:
 *   - ketikannya ditelan diam-diam (tidak dikirim sebagai obrolan),
 *   - engine menolak intent `command` walau dikirim langsung,
 *   - efek lama (`pendingAces`, `pendingJoker`) diabaikan saat bagi kartu.
 *
 * Menghidupkan lagi kapan-kapan (tanpa ubah kode):
 *   - buka aplikasi sekali dengan `?cheat=1` → tersimpan di perangkat itu;
 *   - atau dari konsol: `localStorage.setItem('remi-cheats','1')` lalu refresh.
 * Mematikan lagi: `?cheat=0` (atau `localStorage.setItem('remi-cheats','0')`).
 *
 * Untuk menyalakan permanen bagi semua orang: ubah CHEATS_DEFAULT → true.
 */

const STORAGE_KEY = 'remi-cheats';

/** Nilai bawaan kalau perangkat belum pernah memilih. */
export const CHEATS_DEFAULT = false;

// Override manual (dipakai test dan pemanggilan eksplisit).
let override = null;

export function setCheatsEnabled(value) {
  if (value === null || value === undefined) {
    override = null;
    return;
  }
  override = Boolean(value);
  try {
    localStorage.setItem(STORAGE_KEY, override ? '1' : '0');
  } catch { /* localStorage bisa diblokir — abaikan */ }
}

export function resetCheatsOverride() {
  override = null;
}

export function cheatsEnabled() {
  if (override !== null) return override;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === '1') return true;
    if (stored === '0') return false;
  } catch { /* abaikan */ }

  try {
    const param = new URLSearchParams(window.location.search).get('cheat');
    if (param === '1' || param === '0') {
      const on = param === '1';
      try {
        localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
      } catch { /* abaikan */ }
      return on;
    }
  } catch { /* abaikan */ }

  return CHEATS_DEFAULT;
}
