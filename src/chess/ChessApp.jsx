import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ChessHome from './ChessHome.jsx';
import ChessRoomLobby from './ChessRoomLobby.jsx';
import ChessTable from './ChessTable.jsx';
import {
  applyChessIntent,
  createChessRoom,
  normalizeChessRoom,
} from './chessEngine.js';
import { chooseChessBotMove } from './chessBots.js';
import {
  createRealtimeService,
  friendlyRealtimeError,
  realtimeMode,
  serverNow,
} from '../services/realtimeService.js';
import { startMusic, stopMusic, MUSIC_TITLE } from '../sound/music.js';
import { isMusicEnabled, toggleMusic, isMuted, toggleMute } from '../sound/soundFX.js';
import { useFullscreen } from '../hooks/useFullscreen.js';
import { useWakeLock } from '../hooks/useWakeLock.js';
import { Icon } from '../components/SvgPrimitives.jsx';
import ConnectionBadgeGlobal from '../components/ConnectionBadgeGlobal.jsx';
import DataSaverBadge from '../components/DataSaverBadge.jsx';
import { makeId } from '../utils/id.js';
import '../banting/banting.css';
import './chess.css';

const SESSION_KEY = 'chess-session';
const SERVICE_OPTIONS = { root: 'chessRooms', prefix: 'chess' };
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

