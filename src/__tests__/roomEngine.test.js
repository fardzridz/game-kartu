import { beforeEach, describe, expect, it } from 'vitest';
import { applyIntent, auditCards, avatarTakenBy, canStartRound, createRoom, dealDurationMs, firstFreeAvatar, MAX_SEATS, normalizeAvatar, AVATARS } from '../engine/roomEngine.js';
import { countTableCards, expectedDeckTotal } from '../engine/gameRules.js';

const NOW = 1_700_000_000_000;
const base = () => createRoom({ code: 'ABC123', hostId: 'host', name: 'Host', now: NOW });
const act = (room, intent, actor = 'host', now = NOW) => applyIntent(room, intent, actor, now);

describe('waiting room (spec §2.1)', () => {
  beforeEach(() => {});
  it('host duduk sendiri dan siap; tombol mulai terkunci di bawah 2 pemain', () => {
    const room = base();
    expect(canStartRound(room)).toBe(false);
    const joined = act(room, { type: 'sit', name: 'Tamu', avatar: 'jake' }, 'guest1').room;
    expect(joined.seats).toHaveLength(2);
    expect(joined.seats[1].ready).toBe(false);
    expect(canStartRound(joined)).toBe(false);
  });
  it('pemain bisa SIAP, host mulai, dan maksimal 8 kursi', () => {
    let room = act(base(), { type: 'sit', name: 'Tamu' }, 'g1').room;
    room = act(room, { type: 'ready', value: true }, 'g1').room;
    expect(canStartRound(room)).toBe(true);
    for (let i = 2; i < MAX_SEATS + 2; i += 1) {
      const result = act(room, { type: 'sit', name: `X${i}` }, `x${i}`);
      room = result.room || room;
    }
    expect(room.seats).toHaveLength(MAX_SEATS);
    expect(act(room, { type: 'sit', name: 'Ke-9' }, 'x9').error).toBeTruthy();
  });
  it('hanya host boleh mulai; gagal bila belum ada 2 SIAP', () => {
    const room = act(base(), { type: 'sit', name: 'Tamu' }, 'g1').room;
    expect(act(room, { type: 'start' }, 'g1').error).toBeTruthy();
    expect(act(room, { type: 'start' }, 'host').error).toBeTruthy();
    const ready = act(room, { type: 'ready', value: true }, 'g1').room;
    const started = act(ready, { type: 'start' }, 'host');
    expect(started.error).toBeUndefined();
    expect(started.room.status).toBe('playing');
    expect(started.room.game.players).toHaveLength(2);
    expect(started.room.round).toBe(1);
  });
});

describe('avatar eksklusif (satu potret = satu pemain)', () => {
  const sitRoom = () => act(base(), { type: 'sit', name: 'Tamu', avatar: 'jake' }, 'g1').room;

  it('avatar yang sudah dipakai pemain lain ditolak engine', () => {
    const room = sitRoom();
    const result = act(room, { type: 'sit', name: 'Peniru', avatar: 'jake' }, 'g2');
    expect(result.error).toMatch(/sudah dipakai/i);
  });

  it('avatar bebas tetap bisa dipakai', () => {
    const room = act(sitRoom(), { type: 'sit', name: 'Tiga', avatar: 'bmo' }, 'g2').room;
    expect(room.seats.find(seat => seat.id === 'g2').avatar).toBe('bmo');
  });

  it('avatar yang dipakai bot juga terkunci', () => {
    const room = act(base(), { type: 'add-bot' }, 'host').room;
    const botAvatar = room.seats.find(seat => seat.bot).avatar;
    expect(avatarTakenBy(room, botAvatar, 'g1')?.bot).toBe(true);
  });

  it('ganti avatar ke milik orang lain ditolak, avatar sendiri boleh diulang', () => {
    const room = sitRoom();
    expect(act(room, { type: 'sit', name: 'Tamu', avatar: 'finn' }, 'g1').error).toMatch(/sudah dipakai/i);
    expect(act(room, { type: 'sit', name: 'Tamu', avatar: 'jake' }, 'g1').error).toBeUndefined();
  });

  it('pemain boleh menukar ke avatar yang sedang bebas', () => {
    const room = act(sitRoom(), { type: 'sit', name: 'Tamu', avatar: 'gunter' }, 'g1').room;
    expect(room.seats.find(seat => seat.id === 'g1').avatar).toBe('gunter');
  });

  it('firstFreeAvatar & normalizeAvatar (emoji lama) bekerja', () => {
    const room = sitRoom();
    expect(firstFreeAvatar(room, 'g1')).not.toBe('finn');
    expect(firstFreeAvatar(room, 'g1')).toBe('jake');
    expect(AVATARS).toContain(firstFreeAvatar(room, 'g1'));
    expect(firstFreeAvatar(room, 'g1')).toBeTruthy();
    expect(normalizeAvatar('🦊')).toBe(AVATARS[3]);
    expect(normalizeAvatar('bmo')).toBe('bmo');
  });
});

