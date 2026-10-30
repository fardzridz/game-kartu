import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getDatabase, limitToLast, onChildAdded, push, query, ref, remove, set } from 'firebase/database';
import { firebaseActive } from '../services/realtimeService.js';
import { makeId } from '../utils/id.js';
import { TAUNTS, THROWABLES } from '../utils/tauntAssets.js';
import { Icon } from './SvgPrimitives.jsx';
import useDialogA11y from '../hooks/useDialogA11y.js';
import '../styles/tongkronganFX.css';

export { TAUNTS, THROWABLES };

const COOLDOWN_MS = 4000;
const BUBBLE_TTL_MS = 4500;
const IMPACT_TTL_MS = 1200;
const CHANNEL_NAME = 'remi-taunts';
const MUTE_KEY = 'remi-taunt-fx-muted';

// TAUNTS & THROWABLES berasal dari utils/tauntAssets.js (dipakai juga oleh
// preloader glyph). Diekspor ulang agar import lama tetap kompatibel.

const prefersReducedMotion = () => {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// Synthesizer internal. AudioContext dibuat malas (bisa jadi suspend bila
// suara masuk tanpa gesture, itu tidak boleh mengganggu jalannya game).
// ---------------------------------------------------------------------------
let sfxSingleton = null;
const getSfx = () => {
  sfxSingleton = sfxSingleton || createTauntSfx();
  return sfxSingleton;
};

function createTauntSfx() {
  let ctx = null;
  let master = null;
  let muted = (() => {
    try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
  })();

  const ensureCtx = () => {
    if (muted) return null;
    if (typeof window === 'undefined') return null;
    if (!ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      try {
        ctx = new Ctor();
        master = ctx.createGain();
        master.gain.value = 0.5;
        master.connect(ctx.destination);
      } catch {
        return null;
      }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  };

  const noiseBuffer = (seconds) => {
    const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * seconds)), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  };

  const blip = (type, fromFreq, toFreq, duration, peak = 0.6, delay = 0) => {
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(fromFreq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, toFreq), t0 + duration);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  };

  const noise = (duration, filterType, fromFreq, toFreq, peak = 0.5, delay = 0) => {
    const t0 = ctx.currentTime + delay;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(duration);
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(fromFreq, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, toFreq), t0 + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(t0);
    source.stop(t0 + duration + 0.05);
  };

  const play = (name) => {
    if (!ensureCtx()) return;
    try {
      switch (name) {
        // Plak! sendal: tamparan noise pendek + ketukan rendah.
        case 'plak':
          noise(0.09, 'bandpass', 2200, 700, 0.85);
          blip('square', 200, 70, 0.08, 0.5);
          break;
        // Whoosh lemparan: desis narik naik lalu turun.
        case 'whoosh':
          noise(0.34, 'bandpass', 500, 2600, 0.4);
          noise(0.16, 'bandpass', 2600, 400, 0.28, 0.24);
          break;
        // Bom: ledakan low-end + reruntuhan noise.
        case 'boom':
          blip('sine', 160, 38, 0.5, 1);
          noise(0.42, 'lowpass', 900, 120, 0.8, 0.02);
          noise(0.3, 'bandpass', 1800, 500, 0.3, 0.1);
          break;
        // Bel meja "ting-ting": dua denting triangle.
        case 'ting':
          blip('triangle', 2093, 2093, 0.24, 0.34);
          blip('triangle', 2637, 2637, 0.3, 0.3, 0.14);
          break;
        // Splat tomat/kopi: cipratan noise lembab.
        case 'splat':
          noise(0.14, 'lowpass', 1400, 300, 0.7);
          blip('sine', 300, 90, 0.12, 0.35, 0.02);
          break;
        // Womp-womp: dua nada sawtooth turun, trombon sedih.
        case 'womp':
          blip('sawtooth', 233, 220, 0.32, 0.4);
          blip('sawtooth', 196, 155, 0.5, 0.42, 0.34);
          break;
        default:
          break;
      }
    } catch {
      // Suara gagal (mis. context dibekukan browser): biarkan, FX visual tetap jalan.
    }
  };

  return {
    play,
    isMuted: () => muted,
    setMuted(next) {
      muted = next;
      try { localStorage.setItem(MUTE_KEY, next ? '1' : '0'); } catch { /* penyimpanan diblokir */ }
      if (next && ctx) ctx.suspend().catch(() => {});
      if (!next) ensureCtx();
    },
    unlock: ensureCtx,
  };
}