export default function ChessApp({ onExitToHub }) {
  const [service, setService] = useState(null);
  const [room, setRoom] = useState(null);
  const [viewerId, setViewerId] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [booting, setBooting] = useState(true);
  const [now, setNow] = useState(() => serverNow());
  const [initialCode] = useState(() => {
    if (typeof location === 'undefined') return '';
    const urlRoom = new URLSearchParams(location.search).get('room');
    return urlRoom && /^[A-Z0-9]{6}$/i.test(urlRoom) ? urlRoom.toUpperCase() : '';
  });
  const [musicOn, setMusicOn] = useState(() => isMusicEnabled());
  const [muted, setMutedState] = useState(() => isMuted());
  const { isFullscreen, toggleFullscreen } = useFullscreen();
  const isPlaying = Boolean(room && room.status === 'playing');
  useWakeLock(isPlaying);
  const serviceRef = useRef(null);

  useEffect(() => {
    if (isPlaying && musicOn) startMusic();
    else stopMusic();
    return () => stopMusic();
  }, [isPlaying, musicOn]);

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
      value => setRoom(normalizeChessRoom(value)),
      problem => setError(problem?.detail || 'Koneksi ke server bermasalah.'),
    );
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
    const inSeats = (found.seats || []).some(seat => seat.id === saved.playerId);
    const inSpectators = (found.spectators || []).some(spec => spec.id === saved.playerId);
    if (!inSeats && !inSpectators) {
      adapter.close();
      session.clear();
      return false;
    }
    setViewerId(saved.playerId);
    attach(adapter);
    setRoom(normalizeChessRoom(found));
    return true;
  }, [attach]);

  const bootRef = useRef(false);
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    reconnect()
      .catch(() => {})
      .finally(() => setBooting(false));
  }, [reconnect]);

  const create = useCallback(async payload => {
    setBusy('create');
    setError('');
    const code = makeCode();
    const id = makeId();
    const state = createChessRoom({
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
      const friendly = friendlyRealtimeError(problem, 'chessRooms');
      setError(friendly?.detail || friendly?.message || 'Gagal membuka meja catur.');
      setBusy('');
      return;
    }
    session.save(code, id);
    setViewerId(id);
    attach(adapter);
    setRoom(normalizeChessRoom(state));
    const bots = Math.max(0, Math.min(1, Number(payload.bots) || 0));
    for (let index = 0; index < bots; index += 1) {
      await adapter.transact(current => {
        const out = applyChessIntent(current, { type: 'addBot' }, id, serverNow());
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
      setError('Meja catur tidak ditemukan. Pastikan kode 6 karakter benar dan host masih membuka meja.');
      setBusy('');
      return;
    }
    let failure = '';
    try {
      await adapter.transact(current => {
        const base = current || found;
        const out = applyChessIntent(
          base,
          {
            type: 'sit',
            name: payload.name,
            avatar: payload.avatar,
            asSpectator: Boolean(payload.asSpectator),
          },
          id,
          serverNow(),
        );
        if (out.error) {
          failure = out.error;
          return undefined;
        }
        return out.room;
      });
    } catch (problem) {
      adapter.close();
      const friendly = friendlyRealtimeError(problem, 'chessRooms');
      setError(friendly?.detail || friendly?.message || 'Gagal bergabung ke meja catur.');
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
    setRoom(normalizeChessRoom(found));
    setBusy('');
  }, [attach]);

  const transactAs = useCallback(async (intent, actorId) => {
    const adapter = serviceRef.current;
    if (!adapter || !actorId) return false;
    let failure = '';
    try {
      await adapter.transact(current => {
        if (!current) return undefined;
        const out = applyChessIntent(current, intent, actorId, serverNow());
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

  // Driver Bot AI
  useEffect(() => {
    if (!room || room.status !== 'playing' || !isDriver) return;
    const activeMatches = room.settings.mode === 'cup' && room.cup
      ? (room.cup.rounds.find(r => r.roundNo === room.cup.currentRound)?.matches || []).filter(m => m.status === 'playing')
      : (room.match?.phase === 'play' ? [room.match] : []);

    for (const m of activeMatches) {
      const activeId = m.turn === 'w' ? m.whiteId : m.blackId;
      const activeSeat = room.seats.find(seat => seat.id === activeId);
      if (!activeSeat?.bot) continue;

      const key = `bot:${room.matchNo}:${m.id}:${room.rev}:${activeSeat.id}`;
      scheduleOnce(key, 650, () => {
        const live = liveRoomRef.current;
        if (!live || live.status !== 'playing') return;
        if (live.rev !== room.rev) return;
        const liveMatch = live.settings.mode === 'cup' && live.cup
          ? live.cup.rounds.flatMap(r => r.matches).find(item => item.id === m.id)
          : live.match;
        if (!liveMatch || liveMatch.phase !== 'play') return;
        const move = chooseChessBotMove({ ...live, match: liveMatch });
        if (move) transactAs({ ...move, matchId: liveMatch.id }, activeSeat.id);
      });
    }
  }, [room, isDriver, scheduleOnce, transactAs]);

  // Driver Timeout Giliran / Jam Catur
  useEffect(() => {
    if (!room || room.status !== 'playing' || !isDriver) return;
    const activeMatches = room.settings.mode === 'cup' && room.cup
      ? (room.cup.rounds.find(r => r.roundNo === room.cup.currentRound)?.matches || []).filter(m => m.status === 'playing')
      : (room.match?.phase === 'play' ? [room.match] : []);

    for (const m of activeMatches) {
      const deadline = m.deadline;
      if (!deadline || now < deadline) continue;
      const key = `tick:${room.matchNo}:${m.id}:${room.rev}:${m.turn}`;
      scheduleOnce(key, 350, () => {
        const live = liveRoomRef.current;
        if (!live || live.status !== 'playing') return;
        if (live.rev !== room.rev) return;
        transactAs({ type: 'tick', matchId: m.id }, viewerId);
      });
    }
  }, [room, now, isDriver, scheduleOnce, transactAs, viewerId]);

  const roomCode = room?.code || '';
  const copyInvite = useCallback(async () => {
    if (!roomCode) return;
    const url = `${location.origin}${location.pathname}?game=chess&room=${roomCode}`;
    try {
      await navigator.clipboard.writeText(url);
      setError('Tautan undangan catur disalin. Kirim ke temanmu.');
    } catch {
      setError(`Salin manual: ${url}`);
    }
  }, [roomCode]);

  const exit = useCallback(() => {
    const adapter = serviceRef.current;
    if (adapter && viewerId) {
      adapter.transact(current => {
        if (!current) return undefined;
        const out = applyChessIntent(current, { type: 'stand' }, viewerId, serverNow());
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
    history.replaceState(null, '', location.pathname);
    onExitToHub?.();
  }, [viewerId, onExitToHub]);

  if (booting) {
    return (
      <div className="poker-app">
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a39b8b', fontSize: 13, fontWeight: 700 }}>
          Menyiapkan meja catur…
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="poker-app">
        <ChessHome
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

  const inGame = Boolean(room.match) && room.status !== 'lobby';

  return (
    <div className="poker-app arena-canvas">
      <header className="arena-hud poker-hud">
        <button
          type="button"
          className="hud-pill hud-code-btn"
          onClick={copyInvite}
          title="Ketuk untuk salin link undangan"
        >
          <span className="w-2 h-2 rounded-full bg-emeraldPrimary" aria-hidden="true" />
          <span className="text-xs sm:text-sm font-bold tabular-nums text-white truncate">#{room.code}</span>
        </button>

        <span className="hud-pill banting-hud-pill--sm">
          <span className="text-[11px] text-periwinkleMuted font-semibold">CATUR</span>
          <span className="text-white font-bold">{room.settings.turnSeconds}s</span>
        </span>

        {(room.spectators || []).length > 0 && (
          <span className="hud-pill banting-hud-pill--sm" title="Jumlah penonton di ruangan">
            <Icon.Eye size={13} />
            <span className="text-white font-bold">{(room.spectators || []).length}</span>
          </span>
        )}

        <div className="hud-pill banting-hud-pill--md">
          <ConnectionBadgeGlobal />
        </div>
        <DataSaverBadge className="hidden lg:inline-flex" />

        <span className="poker-hud__spacer" />

        <div className="hud-right flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            className={`icon-btn-sq ${musicOn ? 'is-on' : ''}`}
            onClick={() => setMusicOn(toggleMusic())}
            title={musicOn ? `Matikan musik “${MUSIC_TITLE}”` : `Nyalakan musik “${MUSIC_TITLE}”`}
            aria-label={musicOn ? 'Matikan musik latar' : 'Nyalakan musik latar'}
            aria-pressed={musicOn}
          >
            <Icon.Note size={15} />
          </button>

          <button
            type="button"
            className="icon-btn-sq"
            onClick={() => setMutedState(toggleMute())}
            title={muted ? 'Nyalakan suara' : 'Bisukan suara'}
            aria-label={muted ? 'Nyalakan suara' : 'Bisukan suara'}
            aria-pressed={muted}
          >
            <Icon.Speaker muted={muted} />
          </button>

          <button
            type="button"
            className="icon-btn-sq"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Keluar layar penuh' : 'Masuk layar penuh'}
            aria-label={isFullscreen ? 'Keluar layar penuh' : 'Masuk layar penuh'}
            aria-pressed={isFullscreen}
          >
            <Icon.Fullscreen exit={isFullscreen} />
          </button>

          <button
            type="button"
            className="icon-btn-sq"
            onClick={copyInvite}
            title="Bagikan tautan meja catur"
            aria-label="Bagikan tautan meja catur"
          >
            <Icon.Share size={15} />
          </button>

          <button
            type="button"
            className="btn-keluar"
            onClick={exit}
            aria-label="Keluar meja"
          >
            <Icon.Exit size={14} className="sm:hidden shrink-0" />
            <span className="hidden sm:inline">Keluar</span>
          </button>
        </div>
      </header>

      {error && (
        <div style={{ padding: '0 12px 4px' }}>
          <div className="poker-error">{error}</div>
        </div>
      )}

      {inGame ? (
        <ChessTable
          room={room}
          viewerId={viewerId}
          now={now}
          onIntent={sendIntent}
        />
      ) : (
        <ChessRoomLobby
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
