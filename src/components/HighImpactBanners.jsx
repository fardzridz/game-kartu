import React, { useEffect, useMemo, useRef, useState } from 'react';
import { closerBonusFor } from '../engine/gameRules.js';
import '../styles/tongkronganFX.css';

const isJokerCard = card => card?.kind === 'joker' || card?.value === 'JOKER';

const prefersReducedMotion = () => {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

const shakeScreen = () => {
  if (prefersReducedMotion() || typeof document === 'undefined') return;
  document.body.classList.add('tkfx-shake');
  setTimeout(() => document.body.classList.remove('tkfx-shake'), 520);
};

/**
 * Hook deteksi kursi yang tinggal 1-2 kartu saat ronde berjalan.
 * Dipakai layer banner internal, dan bisa dipakai GameBoard nanti untuk
 * memasang badge langsung di dalam pod.
 */
export function useLowCardPlayers(game, status) {
  return useMemo(() => {
    if (!game?.players || status !== 'playing') return [];
    return game.players
      .map((player, index) => ({ player, index, count: player.hand?.length ?? 0 }))
      .filter(item => item.count > 0 && item.count <= 2);
  }, [game, status]);
}

function seatNameOf(players, seats, playerId) {
  return players.find(player => player.id === playerId)?.name
    || seats.find(seat => seat.id === playerId)?.name
    || 'Pemain';
}

/* Peringatan "sisa 1-2 kartu" TIDAK lagi berupa badge melayang di atas pod —
   badge itu menutupi avatar/nama profil. Sinyal visualnya dipindah ke pill
   nilai milik pod sendiri ("2 kartu" diberi warna + ikon api), sedangkan
   komponen ini hanya menyisakan teks untuk screen reader supaya pemain
   tunanetra tetap diberi tahu. */
function LowCardLayer({ lows, players, seats }) {
  if (!lows.length) return null;
  return (
    <span className="sr-only" role="status">
      {lows.map(item => {
        const level = item.count <= 1 ? 1 : 2;
        const name = seatNameOf(players, seats, item.player.id);
        return `${name}: ${level === 1 ? 'SISA 1 KARTU!' : 'SISA 2 KARTU'}. `;
      }).join('')}
    </span>
  );
}

/* Banner JOKER CLOSER: muncul sekali per kartu penutup Joker saat round-end. */
function JokerCloserBanner({ game, seats, status }) {
  const [show, setShow] = useState(false);
  const shownUidRef = useRef(null);
  const active = status === 'round-end' && isJokerCard(game?.closerCard);
  const jokerUid = active ? game?.closerCard?.uid : null;

  useEffect(() => {
    if (!active || !jokerUid || shownUidRef.current === jokerUid) return undefined;
    shownUidRef.current = jokerUid;
    setShow(true);
    shakeScreen();
    const hide = setTimeout(() => setShow(false), 4400);
    return () => clearTimeout(hide);
  }, [active, jokerUid]);

  if (!show || !active) return null;
  const closerName = seatNameOf(game?.players || [], seats, game?.winnerId);
  const bonus = closerBonusFor(game.closerCard);
  return (
    <div className="tkfx-joker" role="status">
      <span className="tkfx-joker__rays" aria-hidden="true" />
      <span className="tkfx-joker__emoji" aria-hidden="true">🃏</span>
      <strong className="tkfx-joker__title">JOKER CLOSER!</strong>
      <span className="tkfx-joker__sub">{closerName} menutup ronde dengan Joker</span>
      <span className="tkfx-joker__bonus">+{bonus}</span>
    </div>
  );
}

/* Float "Gali Borongan!": buangan menyusut tajam dalam satu aksi gali.
   Pergantian ronde (reset buangan ke 0) tidak dianggap gali. */
function GaliFloatLayer({ game, status }) {
  const [float, setFloat] = useState(null);
  const [pos, setPos] = useState(null);
  const pileLen = game?.discardPile?.length ?? 0;
  const roundId = game?.dealStartedAt ?? 0;
  const prevRef = useRef({ len: pileLen, roundId });

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { len: pileLen, roundId };
    if (status !== 'playing' || roundId !== prev.roundId) return;
    const delta = prev.len - pileLen;
    if (delta > 2) setFloat({ id: `${Date.now()}`, n: delta });
  }, [pileLen, roundId, status]);

  useEffect(() => {
    if (!float) return undefined;
    const timer = setTimeout(() => setFloat(null), 2300);
    const anchor = () => {
      const el = typeof document === 'undefined'
        ? null
        : document.querySelector('.discard-stack-anchor') || document.querySelector('.discard-stack') || document.querySelector('.playfield-center');
      if (!el) {
        // Tanpa elemen buangan (layout berubah / penonton): tampil di atas-tengah.
        setPos({ x: Math.round(window.innerWidth / 2), y: Math.round(window.innerHeight * 0.2) });
        return;
      }
      const rect = el.getBoundingClientRect();
      setPos({ x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top - 10) });
    };
    anchor();
    const interval = setInterval(anchor, 300);
    return () => { clearTimeout(timer); clearInterval(interval); };
  }, [float]);

  if (!float || !pos) return null;
  return (
    <div className="tkfx-gali" role="status" style={{ left: pos.x, top: pos.y }}>
      <span aria-hidden="true">⚡</span>
      Gali Borongan!
      <b>(+{float.n} Kartu)</b>
    </div>
  );
}

