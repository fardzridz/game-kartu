/**
 * Mesin **Poker Banting** (Capsa / Big Two).
 *
 * Satu "game" = satu pembagian kartu sampai tinggal satu orang masih pegang
 * kartu (dia yang kalah). Alurnya:
 *
 *   1. Semua kartu dibagi rata sampai dek habis.
 *   2. Pemegang 3♦ mulai duluan, menurunkan satu kombinasi.
 *   3. Bergiliran searah kursi: MAIN (menimpa dengan kombinasi lebih tinggi,
 *      jumlah kartu sama) atau SKIP.
 *   4. Kalau semua pemain lain skip, giliran kembali ke pemain terakhir yang
 *      menaruh kartu → dia mulai ronde baru (bebas kombinasi apa saja).
 *   5. Pemain yang kartunya habis menang dan keluar; permainan lanjut sampai
 *      tersisa satu orang — dia yang kalah.
 *
 * Tanpa chip, tanpa taruhan. Semua state lewat `applyIntent` (murni) supaya
 * aman dijalankan di transaksi/CAS relay.
 */
import {
  canBeat,
  suitValue,
  comboLabel,
  createDeck,
  deckSetsFor,
  describeCombo,
  rankValue,
  sortCards,
} from './hands.js';

export const BANTING_MAX_SEATS = 8;
export const BANTING_MIN_SEATS = 2;

export const BANTING_SETTINGS_DEFAULT = {
  turnSeconds: 30,
  decks: 'auto', // 'auto' | '1' | '2'
  fiveAnyCategory: true, // 5 kartu: jenis apa pun, kategori lebih tinggi menang
};

export const TURN_OPTIONS = [20, 30, 45, 60];
export const DECK_OPTIONS = [
  { id: 'auto', label: 'Otomatis (2 set bila ≥5 pemain)' },
  { id: '1', label: '1 set (52 kartu)' },
  { id: '2', label: '2 set (104 kartu)' },
];

// ---------------------------------------------------------------------------
// Utilitas state
// ---------------------------------------------------------------------------

