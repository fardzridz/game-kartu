/**
 * NUSA STRIKE — Engine Room & Physics Minigame Murni.
 *
 * Dua tanggung jawab utama:
 * 1. State machine multiplayer dermaga (1–10 pemain):
 *    `applyFishingIntent(room, intent, playerId, now) -> { room } | { error }`
 *    sehingga kompatibel 100% dengan `createRealtimeService` (Firebase, Relay, Lokal).
 * 2. Step physics minigame (`stepReelingPhysics`, `stepCastingBar`):
 *    fungsi murni untuk di-loop via `requestAnimationFrame` dan diuji di Vitest.
 */

import { AVATARS, DEFAULT_AVATAR, normalizeAvatar } from '../engine/roomEngine.js';
import {
  FISH_CATALOG,
  PUBLIC_DOCKS,
  RARITY_CONFIG,
  ROD_CATALOG,
  getFishById,
  getRodById,
} from './fishingCatalog.js';

export const MAX_DOCK_PLAYERS = 10;
export const FISHING_STATES = ['idle', 'casting', 'waiting', 'reeling', 'result'];

const DEFAULT_COINS = 100;

function cleanName(raw, fallback = 'Pemancing') {
  const s = String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 18);
  return s || fallback;
}

export function normalizeFishingPlayer(p, index = 0) {
  if (!p || typeof p !== 'object') return null;
  const rodId = ROD_CATALOG.some(r => r.id === p.rodId) ? p.rodId : ROD_CATALOG[0].id;
  const ownedRods = Array.isArray(p.ownedRods) && p.ownedRods.length > 0
    ? Array.from(new Set([ROD_CATALOG[0].id, ...p.ownedRods.filter(id => ROD_CATALOG.some(r => r.id === id))]))
    : [ROD_CATALOG[0].id];
  const state = FISHING_STATES.includes(p.state) ? p.state : 'idle';
  return {
    id: String(p.id || `angler-${index}`),
    name: cleanName(p.name, `Pemancing ${index + 1}`),
    avatar: normalizeAvatar(p.avatar) || DEFAULT_AVATAR,
    slot: Number.isFinite(p.slot) ? p.slot : index,
    bot: Boolean(p.bot),
    online: p.online !== false,
    state,
    castDistance: Number.isFinite(p.castDistance) ? Math.max(15, Math.min(96, p.castDistance)) : 65,
    castTier: p.castTier || 'normal',
    tension: Number.isFinite(p.tension) ? Math.max(0, Math.min(100, p.tension)) : 0,
    hookRarity: RARITY_CONFIG[p.hookRarity] ? p.hookRarity : null,
    rodId,
    ownedRods,
    coins: Number.isFinite(p.coins) ? Math.max(0, Math.round(p.coins)) : DEFAULT_COINS,
    totalCaught: Number.isFinite(p.totalCaught) ? Math.max(0, p.totalCaught) : 0,
    bestCatch: p.bestCatch || null,
    lastCatch: p.lastCatch || null,
    inventory: Array.isArray(p.inventory) ? p.inventory.slice(0, 40) : [],
    updatedAt: Number(p.updatedAt) || 0,
  };
}

export function normalizeFishingRoom(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const seats = Array.isArray(raw.seats)
    ? raw.seats.map((p, idx) => normalizeFishingPlayer(p, idx)).filter(Boolean).slice(0, MAX_DOCK_PLAYERS)
    : [];
  const code = String(raw.code || 'NUSA01').toUpperCase();
  const publicDock = PUBLIC_DOCKS.find(d => d.code === code);
  return {
    v: 1,
    game: 'fishing',
    code,
    title: raw.title || publicDock?.name || `Dermaga #${code}`,
    isPublic: Boolean(raw.isPublic ?? Boolean(publicDock)),
    hostId: raw.hostId || seats[0]?.id || '',
    status: 'playing', // Dermaga selalu live (drop-in drop-out 1..10 pemain)
    seats,
    catchFeed: Array.isArray(raw.catchFeed) ? raw.catchFeed.slice(0, 20) : [],
    rev: Number(raw.rev) || 1,
    createdAt: Number(raw.createdAt) || Date.now(),
    lastActionAt: Number(raw.lastActionAt) || Date.now(),
  };
}

