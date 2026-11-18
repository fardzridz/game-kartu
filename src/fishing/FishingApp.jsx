import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  createRealtimeService,
  friendlyRealtimeError,
  realtimeMode,
  serverNow,
} from '../services/realtimeService.js';
import { openEphemeralChannel } from '../services/ephemeralChannel.js';
import { makeId } from '../utils/id.js';
import { DEFAULT_AVATAR } from '../engine/roomEngine.js';
import {
  PUBLIC_DOCKS,
  ROD_CATALOG,
  evaluateCastAccuracy,
  rollFishCatch,
} from './fishingCatalog.js';
import {
  applyFishingIntent,
  createFishingRoom,
  createReelingState,
  normalizeFishingRoom,
  stepCastingBar,
  stepReelingPhysics,
} from './fishingEngine.js';
import { playFishingSFX } from './fishingSound.js';
import FishingHome from './FishingHome.jsx';
import FishingStage from './FishingStage.jsx';
import './fishing.css';

const SESSION_KEY = 'nusa-strike-session';
const PROFILE_KEY = 'nusa-strike-profile-v1';
const SERVICE_OPTIONS = { root: 'fishingRooms', prefix: 'fishing' };
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const sessionStore = {
  save(code, playerId) {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify({ code, playerId })); } catch { /* abaikan */ }
  },
  load() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
  },
  clear() {
    try { localStorage.removeItem(SESSION_KEY); } catch { /* abaikan */ }
  },
};

const profileStore = {
  load() {
    try {
      const raw = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
      if (raw && typeof raw === 'object') return raw;
    } catch { /* abaikan */ }
    return {
      name: '',
      avatar: DEFAULT_AVATAR,
      coins: 120,
      rodId: ROD_CATALOG[0].id,
      ownedRods: [ROD_CATALOG[0].id],
      inventory: [],
      totalCaught: 0,
      bestCatch: null,
    };
  },
  save(next) {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(next)); } catch { /* abaikan */ }
  },
};

function makePrivateCode() {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
}

