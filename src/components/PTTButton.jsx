import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './SvgPrimitives.jsx';

/**
 * Tombol mic dengan DUA gestur:
 *
 *   - TAP (tekan lalu lepas cepat) → buka/tutup panel reaksi suara
 *   - TAHAN (≥ HOLD_DELAY)         → mulai merekam; lepas = kirim
 *   - geser ke ATAS saat merekam   → batal kirim
 *
 * Kenapa jeda HOLD_DELAY: `pointerdown` terjadi untuk tap maupun tahan, jadi
 * tanpa jeda setiap tap akan memulai perekaman mikrofon — pemain yang cuma
 * ingin mengirim "Mantap!" malah merekam suaranya. Selama jeda itu kita belum
 * meminta izin mikrofon, jadi tap murah dan tidak memicu dialog izin.
 *
 * `touch-action: none` wajib ada di CSS tombol ini: tanpa itu, menahan dan
 * menggeser jari akan menggulir halaman alih-alih merekam.
 *
 * Zona sentuh minimal 44×44 px mengikuti standar project.
 *
 * @param {object} props
 * @param {(event: object) => void} props.onStart
 * @param {(options: {cancel?: boolean}) => void} props.onStop
 * @param {boolean} props.recording
 * @param {number} props.elapsed
 * @param {number} props.maxDurationMs
 * @param {string} [props.label] - teks tombol saat diam.
 * @param {boolean} [props.compact] - versi kecil untuk meja main.
 * @param {string} [props.className]
 * @param {() => void} [props.onTap] - dipanggil saat tap (bukan tahan).
 * @param {boolean} [props.tapActive] - panel reaksi sedang terbuka.
 * @param {number} [props.holdDelayMs] - ambang tap vs tahan.
 */
