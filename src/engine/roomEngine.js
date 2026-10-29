import { startRound, discardCard, meldToTable, digWithCards, drawCard, calculateScores, countTableCards, expectedDeckTotal } from './gameRules.js';
import { playBotTurn, findMelds } from './botAI.js';

export const MAX_SEATS = 8;
// Avatar = id file di /public/avatars (potret Adventure Time). Disimpan sebagai
// string pendek di state room supaya ada di database tetap valid.
export const AVATARS = [
  'finn', 'jake', 'bmo', 'marceline', 'princess-bubblegum', 'ice-king', 'gunter', 'fiona',
  'flame-princess', 'lady-rainicorn', 'lemongrab', 'lumpy-space-princess', 'slime-princess',
  'tree-trunks', 'cake', 'peppermint-butler',
];
export const DEFAULT_AVATAR = AVATARS[0];
const LEGACY_AVATARS = ['🐯', '🦁', '🐼', '🦊', '🐸', '🐙', '🦉', '🐵'];
// State/code lama masih menyimpan emoji avatar; petakan ke potret baru supaya
// kursi pemain yang sedang duduk tidak kehilangan identitas.
export function normalizeAvatar(avatar) {
  if (AVATARS.includes(avatar)) return avatar;
  const legacyIndex = LEGACY_AVATARS.indexOf(avatar);
  return legacyIndex >= 0 ? AVATARS[legacyIndex] : null;
}
export const TURN_SECONDS_OPTIONS = [30, 45, 60, 90];

// Durasi ceremony pembagian kartu (ms): hitung mundur 3-2-1, kocok, lalu satu
// kartu per kursi secara melingkar selama 6 putaran. Semua klien menghitung
// reveal pakai startAt yang sama supaya animasinya sinkron.
export const dealDurationMs = seatCount => 2400 + 1100 + 90 * 6 * seatCount + 400;

export function createRoom({ code, hostId, name, avatar = AVATARS[0], maxDepth = 5, turnSeconds = 45, now = Date.now() }) {
  return {
    v: 2,
    code,
    hostId,
    status: 'lobby', // lobby | playing | round-end
    seats: [{ id: hostId, name, avatar, ready: true, bot: false, afk: false, online: true, score: 0 }],
    maxDepth,
    turnSeconds,
    shufflerId: hostId,
    round: 0,
    game: null,
    lastScores: null,
    pendingWinnerId: null,
    actions: [],
    rev: 0,
    createdAt: now,
    lastActionAt: now,
  };
}

const cloneRoom = room => ({ ...room, seats: (room.seats || []).map(seat => ({ ...seat })), actions: (room.actions || []).slice() });
const seatOf = (room, id) => room.seats.find(seat => seat.id === id);
const playerIndexOf = (room, id) => (room.game ? room.game.players.findIndex(player => player.id === id) : -1);

// Satu potret satu pemain: avatar yang sudah dipakai kursi lain (termasuk bot)
// terkunci. Pengguna keluar dulu dari kursinya kalau ingin menukar avatar.
export function avatarTakenBy(room, avatar, exceptId) {
  const id = normalizeAvatar(avatar);
  if (!id) return null;
  return (room?.seats || []).find(seat => seat.avatar === id && seat.id !== exceptId) || null;
}

export function firstFreeAvatar(room, exceptId) {
  const used = new Set((room?.seats || []).filter(seat => seat.id !== exceptId).map(seat => seat.avatar));
  return AVATARS.find(item => !used.has(item)) || null;
}

export function canStartRound(room) {
  const humans = room.seats.filter(seat => !seat.bot);
  if (room.seats.length < 2 || humans.length < 1) return false;
  // Yang wajib SIAP: manusia selain Host (Host yang menekan MULAI) dan selain
  // yang AFK/offline (kursinya dijalankan bot bila gilirannya lewat waktu).
  // Mereka berhak menunda SIAP untuk mengganti nama/avatar dulu.
  const mustReady = humans.filter(seat => seat.id !== room.hostId && !(seat.afk || seat.online === false));
  return mustReady.every(seat => seat.ready);
}