/* Helper hover gali: kartu di atas kartu yang di-hover ikut menyala dengan
   badge jumlah kartu terangkut. Overlay murni pembacaan rect, tidak mengubah
   DOM GameBoard sama sekali. */
export function DiscardDigHoverLayer({ game, enabled = true }) {
  const [hover, setHover] = useState(null);
  const gameRef = useRef(game);
  gameRef.current = game;
  const sigRef = useRef('');

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') {
      sigRef.current = '';
      setHover(null);
      return undefined;
    }
    let raf = 0;
    let current = null;

    const clear = () => {
      current = null;
      if (sigRef.current) {
        sigRef.current = '';
        setHover(null);
      }
    };

    const onMove = event => {
      const target = event.target instanceof Element ? event.target : null;
      const slot = target?.closest?.('.discard-fan__card, .discard-stack__slot');
      if (!slot) {
        if (current) clear();
        return;
      }
      const root = slot.closest('.discard-fan, .discard-stack');
      const index = Number(slot.dataset.index);
      if (!root || !Number.isFinite(index)) {
        if (current) clear();
        return;
      }
      if (current && current.root === root && current.index === index) return;
      current = { root, index };
    };

    const loop = () => {
      if (current) {
        if (!current.root.isConnected) {
          clear();
        } else {
          const pileLen = gameRef.current?.discardPile?.length ?? 0;
          const carried = Math.max(0, pileLen - 1 - current.index);
          // Kotak digambar TEPAT seukuran kartu (tanpa padding) supaya ring
          // hijau mengikuti dimensi kartu, bukan kotak yang lebih besar.
          const rects = [...current.root.querySelectorAll('[data-index]')]
            .filter(el => Number(el.dataset.index) > current.index)
            .map(el => el.getBoundingClientRect())
            .filter(rect => rect.width > 0 && rect.height > 0);
          // Hanya gambar bagian yang BELUM tertutup kartu di atasnya:
          // kartu paling kanan (#1) selalu terlihat penuh, kartu lain hanya
          // selebar sisa yang tampak. Hasilnya satu siluet rapi, bukan garis
          // yang saling menyilang di area overlap.
          const boxes = rects.map((rect, i) => {
            const next = rects[i + 1];
            const visibleRight = next ? Math.min(rect.right, next.left) : rect.right;
            const width = Math.max(0, visibleRight - rect.left);
            if (width < 2) return null;
            return {
              x: Math.round(rect.left),
              y: Math.round(rect.top),
              w: Math.round(width),
              h: Math.round(rect.height),
            };
          }).filter(Boolean);
          const rootRect = current.root.getBoundingClientRect();
          const badge = {
            x: Math.round(rootRect.left + rootRect.width / 2),
            y: Math.round(rootRect.top - 8),
            n: carried,
          };
          const sig = `${current.index}:${carried}:${boxes.map(box => `${box.x},${box.y},${box.w},${box.h}`).join(';')}`;
          if (sig !== sigRef.current) {
            sigRef.current = sig;
            setHover({ boxes, badge });
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };

    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerdown', onMove, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerdown', onMove);
      sigRef.current = '';
    };
  }, [enabled]);

  if (!hover) return null;
  return (
    <>
      {hover.boxes.map((box, i) => (
        <span
          key={`${box.x}:${box.y}:${i}`}
          className="tkfx-dig-box"
          style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
          aria-hidden="true"
        />
      ))}
      {hover.badge.n > 0 && (
        <span className="tkfx-dig-badge" style={{ left: hover.badge.x, top: hover.badge.y }} role="status">
          Ikut Terambil <b>(+{hover.badge.n})</b>
        </span>
      )}
    </>
  );
}

/**
 * HighImpactBanners - overlay efek otomatis pembaca `game` & `seats`
 * (read-only): badge sisa 1-2 kartu, banner Joker Closer, float Gali
 * Borongan, dan highlight kartu terangkut saat hover gali.
 *
 * Props: game (room.game), seats (room.seats), status (room.status).
 */
export default function HighImpactBanners({ game = null, seats = [], status = 'playing' }) {
  const lows = useLowCardPlayers(game, status);
  return (
    <div className="tkfx-layer tkfx-layer--banners">
      <LowCardLayer lows={lows} players={game?.players || []} seats={seats} />
      <JokerCloserBanner game={game} seats={seats} status={status} />
      <GaliFloatLayer game={game} status={status} />
      <DiscardDigHoverLayer game={game} enabled={status === 'playing'} />
    </div>
  );
}