export default function PTTButton({
  onStart,
  onStop,
  recording = false,
  elapsed = 0,
  maxDurationMs = 15000,
  label = 'Tahan untuk bicara',
  compact = false,
  className = '',
  onTap,
  tapActive = false,
  holdDelayMs = 260,
}) {
  const [sliding, setSliding] = useState(false);
  const originRef = useRef({ y: 0 });
  const pointerIdRef = useRef(null);
  // Timer yang menunda perekaman; dibatalkan bila jari lepas lebih cepat.
  const holdTimerRef = useRef(null);
  // Sudah melewati ambang tahan → lepas berarti kirim, bukan tap.
  const heldRef = useRef(false);

  // Ambang geser ke atas untuk membatalkan: 56 px cukup jauh agar tidak
  // terpicu getaran jari biasa, tapi masih mudah dijangkau ibu jari.
  const CANCEL_DISTANCE = 56;

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  // Bersihkan timer saat unmount supaya tidak ada onStart yang terpanggil
  // setelah komponen hilang (mis. pindah halaman saat jari masih menekan).
  useEffect(() => clearHoldTimer, [clearHoldTimer]);

  const begin = useCallback(event => {
    if (recording) return;
    event.preventDefault();
    originRef.current = { y: event.clientY ?? event.touches?.[0]?.clientY ?? 0 };
    pointerIdRef.current = event.pointerId ?? null;
    setSliding(false);
    heldRef.current = false;
    try {
      // Pointer capture membuat pointermove/up tetap sampai ke tombol walau
      // jari bergeser keluar area tombol.
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch { /* tidak didukung */ }

    // Belum mulai merekam — tunggu dulu apakah ini tap atau tahan.
    clearHoldTimer();
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      heldRef.current = true;
      onStart?.(event);
    }, holdDelayMs);
  }, [clearHoldTimer, holdDelayMs, onStart, recording]);

  const move = useCallback(event => {
    if (!recording) return;
    const y = event.clientY ?? event.touches?.[0]?.clientY ?? originRef.current.y;
    const moved = originRef.current.y - y;
    setSliding(moved > CANCEL_DISTANCE);
  }, [recording]);

  const end = useCallback((event, { cancelled = false } = {}) => {
    const wasHeld = heldRef.current;
    clearHoldTimer();
    try {
      if (pointerIdRef.current !== null) {
        event?.currentTarget?.releasePointerCapture?.(pointerIdRef.current);
      }
    } catch { /* sudah lepas */ }
    pointerIdRef.current = null;

    if (wasHeld || recording) {
      const y = event?.clientY ?? event?.changedTouches?.[0]?.clientY ?? originRef.current.y;
      const movedUp = originRef.current.y - y > CANCEL_DISTANCE;
      const shouldCancel = cancelled || movedUp || sliding;
      heldRef.current = false;
      setSliding(false);
      onStop?.({ cancel: shouldCancel });
      return;
    }

    // Lepas sebelum ambang tahan → ini TAP, bukan rekaman. Jangan panggil
    // onStop karena tidak ada perekaman yang berjalan.
    const endY = event?.clientY ?? event?.changedTouches?.[0]?.clientY ?? originRef.current.y;
    const draggedUp = originRef.current.y - endY > CANCEL_DISTANCE;
    setSliding(false);
    // Geser ke atas sebelum ambang tahan = niat membatalkan, bukan mengetuk.
    // Membuka panel reaksi di sini akan terasa seperti salah pencet.
    if (!cancelled && !draggedUp) onTap?.();
  }, [clearHoldTimer, onStop, onTap, recording, sliding]);

  // touchcancel: jari keluar layar, telepon masuk, gesture sistem. Tanpa ini
  // mikrofon bisa merekam terus (jebakan #3).
  const onTouchCancel = useCallback(event => { end(event, { cancelled: true }); }, [end]);

  // Keyboard: tahan Space/Enter juga berfungsi untuk aksesibilitas desktop.
  const onKeyDown = useCallback(event => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    if (event.repeat) return;
    event.preventDefault();
    begin(event);
  }, [begin]);

  const onKeyUp = useCallback(event => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    end(event);
  }, [end]);

  // Timer berbasis `elapsed` dari hook; tidak perlu interval sendiri.
  const progress = Math.min(1, maxDurationMs > 0 ? elapsed / maxDurationMs : 0);
  const secondsLeft = Math.max(0, Math.ceil((maxDurationMs - elapsed) / 1000));

  return (
    <div className={`ptt ${compact ? 'ptt--compact' : ''} ${className}`}>
      <button
        type="button"
        className={`ptt__button ${recording ? 'is-recording' : ''} ${sliding ? 'is-cancel' : ''} ${tapActive ? 'is-tap-active' : ''}`}
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={() => { if (recording) setSliding(false); }}
        onPointerCancel={event => end(event, { cancelled: true })}
        onTouchCancel={onTouchCancel}
        onContextMenu={event => event.preventDefault()}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        aria-label={
          recording
            ? 'Sedang merekam. Lepas untuk mengirim, geser ke atas untuk batal.'
            : onTap
              ? `${label}. Ketuk untuk reaksi suara.`
              : label
        }
        aria-pressed={recording}
        aria-expanded={onTap ? tapActive : undefined}
        title={
          recording
            ? 'Lepas untuk kirim · geser ke atas untuk batal'
            : onTap
              ? 'Ketuk: reaksi suara · Tahan: bicara'
              : label
        }
      >
        <span className="ptt__icon" aria-hidden="true">
          {sliding ? <Icon.Close size={18} /> : <Icon.Mic size={compact ? 18 : 20} />}
        </span>

        {recording ? (
          <span className="ptt__live">
            {/* Waveform sederhana: bar berdenyut selama merekam. Bukan
                visualisasi amplitudo sungguhan — cukup umpan balik bahwa
                mikrofon hidup, dan tidak memakan CPU. */}
            <span className="ptt__wave" aria-hidden="true">
              {Array.from({ length: 5 }, (_, index) => (
                <span key={index} className="ptt__wave-bar" style={{ animationDelay: `${index * 90}ms` }} />
              ))}
            </span>
            <span className="ptt__timer" aria-hidden="true">{secondsLeft}s</span>
          </span>
        ) : (
          <span className="ptt__label">{compact ? '' : label}</span>
        )}

        {recording && (
          <span
            className="ptt__progress"
            style={{ '--ptt-progress': `${Math.round(progress * 100)}%` }}
            aria-hidden="true"
          />
        )}
      </button>

      {recording && (
        <span className={`ptt__hint ${sliding ? 'is-cancel' : ''}`} role="status">
          {sliding ? 'Lepas untuk batal' : 'Geser ke atas untuk batal'}
        </span>
      )}
    </div>
  );
}