// ---------------------------------------------------------------------------
// Channel sinkronisasi mandiri: Firebase RTDB rooms/{code}/taunts saat main
// online, BroadcastChannel('remi-taunts') untuk mode lokal. Sama sekali tidak
// menyentuh transaksi state room utama.
// ---------------------------------------------------------------------------
function openTauntChannel({ roomCode, selfClientId, onEvent }) {
  if (roomCode && firebaseActive()) {
    const app = getApps().length ? getApp() : initializeApp({
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    });
    const database = getDatabase(app);
    const tauntRef = ref(database, `rooms/${roomCode}/taunts`);
    const bootTs = Date.now();
    const stop = onChildAdded(query(tauntRef, limitToLast(15)), (snapshot) => {
      const value = snapshot.val();
      if (!value || typeof value !== 'object') return;
      // Riwayat lama saat baru join tidak boleh meledak jadi FX ulang.
      if ((value.ts || 0) < bootTs - 2000) return;
      onEvent(value);
    }, () => {});
    return {
      send(event) {
        const node = push(tauntRef);
        set(node, event).catch(() => {});
        // Bersihkan jejak sendiri supaya path taunts tidak menimbun data.
        setTimeout(() => { remove(node).catch(() => {}); }, 20000);
      },
      close: stop,
    };
  }

  if (typeof BroadcastChannel === 'undefined') {
    return { send() {}, close() {} };
  }
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event) => {
    const data = event.data;
    if (!data || data.clientId === selfClientId) return;
    if (data.roomCode !== roomCode) return;
    onEvent(data);
  };
  return {
    send(event) {
      channel.postMessage(event);
      onEvent(event); // BroadcastChannel tidak meng-echo ke pengirim
    },
    close: () => channel.close(),
  };
}

