import { describe, expect, it } from 'vitest';
import {
  CHESS_MAX_SEATS,
  CHESS_MAX_SPECTATORS,
  applyChessIntent,
  boardSquaresFromFen,
  chessActions,
  createChessRoom,
  evaluateMaterial,
  findKingSquare,
  legalMovesFromSquare,
} from '../chess/chessEngine.js';
import { chooseChessBotMove, shouldBotAcceptDraw } from '../chess/chessBots.js';

describe('Catur BAWASLU — Kursi Pemain (2) & Mode Penonton (Spectator)', () => {
  it('mendudukkan 2 pemain pertama di kursi Putih & Hitam dan otomatis memasukkan pemain ke-3..10 sebagai Penonton', () => {
    let room = createChessRoom({
      code: 'CATUR1',
      hostId: 'p1',
      name: 'Far',
      avatar: 'finn',
      now: 1000,
    });
    expect(room.seats).toHaveLength(1);
    expect(room.spectators).toHaveLength(0);

    // Pemain ke-2 masuk sebagai pemain Hitam
    let res = applyChessIntent(room, { type: 'sit', name: 'Raten', avatar: 'jake' }, 'p2', 1100);
    expect(res.error).toBeUndefined();
    room = res.room;
    expect(room.seats).toHaveLength(CHESS_MAX_SEATS);

    // Pemain ke-3 otomatis masuk sebagai Penonton karena kursi duel 2/2 sudah penuh
    res = applyChessIntent(room, { type: 'sit', name: 'Penonton 1', avatar: 'bmo' }, 's1', 1200);
    expect(res.error).toBeUndefined();
    room = res.room;
    expect(room.seats).toHaveLength(2);
    expect(room.spectators).toHaveLength(1);
    expect(room.spectators[0].name).toBe('Penonton 1');

    // Tambah penonton sampai penuh (16 penonton)
    for (let i = 2; i <= CHESS_MAX_SPECTATORS; i += 1) {
      res = applyChessIntent(room, { type: 'sit', name: `Penonton ${i}` }, `s${i}`, 1200 + i);
      expect(res.error).toBeUndefined();
      room = res.room;
    }
    expect(room.spectators).toHaveLength(CHESS_MAX_SPECTATORS);

    const overflow = applyChessIntent(room, { type: 'sit', name: 'Penonton Overflow' }, 's_over', 2000);
    expect(overflow.error).toMatch(/penuh/i);
  });

  it('mengizinkan perpindahan antara kursi pemain dan bangku penonton serta tukar warna di lobby', () => {
    let room = createChessRoom({ code: 'CATUR2', hostId: 'p1', name: 'Far', now: 1000 });
    room = applyChessIntent(room, { type: 'sit', name: 'Raten' }, 'p2', 1100).room;
    room = applyChessIntent(room, { type: 'sit', name: 'Budi', asSpectator: true }, 's1', 1200).room;

    // Host menukar posisi Putih & Hitam
    room = applyChessIntent(room, { type: 'swapSeats' }, 'p1', 1250).room;
    expect(room.seats[0].id).toBe('p2');
    expect(room.seats[1].id).toBe('p1');

    // p2 pindah ke bangku penonton
    room = applyChessIntent(room, { type: 'spectate' }, 'p2', 1300).room;
    expect(room.seats).toHaveLength(1);
    expect(room.spectators).toHaveLength(2);

    // Penonton s1 maju ke kursi pemain yang kosong
    room = applyChessIntent(room, { type: 'takePlayerSeat' }, 's1', 1400).room;
    expect(room.seats).toHaveLength(2);
    expect(room.seats[1].id).toBe('s1');
  });
});