function beginDealing(room, now) {
  if (!canStartRound(room)) {
    const humans = room.seats.filter(seat => !seat.bot);
    const unready = humans.filter(seat => !seat.ready && seat.id !== room.hostId && !(seat.afk || seat.online === false));
    const why = room.seats.length < 2
      ? 'Minimal 2 pemain diperlukan untuk memulai.'
      : unready.length
        ? `Masih menunggu SIAP: ${unready.map(seat => seat.name).join(', ')}.`
        : 'Minimal 2 pemain siap diperlukan untuk memulai.';
    return { error: why };
  }
  // Aturan pengocok: ronde lanjutan dikocok oleh pemain dengan SKOR TERENDAH
  // (memberi kesempatan mengejar). Ronde pertama tetap host/shuffler awal.
  const lowestSeat = room.round > 0
    ? [...room.seats].reduce((low, seat) => ((seat.score ?? 0) < (low.score ?? 0) ? seat : low), room.seats[0])
    : null;
  const shufflerId = (lowestSeat && seatOf(room, lowestSeat.id)) ? lowestSeat.id
    : room.pendingWinnerId && seatOf(room, room.pendingWinnerId) ? room.pendingWinnerId : room.shufflerId;
  const shufflerIndex = Math.max(0, room.seats.findIndex(seat => seat.id === shufflerId));
  const duration = dealDurationMs(room.seats.length);
  const game = startRound(room.seats, { shufflerIndex });
  return {
    room: {
      ...room,
      status: 'playing',
      shufflerId,
      round: room.round + 1,
      pendingWinnerId: null,
      lastScores: null,
      // Ronde lalu tetap terlihat selama ronde baru berjalan (papan poin live).
      prevScores: room.lastScores || room.prevScores || null,
      game: {
        ...game,
        dealStartedAt: now,
        dealingUntil: now + duration,
      },
      rev: room.rev + 1,
      lastActionAt: now,
    },
  };
}

function foldRoundEnd(room, now) {
  const scores = calculateScores(room.game.players, { winnerId: room.game.winnerId, closerCard: room.game.closerCard });
  const seats = room.seats.map(seat => {
    const row = scores.find(item => item.playerId === seat.id);
    return row ? { ...seat, score: seat.score + row.total, ready: false } : { ...seat, ready: false };
  });
  return {
    ...room,
    status: 'round-end',
    seats,
    lastScores: scores,
    pendingWinnerId: room.game.winnerId || null,
    game: { ...room.game, dealingUntil: 0 },
    rev: room.rev + 1,
    lastActionAt: now,
  };
}

function finishBotHand(hand, hasTableMelds = false) {
  // Lanjutkan giliran yang sudah setengah jalan (sudah minum, belum buang):
  // turunkan meld terbaik dengan sisa minimal 1 kartu, lalu buang kartu terburuk.
  let nextHand = [...hand];
  const melds = [];
  for (const meld of findMelds(nextHand)) {
    const ids = new Set(meld.map(card => card.uid));
    if (meld.every(card => nextHand.some(item => item.uid === card.uid)) && nextHand.length - meld.length >= 1) {
      melds.push(meld);
      nextHand = nextHand.filter(card => !ids.has(card.uid));
    }
  }
  // ATURAN AS berlaku juga untuk kursi yang dijalankan bot: tanpa kombinasi
  // (lama di meja maupun yang baru diturunkan), As tidak boleh dibuang.
  const aceBlocked = !(melds.length || hasTableMelds);
  const discardable = aceBlocked ? nextHand.filter(card => String(card.value) !== 'A') : nextHand;
  const discard = discardable.length ? discardable[0] : null;
  return { hand: discard ? nextHand.filter(card => card.uid !== discard.uid) : nextHand, melds, discard };
}

// Kartu buangan bot tercatat seperti buangan manusia: Joker kena -150 kecuali
// ia kartu penutup, As dicatat (netral) untuk penjelasan di layar skor.
const discardCounters = (seat, discard, closed) => ({
  ...seat,
  discardedJokers: (seat.discardedJokers || 0) + ((discard && !closed && (discard.kind === 'joker' || discard.value === 'JOKER')) ? 1 : 0),
  discardedAces: (seat.discardedAces || 0) + ((discard && String(discard.value) === 'A') ? 1 : 0),
});

