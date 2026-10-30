import React, { useEffect, useMemo, useRef, useState } from 'react';
import { pointsFor } from '../engine/gameRules.js';
import { resetScoresPatch } from '../engine/roomEngine.js';
import { AvatarArt } from './SvgPrimitives.jsx';
import Standings from './Standings.jsx';
import useDialogA11y from '../hooks/useDialogA11y.js';
import '../styles/tongkronganFX.css';

// Logika reset turnamen kini tinggal di engine (dipakai intent
// 'reset-tournament'); re-export supaya pemakai lama tidak berubah.
export { resetScoresPatch };

const MEDALS = ['🥇', '🥈', '🥉'];
const isJokerCard = card => card?.kind === 'joker' || card?.value === 'JOKER';

const prefersReducedMotion = () => {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

function Confetti({ active }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!active) return undefined;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || prefersReducedMotion()) return undefined;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0;
    let h = 0;
    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const colors = ['#F5A623', '#2ECC71', '#E53935', '#FFD979', '#FFFFFF'];
    const parts = [];
    let spawnLeft = 150;
    let elapsed = 0;
    let last = performance.now();
    let raf = 0;

    const tick = now => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      elapsed += dt;
      if (elapsed < 1.2) {
        const burst = Math.ceil((150 * dt) / 1.2);
        for (let i = 0; i < burst && spawnLeft > 0; i += 1, spawnLeft -= 1) {
          parts.push({
            x: Math.random() * w,
            y: -16 - Math.random() * 50,
            vx: (Math.random() - 0.5) * 60,
            vy: 70 + Math.random() * 130,
            w: 5 + Math.random() * 6,
            h: 8 + Math.random() * 8,
            rot: Math.random() * Math.PI,
            vr: (Math.random() - 0.5) * 7,
            sway: Math.random() * Math.PI * 2,
            color: colors[(Math.random() * colors.length) | 0],
          });
        }
      }
      context.clearRect(0, 0, w, h);
      let alive = false;
      for (const part of parts) {
        part.vy = Math.min(260, part.vy + 140 * dt);
        part.x += part.vx * dt + Math.sin(elapsed * 3 + part.sway) * 20 * dt;
        part.y += part.vy * dt;
        part.rot += part.vr * dt;
        if (part.y < h + 24) alive = true;
        context.save();
        context.translate(part.x, part.y);
        context.rotate(part.rot);
        context.globalAlpha = 0.92;
        context.fillStyle = part.color;
        context.fillRect(-part.w / 2, -part.h / 2, part.w, part.h);
        context.restore();
      }
      if (alive || spawnLeft > 0) raf = requestAnimationFrame(tick);
      else context.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [active]);

  return <canvas ref={canvasRef} className="tkfx-champ__confetti" aria-hidden="true" />;
}

function PodiumColumn({ place, seat }) {
  return (
    <div className={`tkfx-podium__col${place === 1 ? ' tkfx-podium__col--1' : ''}`}>
      <span className="tkfx-podium__medal" aria-hidden="true">{MEDALS[place - 1]}</span>
      <span className="tkfx-podium__avatar">
        <AvatarArt avatar={seat.avatar} name={seat.name} size={place === 1 ? 54 : 42} />
      </span>
      <span className="tkfx-podium__name" title={seat.name}>{seat.name}</span>
      <div className={`tkfx-podium__step tkfx-podium__step--${place}`}>
        <span className="tkfx-podium__score">{seat.score ?? 0}</span>
        <span className="tkfx-podium__place">Juara {place}</span>
      </div>
    </div>
  );
}

/**
 * GrandChampionModal - layar puncak turnamen. Muncul otomatis saat ada kursi
 * yang mencapai targetScore pada status round-end. Skor dibaca dari
 * room.seats (kumulatif antar ronde), statistik award dari counter kursi.
 */
