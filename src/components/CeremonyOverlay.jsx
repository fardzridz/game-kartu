import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CardSVG from './CardSVG.jsx';
import { Icon } from './SvgPrimitives.jsx';
import { play } from '../sound/soundFX.js';

export const COUNTDOWN_MS = 2400;
export const SHUFFLE_MS = 1100;
export const DEAL_STEP_MS = 90;
const DEAL_FLY_MS = 500;

// Upacara pembuka ronde (spec §2 & F-12): hitung mundur 3-2-1-MULAI,
// ritual kocok kartu manual (F-43) oleh Pengocok dengan tombol Kocok & Mulai Bagi,
// lalu bagi enam kartu per pemain satu per satu secara melingkar.
export default function CeremonyOverlay({
  dealStartedAt,
  dealingUntil,
  seatCount,
  seatPositions,
  shufflerName,
  shufflerId,
  myId,
  round,
  now,
  shuffleState,
  shuffleCount = 0,
  onIntent,
}) {
  const isManual = shuffleState === 'manual';
  const isShuffler = Boolean(myId && shufflerId && myId === shufflerId);
  const t = now - (dealStartedAt || now);
  const dealStart = isManual ? Infinity : COUNTDOWN_MS + SHUFFLE_MS;
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

  const countdownLabel = (!isManual || t < COUNTDOWN_MS)
    ? (t < 800 ? '3' : t < 1600 ? '2' : t < COUNTDOWN_MS ? '1' : t < (isManual ? COUNTDOWN_MS + 600 : dealStart) ? 'MULAI!' : null)
    : null;
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

  // Efek kocok kartu manual: tumpukan kartu berguncang tiap kali dikocok
  const [riffle, setRiffle] = useState(false);
  const prevCountRef = useRef(shuffleCount);
  useEffect(() => {
    if (shuffleCount !== prevCountRef.current) {
      prevCountRef.current = shuffleCount;
      if (shuffleCount > 0) {
        play('shuffle');
        const startTimer = setTimeout(() => setRiffle(true), 0);
        const endTimer = setTimeout(() => setRiffle(false), 550);
        return () => {
          clearTimeout(startTimer);
          clearTimeout(endTimer);
        };
      }
    }
    return undefined;
  }, [shuffleCount]);

  const onIntentRef = useRef(onIntent);
  useEffect(() => {
    onIntentRef.current = onIntent;
  }, [onIntent]);

  const triggerShuffle = useCallback(() => {
    play('shuffle');
    setRiffle(true);
    setTimeout(() => setRiffle(false), 550);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate([25, 35, 25]); } catch {}
    }
    onIntentRef.current?.({ type: 'shuffle' });
  }, []);

  const handleManualShuffle = () => {
    // Di iOS Safari, jika DeviceMotionEvent butuh izin, panggil saat klik pertama
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      try { DeviceMotionEvent.requestPermission().catch(() => {}); } catch {}
    }
    triggerShuffle();
  };

  // Shake detection: goyang HP untuk mengocok kartu (DeviceMotion API)
  useEffect(() => {
    if (!isManual || !isShuffler) return undefined;
    if (typeof window === 'undefined') return undefined;

    let lastX = null;
    let lastY = null;
    let lastZ = null;
    let lastShakeTime = 0;
    const SHAKE_THRESHOLD = 16; // m/s^2 perubahan percepatan
    const DEBOUNCE_MS = 400;

    const onMotion = (event) => {
      const acc = event.acceleration || event.accelerationIncludingGravity;
      if (!acc) return;
      const x = acc.x ?? 0;
      const y = acc.y ?? 0;
      const z = acc.z ?? 0;

      if (lastX !== null) {
        const delta = Math.abs(x - lastX) + Math.abs(y - lastY) + Math.abs(z - lastZ);
        const nowTs = Date.now();
        if (delta > SHAKE_THRESHOLD && nowTs - lastShakeTime > DEBOUNCE_MS) {
          lastShakeTime = nowTs;
          triggerShuffle();
        }
      }

      lastX = x;
      lastY = y;
      lastZ = z;
    };

    window.addEventListener('devicemotion', onMotion);
    return () => {
      window.removeEventListener('devicemotion', onMotion);
    };
  }, [isManual, isShuffler, triggerShuffle]);

  const handleStartDeal = () => {
    play('start');
    onIntent?.({ type: 'deal' });
  };

  // Bunyi whoosh/snap sekali per kartu yang terbang ke kursi.
  const flyerStart = shuffleState === 'dealing' ? 0 : dealStart;
  useEffect(() => {
    if (isManual) return undefined;
    if (t < flyerStart || t >= dealEnd) return undefined;
    const stride = seatCount > 5 ? 3 : seatCount > 3 ? 2 : 1;
    let played = 0;
    const tick = setInterval(() => {
      if (played % stride === 0) play('deal');
      played += 1;
    }, DEAL_STEP_MS);
    return () => clearInterval(tick);
  }, [isManual, flyerStart, t >= dealEnd, seatCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const flyers = useMemo(
    () =>
      Array.from({ length: cardsTotal }, (_, i) => {
        const seat = i % seatCount;
        const position = seatPositions[seat] || { x: 50, y: 20 };
        return { i, seat, position, delay: (i * DEAL_STEP_MS) / 1000 };
      }),
    [cardsTotal, seatCount, seatPositions],
  );

  const shuffling = isManual ? riffle : (t >= COUNTDOWN_MS && t < dealStart);

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

      {(isManual || (t >= COUNTDOWN_MS && t < dealEnd + 300)) && (
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

      {/* Kontrol Kocok & Mulai Bagi Khusus Pengocok saat Fase Manual */}
      {isManual && t >= COUNTDOWN_MS && (
        <div className="ceremony-controls">
          {isShuffler ? (
            <>
              <div className="ceremony-btn-group">
                <button
                  type="button"
                  className="ceremony-btn ceremony-btn--shuffle"
                  onClick={handleManualShuffle}
                  aria-label="Kocok kartu"
                >
                  <span>🔀</span>
                  <span>Kocok Kartu</span>
                  {shuffleCount > 0 && (
                    <span className="ceremony-badge-count">{shuffleCount}x</span>
                  )}
                </button>
                <button
                  type="button"
                  className="ceremony-btn ceremony-btn--deal"
                  onClick={handleStartDeal}
                  aria-label="Mulai bagi kartu"
                >
                  <span>▶</span>
                  <span>Mulai Bagi</span>
                </button>
              </div>
              <div className="ceremony-shake-hint" aria-hidden="true">
                <span>📱</span>
                <span>Goyang HP-mu untuk mengocok!</span>
              </div>
            </>
          ) : (
            <div className="ceremony-waiting-pill">
              <span>{shufflerName} sedang mengocok kartu…</span>
              {shuffleCount > 0 && (
                <span className="ceremony-badge-count">{shuffleCount}x</span>
              )}
            </div>
          )}
        </div>
      )}

      {!isManual && t >= flyerStart && t < dealingUntil && (
        <div className="ceremony-flyers">
          {flyers.map(flyer => {
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
        {isManual && t >= COUNTDOWN_MS && (
          <small>
            {isShuffler
              ? 'Kocok kartu sesukamu, lalu tekan Mulai Bagi'
              : `Menunggu ${shufflerName} membagikan kartu…`}
          </small>
        )}
        {!isManual && t >= flyerStart && t < dealingUntil && <small>membagikan 6 kartu satu per satu…</small>}
        {t >= dealingUntil - 400 && t < dealingUntil && <small>semua kartu terbagi!</small>}
      </div>
    </div>
  );
}
