import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BantingHome from './BantingHome.jsx';
import BantingRoomLobby from './BantingRoomLobby.jsx';
import BantingTable from './BantingTable.jsx';
import {
  applyBantingIntent,
  createBantingRoom,
  normalizeBantingRoom,
} from './bantingEngine.js';
import { botDecision } from './bantingBots.js';
import {
  createRealtimeService,
  friendlyRealtimeError,
  realtimeMode,
  serverNow,
} from '../services/realtimeService.js';
import { makeId } from '../utils/id.js';
import './banting.css';

const SESSION_KEY = 'banting-session';
const SERVICE_OPTIONS = { root: 'bantingRooms', prefix: 'banting' };
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const session = {
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

function makeCode() {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
}

export default function BantingApp({ onExitToHub }) {
  const [service, setService] = useState(null);
  const [room, setRoom] = useState(null);
  const [viewerId, setViewerId] = useState(null);
  const [presence, setPresence] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [booting, setBooting] = useState(true);
  const [now, setNow] = useState(() => serverNow());
  const [initialCode, setInitialCode] = useState('');
  const serviceRef = useRef(null);

  useEffect(() => { serviceRef.current = service; }, [service]);

  useEffect(() => {
    const timer = setInterval(() => setNow(serverNow()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!error) return undefined;
    const timer = setTimeout(() => setError(''), 6000);
    return () => clearTimeout(timer);
  }, [error]);

  const attach = useCallback(adapter => {
    setService(adapter);
    serviceRef.current = adapter;
    adapter.subscribe(
      value => setRoom(normalizeBantingRoom(value)),
      problem => setError(problem?.detail || 'Koneksi ke server bermasalah.'),
    );
    adapter.watchPresence(value => setPresence(value || {}));
    adapter.setPresence(true).catch(() => {});
  }, []);

  useEffect(() => {
    if (!service) return undefined;
    const timer = setInterval(() => { service.setPresence(true).catch(() => {}); }, 15000);
    return () => clearInterval(timer);
  }, [service]);

  const reconnect = useCallback(async () => {
    const saved = session.load();
    if (!saved?.code || !saved?.playerId) return false;
    const adapter = createRealtimeService(saved.code, saved.playerId, SERVICE_OPTIONS);
    let found = null;
    try {
      found = await adapter.firstValue(8000);
    } catch {
      found = null;
    }
    if (!found) {
      adapter.close();
      return false;
    }
    if (!(found.seats || []).some(seat => seat.id === saved.playerId)) {
      adapter.close();
      session.clear();
      return false;
    }
    setViewerId(saved.playerId);
    attach(adapter);
    setRoom(normalizeBantingRoom(found));
    return true;
  }, [attach]);

  const bootRef = useRef(false);
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    const urlRoom = new URLSearchParams(location.search).get('room');
    if (urlRoom && /^[A-Z0-9]{6}$/i.test(urlRoom)) setInitialCode(urlRoom.toUpperCase());
    reconnect()
      .catch(() => {})
      .finally(() => setBooting(false));
  }, [reconnect]);

  const create = useCallback(async payload => {
    setBusy('create');
    setError('');
    const code = makeCode();
    const id = makeId();
    const state = createBantingRoom({
      code,
      hostId: id,
      name: payload.name,
      avatar: payload.avatar,
      settings: payload.settings,
      now: serverNow(),
    });
    const adapter = createRealtimeService(code, id, SERVICE_OPTIONS);
    try {
      await Promise.race([
        adapter.create(state),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Server tidak menjawab saat membuka meja.')), 12000)),
      ]);
    } catch (problem) {
      adapter.close();
      const friendly = friendlyRealtimeError(problem, 'bantingRooms');
      setError(friendly?.detail || friendly?.message || 'Gagal membuka meja.');
      setBusy('');
      return;
    }
    session.save(code, id);
    setViewerId(id);
    attach(adapter);
    setRoom(normalizeBantingRoom(state));
    const bots = Math.max(0, Math.min(7, Number(payload.bots) || 0));
    for (let index = 0; index < bots; index += 1) {
      await adapter.transact(current => {
        const out = applyBantingIntent(current, { type: 'addBot' }, id, serverNow());
        return out.error ? undefined : out.room;
      }).catch(() => {});
    }
    setBusy('');
  }, [attach]);

  const join = useCallback(async payload => {
    setBusy('join');
    setError('');
    const code = String(payload.code || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      setError('Kode meja harus 6 karakter.');
      setBusy('');
      return;
    }
    const id = makeId();
    const adapter = createRealtimeService(code, id, SERVICE_OPTIONS);
    let found = null;
    try {
      found = await adapter.firstValue(9000);
    } catch {
      adapter.close();
      setError('Server tidak bisa dihubungi. Periksa internet lalu coba lagi.');
      setBusy('');
      return;
    }
    if (!found) {
      adapter.close();
      setError('Meja tidak ditemukan. Pastikan kode 6 karakter benar dan host masih membuka meja.');
      setBusy('');
      return;
    }
    let failure = '';
    const takenAvatars = new Set((found.seats || []).map(seat => seat.avatar).filter(Boolean));
    let avatar = payload.avatar;
    if (takenAvatars.has(avatar)) {
      const free = ['finn', 'jake', 'bmo', 'marceline', 'princess-bubblegum', 'ice-king', 'gunter', 'fiona']
        .find(item => !takenAvatars.has(item));
      avatar = free || avatar;
    }
    try {
      await adapter.transact(current => {
        const base = current || found;
        const out = applyBantingIntent(base, { type: 'sit', name: payload.name, avatar }, id, serverNow());
        if (out.error) {
          failure = out.error;
          return undefined;
        }
        return out.room;
      });
    } catch (problem) {
      adapter.close();
      const friendly = friendlyRealtimeError(problem, 'bantingRooms');
      setError(friendly?.detail || friendly?.message || 'Gagal duduk di meja.');
      setBusy('');
      return;
    }
    if (failure) {
      adapter.close();
      setError(failure);
      setBusy('');
      return;
    }
    session.save(code, id);
    setViewerId(id);
    attach(adapter);
    setRoom(normalizeBantingRoom(found));
    setBusy('');
  }, [attach]);

  const transactAs = useCallback(async (intent, actorId) => {
    const adapter = serviceRef.current;
    if (!adapter || !actorId) return false;
    let failure = '';
    try {
      await adapter.transact(current => {
        if (!current) return undefined;
        const out = applyBantingIntent(current, intent, actorId, serverNow());
        if (out.error) {
          failure = out.error;
          return undefined;
        }
        return out.room;
      });
    } catch (problem) {
      failure = problem?.detail || problem?.message || 'Aksi gagal dikirim.';
    }
    if (failure) setError(failure);
    return !failure;
  }, []);

  const sendIntent = useCallback(intent => transactAs(intent, viewerId), [transactAs, viewerId]);

  const isDriver = useMemo(() => {
    if (!room) return false;
    if (room.hostId === viewerId) return true;
    const hostSeat = room.seats.find(seat => seat.id === room.hostId);
    if (!hostSeat) return room.seats.find(seat => !seat.bot)?.id === viewerId;
    return false;
  }, [room, viewerId]);

  // Timer bot/tick disimpan di ref supaya tidak dibatalkan tiap render.
  const timersRef = useRef(new Map());
  const liveRoomRef = useRef(null);
  useEffect(() => { liveRoomRef.current = room; }, [room]);
  useEffect(() => () => {
    timersRef.current.forEach(id => clearTimeout(id));
    timersRef.current.clear();
  }, []);

  const scheduleOnce = useCallback((key, delay, action) => {
    if (timersRef.current.has(key)) return;
    const id = setTimeout(() => {
      timersRef.current.delete(key);
      action();
    }, delay);
    timersRef.current.set(key, id);
  }, []);

  useEffect(() => {
    if (!room || room.status !== 'playing' || !room.hand || !isDriver) return;

    // Fase pembukaan: tiap bot yang masih pegang kartu 3 mengeluarkannya sendiri.
    if (room.hand.phase === 'opening') {
      const shown = new Set((room.hand.opening || []).map(entry => entry.id));
      const pending = (room.hand.players || []).find(player => (
        room.seats[player.seat]?.bot
        && !shown.has(player.id)
        && (player.hand || []).some(card => card.value === '3')
      ));
      if (!pending) return;
      const key = `opening:${room.handNo}:${room.rev}:${pending.id}`;
      scheduleOnce(key, 500 + Math.random() * 500, () => {
        const live = liveRoomRef.current;
        if (!live || live.status !== 'playing' || !live.hand) return;
        if (live.rev !== room.rev || live.hand.phase !== 'opening') return;
        transactAs({ type: 'showThrees' }, pending.id);
      });
      return;
    }

    const seatIndex = room.hand.turnSeat;
    const seat = room.seats[seatIndex];
    if (!seat?.bot) return;
    const key = `bot:${room.handNo}:${room.rev}:${seatIndex}`;
    scheduleOnce(key, 700 + Math.random() * 600, () => {
      const live = liveRoomRef.current;
      if (!live || live.status !== 'playing' || !live.hand) return;
      if (live.rev !== room.rev) return;
      const decision = botDecision(live, seatIndex);
      if (decision) transactAs(decision, seat.id);
    });
  }, [room, isDriver, scheduleOnce, transactAs]);

  useEffect(() => {
    if (!room || room.status !== 'playing' || !room.hand || !isDriver) return;
    const deadline = room.hand.deadline;
    if (!deadline || now < deadline) return;
    const key = `tick:${room.handNo}:${room.rev}:${room.hand.turnSeat}`;
    scheduleOnce(key, 350, () => {
      const live = liveRoomRef.current;
      if (!live || live.status !== 'playing' || !live.hand) return;
      if (live.rev !== room.rev) return;
      transactAs({ type: 'tick' }, viewerId);
    });
  }, [room, now, isDriver, scheduleOnce, transactAs, viewerId]);

  const copyInvite = useCallback(async () => {
    if (!room) return;
    const url = `${location.origin}${location.pathname}?game=banting&room=${room.code}`;
    try {
      await navigator.clipboard.writeText(url);
      setError('Tautan undangan disalin. Kirim ke temanmu.');
    } catch {
      setError(`Salin manual: ${url}`);
    }
  }, [room]);

  const exit = useCallback(() => {
    const adapter = serviceRef.current;
    if (adapter && viewerId) {
      adapter.transact(current => {
        if (!current) return undefined;
        const out = applyBantingIntent(current, { type: 'stand' }, viewerId, serverNow());
        return out.error ? undefined : out.room;
      }).catch(() => {});
    }
    session.clear();
    adapter?.setPresence(false).catch(() => {});
    adapter?.close();
    serviceRef.current = null;
    setService(null);
    setRoom(null);
    setViewerId(null);
    setPresence({});
    history.replaceState(null, '', location.pathname);
    onExitToHub?.();
  }, [viewerId, onExitToHub]);

  if (booting) {
    return (
      <div className="poker-app">
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a39b8b', fontSize: 13, fontWeight: 700 }}>
          Menyiapkan meja banting…
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="poker-app">
        <BantingHome
          onCreate={create}
          onJoin={join}
          onBack={onExitToHub}
          error={error}
          busy={busy}
          initialCode={initialCode}
          mode={realtimeMode()}
        />
      </div>
    );
  }

  const inGame = Boolean(room.hand) && room.status !== 'lobby';

  return (
    <div className="poker-app">
      <header className="poker-hud">
        <button type="button" className="poker-icon-btn" onClick={exit} aria-label="Keluar dari meja">
          <IconExit />
        </button>
        <span className="poker-pill poker-pill--gold">
          <span className="poker-pill__label">MEJA</span> {room.code}
        </span>
        <span className="poker-pill">
          <span className="poker-pill__label">GILIRAN</span> {room.settings.turnSeconds}s
        </span>
        <span className="poker-hud__spacer" />
        <button type="button" className="poker-icon-btn" onClick={copyInvite} aria-label="Bagikan tautan meja">
          <IconShare />
        </button>
        <span className="poker-pill">
          <span className="poker-pill__label">PEMAIN</span> {room.seats.length}
        </span>
      </header>

      {error && (
        <div style={{ padding: '0 12px 4px' }}>
          <div className="poker-error">{error}</div>
        </div>
      )}

      {inGame ? (
        <BantingTable
          room={room}
          viewerId={viewerId}
          now={now}
          onIntent={sendIntent}
          onExit={exit}
          onCopyInvite={copyInvite}
          presence={presence}
        />
      ) : (
        <BantingRoomLobby
          room={room}
          viewerId={viewerId}
          onIntent={sendIntent}
          onExit={exit}
          onCopyInvite={copyInvite}
          error=""
        />
      )}
    </div>
  );
}

function IconExit() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M15 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h9" />
      <path d="M18 8l4 4-4 4M22 12H10" />
    </svg>
  );
}

function IconShare() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="18" cy="5" r="2.6" />
      <circle cx="6" cy="12" r="2.6" />
      <circle cx="18" cy="19" r="2.6" />
      <path d="M8.4 10.7l7.2-4.2M8.4 13.3l7.2 4.2" />
    </svg>
  );
}
