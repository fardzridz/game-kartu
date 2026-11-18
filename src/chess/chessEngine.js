/**
 * Mesin **Catur BAWASLU** (Duel 1v1 Klasik + Mode Turnamen Cup Sistem Gugur 3–32 Pemain + Penonton).
 *
 * Menggunakan `chess.js` untuk validasi langkah 100% sesuai aturan resmi FIDE
 * (skak, skakmat, remis/stalemate, rokade/castling, promosi pion, en passant,
 * repetisi 3 kali, materi tidak cukup, aturan 50 langkah).
 *
 * Dua mode permainan:
 * 1. **Duel 1v1 (`mode: '1v1'`)**: 2 Kursi Pemain (Putih vs Hitam) + hingga 8 Penonton.
 * 2. **Turnamen Cup (`mode: 'cup'`)**: 3 hingga 32 Peserta dalam satu bagan sistem gugur
 *    (Knockout Bracket 4 / 8 / 16 / 32). Mendukung jumlah pemain bebas (misal 6, 8, 10, 16+):
 *    - Bila jumlah peserta bukan pangkat 2 (misal 6 orang di bagan 8), otomatis diberikan
 *      **BYE** kepada unggulan yang diundi deterministik (atau diisi Bot AI bila `cupFillBots: true`).
 *    - Semua pertandingan di satu babak berjalan **serentak (multi-meja paralel)**.
 *    - Peserta yang dapat BYE / sudah selesai duluan / penonton bebas berpindah meja
 *      untuk menonton pertandingan teman secara live dan melempar ejekan/stiker.
 */
import { Chess } from 'chess.js';
import { chooseChessBotMove, evaluateMaterial, shouldBotAcceptDraw } from './chessBots.js';

export const CHESS_MAX_SEATS = 2;
export const CHESS_CUP_MIN_SEATS = 3;
export const CHESS_CUP_MAX_SEATS = 32;
export const CHESS_MAX_SPECTATORS = 16;

export const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const CHESS_SETTINGS_DEFAULT = {
  mode: '1v1', // '1v1' | 'cup'
  cupFillBots: false, // true = genapkan slot bagan kosong dengan Bot AI (tanpa BYE)
  turnSeconds: 60,
  clockMinutes: 0, // 0 = turn timer saja, 3 = Blitz 3m, 5 = Blitz 5m, 10 = Rapid 10m
  botLevel: 'sedang', // 'mudah' | 'sedang' | 'sulit'
};

export const CHESS_MODE_OPTIONS = [
  { id: '1v1', label: 'Duel 1v1 Klasik (2 Pemain + Penonton)' },
  { id: 'cup', label: 'Turnamen Cup / Sistem Gugur (3–32 Pemain)' },
];

export const TURN_OPTIONS = [30, 45, 60, 90, 120];

export const CLOCK_OPTIONS = [
  { id: 0, label: 'Turn Timer Saja (Tanpa Jam Total)' },
  { id: 3, label: 'Blitz 3 Menit / Pemain' },
  { id: 5, label: 'Blitz 5 Menit / Pemain' },
  { id: 10, label: 'Rapid 10 Menit / Pemain' },
];

export const BOT_LEVEL_OPTIONS = [
  { id: 'mudah', label: 'Santai (Mudah)' },
  { id: 'sedang', label: 'Standar (Sedang)' },
  { id: 'sulit', label: 'Master Tongkrongan (Sulit)' },
];

const PIECE_ORDER = { q: 5, r: 4, b: 3, n: 2, p: 1, k: 0 };

const BOT_NAMES_POOL = [
  'Bot Grandmaster',
  'Bot Kuda Lumping',
  'Bot Benteng Takeshi',
  'Bot Pion Sakti',
  'Bot Gajah Mada',
  'Bot Menteri Galak',
  'Bot Skakmat',
  'Bot Rokade',
  'Bot Gambit',
  'Bot Kasparov KW',
  'Bot Carlsen Lokal',
  'Bot Catur Cepat',
  'Bot Kuda Hitam',
  'Bot Raja Terakhir',
  'Bot Pertahanan Baja',
  'Bot Serangan Fajar',
];

const BOT_AVATARS_POOL = [
  'ice-king',
  'bmo',
  'marceline',
  'jake',
  'princess-bubblegum',
  'gunter',
  'fiona',
  'finn',
];

function sortCaptured(list = []) {
  return [...list].sort((a, b) => (PIECE_ORDER[b] || 0) - (PIECE_ORDER[a] || 0));
}

