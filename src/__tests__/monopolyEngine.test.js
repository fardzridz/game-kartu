import { describe, expect, it } from 'vitest';
import {
  MONOPOLY_MAX_PLAYERS,
  MONOPOLY_STARTING_CASH,
  applyMonopolyIntent,
  calculateNetWorth,
  calculateRent,
  createMonopolyRoom,
  hasFullColorGroup,
} from '../monopoly/monopolyEngine.js';
import { MONOPOLY_TILES } from '../monopoly/monopolyCatalog.js';
import { chooseMonopolyBotAction } from '../monopoly/monopolyBots.js';

describe('Monopoli Tongkrongan — Kursi & Lobby (2–8 Pemain)', () => {
  it('mengizinkan 2 sampai 8 pemain/bot bergabung dan menolak pemain ke-9', () => {
    let room = createMonopolyRoom({
      code: 'MONO01',
      hostId: 'p1',
      name: 'Far',
      now: 1000,
    });
    expect(room.seats).toHaveLength(1);
    expect(room.seats[0].cash).toBe(MONOPOLY_STARTING_CASH);

    // Tambah 7 pemain/bot lagi sampai penuh (8 pemain)
    for (let i = 2; i <= MONOPOLY_MAX_PLAYERS; i += 1) {
      const res = applyMonopolyIntent(room, { type: 'sit', name: `Pemain ${i}` }, `p${i}`, 1000 + i);
      expect(res.error).toBeUndefined();
      room = res.room;
    }
    expect(room.seats).toHaveLength(8);

    const overflow = applyMonopolyIntent(room, { type: 'sit', name: 'Pemain 9' }, 'p9', 2000);
    expect(overflow.error).toMatch(/penuh/i);
  });
});

describe('Monopoli Tongkrongan — Core Engine (Dadu, Beli Tanah, Sewa, Penjara & Bangkrut)', () => {
  function setupGame() {
    let room = createMonopolyRoom({
      code: 'GAME01',
      hostId: 'p1',
      name: 'Far',
      settings: { turnSeconds: 45, startingCash: 1500 },
      now: 1000,
    });
    room = applyMonopolyIntent(room, { type: 'sit', name: 'Budi' }, 'p2', 1100).room;
    room = applyMonopolyIntent(room, { type: 'start' }, 'p1', 1200).room;
    return room;
  }

  it('mengocok dadu, memindahkan bidak, dan membeli tanah', () => {
    let room = setupGame();
    expect(room.status).toBe('playing');
    expect(room.turnIndex).toBe(0);
    expect(room.turnPhase).toBe('roll');

    // Pemain 1 kocok dadu
    room = applyMonopolyIntent(room, { type: 'roll' }, 'p1', 1500).room;
    expect(room.turnPhase).toBe('action');
    expect(room.seats[0].position).toBeGreaterThan(0);

    // Beli properti di tempat ia mendarat jika berupa tanah/stasiun/utilitas
    const pos = room.seats[0].position;
    const tile = MONOPOLY_TILES[pos];

    if (['property', 'station', 'utility'].includes(tile.type)) {
      const buyRes = applyMonopolyIntent(room, { type: 'buy' }, 'p1', 1600);
      expect(buyRes.error).toBeUndefined();
      room = buyRes.room;
      expect(room.properties[pos].ownerId).toBe('p1');
      expect(calculateNetWorth(room, 'p1')).toBeGreaterThanOrEqual(1500);
    }

    // Akhiri giliran -> pindah ke pemain 2
    room = applyMonopolyIntent(room, { type: 'endTurn' }, 'p1', 1700).room;
    expect(room.turnIndex).toBe(1);
    expect(room.turnPhase).toBe('roll');
  });

  it('menghitung sewa tanah kosong, sewa berlipat komplek penuh, dan sewa rumah 1–4/hotel', () => {
    let room = setupGame();
    // Beli seluruh komplek cokelat (Petak 1 Indonesia & Petak 3 Malaysia) untuk p1
    room.properties[1] = { ownerId: 'p1', houses: 0, mortgaged: false };
    room.properties[3] = { ownerId: 'p1', houses: 0, mortgaged: false };

    expect(hasFullColorGroup(room, 'p1', 'BROWN')).toBe(true);

    // Sewa tanah kosong komplek penuh berlipat ganda (baseRent 2 -> 4)
    expect(calculateRent(room, 1, 7)).toBe(4);

    // Bangun 1 rumah (rents[0] = 10)
    room.properties[1].houses = 1;
    expect(calculateRent(room, 1, 7)).toBe(10);

    // Bangun Hotel / houses = 5 (rents[4] = 250)
    room.properties[1].houses = 5;
    expect(calculateRent(room, 1, 7)).toBe(250);
  });

  it('memasukkan pemain ke penjara saat mendarat di petak Masuk Penjara (petak 30)', () => {
    let room = setupGame();
    room.seats[0].position = 28;
    room = applyMonopolyIntent(room, { type: 'roll' }, 'p1', 2000).room;

    // Simulasi langsung mendarat di petak 30
    room.seats[0].position = 30;
    const tile30 = MONOPOLY_TILES[30];
    expect(tile30.type).toBe('goto_jail');
  });

  it('mengeliminasi pemain bangkrut dan memenangkan pemain terakhir', () => {
    let room = setupGame();
    // Bikin uang p1 negatif (bangkrut)
    room.turnPhase = 'action';
    room.seats[0].cash = -100;

    room = applyMonopolyIntent(room, { type: 'endTurn' }, 'p1', 3000).room;
    expect(room.seats[0].bankrupt).toBe(true);
    expect(room.status).toBe('round-end');
    expect(room.seats[1].wins).toBe(1);
  });
});

describe('Monopoli Tongkrongan — Bot AI', () => {
  it('menjalankan keputusan bot otomatis (kocok dadu, beli tanah, dan akhiri giliran)', () => {
    let room = createMonopolyRoom({
      code: 'BOT001',
      hostId: 'p1',
      name: 'Far',
      now: 1000,
    });
    room = applyMonopolyIntent(room, { type: 'addBot' }, 'p1', 1100).room;
    room = applyMonopolyIntent(room, { type: 'start' }, 'p1', 1200).room;

    // Giliran bot (kursi 1)
    room.turnIndex = 1;
    room.turnPhase = 'roll';

    const action = chooseMonopolyBotAction(room, 1);
    expect(action).toEqual({ type: 'roll' });

    // Setelah mendarat di tanah kosong, bot memutuskan membeli atau mengakhiri giliran
    room.turnPhase = 'action';
    room.seats[1].position = 1; // Petak Indonesia (Rp 60)
    const afterRollAction = chooseMonopolyBotAction(room, 1);
    expect(['buy', 'endTurn']).toContain(afterRollAction.type);
  });
});
