import { describe, it, expect } from 'vitest';
import {
  applyBantingIntent,
  bantingActions,
  createBantingRoom,
  starterFromThrees,
} from '../banting/bantingEngine.js';
import {
  canBeat,
  createDeck,
  deckSetsFor,
  describeCombo,
  rankValue,
} from '../banting/hands.js';

const card = (value, suit = '♠') => ({ uid: `${value}${suit}`, suit, value, kind: 'standard' });
const combo = cards => describeCombo(cards.map(item => card(...item)));

function tableOf(count = 4, now = 1000) {
  let room = createBantingRoom({ code: 'BNT001', hostId: 'p0', name: 'Pemain 0', now });
  for (let index = 1; index < count; index += 1) {
    room = applyBantingIntent(room, { type: 'sit', name: `Pemain ${index}` }, `p${index}`, now).room;
    room = applyBantingIntent(room, { type: 'ready', ready: true }, `p${index}`, now).room;
  }
  return room;
}

/** Selesaikan fase pembukaan: pemegang kartu 3 menyetor, yang tidak punya lewat. */
function completeOpening(room, now = 1500) {
  let next = room;
  for (let guard = 0; guard < 24 && next.hand.phase === 'opening'; guard += 1) {
    const pending = (next.hand.players || [])
      .find(player => !(next.hand.openingConfirmed || []).includes(player.id));
    if (!pending) break;
    const has3 = (pending.hand || []).some(item => item.value === '3');
    const out = applyBantingIntent(next, has3 ? { type: 'showThrees' } : { type: 'passThrees' }, pending.id, now);
    if (out.error) break;
    next = out.room;
  }
  return next;
}

function started(count = 4, now = 1000, { opening = true } = {}) {
  const room = tableOf(count, now);
  const result = applyBantingIntent(room, { type: 'start' }, 'p0', now);
  expect(result.error).toBeUndefined();
  return opening ? completeOpening(result.room, now + 100) : result.room;
}

/** Atur ulang tangan & giliran supaya skenarionya pasti. */
function staged(handsBySeat, turnSeat, now = 2000) {
  const room = started(handsBySeat.length, now);
  const hand = room.hand;
  handsBySeat.forEach((cards, index) => {
    hand.players[index].hand = cards.map(([value, suit]) => card(value, suit));
  });
  hand.turnSeat = hand.players[turnSeat].seat;
  hand.lastPlay = null;
  hand.passed = [];
  return room;
}

