import { useEffect, useRef } from 'react';

/**
 * Apakah browser punya Screen Wake Lock API.
 *
 * Safari < 16.4 dan Firefox tidak punya. Fitur ini murni "enak dipakai", jadi
 * kalau tidak didukung kita diam saja — tidak ada UI, tidak ada peringatan.
 *
 * @returns {boolean}
 */
export function supportsWakeLock() {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator && Boolean(navigator.wakeLock);
}

/**
 * Menahan layar tetap menyala selama `active === true`.
 *
 * Dipakai di meja main: layar hanya ditahan saat giliran pemain lokal, supaya
 * pemain yang sedang berpikir tidak kehilangan giliran karena layar mati.
 * Giliran lawan → lock dilepas (hemat baterai).
 *
 * Detail penting yang mudah terlewat: browser **melepas lock otomatis** ketika
 * halaman menjadi hidden (pemain pindah app, layar dikunci, ganti tab). Karena
 * itu lock harus diambil ulang setiap `visibilitychange` menjadi `visible`.
 * Tanpa ini fitur hanya bekerja sekali di awal lalu mati diam-diam.
 *
 * Catatan: sengaja TIDAK memakai trik "putar video kosong" untuk iOS < 16.4 —
 * itu menghabiskan lebih banyak baterai daripada masalah yang diselesaikan.
 *
 * @param {boolean} active - true saat layar perlu ditahan menyala.
 */
export function useWakeLock(active) {
  // Sentinel disimpan di ref supaya bisa dilepas dari cleanup dan dari listener
  // visibility tanpa memicu render ulang.
  const sentinelRef = useRef(null);
  const requestingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!supportsWakeLock()) return undefined;

    let disposed = false;
    // `wanted` adalah sumber kebenaran untuk efek ini. Dibaca di dalam callback
    // async agar hasil request yang datang terlambat tahu apakah lock masih
    // diperlukan.
    let wanted = Boolean(active);

    const release = () => {
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      if (!sentinel) return;
      try {
        const result = sentinel.release();
        if (result && typeof result.catch === 'function') result.catch(() => {});
      } catch {
        // Sentinel yang sudah dilepas browser akan melempar; abaikan.
      }
    };

    const acquire = async () => {
      if (disposed || !wanted) return;
      // Sudah pegang lock yang masih hidup → jangan dobel. Sentinel yang sudah
      // dilepas browser (mis. karena halaman sempat hidden) ditandai
      // `released === true`, jadi ref basi seperti itu harus dibuang dulu.
      const existing = sentinelRef.current;
      if (existing && !existing.released) return;
      if (existing) sentinelRef.current = null;
      if (requestingRef.current) return;
      // Meminta lock saat halaman hidden selalu ditolak dan menghasilkan
      // promise yang menggantung di sebagian browser.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

      requestingRef.current = true;
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        // Giliran bisa sudah berpindah selagi request berjalan.
        if (disposed || !wanted) {
          try { await sentinel.release(); } catch { /* sudah lepas sendiri */ }
          return;
        }
        sentinelRef.current = sentinel;
        // Browser melepas lock sendiri saat halaman hidden; jaga state internal
        // tetap konsisten supaya acquire berikutnya tidak mengira masih pegang.
        if (typeof sentinel.addEventListener === 'function') {
          sentinel.addEventListener('release', () => {
            if (sentinelRef.current === sentinel) sentinelRef.current = null;
          });
        }
      } catch {
        // Ditolak saat tab tidak aktif, baterai lemah, atau mode hemat daya.
        // Bukan kondisi error untuk pemain — cukup diam.
      } finally {
        requestingRef.current = false;
      }
    };

    const onVisibility = () => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState === 'visible') {
        acquire();
        return;
      }
      // Saat halaman hidden browser sudah melepas lock sendiri. Jangan
      // bergantung pada event 'release' (tidak selalu dikirim), cukup lupakan
      // referensinya supaya acquire berikutnya benar-benar meminta ulang.
      sentinelRef.current = null;
    };

    if (wanted) acquire();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }

    return () => {
      disposed = true;
      wanted = false;
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
      release();
    };
  }, [active]);
}

export default useWakeLock;