describe('ceremony & turn lock (spec §2.3, §4.1)', () => {
  it('dealing block: aksi kartu ditolak selama pembagian berlangsung', () => {
    let room = act(base(), { type: 'sit', name: 'Tamu' }, 'g1').room;
    room = act(room, { type: 'ready', value: true }, 'g1').room;
    room = act(room, { type: 'start' }, 'host').room;
    expect(room.game.dealingUntil).toBeGreaterThan(NOW);
    expect(dealDurationMs(2)).toBeGreaterThan(3000);
    expect(act(room, { type: 'draw' }, 'host').error).toBe('Pembagian kartu belum selesai.');
    expect(act(room, { type: 'discard', uid: room.game.players[0].hand[0].uid }, 'host').error).toBe('Pembagian kartu belum selesai.');
    const after = act(room, { type: 'draw' }, 'host', room.game.dealingUntil + 1);
    expect(after.error).toBeUndefined();
    expect(after.room.game.players[0].hand).toHaveLength(7);
    expect(after.room.game.phase).toBe('play');
  });
  it('TURN LOCK: pemain di luar giliran tidak bisa minum/buang/turun', () => {
    let room = act(base(), { type: 'sit', name: 'Tamu' }, 'g1').room;
    room = act(room, { type: 'ready', value: true }, 'g1').room;
    room = act(room, { type: 'start' }, 'host', NOW).room;
    const afterDeal = room.game.dealingUntil + 1;
    expect(act(room, { type: 'draw' }, 'g1', afterDeal).error).toBe('Bukan giliran mengambil kartu.');
    room = act(room, { type: 'draw' }, 'host', afterDeal).room;
    // Acak kartu bisa membuat kartu terakhir tangan host adalah As (tidak boleh
    // dibuang), jadi pilih kartu yang pasti legal agar test tidak flaky.
    const hand = room.game.players[0].hand;
    const cardUid = (hand.find(card => String(card.value) !== 'A') || hand[hand.length - 1]).uid;
    expect(act(room, { type: 'discard', uid: cardUid }, 'g1', afterDeal).error).toBe('Bukan giliranmu untuk membuang kartu.');
    expect(act(room, { type: 'draw' }, 'host', afterDeal).error).toBe('Bukan giliran mengambil kartu.');
    expect(act(room, { type: 'discard', uid: cardUid }, 'host', afterDeal).error).toBeUndefined();
  });
  it('pengocok ronde berikutnya adalah pemain dengan skor terendah', () => {
    let room = act(base(), { type: 'sit', name: 'Tamu' }, 'g1').room;
    room = act(room, { type: 'ready', value: true }, 'g1').room;
    room = act(room, { type: 'start' }, 'host').room;
    // Keadaan dangkal: tamu tinggal 1 kartu dan sedang pada gilirannya.
    room = {
      ...room,
      game: {
        ...room.game,
        turn: 1,
        phase: 'play',
        players: room.game.players.map((p, i) => (i === 1 ? { ...p, hand: p.hand.slice(0, 1) } : p)),
      },
    };
    // Acak kartu bisa membuat kartu terakhir adalah As (tidak boleh dibuang
    // tanpa kombinasi) — pilih kartu non-As agar test tidak flaky.
    const hand1 = room.game.players[1].hand;
    const lastCard = (hand1.find(card => String(card.value) !== 'A') || hand1[hand1.length - 1]).uid;
    const close = act(room, { type: 'discard', uid: lastCard }, 'g1', room.game.dealingUntil + 1);
    expect(close.error).toBeUndefined();
    room = close.room;
    expect(room.status).toBe('round-end');
    expect(room.pendingWinnerId).toBe('g1');
    room = act(room, { type: 'ready', value: true }, 'host').room;
    room = act(room, { type: 'ready', value: true }, 'g1').room;
    const next = act(room, { type: 'start' }, 'host').room;
    expect(next.round).toBe(2);
    // g1 menutup ronde sehingga skornya positif; host (skor terendah) mengocok.
    const lowest = [...next.seats].reduce((low, seat) => (seat.score < low.score ? seat : low), next.seats[0]);
    expect(next.shufflerId).toBe(lowest.id);
    expect(next.game.players[next.game.turn].id).toBe(lowest.id);
  });
  it('lanjut ronde: Host saja yang memulai, tamu cukup SIAP; poin & identitas tetap', () => {
    let room = act(base(), { type: 'sit', name: 'Tamu', avatar: 'jake' }, 'g1').room;
    room = act(room, { type: 'ready', value: true }, 'g1').room;
    room = act(room, { type: 'start' }, 'host').room;
    room = {
      ...room,
      status: 'round-end',
      seats: room.seats.map((seat, i) => ({ ...seat, ready: false, score: i === 0 ? 35 : -20 })),
      pendingWinnerId: 'host',
      rev: room.rev + 1,
    };
    // Ganti nama & avatar setelah ronde selesai — tetap boleh, poin utuh.
    room = act(room, { type: 'sit', name: 'Tamu Baru', avatar: 'marceline' }, 'g1').room;
    expect(room.seats[1].score).toBe(-20);
    expect(room.seats[1].name).toBe('Tamu Baru');
    // Tamu TIDAK bisa melanjutkan ronde: wewenang Host — dia mungkin masih
    // mengganti nama/avatarnya. Tamu cukup menekan SIAP.
    const denied = act(room, { type: 'next-round' }, 'g1');
    expect(denied.error).toBe('Hanya Host yang bisa melanjutkan ronde. Tekan SIAP kalau sudah siap.');
    // Host menekan MULAI saat tamu belum SIAP → ditolak, nama pemain disebut.
    const blocked = act(room, { type: 'next-round' }, 'host');
    expect(blocked.error).toBe('Masih menunggu SIAP: Tamu Baru.');
    // Tamu selesai ganti identitas lalu SIAP → baru ronde berjalan.
    room = act(room, { type: 'ready', value: true }, 'g1').room;
    const next = act(room, { type: 'next-round' }, 'host').room;
    expect(next.status).toBe('playing');
    expect(next.round).toBe(room.round + 1);
    expect(next.seats.map(seat => seat.score)).toEqual([35, -20]);
    expect(next.seats[1].name).toBe('Tamu Baru');
    expect(next.seats[1].avatar).toBe('marceline');
    const early = act(base(), { type: 'next-round' }, 'host');
    expect(early.error).toBe('Ronde belum selesai.');
  });
  it('pemain AFK/offline tidak menahan ronde berikutnya (host tetap satu-satunya pemicu)', () => {
    let room = act(base(), { type: 'sit', name: 'Tamu', avatar: 'jake' }, 'g1').room;
    room = act(room, { type: 'ready', value: true }, 'g1').room;
    room = act(room, { type: 'start' }, 'host').room;
    room = { ...room, status: 'round-end', seats: room.seats.map(seat => ({ ...seat, ready: false })), rev: room.rev + 1 };
    // tamu offline setelah ronde: tidak bisa SIAP sendiri
    room = act(room, { type: 'offline' }, 'g1').room;
    // host tetap bisa melanjutkan — kursi tamu otomatis di-SIAP-kan (dijalanin bot)
    const next = act(room, { type: 'next-round' }, 'host').room;
    expect(next.status).toBe('playing');
  });
});