export default function FishingApp({ onExitToHub }) {
  const [profile, setProfile] = useState(() => profileStore.load());
  const [service, setService] = useState(null);
  const [room, setRoom] = useState(null);
  const [viewerId, setViewerId] = useState(null);
  const [presence, setPresence] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [initialCode] = useState(() => {
    if (typeof location === 'undefined') return '';
    const urlRoom = new URLSearchParams(location.search).get('room');
    return urlRoom && /^[A-Z0-9]{6}$/i.test(urlRoom) ? urlRoom.toUpperCase() : '';
  });

  // 5-State Machine lokal untuk responsivitas 60fps:
  // 'idle' -> 'casting' -> 'waiting' -> 'reeling' -> 'result'
  const [localPhase, setLocalPhase] = useState('idle');
  const [castPower, setCastPower] = useState(0);
  const [castFeedback, setCastFeedback] = useState(null);
  const [nibbleActive, setNibbleActive] = useState(false);
  const [biteWindow, setBiteWindow] = useState(false);
  const [hookedCatch, setHookedCatch] = useState(null);
  const [reelingState, setReelingState] = useState(null);
  const [holdingReel, setHoldingReel] = useState(false);
  const [resultModal, setResultModal] = useState(null);

  // Realtime Broadcast UI states
  const [liveToast, setLiveToast] = useState(null);
  const [floatingEmotes, setFloatingEmotes] = useState({});
  const [drawerTab, setDrawerTab] = useState(null);
  const [copiedInvite, setCopiedInvite] = useState(false);

  const roomRef = useRef(null);
  const serviceRef = useRef(null);
  const broadcastRef = useRef(null);
  const holdingRef = useRef(false);
  const castingDirRef = useRef({ power: 0, dir: 1 });
  const reelingRef = useRef(null);
  const hookedRef = useRef(null);
  const waitTimersRef = useRef([]);
  const lastFeedIdRef = useRef(null);

  useEffect(() => { roomRef.current = room; }, [room]);
  useEffect(() => { serviceRef.current = service; }, [service]);
  useEffect(() => { holdingRef.current = holdingReel; }, [holdingReel]);

  const clearWaitTimers = useCallback(() => {
    waitTimersRef.current.forEach(t => clearTimeout(t));
    waitTimersRef.current = [];
  }, []);

  const syncLocalProfileFromRoom = useCallback((nextRoom, targetViewerId) => {
    if (!nextRoom || !targetViewerId) return;
    const me = nextRoom.seats?.find(s => s.id === targetViewerId);
    if (!me) return;
    const updated = {
      name: me.name,
      avatar: me.avatar,
      coins: me.coins,
      rodId: me.rodId,
      ownedRods: me.ownedRods,
      inventory: me.inventory,
      totalCaught: me.totalCaught,
      bestCatch: me.bestCatch,
    };
    setProfile(updated);
    profileStore.save(updated);
  }, []);

  // Munculkan Live Catch Toast Banner saat catchFeed di room bertambah
  useEffect(() => {
    const latest = room?.catchFeed?.[0];
    if (!latest || latest.id === lastFeedIdRef.current) return;
    lastFeedIdRef.current = latest.id;
    setLiveToast(latest);
    const timer = setTimeout(() => {
      setLiveToast(curr => (curr?.id === latest.id ? null : curr));
    }, latest.rarity === 'mythic' ? 6500 : 4500);
    return () => clearTimeout(timer);
  }, [room?.catchFeed]);

  const sendRoomIntent = useCallback(async intent => {
    const adapter = serviceRef.current;
    if (!adapter || !viewerId) return null;
    try {
      const res = await adapter.transact(current => {
        if (!current) return undefined;
        const out = applyFishingIntent(current, intent, viewerId, serverNow());
        if (out.error) return undefined;
        return out.room;
      });
      return res;
    } catch {
      return null;
    }
  }, [viewerId]);

  // Pasang Ephemeral Broadcast Channel untuk Quick Emote & Live Strike/Catch Event
  useEffect(() => {
    if (!room?.code || !viewerId) return undefined;
    const channel = openEphemeralChannel({
      roomCode: room.code,
      root: 'fishingRooms',
      nodeName: 'events',
      channelName: `nusa-events-${room.code}`,
      selfClientId: viewerId,
      staleMs: 15000,
      retainMs: 15000,
      onEvent: payload => {
        if (!payload || typeof payload !== 'object') return;
        if (payload.kind === 'emote' && payload.from) {
          setFloatingEmotes(prev => ({
            ...prev,
            [payload.from]: {
              icon: payload.icon || '🎣',
              label: payload.label || 'Mantap!',
              ts: payload.ts || Date.now(),
            },
          }));
        } else if (payload.kind === 'catch' && payload.catchItem) {
          setLiveToast(payload.catchItem);
        }
      },
    });
    broadcastRef.current = channel;
    return () => {
      channel.close();
      broadcastRef.current = null;
    };
  }, [room?.code, viewerId]);

  const attachAdapter = useCallback((adapter, activePlayerId) => {
    setService(prev => {
      if (prev && prev !== adapter) prev.close();
      return adapter;
    });
    serviceRef.current = adapter;
    adapter.subscribe(
      val => {
        if (val) {
          const normalized = normalizeFishingRoom(val);
          setRoom(normalized);
          syncLocalProfileFromRoom(normalized, activePlayerId);
        }
      },
      problem => setError(problem?.detail || 'Koneksi ke server bermasalah.'),
    );
    adapter.watchPresence(val => setPresence(val || {}));
    adapter.setPresence(true).catch(() => {});
  }, [syncLocalProfileFromRoom]);

  // Heartbeat presence
  useEffect(() => {
    if (!service) return undefined;
    const timer = setInterval(() => {
      service.setPresence(!document.hidden).catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
  }, [service]);

  // Masuk atau buat Room Dermaga (Public / Private)
  const enterDockRoom = useCallback(async ({ code, name, avatar, isPublic = false, bots = 0, allowCreate = true }) => {
    setBusy('enter');
    setError('');
    const cleanCode = String(code || PUBLIC_DOCKS[0].code).trim().toUpperCase();
    const saved = sessionStore.load();
    const playerId = saved?.playerId || makeId();
    const currentProfile = { ...profileStore.load(), name, avatar };
    profileStore.save(currentProfile);
    setProfile(currentProfile);

    const adapter = createRealtimeService(cleanCode, playerId, SERVICE_OPTIONS);
    let existing = null;
    try {
      existing = await adapter.firstValue(6500);
    } catch {
      existing = null;
    }

    if (!existing) {
      if (!allowCreate) {
        adapter.close();
        setError('Dermaga privat tidak ditemukan. Pastikan kode 6 karakter benar.');
        setBusy('');
        return;
      }
      const initialRoom = createFishingRoom({
        code: cleanCode,
        hostId: playerId,
        name,
        avatar,
        isPublic,
        profile: currentProfile,
        now: serverNow(),
      });
      try {
        await adapter.create(initialRoom);
        existing = initialRoom;
      } catch (problem) {
        adapter.close();
        const friendly = friendlyRealtimeError(problem, 'fishingRooms');
        setError(friendly?.detail || friendly?.message || 'Gagal membuka dermaga.');
        setBusy('');
        return;
      }
    } else {
      let joinErr = '';
      await adapter.transact(curr => {
        const base = curr || existing;
        const out = applyFishingIntent(
          base,
          { type: 'sit', name, avatar, profile: currentProfile },
          playerId,
          serverNow(),
        );
        if (out.error) {
          joinErr = out.error;
          return undefined;
        }
        existing = out.room;
        return out.room;
      }).catch(() => {});

      if (joinErr) {
        adapter.close();
        setError(joinErr);
        setBusy('');
        return;
      }
    }

    sessionStore.save(cleanCode, playerId);
    setViewerId(playerId);
    attachAdapter(adapter, playerId);
    const normalized = normalizeFishingRoom(existing);
    setRoom(normalized);
    syncLocalProfileFromRoom(normalized, playerId);
    setLocalPhase('idle');

    // Tambahkan bot peramai bila diminta dan kursi masih muat
    const botCount = Math.max(0, Math.min(6, Number(bots) || 0));
    const currentBots = (existing?.seats || []).filter(s => s.bot).length;
    for (let i = currentBots; i < botCount; i += 1) {
      await adapter.transact(curr => {
        const out = applyFishingIntent(curr, { type: 'addbot' }, playerId, serverNow());
        return out.error ? undefined : out.room;
      }).catch(() => {});
    }
    setBusy('');
  }, [attachAdapter, syncLocalProfileFromRoom]);

  // Simulasi Bot Pemancing di Dermaga (dijalankan oleh Host agar hidup)
  useEffect(() => {
    if (!service || !room || !viewerId) return undefined;
    const timer = setInterval(() => {
      const current = roomRef.current;
      if (!current) return;
      const humanSeats = (current.seats || []).filter(s => !s.bot);
      const isDriver = current.hostId === viewerId || humanSeats[0]?.id === viewerId;
      if (!isDriver) return;

      const bots = (current.seats || []).filter(s => s.bot);
      if (bots.length === 0) return;
      const randomBot = bots[Math.floor(Math.random() * bots.length)];
      if (!randomBot) return;

      if (randomBot.state === 'waiting' && Math.random() < 0.35) {
        sendRoomIntent({
          type: 'syncstate',
          targetId: randomBot.id,
          state: 'reeling',
          tension: 45 + Math.floor(Math.random() * 40),
          hookRarity: Math.random() < 0.25 ? 'rare' : 'common',
        });
      } else if (randomBot.state === 'reeling') {
        if (Math.random() < 0.65) {
          const botCatch = rollFishCatch({ castPower: 78, rodId: randomBot.rodId });
          sendRoomIntent({
            type: 'catch',
            targetId: randomBot.id,
            fishId: botCatch.fish.id,
            weightKg: botCatch.weightKg,
            coins: botCatch.coins,
          });
        } else {
          sendRoomIntent({
            type: 'syncstate',
            targetId: randomBot.id,
            state: 'waiting',
            tension: 0,
          });
        }
      } else {
        sendRoomIntent({
          type: 'syncstate',
          targetId: randomBot.id,
          state: 'waiting',
          castDistance: 50 + Math.floor(Math.random() * 40),
        });
      }
    }, 5200);
    return () => clearInterval(timer);
  }, [service, room, viewerId, sendRoomIntent]);

  // =========================================================================
  // GAMEPLAY 5-STATE MACHINE & REQUESTANIMATIONFRAME PHYSICS LOOP
  // =========================================================================

  // Loop animasi Power Bar saat fase CASTING
  useEffect(() => {
    if (localPhase !== 'casting') return undefined;
    let rafId = null;
    let lastTs = performance.now();

    const frame = nowTs => {
      const dt = (nowTs - lastTs) / 1000;
      lastTs = nowTs;
      castingDirRef.current = stepCastingBar(castingDirRef.current, dt);
      setCastPower(castingDirRef.current.power);
      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [localPhase]);

  // Mulai fase REELING (Minigame Tarik-Ulur)
  const beginReelingPhase = useCallback(rolled => {
    clearWaitTimers();
    setBiteWindow(false);
    setNibbleActive(false);
    const me = roomRef.current?.seats?.find(s => s.id === viewerId);
    const activeRodId = me?.rodId || profile.rodId || ROD_CATALOG[0].id;
    const initialPhysics = createReelingState({
      fish: rolled.fish,
      rodId: activeRodId,
    });
    hookedRef.current = rolled;
    reelingRef.current = initialPhysics;
    setHookedCatch(rolled);
    setReelingState(initialPhysics);
    setHoldingReel(false);
    setLocalPhase('reeling');
    playFishingSFX('strike');

    sendRoomIntent({
      type: 'syncstate',
      state: 'reeling',
      tension: Math.round(initialPhysics.tension),
      hookRarity: rolled.rarity,
    });
  }, [clearWaitTimers, profile.rodId, sendRoomIntent, viewerId]);

  // Loop Physics Minigame (requestAnimationFrame) saat fase REELING
  useEffect(() => {
    if (localPhase !== 'reeling') return undefined;
    let rafId = null;
    let lastTs = performance.now();
    let lastSyncTs = performance.now();

    const loop = nowTs => {
      const dt = (nowTs - lastTs) / 1000;
      lastTs = nowTs;
      const me = roomRef.current?.seats?.find(s => s.id === viewerId);
      const rodId = me?.rodId || profile.rodId || ROD_CATALOG[0].id;

      const next = stepReelingPhysics(reelingRef.current, {
        holding: holdingRef.current,
        dtSeconds: dt,
        rodId,
      });
      reelingRef.current = next;
      setReelingState(next);

      if (holdingRef.current) {
        playFishingSFX('reelTick', { tension: next.tension });
      }

      // Sinkronkan tension secara berkala ke room agar lengkungan senar di layar teman ikut menegang
      if (nowTs - lastSyncTs > 900 && next.status === 'playing') {
        lastSyncTs = nowTs;
        sendRoomIntent({
          type: 'syncstate',
          state: 'reeling',
          tension: Math.round(next.tension),
          hookRarity: next.rarity,
        });
      }

      if (next.status === 'caught') {
        const caught = hookedRef.current;
        setHoldingReel(false);
        setLocalPhase('result');
        setResultModal({
          outcome: 'caught',
          ...caught,
        });
        playFishingSFX('catch', { rarity: caught.rarity });
        sendRoomIntent({
          type: 'catch',
          fishId: caught.fish.id,
          weightKg: caught.weightKg,
          coins: caught.coins,
        });
        return;
      }

      if (next.status === 'snapped' || next.status === 'escaped') {
        setHoldingReel(false);
        setLocalPhase('result');
        setResultModal({
          outcome: next.status,
          ...(hookedRef.current || {}),
        });
        playFishingSFX(next.status === 'snapped' ? 'snap' : 'escape');
        sendRoomIntent({
          type: 'syncstate',
          state: 'idle',
          tension: 0,
        });
        return;
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [localPhase, profile.rodId, sendRoomIntent, viewerId]);

  // Jadwalkan Fake Bite (pelampung goyang) lalu Real Strike saat fase WAITING
  const scheduleWaitingSequence = useCallback((powerValue) => {
    clearWaitTimers();
    const me = roomRef.current?.seats?.find(s => s.id === viewerId);
    const activeRodId = me?.rodId || profile.rodId || ROD_CATALOG[0].id;
    const rolled = rollFishCatch({ castPower: powerValue, rodId: activeRodId });
    hookedRef.current = rolled;
    setHookedCatch(rolled);
    setCastFeedback({
      tier: rolled.castTier,
      label: rolled.castLabel,
      distancePct: rolled.distancePct,
    });

    setLocalPhase('waiting');
    setNibbleActive(false);
    setBiteWindow(false);
    playFishingSFX('cast');

    sendRoomIntent({
      type: 'syncstate',
      state: 'waiting',
      castDistance: rolled.distancePct,
      castTier: rolled.castTier,
      tension: 0,
    });

    // Fake bite #1
    const t1 = setTimeout(() => {
      setNibbleActive(true);
      playFishingSFX('nibble');
    }, 1100);
    const t2 = setTimeout(() => {
      setNibbleActive(false);
    }, 1650);

    // Real Strike!
    const t3 = setTimeout(() => {
      setNibbleActive(false);
      setBiteWindow(true);
      playFishingSFX('strike');
      // Otomatis masuk ke minigame REELING setelah 450ms atau langsung saat ditekan
      const t4 = setTimeout(() => {
        beginReelingPhase(rolled);
      }, 650);
      waitTimersRef.current.push(t4);
    }, 2400);

    waitTimersRef.current.push(t1, t2, t3);
  }, [beginReelingPhase, clearWaitTimers, profile.rodId, sendRoomIntent, viewerId]);

  // Handler Tombol Utama (PointerDown / TouchStart)
  const handlePrimaryDown = useCallback(event => {
    event?.preventDefault?.();
    if (localPhase === 'idle') {
      castingDirRef.current = { power: 10, dir: 1 };
      setCastPower(10);
      setLocalPhase('casting');
      sendRoomIntent({ type: 'syncstate', state: 'casting' });
      return;
    }

    if (localPhase === 'waiting') {
      if (biteWindow && hookedRef.current) {
        beginReelingPhase(hookedRef.current);
      } else {
        // Tarik terlalu cepat saat fake bite -> ulang ke idle
        clearWaitTimers();
        setNibbleActive(false);
        setBiteWindow(false);
        setLocalPhase('idle');
        sendRoomIntent({ type: 'syncstate', state: 'idle', tension: 0 });
      }
      return;
    }

    if (localPhase === 'reeling') {
      setHoldingReel(true);
      return;
    }

    if (localPhase === 'result') {
      setResultModal(null);
      setLocalPhase('idle');
      sendRoomIntent({ type: 'syncstate', state: 'idle', tension: 0 });
    }
  }, [beginReelingPhase, biteWindow, clearWaitTimers, localPhase, sendRoomIntent]);

  // Handler Tombol Utama (PointerUp / TouchEnd)
  const handlePrimaryUp = useCallback(event => {
    event?.preventDefault?.();
    if (localPhase === 'casting') {
      const finalPower = castingDirRef.current.power;
      const evalCast = evaluateCastAccuracy(finalPower);
      setCastFeedback(evalCast);
      scheduleWaitingSequence(finalPower);
      return;
    }

    if (localPhase === 'reeling') {
      setHoldingReel(false);
    }
  }, [localPhase, scheduleWaitingSequence]);

  const handleCloseResult = useCallback(() => {
    setResultModal(null);
    setLocalPhase('idle');
    sendRoomIntent({ type: 'syncstate', state: 'idle', tension: 0 });
  }, [sendRoomIntent]);

  const handleBuyOrEquipRod = useCallback(async rod => {
    if (!rod) return;
    playFishingSFX('buy');
    await sendRoomIntent({ type: 'buyrod', rodId: rod.id });
  }, [sendRoomIntent]);

  const handleSendEmote = useCallback(emote => {
    if (!emote || !viewerId) return;
    const now = serverNow();
    playFishingSFX('emote');
    setFloatingEmotes(prev => ({
      ...prev,
      [viewerId]: { icon: emote.icon, label: emote.label, ts: now },
    }));
    broadcastRef.current?.send({
      kind: 'emote',
      from: viewerId,
      icon: emote.icon,
      label: emote.label,
      ts: now,
    });
  }, [viewerId]);

  const roomCode = room?.code || '';
  const handleCopyInvite = useCallback(() => {
    if (!roomCode) return;
    const url = `${location.origin}${location.pathname}?game=fishing&room=${roomCode}`;
    navigator.clipboard?.writeText?.(url).catch(() => {});
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2200);
  }, [roomCode]);

  const handleExitDock = useCallback(() => {
    clearWaitTimers();
    sendRoomIntent({ type: 'leave' }).catch(() => {});
    serviceRef.current?.setPresence(false).catch(() => {});
    serviceRef.current?.close();
    sessionStore.clear();
    setService(null);
    setRoom(null);
    setViewerId(null);
    setLocalPhase('idle');
    setResultModal(null);
  }, [clearWaitTimers, sendRoomIntent]);

  useEffect(() => () => clearWaitTimers(), [clearWaitTimers]);

  if (!room) {
    return (
      <FishingHome
        profile={profile}
        onJoinPublic={({ name, avatar, code, bots }) => enterDockRoom({
          code,
          name,
          avatar,
          isPublic: true,
          bots,
          allowCreate: true,
        })}
        onCreatePrivate={({ name, avatar, bots }) => enterDockRoom({
          code: makePrivateCode(),
          name,
          avatar,
          isPublic: false,
          bots,
          allowCreate: true,
        })}
        onJoinPrivate={({ name, avatar, code }) => enterDockRoom({
          code,
          name,
          avatar,
          isPublic: false,
          bots: 0,
          allowCreate: false,
        })}
        onBack={onExitToHub}
        error={error}
        busy={busy}
        initialCode={initialCode}
        mode={realtimeMode()}
      />
    );
  }

  return (
    <FishingStage
      room={room}
      viewerId={viewerId}
      presence={presence}
      localPhase={localPhase}
      castPower={castPower}
      castFeedback={castFeedback}
      nibbleActive={nibbleActive}
      biteWindow={biteWindow}
      reelingState={reelingState}
      hookedCatch={hookedCatch}
      resultModal={resultModal}
      holdingReel={holdingReel}
      liveToast={liveToast}
      floatingEmotes={floatingEmotes}
      drawerTab={drawerTab}
      setDrawerTab={setDrawerTab}
      onPrimaryDown={handlePrimaryDown}
      onPrimaryUp={handlePrimaryUp}
      onCloseResult={handleCloseResult}
      onBuyOrEquipRod={handleBuyOrEquipRod}
      onSendEmote={handleSendEmote}
      onAddBot={() => sendRoomIntent({ type: 'addbot' })}
      onRemoveBot={() => sendRoomIntent({ type: 'removebot' })}
      onCopyInvite={handleCopyInvite}
      copiedInvite={copiedInvite}
      onExitDock={handleExitDock}
    />
  );
}
