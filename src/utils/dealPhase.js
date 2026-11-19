/**
 * Fase kocok manual.
 *
 * Selama Pengocok masih di fase `shuffleState: 'manual'`, engine SUDAH
 * menyiapkan kartu tangan dan setiap kocokan mengacaknya ulang. Kalau angka
 * turunan tangan (estimasi poin ronde) tetap tampil, Pengocok bisa mencet
 * "Kocok Kartu" berulang sampai poinnya bagus — terasa seperti bisa memilih
 * kartu. Karena itu angka itu disembunyikan sampai kartu benar-benar
 * dibagikan (`shuffleState` berubah menjadi `'dealing'`).
 */

/**
 * @param {object|null|undefined} game - state game dari room.
 * @returns {boolean} true bila kartu masih dalam fase kocok manual.
 */
export function isDealPending(game) {
  return Boolean(game) && game.shuffleState === 'manual';
}
