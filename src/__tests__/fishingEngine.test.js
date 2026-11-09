import { describe, expect, it } from 'vitest';
import {
  FISH_CATALOG,
  RARITY_CONFIG,
  ROD_CATALOG,
  evaluateCastAccuracy,
  rollFishCatch,
} from '../fishing/fishingCatalog.js';
import {
  MAX_DOCK_PLAYERS,
  applyFishingIntent,
  createFishingRoom,
  createReelingState,
  stepCastingBar,
  stepReelingPhysics,
} from '../fishing/fishingEngine.js';

describe('Nusa Strike — Katalog & Akurasi Lemparan', () => {
  it('mengevaluasi Sweet Spot (74..86%) dengan bonus hoki', () => {
    const sweet = evaluateCastAccuracy(80);
    expect(sweet.tier).toBe('perfect');
    expect(sweet.bonusLuck).toBeGreaterThan(0.2);

    const good = evaluateCastAccuracy(65);
    expect(good.tier).toBe('good');

    const short = evaluateCastAccuracy(20);
    expect(short.tier).toBe('normal');
  });

  it('mengundi tangkapan ikan lokal Indonesia lengkap dengan berat kg & koin', () => {
    const commonCatch = rollFishCatch({ castPower: 50, rodId: 'bambu-desa', rng: () => 0.92 });
    expect(commonCatch.rarity).toBe('common');
    expect(commonCatch.weightKg).toBeGreaterThanOrEqual(commonCatch.fish.minKg);
    expect(commonCatch.weightKg).toBeLessThanOrEqual(commonCatch.fish.maxKg);
    expect(commonCatch.coins).toBeGreaterThanOrEqual(10);

    const mythicCatch = rollFishCatch({ castPower: 80, rodId: 'pusaka-nusantara', rng: () => 0.01 });
    expect(mythicCatch.rarity).toBe('mythic');
    expect(FISH_CATALOG.some(f => f.id === mythicCatch.fish.id)).toBe(true);
  });
});

describe('Nusa Strike — Physics Minigame (Timing Bar & Tension Meter)', () => {
  it('menggerakkan power bar casting bolak-balik 0..100', () => {
    const step1 = stepCastingBar({ power: 95, dir: 1 }, 0.1);
    expect(step1.dir).toBe(-1);
    expect(step1.power).toBeLessThanOrEqual(100);
  });

  it('menaikkan Catch Bar saat pemain menahan layar (holding = true)', () => {
    const fish = FISH_CATALOG.find(f => f.rarity === 'common');
    let state = createReelingState({ fish, rodId: 'bambu-desa' });
    const startPos = state.barPos;

    for (let i = 0; i < 10; i += 1) {
      state = stepReelingPhysics(state, { holding: true, dtSeconds: 0.03 });
    }
    expect(state.barPos).toBeGreaterThan(startPos);
  });

  it('memperkecil Catch Bar pada ikan Mythic dan memperlebar dengan upgrade joran', () => {
    const commonFish = FISH_CATALOG.find(f => f.rarity === 'common');
    const mythicFish = FISH_CATALOG.find(f => f.rarity === 'mythic');

    const commonState = createReelingState({ fish: commonFish, rodId: 'bambu-desa' });
    const mythicState = createReelingState({ fish: mythicFish, rodId: 'bambu-desa' });
    const upgradedState = createReelingState({ fish: mythicFish, rodId: 'pusaka-nusantara' });

    expect(mythicState.barHeight).toBeLessThan(commonState.barHeight);
    expect(upgradedState.barHeight).toBeGreaterThan(mythicState.barHeight);
    expect(RARITY_CONFIG.mythic.aiSpeed).toBeGreaterThan(RARITY_CONFIG.common.aiSpeed);
  });

  it('menaikkan Tension dengan cepat saat menahan tarikan di fase ikan ngamuk hingga senar putus (100%)', () => {
    const mythicFish = FISH_CATALOG.find(f => f.rarity === 'mythic');
    let state = {
      ...createReelingState({ fish: mythicFish, rodId: 'bambu-desa' }),
      isRaging: true,
      rageTimer: 10,
      tension: 65,
    };

    for (let i = 0; i < 30 && state.status === 'playing'; i += 1) {
      state = stepReelingPhysics(state, { holding: true, dtSeconds: 0.05 });
    }
    expect(state.tension).toBe(100);
    expect(state.status).toBe('snapped');
  });

  it('menangkap ikan (status = caught) saat Catch Bar terus overlap dengan ikan', () => {
    const commonFish = FISH_CATALOG.find(f => f.rarity === 'common');
    let state = {
      ...createReelingState({ fish: commonFish, rodId: 'pusaka-nusantara' }),
      progress: 88,
      barPos: 30,
      fishPos: 38,
      fishTarget: 38,
      isRaging: false,
      rageTimer: 10,
    };

    for (let i = 0; i < 25 && state.status === 'playing'; i += 1) {
      // Jaga supaya bar tetap di sekitar ikan
      state.barPos = state.fishPos - state.barHeight / 2;
      state = stepReelingPhysics(state, { holding: false, dtSeconds: 0.05 });
    }
    expect(state.progress).toBe(100);
    expect(state.status).toBe('caught');
  });
});