describe('Catur BAWASLU — Aturan Resmi FIDE via chess.js (Skakmat, Promosi, Remis)', () => {
  function setupMatch(settings = {}) {
    let room = createChessRoom({
      code: 'MATCH1',
      hostId: 'wPlayer',
      name: 'Putih',
      settings: { turnSeconds: 60, clockMinutes: 0, ...settings },
      now: 1000,
    });
    room = applyChessIntent(room, { type: 'sit', name: 'Hitam' }, 'bPlayer', 1100).room;
    room = applyChessIntent(room, { type: 'ready', ready: true }, 'bPlayer', 1200).room;
    room = applyChessIntent(room, { type: 'start' }, 'wPlayer', 1500).room;
    return room;
  }

  it('menjalankan langkah legal, menolak langkah ilegal/penonton, dan mendeteksi Fool’s Mate (Skakmat)', () => {
    let room = setupMatch();
    expect(room.status).toBe('playing');
    expect(room.match.whiteId).toBe('wPlayer');
    expect(room.match.blackId).toBe('bPlayer');

    // Penonton tidak boleh melangkah
    room = applyChessIntent(room, { type: 'sit', name: 'Nonton' }, 'spec1', 1550).room;
    const specMove = applyChessIntent(room, { type: 'move', from: 'e2', to: 'e4' }, 'spec1', 1600);
    expect(specMove.error).toMatch(/penonton/i);

    // Hitam tidak boleh jalan di giliran Putih
    const wrongTurn = applyChessIntent(room, { type: 'move', from: 'e7', to: 'e5' }, 'bPlayer', 1600);
    expect(wrongTurn.error).toMatch(/giliran/i);

    // Langkah ilegal (pion lompat 3 petak)
    const illegal = applyChessIntent(room, { type: 'move', from: 'e2', to: 'e5' }, 'wPlayer', 1600);
    expect(illegal.error).toMatch(/tidak sah/i);

    // Urutan Fool's Mate: 1. f3 e5 2. g4 Qh4#
    room = applyChessIntent(room, { type: 'move', from: 'f2', to: 'f3' }, 'wPlayer', 2000).room;
    room = applyChessIntent(room, { type: 'move', from: 'e7', to: 'e5' }, 'bPlayer', 3000).room;
    room = applyChessIntent(room, { type: 'move', from: 'g2', to: 'g4' }, 'wPlayer', 4000).room;
    room = applyChessIntent(room, { type: 'move', from: 'd8', to: 'h4' }, 'bPlayer', 5000).room;

    expect(room.status).toBe('round-end');
    expect(room.match.phase).toBe('ended');
    expect(room.match.inCheck).toBe(true);
    expect(room.match.result.reason).toBe('checkmate');
    expect(room.match.result.winnerId).toBe('bPlayer');
    expect(findKingSquare(room.match.fen, 'w')).toBe('e1');

    const blackSeat = room.seats.find(s => s.id === 'bPlayer');
    const whiteSeat = room.seats.find(s => s.id === 'wPlayer');
    expect(blackSeat.wins).toBe(1);
    expect(whiteSeat.losses).toBe(1);

    // Babak ke-2 otomatis menukar pemegang warna Putih & Hitam
    room = applyChessIntent(room, { type: 'next' }, 'wPlayer', 6000).room;
    expect(room.status).toBe('playing');
    expect(room.matchNo).toBe(2);
    expect(room.match.whiteId).toBe('bPlayer');
    expect(room.match.blackId).toBe('wPlayer');
  });

  it('mendukung tawar/terima remis, menyerah, serta promosi pion', () => {
    let room = setupMatch();

    // Tawar remis & tolak
    room = applyChessIntent(room, { type: 'offerDraw' }, 'wPlayer', 2000).room;
    expect(room.match.drawOfferBy).toBe('wPlayer');
    expect(chessActions(room, 'bPlayer').canAcceptDraw).toBe(true);

    room = applyChessIntent(room, { type: 'declineDraw' }, 'bPlayer', 2200).room;
    expect(room.match.drawOfferBy).toBeNull();

    // Tawar remis & terima
    room = applyChessIntent(room, { type: 'offerDraw' }, 'bPlayer', 2500).room;
    room = applyChessIntent(room, { type: 'acceptDraw' }, 'wPlayer', 2800).room;
    expect(room.status).toBe('round-end');
    expect(room.match.result.reason).toBe('agreement');
    expect(room.seats[0].draws).toBe(1);
    expect(room.seats[1].draws).toBe(1);

    // Uji promosi pion langsung dari posisi FEN mendekati baris 8
    room = applyChessIntent(room, { type: 'next' }, 'wPlayer', 3000).room;
    room.match.fen = '4k3/P7/8/8/8/8/8/4K3 w - - 0 1';
    room.match.whiteId = 'wPlayer';
    room.match.blackId = 'bPlayer';
    room.match.turn = 'w';

    const promoMoves = legalMovesFromSquare(room.match.fen, 'a7');
    expect(promoMoves.some(m => m.promotion === 'q')).toBe(true);

    room = applyChessIntent(
      room,
      { type: 'move', from: 'a7', to: 'a8', promotion: 'q' },
      'wPlayer',
      3500,
    ).room;
    expect(room.match.lastMove.san).toContain('=Q');
    expect(evaluateMaterial(room.match.fen).diff).toBe(9);
    expect(boardSquaresFromFen(room.match.fen)[0][0].piece).toEqual({ type: 'q', color: 'w' });
  });

  it('mengurangi jam Blitz dan memenangkan lawan saat waktu total habis', () => {
    let room = setupMatch({ clockMinutes: 3, turnSeconds: 60 });
    expect(room.match.whiteMs).toBe(180000);

    // Putih melangkah setelah 15 detik
    room = applyChessIntent(room, { type: 'move', from: 'e2', to: 'e4' }, 'wPlayer', 16500).room;
    expect(room.match.whiteMs).toBe(165000);

    // Hitam kehabisan seluruh jam Blitz (lewat 3 menit)
    room.match.deadline = 196500;
    room = applyChessIntent(room, { type: 'tick' }, 'wPlayer', 200000).room;
    expect(room.status).toBe('round-end');
    expect(room.match.result.reason).toBe('timeout');
    expect(room.match.result.winnerId).toBe('wPlayer');
  });
});