describe('AFK, bot takeover & reclaim (spec §4.2)', () => {
  const startTwo = () => {
    let room = act(base(), { type: 'sit', name: 'Tamu' }, 'g1').room;
    room = act(room, { type: 'ready', value: true }, 'g1').room;
    return act(room, { type: 'start' }, 'host').room;
  };
  it('bot hanya berjalan untuk kursi bot/AFK; kursi hidup ditolak', () => {
    const room = startTwo();
    expect(act(room, { type: 'bot' }, 'host', room.game.dealingUntil + 1).error).toBe('Kursi itu masih dikendalikan pemainnya.');
  });
  it('timeout menjalankan bot pengganti dan menandai kursi AFK', () => {
    let room = startTwo();
    const late = room.lastActionAt + room.turnSeconds * 1000 + 1;
    const result = act(room, { type: 'timeout' }, 'host', late);
    expect(result.error).toBeUndefined();
    room = result.room;
    expect(room.game.turn).toBe(1);
    expect(room.seats.find(seat => seat.id === 'host').afk).toBe(true);
    // tombol reclaim bisa dipakai lagi
    const back = act(room, { type: 'reclaim' }, 'host', late).room;
    expect(back.seats.find(seat => seat.id === 'host').afk).toBe(false);
  });
  it('bot kursi AI bermain penuh dan giliran berpindah atau menutup', () => {
    let room = act(base(), { type: 'add-bot' }, 'host').room;
    room = act(room, { type: 'start' }, 'host').room;
    // Geser giliran ke kursi bot (kursi 1) secara dangkal, lalu jalankan bot.
    room = { ...room, game: { ...room.game, turn: 1 } };
    const after = act(room, { type: 'bot' }, 'host', room.game.dealingUntil + 1);
    expect(after.error).toBeUndefined();
    const advanced = after.room.game.turn === 0 || after.room.status === 'round-end';
    expect(advanced).toBe(true);
    const botHand = after.room.game.players[1].hand.length;
    expect(botHand).toBeGreaterThanOrEqual(0);
    expect(botHand).toBeLessThanOrEqual(7);
  });
  it('bot pengganti kursi AFK tidak membuang As tanpa kombinasi', () => {
    const room = startTwo();
    const afterDeal = room.game.dealingUntil + 1;
    const scripted = {
      ...room,
      game: {
        ...room.game,
        turn: 0,
        phase: 'play',
        players: room.game.players.map((p, i) => (i === 0
          ? { ...p, hand: [{ value: 'A', suit: '♣', uid: 'ac', kind: 'standard' }, { value: 9, suit: '♦', uid: 'h9', kind: 'standard' }], melds: [] }
          : p)),
      },
      seats: room.seats.map(seat => (seat.id === 'host' ? { ...seat, afk: true, online: false } : seat)),
    };
    const out = act(scripted, { type: 'bot' }, 'g1', afterDeal);
    expect(out.error).toBeUndefined();
    expect(out.room.game.players[0].hand.map(card => card.uid)).toContain('ac');
    expect(out.room.game.discardPile.map(card => card.uid)).not.toContain('ac');
    expect(out.room.game.discardPile.map(card => card.uid)).toContain('h9');
  });
  it('bot pengganti kursi AFK mencatat penalti Joker yang dibuangnya', () => {
    const room = startTwo();
    const afterDeal = room.game.dealingUntil + 1;
    const scripted = {
      ...room,
      game: {
        ...room.game,
        turn: 0,
        phase: 'play',
        players: room.game.players.map((p, i) => (i === 0
          ? { ...p, hand: [{ value: 'JOKER', suit: null, uid: 'jx', kind: 'joker' }, { value: 9, suit: '♦', uid: 'h9', kind: 'standard' }], melds: [] }
          : p)),
      },
      seats: room.seats.map(seat => (seat.id === 'host' ? { ...seat, afk: true, online: false } : seat)),
    };
    const out = act(scripted, { type: 'bot' }, 'g1', afterDeal);
    expect(out.error).toBeUndefined();
    expect(out.room.game.discardPile.map(card => card.uid)).toContain('jx');
    expect(out.room.game.players[0].discardedJokers).toBe(1);
  });
});

describe('audit kartu (spec §1.2)', () => {
  it('total kartu idle = 0 dan selalu pas setelah ronde dimulai', () => {
    const idle = auditCards(base());
    expect(idle.idle).toBe(true);
    let room = act(base(), { type: 'sit', name: 'Tamu' }, 'g1').room;
    room = act(room, { type: 'ready', value: true }, 'g1').room;
    room = act(room, { type: 'start' }, 'host').room;
    const audit = auditCards(room);
    expect(audit.ok).toBe(true);
    expect(audit.total).toBe(expectedDeckTotal(2));
    expect(countTableCards(room.game)).toBe(audit.expected);
  });
});