describe('kombinasi poker banting', () => {
  it('2 paling tinggi, 3 paling rendah', () => {
    expect(rankValue('2')).toBeGreaterThan(rankValue('A'));
    expect(rankValue('A')).toBeGreaterThan(rankValue('K'));
    expect(rankValue('3')).toBeLessThan(rankValue('4'));
  });

  it('mengenali semua kombinasi sah', () => {
    expect(combo([['9', '♠']]).type).toBe('single');
    expect(combo([['9', '♠'], ['9', '♥']]).type).toBe('pair');
    expect(combo([['7', '♠'], ['7', '♥'], ['7', '♦']]).type).toBe('trips');
    expect(combo([['J', '♠'], ['J', '♥'], ['4', '♦'], ['4', '♣']]).type).toBe('two-pair');
    expect(combo([['9', '♣'], ['8', '♦'], ['7', '♠'], ['6', '♥'], ['5', '♣']]).type).toBe('straight');
    expect(combo([['A', '♥'], ['J', '♥'], ['8', '♥'], ['5', '♥'], ['2', '♥']]).type).toBe('flush');
    expect(combo([['Q', '♠'], ['Q', '♥'], ['Q', '♦'], ['8', '♣'], ['8', '♠']]).type).toBe('full-house');
    expect(combo([['K', '♠'], ['K', '♥'], ['K', '♦'], ['K', '♣']]).type).toBe('quads');
    expect(combo([['9', '♥'], ['8', '♥'], ['7', '♥'], ['6', '♥'], ['5', '♥']]).type).toBe('straight-flush');
    expect(combo([['A', '♠'], ['K', '♠'], ['Q', '♠'], ['J', '♠'], ['10', '♠']]).type).toBe('royal');
  });

  it('menolak kombinasi tidak sah', () => {
    expect(combo([['9', '♠'], ['8', '♠']])).toBeNull();
    expect(combo([['9', '♠'], ['9', '♥'], ['8', '♦'], ['8', '♣']]).type).toBe('two-pair');
    expect(combo([['9', '♠'], ['8', '♥'], ['7', '♦'], ['6', '♣'], ['4', '♠']])).toBeNull();
  });

  it('straight mengikuti urutan Capsa (J-Q-K-A-2 tertinggi)', () => {
    const highest = combo([['J', '♣'], ['Q', '♦'], ['K', '♠'], ['A', '♥'], ['2', '♣']]);
    const lowest = combo([['3', '♣'], ['4', '♦'], ['5', '♠'], ['6', '♥'], ['7', '♣']]);
    expect(highest.type).toBe('straight');
    expect(lowest.type).toBe('straight');
    expect(canBeat(highest, lowest).ok).toBe(true);
    expect(canBeat(lowest, highest).ok).toBe(false);
  });

  it('menimpa harus lebih tinggi, nilai sama ditolak', () => {
    const pair9 = combo([['9', '♠'], ['9', '♥']]);
    const pair9lagi = combo([['9', '♦'], ['9', '♣']]);
    const pair10 = combo([['10', '♠'], ['10', '♥']]);
    expect(canBeat(pair10, pair9).ok).toBe(true);
    expect(canBeat(pair9lagi, pair9).ok).toBe(false);
    expect(canBeat(pair9, pair10).ok).toBe(false);
  });

  it('jumlah kartu harus sama', () => {
    const single = combo([['A', '♠']]);
    const pair = combo([['K', '♠'], ['K', '♥']]);
    expect(canBeat(pair, single).ok).toBe(false);
  });

  it('lima kartu: kategori lebih tinggi menang (aturan Capsa)', () => {
    const straight = combo([['9', '♣'], ['8', '♦'], ['7', '♠'], ['6', '♥'], ['5', '♣']]);
    const flush = combo([['A', '♥'], ['J', '♥'], ['8', '♥'], ['5', '♥'], ['3', '♥']]);
    const fullHouse = combo([['4', '♠'], ['4', '♥'], ['4', '♦'], ['3', '♣'], ['3', '♠']]);
    expect(canBeat(flush, straight).ok).toBe(true);
    expect(canBeat(fullHouse, flush).ok).toBe(true);
    expect(canBeat(straight, flush).ok).toBe(false);
    // Kalau aturan meja dimatikan: jenis harus sama.
    expect(canBeat(flush, straight, { fiveAnyCategory: false }).ok).toBe(false);
  });

  it('kartu tunggal: nilai sama tidak bisa menimpa (kembang tidak menolong)', () => {
    const spade9 = combo([['9', '♠']]);
    const heart9 = combo([['9', '♥']]);
    const diamond10 = combo([['10', '♦']]);
    expect(canBeat(spade9, heart9).ok).toBe(false);
    expect(canBeat(heart9, spade9).ok).toBe(false);
    expect(canBeat(diamond10, spade9).ok).toBe(true);
  });

  it('lima kartu berisi empat kartu sama + kicker tidak sah', () => {
    expect(combo([['9', '♠'], ['9', '♥'], ['9', '♦'], ['9', '♣'], ['K', '♥']])).toBeNull();
  });

  it('empat sejenis menimpa straight/flush/full house, tapi bukan dua pasang', () => {
    const quads9 = combo([['9', '♠'], ['9', '♥'], ['9', '♦'], ['9', '♣']]);
    const quads10 = combo([['10', '♠'], ['10', '♥'], ['10', '♦'], ['10', '♣']]);
    const straight = combo([['8', '♣'], ['7', '♦'], ['6', '♠'], ['5', '♥'], ['4', '♣']]);
    const flush = combo([['A', '♥'], ['J', '♥'], ['8', '♥'], ['5', '♥'], ['3', '♥']]);
    const fullHouse = combo([['Q', '♠'], ['Q', '♥'], ['Q', '♦'], ['8', '♣'], ['8', '♠']]);
    const twoPair = combo([['J', '♠'], ['J', '♥'], ['4', '♦'], ['4', '♣']]);
    const straightFlush = combo([['9', '♥'], ['8', '♥'], ['7', '♥'], ['6', '♥'], ['5', '♥']]);

    expect(canBeat(quads9, straight).ok).toBe(true);
    expect(canBeat(quads9, flush).ok).toBe(true);
    expect(canBeat(quads9, fullHouse).ok).toBe(true);
    expect(canBeat(quads9, twoPair).ok).toBe(false);
    expect(canBeat(quads10, quads9).ok).toBe(true);
    expect(canBeat(quads9, quads10).ok).toBe(false);
    expect(canBeat(straightFlush, quads9).ok).toBe(true);
    expect(canBeat(quads9, straightFlush).ok).toBe(false);
  });

  it('dua pasang hanya dilawan dua pasang yang lebih tinggi', () => {
    const twoPairJ = combo([['J', '♠'], ['J', '♥'], ['4', '♦'], ['4', '♣']]);
    const twoPairQ = combo([['Q', '♠'], ['Q', '♥'], ['3', '♦'], ['3', '♣']]);
    const twoPairJ2 = combo([['J', '♠'], ['J', '♥'], ['5', '♦'], ['5', '♣']]);
    const trips = combo([['K', '♠'], ['K', '♥'], ['K', '♦']]);
    expect(canBeat(twoPairQ, twoPairJ).ok).toBe(true);
    expect(canBeat(twoPairJ2, twoPairJ).ok).toBe(true);
    expect(canBeat(twoPairJ, twoPairQ).ok).toBe(false);
    expect(canBeat(trips, twoPairJ).ok).toBe(false);
  });
});