describe('Catur BAWASLU — Bot AI (Minimax + Evaluasi Posisi)', () => {
  it('memilih langkah skakmat langsung (Mate in 1) dan bermain sah di semua level', () => {
    let room = createChessRoom({
      code: 'BOT001',
      hostId: 'p1',
      name: 'Far',
      settings: { turnSeconds: 60, clockMinutes: 0, botLevel: 'sulit' },
      now: 1000,
    });
    room = applyChessIntent(room, { type: 'addBot' }, 'p1', 1100).room;
    room = applyChessIntent(room, { type: 'start' }, 'p1', 1200).room;

    // Posisi Mate in 1 untuk Putih (Qh5, Bc4 menyerang f7)
    room.match.fen = 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';
    room.match.turn = 'w';

    const mateMove = chooseChessBotMove(room, 'sedang');
    expect(mateMove).toEqual({
      type: 'move',
      from: 'h5',
      to: 'f7',
      promotion: 'q',
    });

    // Evaluasi penerimaan remis oleh bot ketika bot tertinggal jauh secara materi
    room.match.fen = '4k3/8/8/8/8/8/PPPPPPPP/RNBQKBNR b KQ - 0 1';
    room.match.drawOfferBy = room.match.whiteId;
    expect(shouldBotAcceptDraw(room)).toBe(true);
  });
});

