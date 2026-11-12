/**
 * Bot AI Monopoli Tongkrongan.
 *
 * Mengambil keputusan cerdas otomatis:
 * - Mengocok dadu
 * - Membeli properti bila uang tunai masih aman (> 20% modal)
 * - Membangun rumah/hotel bila komplek warna sudah lengkap
 * - Keluar penjara (pakai kartu bebas bila punya, atau bayar denda bila kaya)
 */
import { hasFullColorGroup } from './monopolyEngine.js';
import { MONOPOLY_TILES } from './monopolyCatalog.js';

export function chooseMonopolyBotAction(room, seatIndex) {
  if (!room || room.status !== 'playing') return null;
  const seat = room.seats[seatIndex];
  if (!seat || !seat.bot || seat.bankrupt) return null;

  // 1. Fase Penjara
  if (seat.inJail) {
    if (seat.jailCards > 0) {
      return { type: 'useJailCard' };
    }
    if (seat.cash >= 300) {
      return { type: 'payJailFine' };
    }
    if (room.turnPhase === 'roll') {
      return { type: 'roll' };
    }
  }

  // 2. Fase Kocok Dadu
  if (room.turnPhase === 'roll') {
    return { type: 'roll' };
  }

  // 3. Fase Aksi setelah mendarat
  if (room.turnPhase === 'action') {
    const pos = seat.position;
    const tile = MONOPOLY_TILES[pos];
    const prop = room.properties[pos];

    // Coba beli tanah bila belum ada pemiliknya dan uang masih cukup aman
    if (['property', 'station', 'utility'].includes(tile?.type) && prop && !prop.ownerId) {
      const buffer = 150;
      if (seat.cash >= tile.price + buffer) {
        return { type: 'buy' };
      }
    }

    // Coba bangun rumah bila ada komplek warna yang sudah lengkap
    for (const t of MONOPOLY_TILES) {
      if (t.type === 'property' && t.houseCost) {
        const p = room.properties[t.index];
        if (p?.ownerId === seat.id && p.houses < 5 && hasFullColorGroup(room, seat.id, t.group)) {
          if (seat.cash >= t.houseCost + 200) {
            return { type: 'upgrade', tileIndex: t.index };
          }
        }
      }
    }

    // Akhiri giliran
    return { type: 'endTurn' };
  }

  return null;
}