function runBotForSeat(room, seatIndex, now) {
  const game = room.game;
  const player = game.players[seatIndex];
  if (!player) return { error: 'Kursi tidak ditemukan.' };
  if (game.phase === 'draw') {
    const bot = playBotTurn({ hand: player.hand, drawPile: game.drawPile, discardPile: game.discardPile, maxDepth: room.maxDepth, hasMelds: (player.melds || []).length > 0 });
    let next = {
      ...game,
      players: game.players.map((seat, index) => (index === seatIndex ? discardCounters({ ...seat, hand: bot.hand, melds: [...seat.melds, ...bot.melds] }, bot.discarded, !bot.hand.length) : seat)),
      drawPile: bot.drawPile,
      discardPile: bot.discardPile,
      turn: (seatIndex + 1) % game.players.length,
      phase: 'draw',
    };
    // Bot menang dengan buangan terakhir, atau dek habis setelah gilirannya.
    // Kartu penutup dicatat agar bonus "Mati Sampah" (×2 / Joker +150) tetap
    // dibayar, sama seperti jalur buangan manusia.
    const botHandEmpty = !bot.hand.length;
    if (botHandEmpty) {
      next = { ...next, status: 'finished', winnerId: player.id, finishReason: 'tutup', closerCard: bot.discarded };
    } else if (!bot.drawPile.length) {
      next = { ...next, status: 'finished', finishReason: 'deck-habis' };
    }
    const seats = player.bot ? room.seats : room.seats.map(seat => (seat.id === player.id ? { ...seat, afk: true } : seat));
    let nextRoom = { ...room, game: next, seats, rev: room.rev + 1, lastActionAt: now };
    if (next.status === 'finished') nextRoom = foldRoundEnd(nextRoom, now);
    return { room: nextRoom };
  }
  const finish = finishBotHand(player.hand, (player.melds || []).length > 0);
  let next = {
    ...game,
    players: game.players.map((seat, index) => (index === seatIndex ? discardCounters({ ...seat, hand: finish.hand, melds: [...seat.melds, ...finish.melds] }, finish.discard, !finish.hand.length) : seat)),
    discardPile: finish.discard ? [...game.discardPile, finish.discard] : game.discardPile,
    turn: (seatIndex + 1) % game.players.length,
    phase: 'draw',
  };
  if (!finish.hand.length) next = { ...next, status: 'finished', winnerId: player.id, finishReason: 'tutup', closerCard: finish.discard };
  else if (!game.drawPile.length) next = { ...next, status: 'finished', finishReason: 'deck-habis' };
  const seats = player.bot ? room.seats : room.seats.map(seat => (seat.id === player.id ? { ...seat, afk: true } : seat));
  let nextRoom = { ...room, game: next, seats, rev: room.rev + 1, lastActionAt: now };
  if (next.status === 'finished') nextRoom = foldRoundEnd(nextRoom, now);
  return { room: nextRoom };
}

// Penerap intent murni: dipanggil di dalam transaction (Firebase) atau pada
// snapshot lokal termutakhir, sehingga penjaga giliran bersifat atomik.
export function sanitizeRoom(r) {
  if (!r) return r;
  const seats = (r.seats || []).map(seat => ({
    ...seat,
    hand: seat.hand || [],
    melds: seat.melds || [],
  }));
  const game = r.game ? {
    ...r.game,
    players: (r.game.players || []).map(player => ({
      ...player,
      hand: player.hand || [],
      melds: player.melds || [],
    })),
    discardPile: r.game.discardPile || [],
    drawPile: r.game.drawPile || [],
  } : null;
  return {
    ...r,
    seats,
    actions: r.actions || [],
    game,
  };
}

// Lanjut ronde TIDAK memaksa pemain hidup menjadi SIAP: mereka berhak
// mengganti nama/avatar dulu lalu menekan SIAP sendiri. Yang otomatis
// di-SIAP-kan hanyalah kursi AFK/offline — mereka tidak sedang menimbang
// identitas, dan bot menjalankan gilirannya bila lewat waktu.
export function autoReadySeats(room) {
  const humans = (room.seats || []).filter(seat => !seat.bot);
  const stuck = humans.some(seat => !seat.ready && (seat.afk || seat.online === false));
  if (!stuck) return null;
  const seats = room.seats.map(seat => {
    if (seat.bot || seat.ready) return seat;
    if (seat.afk || seat.online === false) return { ...seat, ready: true };
    return seat;
  });
  const next = { ...room, seats, rev: (room.rev || 0) + 1, lastActionAt: Date.now() };
  return { room: next };
}