function resolveSeatCenter(players, playerId) {
  const index = players.findIndex(player => player.id === playerId);
  if (index < 0 || typeof document === 'undefined') return null;
  const el = document.querySelector(`[data-seat-index="${index}"]`);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (!rect.width && !rect.height) return null;
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

// Titik jatuh/peluncuran untuk kursi tanpa pod (penonton & pemain sendiri,
// yang "duduknya" di hand dock bawah): pakai bawah-tengah layar.
const fallbackSeatPoint = () => ({
  x: (typeof window === 'undefined' ? 0 : window.innerWidth) / 2,
  y: (typeof window === 'undefined' ? 0 : window.innerHeight) * 0.82,
});

function shakeScreen() {
  if (prefersReducedMotion() || typeof document === 'undefined') return;
  document.body.classList.add('tkfx-shake');
  setTimeout(() => document.body.classList.remove('tkfx-shake'), 520);
}

function TauntBubble({ bubble, offset, players, onDone }) {
  const [pos, setPos] = useState(null);
  const playersRef = useRef(players);

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  useEffect(() => {
    const timer = setTimeout(() => onDone(bubble.id), BUBBLE_TTL_MS);
    return () => clearTimeout(timer);
  }, [bubble.id, onDone]);

  useEffect(() => {
    const place = () => {
      const anchor = resolveSeatCenter(playersRef.current, bubble.fromId) || fallbackSeatPoint();
      setPos(prev => (prev && prev.x === anchor.x && prev.y === anchor.y ? prev : anchor));
    };
    place();
    const interval = setInterval(place, 400);
    return () => clearInterval(interval);
  }, [bubble.fromId]);

  if (!pos) return null;
  return (
    <div
      className="tkfx-bubble"
      style={{ left: pos.x, top: pos.y, '--tkfx-stack': `${offset * 14}px` }}
    >
      <span className="tkfx-bubble__name">{bubble.fromName}</span>
      {bubble.text}
    </div>
  );
}

function Projectile({ shot, players, onDone }) {
  const hostRef = useRef(null);
  const [landed, setLanded] = useState(false);
  // players beridentitas baru tiap update room: dibaca lewat ref agar
  // animasi yang sedang terbang tidak ikut di-restart.
  const playersRef = useRef(players);

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  useEffect(() => {
    const host = hostRef.current;
    const node = host?.firstChild;
    const throwable = THROWABLES.find(item => item.id === shot.throwableId);
    if (!host || !node || !throwable) return undefined;

    const currentPlayers = playersRef.current;
    const from = resolveSeatCenter(currentPlayers, shot.fromId) || fallbackSeatPoint();
    const to = resolveSeatCenter(currentPlayers, shot.toId) || fallbackSeatPoint();
    const sfx = getSfx();
    const reduced = prefersReducedMotion();

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const isSendal = throwable.id === 'sendal';
    const arc = isSendal ? Math.min(90, Math.abs(dx) * 0.18 + 30) : Math.min(170, Math.abs(dx) * 0.3 + 60);
    const spin = isSendal ? 1080 : 360;
    const duration = reduced ? 130 : isSendal ? 620 : 720;
    const at = (x, y, rotate, scale, extraLift = 0) => ({
      transform: `translate(${x}px, ${y - extraLift}px) translate(-50%, -50%) rotate(${rotate}deg) scale(${scale})`,
    });

    sfx.unlock();
    sfx.play('whoosh');
    const animation = node.animate(
      [at(from.x, from.y, 0, 1), at(from.x + dx * 0.5, from.y + dy * 0.5, spin / 2, 1.12, arc), at(to.x, to.y, spin, 1)],
      { duration, easing: 'cubic-bezier(0.3, 0.6, 0.4, 1)', fill: 'forwards' },
    );

    let bounce = null;
    if (isSendal && !reduced) {
      // Sendal memantul sekali kecil setelah kena kursi target.
      bounce = node.animate(
        [
          at(to.x, to.y, spin, 1),
          at(to.x + dx * 0.08, to.y - 26, spin + 140, 0.95),
          at(to.x + dx * 0.12, to.y, spin + 200, 0.9),
        ],
        { duration: 320, delay: duration, easing: 'cubic-bezier(0.3, 0.6, 0.4, 1)', fill: 'forwards' },
      );
    }

    let cancelled = false;
    const cleanup = () => {
      if (cancelled) return;
      sfx.play(throwable.id === 'bom' ? 'boom' : 'splat');
      if (throwable.id === 'tomat') setTimeout(() => sfx.play('womp'), 260);
      if (throwable.id === 'bom') shakeScreen();
      setLanded(true);
      setTimeout(() => onDone(shot.id), IMPACT_TTL_MS);
    };
    Promise.allSettled([animation.finished, bounce ? bounce.finished : Promise.resolve()])
      .then(cleanup)
      .catch(() => {});
    return () => {
      cancelled = true;
      try { animation.cancel(); bounce?.cancel(); } catch { /* sudah selesai */ }
    };
  }, [shot.id, shot.throwableId, shot.fromId, shot.toId, onDone]);

  const throwable = THROWABLES.find(item => item.id === shot.throwableId);
  const to = resolveSeatCenter(players, shot.toId) || fallbackSeatPoint();
  return (
    <span ref={hostRef}>
      {!landed && <span className="tkfx-projectile" aria-hidden="true">{throwable?.emoji}</span>}
      {landed && throwable && <Impact throwableId={throwable.id} point={to} />}
    </span>
  );
}

function Impact({ throwableId, point }) {
  if (throwableId === 'sendal') {
    return (
      <span className="tkfx-impact" style={{ left: point.x, top: point.y }} aria-hidden="true">
        <span className="tkfx-impact__burst" />
        <span className="tkfx-impact__ring" />
        <span className="tkfx-impact__text">PLAK!</span>
      </span>
    );
  }
  if (throwableId === 'kopi') {
    return (
      <span className="tkfx-impact" style={{ left: point.x, top: point.y }} aria-hidden="true">
        <span className="tkfx-impact__splat tkfx-impact__splat--kopi" />
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="tkfx-impact__steam"
            style={{ left: -10 + i * 12, animationDelay: `${i * 0.12}s`, '--steam-x': `${(i - 1) * 10}px` }}
          />
        ))}
      </span>
    );
  }
  if (throwableId === 'bom') {
    return (
      <span className="tkfx-impact" style={{ left: point.x, top: point.y }} aria-hidden="true">
        <span className="tkfx-impact__flash" />
        <span className="tkfx-impact__ring" />
        <span className="tkfx-impact__text tkfx-impact__text--boom">BOOM!</span>
      </span>
    );
  }
  return (
    <span className="tkfx-impact" style={{ left: point.x, top: point.y }} aria-hidden="true">
      <span className="tkfx-impact__splat tkfx-impact__splat--tomat" />
      <span className="tkfx-impact__drip" style={{ left: -22 }} />
      <span className="tkfx-impact__drip" style={{ left: 18, animationDelay: '0.08s' }} />
    </span>
  );
}

