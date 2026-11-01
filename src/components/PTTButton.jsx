import React, { useCallback, useRef, useState } from 'react';
import { Icon } from './SvgPrimitives.jsx';

/**
 * Tombol tahan-untuk-bicara.
 *
 * Gestur:
 *   - tahan            → mulai merekam
 *   - geser ke ATAS    → batal kirim (indikator berubah merah)
 *   - lepas            → kirim (atau batal bila sedang digeser ke atas)
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
}) {
  const [sliding, setSliding] = useState(false);
  const originRef = useRef({ y: 0 });
  const pointerIdRef = useRef(null);

  // Ambang geser ke atas untuk membatalkan: 56 px cukup jauh agar tidak
  // terpicu getaran jari biasa, tapi masih mudah dijangkau ibu jari.
  const CANCEL_DISTANCE = 56;

  const begin = useCallback(event => {
    if (recording) return;
    event.preventDefault();
    originRef.current = { y: event.clientY ?? event.touches?.[0]?.clientY ?? 0 };
    pointerIdRef.current = event.pointerId ?? null;
    setSliding(false);
    try {
      // Pointer capture membuat pointermove/up tetap sampai ke tombol walau
      // jari bergeser keluar area tombol.
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch { /* tidak didukung */ }
    onStart?.(event);
  }, [onStart, recording]);

  const move = useCallback(event => {
    if (!recording) return;
    const y = event.clientY ?? event.touches?.[0]?.clientY ?? originRef.current.y;
    const moved = originRef.current.y - y;
    setSliding(moved > CANCEL_DISTANCE);
  }, [recording]);

  const end = useCallback((event, { cancelled = false } = {}) => {
    if (!recording) return;
    const y = event?.clientY ?? event?.changedTouches?.[0]?.clientY ?? originRef.current.y;
    const movedUp = originRef.current.y - y > CANCEL_DISTANCE;
    const shouldCancel = cancelled || movedUp || sliding;
    try {
      if (pointerIdRef.current !== null) {
        event?.currentTarget?.releasePointerCapture?.(pointerIdRef.current);
      }
    } catch { /* sudah lepas */ }
    pointerIdRef.current = null;
    setSliding(false);
    onStop?.({ cancel: shouldCancel });
  }, [onStop, recording, sliding]);

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
        className={`ptt__button ${recording ? 'is-recording' : ''} ${sliding ? 'is-cancel' : ''}`}
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={() => { if (recording) setSliding(false); }}
        onPointerCancel={event => end(event, { cancelled: true })}
        onTouchCancel={onTouchCancel}
        onContextMenu={event => event.preventDefault()}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        aria-label={recording ? 'Sedang merekam. Lepas untuk mengirim, geser ke atas untuk batal.' : label}
        aria-pressed={recording}
        title={recording ? 'Lepas untuk kirim · geser ke atas untuk batal' : label}
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