describe('Catur BAWASLU — Mode Turnamen Cup Sistem Gugur (3..32 Pemain)', () => {
  it('membangun bagan 8 besar untuk 6 pemain (2 dapat tiket BYE dan 4 bertanding serentak)', () => {
    let room = createChessRoom({
      code: 'CUP006',
      hostId: 'p1',
      name: 'Far',
      settings: { mode: 'cup', cupFillBots: false, turnSeconds: 60 },
      now: 1000,
    });

    // Tambah 5 pemain manusia (total 6 pemain tongkrongan)
    for (let i = 2; i <= 6; i += 1) {
      room = applyChessIntent(room, { type: 'sit', name: `Teman ${i}` }, `p${i}`, 1000 + i).room;
      room = applyChessIntent(room, { type: 'ready', ready: true }, `p${i}`, 1100 + i).room;
    }
    expect(room.seats).toHaveLength(6);

    // Host memulai Turnamen Cup
    room = applyChessIntent(room, { type: 'start' }, 'p1', 2000).room;
    expect(room.status).toBe('playing');
    expect(room.cup).not.toBeNull();
    expect(room.cup.bracketSize).toBe(8);
    expect(room.cup.totalRounds).toBe(3); // 8 Besar -> 4 Besar (Semi) -> Final
    expect(room.cup.currentRound).toBe(1);

    const round1 = room.cup.rounds[0];
    expect(round1.matches).toHaveLength(4);

    // Sebanyak 8 - 6 = 2 pemain beruntung mendapat status BYE
    const byes = round1.matches.filter(m => m.status === 'bye');
    const playing = round1.matches.filter(m => m.status === 'playing');
    expect(byes).toHaveLength(2);
    expect(playing).toHaveLength(2);

    // Pemain BYE otomatis masuk sebagai pemenang partai tersebut
    expect(byes[0].winnerId).not.toBeNull();
    expect(byes[1].winnerId).not.toBeNull();

    // Babak 2 (Semifinal) terisi oleh pemenang BYE pada slotnya
    const semiRound = room.cup.rounds[1];
    expect(semiRound.matches[0].whiteId).toBe(byes[0].winnerId);
    expect(semiRound.matches[0].blackId).toBe(byes[1].winnerId);
  });

  it('menggenapkan slot bagan dengan Bot AI bila cupFillBots dinyalakan', () => {
    let room = createChessRoom({
      code: 'CUPBOT',
      hostId: 'p1',
      name: 'Far',
      settings: { mode: 'cup', cupFillBots: true, turnSeconds: 60 },
      now: 1000,
    });
    for (let i = 2; i <= 6; i += 1) {
      room = applyChessIntent(room, { type: 'sit', name: `Teman ${i}` }, `p${i}`, 1000 + i).room;
      room = applyChessIntent(room, { type: 'ready', ready: true }, `p${i}`, 1100 + i).room;
    }

    room = applyChessIntent(room, { type: 'start' }, 'p1', 2000).room;
    expect(room.cup.bracketSize).toBe(8);
    // 6 manusia + 2 bot penggenap = 8 kursi full
    expect(room.seats).toHaveLength(8);
    const round1 = room.cup.rounds[0];
    expect(round1.matches.filter(m => m.status === 'playing')).toHaveLength(4);
    expect(round1.matches.filter(m => m.status === 'bye')).toHaveLength(0);
  });

  it('menyelesaikan babak, meloloskan pemenang ke babak berikutnya, dan menobatkan Juara Cup di Final', () => {
    let room = createChessRoom({
      code: 'CUPFIN',
      hostId: 'p1',
      name: 'Pemain 1',
      settings: { mode: 'cup', turnSeconds: 60 },
      now: 1000,
    });
    for (let i = 2; i <= 4; i += 1) {
      room = applyChessIntent(room, { type: 'sit', name: `Pemain ${i}` }, `p${i}`, 1000 + i).room;
      room = applyChessIntent(room, { type: 'ready', ready: true }, `p${i}`, 1100 + i).room;
    }
    // 4 pemain: Semifinal (2 partai) -> Final (1 partai)
    room = applyChessIntent(room, { type: 'start' }, 'p1', 2000).room;
    expect(room.cup.totalRounds).toBe(2);
    expect(room.cup.currentRound).toBe(1);

    const r1m1 = room.cup.rounds[0].matches[0];
    const r1m2 = room.cup.rounds[0].matches[1];

    // Partai 1: Putih menyerah -> Hitam lolos
    room = applyChessIntent({ ...room }, { type: 'resign', matchId: r1m1.id }, r1m1.whiteId, 2500).room;
    expect(room.cup.rounds[0].matches[0].status).toBe('done');
    expect(room.cup.rounds[0].matches[0].winnerId).toBe(r1m1.blackId);

    // Partai 2: Hitam menyerah -> Putih lolos
    room = applyChessIntent({ ...room }, { type: 'resign', matchId: r1m2.id }, r1m2.blackId, 3000).room;
    expect(room.cup.rounds[0].matches[1].status).toBe('done');

    // Karena semua partai Babak 1 selesai, otomatis maju ke Babak 2 (Final)
    expect(room.cup.currentRound).toBe(2);
    const finalMatch = room.cup.rounds[1].matches[0];
    expect(finalMatch.status).toBe('playing');
    expect(finalMatch.whiteId).toBe(r1m1.blackId);
    expect(finalMatch.blackId).toBe(r1m2.whiteId);

    // Final: Hitam menyerah -> Putih menjuarai Cup!
    room = applyChessIntent({ ...room }, { type: 'resign', matchId: finalMatch.id }, finalMatch.blackId, 4000).room;
    expect(room.status).toBe('round-end');
    expect(room.cup.phase).toBe('ended');
    expect(room.cup.champion.id).toBe(finalMatch.whiteId);
    expect(room.cup.runnerUp.id).toBe(finalMatch.blackId);

    const winnerSeat = room.seats.find(s => s.id === finalMatch.whiteId);
    expect(winnerSeat.cups).toBe(1);
  });
});