export function createFishingRoom({
  code = 'NUSA01',
  hostId,
  name = 'Pemancing',
  avatar = DEFAULT_AVATAR,
  isPublic = false,
  title = '',
  profile = null,
  now = Date.now(),
}) {
  const cleanCode = String(code || 'NUSA01').trim().toUpperCase();
  const publicDock = PUBLIC_DOCKS.find(d => d.code === cleanCode);
  const firstSeat = normalizeFishingPlayer({
    id: hostId,
    name,
    avatar,
    slot: 0,
    state: 'idle',
    coins: profile?.coins ?? DEFAULT_COINS,
    rodId: profile?.rodId || ROD_CATALOG[0].id,
    ownedRods: profile?.ownedRods || [ROD_CATALOG[0].id],
    inventory: profile?.inventory || [],
    totalCaught: profile?.totalCaught || 0,
    bestCatch: profile?.bestCatch || null,
    updatedAt: now,
  }, 0);

  return normalizeFishingRoom({
    v: 1,
    game: 'fishing',
    code: cleanCode,
    title: title || publicDock?.name || `Dermaga Nusantara #${cleanCode}`,
    isPublic: Boolean(isPublic || publicDock),
    hostId,
    status: 'playing',
    seats: [firstSeat],
    catchFeed: [],
    rev: 1,
    createdAt: now,
    lastActionAt: now,
  });
}

function nextFreeSlot(seats = []) {
  const used = new Set(seats.map(s => s.slot));
  for (let i = 0; i < MAX_DOCK_PLAYERS; i += 1) {
    if (!used.has(i)) return i;
  }
  return seats.length;
}

function nextFreeAvatar(seats = [], preferred = DEFAULT_AVATAR) {
  const clean = normalizeAvatar(preferred) || DEFAULT_AVATAR;
  const used = new Set(seats.map(s => s.avatar));
  if (!used.has(clean)) return clean;
  return AVATARS.find(a => !used.has(a)) || clean;
}

/**
 * Terapkan intent pemain ke state room dermaga secara atomik.
 *
 * Intent yang didukung:
 * - `sit`: masuk / update kursi di dermaga (maks 10 pemain)
 * - `leave`: keluar dari dermaga
 * - `syncstate`: sinkronkan status memancing real-time (idle | casting | waiting | reeling | result)
 * - `catch`: catat hasil tangkapan ikan, tambah koin + inventory + live catch feed
 * - `buyrod` / `equiprod`: beli atau pasang joran di Toko Joran
 * - `sellfish`: jual ikan dari tas untuk tambahan koin
 * - `addbot` / `removebot`: tambah/hapus teman pancing bot di dermaga
 */