describe('dek & pembagian', () => {
  it('satu set 52 kartu, dua set 104', () => {
    expect(createDeck(1)).toHaveLength(52);
    expect(createDeck(2)).toHaveLength(104);
  });

  it('set kartu: 1 set per 4 pemain', () => {
    expect(deckSetsFor(2, 'auto')).toBe(1);
    expect(deckSetsFor(4, 'auto')).toBe(1);
    expect(deckSetsFor(5, 'auto')).toBe(2);
    expect(deckSetsFor(8, 'auto')).toBe(2);
    expect(deckSetsFor(6, '1')).toBe(1);
  });

  it('game baru mulai di fase pembukaan: kartu 3 masih di tangan', () => {
    const room = started(4, 1000, { opening: false });
    const hand = room.hand;
    expect(hand.phase).toBe('opening');
    expect(hand.turnSeat).toBe(-1);
    // Belum ada yang keluar otomatis.
    expect(hand.opening).toEqual([]);
    expect(hand.players.some(player => player.hand.some(item => item.value === '3'))).toBe(true);
    const total = hand.players.reduce((sum, player) => sum + player.hand.length, 0);
    expect(total).toBe(52);
  });

  it('pemain mengeluarkan kartu 3 sendiri, lalu pembuka ditentukan', () => {
    let room = started(4, 1000, { opening: false });
    const holder = room.hand.players.find(player => player.hand.some(item => item.value === '3'));
    expect(holder).toBeTruthy();

    room = applyBantingIntent(room, { type: 'showThrees' }, holder.id, 1200).room;
    const entry = room.hand.opening.find(item => item.id === holder.id);
    expect(entry.cards.every(card => card.value === '3')).toBe(true);
    expect(room.hand.players.find(player => player.id === holder.id).hand.some(c => c.value === '3')).toBe(false);
    // Masih menunggu pemegang 3 lain.
    expect(room.hand.phase).toBe('opening');

    room = completeOpening(room, 1300);
    expect(room.hand.phase).toBe('play');
    expect(room.hand.turnSeat).toBeGreaterThanOrEqual(0);
    const total = room.hand.players.reduce((sum, player) => sum + player.hand.length, 0);
    expect(total).toBe(48); // 52 - 4 kartu 3
    expect(room.hand.log.some(line => line.includes('membuka'))).toBe(true);
  });

  it('pemain tanpa kartu 3 tidak bisa memakai showThrees', () => {
    const room = started(4, 1000, { opening: false });
    const clean = room.hand.players.find(player => !player.hand.some(item => item.value === '3'));
    if (clean) {
      const result = applyBantingIntent(room, { type: 'showThrees' }, clean.id, 1200);
      expect(result.error).toMatch(/tidak pegang/i);
    }
    expect(true).toBe(true);
  });

  it('waktu pembukaan habis → kartu 3 dikeluarkan otomatis', () => {
    const room = started(4, 1000, { opening: false });
    const deadline = room.hand.deadline;
    const early = applyBantingIntent(room, { type: 'tick' }, 'p0', deadline - 1);
    expect(early.error).toMatch(/belum/i);
    const late = applyBantingIntent(room, { type: 'tick' }, 'p0', deadline + 1).room;
    expect(late.hand.phase).toBe('play');
    expect(late.hand.players.every(player => player.hand.every(item => item.value !== '3'))).toBe(true);
  });

  it('pembuka = 3 terbanyak, kalau sama pakai kembang tertinggi', () => {
    const players = [
      { hand: [card('3', '♦'), card('7', '♠')] },
      { hand: [card('3', '♠'), card('3', '♥'), card('8', '♦')] },
      { hand: [card('3', '♣'), card('9', '♠')] },
    ];
    expect(starterFromThrees(players)).toMatchObject({ index: 1, count: 2 });

    const tie = [
      { hand: [card('3', '♦')] },
      { hand: [card('3', '♣')] },
      { hand: [card('3', '♠')] },
    ];
    expect(starterFromThrees(tie)).toMatchObject({ index: 2, count: 1, topSuit: 4 });

    expect(starterFromThrees([{ hand: [card('9', '♠')] }])).toBeNull();
  });

  it('meja 5 pemain memakai 2 set', () => {
    const room = started(5);
    expect(room.hand.sets).toBe(2);
    const total = room.hand.players.reduce((sum, player) => sum + player.hand.length, 0);
    expect(total).toBe(96); // 104 - 8 kartu 3 (2 set)
  });
});