function seedFor(room) {
  const text = `${room.code || ''}:${room.handNo || 0}:${room.rev || 0}:${room.lastActionAt || 0}`;
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shuffle(cards, seed) {
  let a = seed >>> 0;
  const random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...cards];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function normalizeBantingRoom(raw) {
  if (!raw) return null;
  const settings = { ...BANTING_SETTINGS_DEFAULT, ...(raw.settings || {}) };
  const hand = raw.hand
    ? {
        ...raw.hand,
        passed: raw.hand.passed || [],
        finishOrder: raw.hand.finishOrder || [],
        log: raw.hand.log || [],
        lastPlay: raw.hand.lastPlay || null,
        players: (raw.hand.players || []).map(player => ({
          ...player,
          hand: player.hand || [],
        })),
      }
    : null;
  return {
    ...raw,
    game: 'banting',
    v: 1,
    settings,
    status: raw.status || 'lobby',
    seats: (raw.seats || []).map(seat => ({
      ...seat,
      ready: Boolean(seat.ready),
      bot: Boolean(seat.bot),
      online: seat.online !== false,
      sitOut: Boolean(seat.sitOut),
      wins: Number(seat.wins) || 0,
      losses: Number(seat.losses) || 0,
    })),
    handNo: Number(raw.handNo) || 0,
    log: raw.log || [],
    history: raw.history || [],
    rev: Number(raw.rev) || 0,
    hand,
  };
}

function cloneRoom(room) {
  return {
    ...room,
    settings: { ...room.settings },
    seats: (room.seats || []).map(seat => ({ ...seat })),
    log: (room.log || []).slice(),
    history: (room.history || []).slice(),
    hand: room.hand
      ? {
          ...room.hand,
          passed: (room.hand.passed || []).slice(),
          finishOrder: (room.hand.finishOrder || []).slice(),
          log: (room.hand.log || []).slice(),
          lastPlay: room.hand.lastPlay
            ? { ...room.hand.lastPlay, cards: (room.hand.lastPlay.cards || []).slice(), combo: { ...room.hand.lastPlay.combo } }
            : null,
          players: (room.hand.players || []).map(player => ({ ...player, hand: (player.hand || []).slice() })),
        }
      : null,
  };
}

const touch = (room, now, note) => {
  room.rev = (room.rev || 0) + 1;
  room.lastActionAt = now;
  if (note) room.log = [...(room.log || []), note].slice(-40);
};

const pushLog = (hand, text) => {
  hand.log = [...(hand.log || []), text].slice(-80);
};

const playerAtSeat = (hand, seat) => (hand.players || []).find(player => player.seat === seat) || null;
const activePlayers = hand => (hand.players || []).filter(player => !player.finished && (player.hand || []).length > 0);

function nextActiveSeat(hand, fromSeat) {
  const seats = activePlayers(hand).map(player => player.seat).sort((a, b) => a - b);
  if (!seats.length) return -1;
  const after = seats.find(seat => seat > fromSeat);
  return after === undefined ? seats[0] : after;
}

/**
 * Kursi berikutnya yang masih boleh ikut ronde ini.
 * Aturan meja: sekali SKIP, pemain keluar dari ronde itu sampai ronde baru —
 * jadi pemain yang sudah ada di hand.passed dilewati.
 * excludeSeat dipakai untuk melewati pemain yang baru jalan / pemegang kartu
 * terakhir (mereka bukan tujuan giliran).
 */
function nextPlayableSeat(hand, fromSeat, excludeSeat = -1) {
  const passed = new Set(hand.passed || []);
  const seats = activePlayers(hand)
    .filter(player => player.seat !== excludeSeat && !passed.has(player.id))
    .map(player => player.seat)
    .sort((a, b) => a - b);
  if (!seats.length) return -1;
  const after = seats.find(seat => seat > fromSeat);
  return after === undefined ? seats[0] : after;
}

// ---------------------------------------------------------------------------
// Meja
// ---------------------------------------------------------------------------

export function createBantingRoom({ code, hostId, name, avatar, settings, now = Date.now() }) {
  const merged = { ...BANTING_SETTINGS_DEFAULT, ...(settings || {}) };
  return {
    v: 1,
    game: 'banting',
    code,
    hostId,
    status: 'lobby',
    settings: {
      turnSeconds: Math.max(10, Math.min(120, Math.round(Number(merged.turnSeconds) || 30))),
      decks: ['auto', '1', '2'].includes(merged.decks) ? merged.decks : 'auto',
      fiveAnyCategory: merged.fiveAnyCategory !== false,
    },
    seats: [{
      id: hostId,
      name,
      avatar: avatar || null,
      ready: true,
      bot: false,
      online: true,
      sitOut: false,
      wins: 0,
      losses: 0,
    }],
    handNo: 0,
    hand: null,
    lastResult: null,
    history: [],
    log: [`Meja dibuka oleh ${name}.`],
    rev: 0,
    createdAt: now,
    lastActionAt: now,
  };
}

// ---------------------------------------------------------------------------
// Bagi kartu
// ---------------------------------------------------------------------------

/**
 * Pembuka game pertama: pemain dengan kartu 3 terbanyak; kalau jumlahnya
 * sama, kembang tertinggi (♠ > ♥ > ♣ > ♦). Semua kartu 3 dibuang.
 * @returns {{index:number, count:number, topSuit:number}|null}
 */
export function starterFromThrees(players = []) {
  let best = null;
  players.forEach((player, index) => {
    const threes = (player.hand || []).filter(card => card.value === '3');
    if (!threes.length) return;
    const count = threes.length;
    const topSuit = Math.max(...threes.map(card => suitValue(card.suit)));
    if (!best || count > best.count || (count === best.count && topSuit > best.topSuit)) {
      best = { index, count, topSuit };
    }
  });
  return best;
}

export function startRound(rawRoom, now = Date.now()) {
  const room = cloneRoom(normalizeBantingRoom(rawRoom));
  const order = room.seats
    .map((seat, index) => ({ seat, index }))
    .filter(({ seat }) => !seat.sitOut)
    .map(({ index }) => index);

  if (order.length < BANTING_MIN_SEATS) {
    return { error: 'Butuh minimal 2 pemain untuk membagi kartu.' };
  }

  room.handNo = (room.handNo || 0) + 1;
  const sets = deckSetsFor(order.length, room.settings.decks);
  const seed = seedFor(room);
  const deck = shuffle(createDeck(sets), seed);

  const players = order.map(seat => ({
    id: room.seats[seat].id,
    seat,
    name: room.seats[seat].name,
    hand: [],
    finished: false,
    order: 0,
  }));

  // Bagi satu kartu per pemain bergiliran sampai dek habis.
  let cursor = 0;
  while (deck.length) {
    const card = deck.pop();
    players[cursor % players.length].hand.push(card);
    cursor += 1;
  }
  for (const player of players) player.hand = sortCards(player.hand);

  // Pembuka:
  //  - Game pertama: semua pemain membuang kartu 3-nya, lalu yang punya 3
  //    terbanyak mulai; kalau jumlahnya sama, kembang tertinggi (♠ > ♥ > ♣ > ♦).
  //  - Game berikutnya: pemenang game sebelumnya yang mulai, bebas kombinasi.
  let starter = players[0];
  let starterNote = '';
  if (room.handNo === 1) {
    const best = starterFromThrees(players);
    players.forEach(player => {
      player.hand = player.hand.filter(card => card.value !== '3');
    });
    if (best) starter = players[best.index];
    starterNote = best
      ? `${starter.name} mulai — pegang ${best.count} kartu 3 (semua kartu 3 dibuang)`
      : `${starter.name} mulai`;
  } else {
    const prevWinner = players.find(player => player.id === room.lastResult?.winnerId);
    if (prevWinner) starter = prevWinner;
    starterNote = `${starter.name} mulai — pemenang game sebelumnya`;
  }

  const hand = {
    no: room.handNo,
    seed,
    sets,
    phase: 'play',
    turnSeat: starter.seat,
    deadline: now + room.settings.turnSeconds * 1000,
    lastPlay: null,
    passed: [],
    players,
    finishOrder: [],
    loserId: null,
    log: [],
  };
  pushLog(hand, `Kartu dibagi (${sets} set) — ${players.length} pemain, ${players[0].hand.length} kartu/orang`);
  if (starterNote) pushLog(hand, starterNote);

  room.status = 'playing';
  room.hand = hand;
  room.lastResult = null;
  touch(room, now, `Permainan #${room.handNo} dimulai.`);
  return { room };
}

// ---------------------------------------------------------------------------
// Akhir permainan
// ---------------------------------------------------------------------------

function endGame(room, hand, now) {
  hand.phase = 'ended';
  hand.turnSeat = -1;
  hand.deadline = 0;
  const remaining = (hand.players || []).filter(player => !player.finished);
  const loser = remaining[0] || null;
  hand.loserId = loser?.id || null;
  room.status = 'round-end';

  const ranking = (hand.finishOrder || []).map((id, index) => ({
    id,
    name: hand.players.find(player => player.id === id)?.name || 'Pemain',
    place: index + 1,
  }));
  if (loser) ranking.push({ id: loser.id, name: loser.name, place: ranking.length + 1, loser: true });

  room.lastResult = {
    handNo: hand.no,
    ranking,
    loserId: loser?.id || null,
    winnerId: ranking[0]?.id || null,
    at: now,
  };
  room.history = [
    ...(room.history || []),
    { no: hand.no, at: now, winner: ranking[0]?.name || '-', loser: loser?.name || '-', players: ranking.length },
  ].slice(-12);

  for (const seat of room.seats) {
    if (seat.id === ranking[0]?.id) seat.wins = (seat.wins || 0) + 1;
    if (loser && seat.id === loser.id) seat.losses = (seat.losses || 0) + 1;
  }

  touch(room, now, loser ? `${ranking[0]?.name || 'Pemain'} habis kartunya. ${loser.name} kalah.` : 'Permainan selesai.');
}

/** Mulai ronde baru: semua yang lewat boleh ikut lagi, `leaderSeat` membuka. */
function startNewRound(room, hand, leaderSeat, now) {
  hand.lastPlay = null;
  hand.passed = [];
  hand.turnSeat = leaderSeat;
  hand.deadline = now + room.settings.turnSeconds * 1000;
  pushLog(hand, '— ronde baru —');
}

/**
 * Siapa yang membuka ronde baru?
 *  - Pemain yang terakhir menaruh kartu, kalau dia masih ikut bermain.
 *  - Kalau dia sudah habis kartunya (menang), pemain berikutnya menurut kursi.
 */
function newRoundLeader(hand) {
  const lastSeat = hand.lastPlay?.seat ?? -1;
  const lastPlayer = (hand.players || []).find(item => item.seat === lastSeat);
  const stillPlaying = lastPlayer && !lastPlayer.finished && (lastPlayer.hand || []).length > 0;
  if (stillPlaying) return lastSeat;
  return nextActiveSeat(hand, lastSeat);
}

function finishPlayer(room, hand, player, now) {
  player.finished = true;
  player.order = (hand.finishOrder || []).length + 1;
  hand.finishOrder = [...(hand.finishOrder || []), player.id];
  pushLog(hand, `${player.name} HABIS — menang!`);

  const remaining = activePlayers(hand);
  if (remaining.length <= 1) {
    endGame(room, hand, now);
    return true;
  }

  // Kartu terakhirnya TETAP jadi acuan — pemain lain masih harus menimpanya
  // atau lewat. Kalau tidak ada yang bisa ikut, ronde baru dibuka pemain
  // berikutnya setelah dia (karena dia sudah keluar).
  const next = nextPlayableSeat(hand, player.seat, -1);
  if (next < 0) {
    const leader = nextActiveSeat(hand, player.seat);
    if (leader < 0) {
      endGame(room, hand, now);
      return true;
    }
    startNewRound(room, hand, leader, now);
    return false;
  }
  hand.turnSeat = next;
  hand.deadline = now + room.settings.turnSeconds * 1000;
  return false;
}

// ---------------------------------------------------------------------------
// Intent
// ---------------------------------------------------------------------------

function applyPlay(room, hand, player, intent, now) {
  const uids = Array.isArray(intent.cards) ? intent.cards.map(String) : [];
  if (!uids.length) return { error: 'Pilih kartu dulu.' };
  const unique = [...new Set(uids)];
  const cards = unique.map(uid => player.hand.find(card => card.uid === uid)).filter(Boolean);
  if (cards.length !== unique.length) return { error: 'Ada kartu yang bukan milikmu.' };

  const combo = describeCombo(cards);
  if (!combo) return { error: 'Kombinasi tidak sah.' };
  const check = canBeat(combo, hand.lastPlay?.combo || null, { fiveAnyCategory: room.settings.fiveAnyCategory });
  if (!check.ok) return { error: check.reason };

  const used = new Set(unique);
  player.hand = player.hand.filter(card => !used.has(card.uid));
  hand.lastPlay = {
    seat: player.seat,
    playerId: player.id,
    name: player.name,
    cards: sortCards(cards),
    combo,
    at: now,
  };
  // hand.passed TIDAK direset: yang sudah lewat tetap di luar sampai ronde baru.
  pushLog(hand, `${player.name}: ${combo.label} (${comboLabel(cards)})`);

  if (!player.hand.length) {
    finishPlayer(room, hand, player, now);
    return { ok: true };
  }

  const next = nextPlayableSeat(hand, player.seat, player.seat);
  if (next < 0) {
    // Semua lawan sudah lewat (atau habis) → dia buka ronde baru.
    startNewRound(room, hand, player.seat, now);
    return { ok: true };
  }
  hand.turnSeat = next;
  hand.deadline = now + room.settings.turnSeconds * 1000;
  return { ok: true };
}

function applySkip(room, hand, player, now) {
  if (!hand.lastPlay) return { error: 'Kamu yang buka ronde — harus menaruh kartu.' };
  if (!hand.passed.includes(player.id)) hand.passed.push(player.id);
  pushLog(hand, `${player.name} lewat (keluar dari ronde ini)`);

  // Pemain yang sudah lewat tidak boleh ikut lagi sampai ronde baru, jadi
  // giliran mencari pemain lain yang masih boleh menimpa.
  const next = nextPlayableSeat(hand, player.seat, hand.lastPlay.seat);
  if (next < 0) {
    // Tidak ada lawan yang masih bisa menimpa → ronde baru dibuka pemain yang
    // terakhir menaruh kartu; kalau dia sudah habis, pemain berikutnya.
    const leader = newRoundLeader(hand);
    if (leader < 0) {
      endGame(room, hand, now);
      return { ok: true };
    }
    startNewRound(room, hand, leader, now);
    return { ok: true };
  }
  hand.turnSeat = next;
  hand.deadline = now + room.settings.turnSeconds * 1000;
  return { ok: true };
}

/** Kartu terendah untuk aksi otomatis saat waktu habis. */
function lowestSingle(player) {
  const sorted = sortCards(player.hand);
  return sorted[sorted.length - 1];
}

export function applyBantingIntent(rawRoom, intent, playerId, now = Date.now()) {
  if (!rawRoom) return { error: 'Meja tidak ditemukan.' };
  const base = normalizeBantingRoom(rawRoom);
  const type = String(intent?.type || '').toLowerCase();
  const room = cloneRoom(base);
  const seatIndex = room.seats.findIndex(seat => seat.id === playerId);
  const seat = seatIndex >= 0 ? room.seats[seatIndex] : null;

  switch (type) {
    case 'sit': {
      const name = String(intent.name || '').trim().slice(0, 18);
      if (!name) return { error: 'Nama panggilan wajib diisi.' };
      if (seat) {
        seat.name = name;
        if (intent.avatar) seat.avatar = intent.avatar;
        touch(room, now, null);
        return { room };
      }
      if (room.seats.length >= BANTING_MAX_SEATS) return { error: 'Meja sudah penuh (8 kursi).' };
      if (intent.avatar && room.seats.some(item => item.avatar === intent.avatar)) {
        return { error: 'Potret itu sudah dipakai pemain lain.' };
      }
      room.seats.push({
        id: playerId,
        name,
        avatar: intent.avatar || null,
        ready: false,
        bot: false,
        online: true,
        sitOut: false,
        wins: 0,
        losses: 0,
      });
      touch(room, now, `${name} duduk di kursi ${room.seats.length}.`);
      return { room };
    }

    case 'ready': {
      if (!seat) return { error: 'Duduk dulu sebelum menekan siap.' };
      if (room.status === 'playing') return { error: 'Permainan sedang berjalan.' };
      seat.ready = Boolean(intent.ready);
      touch(room, now, null);
      return { room };
    }

    case 'stand': {
      if (!seat) return { error: 'Kamu tidak duduk di meja ini.' };
      if (room.status === 'playing' && room.hand?.players?.some(player => player.id === playerId && !player.finished)) {
        return { error: 'Tidak bisa keluar saat permainan berjalan.' };
      }
      room.seats.splice(seatIndex, 1);
      if (room.hostId === playerId) {
        const nextHost = room.seats.find(item => !item.bot) || room.seats[0];
        room.hostId = nextHost?.id || null;
      }
      touch(room, now, `${seat.name} meninggalkan meja.`);
      return { room };
    }

    case 'addbot': {
      if (playerId !== room.hostId) return { error: 'Hanya host yang bisa menambah bot.' };
      if (room.seats.length >= BANTING_MAX_SEATS) return { error: 'Meja sudah penuh.' };
      const used = new Set(room.seats.map(item => item.name));
      const names = ['Bot Bandar', 'Bot Kriting', 'Bot Wajik', 'Bot Sekop', 'Bot Hoki', 'Bot Sabar', 'Bot Kalem'];
      const name = names.find(candidate => !used.has(candidate)) || `Bot ${room.seats.length}`;
      room.seats.push({
        id: `bot-${room.rev}-${room.seats.length}-${Math.floor(now % 100000)}`,
        name,
        avatar: null,
        ready: true,
        bot: true,
        online: true,
        sitOut: false,
        wins: 0,
        losses: 0,
      });
      touch(room, now, `${name} bergabung.`);
      return { room };
    }

    case 'removebot': {
      if (playerId !== room.hostId) return { error: 'Hanya host yang bisa mengeluarkan bot.' };
      const index = room.seats.findIndex(item => item.id === intent.botId && item.bot);
      if (index < 0) return { error: 'Bot tidak ditemukan.' };
      if (room.status === 'playing') return { error: 'Tunggu permainan selesai dulu.' };
      const [removed] = room.seats.splice(index, 1);
      touch(room, now, `${removed.name} keluar.`);
      return { room };
    }

    case 'settings': {
      if (playerId !== room.hostId) return { error: 'Hanya host yang bisa mengubah aturan meja.' };
      if (room.status === 'playing') return { error: 'Aturan tidak bisa diubah saat permainan berjalan.' };
      const patch = intent.settings || {};
      room.settings = {
        turnSeconds: Math.max(10, Math.min(120, Math.round(Number(patch.turnSeconds) || room.settings.turnSeconds))),
        decks: ['auto', '1', '2'].includes(patch.decks) ? patch.decks : room.settings.decks,
        fiveAnyCategory: patch.fiveAnyCategory === undefined
          ? room.settings.fiveAnyCategory
          : Boolean(patch.fiveAnyCategory),
      };
      touch(room, now, 'Aturan meja diperbarui.');
      return { room };
    }

    case 'start': {
      if (playerId !== room.hostId) return { error: 'Hanya host yang bisa membagi kartu.' };
      if (room.status === 'playing') return { error: 'Permainan masih berjalan.' };
      const humans = room.seats.filter(item => !item.bot);
      if (humans.length && humans.some(item => !item.ready && item.id !== room.hostId && !item.sitOut)) {
        return { error: 'Masih ada pemain yang belum menekan SIAP.' };
      }
      return startRound(room, now);
    }

    case 'next': {
      if (room.status === 'playing') return { error: 'Permainan masih berjalan.' };
      if (!seat && playerId !== room.hostId) return { error: 'Hanya pemain di meja yang bisa melanjutkan.' };
      return startRound(room, now);
    }

    case 'sitout': {
      if (!seat) return { error: 'Kamu tidak duduk di meja ini.' };
      seat.sitOut = Boolean(intent.sitOut);
      touch(room, now, seat.sitOut ? `${seat.name} duduk di luar.` : `${seat.name} ikut lagi.`);
      return { room };
    }

    case 'online': {
      if (!seat) return { error: 'Kamu tidak duduk di meja ini.' };
      seat.online = intent.online !== false;
      touch(room, now, null);
      return { room };
    }

    case 'restart': {
      if (playerId !== room.hostId) return { error: 'Hanya host yang bisa mereset meja.' };
      if (room.status === 'playing') return { error: 'Selesaikan permainan dulu.' };
      room.status = 'lobby';
      room.hand = null;
      room.handNo = 0;
      room.lastResult = null;
      room.history = [];
      for (const item of room.seats) {
        item.wins = 0;
        item.losses = 0;
        item.sitOut = false;
        item.ready = item.bot ? true : item.id === room.hostId;
      }
      touch(room, now, 'Papan skor direset.');
      return { room };
    }

    case 'play': {
      if (room.status !== 'playing' || !room.hand) return { error: 'Permainan belum berjalan.' };
      const hand = room.hand;
      if (hand.phase === 'ended') return { error: 'Permainan sudah selesai.' };
      const player = (hand.players || []).find(item => item.id === playerId);
      if (!player) return { error: 'Kamu tidak ikut di permainan ini.' };
      if (player.finished) return { error: 'Kamu sudah habis kartunya.' };
      if (hand.turnSeat !== player.seat) return { error: 'Bukan giliranmu.' };
      const result = applyPlay(room, hand, player, intent, now);
      if (result.error) return result;
      touch(room, now, null);
      return { room };
    }

    case 'skip': {
      if (room.status !== 'playing' || !room.hand) return { error: 'Permainan belum berjalan.' };
      const hand = room.hand;
      const player = (hand.players || []).find(item => item.id === playerId);
      if (!player) return { error: 'Kamu tidak ikut di permainan ini.' };
      if (player.finished) return { error: 'Kamu sudah habis kartunya.' };
      if (hand.turnSeat !== player.seat) return { error: 'Bukan giliranmu.' };
      const result = applySkip(room, hand, player, now);
      if (result.error) return result;
      touch(room, now, null);
      return { room };
    }

    case 'tick': {
      if (room.status !== 'playing' || !room.hand) return { error: 'Permainan belum berjalan.' };
      const hand = room.hand;
      if (hand.phase === 'ended') return { error: 'Permainan sudah selesai.' };
      if (!hand.deadline || now < hand.deadline) return { error: 'Belum lewat batas waktu.' };
      const player = playerAtSeat(hand, hand.turnSeat);
      if (!player) return { error: 'Tidak ada pemain yang harus jalan.' };

      if (hand.lastPlay) {
        const result = applySkip(room, hand, player, now);
        if (result.error) return result;
      } else {
        // Tidak bisa skip saat membuka ronde: buang kartu terendah otomatis.
        const card = lowestSingle(player);
        const result = applyPlay(room, hand, player, { cards: [card.uid] }, now);
        if (result.error) return result;
        pushLog(hand, `${player.name} kehabisan waktu — buang ${card.value}${card.suit}`);
      }
      touch(room, now, null);
      return { room };
    }

    default:
      return { error: 'Aksi tidak dikenal.' };
  }
}

export function bantingActions(room, playerId) {
  const empty = { isTurn: false, mustLead: false, lastCombo: null, cardsLeft: 0, canSkip: false, hasPassed: false };
  if (!room || room.status !== 'playing' || !room.hand) return empty;
  const hand = room.hand;
  const player = (hand.players || []).find(item => item.id === playerId);
  if (!player) return empty;
  return {
    isTurn: hand.turnSeat === player.seat && !player.finished,
    mustLead: !hand.lastPlay,
    lastCombo: hand.lastPlay?.combo || null,
    cardsLeft: player.hand.length,
    canSkip: Boolean(hand.lastPlay),
    hasPassed: (hand.passed || []).includes(player.id),
  };
}

export { describeCombo, canBeat, comboLabel, rankValue };