export function applyFishingIntent(current, intent, actorId, now = Date.now()) {
  const room = normalizeFishingRoom(current);
  if (!room) return { error: 'Dermaga belum tersedia.' };
  if (!intent || typeof intent !== 'object') return { error: 'Aksi tidak valid.' };

  const type = String(intent.type || '').toLowerCase();
  const seats = room.seats.map(s => ({ ...s }));
  const meIndex = seats.findIndex(s => s.id === actorId);

  if (type === 'sit') {
    if (meIndex >= 0) {
      const existing = seats[meIndex];
      seats[meIndex] = normalizeFishingPlayer({
        ...existing,
        name: intent.name || existing.name,
        avatar: intent.avatar ? normalizeAvatar(intent.avatar) : existing.avatar,
        online: true,
        updatedAt: now,
      }, existing.slot);
    } else {
      if (seats.length >= MAX_DOCK_PLAYERS) {
        return { error: 'Dermaga sudah penuh (maksimal 10 pemancing).' };
      }
      const slot = nextFreeSlot(seats);
      const avatar = nextFreeAvatar(seats, intent.avatar);
      const prof = intent.profile || {};
      seats.push(normalizeFishingPlayer({
        id: actorId,
        name: intent.name,
        avatar,
        slot,
        online: true,
        state: 'idle',
        coins: prof.coins ?? DEFAULT_COINS,
        rodId: prof.rodId || ROD_CATALOG[0].id,
        ownedRods: prof.ownedRods || [ROD_CATALOG[0].id],
        inventory: prof.inventory || [],
        totalCaught: prof.totalCaught || 0,
        bestCatch: prof.bestCatch || null,
        updatedAt: now,
      }, slot));
    }
    return {
      room: {
        ...room,
        hostId: room.hostId || actorId,
        seats,
        rev: room.rev + 1,
        lastActionAt: now,
      },
    };
  }

  if (type === 'leave') {
    if (meIndex < 0) return { room };
    seats.splice(meIndex, 1);
    const nextHost = room.hostId === actorId ? (seats.find(s => !s.bot)?.id || seats[0]?.id || '') : room.hostId;
    return {
      room: {
        ...room,
        hostId: nextHost,
        seats,
        rev: room.rev + 1,
        lastActionAt: now,
      },
    };
  }

  if (type === 'addbot') {
    if (seats.length >= MAX_DOCK_PLAYERS) {
      return { error: 'Dermaga sudah penuh (10/10 pemancing).' };
    }
    const botNames = ['Pak Kumis', 'Bang Jali', 'Wak Doyok', 'Kapten Bima', 'Cak Lontong', 'Mas Karyo', 'Neng Susi', 'Bli Made', 'Daeng Tola'];
    const usedNames = new Set(seats.map(s => s.name));
    const botName = botNames.find(n => !usedNames.has(n)) || `Pemancing Bot ${seats.length}`;
    const slot = nextFreeSlot(seats);
    const avatar = nextFreeAvatar(seats, AVATARS[seats.length % AVATARS.length]);
    const botRods = ['bambu-desa', 'fiber-pesisir', 'karbon-samudra'];
    seats.push(normalizeFishingPlayer({
      id: `bot-${now}-${slot}`,
      name: botName,
      avatar,
      slot,
      bot: true,
      online: true,
      state: 'waiting',
      castDistance: 55 + (slot * 7) % 35,
      rodId: botRods[slot % botRods.length],
      coins: 150 + slot * 45,
      updatedAt: now,
    }, slot));
    return {
      room: {
        ...room,
        seats,
        rev: room.rev + 1,
        lastActionAt: now,
      },
    };
  }

  if (type === 'removebot') {
    const botIdx = intent.botId
      ? seats.findIndex(s => s.bot && s.id === intent.botId)
      : seats.map((s, idx) => (s.bot ? idx : -1)).filter(idx => idx >= 0).pop() ?? -1;
    if (botIdx < 0) return { error: 'Tidak ada bot di dermaga.' };
    seats.splice(botIdx, 1);
    return {
      room: {
        ...room,
        seats,
        rev: room.rev + 1,
        lastActionAt: now,
      },
    };
  }

  const targetIndex = intent.targetId
    ? seats.findIndex(s => s.id === intent.targetId)
    : meIndex;

  if (targetIndex < 0) {
    return { error: 'Pemancing belum duduk di dermaga.' };
  }

  const player = { ...seats[targetIndex] };

  if (type === 'syncstate') {
    const nextState = FISHING_STATES.includes(intent.state) ? intent.state : player.state;
    player.state = nextState;
    if (Number.isFinite(intent.castDistance)) {
      player.castDistance = Math.max(15, Math.min(96, Number(intent.castDistance)));
    }
    if (intent.castTier) player.castTier = intent.castTier;
    if (Number.isFinite(intent.tension)) {
      player.tension = Math.max(0, Math.min(100, Number(intent.tension)));
    } else if (nextState !== 'reeling') {
      player.tension = 0;
    }
    player.hookRarity = nextState === 'reeling' && RARITY_CONFIG[intent.hookRarity]
      ? intent.hookRarity
      : null;
    player.updatedAt = now;
    seats[targetIndex] = player;
    return {
      room: {
        ...room,
        seats,
        rev: room.rev + 1,
        lastActionAt: now,
      },
    };
  }

  if (type === 'catch') {
    const fish = getFishById(intent.fishId);
    const weightKg = Math.max(0.1, Math.round((Number(intent.weightKg) || fish.minKg) * 100) / 100);
    const coins = Math.max(5, Math.round(Number(intent.coins) || fish.baseCoins));
    const entry = {
      uid: `${actorId}-${now}-${Math.random().toString(36).slice(2, 6)}`,
      fishId: fish.id,
      fishName: fish.name,
      region: fish.region,
      rarity: fish.rarity,
      weightKg,
      coins,
      caughtAt: now,
    };

    player.state = 'result';
    player.tension = 0;
    player.hookRarity = null;
    player.coins = (player.coins || 0) + coins;
    player.totalCaught = (player.totalCaught || 0) + 1;
    player.lastCatch = entry;
    if (!player.bestCatch || weightKg > (player.bestCatch.weightKg || 0)) {
      player.bestCatch = entry;
    }
    player.inventory = [entry, ...(player.inventory || [])].slice(0, 40);
    player.updatedAt = now;
    seats[targetIndex] = player;

    const feedItem = {
      id: entry.uid,
      playerId: player.id,
      playerName: player.name,
      avatar: player.avatar,
      fishId: fish.id,
      fishName: fish.name,
      rarity: fish.rarity,
      weightKg,
      coins,
      at: now,
    };

    return {
      room: {
        ...room,
        seats,
        catchFeed: [feedItem, ...(room.catchFeed || [])].slice(0, 20),
        rev: room.rev + 1,
        lastActionAt: now,
      },
    };
  }

  if (type === 'buyrod') {
    const rod = getRodById(intent.rodId);
    if (!rod) return { error: 'Joran tidak ditemukan.' };
    const owned = new Set(player.ownedRods || [ROD_CATALOG[0].id]);
    if (owned.has(rod.id)) {
      player.rodId = rod.id;
      player.updatedAt = now;
      seats[targetIndex] = player;
      return {
        room: { ...room, seats, rev: room.rev + 1, lastActionAt: now },
      };
    }
    if ((player.coins || 0) < rod.price) {
      return { error: `Koin belum cukup. Butuh ${rod.price} koin untuk membeli ${rod.name}.` };
    }
    player.coins -= rod.price;
    owned.add(rod.id);
    player.ownedRods = Array.from(owned);
    player.rodId = rod.id;
    player.updatedAt = now;
    seats[targetIndex] = player;
    return {
      room: {
        ...room,
        seats,
        rev: room.rev + 1,
        lastActionAt: now,
      },
    };
  }

  if (type === 'equiprod') {
    const rod = getRodById(intent.rodId);
    const owned = new Set(player.ownedRods || [ROD_CATALOG[0].id]);
    if (!owned.has(rod.id)) {
      return { error: 'Kamu belum memiliki joran ini.' };
    }
    player.rodId = rod.id;
    player.updatedAt = now;
    seats[targetIndex] = player;
    return {
      room: {
        ...room,
        seats,
        rev: room.rev + 1,
        lastActionAt: now,
      },
    };
  }

  return { error: 'Aksi tidak dikenal.' };
}

