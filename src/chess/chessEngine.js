/**
 * Mesin **Catur BAWASLU** (Chess 1v1 + Mode Penonton).
 *
 * Menggunakan `chess.js` untuk validasi langkah 100% sesuai aturan resmi FIDE
 * (skak, skakmat, remis/stalemate, rokade/castling, promosi pion, en passant,
 * repetisi 3 kali, materi tidak cukup, aturan 50 langkah).
 *
 * Kapasitas meja:
 * - 2 Kursi Pemain (Putih vs Hitam, warna bergantian tiap babak atau bisa ditukar).
 * - Hingga 8 Kursi Penonton (Spectator) yang bisa menonton papan langsung,
 *   ikut obrolan meja, dan melempar ejekan/stiker.
 */
import { Chess } from 'chess.js';
import { chooseChessBotMove, evaluateMaterial, shouldBotAcceptDraw } from './chessBots.js';

export const CHESS_MAX_SEATS = 2;
export const CHESS_MAX_SPECTATORS = 8;

export const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const CHESS_SETTINGS_DEFAULT = {
  turnSeconds: 60,
  clockMinutes: 0, // 0 = turn timer saja, 3 = Blitz 3m, 5 = Blitz 5m, 10 = Rapid 10m
  botLevel: 'sedang', // 'mudah' | 'sedang' | 'sulit'
};

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

function sortCaptured(list = []) {
  return [...list].sort((a, b) => (PIECE_ORDER[b] || 0) - (PIECE_ORDER[a] || 0));
}

export function normalizeChessRoom(raw) {
  if (!raw) return null;
  const settings = { ...CHESS_SETTINGS_DEFAULT, ...(raw.settings || {}) };
  const match = raw.match
    ? {
        no: Number(raw.match.no) || 1,
        fen: raw.match.fen || INITIAL_FEN,
        turn: raw.match.turn === 'b' ? 'b' : 'w',
        phase: raw.match.phase || 'play',
        whiteId: raw.match.whiteId || null,
        blackId: raw.match.blackId || null,
        turnSeat: typeof raw.match.turnSeat === 'number' ? raw.match.turnSeat : 0,
        turnStartedAt: Number(raw.match.turnStartedAt) || 0,
        deadline: Number(raw.match.deadline) || 0,
        whiteMs: Number(raw.match.whiteMs) || 0,
        blackMs: Number(raw.match.blackMs) || 0,
        inCheck: Boolean(raw.match.inCheck),
        drawOfferBy: raw.match.drawOfferBy || null,
        lastMove: raw.match.lastMove ? { ...raw.match.lastMove } : null,
        moves: (raw.match.moves || []).map(item => ({ ...item })),
        captured: {
          w: (raw.match.captured?.w || []).slice(),
          b: (raw.match.captured?.b || []).slice(),
        },
        timeouts: {
          ...(raw.match.timeouts || {}),
        },
        result: raw.match.result ? { ...raw.match.result } : null,
        log: (raw.match.log || []).slice(),
      }
    : null;

  return {
    ...raw,
    game: 'chess',
    v: 1,
    settings: {
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
    lastResult: raw.lastResult ? { ...raw.lastResult } : null,
    history: (raw.history || []).map(entry => ({ ...entry })),
    log: (raw.log || []).slice(),
    rev: Number(raw.rev) || 0,
    createdAt: Number(raw.createdAt) || 0,
    lastActionAt: Number(raw.lastActionAt) || 0,
  };
}

function cloneRoom(room) {
  const norm = normalizeChessRoom(room);
  return {
    ...norm,
    settings: { ...norm.settings },
    seats: norm.seats.map(seat => ({ ...seat })),
    spectators: norm.spectators.map(spec => ({ ...spec })),
    history: norm.history.map(entry => ({ ...entry })),
    log: norm.log.slice(),
    lastResult: norm.lastResult ? { ...norm.lastResult } : null,
    match: norm.match
      ? {
          ...norm.match,
          lastMove: norm.match.lastMove ? { ...norm.match.lastMove } : null,
          moves: norm.match.moves.map(item => ({ ...item })),
          captured: {
            w: norm.match.captured.w.slice(),
            b: norm.match.captured.b.slice(),
          },
          timeouts: { ...norm.match.timeouts },
          result: norm.match.result ? { ...norm.match.result } : null,
          log: norm.match.log.slice(),
        }
      : null,
  };
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

export function createChessRoom({ code, hostId, name, avatar, settings, now = Date.now() }) {
  const merged = { ...CHESS_SETTINGS_DEFAULT, ...(settings || {}) };
  const cleanName = String(name || '').trim().slice(0, 18) || 'Pemain 1';
  return normalizeChessRoom({
    v: 1,
    game: 'chess',
    code,
    hostId,
    status: 'lobby',
    settings: {
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
    }],
    spectators: [],
    matchNo: 0,
    match: null,
    lastResult: null,
    history: [],
    log: [`Meja catur dibuka oleh ${cleanName}.`],
    rev: 0,
    createdAt: now,
    lastActionAt: now,
  });
}

export function startChessMatch(rawRoom, now = Date.now()) {
  const room = cloneRoom(rawRoom);
  if (room.seats.length < 2) {
    return { error: 'Butuh 2 pemain di kursi Putih & Hitam untuk memulai catur.' };
  }

  room.matchNo = (room.matchNo || 0) + 1;
  // Babak 1: Kursi 0 = Putih, Kursi 1 = Hitam.
  // Babak berikutnya: tukar warna dari babak sebelumnya agar adil.
  let whiteSeatIndex = 0;
  if (room.matchNo > 1 && room.lastResult?.whiteId) {
    const prevWhiteIdx = room.seats.findIndex(seat => seat.id === room.lastResult.whiteId);
    if (prevWhiteIdx === 0) whiteSeatIndex = 1;
    else if (prevWhiteIdx === 1) whiteSeatIndex = 0;
  }
  const blackSeatIndex = whiteSeatIndex === 0 ? 1 : 0;
  const whiteSeat = room.seats[whiteSeatIndex];
  const blackSeat = room.seats[blackSeatIndex];

  const totalClockMs = (room.settings.clockMinutes || 0) > 0
    ? room.settings.clockMinutes * 60 * 1000
    : 0;

  const match = {
    no: room.matchNo,
    fen: INITIAL_FEN,
    turn: 'w',
    phase: 'play',
    whiteId: whiteSeat.id,
    blackId: blackSeat.id,
    turnSeat: whiteSeatIndex,
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
      `Babak #${room.matchNo} dimulai — Putih: ${whiteSeat.name}, Hitam: ${blackSeat.name}.`,
    ],
  };
  match.deadline = computeDeadline(room, match, 'w', now);

  room.status = 'playing';
  room.match = match;
  touch(room, now, `Babak #${room.matchNo} dimulai (${whiteSeat.name} vs ${blackSeat.name}).`);
  return { room };
}