/**
 * TauntThrowSystem - ejekan cepat & lemparan barang antar kursi.
 * Mandiri: sinkron lewat rooms/{code}/taunts (Firebase) atau BroadcastChannel
 * lokal, tidak membaca/mengubah state game utama.
 *
 * Props: roomCode (kode meja, null untuk lokal murni), mySeatId (kursi
 * penonton jika null: hanya menerima FX), players (game.players),
 * fabPortalId (id elemen di dock aksi — bila ada, tombol 💬 dirender DI
 * DALAM dock bar alih-alih melayang fixed di atas kipas kartu).
 */
export default function TauntThrowSystem({ roomCode = null, mySeatId = null, players = [], fabPortalId = null }) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [pendingThrow, setPendingThrow] = useState(null);
  const [bubbles, setBubbles] = useState([]);
  const [shots, setShots] = useState([]);
  const [cooling, setCooling] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [fxMuted, setFxMuted] = useState(() => getSfx().isMuted());
  const [clientId] = useState(makeId);

  const seenRef = useRef(new Set());
  const cooldownRef = useRef(0);
  const playersRef = useRef(players);

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  const handleEvent = useCallback((event) => {
    if (!event?.id || seenRef.current.has(event.id)) return;
    seenRef.current.add(event.id);
    if (seenRef.current.size > 80) seenRef.current = new Set([...seenRef.current].slice(-40));
    if (typeof document !== 'undefined' && document.hidden) return;

    if (event.type === 'taunt') {
      const taunt = TAUNTS.find(item => item.id === event.tauntId);
      if (!taunt) return;
      const fromName = event.fromName || playersRef.current.find(p => p.id === event.fromId)?.name || 'Pemain';
      setBubbles(prev => [...prev.slice(-3), { id: event.id, fromId: event.fromId, fromName, text: taunt.text }]);
      getSfx().play('ting');
    } else if (event.type === 'throw') {
      const throwable = THROWABLES.find(item => item.id === event.throwableId);
      if (!throwable || !event.toId) return;
      setShots(prev => [...prev.slice(-2), { id: event.id, throwableId: throwable.id, fromId: event.fromId, toId: event.toId }]);
    }
  }, []);

  const channelRef = useRef(null);
  useEffect(() => {
    const channel = openTauntChannel({
      roomCode,
      selfClientId: clientId,
      onEvent: handleEvent,
    });
    channelRef.current = channel;
    return () => { channel.close(); channelRef.current = null; };
  }, [roomCode, clientId, handleEvent]);

  useEffect(() => {
    if (!cooling) return undefined;
    const interval = setInterval(() => {
      const left = cooldownRef.current - Date.now();
      if (left <= 0) {
        setCooling(false);
        setRemaining(0);
      } else {
        setRemaining(left);
      }
    }, 200);
    return () => clearInterval(interval);
  }, [cooling]);

  const panelRef = useDialogA11y(panelOpen, () => { setPanelOpen(false); setPendingThrow(null); });

  const closeBubble = useCallback(id => {
    setBubbles(prev => prev.filter(item => item.id !== id));
  }, []);
  const closeShot = useCallback(id => {
    setShots(prev => prev.filter(item => item.id !== id));
  }, []);

  const send = useCallback((payload) => {
    if (!mySeatId) return;
    if (Date.now() < cooldownRef.current) return;
    getSfx().unlock();
    cooldownRef.current = Date.now() + COOLDOWN_MS;
    setCooling(true);
    setRemaining(COOLDOWN_MS);
    setPanelOpen(false);
    setPendingThrow(null);
    channelRef.current?.send({
      v: 1,
      id: makeId(),
      clientId,
      roomCode,
      fromId: mySeatId,
      fromName: players.find(player => player.id === mySeatId)?.name || 'Pemain',
      ts: Date.now(),
      ...payload,
    });
  }, [mySeatId, roomCode, players]);

  const targets = useMemo(() => players.filter(player => player.id !== mySeatId), [players, mySeatId]);

  // Slot portal di dock aksi GameBoard. Elemen dock baru ada setelah commit
  // yang sama, jadi dicari di frame berikutnya (bukan setState sinkron di
  // dalam effect) lalu dipantau berkala sampai ketemu.
  const [portalEl, setPortalEl] = useState(null);
  useEffect(() => {
    if (!fabPortalId) return undefined;
    let cancelled = false;
    const attach = () => {
      if (cancelled) return;
      const el = document.getElementById(fabPortalId);
      setPortalEl(prev => (prev === el ? prev : el));
    };
    const raf = requestAnimationFrame(attach);
    const timer = setInterval(attach, 500);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clearInterval(timer);
    };
  }, [fabPortalId]);

  const fabButton = (
    <button
      type="button"
      className={`tkfx-fab tkfx-fab--dock ${cooling ? 'is-cooling' : ''}`}
      style={{ '--tkfx-cd': cooling ? remaining / COOLDOWN_MS : 0 }}
      onClick={() => { getSfx().unlock(); setPanelOpen(open => !open); }}
      aria-expanded={panelOpen}
      aria-label="Bumbu Tongkrongan: ejekan dan lemparan"
    >
      <Icon.Chat size={15} />
      <span className="tkfx-fab__label">Ejek</span>
      {cooling && <span className="tkfx-fab__count">{Math.ceil(remaining / 1000)}</span>}
    </button>
  );

  const panelNode = panelOpen && (
    <div className="tkfx-panel" role="dialog" aria-label="Bumbu Tongkrongan" ref={panelRef}>
      <div className="tkfx-panel__head">
        <span className="tkfx-panel__title">Bumbu Tongkrongan</span>
        <button
          type="button"
          className="tkfx-iconbtn"
          onClick={() => { const next = !fxMuted; getSfx().setMuted(next); setFxMuted(next); }}
          aria-label={fxMuted ? 'Nyalakan suara ejekan' : 'Bisukan suara ejekan'}
          title={fxMuted ? 'Suara mati' : 'Suara nyala'}
        >
          {fxMuted ? '🔇' : '🔊'}
        </button>
        <button
          type="button"
          className="tkfx-iconbtn"
          onClick={() => { setPanelOpen(false); setPendingThrow(null); }}
          aria-label="Tutup panel bumbu"
        >
          ✕
        </button>
      </div>

      {pendingThrow ? (
        <>
          <p className="tkfx-panel__hint">Lempar {pendingThrow.emoji} {pendingThrow.label} ke kursi mana?</p>
          <div className="tkfx-panel__grid">
            {targets.map(player => (
              <button
                key={player.id}
                type="button"
                className="tkfx-chip"
                disabled={cooling}
                onClick={() => send({ type: 'throw', throwableId: pendingThrow.id, toId: player.id })}
              >
                <span className="tkfx-chip__emoji">{pendingThrow.emoji}</span>
                <span className="tkfx-chip__label">{player.name}{player.bot ? ' (Bot)' : ''}</span>
              </button>
            ))}
            {targets.length === 0 && <p className="tkfx-panel__hint">Belum ada kursi lain untuk dilempari.</p>}
          </div>
          <button type="button" className="tkfx-back" onClick={() => setPendingThrow(null)}>
            Kembali pilih barang
          </button>
        </>
      ) : (
        <>
          <p className="tkfx-panel__hint">Balon kata muncul di atas kursi kamu, terkirim ke seluruh meja.</p>
          <div className="tkfx-panel__grid">
            {TAUNTS.map(taunt => (
              <button
                key={taunt.id}
                type="button"
                className="tkfx-chip"
                disabled={cooling}
                onClick={() => send({ type: 'taunt', tauntId: taunt.id })}
              >
                <span className="tkfx-chip__emoji">{taunt.emoji}</span>
                <span className="tkfx-chip__label">{taunt.text}</span>
                {cooling && <span className="tkfx-chip__cd">{Math.ceil(remaining / 1000)}s</span>}
              </button>
            ))}
          </div>
          <div className="tkfx-sep">atau lempar barang</div>
          <div className="tkfx-panel__grid tkfx-panel__grid--throw">
            {THROWABLES.map(throwable => (
              <button
                key={throwable.id}
                type="button"
                className="tkfx-chip"
                disabled={cooling}
                onClick={() => setPendingThrow(throwable)}
              >
                <span className="tkfx-chip__emoji">{throwable.emoji}</span>
                <span className="tkfx-chip__label">{throwable.label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {cooling && <p className="tkfx-panel__hint">Jeda {Math.ceil(remaining / 1000)}s lagi, jangan spam bumbu!</p>}
    </div>
  );

  // Penonton tanpa kursi tetap menerima FX, tapi tidak diberi tombol mati.
  if (!mySeatId) {
    return (
      <>
        <div className="tkfx-layer tkfx-layer--taunt" aria-live="polite">
          {bubbles.map((bubble, index) => (
            <TauntBubble key={bubble.id} bubble={bubble} offset={index} players={players} onDone={closeBubble} />
          ))}
        </div>
        <div className="tkfx-layer tkfx-layer--shots">
          {shots.map(shot => (
            <Projectile key={shot.id} shot={shot} players={players} onDone={closeShot} />
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="tkfx-layer tkfx-layer--taunt" aria-live="polite">
        {bubbles.map((bubble, index) => (
          <TauntBubble key={bubble.id} bubble={bubble} offset={index} players={players} onDone={closeBubble} />
        ))}
      </div>
      <div className="tkfx-layer tkfx-layer--shots">
        {shots.map(shot => (
          <Projectile key={shot.id} shot={shot} players={players} onDone={closeShot} />
        ))}
      </div>

      {portalEl ? (
        <>
          {createPortal(fabButton, portalEl)}
          {/* Panel melayang di atas dock kanan — terpisah dari tombol yang
              kini tinggal di bar aksi. */}
          {panelNode && <div className="tkfx-dock tkfx-dock--panel-only">{panelNode}</div>}
        </>
      ) : fabPortalId ? null : (
        <div className="tkfx-dock">
          {panelNode}
          {fabButton}
        </div>
      )}
    </>
  );
}