// ============================================================================
// PHYSICS ENGINE MINIGAME (MURNI & DAPAT DITES)
// ============================================================================

/**
 * Buat state awal minigame tarik-ulur (REELING) saat pemain berhasil Strike.
 */
export function createReelingState({ fish, rodId = 'bambu-desa' }) {
  const targetFish = fish || FISH_CATALOG[0];
  const rarityCfg = RARITY_CONFIG[targetFish.rarity] || RARITY_CONFIG.common;
  const rod = getRodById(rodId);
  const barHeight = Math.min(42, rarityCfg.barHeight + (rod.barBonus || 0));

  return {
    fishId: targetFish.id,
    rarity: targetFish.rarity,
    barPos: 18,            // posisi bawah catch bar (0..100 - barHeight)
    barVel: 0,             // kecepatan vertikal catch bar
    barHeight,
    fishPos: 32,           // posisi ikan (0..92)
    fishTarget: 62,        // target gerak AI ikan berikutnya
    fishVel: 0,
    progress: 26,          // 0..100% (100 = tertangkap, 0 = lepas)
    tension: 12,           // 0..100% (100 = senar putus)
    isRaging: false,       // fase ikan ngamuk (merah)
    rageTimer: 2.2,        // hitung mundur ganti fase tenang <-> ngamuk (detik)
    overlapping: true,
    status: 'playing',     // 'playing' | 'caught' | 'snapped' | 'escaped'
  };
}

/**
 * Majukan simulasi power bar saat fase CASTING.
 * Power memantul 0 <-> 100 dengan kecepatan konstan.
 */
export function stepCastingBar(state, dtSeconds = 0.016) {
  const dt = Math.max(0.001, Math.min(0.1, Number(dtSeconds) || 0.016));
  const speed = 135; // % per detik
  let power = (Number(state?.power) || 0) + (state?.dir ?? 1) * speed * dt;
  let dir = state?.dir ?? 1;
  if (power >= 100) {
    power = 100 - (power - 100);
    dir = -1;
  } else if (power <= 0) {
    power = -power;
    dir = 1;
  }
  return { power: Math.max(0, Math.min(100, power)), dir };
}

/**
 * Majukan simulasi physics minigame REELING satu langkah waktu `dtSeconds`.
 *
 * Aturan sesuai spesifikasi Step 2:
 * - Pemain menahan layar (`holding = true`) → Catch Bar naik melawan gravitasi.
 * - AI Ikan bergerak sesuai rarity: Common (lambat), Uncommon (sedang),
 *   Rare (darter/lompat-lompat), Mythic (agresif & catch bar mengecil).
 * - Tension Meter: saat ikan fase ngamuk (`isRaging = true`) dan pemain terus
 *   menahan tarikan (`holding = true`), Tension naik cepat. Jika mencapai 100%,
 *   senar putus (`status = 'snapped'`).
 * - Jika Catch Bar overlap dengan siluet ikan, Progress naik. Jika 100%,
 *   ikan tertangkap (`status = 'caught'`). Jika 0%, ikan lepas (`status = 'escaped'`).
 */
