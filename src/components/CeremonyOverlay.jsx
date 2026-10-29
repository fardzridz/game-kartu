import React, { useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CardSVG from './CardSVG.jsx';
import { Icon } from './SvgPrimitives.jsx';
import { play } from '../sound/soundFX.js';

export const COUNTDOWN_MS = 2400;
export const SHUFFLE_MS = 1100;
export const DEAL_STEP_MS = 90;

// Upacara pembuka ronde (spec §2): hitung mundur 3-2-1-MULAI, kocok kartu,
// lalu bagi enam kartu per pemain satu per satu secara melingkar mulai dari
// kursi Pengocok. Semua klien menghitung dari dealStartedAt yang sama.
export default function CeremonyOverlay({ dealStartedAt, dealingUntil, seatCount, seatPositions, shufflerName, round, now }) {
  const t = now - dealStartedAt;
  const dealStart = COUNTDOWN_MS + SHUFFLE_MS;
  const cardsTotal = seatCount * 6;
  const dealEnd = dealingUntil - 400;

  const countdownLabel = t < 800 ? '3' : t < 1600 ? '2' : t < COUNTDOWN_MS ? '1' : t < dealStart ? 'MULAI!' : null;
  const lastLabel = useRef(null);

  useEffect(() => {
    if (countdownLabel && countdownLabel !== lastLabel.current) {
      lastLabel.current = countdownLabel;
      if (countdownLabel === 'MULAI!') {
        play('start');
        play('shuffle');
      } else {
        play('countdown');
      }
    }
  }, [countdownLabel]);

  // Bunyi whoosh/snap sekali per kartu yang terbang ke kursi.
  useEffect(() => {
    if (t < dealStart || t >= dealEnd) return undefined;
    const tick = setInterval(() => play('deal'), DEAL_STEP_MS);
    return () => clearInterval(tick);
  }, [t >= dealStart, t >= dealEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  const flyers = useMemo(
    () =>
      Array.from({ length: cardsTotal }, (_, i) => {
        const seat = i % seatCount;
        const roundIndex = Math.floor(i / seatCount);
        const position = seatPositions[seat] || { x: 50, y: 20 };
        return { i, seat, roundIndex, position, delay: (dealStart + i * DEAL_STEP_MS) / 1000 };
      }),
    [cardsTotal, seatCount, seatPositions, dealStart]
  );

  return (
    <div className="ceremony-overlay" aria-live="polite">
      <div className="ceremony-backdrop" />

      <AnimatePresence mode="wait">
        {countdownLabel && (
          <motion.div
            key={countdownLabel}
            className={`ceremony-countdown ${countdownLabel === 'MULAI!' ? 'is-go' : ''}`}
            initial={{ scale: 0.4, opacity: 0, rotate: -6 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 1.6, opacity: 0 }}
            transition={{ type: 'spring', damping: 14, stiffness: 260 }}
          >
            {countdownLabel}
          </motion.div>
        )}
      </AnimatePresence>

      {t >= COUNTDOWN_MS && t < dealEnd + 300 && (
        <div className="ceremony-shuffle">
          <div className="shuffle-stacks">
            <motion.div
              className="shuffle-stack stack-left"
              initial={{ x: -14, rotate: -10 }}
              animate={{ x: [ -14, 4, -14 ], rotate: [ -10, 4, -10 ] }}
              transition={{ duration: 0.34, repeat: Infinity, ease: 'easeInOut' }}
            >
              <CardSVG back />
              <CardSVG back />
              <CardSVG back />
            </motion.div>
            <motion.div
              className="shuffle-stack stack-right"
              initial={{ x: 14, rotate: 10 }}
              animate={{ x: [ 14, -4, 14 ], rotate: [ 10, -4, 10 ] }}
              transition={{ duration: 0.34, repeat: Infinity, ease: 'easeInOut', delay: 0.08 }}
            >
              <CardSVG back />
              <CardSVG back />
              <CardSVG back />
            </motion.div>
          </div>
        </div>
      )}

      {t >= dealStart && t < dealingUntil && (
        <div className="ceremony-flyers">
          {flyers.map(flyer => (
            <motion.div
              key={flyer.i}
              className="ceremony-flyer"
              initial={{ left: '50%', top: '50%', x: '-50%', y: '-50%', scale: 0.7, opacity: 0 }}
              animate={{
                left: `${flyer.position.x}%`,
                top: `${flyer.position.y}%`,
                x: '-50%',
                y: '-50%',
                scale: 0.42,
                opacity: [0, 1, 1, 0],
              }}
              transition={{ delay: flyer.delay, duration: 0.5, ease: 'easeOut', opacity: { delay: flyer.delay, duration: 0.5, times: [0, 0.15, 0.85, 1] } }}
            >
              <CardSVG back />
            </motion.div>
          ))}
        </div>
      )}

      <div className="ceremony-caption">
        <span className="caption-round">Ronde {round}</span>
        <strong className="inline-flex items-center gap-1.5">
          <span className="text-goldAccent" aria-hidden="true"><Icon.Crown size={14} /></span>
          {shufflerName} adalah Pengocok
        </strong>
        {t >= dealStart && t < dealingUntil && <small>membagikan 6 kartu satu per satu…</small>}
        {t >= dealingUntil - 400 && t < dealingUntil && <small>semua kartu terbagi!</small>}
      </div>
    </div>
  );
}
