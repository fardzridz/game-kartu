import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CardSVG from './CardSVG.jsx';
import { Icon } from './SvgPrimitives.jsx';
import { play } from '../sound/soundFX.js';

export const COUNTDOWN_MS = 2400;
export const SHUFFLE_MS = 1100;
export const DEAL_STEP_MS = 90;
const DEAL_FLY_MS = 500;

// Upacara pembuka ronde (spec §2): hitung mundur 3-2-1-MULAI, kocok kartu,
// lalu bagi enam kartu per pemain satu per satu secara melingkar mulai dari
// kursi Pengocok. Semua klien menghitung dari dealStartedAt yang sama.
export default function CeremonyOverlay({ dealStartedAt, dealingUntil, seatCount, seatPositions, shufflerName, round, now }) {
  const t = now - dealStartedAt;
  const dealStart = COUNTDOWN_MS + SHUFFLE_MS;
  const cardsTotal = seatCount * 6;
  const dealEnd = dealingUntil - 400;

  // Ukuran arena diukur sekali saat upacara mount: offset terbang flyer
  // dihitung dalam piksel sehingga animasinya murni transform (compositor),
  // bukan left/top yang memicu layout tiap frame.
  const fieldRef = useRef(null);
  const [fieldSize, setFieldSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      const el = fieldRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setFieldSize({ w: rect.width, h: rect.height });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

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

  // Bunyi whoosh/snap sekali per kartu yang terbang ke kursi. Dengan 8 kursi
  // ada 48 kartu dan interval 90ms — kalau semuanya dibunyikan, hasilnya
  // seperti senapan mesin. Bunyi dipangkas: satu per dua-tiga kartu, makin
  // banyak kursi makin jarang, supaya tetap terasa "dibagikan" tanpa riuh.
  useEffect(() => {
    if (t < dealStart || t >= dealEnd) return undefined;
    const stride = seatCount > 5 ? 3 : seatCount > 3 ? 2 : 1;
    let played = 0;
    const tick = setInterval(() => {
      if (played % stride === 0) play('deal');
      played += 1;
    }, DEAL_STEP_MS);
    return () => clearInterval(tick);
  }, [t >= dealStart, t >= dealEnd, seatCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const flyers = useMemo(
    () =>
      Array.from({ length: cardsTotal }, (_, i) => {
        const seat = i % seatCount;
        const position = seatPositions[seat] || { x: 50, y: 20 };
        // Delay RELATIF terhadap saat flyer di-mount (t >= dealStart) —
        // dealStart TIDAK dihitung lagi, kalau tidak fase bagi kartu
        // akan terlambat 3.5 detik dan tidak pernah selesai sebelum unmount.
        return { i, seat, position, delay: (i * DEAL_STEP_MS) / 1000 };
      }),
    [cardsTotal, seatCount, seatPositions],
  );

  // Goyangan kocok berhenti tepat saat pembagian dimulai: kedua tumpukan
  // menyatu jadi satu tumpukan rapi dan kartu terbang keluar darinya.
  const shuffling = t >= COUNTDOWN_MS && t < dealStart;

  return (
    <div className="ceremony-overlay" aria-live="polite" ref={fieldRef}>
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
              animate={shuffling ? { x: [-14, 4, -14], rotate: [-10, 4, -10] } : { x: 0, rotate: 0 }}
              transition={shuffling
                ? { duration: 0.34, repeat: Infinity, ease: 'easeInOut' }
                : { duration: 0.3, ease: 'easeOut' }}
            >
              <CardSVG back />
              <CardSVG back />
              <CardSVG back />
            </motion.div>
            <motion.div
              className="shuffle-stack stack-right"
              initial={{ x: 14, rotate: 10 }}
              animate={shuffling ? { x: [14, -4, 14], rotate: [10, -4, 10] } : { x: 0, rotate: 0 }}
              transition={shuffling
                ? { duration: 0.34, repeat: Infinity, ease: 'easeInOut', delay: 0.08 }
                : { duration: 0.3, ease: 'easeOut' }}
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
          {flyers.map(flyer => {
            // Posisi duduk flyer dipasang statis via left/top; pergerakan dari
            // tengah arena murni transform x/y (compositor, tanpa layout).
            const dx = ((50 - flyer.position.x) / 100) * fieldSize.w;
            const dy = ((50 - flyer.position.y) / 100) * fieldSize.h;
            return (
              <motion.div
                key={flyer.i}
                className="ceremony-flyer"
                style={{ left: `${flyer.position.x}%`, top: `${flyer.position.y}%`, xPercent: -50, yPercent: -50 }}
                initial={{ x: dx, y: dy, scale: 0.7, opacity: 0 }}
                animate={{ x: 0, y: 0, scale: 0.42, opacity: [0, 1, 1, 0] }}
                transition={{
                  delay: flyer.delay,
                  duration: DEAL_FLY_MS / 1000,
                  ease: 'easeOut',
                  opacity: { delay: flyer.delay, duration: DEAL_FLY_MS / 1000, times: [0, 0.15, 0.85, 1] },
                }}
              >
                <CardSVG back />
              </motion.div>
            );
          })}
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