export function stepReelingPhysics(state, { holding = false, dtSeconds = 0.016, rodId = 'bambu-desa', rng = Math.random } = {}) {
  if (!state || state.status !== 'playing') return state;
  const dt = Math.max(0.001, Math.min(0.1, Number(dtSeconds) || 0.016));
  const rarityCfg = RARITY_CONFIG[state.rarity] || RARITY_CONFIG.common;
  const rod = getRodById(rodId);

  // 1. Gerak Catch Bar (melawan gravitasi saat ditahan)
  const thrust = holding ? 185 : -165;
  let barVel = (state.barVel + thrust * dt) * Math.pow(0.88, dt * 60);
  barVel = Math.max(-110, Math.min(110, barVel));
  let barPos = state.barPos + barVel * dt;
  const maxBarPos = 100 - state.barHeight;
  if (barPos <= 0) {
    barPos = 0;
    barVel = Math.max(0, barVel * -0.25);
  } else if (barPos >= maxBarPos) {
    barPos = maxBarPos;
    barVel = Math.min(0, barVel * -0.25);
  }

  // 2. Fase Tenang vs Fase Ngamuk (Rage)
  let isRaging = Boolean(state.isRaging);
  let rageTimer = (Number(state.rageTimer) || 1.5) - dt;
  if (rageTimer <= 0) {
    isRaging = !isRaging;
    const [minT, maxT] = isRaging ? rarityCfg.rageDuration : rarityCfg.rageInterval;
    rageTimer = minT + rng() * (maxT - minT);
  }

  // 3. AI Gerak Ikan berdasarkan Rarity
  let fishTarget = state.fishTarget;
  let fishPos = state.fishPos;
  let fishVel = state.fishVel || 0;

  const distToTarget = fishTarget - fishPos;
  if (Math.abs(distToTarget) < 4 || rng() < rarityCfg.aiDartChance * dt) {
    if (state.rarity === 'rare' || state.rarity === 'mythic') {
      // Darter / agresif: sering loncat ke ujung berlawanan
      const jump = 12 + rng() * 76;
      fishTarget = Math.max(6, Math.min(92, jump));
    } else {
      // Common / Uncommon: gerak lebih halus
      const delta = (rng() - 0.48) * (state.rarity === 'uncommon' ? 56 : 38);
      fishTarget = Math.max(8, Math.min(90, fishPos + delta));
    }
  }

  const speedMult = isRaging ? 1.35 : 1.0;
  const desiredVel = Math.sign(fishTarget - fishPos) * rarityCfg.aiSpeed * speedMult;
  fishVel += (desiredVel - fishVel) * Math.min(1, dt * (state.rarity === 'mythic' ? 9 : 6));
  fishPos = Math.max(4, Math.min(94, fishPos + fishVel * dt));

  // 4. Cek Overlap antara Catch Bar dan Siluet Ikan
  const fishHalfSize = 4.5;
  const barBottom = barPos;
  const barTop = barPos + state.barHeight;
  const overlapping = (fishPos + fishHalfSize >= barBottom) && (fishPos - fishHalfSize <= barTop);

  // 5. Tension Meter (Ketegangan Senar)
  const resist = Math.max(0, Math.min(0.6, rod.tensionResist || 0));
  let tension = state.tension;
  if (holding && isRaging) {
    // Menahan tarikan saat ikan ngamuk -> Tension naik cepat!
    tension += rarityCfg.tensionRageRate * (1 - resist) * dt;
  } else if (holding && !isRaging) {
    // Menahan saat tenang -> naik sangat tipis bila di luar bar, turun pelan bila pas di bar
    tension += (overlapping ? -6 : 7 * (1 - resist)) * dt;
  } else {
    // Melepas tarikan -> Tension turun
    tension -= rarityCfg.tensionCalmDecay * (isRaging ? 0.75 : 1.15) * dt;
  }
  tension = Math.max(0, Math.min(100, tension));

  // 6. Progress Tangkapan
  let progress = state.progress;
  if (overlapping) {
    progress += rarityCfg.progressGain * dt;
  } else {
    progress -= rarityCfg.progressLoss * (isRaging ? 1.25 : 1.0) * dt;
  }
  progress = Math.max(0, Math.min(100, progress));

  // 7. Evaluasi Menang / Putus / Lepas
  let status = 'playing';
  if (tension >= 100) {
    status = 'snapped';
  } else if (progress >= 100) {
    status = 'caught';
  } else if (progress <= 0) {
    status = 'escaped';
  }

  return {
    ...state,
    barPos,
    barVel,
    fishPos,
    fishTarget,
    fishVel,
    progress,
    tension,
    isRaging,
    rageTimer,
    overlapping,
    status,
  };
}
