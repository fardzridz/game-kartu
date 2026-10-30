import { applyIntent } from '../engine/roomEngine.js';

/**
 * Melepas kursi sendiri sebelum meninggalkan meja (tombol "Keluar").
 *
 * Kenapa tidak lewat antrean `sendIntent` milik App:
 * - `sendIntent` adalah useCallback biasa yang TIDAK mengembalikan promise dan
 *   langsung `return` saat service belum siap. Dulu pemanggilnya menulis
 *   `sendIntent({ type: 'stand' }).catch(...)` → `undefined.catch` melempar
 *   TypeError SEBELUM `teardownRoom()` jalan, jadi layar tidak pernah kembali
 *   ke halaman utama (pemain tersangkut di Ruang Tunggu).
 * - Antrean itu juga bisa ditinggal saat service ditutup di tengah jalan.
 *
 * Di sini intent dikirim lewat transaksi atomik langsung, sehingga:
 * - selama ronde berjalan kursi hanya ditandai offline (kartu tidak yatim),
 * - di lobby / round-end kursi benar-benar dilepas,
 * - kursi terakhir (meja sepi) tidak bisa "stand" menurut engine → cukup
 *   ditandai offline; itu bukan alasan untuk menahan pemain di halaman ini.
 *
 * @returns {Promise|null} promise transaksi, atau null bila tidak ada yang
 *   perlu dikirim (belum duduk / service belum siap).
 */
export function releaseSeat(service, room, viewerId, now = Date.now()) {
  if (!service || !room || !viewerId) return null;
  if (!(room.seats || []).some(seat => seat.id === viewerId)) return null;
  return service.transact(current => {
    // Status dibaca dari state server (bisa saja sudah pindah fase sejak klik).
    const base = current || room;
    if (!(base.seats || []).some(seat => seat.id === viewerId)) return null;
    if (base.status === 'playing') {
      const away = applyIntent(base, { type: 'offline' }, viewerId, now);
      return away.error ? null : away.room;
    }
    const stood = applyIntent(base, { type: 'stand' }, viewerId, now);
    if (!stood.error) return stood.room;
    // Kursi terakhir: engine melarang "stand". Tandai pergi saja supaya kursi
    // tidak menggantung "online" di meja yang sudah ditinggalkan.
    const away = applyIntent(base, { type: 'offline' }, viewerId, now);
    return away.error ? null : away.room;
  });
}