export function applyIntent(rawRoom, intent, actorId, now = Date.now()) {
  if (!rawRoom) return { error: 'Room tidak ditemukan.' };
  const room = sanitizeRoom(rawRoom);
  const actor = intent?.type === 'sit' ? null : seatOf(room, actorId);

  switch (intent?.type) {
    case 'sit': {
      const existing = seatOf(room, actorId);
      // Tanpa kursi & ronde sedang berjalan = penonton. Kalau orang yang SUDAH
      // duduk memanggil sit (mis. browser di-refresh / gabung ulang lewat link),
      // jangan ditolak: cukup perbarui nama/avatar supaya kartunya tetap terbaca.
      if (!existing) {
        if (room.seats.length >= MAX_SEATS) return { error: 'Room sudah penuh (8 kursi).' };
        const wanted = normalizeAvatar(intent.avatar);
        const holder = wanted ? avatarTakenBy(room, wanted, actorId) : null;
        if (holder) return { error: `Avatar itu sudah dipakai ${holder.name}. Pilih avatar lain.` };
        const avatar = wanted || firstFreeAvatar(room, actorId) || AVATARS[0];
        const seats = [...room.seats, { id: actorId, name: (intent.name || 'Pemain').slice(0, 18), avatar, ready: false, bot: false, afk: false, online: true, score: 0 }];
        return { room: { ...room, seats, rev: room.rev + 1 } };
      }
      // kursi sudah ada: segarkan identitas & status online/AFK. Avatar yang
      // sedang dipakai kursi lain TIDAK boleh direbut.
      const wanted = normalizeAvatar(intent.avatar);
      const holder = wanted && wanted !== existing.avatar ? avatarTakenBy(room, wanted, actorId) : null;
      if (holder) return { error: `Avatar itu sudah dipakai ${holder.name}. Pilih avatar lain.` };
      const seats = room.seats.map(seat => (seat.id === actorId
        ? { ...seat, name: intent.name || seat.name, avatar: wanted || seat.avatar, afk: false, online: true }
        : seat));
      return { room: { ...room, seats, rev: room.rev + 1, lastActionAt: now } };
    }
    case 'stand': {
      if (!actor) return { error: 'Kamu belum duduk di kursi mana pun.' };
      if (room.status === 'playing') return { error: 'Tidak bisa meninggalkan kursi saat ronde berjalan.' };
      const seats = room.seats.filter(seat => seat.id !== actorId).map(seat => ({ ...seat }));
      if (!seats.length) return { error: 'Kursi terakhir tidak bisa ditinggalkan; keluar lewat tombol Keluar Meja.' };
      let hostId = room.hostId;
      if (hostId === actorId) hostId = seats[0].id;
      return { room: { ...room, seats, hostId, shufflerId: room.shufflerId === actorId ? hostId : room.shufflerId, rev: room.rev + 1 } };
    }
    case 'next-round': {
      if (room.status !== 'round-end') return { error: 'Ronde belum selesai.' };
      // Melanjutkan ronde = memulai ronde: wewenang Host. Pemain lain cukup
      // SIAP — mereka mungkin masih mengganti nama/avatar di sela ronde.
      // Pengecualian: Host hengkang/AFK → siapa pun boleh melanjutkan supaya
      // meja tidak macet selamanya.
      const hostSeat = seatOf(room, room.hostId);
      const hostGone = !hostSeat || hostSeat.afk || hostSeat.online === false;
      if (actor?.id !== room.hostId && !hostGone) {
        return { error: 'Hanya Host yang bisa melanjutkan ronde. Tekan SIAP kalau sudah siap.' };
      }
      const promoted = autoReadySeats(room);
      // promoted bisa null = tidak ada kursi AFK yang perlu di-SIAP-kan —
      // tetap lanjut ke beginDealing (dia yang menjaga "masih ada yang belum SIAP").
      return beginDealing(cloneRoom(promoted ? promoted.room : room), now);
    }
    case 'ready': {
      if (!actor) return { error: 'Kamu belum duduk.' };
      const seats = room.seats.map(seat => (seat.id === actorId ? { ...seat, ready: Boolean(intent.value) } : seat));
      return { room: { ...room, seats, rev: room.rev + 1 } };
    }
    case 'settings': {
      if (actor?.id !== room.hostId) return { error: 'Hanya Host yang bisa mengubah pengaturan meja.' };
      if (room.status === 'playing') return { error: 'Pengaturan hanya bisa diubah sebelum ronde dimulai.' };
      return { room: { ...room, maxDepth: intent.maxDepth ?? room.maxDepth, turnSeconds: TURN_SECONDS_OPTIONS.includes(intent.turnSeconds) ? intent.turnSeconds : room.turnSeconds, rev: room.rev + 1 } };
    }
    case 'add-bot': {
      if (actor?.id !== room.hostId) return { error: 'Hanya Host yang bisa menambah Bot.' };
      if (room.status === 'playing') return { error: 'Bot hanya bisa ditambah sebelum ronde dimulai.' };
      if (room.seats.length >= MAX_SEATS) return { error: 'Room sudah penuh (8 kursi).' };
      const used = new Set(room.seats.map(seat => seat.avatar));
      const avatar = AVATARS.find(item => !used.has(item)) || AVATARS[0];
      // Nama bot harus unik: setelah kick "Bot 2" lalu tambah bot lagi, jangan
      // lahir "Bot 3" kembar — cari nomor pertama yang belum terpakai.
      const names = new Set(room.seats.map(seat => seat.name));
      let botNumber = 1;
      while (names.has(`Bot ${botNumber}`)) botNumber += 1;
      const seats = [...room.seats, { id: `bot-${now}-${botNumber}`, name: `Bot ${botNumber}`, avatar, ready: true, bot: true, afk: false, online: true, score: 0 }];
      return { room: { ...room, seats, rev: room.rev + 1 } };
    }
    case 'kick': {
      if (actor?.id !== room.hostId) return { error: 'Hanya Host yang bisa mengeluarkan pemain.' };
      if (room.status === 'playing') return { error: 'Tidak bisa mengeluarkan pemain saat ronde berjalan.' };
      if (intent.seatId === room.hostId) return { error: 'Host tidak bisa mengeluarkan dirinya sendiri.' };
      const seats = room.seats.filter(seat => seat.id !== intent.seatId);
      return { room: { ...room, seats, rev: room.rev + 1 } };
    }
    case 'start': {
      if (actor?.id !== room.hostId) return { error: 'Hanya Host (Pengocok) yang bisa memulai permainan.' };
      if (room.status === 'playing') return { error: 'Permainan sudah berjalan.' };
      return beginDealing(cloneRoom(room), now);
    }
    case 'presence': {
      if (!actor) return { error: 'Kamu belum duduk.' };
      const seats = room.seats.map(seat => (seat.id === actorId ? { ...seat, online: Boolean(intent.online) } : seat));
      return { room: { ...room, seats, rev: room.rev + 1 } };
    }
    case 'offline': {
      // Pemain menutup meja/keluar. Kursi, kartu, dan skor TETAP disimpan;
      // hanya status online/AFK yang berubah supaya bot bisa melanjutkan
      // giliran bila waktunya habis.
      if (!seatOf(room, actorId)) return { error: 'Kamu belum duduk.' };
      const seats = room.seats.map(seat => (seat.id === actorId ? { ...seat, afk: true, online: false } : seat));
      return { room: { ...room, seats, rev: room.rev + 1, lastActionAt: now } };
    }
    case 'reclaim': {
      // actor diambil dari snapshot DI DALAM transaksi, jadi pengecekan cukup
      // berdasarkan kursi; status AFK/online selalu diset ulang.
      if (!seatOf(room, actorId)) return { error: 'Kamu belum duduk.' };
      const seats = room.seats.map(seat => (seat.id === actorId ? { ...seat, afk: false, online: true } : seat));
      // ronde yang sedang berjalan tetap menghormati giliran pemain yang baru
      // kembali: bila giliran sudah diambil bot, ditunda sampai giliran berikutnya.
      return { room: { ...room, seats, rev: room.rev + 1, lastActionAt: now } };
    }
    case 'ghost': {
      const actions = (room.actions || []).filter(action => action.playerId !== actorId);
      actions.push({ playerId: actorId, name: actor?.name || 'Pemain', activeAction: intent.activeAction, at: now });
      return { room: { ...room, actions: actions.slice(-12) } };
    }
    case 'draw': {
      if (!actor) return { error: 'Kamu belum duduk di meja ini.' };
      if (room.status !== 'playing' || !room.game) return { error: 'Permainan belum berjalan.' };
      if (now < room.game.dealingUntil) return { error: 'Pembagian kartu belum selesai.' };
      const index = playerIndexOf(room, actorId);
      const result = drawCard(room.game, index);
      if (result.error) return { error: result.error };
      const seats = actor.afk ? room.seats.map(seat => (seat.id === actorId ? { ...seat, afk: false } : seat)) : room.seats;
      return { room: { ...room, game: result.state, seats, rev: room.rev + 1, lastActionAt: now } };
    }
    case 'dig': {
      if (!actor) return { error: 'Kamu belum duduk di meja ini.' };
      if (room.status !== 'playing' || !room.game) return { error: 'Permainan belum berjalan.' };
      if (now < room.game.dealingUntil) return { error: 'Pembagian kartu belum selesai.' };
      const index = playerIndexOf(room, actorId);
      const result = digWithCards(room.game, index, intent.discardIndex, intent.uids, room.maxDepth);
      if (result.error) return { error: result.error };
      const seats = actor.afk ? room.seats.map(seat => (seat.id === actorId ? { ...seat, afk: false } : seat)) : room.seats;
      return { room: { ...room, game: result.state, seats, rev: room.rev + 1, lastActionAt: now } };
    }
    case 'meld': {
      if (!actor) return { error: 'Kamu belum duduk di meja ini.' };
      if (room.status !== 'playing' || !room.game) return { error: 'Permainan belum berjalan.' };
      if (now < room.game.dealingUntil) return { error: 'Pembagian kartu belum selesai.' };
      const index = playerIndexOf(room, actorId);
      const byId = new Map(room.game.players[index].hand.map(card => [card.uid, card]));
      const cards = (intent.uids || []).map(uid => byId.get(uid)).filter(Boolean);
      const result = meldToTable(room.game, index, cards);
      if (result.error) return { error: result.error };
      const seats = actor.afk ? room.seats.map(seat => (seat.id === actorId ? { ...seat, afk: false } : seat)) : room.seats;
      return { room: { ...room, game: result.state, seats, rev: room.rev + 1, lastActionAt: now } };
    }
    case 'discard': {
      if (!actor) return { error: 'Kamu belum duduk di meja ini.' };
      if (room.status !== 'playing' || !room.game) return { error: 'Permainan belum berjalan.' };
      if (now < room.game.dealingUntil) return { error: 'Pembagian kartu belum selesai.' };
      const index = playerIndexOf(room, actorId);
      const result = discardCard(room.game, index, intent.uid);
      if (result.error) return { error: result.error };
      const seats = actor.afk ? room.seats.map(seat => (seat.id === actorId ? { ...seat, afk: false } : seat)) : room.seats;
      let nextRoom = { ...room, game: result.state, seats, rev: room.rev + 1, lastActionAt: now };
      if (result.state.status === 'finished') nextRoom = foldRoundEnd(nextRoom, now);
      return { room: nextRoom };
    }
    case 'bot': {
      if (room.status !== 'playing' || !room.game) return { error: 'Permainan belum berjalan.' };
      if (now < room.game.dealingUntil) return { error: 'Pembagian kartu belum selesai.' };
      const seatIndex = room.game.turn;
      const player = room.game.players[seatIndex];
      const seat = seatOf(room, player.id);
      // Hanya kursi bot atau kursi manusia AFK/offline yang boleh dijalankan bot.
      if (!player.bot && !(seat?.afk || seat?.online === false)) return { error: 'Kursi itu masih dikendalikan pemainnya.' };
      return runBotForSeat(cloneRoom(room), seatIndex, now);
    }
    case 'timeout': {
      if (room.status !== 'playing' || !room.game) return { error: 'Permainan belum berjalan.' };
      if (now < room.game.dealingUntil) return { error: 'Pembagian kartu belum selesai.' };
      if (now - room.lastActionAt < room.turnSeconds * 1000) return { error: 'Giliran belum habis waktunya.' };
      return runBotForSeat(cloneRoom(room), room.game.turn, now);
    }
    default:
      return { error: 'Perintah tidak dikenal.' };
  }
}

export function auditCards(room) {
  if (!room?.game) return { ok: true, total: 0, expected: 0, diff: 0, idle: true };
  const total = countTableCards(room.game);
  const expected = expectedDeckTotal(room.game.players.length);
  const diff = total - expected;
  return { ok: diff === 0, total, expected, diff, idle: false };
}