describe('alur permainan', () => {
  it('main kartu memindahkan giliran dan mencatat kombinasi terakhir', () => {
    let room = staged([[['9', '♠'], ['9', '♥'], ['3', '♣']], [['10', '♠'], ['4', '♦'], ['5', '♦']]], 0);
    const result = applyBantingIntent(room, { type: 'play', cards: ['9♠', '9♥'] }, 'p0', 2100);
    expect(result.error).toBeUndefined();
    room = result.room;
    expect(room.hand.lastPlay.combo.type).toBe('pair');
    expect(room.hand.players[0].hand).toHaveLength(1);
    expect(room.hand.turnSeat).toBe(room.hand.players[1].seat);
  });

  it('menolak kombinasi yang lebih rendah', () => {
    let room = staged([[['J', '♠'], ['J', '♥'], ['3', '♣']], [['10', '♠'], ['10', '♦'], ['4', '♦']]], 0);
    room = applyBantingIntent(room, { type: 'play', cards: ['J♠', 'J♥'] }, 'p0', 2100).room;
    const result = applyBantingIntent(room, { type: 'play', cards: ['10♠', '10♦'] }, 'p1', 2200);
    expect(result.error).toMatch(/lebih tinggi/i);
  });

  it('skip berputar balik jadi ronde baru oleh pemain terakhir', () => {
    let room = staged([
      [['9', '♠'], ['9', '♥'], ['3', '♣']],
      [['4', '♠'], ['5', '♦'], ['6', '♦']],
      [['7', '♠'], ['8', '♦'], ['10', '♦']],
    ], 0);
    room = applyBantingIntent(room, { type: 'play', cards: ['9♠', '9♥'] }, 'p0', 2100).room;
    const seat1 = room.hand.players[1].seat;
    const seat2 = room.hand.players[2].seat;
    expect(room.hand.turnSeat).toBe(seat1);

    room = applyBantingIntent(room, { type: 'skip' }, 'p1', 2200).room;
    expect(room.hand.turnSeat).toBe(seat2);
    room = applyBantingIntent(room, { type: 'skip' }, 'p2', 2300).room;

    // Semua skip → kembali ke p0, dan ronde baru (tidak ada kombinasi terakhir).
    expect(room.hand.turnSeat).toBe(room.hand.players[0].seat);
    expect(room.hand.lastPlay).toBeNull();
  });

  it('pemain yang skip keluar dari ronde — tidak dapat giliran walau ada yang menimpa', () => {
    let room = staged([
      [['9', '♠'], ['9', '♥'], ['3', '♣']],
      [['K', '♠'], ['K', '♥'], ['4', '♦']],
      [['J', '♠'], ['J', '♥'], ['5', '♦'], ['6', '♣']],
    ], 0);
    const seat0 = room.hand.players[0].seat;
    const seat1 = room.hand.players[1].seat;
    const seat2 = room.hand.players[2].seat;

    room = applyBantingIntent(room, { type: 'play', cards: ['9♠', '9♥'] }, 'p0', 2100).room;
    room = applyBantingIntent(room, { type: 'skip' }, 'p1', 2200).room;
    expect(room.hand.passed).toContain('p1');

    // p2 menimpa dengan pair J — p1 TIDAK ikut dapat giliran lagi.
    room = applyBantingIntent(room, { type: 'play', cards: ['J♠', 'J♥'] }, 'p2', 2300).room;
    expect(room.hand.turnSeat).toBe(seat0);
    expect(room.hand.passed).toContain('p1');

    // p0 juga lewat → tidak ada lagi yang bisa menimpa, ronde baru oleh p2.
    room = applyBantingIntent(room, { type: 'skip' }, 'p0', 2350).room;
    expect(room.hand.turnSeat).toBe(seat2);
    expect(room.hand.lastPlay).toBeNull();
    expect(room.hand.passed).toEqual([]);

    // Ronde baru: p2 buka (sisa kartunya 5♦), giliran berputar normal lagi
    // dan p1 yang tadi lewat sekarang boleh ikut.
    room = applyBantingIntent(room, { type: 'play', cards: ['5♦'] }, 'p2', 2400).room;
    expect(room.hand.turnSeat).toBe(seat0);
    room = applyBantingIntent(room, { type: 'skip' }, 'p0', 2450).room;
    expect(room.hand.turnSeat).toBe(seat1);
    const result = applyBantingIntent(room, { type: 'play', cards: ['K♠'] }, 'p1', 2500);
    expect(result.error).toBeUndefined();
  });

  it('pemain yang sudah lewat tidak bisa menaruh kartu di ronde yang sama', () => {
    let room = staged([
      [['9', '♠'], ['9', '♥'], ['3', '♣']],
      [['K', '♠'], ['K', '♥'], ['4', '♦']],
      [['J', '♠'], ['J', '♥'], ['5', '♦']],
    ], 0);
    room = applyBantingIntent(room, { type: 'play', cards: ['9♠', '9♥'] }, 'p0', 2100).room;
    room = applyBantingIntent(room, { type: 'skip' }, 'p1', 2200).room;
    // Bukan giliran p1 lagi (dia sudah lewat), jadi aksinya ditolak.
    const result = applyBantingIntent(room, { type: 'play', cards: ['K♠', 'K♥'] }, 'p1', 2300);
    expect(result.error).toMatch(/giliran/i);
  });

  it('tidak boleh skip saat membuka ronde', () => {
    const room = staged([[['9', '♠'], ['3', '♣']], [['10', '♠'], ['4', '♦']]], 0);
    const result = applyBantingIntent(room, { type: 'skip' }, 'p0', 2100);
    expect(result.error).toMatch(/buka ronde/i);
  });

  it('kartu 2 (tertinggi) langsung melanjutkan permainan oleh penaruhnya', () => {
    const seat0 = 0;
    let room = staged([
      [['2', '♠'], ['9', '♠'], ['8', '♠']],
      [['A', '♠'], ['4', '♦']],
      [['K', '♠'], ['5', '♦']],
    ], 0);
    room = applyBantingIntent(room, { type: 'play', cards: ['2♠'] }, 'p0', 2100).room;
    // Tidak ada yang bisa menimpa → ronde baru, dia yang buka lagi.
    expect(room.hand.lastPlay).toBeNull();
    expect(room.hand.turnSeat).toBe(room.hand.players[seat0].seat);
    expect(room.hand.passed).toEqual([]);
  });

  it('pair 2 dan two pair berpasangan 2 juga langsung lanjut', () => {
    let room = staged([
      [['2', '♠'], ['2', '♥'], ['9', '♠']],
      [['A', '♠'], ['4', '♦']],
    ], 0);
    room = applyBantingIntent(room, { type: 'play', cards: ['2♠', '2♥'] }, 'p0', 2100).room;
    expect(room.hand.lastPlay).toBeNull();
    expect(room.hand.turnSeat).toBe(room.hand.players[0].seat);

    let room2 = staged([
      [['2', '♠'], ['2', '♥'], ['5', '♦'], ['5', '♣'], ['9', '♠']],
      [['A', '♠'], ['4', '♦']],
    ], 0);
    room2 = applyBantingIntent(room2, { type: 'play', cards: ['2♠', '2♥', '5♦', '5♣'] }, 'p0', 2100).room;
    expect(room2.hand.lastPlay).toBeNull();
    expect(room2.hand.turnSeat).toBe(room2.hand.players[0].seat);
  });

  it('kombinasi biasa tetap menunggu lawan (tidak auto lanjut)', () => {
    let room = staged([
      [['9', '♠'], ['9', '♥'], ['8', '♠']],
      [['A', '♠'], ['4', '♦']],
    ], 0);
    room = applyBantingIntent(room, { type: 'play', cards: ['9♠', '9♥'] }, 'p0', 2100).room;
    expect(room.hand.lastPlay).not.toBeNull();
    expect(room.hand.turnSeat).toBe(room.hand.players[1].seat);
  });

  it('pemain habis kartu: kartu terakhirnya tetap jadi acuan (ronde tidak reset)', () => {
    let room = staged([
      [['9', '♠']],
      [['K', '♠'], ['4', '♦']],
      [['J', '♠'], ['5', '♦']],
    ], 0);
    const seat1 = room.hand.players[1].seat;
    room = applyBantingIntent(room, { type: 'play', cards: ['9♠'] }, 'p0', 2100).room;

    // p0 habis kartu, tapi permainan jalan terus di atas kartu 9♠.
    expect(room.status).toBe('playing');
    expect(room.hand.lastPlay).not.toBeNull();
    expect(room.hand.lastPlay.playerId).toBe('p0');
    expect(room.hand.turnSeat).toBe(seat1);
    expect(room.hand.players[0].finished).toBe(true);
  });

  it('semua lewat di atas kartu pemenang → ronde baru dibuka pemain berikutnya', () => {
    let room = staged([
      [['9', '♠']],
      [['K', '♠'], ['4', '♦']],
      [['J', '♠'], ['5', '♦']],
    ], 0);
    const seat1 = room.hand.players[1].seat;
    room = applyBantingIntent(room, { type: 'play', cards: ['9♠'] }, 'p0', 2100).room;
    room = applyBantingIntent(room, { type: 'skip' }, 'p1', 2200).room;
    room = applyBantingIntent(room, { type: 'skip' }, 'p2', 2300).room;

    // p0 sudah keluar (habis kartu) → ronde baru dibuka pemain berikutnya.
    expect(room.hand.lastPlay).toBeNull();
    expect(room.hand.passed).toEqual([]);
    expect(room.hand.turnSeat).toBe(seat1);
    expect(room.status).toBe('playing');
  });

  it('game berikutnya dibuka oleh pemenang game sebelumnya', () => {
    let room = staged([[['9', '♠']], [['10', '♠'], ['4', '♦']]], 0);
    const seat0 = room.hand.players[0].seat;
    room = applyBantingIntent(room, { type: 'play', cards: ['9♠'] }, 'p0', 2100).room;
    expect(room.status).toBe('round-end');
    expect(room.lastResult.winnerId).toBe('p0');

    room = applyBantingIntent(room, { type: 'next' }, 'p0', 3000).room;
    expect(room.hand.no).toBe(2);
    expect(room.hand.turnSeat).toBe(seat0);
    // Game berikutnya tidak membuang kartu 3 lagi.
    const total = room.hand.players.reduce((sum, player) => sum + player.hand.length, 0);
    expect(total).toBe(52);
  });

  it('pemain yang habis kartunya menang, yang tersisa kalah', () => {
    let room = staged([[['9', '♠']], [['10', '♠'], ['4', '♦']]], 0);
    const result = applyBantingIntent(room, { type: 'play', cards: ['9♠'] }, 'p0', 2100);
    expect(result.error).toBeUndefined();
    room = result.room;
    expect(room.status).toBe('round-end');
    expect(room.lastResult.winnerId).toBe('p0');
    expect(room.lastResult.loserId).toBe('p1');
    expect(room.seats.find(seat => seat.id === 'p0').wins).toBe(1);
    expect(room.seats.find(seat => seat.id === 'p1').losses).toBe(1);
  });

  it('waktu habis saat menimpa → otomatis skip', () => {
    let room = staged([[['9', '♠'], ['9', '♥'], ['3', '♣']], [['4', '♠'], ['5', '♦'], ['6', '♦']]], 0);
    room = applyBantingIntent(room, { type: 'play', cards: ['9♠', '9♥'] }, 'p0', 2100).room;
    const early = applyBantingIntent(room, { type: 'tick' }, 'p0', room.hand.deadline - 1);
    expect(early.error).toMatch(/belum/i);
    const late = applyBantingIntent(room, { type: 'tick' }, 'p0', room.hand.deadline + 1);
    expect(late.error).toBeUndefined();
    expect(late.room.hand.lastPlay).toBeNull();
  });

  it('waktu habis saat membuka ronde → buang kartu terendah', () => {
    const room = staged([[['A', '♠'], ['3', '♣']], [['10', '♠'], ['4', '♦']]], 0);
    const late = applyBantingIntent(room, { type: 'tick' }, 'p0', room.hand.deadline + 1);
    expect(late.error).toBeUndefined();
    expect(late.room.hand.lastPlay.combo.type).toBe('single');
    expect(late.room.hand.lastPlay.cards[0].value).toBe('3');
  });

  it('bantingActions melaporkan status giliran', () => {
    const room = staged([[['9', '♠'], ['3', '♣']], [['10', '♠'], ['4', '♦']]], 0);
    const mine = bantingActions(room, 'p0');
    expect(mine.isTurn).toBe(true);
    expect(mine.mustLead).toBe(true);
    expect(mine.canSkip).toBe(false);
    expect(bantingActions(room, 'p1').isTurn).toBe(false);
  });

  it('fase setor kartu 3: pemain tanpa kartu 3 bisa passThrees, penentu kembang tertinggi', () => {
    let room = tableOf(3, 1000);
    room = applyBantingIntent(room, { type: 'start' }, 'p0', 1000).room;
    expect(room.hand.phase).toBe('opening');

    // Stage kartu tangan: p0 punya 3♠, p1 punya 3♦, p2 tidak punya kartu 3
    room.hand.players[0].hand = [card('3', '♠'), card('K', '♠')];
    room.hand.players[1].hand = [card('3', '♦'), card('Q', '♦')];
    room.hand.players[2].hand = [card('4', '♠'), card('5', '♠')];

    // p2 coba setor 3 padahal tidak punya -> ditolak
    const invalidShow = applyBantingIntent(room, { type: 'showthrees' }, 'p2', 1100);
    expect(invalidShow.error).toMatch(/tidak pegang/i);

    // p0 coba lewat padahal punya 3 -> ditolak
    const invalidPass = applyBantingIntent(room, { type: 'passthrees' }, 'p0', 1100);
    expect(invalidPass.error).toMatch(/memegang kartu 3/i);

    // p0 setor 3♠
    room = applyBantingIntent(room, { type: 'showthrees' }, 'p0', 1100).room;
    expect(room.hand.phase).toBe('opening');
    expect(room.hand.openingConfirmed).toContain('p0');

    // p2 konfirmasi tidak punya 3 (lewat)
    room = applyBantingIntent(room, { type: 'passthrees' }, 'p2', 1150).room;
    expect(room.hand.phase).toBe('opening');

    // p1 setor 3♦ -> semua selesai konfirmasi, penentuan pembuka jalan
    room = applyBantingIntent(room, { type: 'showthrees' }, 'p1', 1200).room;
    expect(room.hand.phase).toBe('play');
    // 3♠ (p0) mengalahkan 3♦ (p1) karena kembang sekop lebih tinggi dari wajik
    expect(room.hand.turnSeat).toBe(room.hand.players[0].seat);
    // Kartu 3 sudah disingkirkan dari tangan
    expect(room.hand.players[0].hand.some(c => c.value === '3')).toBe(false);
    expect(room.hand.players[1].hand.some(c => c.value === '3')).toBe(false);
  });

  it('kartu 2 sakti sebagai kartu terakhir pemenang -> langsung reset ronde ke pemain berikutnya', () => {
    let room = staged([
      [['2', '♠']], // p0 cuma punya 2♠ (kartu sakti terakhir)
      [['K', '♠'], ['Q', '♠']], // p1
      [['J', '♠'], ['10', '♠']], // p2
    ], 0);

    const seat1 = room.hand.players[1].seat;
    room = applyBantingIntent(room, { type: 'play', cards: ['2♠'] }, 'p0', 2100).room;

    // p0 langsung menang (kartu habis)
    expect(room.hand.players[0].finished).toBe(true);
    // Karena kartu 2 sakti, pemain lain TIDAK perlu menimpa/skip; meja langsung reset ronde baru
    expect(room.hand.lastPlay).toBeNull();
    expect(room.hand.prevPlay.cards[0].value).toBe('2');
    // Giliran buka ronde baru langsung jatuh ke pemain berikutnya (p1)
    expect(room.hand.turnSeat).toBe(seat1);
    expect(room.hand.passed).toEqual([]);
  });

  it('hard lock skip: pemain yang sudah skip dikunci dari sisa ronde dan isTurn false', () => {
    let room = staged([
      [['9', '♠'], ['8', '♠']],
      [['10', '♠'], ['7', '♠']],
      [['J', '♠'], ['6', '♠']],
    ], 0);

    // p0 buka dengan 9♠
    room = applyBantingIntent(room, { type: 'play', cards: ['9♠'] }, 'p0', 2100).room;
    // p1 skip
    room = applyBantingIntent(room, { type: 'skip' }, 'p1', 2200).room;
    expect(room.hand.passed).toContain('p1');

    // bantingActions untuk p1 harus terkunci total
    const p1Actions = bantingActions(room, 'p1');
    expect(p1Actions.hasPassed).toBe(true);
    expect(p1Actions.isTurn).toBe(false);
    expect(p1Actions.canSkip).toBe(false);

    // p2 menimpa dengan J♠
    room = applyBantingIntent(room, { type: 'play', cards: ['J♠'] }, 'p2', 2300).room;
    // Giliran kembali ke p0, BUKAN p1 yang sudah skip!
    expect(room.hand.turnSeat).toBe(room.hand.players[0].seat);
  });

  it('intent toLobby mengembalikan status ke lobby dan mereset status ready', () => {
    let room = staged([[['9', '♠']], [['4', '♠']]], 0);
    // Selesaikan game
    room = applyBantingIntent(room, { type: 'play', cards: ['9♠'] }, 'p0', 2100).room;
    expect(room.status).toBe('round-end');

    // toLobby
    const out = applyBantingIntent(room, { type: 'toLobby' }, 'p0', 2200);
    expect(out.error).toBeUndefined();
    expect(out.room.status).toBe('lobby');
    expect(out.room.hand).toBeNull();
    // Host tetap siap
    expect(out.room.seats.find(s => s.id === 'p0').ready).toBe(true);
  });
});
