/**
 * Haptic feedback ringan (Android Chrome). Di iOS Safari navigator.vibrate
 * tidak ada — panggilan ini diabaikan diam-diam, tidak pernah melempar.
 */
export function vibrate(pattern) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch { /* haptic gagal tidak boleh menghentikan game */ }
}
