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
 * Panel reaksi suara siap pakai ("Mantap!", "Waduh!", "Hahaha", "Mati Sampah!").
 *
 * Satu tekan → semua pemain mendengar. Bukan rekaman pemain: aset tetap,
 * risiko moderasi nol.
 *
 * Menumpang dua jalur yang SUDAH ADA, tidak membangun yang baru:
 *   - event dikirim lewat node `taunts` (rules tidak berubah)
 *   - audio diputar lewat `pttBus` (musik otomatis mengecil)
 *
 * Panel ini TERBUKA/TERTUTUP dari luar (lewat tombol mic), jadi menerima
 * `open` + `onClose`. Dulu ia deretan tombol horizontal yang selalu tampil dan
 * meluber keluar layar di HP; sekarang ia bubble vertikal yang menempel di
 * atas tombol mic.
 *
 * @param {object} props
 * @param {string|null} props.roomCode
 * @param {string|null} props.viewerId
 * @param {boolean} [props.disabled] - sembunyikan bila pemain hanya menonton.
 * @param {boolean} [props.open] - panel sedang terbuka.
 * @param {() => void} [props.onClose] - dipanggil setelah satu reaksi terkirim.
 * @param {boolean} [props.inline] - true bila dirender di dalam wadah tombol
 *   (bukan fixed), mis. di dalam dock meja main.
 * @param {(available: boolean|null) => void} [props.onAvailabilityChange] -
 *   memberi tahu induk apakah panel benar-benar bisa ditampilkan. Dipakai
 *   tombol mic: kalau tidak ada klip sama sekali, ketukan tidak boleh
 *   "ditelan" tanpa hasil apa pun.
 */
export default function VoiceReactionBar({
  roomCode,
  viewerId,
  disabled = false,
  open = true,
  onClose,
  inline = false,
  onAvailabilityChange,
}) {
  const [lastSentAt, setLastSentAt] = useState(0);
  const [now, setNow] = useState(() => serverNow());
  const [notice, setNotice] = useState('');
  // null = belum diketahui (preload belum jalan). false = klip tidak tersedia
  // di server, jadi panel disembunyikan daripada menampilkan tombol yang diam.
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
      // bukan tanda aset hilang. Panel harus tetap tampil karena klip masih
      // bisa diunduh & diputar saat tombol ditekan.
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

  // Beri tahu induk begitu status ketersediaan diketahui, supaya tombol mic
  // tidak menelan ketukan ketika panelnya tidak akan muncul sama sekali.
  useEffect(() => {
    if (typeof onAvailabilityChange === 'function') onAvailabilityChange(available);
  }, [available, onAvailabilityChange]);

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
    // tanpa menunggu round-trip jaringan.
    playVoiceClip(reaction.file);
    // Tutup panel setelah terkirim supaya pemain langsung kembali ke meja.
    if (typeof onClose === 'function') onClose();
  }, [disabled, onClose, roomCode, viewerId]);

  if (disabled) return null;
  // Belum ada klip audio di public/voices → jangan tampilkan tombol yang diam.
  if (available === false) return null;
  if (!open) return null;

  return (
    <div
      className={`voice-bar ${inline ? 'voice-bar--inline' : 'voice-bar--bubble'}`}
      role="group"
      aria-label="Reaksi suara"
    >
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