describe('Nusa Strike — Multiplayer Dermaga (1–10 Pemain)', () => {
  it('mengizinkan 1 hingga 10 pemancing masuk ke dermaga dan menolak pemain ke-11', () => {
    let room = createFishingRoom({
      code: 'NUSA01',
      hostId: 'p1',
      name: 'Pemancing 1',
      isPublic: true,
    });
    expect(room.seats).toHaveLength(1);

    for (let i = 2; i <= MAX_DOCK_PLAYERS; i += 1) {
      const res = applyFishingIntent(room, { type: 'sit', name: `Pemancing ${i}` }, `p${i}`, 1000 + i);
      expect(res.error).toBeUndefined();
      room = res.room;
    }
    expect(room.seats).toHaveLength(10);

    const overflow = applyFishingIntent(room, { type: 'sit', name: 'Pemancing 11' }, 'p11', 2000);
    expect(overflow.error).toMatch(/penuh/i);
  });

  it('menyinkronkan status memancing, mencatat tangkapan ke live feed, dan upgrade joran', () => {
    let room = createFishingRoom({
      code: 'NUSA01',
      hostId: 'p1',
      name: 'Ridz',
      profile: { coins: 300 },
    });

    // Sinkronisasi state ke reeling (STRIKE!)
    const syncRes = applyFishingIntent(
      room,
      { type: 'syncstate', state: 'reeling', tension: 72, hookRarity: 'rare' },
      'p1',
      1500,
    );
    room = syncRes.room;
    expect(room.seats[0].state).toBe('reeling');
    expect(room.seats[0].tension).toBe(72);
    expect(room.seats[0].hookRarity).toBe('rare');

    // Berhasil tangkap ikan
    const catchRes = applyFishingIntent(
      room,
      { type: 'catch', fishId: 'toman-borneo', weightKg: 12.4, coins: 210 },
      'p1',
      2000,
    );
    room = catchRes.room;
    expect(room.seats[0].coins).toBe(510);
    expect(room.seats[0].totalCaught).toBe(1);
    expect(room.seats[0].inventory[0].fishName).toBe('Monster Toman');
    expect(room.catchFeed[0].fishName).toBe('Monster Toman');

    // Beli joran level 2 di Toko Joran
    const rodLv2 = ROD_CATALOG[1];
    const buyRes = applyFishingIntent(
      room,
      { type: 'buyrod', rodId: rodLv2.id },
      'p1',
      2500,
    );
    room = buyRes.room;
    expect(room.seats[0].rodId).toBe(rodLv2.id);
    expect(room.seats[0].coins).toBe(510 - rodLv2.price);
  });
});
