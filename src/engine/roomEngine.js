import { startRound, discardCard, meldToTable, digWithCards, drawCard, calculateScores, countTableCards, expectedDeckTotal } from './gameRules.js';
import { playBotTurn, findMelds, chooseBotAction } from './botAI.js';
import { resolveCommand } from '../utils/slashCommands.js';
import { cheatsEnabled } from '../utils/cheats.js';

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
// Target skor tamat turnamen. 0 = Tanpa Batas (meja sampai bosen).
export const TARGET_SCORE_OPTIONS = [300, 500, 1000, 0];
export const DEFAULT_TARGET_SCORE = 500;

// Durasi ceremony pembagian kartu (ms): hitung mundur 3-2-1, kocok, lalu satu
// kartu per kursi secara melingkar selama 6 putaran. Semua klien menghitung
// reveal pakai startAt yang sama supaya animasinya sinkron.
export const dealDurationMs = seatCount => 2400 + 1100 + 90 * 6 * seatCount + 400;

export function createRoom({ code, hostId, name, avatar = AVATARS[0], maxDepth = 5, turnSeconds = 45, targetScore = DEFAULT_TARGET_SCORE, now = Date.now() }) {
  return {
    v: 2,
    code,
    hostId,
    status: 'lobby', // lobby | playing | round-end
    seats: [{ id: hostId, name, avatar, ready: true, bot: false, afk: false, online: true, score: 0 }],
    maxDepth,
    turnSeconds,
    targetScore: TARGET_SCORE_OPTIONS.includes(targetScore) ? targetScore : DEFAULT_TARGET_SCORE,
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

// Presence dipakai sebagai sumber kebenaran kedua (di samping seat.online):
// pemain yang menutup tab tanpa sempat mengirim intent 'offline' tetap
// terdeteksi hilang, sehingga ronde berikutnya tidak tersandera kursinya.
// Toleransi 2-3 heartbeat (15 detik) = 45 detik, selaras evaluatePresence.
export const PRESENCE_STALE_MS = 45000;
export function seatOnlineStatus(room, seat, now = Date.now()) {
	if (!seat || seat.bot) return true;
	if (seat.online === false) return false;
	const entry = room?.presence?.[seat.id];
	if (!entry) return true; // presence belum terkirim ≠ offline (mode lokal dsb.)
	if (entry.online === false) return false;
	const lastSeen = Number(entry.lastSeen) || 0;
	return lastSeen <= 0 || now - lastSeen <= PRESENCE_STALE_MS;
}

export function canStartRound(room, now = Date.now()) {
	const humans = room.seats.filter(seat => !seat.bot);
	if (room.seats.length < 2 || humans.length < 1) return false;
	// Yang wajib SIAP: manusia selain Host (Host yang menekan MULAI) dan selain
	// yang AFK/offline (presence mati/stale ikut dianggap offline — kursinya
	// dijalankan bot bila gilirannya lewat waktu).
	const mustReady = humans.filter(seat => seat.id !== room.hostId && !(seat.afk || !seatOnlineStatus(room, seat, now)));
	return mustReady.every(seat => seat.ready);
}

/**
 * Cheat "sebelum ronde" (perintah rahasia di ruang tunggu): beri pemain sampai
 * tiga kartu As hasil kocokan.
 *
 * KENAPA MENUKAR, BUKAN MENAMBAH: As diambil dari tumpukan minum dan kartu
 * tangan yang digantikan dikembalikan ke tumpukan. Jumlah kartu di meja tidak
 * berubah sama sekali, jadi audit 55/110 tetap pas dan tidak ada kartu "lahir".
 *
 * Bila tumpukan sudah tidak punya As (mis. sudah banyak dibagikan), yang
 * didapat lebih sedikit — tidak ada yang dipaksakan.
 *
 * @param {object} game - state hasil `startRound`.
 * @param {Set<string>} seatIds - id pemain yang menandai `pendingAces`.
 * @returns {object} game baru (players & drawPile disesuaikan).
 */
export function dealAcesTo(game, seatIds) {
  const drawPile = [...(game.drawPile || [])];
  const players = game.players.map(player => {
    if (!seatIds.has(player.id)) return player;
    const hand = [...(player.hand || [])];
    let gained = 0;
    for (let i = 0; i < hand.length && gained < 3; i += 1) {
      if (String(hand[i].value) === 'A') continue;
      const aceIndex = drawPile.findIndex(card => String(card.value) === 'A');
      if (aceIndex < 0) break;
      const ace = drawPile[aceIndex];
      drawPile.splice(aceIndex, 1);
      drawPile.push(hand[i]); // kartu lama kembali ke tumpukan (posisi belakang)
      hand[i] = ace;
      gained += 1;
    }
    return { ...player, hand };
  });
  return { ...game, players, drawPile };
}

function beginDealing(room, now) {
	if (!canStartRound(room, now)) {
		const humans = room.seats.filter(seat => !seat.bot);
		const unready = humans.filter(seat => !seat.ready && seat.id !== room.hostId && !(seat.afk || !seatOnlineStatus(room, seat, now)));
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
  const shufflerSeat = room.seats[shufflerIndex];
  const isHuman = shufflerSeat && !shufflerSeat.bot;
  const duration = dealDurationMs(room.seats.length);
  const manualTimeout = 25000;
  const dealingUntil = isHuman ? now + manualTimeout : now + duration;
  const shuffleState = isHuman ? 'manual' : 'dealing';

	const acesFor = new Set(
		cheatsEnabled() ? room.seats.filter(seat => seat.pendingAces).map(seat => seat.id) : []
	);
	const seatsForDeal = room.seats.map(seat => {
		if (!('pendingAces' in seat)) return seat;
		const { pendingAces, ...rest } = seat;
		return rest;
	});
	const dealt = startRound(seatsForDeal, { shufflerIndex });
	const game = acesFor.size ? dealAcesTo(dealt, acesFor) : dealt;
	return {
		room: {
			...room,
			seats: seatsForDeal,
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
				dealingUntil,
				shuffleState,
				shuffleCount: 0,
				shuffleDeadline: now + manualTimeout,
				lastShuffleAt: 0,
			},
			rev: room.rev + 1,
			// Timer giliran pertama baru berjalan PENUH setelah upacara selesai:
			// lastActionAt = dealingUntil, bukan now (dulu durasi upacara memakan
			// waktu giliran Pengocok).
			lastActionAt: dealingUntil,
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
// ia Kartu Tutupan, As (netral) juga dikecualikan saat menutup ronde — sama
// persis dengan jalur buangan manusia di discardCard.
const discardCounters = (seat, discard, closed) => ({
	...seat,
	discardedJokers: (seat.discardedJokers || 0) + ((discard && !closed && (discard.kind === 'joker' || discard.value === 'JOKER')) ? 1 : 0),
	discardedAces: (seat.discardedAces || 0) + ((discard && !closed && String(discard.value) === 'A') ? 1 : 0),
});

/**
 * Bot hanya MINUM untuk kursi manusia yang kehabisan waktu (F-38).
 *
 * Pengambilalihan kursi manusia dibagi DUA TAHAP supaya pemain masih punya
 * kesempatan kembali dan membuang kartunya sendiri:
 *
 *   tahap 1 (fase draw)  → bot minum/gali, giliran TIDAK berpindah,
 *                          `lastActionAt` direset = timer penuh baru
 *   tahap 2 (fase play)  → `finishBotHand` di `runBotForSeat` (kombinasi + buang)
 *
 * Dulu satu intent langsung menghabiskan giliran (minum + kombinasi + buang),
 * jadi pemain yang kehilangan fokus beberapa detik kehilangan giliran penuh —
 * termasuk kartu bagusnya ikut dibuang bot.
 *
 * Keputusan minum vs gali memakai otak bot yang sama (`chooseBotAction`) agar
 * kursi yang diambil alih tidak jadi lebih bodoh daripada bot biasa.
 *
 * @param {object} room - room aktif (sudah di-clone pemanggil).
 * @param {number} seatIndex - kursi yang diambil alih.
 * @param {number} now - waktu server.
 * @returns {{room: object}|{error: string}}
 */
function botDrawOnly(room, seatIndex, now) {
  const game = room.game;
  const player = game.players[seatIndex];
  const action = chooseBotAction({ hand: player.hand, discardPile: game.discardPile, maxDepth: room.maxDepth });

  let state;
  if (action.type === 'dig') {
    const dug = digWithCards(game, seatIndex, action.targetIndex, [], room.maxDepth);
    if (dug.error) return { error: dug.error };
    state = dug.state;
  } else {
    const drawn = drawCard(game, seatIndex);
    if (drawn.error) {
      // Tumpukan minum kosong: tidak ada yang bisa diambil. Ronde ditutup
      // seperti jalur buangan terakhir (dek habis), bukan menggantung.
      if (!(game.drawPile || []).length) {
        const ended = { ...game, status: 'finished', phase: 'draw', finishReason: 'deck-habis' };
        return { room: foldRoundEnd({ ...room, game: ended, rev: room.rev + 1, lastActionAt: now }, now) };
      }
      return { error: drawn.error };
    }
    state = drawn.state;
  }

  const seats = room.seats.map(seat => (seat.id === player.id ? { ...seat, afk: true } : seat));
  return { room: { ...room, game: state, seats, rev: room.rev + 1, lastActionAt: now } };
}

function runBotForSeat(room, seatIndex, now) {
  const game = room.game;
  const player = game.players[seatIndex];
  if (!player) return { error: 'Kursi tidak ditemukan.' };
  // F-38: kursi MANUSIA (timeout/AFK) diambil alih dua tahap — tahap minum
  // dulu, lalu pemain diberi timer penuh untuk membuang. Kursi bot asli tetap
  // menyelesaikan giliran penuh dalam satu langkah supaya meja tidak menunggu
  // timer dua kali untuk setiap bot.
  if (!player.bot && game.phase === 'draw') {
    return botDrawOnly(room, seatIndex, now);
  }
  if (game.phase === 'draw') {
    const bot = playBotTurn({ hand: player.hand, drawPile: game.drawPile, discardPile: game.discardPile, maxDepth: room.maxDepth, hasMelds: (player.melds || []).length > 0 });
    let next = {
      ...game,
      players: game.players.map((seat, index) => (index === seatIndex ? discardCounters({ ...seat, hand: bot.hand, melds: [...seat.melds, ...bot.melds] }, bot.discarded, !bot.hand.length) : seat)),
      drawPile: bot.drawPile,
      discardPile: bot.discardPile,
      turn: (seatIndex + 1) % game.players.length,
      phase: 'draw',
      turnTimerResetFor: null,
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
    turnTimerResetFor: null,
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
export function autoReadySeats(room, now = Date.now()) {
	const humans = (room.seats || []).filter(seat => !seat.bot);
	const stuck = humans.some(seat => !seat.ready && (seat.afk || !seatOnlineStatus(room, seat, now)));
	if (!stuck) return null;
	const seats = room.seats.map(seat => {
		if (seat.bot || seat.ready) return seat;
		if (seat.afk || !seatOnlineStatus(room, seat, now)) return { ...seat, ready: true };
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
      // sedang dipakai kursi lain TIDAK boleh direbut. lastActionAt SENGAJA
      // tidak disentuh: sit dipanggil ulang setiap refresh/reconnect, dan
      // dulu itu me-reset timer giliran global untuk seluruh meja.
      const wanted = normalizeAvatar(intent.avatar);
      const holder = wanted && wanted !== existing.avatar ? avatarTakenBy(room, wanted, actorId) : null;
      if (holder) return { error: `Avatar itu sudah dipakai ${holder.name}. Pilih avatar lain.` };
      const seats = room.seats.map(seat => (seat.id === actorId
        ? { ...seat, name: intent.name || seat.name, avatar: wanted || seat.avatar, afk: false, online: true }
        : seat));
      return { room: { ...room, seats, rev: room.rev + 1 } };
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
      const promoted = autoReadySeats(room, now);
      // promoted bisa null = tidak ada kursi AFK yang perlu di-SIAP-kan —
      // tetap lanjut ke beginDealing (dia yang menjaga "masih ada yang belum SIAP").
      return beginDealing(cloneRoom(promoted ? promoted.room : room), now);
    }
    case 'reset-tournament': {
      // Tamat turnamen (skor >= targetScore) → Host me-reset skor semua kursi
      // dan meja balik ke lobby, siap turnamen baru. Hanya sah saat round-end:
      // di tengah ronde ini bisa dipakai menipu skor.
      if (actor?.id !== room.hostId) return { error: 'Hanya Host yang bisa mereset turnamen.' };
      if (room.status !== 'round-end') return { error: 'Turnamen hanya bisa direset setelah ronde selesai.' };
      return { room: { ...room, ...resetScoresPatch(room), rev: room.rev + 1, lastActionAt: now } };
    }
    case 'ready': {
      if (!actor) return { error: 'Kamu belum duduk.' };
      const seats = room.seats.map(seat => (seat.id === actorId ? { ...seat, ready: Boolean(intent.value) } : seat));
      return { room: { ...room, seats, rev: room.rev + 1 } };
    }
    case 'settings': {
      if (actor?.id !== room.hostId) return { error: 'Hanya Host yang bisa mengubah pengaturan meja.' };
      if (room.status === 'playing') return { error: 'Pengaturan hanya bisa diubah sebelum ronde dimulai.' };
      return {
        room: {
          ...room,
          maxDepth: intent.maxDepth ?? room.maxDepth,
          turnSeconds: TURN_SECONDS_OPTIONS.includes(intent.turnSeconds) ? intent.turnSeconds : room.turnSeconds,
          targetScore: TARGET_SCORE_OPTIONS.includes(intent.targetScore) ? intent.targetScore : room.targetScore ?? DEFAULT_TARGET_SCORE,
          rev: room.rev + 1,
        },
      };
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
    case 'shuffle': {
      if (actor?.id !== room.shufflerId) return { error: 'Hanya Pengocok yang bisa mengocok kartu.' };
      if (room.status !== 'playing' || !room.game || room.game.shuffleState !== 'manual') {
        return { error: 'Bukan saatnya mengocok kartu.' };
      }
      const shufflerIndex = Math.max(0, room.seats.findIndex(seat => seat.id === room.shufflerId));
      const seatsForDeal = room.seats.map(seat => {
        const { pendingAces: _pendingAces, ...rest } = seat;
        return rest;
      });
      const dealt = startRound(seatsForDeal, { shufflerIndex });
      const acesFor = new Set(
        cheatsEnabled() ? room.seats.filter(seat => seat.pendingAces).map(seat => seat.id) : []
      );
      const reDealtGame = acesFor.size ? dealAcesTo(dealt, acesFor) : dealt;
      return {
        room: {
          ...room,
          game: {
            ...room.game,
            ...reDealtGame,
            dealStartedAt: room.game.dealStartedAt,
            dealingUntil: room.game.dealingUntil,
            shuffleState: 'manual',
            shuffleCount: (room.game.shuffleCount || 0) + 1,
            shuffleDeadline: room.game.shuffleDeadline,
            lastShuffleAt: now,
          },
          rev: room.rev + 1,
        },
      };
    }
    case 'deal': {
      const isShuffler = actor?.id === room.shufflerId;
      const shufflerSeat = room.seats.find(s => s.id === room.shufflerId);
      const isBotOrExpired = shufflerSeat?.bot || (room.game?.shuffleDeadline && now >= room.game.shuffleDeadline);
      if (!isShuffler && !isBotOrExpired) {
        return { error: 'Hanya Pengocok yang bisa membagikan kartu.' };
      }
      if (room.status !== 'playing' || !room.game || room.game.shuffleState !== 'manual') {
        return { error: 'Bukan saatnya membagikan kartu.' };
      }
      const flyersDuration = 90 * 6 * room.seats.length + 800;
      const dealingUntil = now + flyersDuration;
      return {
        room: {
          ...room,
          game: {
            ...room.game,
            shuffleState: 'dealing',
            dealStartedAt: now,
            dealingUntil,
          },
          lastActionAt: dealingUntil,
          rev: room.rev + 1,
        },
      };
    }
    case 'presence': {
      if (!actor) return { error: 'Kamu belum duduk.' };
      const seats = room.seats.map(seat => (seat.id === actorId ? { ...seat, online: Boolean(intent.online) } : seat));
      return { room: { ...room, seats, rev: room.rev + 1 } };
    }
    case 'offline': {
      // Pemain menutup meja/keluar. Kursi, kartu, dan skor TETAP disimpan;
      // hanya status online/AFK yang berubah supaya bot bisa melanjutkan
      // gilirannya bila waktunya habis. lastActionAt tidak disentuh — dulu
      // offline↔reclaim berulang bisa dipakai untuk menghindari timeout.
      if (!seatOf(room, actorId)) return { error: 'Kamu belum duduk.' };
      const seats = room.seats.map(seat => (seat.id === actorId ? { ...seat, afk: true, online: false } : seat));
      return { room: { ...room, seats, rev: room.rev + 1 } };
    }
    case 'reclaim': {
      // actor diambil dari snapshot DI DALAM transaksi, jadi pengecekan cukup
      // berdasarkan kursi; status AFK/online selalu diset ulang.
      const seat = seatOf(room, actorId);
      if (!seat) return { error: 'Kamu belum duduk.' };
      const wasAway = seat.afk || seat.online === false;
      const seats = room.seats.map(item => (item.id === actorId ? { ...item, afk: false, online: true } : item));
      // Reset timer giliran TIDAK lagi global: hanya bila kursi yang kembali
      // memang sedang giliran + tadi AFK/offline, dan maksimal SATU kali per
      // giliran (penanda turnTimerResetFor) — mencegah exploit spam reclaim
      // untuk menghindari timeout.
      let game = room.game;
      let lastActionAt = room.lastActionAt;
      if (
        room.status === 'playing' && game && wasAway &&
        game.players[game.turn]?.id === actorId &&
        game.turnTimerResetFor !== actorId
      ) {
        lastActionAt = now;
        game = { ...game, turnTimerResetFor: actorId };
      }
      // ronde yang sedang berjalan tetap menghormati giliran pemain yang baru
      // kembali: bila giliran sudah diambil bot, ditunda sampai giliran berikutnya.
      return { room: { ...room, seats, game, lastActionAt, rev: room.rev + 1 } };
    }
    case 'ghost': {
      const actions = (room.actions || []).filter(action => action.playerId !== actorId);
      actions.push({ playerId: actorId, name: actor?.name || 'Pemain', activeAction: intent.activeAction, at: now });
      return { room: { ...room, actions: actions.slice(-12) } };
    }
    case 'command': {
      // Perintah slash RAHASIA dari kolom obrolan meja. Tidak ada pesan
      // obrolan yang dikirim: lawan tidak boleh tahu. Semua validasi di sini
      // karena engine adalah sumber kebenaran — UI hanya menampilkan hasilnya.
      // Pesan sengaja pendek & netral: tidak menyebut kode perintahnya, supaya
      // tidak bocor kalau ada yang mengintip layar.
      //
      // SAKlar cheat (src/utils/cheats.js) dimatikan secara bawaan — "main
      // sehat". Selama mati, semua perintah ditolak di sini juga, bukan hanya
      // di UI, supaya tidak bisa diakali dengan mengirim intent langsung.
      if (!cheatsEnabled()) return { error: 'Perintah tidak dikenal.' };
      if (!actor) return { error: 'Kamu belum duduk di meja ini.' };
      const command = resolveCommand(intent.code);
      if (!command) return { error: 'Perintah tidak dikenal.' };
      // Dua kelompok perintah: SEBELUM ronde (ruang tunggu, `when: 'lobby'`)
      // dan SAAT ronde berjalan. Syarat statusnya kebalikan satu sama lain.
      const preRound = command.when === 'lobby';
      if (preRound) {
        if (room.status === 'playing') return { error: '🃏 Hanya sebelum ronde dimulai.' };
      } else {
        if (room.status !== 'playing' || !room.game) return { error: 'Permainan belum berjalan.' };
        if (now < room.game.dealingUntil) return { error: 'Pembagian kartu belum selesai.' };
      }
      const index = playerIndexOf(room, actorId);
      if (!preRound && index < 0) return { error: 'Penonton tidak bisa memakainya.' };

      if (command.id === 'pelumas') {
        // Penanda di KURSI, bukan di game.players: saat ini belum ada ronde.
        // Efeknya dipakai sekali di `beginDealing`, lalu penanda dibersihkan.
        const seatIndex = room.seats.findIndex(seat => seat.id === actorId);
        if (seatIndex < 0) return { error: 'Kamu belum duduk.' };
        if (room.seats[seatIndex].pendingAces) {
          return { error: '🃏 Sudah siap untuk ronde berikutnya.' };
        }
        const seats = room.seats.map((seat, i) => (i === seatIndex ? { ...seat, pendingAces: true } : seat));
        return {
          room: { ...room, seats, rev: room.rev + 1 },
          message: '🃏 Siap — tiga As menantimu.',
        };
      }

      const player = room.game.players[index];
      const used = (player.cmdUsed && player.cmdUsed[command.id]) || 0;
      if (used >= command.usesPerRound) {
        return { error: `🃏 Jatah habis (${command.usesPerRound}× per ronde).` };
      }
      if (command.when === 'draw' && (room.game.turn !== index || room.game.phase !== 'draw')) {
        return { error: '🃏 Hanya di giliranmu, sebelum minum.' };
      }
      // Jatah baru dipotong setelah semua syarat lolos: perintah yang gagal
      // (mis. tidak ada Joker) tidak boleh memakan jatah.
      const spendUse = players => players.map((seat, seatIndex) => (
        seatIndex === index
          ? { ...seat, cmdUsed: { ...(seat.cmdUsed || {}), [command.id]: used + 1 } }
          : seat
      ));

      if (command.id === 'pleeer') {
        // Syarat yang diminta pemilik project: WAJIB cek dulu apakah Joker
        // masih ada di tumpukan minum. Tidak ada Joker = gagal, jatah utuh.
        const hasJoker = (room.game.drawPile || []).some(card => card.kind === 'joker' || card.value === 'JOKER');
        if (!hasJoker) return { error: '🃏 Nggak ada Joker di tumpukan minum — jatah utuh.' };
        const players = spendUse(room.game.players).map((seat, seatIndex) => (
          seatIndex === index ? { ...seat, pendingJoker: true } : seat
        ));
        // lastActionAt SENGAJA tidak disentuh: perintah ini tidak boleh jadi
        // alat mengulur timer giliran.
        return {
          room: { ...room, game: { ...room.game, players }, rev: room.rev + 1 },
          message: '🃏 Joker siap — minum berikutnya jatahmu.',
        };
      }

      if (command.id === 'nyocot') {
        // Intip kartu tangan lawan. Hasilnya TIDAK ditulis ke state room
        // (state sudah memuat semua tangan, jadi menulis ulang cuma bikin
        // `rev` naik tanpa manfaat); hanya dikembalikan ke pemanggil untuk
        // ditampilkan sebentar di layarnya sendiri.
        const others = room.game.players.filter((_, seatIndex) => seatIndex !== index);
        if (!others.length) return { error: 'Belum ada lawan untuk diintip.' };
        const wanted = String(intent.target || '').trim().toLowerCase();
        // `/nyocot all` = intip SEMUA lawan sekaligus. Overlay-nya sengaja
        // ditahan lama (lihat PEEK_HOLD_ALL_MS di GameBoard), bukan 7 detik.
        if (wanted === 'all' || wanted === 'semua') {
          const targets = others.map(seat => ({ id: seat.id, name: seat.name || 'Pemain', cards: seat.hand || [] }));
          return {
            room: { ...room, game: { ...room.game, players: spendUse(room.game.players) }, rev: room.rev + 1 },
            message: `🃏 ${targets.length} lawan`,
            peek: { mode: 'all', targets },
          };
        }
        let target = null;
        if (wanted) {
          target = others.find(seat => String(seat.id).toLowerCase() === wanted)
            || others.find(seat => String(seat.name || '').toLowerCase().startsWith(wanted))
            || others.find(seat => String(seat.name || '').toLowerCase().includes(wanted))
            || null;
          if (!target) return { error: 'Lawan itu tidak ada di meja.' };
        } else {
          // Tanpa nama: lawan dengan kartu paling sedikit (paling dekat menutup).
          target = [...others].sort((a, b) => (a.hand || []).length - (b.hand || []).length)[0];
        }
        const cards = target.hand || [];
        return {
          room: { ...room, game: { ...room.game, players: spendUse(room.game.players) }, rev: room.rev + 1 },
          message: `🃏 ${target.name}: ${cards.length} kartu`,
          peek: { mode: 'one', targetId: target.id, targetName: target.name, cards },
        };
      }

      return { error: 'Perintah tidak dikenal.' };
    }
    case 'draw': {
      if (!actor) return { error: 'Kamu belum duduk di meja ini.' };
      if (room.status !== 'playing' || !room.game) return { error: 'Permainan belum berjalan.' };
      if (now < room.game.dealingUntil) return { error: 'Pembagian kartu belum selesai.' };
      const index = playerIndexOf(room, actorId);
      // Efek cheat "minum berikutnya Joker" hanya berlaku kalau saklar nyala.
      const pendingJoker = cheatsEnabled() && Boolean(room.game.players[index]?.pendingJoker);
      let result = drawCard(room.game, index, { forceJoker: pendingJoker });
      let message;
      if (result.error && pendingJoker) {
        // Joker hilang di antara perintah dan minum (mis. meja baru saja
        // dikocok ulang): jangan sampai kursi tersangkut dengan penanda aktif —
        // perintah dibatalkan dan minum jalan normal.
        result = drawCard(room.game, index);
        message = '🃏 Gagal: Joker sudah tidak ada di tumpukan minum.';
      }
      if (result.error) return { error: result.error };
      // Penanda dimatikan begitu kartu benar-benar diambil.
      const game = pendingJoker
        ? { ...result.state, players: result.state.players.map((player, seat) => (seat === index ? { ...player, pendingJoker: false } : player)) }
        : result.state;
      const seats = actor.afk ? room.seats.map(seat => (seat.id === actorId ? { ...seat, afk: false } : seat)) : room.seats;
      return { room: { ...room, game, seats, rev: room.rev + 1, lastActionAt: now }, message };
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
      // Penonton (tidak terdaftar di game.players) tidak boleh menurunkan
      // kartu — dulu index -1 membuat transaksi crash (TypeError), bukan pesan.
      if (index < 0) return { error: 'Penonton tidak bisa menurunkan kartu.' };
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

/**
 * Patch reset turnamen: semua skor & counter Joker/As kembali nol dan meja
 * balik ke lobby. Sumber kebenarannya di engine; GrandChampionModal
 * me-re-export helper ini supaya pemakai lama tetap jalan.
 */
export function resetScoresPatch(room) {
  return {
    seats: (room?.seats || []).map(seat => ({
      ...seat,
      score: 0,
      ready: false,
      discardedJokers: 0,
      discardedAces: 0,
    })),
    status: 'lobby',
    round: 0,
    game: null,
    lastScores: null,
    prevScores: null,
    pendingWinnerId: null,
  };
}

export function auditCards(room) {
  if (!room?.game) return { ok: true, total: 0, expected: 0, diff: 0, idle: true };
  const total = countTableCards(room.game);
  const expected = expectedDeckTotal(room.game.players.length);
  const diff = total - expected;
  return { ok: diff === 0, total, expected, diff, idle: false };
}