export default function GrandChampionModal({
  room = null,
  targetScore = 300,
  viewerId = null,
  isHost = false,
  onResetScores = null,
}) {
  const seats = room?.seats || [];
  const [dismissedRound, setDismissedRound] = useState(null);
  const [confirming, setConfirming] = useState(false);
  // targetScore 0 = Tanpa Batas: tanpa guard ini modal terbuka tiap ronde
  // karena skor >= 0 selalu benar.
  const open = Boolean(room) && targetScore > 0 && room.status === 'round-end'
    && seats.some(seat => (seat.score ?? 0) >= targetScore)
    && dismissedRound !== room.round;

  const panelRef = useDialogA11y(open, () => {
    setDismissedRound(room?.round ?? null);
    setConfirming(false);
  });

  useEffect(() => {
    if (!confirming) return undefined;
    const timer = setTimeout(() => setConfirming(false), 3500);
    return () => clearTimeout(timer);
  }, [confirming]);

  const ranked = useMemo(
    () => [...seats].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
    [seats],
  );

  const awards = useMemo(() => {
    if (ranked.length === 0) return [];
    const list = [];
    const king = ranked[0];
    list.push({
      id: 'raja',
      emoji: '👑',
      title: 'Raja Tongkrongan',
      why: 'Skor tertinggi meja',
      who: king.name,
    });
    const clown = ranked[ranked.length - 1];
    if (ranked.length >= 2 && clown.id !== king.id) {
      list.push({
        id: 'bandar',
        emoji: '🤡',
        title: 'Bandar Sedekah / Tukang Kocok Abadi',
        why: 'Paling bontot, siap jadi pengocok berikutnya',
        who: clown.name,
      });
    }
    const victim = [...seats].sort((a, b) => (b.discardedJokers ?? 0) - (a.discardedJokers ?? 0))[0];
    if (victim && (victim.discardedJokers ?? 0) > 0) {
      list.push({
        id: 'joker',
        emoji: '🃏',
        title: 'Korban Joker',
        why: `${victim.discardedJokers} Joker kena buang sepanjang turnamen`,
        who: victim.name,
      });
    }
    const meldPoints = new Map();
    for (const player of room?.game?.players || []) {
      const total = (player.melds || []).flat()
        .reduce((sum, card) => sum + (isJokerCard(card) ? 5 : pointsFor(card)), 0);
      meldPoints.set(player.id, total);
    }
    const source = meldPoints.size
      ? seats.map(seat => ({ seat, points: meldPoints.get(seat.id) ?? 0 }))
      : (room?.lastScores || []).map(row => ({
        seat: seats.find(seat => seat.id === row.playerId),
        points: row.positive ?? 0,
      })).filter(item => item.seat);
    const mandor = [...source].sort((a, b) => b.points - a.points)[0];
    if (mandor?.seat && mandor.points > 0) {
      list.push({
        id: 'mandor',
        emoji: '⛏️',
        title: 'Mandor Gali',
        why: `${mandor.points} poin kombinasi meja`,
        who: mandor.seat.name,
      });
    }
    return list;
  }, [ranked, seats, room]);

  if (!open) return null;

  const champion = ranked[0];
  const podium = [
    { place: 2, seat: ranked[1] },
    { place: 1, seat: ranked[0] },
    { place: 3, seat: ranked[2] },
  ].filter(item => item.seat);

  return (
    <div className="tkfx-champ" role="dialog" aria-modal="true" aria-label="Piala juara turnamen">
      <div className="tkfx-champ__backdrop" />
      <Confetti active={open} />
      <div className="tkfx-champ__card" ref={panelRef}>
        <span className="tkfx-champ__kicker">🏆 Turnamen {targetScore} Poin Berakhir</span>
        <h2 className="tkfx-champ__title">{champion.name}</h2>
        <p className="tkfx-champ__subtitle">
          mencapai {champion.score ?? 0} poin dalam {room.round} ronde
        </p>

        <div className="tkfx-podium">
          {podium.map(item => <PodiumColumn key={item.seat.id} place={item.place} seat={item.seat} />)}
        </div>

        <ul className="tkfx-awards">
          {awards.map(award => (
            <li key={award.id} className="tkfx-awards__row">
              <span className="tkfx-awards__emoji" aria-hidden="true">{award.emoji}</span>
              <span className="tkfx-awards__label">
                <span className="tkfx-awards__title">{award.title}</span>
                <span className="tkfx-awards__why">{award.why}</span>
              </span>
              <b className="tkfx-awards__who" title={award.who}>{award.who}</b>
            </li>
          ))}
        </ul>

        <p className="tkfx-champ__standing-title">Peringkat akhir meja</p>
        <Standings seats={seats} viewerId={viewerId} hostId={room.hostId} compact />

        <div className="tkfx-champ__actions">
          {isHost && typeof onResetScores === 'function' && (
            <button
              type="button"
              className="tkfx-btn tkfx-btn--primary"
              onClick={() => {
                if (!confirming) {
                  setConfirming(true);
                  return;
                }
                setConfirming(false);
                onResetScores();
              }}
            >
              {confirming ? 'Yakin? Semua skor kembali nol!' : 'Mulai Turnamen Baru (Reset Skor)'}
            </button>
          )}
          {!isHost && <p className="tkfx-champ__note">Menunggu Host memulai turnamen baru...</p>}
          <button
            type="button"
            className="tkfx-btn tkfx-btn--ghost"
            onClick={() => { setDismissedRound(room.round); setConfirming(false); }}
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
