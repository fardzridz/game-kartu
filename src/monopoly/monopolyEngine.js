/**
 * Mesin Game **Monopoli Tongkrongan** (2–8 Pemain).
 *
 * Mengatur pergerakan bidak 40 petak melingkar, kocokan 2 dadu (double = jalan lagi / 3x double masuk penjara),
 * pembelian tanah, upgrade rumah (1–4) & hotel, perhitungan sewa, kartu Kesempatan / Dana Umum,
 * keluar/masuk penjara (bayar denda / kartu bebas / kocok double), dan mekanisme bangkrut.
 */
import {
  CHANCE_CARDS,
  CHEST_CARDS,
  MONOPOLY_TILES,
  PROPERTY_GROUPS,
} from './monopolyCatalog.js';

export const MONOPOLY_MAX_PLAYERS = 8;
export const MONOPOLY_STARTING_CASH = 1500;
export const GO_SALARY = 200;
export const JAIL_FINE = 50;
export const JAIL_POSITION = 10;
export const TOTAL_TILES = 40;

function hashSeed(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalizeMonopolyRoom(raw) {
  if (!raw) return null;
  const settings = {
    turnSeconds: Math.max(15, Math.min(120, Number(raw.settings?.turnSeconds) || 45)),
    startingCash: Number(raw.settings?.startingCash) || MONOPOLY_STARTING_CASH,
  };

  const properties = {};
  MONOPOLY_TILES.forEach(t => {
    if (['property', 'station', 'utility'].includes(t.type)) {
      const saved = raw.properties?.[t.index];
      properties[t.index] = {
        ownerId: saved?.ownerId || null,
        houses: Number(saved?.houses) || 0, // 1..4 = rumah, 5 = hotel
        mortgaged: Boolean(saved?.mortgaged),
      };
    }
  });

  return {
    ...raw,
    game: 'monopoly',
    v: 1,
    status: raw.status || 'lobby',
    settings,
    seats: (raw.seats || []).map(seat => ({
      id: seat.id,
      name: seat.name || 'Pemain',
      avatar: seat.avatar || 'finn',
      color: seat.color || '#2cc597',
      ready: Boolean(seat.ready),
      bot: Boolean(seat.bot),
      online: seat.online !== false,
      cash: typeof seat.cash === 'number' ? seat.cash : settings.startingCash,
      position: Number(seat.position) || 0,
      inJail: Boolean(seat.inJail),
      jailTurns: Number(seat.jailTurns) || 0,
      jailCards: Number(seat.jailCards) || 0,
      bankrupt: Boolean(seat.bankrupt),
      wins: Number(seat.wins) || 0,
    })),
    turnIndex: Number(raw.turnIndex) || 0,
    turnPhase: raw.turnPhase || 'roll', // 'roll' | 'action' | 'bankrupt' | 'ended'
    turnStartedAt: Number(raw.turnStartedAt) || 0,
    deadline: Number(raw.deadline) || 0,
    dice: raw.dice || [1, 1],
    doubleCount: Number(raw.doubleCount) || 0,
    properties,
    lastAction: raw.lastAction || null,
    activeCard: raw.activeCard || null,
    log: (raw.log || []).slice(-50),
    rev: Number(raw.rev) || 0,
    createdAt: Number(raw.createdAt) || 0,
    lastActionAt: Number(raw.lastActionAt) || 0,
  };
}

function cloneRoom(room) {
  return normalizeMonopolyRoom(room);
}

function touch(room, now, note) {
  room.rev = (room.rev || 0) + 1;
  room.lastActionAt = now;
  if (note) {
    room.log = [...(room.log || []), note].slice(-50);
    room.lastAction = { text: note, at: now };
  }
}

/**
 * Hitung kekayaan bersih pemain (uang tunai + nilai beli properti + nilai rumah/hotel).
 */
export function calculateNetWorth(room, playerId) {
  const seat = room.seats.find(s => s.id === playerId);
  if (!seat) return 0;
  let total = seat.cash;
  Object.entries(room.properties || {}).forEach(([idxStr, prop]) => {
    if (prop.ownerId === playerId && !prop.mortgaged) {
      const tile = MONOPOLY_TILES[Number(idxStr)];
      if (tile) {
        total += tile.price || 0;
        if (tile.houseCost && prop.houses > 0) {
          total += prop.houses * tile.houseCost;
        }
      }
    }
  });
  return total;
}

/**
 * Cek apakah seorang pemain memiliki seluruh komplek warna tertentu (Monopoly).
 */
export function hasFullColorGroup(room, playerId, groupKey) {
  if (!groupKey || ['STATION', 'UTILITY'].includes(groupKey)) return false;
  const groupTiles = MONOPOLY_TILES.filter(t => t.group === groupKey);
  return groupTiles.every(t => room.properties[t.index]?.ownerId === playerId && !room.properties[t.index]?.mortgaged);
}

/**
 * Hitung sewa petak saat diinjak.
 */
export function calculateRent(room, tileIndex, diceTotal = 7) {
  const tile = MONOPOLY_TILES[tileIndex];
  const prop = room.properties[tileIndex];
  if (!tile || !prop || !prop.ownerId || prop.mortgaged) return 0;

  if (tile.type === 'property') {
    if (prop.houses === 0) {
      const fullGroup = hasFullColorGroup(room, prop.ownerId, tile.group);
      return fullGroup ? tile.baseRent * 2 : tile.baseRent;
    }
    const rentIdx = Math.min(tile.rents.length - 1, Math.max(0, prop.houses - 1));
    return tile.rents[rentIdx];
  }

  if (tile.type === 'station') {
    const stationCount = MONOPOLY_TILES.filter(t => t.type === 'station' && room.properties[t.index]?.ownerId === prop.ownerId).length;
    return (tile.baseRent || 25) * (2 ** Math.max(0, stationCount - 1));
  }

  if (tile.type === 'utility') {
    const utilityCount = MONOPOLY_TILES.filter(t => t.type === 'utility' && room.properties[t.index]?.ownerId === prop.ownerId).length;
    const multiplier = utilityCount >= 2 ? 10 : 4;
    return diceTotal * multiplier;
  }

  return 0;
}

export function createMonopolyRoom({ code, hostId, name, avatar, settings, now = Date.now() }) {
  const cleanName = String(name || '').trim().slice(0, 18) || 'Pemain 1';
  return normalizeMonopolyRoom({
    v: 1,
    game: 'monopoly',
    code,
    hostId,
    status: 'lobby',
    settings: {
      turnSeconds: Math.max(15, Math.min(120, Number(settings?.turnSeconds) || 45)),
      startingCash: Number(settings?.startingCash) || MONOPOLY_STARTING_CASH,
    },
    seats: [{
      id: hostId,
      name: cleanName,
      avatar: avatar || 'finn',
      color: '#2cc597',
      ready: true,
      bot: false,
      online: true,
      cash: settings?.startingCash || MONOPOLY_STARTING_CASH,
      position: 0,
      inJail: false,
      jailTurns: 0,
      jailCards: 0,
      bankrupt: false,
      wins: 0,
    }],
    turnIndex: 0,
    turnPhase: 'roll',
    turnStartedAt: now,
    deadline: 0,
    dice: [1, 1],
    doubleCount: 0,
    properties: {},
    lastAction: null,
    activeCard: null,
    log: [`Ruangan Monopoli dibuka oleh ${cleanName}.`],
    rev: 0,
    createdAt: now,
    lastActionAt: now,
  });
}

const PLAYER_COLORS = ['#2cc597', '#f5a623', '#38bdf8', '#ec4899', '#a855f7', '#eab308', '#f97316', '#64748b'];

function getActiveSeats(room) {
  return room.seats.filter(s => !s.bankrupt);
}

function nextTurnSeatIndex(room, fromIndex) {
  const total = room.seats.length;
  for (let i = 1; i <= total; i += 1) {
    const idx = (fromIndex + i) % total;
    if (!room.seats[idx].bankrupt) return idx;
  }
  return fromIndex;
}

function sendToJail(seat, room, now, reasonText = 'Masuk penjara!') {
  seat.inJail = true;
  seat.jailTurns = 0;
  seat.position = JAIL_POSITION;
  room.turnPhase = 'action';
  touch(room, now, `🚨 ${seat.name} ${reasonText}`);
}

function checkGameOver(room, now) {
  const active = getActiveSeats(room);
  if (active.length === 1) {
    const winner = active[0];
    winner.wins = (winner.wins || 0) + 1;
    room.status = 'round-end';
    room.turnPhase = 'ended';
    touch(room, now, `🏆 ${winner.name} keluar sebagai Raja Monopoli! Semua lawan telah bangkrut.`);
    return true;
  }
  return false;
}

export function startMonopolyGame(rawRoom, now = Date.now()) {
  const room = cloneRoom(rawRoom);
  if (room.seats.length < 2) {
    return { error: 'Butuh minimal 2 pemain untuk memulai permainan Monopoli.' };
  }

  // Reset aset dan posisi pemain
  room.seats.forEach((seat, idx) => {
    seat.cash = room.settings.startingCash;
    seat.position = 0;
    seat.inJail = false;
    seat.jailTurns = 0;
    seat.jailCards = 0;
    seat.bankrupt = false;
    seat.color = PLAYER_COLORS[idx % PLAYER_COLORS.length];
  });

  // Reset kepemilikan properti
  Object.keys(room.properties).forEach(idx => {
    room.properties[idx] = { ownerId: null, houses: 0, mortgaged: false };
  });

  room.status = 'playing';
  room.turnIndex = 0;
  room.turnPhase = 'roll';
  room.doubleCount = 0;
  room.dice = [1, 1];
  room.turnStartedAt = now;
  room.deadline = now + room.settings.turnSeconds * 1000;
  room.activeCard = null;

  touch(room, now, `Permainan Monopoli dimulai! Giliran pertama: ${room.seats[0].name}.`);
  return { room };
}

export function applyMonopolyIntent(rawRoom, intent, playerId, now = Date.now()) {
  if (!rawRoom || !intent || !intent.type) return { error: 'Aksi tidak valid.' };
  const room = cloneRoom(rawRoom);
  const type = String(intent.type).toLowerCase();

  const seatIndex = room.seats.findIndex(s => s.id === playerId);
  const seat = seatIndex >= 0 ? room.seats[seatIndex] : null;

  switch (type) {
    case 'sit': {
      const name = String(intent.name || seat?.name || '').trim().slice(0, 18);
      if (!name) return { error: 'Nama panggilan wajib diisi.' };
      const avatar = intent.avatar || seat?.avatar || 'finn';

      if (seat) {
        seat.name = name;
        seat.avatar = avatar;
        seat.online = true;
        touch(room, now, null);
        return { room };
      }

      if (room.status !== 'lobby') {
        return { error: 'Permainan sedang berjalan.' };
      }

      if (room.seats.length >= MONOPOLY_MAX_PLAYERS) {
        return { error: 'Meja Monopoli sudah penuh (8 pemain).' };
      }

      room.seats.push({
        id: playerId,
        name,
        avatar,
        color: PLAYER_COLORS[room.seats.length % PLAYER_COLORS.length],
        ready: false,
        bot: false,
        online: true,
        cash: room.settings.startingCash,
        position: 0,
        inJail: false,
        jailTurns: 0,
        jailCards: 0,
        bankrupt: false,
        wins: 0,
      });
      touch(room, now, `${name} bergabung di meja Monopoli.`);
      return { room };
    }

    case 'ready': {
      if (!seat) return { error: 'Kamu belum duduk di meja.' };
      if (room.status !== 'lobby') return { error: 'Permainan sedang berjalan.' };
      seat.ready = Boolean(intent.ready ?? intent.value);
      touch(room, now, null);
      return { room };
    }

    case 'addbot': {
      if (playerId !== room.hostId) return { error: 'Hanya host yang bisa menambah bot.' };
      if (room.status !== 'lobby') return { error: 'Permainan sedang berjalan.' };
      if (room.seats.length >= MONOPOLY_MAX_PLAYERS) return { error: 'Meja sudah penuh.' };

      const botNames = ['Bot Konglomerat', 'Bot Juragan Tanah', 'Bot Sultan', 'Bot Investor', 'Bot Cuan', 'Bot Makelar'];
      const used = new Set(room.seats.map(s => s.name));
      const name = botNames.find(n => !used.has(n)) || `Bot Monopoli #${room.seats.length + 1}`;
      const avatars = ['bmo', 'ice-king', 'jake', 'marceline', 'princess-bubblegum', 'gunter'];

      room.seats.push({
        id: `bot-${room.rev}-${Math.floor(now % 100000)}`,
        name,
        avatar: avatars[room.seats.length % avatars.length],
        color: PLAYER_COLORS[room.seats.length % PLAYER_COLORS.length],
        ready: true,
        bot: true,
        online: true,
        cash: room.settings.startingCash,
        position: 0,
        inJail: false,
        jailTurns: 0,
        jailCards: 0,
        bankrupt: false,
        wins: 0,
      });
      touch(room, now, `${name} ditambahkan ke meja.`);
      return { room };
    }

    case 'removebot': {
      if (playerId !== room.hostId) return { error: 'Hanya host yang bisa mengeluarkan bot.' };
      if (room.status !== 'lobby') return { error: 'Tunggu permainan selesai dulu.' };
      const idx = room.seats.findIndex(s => s.bot && (!intent.botId || s.id === intent.botId));
      if (idx < 0) return { error: 'Bot tidak ditemukan.' };
      const [removed] = room.seats.splice(idx, 1);
      touch(room, now, `${removed.name} dikeluarkan.`);
      return { room };
    }

    case 'settings': {
      if (playerId !== room.hostId) return { error: 'Hanya host yang bisa mengubah pengaturan.' };
      if (room.status !== 'lobby') return { error: 'Tidak bisa diubah saat bermain.' };
      const patch = intent.settings || {};
      room.settings = {
        turnSeconds: Math.max(15, Math.min(120, Number(patch.turnSeconds) || room.settings.turnSeconds)),
        startingCash: Number(patch.startingCash) || room.settings.startingCash,
      };
      touch(room, now, 'Pengaturan meja Monopoli diperbarui.');
      return { room };
    }

    case 'start': {
      if (playerId !== room.hostId) return { error: 'Hanya host yang bisa memulai permainan.' };
      if (room.status !== 'lobby') return { error: 'Permainan sedang berjalan.' };
      return startMonopolyGame(room, now);
    }

    case 'tolobby': {
      if (room.status !== 'round-end') return { error: 'Permainan belum selesai.' };
      room.status = 'lobby';
      room.seats.forEach(s => {
        s.ready = s.bot ? true : s.id === room.hostId;
      });
      touch(room, now, 'Kembali ke ruang tunggu.');
      return { room };
    }

    case 'roll': {
      if (room.status !== 'playing') return { error: 'Permainan belum berjalan.' };
      if (seatIndex !== room.turnIndex) return { error: 'Bukan giliranmu.' };
      if (room.turnPhase !== 'roll') return { error: 'Kamu sudah melempar dadu pada giliran ini.' };

      const currentSeat = room.seats[seatIndex];
      const seed = hashSeed(`${room.code}:${room.rev}:${now}:${currentSeat.position}`);
      const rng = mulberry32(seed);

      const d1 = Math.floor(rng() * 6) + 1;
      const d2 = Math.floor(rng() * 6) + 1;
      const totalSteps = d1 + d2;
      const isDouble = d1 === d2;
      room.dice = [d1, d2];

      // Bila pemain sedang di Penjara
      if (currentSeat.inJail) {
        if (isDouble) {
          currentSeat.inJail = false;
          currentSeat.jailTurns = 0;
          currentSeat.position = (JAIL_POSITION + totalSteps) % TOTAL_TILES;
          room.turnPhase = 'action';
          touch(room, now, `🎲 ${currentSeat.name} kocok dadu double (${d1}+${d2})! Bebas dari penjara dan maju ke ${MONOPOLY_TILES[currentSeat.position].name}!`);
          return { room };
        }
        currentSeat.jailTurns += 1;
        if (currentSeat.jailTurns >= 3) {
          // Wajib bayar denda Rp 50 setelah 3 putaran
          if (currentSeat.cash >= JAIL_FINE) {
            currentSeat.cash -= JAIL_FINE;
            currentSeat.inJail = false;
            currentSeat.jailTurns = 0;
            currentSeat.position = (JAIL_POSITION + totalSteps) % TOTAL_TILES;
            room.turnPhase = 'action';
            touch(room, now, `💸 ${currentSeat.name} bayar denda Rp ${JAIL_FINE} setelah 3x gagal kocok double, bebas dan maju ke ${MONOPOLY_TILES[currentSeat.position].name}.`);
            return { room };
          }
        }
        room.turnPhase = 'action';
        touch(room, now, `🎲 ${currentSeat.name} melempar dadu ${d1}+${d2} = ${totalSteps} (Bukan double). Masih tertahan di Penjara.`);
        return { room };
      }

      // Cek apakah 3x double berturut-turut -> masuk penjara karena ngebut!
      if (isDouble) {
        room.doubleCount += 1;
        if (room.doubleCount >= 3) {
          room.doubleCount = 0;
          sendToJail(currentSeat, room, now, 'melempar dadu double 3x berturut-turut! Ditilang dan MASUK PENJARA!');
          return { room };
        }
      } else {
        room.doubleCount = 0;
      }

      // Gerakkan bidak
      const oldPos = currentSeat.position;
      const newPos = (oldPos + totalSteps) % TOTAL_TILES;
      const passedGo = newPos < oldPos; // melewati petak GO
      currentSeat.position = newPos;

      if (passedGo) {
        currentSeat.cash += GO_SALARY;
      }

      const landedTile = MONOPOLY_TILES[newPos];
      room.turnPhase = 'action';
      room.activeCard = null;

      let logMsg = `🎲 ${currentSeat.name} melempar ${d1}+${d2} = ${totalSteps}${isDouble ? ' (DOUBLE!)' : ''} → mendarat di ${landedTile.name}.`;
      if (passedGo) logMsg += ` (+Gaji Rp ${GO_SALARY})`;

      // Evaluasi efek petak
      if (landedTile.type === 'goto_jail') {
        sendToJail(currentSeat, room, now, 'mendarat di petak Masuk Penjara!');
        return { room };
      }

      if (landedTile.type === 'tax') {
        const taxAmt = landedTile.cost || 100;
        currentSeat.cash -= taxAmt;
        logMsg += ` Bayar pajak Rp ${taxAmt}.`;
      } else if (['property', 'station', 'utility'].includes(landedTile.type)) {
        const prop = room.properties[newPos];
        if (prop?.ownerId && prop.ownerId !== currentSeat.id && !prop.mortgaged) {
          const owner = room.seats.find(s => s.id === prop.ownerId);
          const rent = calculateRent(room, newPos, totalSteps);
          if (rent > 0) {
            currentSeat.cash -= rent;
            if (owner) owner.cash += rent;
            logMsg += ` Bayar sewa Rp ${rent} ke ${owner?.name || 'pemilik'}.`;
          }
        }
      } else if (landedTile.type === 'chance' || landedTile.type === 'chest') {
        const deck = landedTile.type === 'chance' ? CHANCE_CARDS : CHEST_CARDS;
        const cardSeed = hashSeed(`${room.code}:${room.rev}:${now}:${landedTile.type}`);
        const cardIdx = Math.floor(mulberry32(cardSeed)() * deck.length);
        const card = deck[cardIdx];
        room.activeCard = { ...card, kind: landedTile.type };
        logMsg += ` Ambil kartu: "${card.text}"`;

        // Eksekusi efek instan kartu
        if (card.action === 'collect') currentSeat.cash += card.amount;
        else if (card.action === 'pay') currentSeat.cash -= card.amount;
        else if (card.action === 'jail') sendToJail(currentSeat, room, now, 'terkena razia kartu!');
        else if (card.action === 'jail_free') currentSeat.jailCards += 1;
        else if (card.action === 'goto') {
          if (card.target < currentSeat.position && card.collect) currentSeat.cash += card.collect;
          currentSeat.position = card.target;
        }
      }

      touch(room, now, logMsg);
      return { room };
    }

    case 'buy': {
      if (room.status !== 'playing') return { error: 'Permainan belum berjalan.' };
      if (seatIndex !== room.turnIndex) return { error: 'Bukan giliranmu.' };
      if (room.turnPhase !== 'action') return { error: 'Lemparkan dadu terlebih dahulu.' };

      const currentSeat = room.seats[seatIndex];
      const pos = currentSeat.position;
      const tile = MONOPOLY_TILES[pos];
      if (!['property', 'station', 'utility'].includes(tile.type)) {
        return { error: 'Petak ini bukan properti yang bisa dibeli.' };
      }

      const prop = room.properties[pos];
      if (prop.ownerId) {
        return { error: 'Tanah ini sudah dimiliki pemain lain.' };
      }

      if (currentSeat.cash < tile.price) {
        return { error: `Uang tidak cukup (Harga: Rp ${tile.price}).` };
      }

      currentSeat.cash -= tile.price;
      prop.ownerId = currentSeat.id;
      touch(room, now, `🏢 ${currentSeat.name} membeli ${tile.name} seharga Rp ${tile.price}!`);
      return { room };
    }

    case 'upgrade': {
      if (room.status !== 'playing') return { error: 'Permainan belum berjalan.' };
      const tileIndex = Number(intent.tileIndex);
      const tile = MONOPOLY_TILES[tileIndex];
      const prop = room.properties[tileIndex];

      if (!tile || tile.type !== 'property' || !prop) {
        return { error: 'Petak ini tidak bisa dibangun rumah.' };
      }
      if (prop.ownerId !== playerId) {
        return { error: 'Kamu bukan pemilik tanah ini.' };
      }
      if (!hasFullColorGroup(room, playerId, tile.group)) {
        return { error: `Kamu harus memiliki semua tanah warna ${PROPERTY_GROUPS[tile.group]?.name} sebelum membangun!` };
      }
      if (prop.houses >= 5) {
        return { error: 'Properti ini sudah memiliki Hotel maksimal!' };
      }
      if (seat.cash < tile.houseCost) {
        return { error: `Uang tidak cukup untuk membangun (Biaya: Rp ${tile.houseCost}).` };
      }

      seat.cash -= tile.houseCost;
      prop.houses += 1;
      const isHotel = prop.houses === 5;
      touch(room, now, `🏗️ ${seat.name} membangun ${isHotel ? 'HOTEL MEWAH' : `Rumah #${prop.houses}`} di ${tile.name} (Rp ${tile.houseCost})!`);
      return { room };
    }

    case 'payjailfine': {
      if (!seat.inJail) return { error: 'Kamu tidak sedang di penjara.' };
      if (seat.cash < JAIL_FINE) return { error: `Uangmu tidak cukup membayar denda Rp ${JAIL_FINE}.` };

      seat.cash -= JAIL_FINE;
      seat.inJail = false;
      seat.jailTurns = 0;
      touch(room, now, `💸 ${seat.name} membayar denda Rp ${JAIL_FINE} dan bebas dari Penjara!`);
      return { room };
    }

    case 'usejailcard': {
      if (!seat.inJail) return { error: 'Kamu tidak sedang di penjara.' };
      if (seat.jailCards < 1) return { error: 'Kamu tidak memiliki Kartu Bebas Penjara.' };

      seat.jailCards -= 1;
      seat.inJail = false;
      seat.jailTurns = 0;
      touch(room, now, `🎟️ ${seat.name} memakai Kartu Bebas Penjara dan langsung bebas!`);
      return { room };
    }

    case 'endturn': {
      if (room.status !== 'playing') return { error: 'Permainan belum berjalan.' };
      if (seatIndex !== room.turnIndex) return { error: 'Bukan giliranmu.' };
      if (room.turnPhase === 'roll') return { error: 'Kocok dadu terlebih dahulu sebelum mengakhiri giliran.' };

      const currentSeat = room.seats[seatIndex];

      // Cek apakah pemain bangkrut (uang < 0)
      if (currentSeat.cash < 0) {
        currentSeat.bankrupt = true;
        // Sita semua aset properti
        Object.entries(room.properties).forEach(([idx, prop]) => {
          if (prop.ownerId === currentSeat.id) {
            room.properties[idx] = { ownerId: null, houses: 0, mortgaged: false };
          }
        });
        touch(room, now, `💀 ${currentSeat.name} bangkrut dan tereliminasi dari permainan!`);
        if (checkGameOver(room, now)) return { room };
      }

      // Jika melempar dadu double dan tidak di penjara -> boleh jalan lagi!
      if (room.doubleCount > 0 && !currentSeat.inJail && !currentSeat.bankrupt) {
        room.turnPhase = 'roll';
        room.deadline = now + room.settings.turnSeconds * 1000;
        touch(room, now, `🎲 Dadu DOUBLE! ${currentSeat.name} berhak melempar dadu sekali lagi!`);
        return { room };
      }

      // Pindah giliran ke pemain berikutnya yang masih aktif
      room.turnIndex = nextTurnSeatIndex(room, seatIndex);
      room.turnPhase = 'roll';
      room.doubleCount = 0;
      room.turnStartedAt = now;
      room.deadline = now + room.settings.turnSeconds * 1000;
      room.activeCard = null;

      const nextSeat = room.seats[room.turnIndex];
      touch(room, now, `Giliran berpindah ke ${nextSeat.name}.`);
      return { room };
    }

    case 'tick': {
      if (room.status !== 'playing') return { error: 'Permainan belum berjalan.' };
      if (!room.deadline || now < room.deadline) return { error: 'Belum melewati batas waktu.' };

      const activeSeat = room.seats[room.turnIndex];
      if (!activeSeat) return { error: 'Pemain tidak ditemukan.' };

      // Bila timeout saat fase kocok dadu -> jalankan kocok dadu otomatis
      if (room.turnPhase === 'roll') {
        return applyMonopolyIntent(room, { type: 'roll' }, activeSeat.id, now);
      }

      // Bila timeout saat fase aksi -> akhiri giliran otomatis
      if (room.turnPhase === 'action') {
        return applyMonopolyIntent(room, { type: 'endturn' }, activeSeat.id, now);
      }

      return { room };
    }

    default:
      return { error: 'Aksi tidak dikenal.' };
  }
}