function finishMatch(room, match, { winnerId = null, loserId = null, winnerColor = null, reason, label }, now) {
  match.phase = 'ended';
  match.turnSeat = -1;
  match.deadline = 0;
  match.drawOfferBy = null;
  room.status = 'round-end';

  const whiteSeat = room.seats.find(seat => seat.id === match.whiteId);
  const blackSeat = room.seats.find(seat => seat.id === match.blackId);
  const winnerSeat = winnerId ? room.seats.find(seat => seat.id === winnerId) : null;
  const loserSeat = loserId ? room.seats.find(seat => seat.id === loserId) : null;

  const result = {
    matchNo: match.no,
    winnerId,
    winnerName: winnerSeat?.name || null,
    loserId,
    loserName: loserSeat?.name || null,
    winnerColor,
    whiteId: match.whiteId,
    blackId: match.blackId,
    whiteName: whiteSeat?.name || 'Putih',
    blackName: blackSeat?.name || 'Hitam',
    reason,
    label,
    movesCount: match.moves.length,
    at: now,
  };

  match.result = result;
  room.lastResult = result;
  pushMatchLog(match, label);

  if (winnerId) {
    for (const seat of room.seats) {
      if (seat.id === winnerId) seat.wins = (seat.wins || 0) + 1;
      else if (seat.id === loserId) seat.losses = (seat.losses || 0) + 1;
    }
  } else {
    for (const seat of room.seats) {
      seat.draws = (seat.draws || 0) + 1;
    }
  }

  room.history = [
    ...(room.history || []),
    {
      no: match.no,
      at: now,
      winner: winnerSeat?.name || 'Remis',
      loser: loserSeat?.name || '-',
      isDraw: !winnerId,
      reason,
      label,
      moves: match.moves.length,
    },
  ].slice(-15);

  touch(room, now, label);
}