function hashSeed(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicShuffle(items, seedText) {
  let a = hashSeed(seedText);
  const random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Ukuran bagan pangkat 2 terdekat di atas atau sama dengan jumlah peserta (4, 8, 16, 32).
 */
export function bracketSizeFor(count) {
  const n = Math.max(2, Number(count) || 2);
  let size = 2;
  while (size < n && size < CHESS_CUP_MAX_SEATS) {
    size *= 2;
  }
  return size;
}

/**
 * Nama babak berdasarkan jumlah slot peserta yang tersisa di babak tersebut.
 */
export function cupRoundTitle(slotsInRound) {
  if (slotsInRound <= 2) return 'Final 🏆';
  if (slotsInRound === 4) return 'Semifinal';
  if (slotsInRound === 8) return 'Perempat Final';
  if (slotsInRound === 16) return 'Babak 16 Besar';
  if (slotsInRound === 32) return 'Babak 32 Besar';
  return `Babak ${slotsInRound} Besar`;
}

function normalizeMatchObj(rawMatch) {
  if (!rawMatch) return null;
  return {
    id: rawMatch.id || `m-${rawMatch.no || 1}`,
    no: Number(rawMatch.no) || 1,
    roundNo: Number(rawMatch.roundNo) || 1,
    slot: Number(rawMatch.slot) || 0,
    tableNo: Number(rawMatch.tableNo) || 1,
    status: rawMatch.status || (rawMatch.phase === 'ended' ? 'done' : 'playing'),
    fen: rawMatch.fen || INITIAL_FEN,
    turn: rawMatch.turn === 'b' ? 'b' : 'w',
    phase: rawMatch.phase || 'play',
    whiteId: rawMatch.whiteId || null,
    blackId: rawMatch.blackId || null,
    whiteName: rawMatch.whiteName || null,
    blackName: rawMatch.blackName || null,
    winnerId: rawMatch.winnerId || null,
    loserId: rawMatch.loserId || null,
    winnerName: rawMatch.winnerName || null,
    turnSeat: typeof rawMatch.turnSeat === 'number' ? rawMatch.turnSeat : 0,
    turnStartedAt: Number(rawMatch.turnStartedAt) || 0,
    deadline: Number(rawMatch.deadline) || 0,
    whiteMs: Number(rawMatch.whiteMs) || 0,
    blackMs: Number(rawMatch.blackMs) || 0,
    inCheck: Boolean(rawMatch.inCheck),
    drawOfferBy: rawMatch.drawOfferBy || null,
    lastMove: rawMatch.lastMove ? { ...rawMatch.lastMove } : null,
    moves: (rawMatch.moves || []).map(item => ({ ...item })),
    captured: {
      w: (rawMatch.captured?.w || []).slice(),
      b: (rawMatch.captured?.b || []).slice(),
    },
    timeouts: {
      ...(rawMatch.timeouts || {}),
    },
    result: rawMatch.result ? { ...rawMatch.result } : null,
    log: (rawMatch.log || []).slice(),
  };
}

function normalizeCupObj(rawCup) {
  if (!rawCup) return null;
  return {
    no: Number(rawCup.no) || 1,
    bracketSize: Number(rawCup.bracketSize) || 4,
    totalRounds: Number(rawCup.totalRounds) || 2,
    currentRound: Number(rawCup.currentRound) || 1,
    phase: rawCup.phase || 'play',
    participants: (rawCup.participants || []).map(p => ({ ...p })),
    rounds: (rawCup.rounds || []).map(r => ({
      roundNo: Number(r.roundNo) || 1,
      title: r.title || 'Babak Cup',
      matches: (r.matches || []).map(m => normalizeMatchObj(m)),
    })),
    champion: rawCup.champion ? { ...rawCup.champion } : null,
    runnerUp: rawCup.runnerUp ? { ...rawCup.runnerUp } : null,
    semifinalists: (rawCup.semifinalists || []).map(s => ({ ...s })),
    startedAt: Number(rawCup.startedAt) || 0,
    finishedAt: rawCup.finishedAt ? Number(rawCup.finishedAt) : null,
  };
}

export function normalizeChessRoom(raw) {
  if (!raw) return null;
  const settings = { ...CHESS_SETTINGS_DEFAULT, ...(raw.settings || {}) };
  const match = normalizeMatchObj(raw.match);
  const cup = normalizeCupObj(raw.cup);

  return {
    ...raw,
    game: 'chess',
    v: 1,
    settings: {
      mode: settings.mode === 'cup' ? 'cup' : '1v1',
      cupFillBots: Boolean(settings.cupFillBots),
      turnSeconds: Math.max(15, Math.min(180, Math.round(Number(settings.turnSeconds) || 60))),
      clockMinutes: [0, 3, 5, 10].includes(Number(settings.clockMinutes)) ? Number(settings.clockMinutes) : 0,
      botLevel: ['mudah', 'sedang', 'sulit'].includes(settings.botLevel) ? settings.botLevel : 'sedang',
    },
    status: raw.status || 'lobby',
    seats: (raw.seats || []).map(seat => ({
      ...seat,
      ready: Boolean(seat.ready),
      bot: Boolean(seat.bot),
      online: seat.online !== false,
      wins: Number(seat.wins) || 0,
      losses: Number(seat.losses) || 0,
      draws: Number(seat.draws) || 0,
      cups: Number(seat.cups) || 0,
    })),
    spectators: (raw.spectators || []).map(spec => ({
      id: spec.id,
      name: spec.name || 'Penonton',
      avatar: spec.avatar || null,
      online: spec.online !== false,
      joinedAt: Number(spec.joinedAt) || 0,
    })),
    matchNo: Number(raw.matchNo) || 0,
    match,
    cup,
    lastResult: raw.lastResult ? { ...raw.lastResult } : null,
    history: (raw.history || []).map(entry => ({ ...entry })),
    log: (raw.log || []).slice(),
    rev: Number(raw.rev) || 0,
    createdAt: Number(raw.createdAt) || 0,
    lastActionAt: Number(raw.lastActionAt) || 0,
  };
}

function cloneRoom(room) {
  return normalizeChessRoom(room);
}

function touch(room, now, note) {
  room.rev = (room.rev || 0) + 1;
  room.lastActionAt = now;
  if (note) {
    room.log = [...(room.log || []), note].slice(-40);
  }
}

function pushMatchLog(match, text) {
  match.log = [...(match.log || []), text].slice(-80);
}

function computeDeadline(room, match, activeColor, now) {
  const turnMs = (room.settings.turnSeconds || 60) * 1000;
  if ((room.settings.clockMinutes || 0) > 0) {
    const clockLeft = activeColor === 'w' ? match.whiteMs : match.blackMs;
    return now + Math.max(1000, Math.min(turnMs, clockLeft));
  }
  return now + turnMs;
}

export function maxSeatsForRoom(room) {
  return room?.settings?.mode === 'cup' ? CHESS_CUP_MAX_SEATS : CHESS_MAX_SEATS;
}

export function createChessRoom({ code, hostId, name, avatar, settings, now = Date.now() }) {
  const merged = { ...CHESS_SETTINGS_DEFAULT, ...(settings || {}) };
  const cleanName = String(name || '').trim().slice(0, 18) || 'Pemain 1';
  const isCup = merged.mode === 'cup';
  return normalizeChessRoom({
    v: 1,
    game: 'chess',
    code,
    hostId,
    status: 'lobby',
    settings: {
      mode: isCup ? 'cup' : '1v1',
      cupFillBots: Boolean(merged.cupFillBots),
      turnSeconds: Math.max(15, Math.min(180, Math.round(Number(merged.turnSeconds) || 60))),
      clockMinutes: [0, 3, 5, 10].includes(Number(merged.clockMinutes)) ? Number(merged.clockMinutes) : 0,
      botLevel: ['mudah', 'sedang', 'sulit'].includes(merged.botLevel) ? merged.botLevel : 'sedang',
    },
    seats: [{
      id: hostId,
      name: cleanName,
      avatar: avatar || 'finn',
      ready: true,
      bot: false,
      online: true,
      wins: 0,
      losses: 0,
      draws: 0,
      cups: 0,
    }],
    spectators: [],
    matchNo: 0,
    match: null,
    cup: null,
    lastResult: null,
    history: [],
    log: [
      isCup
        ? `Turnamen Cup Catur dibuka oleh ${cleanName}.`
        : `Meja duel catur dibuka oleh ${cleanName}.`,
    ],
    rev: 0,
    createdAt: now,
    lastActionAt: now,
  });
}

function createBotSeatObj(room, now, indexOffset = 0) {
  const usedNames = new Set(room.seats.map(item => item.name));
  const usedAvatars = new Set(room.seats.map(item => item.avatar));
  const name = BOT_NAMES_POOL.find(item => !usedNames.has(item))
    || `Bot Catur #${room.seats.length + 1}`;
  const avatar = BOT_AVATARS_POOL.find(item => !usedAvatars.has(item))
    || BOT_AVATARS_POOL[(room.seats.length + indexOffset) % BOT_AVATARS_POOL.length];
  return {
    id: `bot-${room.rev}-${room.seats.length + indexOffset}-${Math.floor((now + indexOffset) % 100000)}`,
    name,
    avatar,
    ready: true,
    bot: true,
    online: true,
    wins: 0,
    losses: 0,
    draws: 0,
    cups: 0,
  };
}

function buildPlayableMatch(room, { id, no, roundNo = 1, slot = 0, tableNo = 1, whiteSeat, blackSeat }, now) {
  const totalClockMs = (room.settings.clockMinutes || 0) > 0
    ? room.settings.clockMinutes * 60 * 1000
    : 0;
  const whiteSeatIndex = room.seats.findIndex(s => s.id === whiteSeat.id);
  const match = {
    id: id || `m-${no}`,
    no,
    roundNo,
    slot,
    tableNo,
    status: 'playing',
    fen: INITIAL_FEN,
    turn: 'w',
    phase: 'play',
    whiteId: whiteSeat.id,
    blackId: blackSeat.id,
    whiteName: whiteSeat.name,
    blackName: blackSeat.name,
    winnerId: null,
    loserId: null,
    winnerName: null,
    turnSeat: whiteSeatIndex >= 0 ? whiteSeatIndex : 0,
    turnStartedAt: now,
    deadline: 0,
    whiteMs: totalClockMs,
    blackMs: totalClockMs,
    inCheck: false,
    drawOfferBy: null,
    lastMove: null,
    moves: [],
    captured: { w: [], b: [] },
    timeouts: {},
    result: null,
    log: [
      `Meja #${tableNo} dimulai — Putih: ${whiteSeat.name}, Hitam: ${blackSeat.name}.`,
    ],
  };
  match.deadline = computeDeadline(room, match, 'w', now);
  return match;
}

export function startChessMatch(rawRoom, now = Date.now()) {
  const room = cloneRoom(rawRoom);
  if (room.settings.mode === 'cup') {
    return startChessCup(room, now);
  }
  if (room.seats.length < 2) {
    return { error: 'Butuh 2 pemain di kursi Putih & Hitam untuk memulai catur.' };
  }

  room.matchNo = (room.matchNo || 0) + 1;
  let whiteSeatIndex = 0;
  if (room.matchNo > 1 && room.lastResult?.whiteId) {
    const prevWhiteIdx = room.seats.findIndex(seat => seat.id === room.lastResult.whiteId);
    if (prevWhiteIdx === 0) whiteSeatIndex = 1;
    else if (prevWhiteIdx === 1) whiteSeatIndex = 0;
  }
  const blackSeatIndex = whiteSeatIndex === 0 ? 1 : 0;
  const whiteSeat = room.seats[whiteSeatIndex];
  const blackSeat = room.seats[blackSeatIndex];

  const match = buildPlayableMatch(room, {
    id: `duel-${room.matchNo}`,
    no: room.matchNo,
    roundNo: 1,
    slot: 0,
    tableNo: 1,
    whiteSeat,
    blackSeat,
  }, now);

  room.status = 'playing';
  room.match = match;
  room.cup = null;
  touch(room, now, `Babak #${room.matchNo} dimulai (${whiteSeat.name} vs ${blackSeat.name}).`);
  return { room };
}

/**
 * Bangun dan mulai Turnamen Cup Sistem Gugur (3..32 pemain).
 * Menangani jumlah pemain ganjil/bukan pangkat 2 (misal 6, 10, 12) lewat BYE otomatis
 * atau pengisian Bot AI bila `cupFillBots` dinyalakan.
 */
export function startChessCup(rawRoom, now = Date.now()) {
  const room = cloneRoom(rawRoom);
  if (room.seats.length < 2) {
    return { error: 'Butuh minimal 2 peserta untuk memulai Turnamen Cup.' };
  }

  room.matchNo = (room.matchNo || 0) + 1;
  const targetBracketSize = bracketSizeFor(room.seats.length);

  // Jika host menyalakan "Genapkan slot dengan Bot AI", isi kursi sampai pangkat 2
  if (room.settings.cupFillBots && room.seats.length < targetBracketSize) {
    const needed = targetBracketSize - room.seats.length;
    for (let i = 0; i < needed; i += 1) {
      room.seats.push(createBotSeatObj(room, now, i + 1));
    }
  }

  const bracketSize = bracketSizeFor(room.seats.length);
  const totalRounds = Math.max(1, Math.round(Math.log2(bracketSize)));
  const seedKey = `${room.code || ''}:cup:${room.matchNo}:${room.rev}:${now}`;
  const shuffledSeats = deterministicShuffle(room.seats, seedKey);

  const participants = shuffledSeats.map((seat, idx) => ({
    id: seat.id,
    name: seat.name,
    avatar: seat.avatar || 'finn',
    bot: Boolean(seat.bot),
    seed: idx + 1,
  }));

  const rounds = [];
  for (let r = 1; r <= totalRounds; r += 1) {
    const slotsInRound = bracketSize / (2 ** (r - 1));
    const matchCount = slotsInRound / 2;
    const title = cupRoundTitle(slotsInRound);
    const matches = [];
    for (let m = 0; m < matchCount; m += 1) {
      matches.push({
        id: `r${r}-m${m + 1}`,
        no: m + 1,
        roundNo: r,
        slot: m,
        tableNo: m + 1,
        status: 'waiting',
        fen: INITIAL_FEN,
        turn: 'w',
        phase: 'waiting',
        whiteId: null,
        blackId: null,
        whiteName: null,
        blackName: null,
        winnerId: null,
        loserId: null,
        winnerName: null,
        turnSeat: 0,
        turnStartedAt: 0,
        deadline: 0,
        whiteMs: 0,
        blackMs: 0,
        inCheck: false,
        drawOfferBy: null,
        lastMove: null,
        moves: [],
        captured: { w: [], b: [] },
        timeouts: {},
        result: null,
        log: [],
      });
    }
    rounds.push({
      roundNo: r,
      title,
      matches,
    });
  }

  // Distribusi peserta ke Babak 1:
  // Jumlah partai di Babak 1 adalah M = bracketSize / 2.
  // Jumlah BYE adalah byes = bracketSize - participants.length.
  // Sebanyak `byes` partai pertama diisi 1 peserta + BYE (otomatis lolos ke Babak 2),
  // dan `M - byes` partai sisanya diisi 2 peserta yang langsung bertanding paralel!
  const firstRound = rounds[0];
  const mCount = firstRound.matches.length;
  const byesCount = bracketSize - participants.length;
  let cursor = 0;
  let tableCounter = 1;

  for (let m = 0; m < mCount; m += 1) {
    if (m < byesCount) {
      const p1 = participants[cursor];
      cursor += 1;
      firstRound.matches[m] = {
        ...firstRound.matches[m],
        tableNo: m + 1,
        status: 'bye',
        phase: 'ended',
        whiteId: p1.id,
        whiteName: p1.name,
        blackId: null,
        blackName: 'BYE (Lolos Otomatis)',
        winnerId: p1.id,
        winnerName: p1.name,
        result: {
          matchNo: m + 1,
          winnerId: p1.id,
          winnerName: p1.name,
          reason: 'bye',
          label: `${p1.name} mendapat BYE dan langsung lolos ke babak berikutnya.`,
          movesCount: 0,
          at: now,
        },
        log: [`${p1.name} mendapat BYE.`],
      };
    } else {
      const p1 = participants[cursor];
      const p2 = participants[cursor + 1];
      cursor += 2;
      firstRound.matches[m] = buildPlayableMatch(room, {
        id: `r1-m${m + 1}`,
        no: m + 1,
        roundNo: 1,
        slot: m,
        tableNo: tableCounter,
        whiteSeat: p1,
        blackSeat: p2,
      }, now);
      tableCounter += 1;
    }
  }

  const cup = {
    no: room.matchNo,
    bracketSize,
    totalRounds,
    currentRound: 1,
    phase: 'play',
    participants,
    rounds,
    champion: null,
    runnerUp: null,
    semifinalists: [],
    startedAt: now,
    finishedAt: null,
  };

  // Salurkan pemenang BYE dari Babak 1 ke slot Babak 2
  propagateCupWinners(room, cup, 1, now);
  advanceCupRoundIfComplete(room, cup, now);

  room.status = cup.phase === 'ended' ? 'round-end' : 'playing';
  room.cup = cup;
  room.match = firstActiveCupMatch(cup) || firstRound.matches[0] || null;
  room.lastResult = null;

  touch(
    room,
    now,
    `Turnamen Cup #${room.matchNo} dimulai (${participants.length} peserta, Bagan ${bracketSize} Besar${byesCount > 0 ? `, ${byesCount} BYE` : ''}).`,
  );
  return { room };
}

function firstActiveCupMatch(cup) {
  if (!cup) return null;
  const activeRound = cup.rounds.find(r => r.roundNo === cup.currentRound) || cup.rounds[0];
  if (!activeRound) return null;
  return activeRound.matches.find(m => m.status === 'playing')
    || activeRound.matches.find(m => m.status === 'done')
    || activeRound.matches[0]
    || null;
}

/**
 * Cari partai di Turnamen Cup berdasarkan `matchId` atau kursi pemain yang sedang bertanding.
 */
export function findCupMatchForActor(room, playerId, matchId = null) {
  const cup = room?.cup;
  if (!cup) return null;
  if (matchId) {
    for (const round of cup.rounds) {
      const found = round.matches.find(m => m.id === matchId);
      if (found) return found;
    }
  }
  const currentRoundObj = cup.rounds.find(r => r.roundNo === cup.currentRound);
  if (currentRoundObj) {
    const myMatch = currentRoundObj.matches.find(
      m => m.status === 'playing' && (m.whiteId === playerId || m.blackId === playerId),
    );
    if (myMatch) return myMatch;
  }
  for (const round of cup.rounds) {
    const anyPlaying = round.matches.find(
      m => m.status === 'playing' && (m.whiteId === playerId || m.blackId === playerId),
    );
    if (anyPlaying) return anyPlaying;
  }
  return null;
}

/**
 * Daftar semua partai yang sedang aktif (`status === 'playing'`) di seluruh meja.
 */
export function getActivePlayingMatches(room) {
  if (!room || room.status !== 'playing') return [];
  if (room.settings.mode === 'cup' && room.cup) {
    const round = room.cup.rounds.find(r => r.roundNo === room.cup.currentRound);
    if (!round) return [];
    return round.matches.filter(m => m.status === 'playing' && m.phase === 'play');
  }
  if (room.match && room.match.phase === 'play') {
    return [room.match];
  }
  return [];
}

function propagateCupWinners(room, cup, roundNo, now) {
  if (roundNo >= cup.totalRounds) return;
  const currentRoundObj = cup.rounds.find(r => r.roundNo === roundNo);
  const nextRoundObj = cup.rounds.find(r => r.roundNo === roundNo + 1);
  if (!currentRoundObj || !nextRoundObj) return;

  for (let i = 0; i < currentRoundObj.matches.length; i += 1) {
    const m = currentRoundObj.matches[i];
    if (!m.winnerId) continue;
    const nextMatchIndex = Math.floor(i / 2);
    const isTopSlot = i % 2 === 0;
    const target = nextRoundObj.matches[nextMatchIndex];
    if (!target) continue;

    const winnerSeat = room.seats.find(s => s.id === m.winnerId)
      || cup.participants.find(p => p.id === m.winnerId);
    const winnerName = winnerSeat?.name || m.winnerName || 'Pemain';

    if (isTopSlot) {
      target.whiteId = m.winnerId;
      target.whiteName = winnerName;
    } else {
      target.blackId = m.winnerId;
      target.blackName = winnerName;
    }

    // Jika kedua slot di partai babak berikutnya sudah terisi dan babak ini sudah aktif/siap
    if (target.whiteId && target.blackId && target.status === 'waiting' && cup.currentRound === roundNo + 1) {
      const wSeat = room.seats.find(s => s.id === target.whiteId) || { id: target.whiteId, name: target.whiteName };
      const bSeat = room.seats.find(s => s.id === target.blackId) || { id: target.blackId, name: target.blackName };
      nextRoundObj.matches[nextMatchIndex] = buildPlayableMatch(room, {
        id: target.id,
        no: target.no,
        roundNo: roundNo + 1,
        slot: nextMatchIndex,
        tableNo: nextMatchIndex + 1,
        whiteSeat: wSeat,
        blackSeat: bSeat,
      }, now);
    }
  }
}

function advanceCupRoundIfComplete(room, cup, now) {
  const currentRoundObj = cup.rounds.find(r => r.roundNo === cup.currentRound);
  if (!currentRoundObj) return;

  const allFinished = currentRoundObj.matches.every(m => m.status === 'done' || m.status === 'bye');
  if (!allFinished) return;

  propagateCupWinners(room, cup, cup.currentRound, now);

  // Jika ini adalah babak Final -> Turnamen selesai, nobatkan Juara Cup!
  if (cup.currentRound >= cup.totalRounds) {
    const finalMatch = currentRoundObj.matches[0];
    const champSeat = room.seats.find(s => s.id === finalMatch?.winnerId)
      || cup.participants.find(p => p.id === finalMatch?.winnerId);
    const runnerSeat = room.seats.find(s => s.id === finalMatch?.loserId)
      || cup.participants.find(p => p.id === finalMatch?.loserId);

    cup.phase = 'ended';
    cup.finishedAt = now;
    cup.champion = champSeat
      ? { id: champSeat.id, name: champSeat.name, avatar: champSeat.avatar || 'finn' }
      : { id: finalMatch?.winnerId, name: finalMatch?.winnerName || 'Juara', avatar: 'finn' };
    cup.runnerUp = runnerSeat
      ? { id: runnerSeat.id, name: runnerSeat.name, avatar: runnerSeat.avatar || 'jake' }
      : null;

    // Catat semifinalis (yang kalah di Semifinal)
    const semiRound = cup.rounds.find(r => r.roundNo === cup.totalRounds - 1);
    if (semiRound) {
      cup.semifinalists = semiRound.matches
        .filter(m => m.loserId)
        .map(m => {
          const s = room.seats.find(item => item.id === m.loserId)
            || cup.participants.find(item => item.id === m.loserId);
          return {
            id: m.loserId,
            name: s?.name || 'Semifinalis',
            avatar: s?.avatar || 'bmo',
          };
        });
    }

    for (const seat of room.seats) {
      if (seat.id === cup.champion.id) {
        seat.cups = (seat.cups || 0) + 1;
      }
    }

    const cupSummary = `🏆 ${cup.champion.name} menjuarai Turnamen Cup #${cup.no}${cup.runnerUp ? ` (mengalahkan ${cup.runnerUp.name} di Final)` : ''}!`;
    room.status = 'round-end';
    room.lastResult = {
      matchNo: cup.no,
      isCup: true,
      winnerId: cup.champion.id,
      winnerName: cup.champion.name,
      loserId: cup.runnerUp?.id || null,
      loserName: cup.runnerUp?.name || null,
      whiteId: finalMatch?.whiteId,
      blackId: finalMatch?.blackId,
      whiteName: finalMatch?.whiteName || 'Putih',
      blackName: finalMatch?.blackName || 'Hitam',
      reason: 'cup-champion',
      label: cupSummary,
      movesCount: finalMatch?.moves?.length || 0,
      at: now,
    };
    room.history = [
      ...(room.history || []),
      {
        no: cup.no,
        at: now,
        winner: `${cup.champion.name} (Juara Cup)`,
        loser: cup.runnerUp?.name || '-',
        isDraw: false,
        reason: 'cup-champion',
        label: cupSummary,
        moves: finalMatch?.moves?.length || 0,
      },
    ].slice(-15);

    touch(room, now, cupSummary);
    return;
  }

  // Lanjut ke babak berikutnya!
  cup.currentRound += 1;
  const nextRoundObj = cup.rounds.find(r => r.roundNo === cup.currentRound);
  if (!nextRoundObj) return;

  for (let m = 0; m < nextRoundObj.matches.length; m += 1) {
    const target = nextRoundObj.matches[m];
    if (target.whiteId && target.blackId) {
      const wSeat = room.seats.find(s => s.id === target.whiteId) || { id: target.whiteId, name: target.whiteName };
      const bSeat = room.seats.find(s => s.id === target.blackId) || { id: target.blackId, name: target.blackName };
      nextRoundObj.matches[m] = buildPlayableMatch(room, {
        id: target.id,
        no: target.no,
        roundNo: cup.currentRound,
        slot: m,
        tableNo: m + 1,
        whiteSeat: wSeat,
        blackSeat: bSeat,
      }, now);
    } else if (target.whiteId && !target.blackId) {
      target.status = 'bye';
      target.phase = 'ended';
      target.winnerId = target.whiteId;
      target.winnerName = target.whiteName;
    } else if (!target.whiteId && target.blackId) {
      target.status = 'bye';
      target.phase = 'ended';
      target.winnerId = target.blackId;
      target.winnerName = target.blackName;
    }
  }

  room.match = firstActiveCupMatch(cup);
  touch(room, now, `${nextRoundObj.title} dimulai!`);
}

/**
 * Penentu pemenang otomatis (Tie-Break) bila partai di Turnamen Cup berakhir Remis.
 * Urutan Tie-Break:
 * 1. Keunggulan poin materi bidak di papan.
 * 2. Sisa jam catur lebih banyak (bila mode Blitz/Rapid aktif).
 * 3. Pemegang bidak Hitam lolos (aturan Armageddon — Putih punya keunggulan jalan pertama).
 */
function resolveCupTieBreak(room, match) {
  const mat = evaluateMaterial(match.fen);
  let winnerColor = 'b';
  let tieReason = 'Tie-Break Armageddon (Hitam lolos)';

  if (mat.diff > 0) {
    winnerColor = 'w';
    tieReason = `Tie-Break Materi (+${mat.diff} poin)`;
  } else if (mat.diff < 0) {
    winnerColor = 'b';
    tieReason = `Tie-Break Materi (+${Math.abs(mat.diff)} poin)`;
  } else if ((room.settings.clockMinutes || 0) > 0 && match.whiteMs !== match.blackMs) {
    if (match.whiteMs > match.blackMs) {
      winnerColor = 'w';
      tieReason = 'Tie-Break Keunggulan Jam Catur';
    } else {
      winnerColor = 'b';
      tieReason = 'Tie-Break Keunggulan Jam Catur';
    }
  }

  const winnerId = winnerColor === 'w' ? match.whiteId : match.blackId;
  const loserId = winnerColor === 'w' ? match.blackId : match.whiteId;
  const winnerSeat = room.seats.find(s => s.id === winnerId);
  return {
    winnerId,
    loserId,
    winnerColor,
    winnerName: winnerSeat?.name || (winnerColor === 'w' ? match.whiteName : match.blackName) || 'Pemain',
    tieReason,
  };
}

function finishMatch(room, match, { winnerId = null, loserId = null, winnerColor = null, reason, label }, now) {
  const isCup = room.settings.mode === 'cup' && Boolean(room.cup);
  let finalWinnerId = winnerId;
  let finalLoserId = loserId;
  let finalWinnerColor = winnerColor;
  let finalLabel = label;

  // Dalam mode Turnamen Cup (Sistem Gugur), setiap partai wajib meloloskan 1 pemenang
  if (isCup && !finalWinnerId) {
    const tb = resolveCupTieBreak(room, match);
    finalWinnerId = tb.winnerId;
    finalLoserId = tb.loserId;
    finalWinnerColor = tb.winnerColor;
    finalLabel = `${label} → ${tb.winnerName} lolos ke babak berikutnya (${tb.tieReason})!`;
  }

  match.phase = 'ended';
  match.status = 'done';
  match.turnSeat = -1;
  match.deadline = 0;
  match.drawOfferBy = null;

  const whiteSeat = room.seats.find(seat => seat.id === match.whiteId);
  const blackSeat = room.seats.find(seat => seat.id === match.blackId);
  const winnerSeat = finalWinnerId ? room.seats.find(seat => seat.id === finalWinnerId) : null;
  const loserSeat = finalLoserId ? room.seats.find(seat => seat.id === finalLoserId) : null;

  match.winnerId = finalWinnerId;
  match.loserId = finalLoserId;
  match.winnerName = winnerSeat?.name || (finalWinnerId === match.whiteId ? match.whiteName : match.blackName) || null;

  const result = {
    matchNo: match.no,
    winnerId: finalWinnerId,
    winnerName: match.winnerName,
    loserId: finalLoserId,
    loserName: loserSeat?.name || null,
    winnerColor: finalWinnerColor,
    whiteId: match.whiteId,
    blackId: match.blackId,
    whiteName: whiteSeat?.name || match.whiteName || 'Putih',
    blackName: blackSeat?.name || match.blackName || 'Hitam',
    reason,
    label: finalLabel,
    movesCount: match.moves.length,
    at: now,
  };

  match.result = result;
  pushMatchLog(match, finalLabel);

  if (finalWinnerId) {
    for (const seat of room.seats) {
      if (seat.id === finalWinnerId) seat.wins = (seat.wins || 0) + 1;
      else if (seat.id === finalLoserId) seat.losses = (seat.losses || 0) + 1;
    }
  } else {
    for (const seat of room.seats) {
      if (seat.id === match.whiteId || seat.id === match.blackId) {
        seat.draws = (seat.draws || 0) + 1;
      }
    }
  }

  if (isCup) {
    propagateCupWinners(room, room.cup, match.roundNo || room.cup.currentRound, now);
    advanceCupRoundIfComplete(room, room.cup, now);
    room.match = firstActiveCupMatch(room.cup) || match;
    touch(room, now, finalLabel);
    return;
  }

  room.status = 'round-end';
  room.lastResult = result;
  room.history = [
    ...(room.history || []),
    {
      no: match.no,
      at: now,
      winner: winnerSeat?.name || 'Remis',
      loser: loserSeat?.name || '-',
      isDraw: !finalWinnerId,
      reason,
      label: finalLabel,
      moves: match.moves.length,
    },
  ].slice(-15);

  touch(room, now, finalLabel);
}

function applyMoveInternal(room, match, player, moveInput, now, isAutoTimeout = false) {
  if (!player) return { error: 'Kursi pemain tidak ditemukan.' };

  const activeColor = match.turn;
  const expectedId = activeColor === 'w' ? match.whiteId : match.blackId;
  if (player.id !== expectedId) {
    return { error: 'Bukan giliranmu.' };
  }

  // Kurangi jam catur total bila mode Blitz/Rapid aktif
  if ((room.settings.clockMinutes || 0) > 0 && match.turnStartedAt > 0) {
    const elapsed = Math.max(0, now - match.turnStartedAt);
    if (activeColor === 'w') {
      match.whiteMs = Math.max(0, match.whiteMs - elapsed);
      if (match.whiteMs <= 0) {
        const opp = room.seats.find(seat => seat.id === match.blackId);
        finishMatch(room, match, {
          winnerId: opp?.id || match.blackId,
          loserId: player.id,
          winnerColor: 'b',
          reason: 'timeout',
          label: `Waktu habis! ${opp?.name || match.blackName || 'Hitam'} menang atas ${player.name}.`,
        }, now);
        return { room };
      }
    } else {
      match.blackMs = Math.max(0, match.blackMs - elapsed);
      if (match.blackMs <= 0) {
        const opp = room.seats.find(seat => seat.id === match.whiteId);
        finishMatch(room, match, {
          winnerId: opp?.id || match.whiteId,
          loserId: player.id,
          winnerColor: 'w',
          reason: 'timeout',
          label: `Waktu habis! ${opp?.name || match.whiteName || 'Putih'} menang atas ${player.name}.`,
        }, now);
        return { room };
      }
    }
  }

  let chess;
  try {
    chess = new Chess(match.fen);
  } catch {
    return { error: 'State papan tidak valid.' };
  }

  let executed = null;
  try {
    executed = chess.move({
      from: String(moveInput.from || '').toLowerCase(),
      to: String(moveInput.to || '').toLowerCase(),
      promotion: String(moveInput.promotion || 'q').toLowerCase(),
    });
  } catch {
    executed = null;
  }

  if (!executed) {
    return { error: 'Langkah tidak sah menurut aturan catur.' };
  }

  if (!isAutoTimeout) {
    match.timeouts[player.id] = 0;
  }

  const moveRecord = {
    no: match.moves.length + 1,
    from: executed.from,
    to: executed.to,
    san: executed.san,
    piece: executed.piece,
    color: executed.color,
    captured: executed.captured || null,
    promotion: executed.promotion || null,
    by: player.id,
    at: now,
  };

  match.moves.push(moveRecord);
  match.lastMove = moveRecord;
  if (executed.captured) {
    const capKey = executed.color === 'w' ? 'w' : 'b';
    match.captured[capKey] = sortCaptured([...(match.captured[capKey] || []), executed.captured]);
  }

  match.fen = chess.fen();
  match.turn = chess.turn();
  match.inCheck = chess.inCheck();
  match.drawOfferBy = null;

  const moveDesc = isAutoTimeout
    ? `${player.name} kehabisan waktu langkah — jalan otomatis ${executed.san}`
    : `${player.name} (${executed.color === 'w' ? 'Putih' : 'Hitam'}): ${executed.san}`;
  pushMatchLog(match, moveDesc);

  // Cek kondisi akhir permainan
  if (chess.isCheckmate()) {
    const loserColor = chess.turn();
    const loserId = loserColor === 'w' ? match.whiteId : match.blackId;
    const loserSeat = room.seats.find(seat => seat.id === loserId);
    finishMatch(room, match, {
      winnerId: player.id,
      loserId,
      winnerColor: executed.color,
      reason: 'checkmate',
      label: `Skakmat! ${player.name} menang atas ${loserSeat?.name || 'lawan'}.`,
    }, now);
    return { room };
  }

  if (chess.isStalemate()) {
    finishMatch(room, match, {
      reason: 'stalemate',
      label: 'Remis — Stalemate (Raja lawan terkunci tanpa skak).',
    }, now);
    return { room };
  }

  if (chess.isThreefoldRepetition()) {
    finishMatch(room, match, {
      reason: 'threefold',
      label: 'Remis — Posisi yang sama terulang 3 kali.',
    }, now);
    return { room };
  }

  if (chess.isInsufficientMaterial()) {
    finishMatch(room, match, {
      reason: 'insufficient',
      label: 'Remis — Materi bidak tidak cukup untuk skakmat.',
    }, now);
    return { room };
  }

  if (chess.isDraw()) {
    finishMatch(room, match, {
      reason: 'fifty-move',
      label: 'Remis — Aturan 50 langkah tanpa tangkapan atau gerak pion.',
    }, now);
    return { room };
  }

  const nextPlayerId = match.turn === 'w' ? match.whiteId : match.blackId;
  const nextSeatIndex = room.seats.findIndex(seat => seat.id === nextPlayerId);
  match.turnSeat = nextSeatIndex >= 0 ? nextSeatIndex : 0;
  match.turnStartedAt = now;
  match.deadline = computeDeadline(room, match, match.turn, now);

  touch(room, now, null);
  return { room };
}

function resolveTargetMatch(room, playerId, intentMatchId = null) {
  if (room.settings.mode === 'cup' && room.cup) {
    return findCupMatchForActor(room, playerId, intentMatchId);
  }
  return room.match;
}

export function applyChessIntent(rawRoom, intent, playerId, now = Date.now()) {
  if (!rawRoom || !intent || !intent.type) return { error: 'Aksi tidak valid.' };
  const room = cloneRoom(rawRoom);
  const type = String(intent.type).toLowerCase();
  const maxSeats = maxSeatsForRoom(room);

  const seatIndex = room.seats.findIndex(item => item.id === playerId);
  const seat = seatIndex >= 0 ? room.seats[seatIndex] : null;
  const specIndex = room.spectators.findIndex(item => item.id === playerId);
  const spectator = specIndex >= 0 ? room.spectators[specIndex] : null;

  switch (type) {
    case 'sit': {
      const name = String(intent.name || seat?.name || spectator?.name || '').trim().slice(0, 18);
      if (!name) return { error: 'Nama panggilan wajib diisi.' };
      const avatar = intent.avatar || seat?.avatar || spectator?.avatar || 'finn';
      const wantSpectator = Boolean(intent.asSpectator);

      if (seat) {
        seat.name = name;
        seat.avatar = avatar;
        seat.online = true;
        touch(room, now, null);
        return { room };
      }

      if (!wantSpectator && room.status !== 'playing' && room.seats.length < maxSeats) {
        if (specIndex >= 0) room.spectators.splice(specIndex, 1);
        room.seats.push({
          id: playerId,
          name,
          avatar,
          ready: false,
          bot: false,
          online: true,
          wins: 0,
          losses: 0,
          draws: 0,
          cups: 0,
        });
        const label = room.settings.mode === 'cup'
          ? `${name} mendaftar sebagai peserta Cup #${room.seats.length}.`
          : `${name} duduk di Kursi ${room.seats.length === 1 ? 'Putih' : 'Hitam'}.`;
        touch(room, now, label);
        return { room };
      }

      if (spectator) {
        spectator.name = name;
        spectator.avatar = avatar;
        spectator.online = true;
        touch(room, now, null);
        return { room };
      }

      if (room.spectators.length >= CHESS_MAX_SPECTATORS) {
        return { error: 'Kursi pemain dan penonton sudah penuh.' };
      }

      room.spectators.push({
        id: playerId,
        name,
        avatar,
        online: true,
        joinedAt: now,
      });
      touch(room, now, `${name} bergabung sebagai penonton.`);
      return { room };
    }

    case 'spectate': {
      if (room.status === 'playing' && seat) {
        return { error: 'Tidak bisa pindah ke penonton saat pertandingan sedang berjalan.' };
      }
      if (spectator) return { room };
      if (!seat) return { error: 'Kamu belum ada di meja ini.' };
      if (room.spectators.length >= CHESS_MAX_SPECTATORS) {
        return { error: 'Kursi penonton sudah penuh.' };
      }
      room.seats.splice(seatIndex, 1);
      room.spectators.push({
        id: playerId,
        name: seat.name,
        avatar: seat.avatar,
        online: true,
        joinedAt: now,
      });
      touch(room, now, `${seat.name} pindah ke bangku penonton.`);
      return { room };
    }

    case 'takeplayerseat': {
      if (room.status === 'playing') {
        return { error: 'Pertandingan sedang berjalan. Tunggu babak selesai.' };
      }
      if (seat) return { room };
      if (!spectator) return { error: 'Kamu belum terdaftar di ruangan ini.' };
      if (room.seats.length >= maxSeats) {
        return { error: 'Kursi peserta sudah penuh.' };
      }
      room.spectators.splice(specIndex, 1);
      room.seats.push({
        id: playerId,
        name: spectator.name,
        avatar: spectator.avatar,
        ready: playerId === room.hostId,
        bot: false,
        online: true,
        wins: 0,
        losses: 0,
        draws: 0,
        cups: 0,
      });
      touch(room, now, `${spectator.name} maju ke kursi peserta.`);
      return { room };
    }

    case 'ready': {
      if (!seat) return { error: 'Hanya peserta yang duduk di kursi pemain yang perlu menekan SIAP.' };
      if (room.status === 'playing') return { error: 'Pertandingan sedang berjalan.' };
      seat.ready = Boolean(intent.ready ?? intent.value);
      touch(room, now, null);
      return { room };
    }

    case 'stand': {
      if (spectator) {
        room.spectators.splice(specIndex, 1);
        if (room.hostId === playerId) {
          const nextHost = room.seats.find(item => !item.bot) || room.spectators[0] || room.seats[0];
          room.hostId = nextHost?.id || null;
        }
        touch(room, now, `${spectator.name} keluar dari ruangan.`);
        return { room };
      }
      if (!seat) return { error: 'Kamu tidak berada di meja ini.' };

      if (room.status === 'playing') {
        const activeMatch = resolveTargetMatch(room, playerId);
        if (activeMatch && activeMatch.phase === 'play') {
          const oppId = activeMatch.whiteId === playerId ? activeMatch.blackId : activeMatch.whiteId;
          const opp = room.seats.find(item => item.id === oppId);
          const oppColor = activeMatch.whiteId === oppId ? 'w' : 'b';
          finishMatch(room, activeMatch, {
            winnerId: oppId,
            loserId: playerId,
            winnerColor: oppColor,
            reason: 'resign',
            label: `${seat.name} meninggalkan meja — ${opp?.name || 'Lawan'} menang.`,
          }, now);
        }
      }

      const currentIdx = room.seats.findIndex(item => item.id === playerId);
      if (currentIdx >= 0) room.seats.splice(currentIdx, 1);
      if (room.hostId === playerId) {
        const nextHost = room.seats.find(item => !item.bot) || room.spectators[0] || room.seats[0];
        room.hostId = nextHost?.id || null;
      }
      touch(room, now, `${seat.name} meninggalkan meja.`);
      return { room };
    }

    case 'addbot': {
      if (playerId !== room.hostId) return { error: 'Hanya host yang bisa menambah bot.' };
      if (room.status === 'playing') return { error: 'Pertandingan sedang berjalan.' };
      if (room.seats.length >= maxSeats) {
        return { error: `Kursi peserta sudah penuh (${maxSeats}/${maxSeats}).` };
      }
      const botSeat = createBotSeatObj(room, now);
      room.seats.push(botSeat);
      touch(room, now, `${botSeat.name} bergabung sebagai peserta.`);
      return { room };
    }

    case 'removebot': {
      if (playerId !== room.hostId) return { error: 'Hanya host yang bisa mengeluarkan bot.' };
      if (room.status === 'playing') return { error: 'Tunggu babak selesai dulu.' };
      const idx = room.seats.findIndex(item => item.bot && (!intent.botId || item.id === intent.botId));
      if (idx < 0) return { error: 'Bot tidak ditemukan.' };
      const [removed] = room.seats.splice(idx, 1);
      touch(room, now, `${removed.name} dikeluarkan dari kursi.`);
      return { room };
    }

    case 'swapseats': {
      if (playerId !== room.hostId) return { error: 'Hanya host yang bisa menukar warna/urutan kursi.' };
      if (room.status === 'playing') return { error: 'Tidak bisa menukar kursi saat bermain.' };
      if (room.seats.length < 2) return { error: 'Butuh minimal 2 peserta untuk menukar posisi.' };
      if (room.settings.mode === 'cup') {
        room.seats = deterministicShuffle(room.seats, `${room.code}:${room.rev}:${now}`);
        touch(room, now, 'Urutan unggulan peserta Cup diacak ulang oleh Host.');
        return { room };
      }
      const [first, second] = room.seats;
      room.seats = [second, first];
      if (room.lastResult) {
        room.lastResult.whiteId = first.id;
      }
      touch(room, now, `Posisi warna ditukar: ${second.name} (Putih) vs ${first.name} (Hitam).`);
      return { room };
    }

    case 'settings': {
      if (playerId !== room.hostId) return { error: 'Hanya host yang bisa mengubah aturan meja.' };
      if (room.status === 'playing') return { error: 'Aturan tidak bisa diubah saat pertandingan berjalan.' };
      const patch = intent.settings || {};
      const nextMode = patch.mode === 'cup' ? 'cup' : (patch.mode === '1v1' ? '1v1' : room.settings.mode);
      room.settings = {
        mode: nextMode,
        cupFillBots: patch.cupFillBots !== undefined ? Boolean(patch.cupFillBots) : room.settings.cupFillBots,
        turnSeconds: Math.max(15, Math.min(180, Math.round(Number(patch.turnSeconds) || room.settings.turnSeconds))),
        clockMinutes: [0, 3, 5, 10].includes(Number(patch.clockMinutes))
          ? Number(patch.clockMinutes)
          : room.settings.clockMinutes,
        botLevel: ['mudah', 'sedang', 'sulit'].includes(patch.botLevel)
          ? patch.botLevel
          : room.settings.botLevel,
      };
      // Bila pindah dari mode Cup ke 1v1 sementara kursi > 2, pindahkan kelebihan pemain manusia ke penonton
      if (nextMode === '1v1' && room.seats.length > CHESS_MAX_SEATS) {
        const keep = room.seats.slice(0, CHESS_MAX_SEATS);
        const overflow = room.seats.slice(CHESS_MAX_SEATS).filter(s => !s.bot);
        room.seats = keep;
        for (const item of overflow) {
          if (room.spectators.length < CHESS_MAX_SPECTATORS) {
            room.spectators.push({
              id: item.id,
              name: item.name,
              avatar: item.avatar,
              online: item.online,
              joinedAt: now,
            });
          }
        }
      }
      touch(room, now, `Pengaturan meja diperbarui (${nextMode === 'cup' ? 'Mode Turnamen Cup' : 'Mode Duel 1v1'}).`);
      return { room };
    }

    case 'start': {
      if (playerId !== room.hostId) return { error: 'Hanya host yang bisa memulai pertandingan.' };
      if (room.status === 'playing') return { error: 'Pertandingan masih berjalan.' };
      if (room.seats.length < 2) return { error: 'Butuh minimal 2 peserta untuk mulai.' };
      const humans = room.seats.filter(item => !item.bot);
      if (humans.some(item => !item.ready && item.id !== room.hostId)) {
        return { error: 'Masih ada peserta yang belum menekan SIAP.' };
      }
      return room.settings.mode === 'cup' ? startChessCup(room, now) : startChessMatch(room, now);
    }

    case 'next': {
      if (room.status === 'playing') return { error: 'Pertandingan masih berjalan.' };
      if (!seat && playerId !== room.hostId) {
        return { error: 'Hanya peserta atau host yang bisa memulai babak berikutnya.' };
      }
      return room.settings.mode === 'cup' ? startChessCup(room, now) : startChessMatch(room, now);
    }

    case 'tolobby': {
      if (room.status === 'playing') return { error: 'Pertandingan masih berjalan.' };
      if (!seat && playerId !== room.hostId) {
        return { error: 'Hanya peserta atau host yang bisa kembali ke ruang tunggu.' };
      }
      room.status = 'lobby';
      room.match = null;
      room.cup = null;
      for (const item of room.seats) {
        item.ready = item.bot ? true : item.id === room.hostId;
      }
      touch(room, now, 'Kembali ke ruang tunggu.');
      return { room };
    }

    case 'restart': {
      if (playerId !== room.hostId) return { error: 'Hanya host yang bisa mereset papan skor.' };
      if (room.status === 'playing') return { error: 'Selesaikan pertandingan dulu.' };
      room.status = 'lobby';
      room.match = null;
      room.cup = null;
      room.matchNo = 0;
      room.lastResult = null;
      room.history = [];
      for (const item of room.seats) {
        item.wins = 0;
        item.losses = 0;
        item.draws = 0;
        item.cups = 0;
        item.ready = item.bot ? true : item.id === room.hostId;
      }
      touch(room, now, 'Skor dan riwayat direset.');
      return { room };
    }

    case 'online': {
      if (seat) seat.online = intent.online !== false;
      if (spectator) spectator.online = intent.online !== false;
      touch(room, now, null);
      return { room };
    }

    case 'move': {
      if (room.status !== 'playing') {
        return { error: 'Pertandingan belum dimulai atau sudah selesai.' };
      }
      if (!seat) return { error: 'Penonton tidak bisa menggerakkan bidak.' };
      const targetMatch = resolveTargetMatch(room, playerId, intent.matchId);
      if (!targetMatch || targetMatch.phase !== 'play') {
        return { error: 'Partai caturmu belum aktif atau sudah selesai.' };
      }
      return applyMoveInternal(room, targetMatch, seat, intent, now, false);
    }

    case 'offerdraw': {
      if (room.status !== 'playing') return { error: 'Pertandingan tidak sedang berjalan.' };
      if (!seat) return { error: 'Hanya pemain yang bisa menawarkan remis.' };
      const targetMatch = resolveTargetMatch(room, playerId, intent.matchId);
      if (!targetMatch || targetMatch.phase !== 'play') {
        return { error: 'Partai tidak sedang berjalan.' };
      }
      if (targetMatch.drawOfferBy === playerId) {
        return { error: 'Tawaran remis sudah dikirim.' };
      }
      targetMatch.drawOfferBy = playerId;
      pushMatchLog(targetMatch, `${seat.name} menawarkan remis (draw).`);

      const oppId = targetMatch.whiteId === playerId ? targetMatch.blackId : targetMatch.whiteId;
      const oppSeat = room.seats.find(item => item.id === oppId);
      if (oppSeat?.bot) {
        if (shouldBotAcceptDraw({ ...room, match: targetMatch })) {
          finishMatch(room, targetMatch, {
            reason: 'agreement',
            label: `Remis disepakati (${oppSeat.name} menerima tawaran remis).`,
          }, now);
          return { room };
        }
        targetMatch.drawOfferBy = null;
        pushMatchLog(targetMatch, `${oppSeat.name} menolak remis dan memilih lanjut bertanding!`);
      }

      touch(room, now, null);
      return { room };
    }

    case 'acceptdraw': {
      if (room.status !== 'playing') return { error: 'Pertandingan tidak sedang berjalan.' };
      if (!seat) return { error: 'Hanya pemain yang bisa menerima remis.' };
      const targetMatch = resolveTargetMatch(room, playerId, intent.matchId);
      if (!targetMatch || targetMatch.phase !== 'play') {
        return { error: 'Partai tidak sedang berjalan.' };
      }
      if (!targetMatch.drawOfferBy || targetMatch.drawOfferBy === playerId) {
        return { error: 'Tidak ada tawaran remis dari lawan.' };
      }
      finishMatch(room, targetMatch, {
        reason: 'agreement',
        label: 'Remis — Kedua pemain sepakat damai.',
      }, now);
      return { room };
    }

    case 'declinedraw': {
      if (room.status !== 'playing') return { error: 'Pertandingan tidak sedang berjalan.' };
      if (!seat) return { error: 'Hanya pemain yang bisa menolak remis.' };
      const targetMatch = resolveTargetMatch(room, playerId, intent.matchId);
      if (!targetMatch || targetMatch.phase !== 'play') {
        return { error: 'Partai tidak sedang berjalan.' };
      }
      if (!targetMatch.drawOfferBy || targetMatch.drawOfferBy === playerId) {
        return { error: 'Tidak ada tawaran remis untuk ditolak.' };
      }
      targetMatch.drawOfferBy = null;
      pushMatchLog(targetMatch, `${seat.name} menolak tawaran remis.`);
      touch(room, now, null);
      return { room };
    }

    case 'resign': {
      if (room.status !== 'playing') return { error: 'Pertandingan tidak sedang berjalan.' };
      if (!seat) return { error: 'Hanya pemain yang bisa menyerah.' };
      const targetMatch = resolveTargetMatch(room, playerId, intent.matchId);
      if (!targetMatch || targetMatch.phase !== 'play') {
        return { error: 'Partai tidak sedang berjalan.' };
      }
      const oppId = targetMatch.whiteId === playerId ? targetMatch.blackId : targetMatch.whiteId;
      const opp = room.seats.find(item => item.id === oppId);
      const oppColor = targetMatch.whiteId === oppId ? 'w' : 'b';
      finishMatch(room, targetMatch, {
        winnerId: oppId,
        loserId: playerId,
        winnerColor: oppColor,
        reason: 'resign',
        label: `${seat.name} menyerah — ${opp?.name || 'Lawan'} menang!`,
      }, now);
      return { room };
    }

    case 'tick': {
      if (room.status !== 'playing') {
        return { error: 'Pertandingan tidak sedang berjalan.' };
      }
      const activeMatches = getActivePlayingMatches(room);
      const targetMatch = intent.matchId
        ? activeMatches.find(m => m.id === intent.matchId)
        : activeMatches.find(m => m.deadline && now >= m.deadline) || room.match;

      if (!targetMatch || targetMatch.phase !== 'play') {
        return { error: 'Pertandingan tidak sedang berjalan.' };
      }
      if (!targetMatch.deadline || now < targetMatch.deadline) {
        return { error: 'Belum melewati batas waktu.' };
      }

      const activeId = targetMatch.turn === 'w' ? targetMatch.whiteId : targetMatch.blackId;
      const activeSeat = room.seats.find(item => item.id === activeId);
      if (!activeSeat) return { error: 'Pemain giliran tidak ditemukan.' };

      const oppId = targetMatch.turn === 'w' ? targetMatch.blackId : targetMatch.whiteId;
      const opp = room.seats.find(item => item.id === oppId);
      const oppColor = targetMatch.turn === 'w' ? 'b' : 'w';

      if ((room.settings.clockMinutes || 0) > 0) {
        const elapsed = Math.max(0, now - (targetMatch.turnStartedAt || now));
        const rem = (targetMatch.turn === 'w' ? targetMatch.whiteMs : targetMatch.blackMs) - elapsed;
        if (rem <= 0) {
          if (targetMatch.turn === 'w') targetMatch.whiteMs = 0;
          else targetMatch.blackMs = 0;
          finishMatch(room, targetMatch, {
            winnerId: opp?.id || oppId,
            loserId: activeSeat.id,
            winnerColor: oppColor,
            reason: 'timeout',
            label: `Waktu habis! ${opp?.name || 'Lawan'} menang atas ${activeSeat.name}.`,
          }, now);
          return { room };
        }
      }

      const streak = (targetMatch.timeouts[activeSeat.id] || 0) + 1;
      targetMatch.timeouts[activeSeat.id] = streak;
      if (!activeSeat.bot && streak >= 3) {
        finishMatch(room, targetMatch, {
          winnerId: opp?.id || oppId,
          loserId: activeSeat.id,
          winnerColor: oppColor,
          reason: 'timeout',
          label: `${activeSeat.name} AFK 3x berturut-turut — ${opp?.name || 'Lawan'} menang waktu.`,
        }, now);
        return { room };
      }

      const autoMove = chooseChessBotMove(
        { ...room, match: targetMatch },
        activeSeat.bot ? room.settings.botLevel : 'mudah',
      );
      if (!autoMove) {
        return { error: 'Tidak ada langkah tersedia.' };
      }
      return applyMoveInternal(room, targetMatch, activeSeat, autoMove, now, true);
    }

    default:
      return { error: 'Aksi tidak dikenal.' };
  }
}

/**
 * Daftar langkah legal dari satu petak (mis. 'e2') untuk UI highlight & promosi.
 */
export function legalMovesFromSquare(fen, square) {
  if (!fen || !square) return [];
  try {
    const chess = new Chess(fen);
    return chess.moves({ square, verbose: true });
  } catch {
    return [];
  }
}

/**
 * Semua langkah legal pada posisi FEN saat ini.
 */
export function allLegalMoves(fen) {
  if (!fen) return [];
  try {
    const chess = new Chess(fen);
    return chess.moves({ verbose: true });
  } catch {
    return [];
  }
}

/**
 * Ubah FEN menjadi matriks 8x8 berisi `{ square, type, color } | null`.
 */
export function boardSquaresFromFen(fen = INITIAL_FEN) {
  let chess;
  try {
    chess = new Chess(fen);
  } catch {
    chess = new Chess(INITIAL_FEN);
  }
  const raw = chess.board();
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const matrix = [];
  for (let r = 0; r < 8; r += 1) {
    const row = [];
    for (let c = 0; c < 8; c += 1) {
      const cell = raw[r][c];
      const sq = `${files[c]}${8 - r}`;
      row.push({
        square: sq,
        file: files[c],
        rank: 8 - r,
        isLight: (r + c) % 2 === 0,
        piece: cell ? { type: cell.type, color: cell.color } : null,
      });
    }
    matrix.push(row);
  }
  return matrix;
}

/**
 * Cari petak raja untuk warna tertentu (dipakai untuk highlight merah saat SKAK).
 */
export function findKingSquare(fen, color = 'w') {
  const matrix = boardSquaresFromFen(fen);
  for (const row of matrix) {
    for (const cell of row) {
      if (cell.piece && cell.piece.type === 'k' && cell.piece.color === color) {
        return cell.square;
      }
    }
  }
  return null;
}

export function chessActions(room, viewerId, viewedMatch = null) {
  const seatIndex = (room?.seats || []).findIndex(seat => seat.id === viewerId);
  const isSeated = seatIndex >= 0;
  const isSpectator = !isSeated && (room?.spectators || []).some(spec => spec.id === viewerId);
  const match = viewedMatch || resolveTargetMatch(room, viewerId) || room?.match;

  if (!room || room.status !== 'playing' || !match || match.phase !== 'play') {
    return {
      isPlayer: isSeated,
      isSpectator: !isSeated || isSpectator,
      myColor: null,
      isTurn: false,
      inCheck: false,
      canOfferDraw: false,
      canAcceptDraw: false,
      canResign: false,
      matchId: match?.id || null,
    };
  }

  const myColor = match.whiteId === viewerId ? 'w' : match.blackId === viewerId ? 'b' : null;
  const isActiveOnThisBoard = Boolean(myColor);
  const isTurn = Boolean(myColor && match.turn === myColor);

  return {
    isPlayer: isActiveOnThisBoard,
    isSeated,
    isSpectator: !isActiveOnThisBoard,
    myColor,
    isTurn,
    inCheck: Boolean(match.inCheck),
    canOfferDraw: Boolean(isActiveOnThisBoard && !match.drawOfferBy),
    canAcceptDraw: Boolean(isActiveOnThisBoard && match.drawOfferBy && match.drawOfferBy !== viewerId),
    canResign: Boolean(isActiveOnThisBoard),
    matchId: match.id || null,
  };
}

export { evaluateMaterial };
