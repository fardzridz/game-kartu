/**
 * Saklar cheat Jengges.
 *
 * Default **NYALA** (mode tongkrongan). Perintah rahasia
 * (`/pleeer`, `/nyocot`, `/pelumas/plir`) aktif selama saklar nyala:
 *   - ketikan berawalan `/` diteruskan ke engine, tidak dikirim sebagai obrolan,
 *   - engine memvalidasi kode & jatah di dalam transaksi,
 *   - penanda `pendingAces` / `pendingJoker` dihormati saat bagi kartu.
 *
 * Mematikan per perangkat (tanpa ubah kode):
 *   - buka aplikasi sekali dengan `?cheat=0` → tersimpan di perangkat itu;
 *   - atau dari konsol: `localStorage.setItem('remi-cheats','0')` lalu refresh.
 * Menyalakan lagi: `?cheat=1` (atau `localStorage.setItem('remi-cheats','1')`).
 *
 * Untuk mematikan permanen bagi semua orang: ubah CHEATS_DEFAULT → false.
 */

const STORAGE_KEY = 'remi-cheats';

/** Nilai bawaan kalau perangkat belum pernah memilih. */
export const CHEATS_DEFAULT = true;

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