function applyMoveInternal(room, match, seatIndex, moveInput, now, isAutoTimeout = false) {
  const player = room.seats[seatIndex];
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
          winnerId: opp?.id || null,
          loserId: player.id,
          winnerColor: 'b',
          reason: 'timeout',
          label: `Waktu habis! ${opp?.name || 'Hitam'} menang atas ${player.name}.`,
        }, now);
        return { room };
      }
    } else {
      match.blackMs = Math.max(0, match.blackMs - elapsed);
      if (match.blackMs <= 0) {
        const opp = room.seats.find(seat => seat.id === match.whiteId);
        finishMatch(room, match, {
          winnerId: opp?.id || null,
          loserId: player.id,
          winnerColor: 'w',
          reason: 'timeout',
          label: `Waktu habis! ${opp?.name || 'Putih'} menang atas ${player.name}.`,
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
  match.turnSeat = nextSeatIndex >= 0 ? nextSeatIndex : (seatIndex === 0 ? 1 : 0);
  match.turnStartedAt = now;
  match.deadline = computeDeadline(room, match, match.turn, now);

  touch(room, now, null);
  return { room };
}

export function applyChessIntent(rawRoom, intent, playerId, now = Date.now()) {
  if (!rawRoom || !intent || !intent.type) return { error: 'Aksi tidak valid.' };
  const room = cloneRoom(rawRoom);
  const type = String(intent.type).toLowerCase();

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

      // Bila sudah duduk sebagai pemain, perbarui profil
      if (seat) {
        seat.name = name;
        seat.avatar = avatar;
        seat.online = true;
        touch(room, now, null);
        return { room };
      }

      // Bila meja masih ada kursi kosong di lobby dan tidak minta jadi penonton
      if (!wantSpectator && room.status !== 'playing' && room.seats.length < CHESS_MAX_SEATS) {
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
        });
        touch(room, now, `${name} duduk di Kursi ${room.seats.length === 1 ? 'Putih' : 'Hitam'}.`);
        return { room };
      }

      // Selain itu: masuk sebagai Penonton (Spectator)
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
      if (room.seats.length >= CHESS_MAX_SEATS) {
        return { error: 'Kedua kursi pemain sudah terisi.' };
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
      });
      touch(room, now, `${spectator.name} maju ke kursi pemain.`);
      return { room };
    }

    case 'ready': {
      if (!seat) return { error: 'Hanya pemain di kursi Putih/Hitam yang perlu menekan SIAP.' };
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

      // Bila keluar saat pertandingan aktif, lawan otomatis menang WO/menyerah
      if (room.status === 'playing' && room.match && room.match.phase === 'play') {
        const opp = room.seats.find(item => item.id !== playerId);
        const oppColor = room.match.whiteId === opp?.id ? 'w' : 'b';
        finishMatch(room, room.match, {
          winnerId: opp?.id || null,
          loserId: playerId,
          winnerColor: oppColor,
          reason: 'resign',
          label: `${seat.name} meninggalkan meja — ${opp?.name || 'Lawan'} menang.`,
        }, now);
      }

      room.seats.splice(seatIndex, 1);
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
      if (room.seats.length >= CHESS_MAX_SEATS) return { error: 'Kursi pemain sudah penuh (2/2).' };
      const usedNames = new Set(room.seats.map(item => item.name));
      const botNames = ['Bot Grandmaster', 'Bot Kuda Lumping', 'Bot Benteng Takeshi', 'Bot Pion Sakti'];
      const botAvatars = ['ice-king', 'bmo', 'marceline', 'jake', 'princess-bubblegum', 'gunter'];
      const usedAvatars = new Set(room.seats.map(item => item.avatar));
      const name = botNames.find(item => !usedNames.has(item)) || 'Bot Catur';
      const avatar = botAvatars.find(item => !usedAvatars.has(item)) || 'bmo';
      room.seats.push({
        id: `bot-${room.rev}-${Math.floor(now % 100000)}`,
        name,
        avatar,
        ready: true,
        bot: true,
        online: true,
        wins: 0,
        losses: 0,
        draws: 0,
      });
      touch(room, now, `${name} duduk di kursi lawan.`);
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
      if (playerId !== room.hostId) return { error: 'Hanya host yang bisa menukar warna kursi.' };
      if (room.status === 'playing') return { error: 'Tidak bisa menukar kursi saat bermain.' };
      if (room.seats.length < 2) return { error: 'Butuh 2 pemain untuk menukar posisi Putih/Hitam.' };
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
      room.settings = {
        turnSeconds: Math.max(15, Math.min(180, Math.round(Number(patch.turnSeconds) || room.settings.turnSeconds))),
        clockMinutes: [0, 3, 5, 10].includes(Number(patch.clockMinutes))
          ? Number(patch.clockMinutes)
          : room.settings.clockMinutes,
        botLevel: ['mudah', 'sedang', 'sulit'].includes(patch.botLevel)
          ? patch.botLevel
          : room.settings.botLevel,
      };
      touch(room, now, 'Pengaturan meja catur diperbarui.');
      return { room };
    }

    case 'start': {
      if (playerId !== room.hostId) return { error: 'Hanya host yang bisa memulai pertandingan.' };
      if (room.status === 'playing') return { error: 'Pertandingan masih berjalan.' };
      if (room.seats.length < 2) return { error: 'Butuh 2 pemain (atau tambah 1 Bot) untuk mulai.' };
      const humans = room.seats.filter(item => !item.bot);
      if (humans.some(item => !item.ready && item.id !== room.hostId)) {
        return { error: 'Masih ada pemain yang belum menekan SIAP.' };
      }
      return startChessMatch(room, now);
    }

    case 'next': {
      if (room.status === 'playing') return { error: 'Pertandingan masih berjalan.' };
      if (!seat && playerId !== room.hostId) {
        return { error: 'Hanya pemain atau host yang bisa memulai babak berikutnya.' };
      }
      return startChessMatch(room, now);
    }

    case 'tolobby': {
      if (room.status === 'playing') return { error: 'Pertandingan masih berjalan.' };
      if (!seat && playerId !== room.hostId) {
        return { error: 'Hanya pemain atau host yang bisa kembali ke ruang tunggu.' };
      }
      room.status = 'lobby';
      room.match = null;
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
      room.matchNo = 0;
      room.lastResult = null;
      room.history = [];
      for (const item of room.seats) {
        item.wins = 0;
        item.losses = 0;
        item.draws = 0;
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
      if (room.status !== 'playing' || !room.match || room.match.phase !== 'play') {
        return { error: 'Pertandingan belum dimulai atau sudah selesai.' };
      }
      if (!seat) return { error: 'Penonton tidak bisa menggerakkan bidak.' };
      return applyMoveInternal(room, room.match, seatIndex, intent, now, false);
    }

    case 'offerdraw': {
      if (room.status !== 'playing' || !room.match || room.match.phase !== 'play') {
        return { error: 'Pertandingan tidak sedang berjalan.' };
      }
      if (!seat) return { error: 'Hanya pemain yang bisa menawarkan remis.' };
      if (room.match.drawOfferBy === playerId) {
        return { error: 'Tawaran remis sudah dikirim.' };
      }
      room.match.drawOfferBy = playerId;
      pushMatchLog(room.match, `${seat.name} menawarkan remis (draw).`);

      // Jika lawan adalah Bot, evaluasi langsung apakah bot menerima remis
      const oppSeat = room.seats.find(item => item.id !== playerId);
      if (oppSeat?.bot) {
        if (shouldBotAcceptDraw(room)) {
          finishMatch(room, room.match, {
            reason: 'agreement',
            label: `Remis disepakati (${oppSeat.name} menerima tawaran remis).`,
          }, now);
          return { room };
        }
        room.match.drawOfferBy = null;
        pushMatchLog(room.match, `${oppSeat.name} menolak remis dan memilih lanjut bertanding!`);
      }

      touch(room, now, null);
      return { room };
    }

    case 'acceptdraw': {
      if (room.status !== 'playing' || !room.match || room.match.phase !== 'play') {
        return { error: 'Pertandingan tidak sedang berjalan.' };
      }
      if (!seat) return { error: 'Hanya pemain yang bisa menerima remis.' };
      if (!room.match.drawOfferBy || room.match.drawOfferBy === playerId) {
        return { error: 'Tidak ada tawaran remis dari lawan.' };
      }
      finishMatch(room, room.match, {
        reason: 'agreement',
        label: 'Remis — Kedua pemain sepakat damai.',
      }, now);
      return { room };
    }

    case 'declinedraw': {
      if (room.status !== 'playing' || !room.match || room.match.phase !== 'play') {
        return { error: 'Pertandingan tidak sedang berjalan.' };
      }
      if (!seat) return { error: 'Hanya pemain yang bisa menolak remis.' };
      if (!room.match.drawOfferBy || room.match.drawOfferBy === playerId) {
        return { error: 'Tidak ada tawaran remis untuk ditolak.' };
      }
      room.match.drawOfferBy = null;
      pushMatchLog(room.match, `${seat.name} menolak tawaran remis.`);
      touch(room, now, null);
      return { room };
    }

    case 'resign': {
      if (room.status !== 'playing' || !room.match || room.match.phase !== 'play') {
        return { error: 'Pertandingan tidak sedang berjalan.' };
      }
      if (!seat) return { error: 'Hanya pemain yang bisa menyerah.' };
      const opp = room.seats.find(item => item.id !== playerId);
      const oppColor = room.match.whiteId === opp?.id ? 'w' : 'b';
      finishMatch(room, room.match, {
        winnerId: opp?.id || null,
        loserId: playerId,
        winnerColor: oppColor,
        reason: 'resign',
        label: `${seat.name} menyerah — ${opp?.name || 'Lawan'} menang!`,
      }, now);
      return { room };
    }

    case 'tick': {
      if (room.status !== 'playing' || !room.match || room.match.phase !== 'play') {
        return { error: 'Pertandingan tidak sedang berjalan.' };
      }
      const match = room.match;
      if (!match.deadline || now < match.deadline) {
        return { error: 'Belum melewati batas waktu.' };
      }

      const activeId = match.turn === 'w' ? match.whiteId : match.blackId;
      const activeIdx = room.seats.findIndex(item => item.id === activeId);
      const activeSeat = room.seats[activeIdx];
      if (!activeSeat) return { error: 'Pemain giliran tidak ditemukan.' };

      // Bila mode Blitz/Rapid aktif dan jam total habis -> kalah waktu
      if ((room.settings.clockMinutes || 0) > 0) {
        const elapsed = Math.max(0, now - (match.turnStartedAt || now));
        const rem = (match.turn === 'w' ? match.whiteMs : match.blackMs) - elapsed;
        if (rem <= 0) {
          const opp = room.seats.find(item => item.id !== activeSeat.id);
          const oppColor = match.turn === 'w' ? 'b' : 'w';
          if (match.turn === 'w') match.whiteMs = 0;
          else match.blackMs = 0;
          finishMatch(room, match, {
            winnerId: opp?.id || null,
            loserId: activeSeat.id,
            winnerColor: oppColor,
            reason: 'timeout',
            label: `Waktu habis! ${opp?.name || 'Lawan'} menang atas ${activeSeat.name}.`,
          }, now);
          return { room };
        }
      }

      // Hitung berapa kali berturut-turut pemain manusia kehabisan waktu langkah
      const streak = (match.timeouts[activeSeat.id] || 0) + 1;
      match.timeouts[activeSeat.id] = streak;
      if (!activeSeat.bot && streak >= 3) {
        const opp = room.seats.find(item => item.id !== activeSeat.id);
        const oppColor = match.turn === 'w' ? 'b' : 'w';
        finishMatch(room, match, {
          winnerId: opp?.id || null,
          loserId: activeSeat.id,
          winnerColor: oppColor,
          reason: 'timeout',
          label: `${activeSeat.name} AFK 3x berturut-turut — ${opp?.name || 'Lawan'} menang waktu.`,
        }, now);
        return { room };
      }

      // Jalankan langkah darurat otomatis agar meja tidak macet
      const autoMove = chooseChessBotMove(room, activeSeat.bot ? room.settings.botLevel : 'mudah');
      if (!autoMove) {
        return { error: 'Tidak ada langkah tersedia.' };
      }
      return applyMoveInternal(room, match, activeIdx, autoMove, now, true);
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
 *Semua langkah legal pada posisi FEN saat ini.
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

export function chessActions(room, viewerId) {
  const seatIndex = (room?.seats || []).findIndex(seat => seat.id === viewerId);
  const isPlayer = seatIndex >= 0;
  const isSpectator = !isPlayer && (room?.spectators || []).some(spec => spec.id === viewerId);
  const match = room?.match;

  if (!room || room.status !== 'playing' || !match || match.phase !== 'play') {
    return {
      isPlayer,
      isSpectator,
      myColor: null,
      isTurn: false,
      inCheck: false,
      canOfferDraw: false,
      canAcceptDraw: false,
      canResign: false,
    };
  }

  const myColor = match.whiteId === viewerId ? 'w' : match.blackId === viewerId ? 'b' : null;
  const isTurn = Boolean(myColor && match.turn === myColor);

  return {
    isPlayer,
    isSpectator,
    myColor,
    isTurn,
    inCheck: Boolean(match.inCheck),
    canOfferDraw: Boolean(isPlayer && !match.drawOfferBy),
    canAcceptDraw: Boolean(isPlayer && match.drawOfferBy && match.drawOfferBy !== viewerId),
    canResign: Boolean(isPlayer),
  };
}

export { evaluateMaterial };
