import React, { useCallback, useEffect, useRef, useState } from 'react';
import { openEphemeralChannel } from '../services/ephemeralChannel.js';
import { serverNow } from '../services/realtimeService.js';
import { vibrate } from '../utils/haptics.js';
import {
  VOICE_COOLDOWN_MS,
  VOICE_REACTIONS,
  cooldownLeft,
  findVoiceReaction,
  isVoiceEvent,
  makeVoiceEvent,
} from '../utils/voiceReactions.js';
import { preloadVoiceReactions, playVoiceClip } from '../utils/voicePlayer.js';
import { isDataSaverActive } from '../utils/dataSaver.js';

const CHANNEL_NAME = 'remi-taunts';

/**
 * Bar reaksi suara siap pakai ("Mantap!", "Waduh!", "Hahaha", "Mati Sampah!").
 *
 * Satu tekan → semua pemain mendengar. Bukan rekaman pemain: aset tetap,
 * risiko moderasi nol.
 *
 * Menumpang dua jalur yang SUDAH ADA, tidak membangun yang baru:
 *   - event dikirim lewat node `taunts` (rules tidak berubah)
 *   - audio diputar lewat `pttBus` (musik otomatis mengecil)
 *
 * @param {object} props
 * @param {string|null} props.roomCode
 * @param {string|null} props.viewerId
 * @param {boolean} [props.disabled] - sembunyikan bila pemain hanya menonton.
 * @param {boolean} [props.compact]
 */
export default function VoiceReactionBar({ roomCode, viewerId, disabled = false, compact = false }) {
  const [lastSentAt, setLastSentAt] = useState(0);
  const [now, setNow] = useState(() => serverNow());
  const [notice, setNotice] = useState('');
  // null = belum diketahui (preload belum jalan). false = klip tidak tersedia
  // di server, jadi bar disembunyikan daripada menampilkan tombol yang diam.
  const [available, setAvailable] = useState(null);
  const channelRef = useRef(null);
  const lastSentRef = useRef(0);

  // --- Dengarkan reaksi pemain lain ------------------------------------
  useEffect(() => {
    if (!roomCode) return undefined;

    const channel = openEphemeralChannel({
      roomCode,
      nodeName: 'taunts',
      channelName: CHANNEL_NAME,
      selfClientId: viewerId,
      // Hanya reaksi yang benar-benar baru; event ejekan lama tidak boleh
      // diputar ulang saat reconnect.
      staleMs: 4000,
      retainMs: 20000,
      limit: 10,
      onEvent: payload => {
        if (!isVoiceEvent(payload)) return;
        if (payload.from === viewerId) return; // jangan putar milik sendiri
        const reaction = findVoiceReaction(payload.reactionId);
        if (!reaction) return;
        playVoiceClip(reaction.file);
      },
    });

    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      channel.close();
    };
  }, [roomCode, viewerId]);

  // --- Preload saat idle (dilewati di mode hemat data) ------------------
  useEffect(() => {
    if (disabled) return undefined;
    let cancelled = false;
    const start = () => {
      if (cancelled) return;
      // Mode hemat data: preload sengaja DILEWATI, jadi hasilnya 0 klip — itu
      // bukan tanda aset hilang. Bar harus tetap tampil karena klip masih bisa
      // diunduh & diputar saat tombol ditekan (syarat acceptance Task 5).
      if (isDataSaverActive()) return;
      preloadVoiceReactions(VOICE_REACTIONS).then(count => {
        // Berkas belum tersedia di public/voices → jangan render tombol yang
        // tidak akan berbunyi. Fitur hidup otomatis begitu aset ditambahkan.
        if (!cancelled) setAvailable(count > 0);
      });
    };
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(start, { timeout: 3000 });
    } else {
      setTimeout(start, 1200);
    }
    return () => { cancelled = true; };
  }, [disabled]);

  // --- Jam untuk cooldown ----------------------------------------------
  const left = cooldownLeft(lastSentAt, now);
  useEffect(() => {
    if (!lastSentAt) return undefined;
    const timer = setInterval(() => setNow(serverNow()), 200);
    return () => clearInterval(timer);
  }, [lastSentAt]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), 2200);
    return () => clearTimeout(timer);
  }, [notice]);

  const send = useCallback(async reaction => {
    if (disabled || !roomCode || !viewerId) return;
    const current = serverNow();
    // Rate limit 1 per 3 detik.
    if (cooldownLeft(lastSentRef.current, current, VOICE_COOLDOWN_MS) > 0) {
      setNotice('Sabar, tunggu sebentar.');
      return;
    }

    const event = makeVoiceEvent({ id: reaction.id, from: viewerId, ts: current });
    if (!event) return;

    const sent = channelRef.current?.send(event);
    if (sent === false) {
      setNotice('Gagal mengirim. Periksa koneksi.');
      return;
    }

    lastSentRef.current = current;
    setLastSentAt(current);
    setNow(current);
    vibrate(12);
    // Pemain yang menekan juga mendengar klipnya sendiri — umpan balik instan
    // tanpa menunggu round-trip jaringan. Berbeda dengan PTT, di sini tidak
    // membingungkan karena ini aset tetap, bukan suara sendiri.
    playVoiceClip(reaction.file);
  }, [disabled, roomCode, viewerId]);

  if (disabled) return null;
  // Belum ada klip audio di public/voices → jangan tampilkan tombol yang diam.
  if (available === false) return null;

  return (
    <div className={`voice-bar ${compact ? 'voice-bar--compact' : ''}`} role="group" aria-label="Reaksi suara">
      {VOICE_REACTIONS.map(reaction => (
        <button
          key={reaction.id}
          type="button"
          className="voice-bar__btn"
          onClick={() => send(reaction)}
          disabled={left > 0}
          aria-label={`Putar reaksi suara: ${reaction.text}`}
          title={left > 0 ? `Tunggu ${Math.ceil(left / 1000)} detik` : reaction.text}
        >
          {reaction.label}
        </button>
      ))}
      {notice && <span className="voice-bar__notice" role="status">{notice}</span>}
    </div>
  );
}
