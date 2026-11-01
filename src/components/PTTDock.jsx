import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PTTButton from './PTTButton.jsx';
import PTTIndicator from './PTTIndicator.jsx';
import VoiceReactionBar from './VoiceReactionBar.jsx';
import { Icon } from './SvgPrimitives.jsx';
import { usePTT } from '../hooks/usePTT.js';

/**
 * Mic global: TAHAN untuk bicara, KETUK untuk panel reaksi suara.
 *
 * Di-mount SEKALI di App.jsx (bukan di RoomLobby/GameBoard) supaya MediaRecorder
 * dan listener Firebase tidak ikut mati saat host menekan MULAI dan halaman
 * berganti dari ruang tunggu ke meja main.
 *
 * Tombolnya sendiri dirender lewat React Portal ke slot yang disediakan tiap
 * halaman — pola `fabPortalId` yang sudah dipakai TauntThrowSystem:
 *
 *   - Ruang tunggu: slot `ptt-dock-slot` (kanan bawah, sejajar pill Obrolan)
 *   - Meja main   : slot `ptt-game-slot` (ikut baris dock, di sebelah Ejek)
 *
 * Kalau slot tujuan tidak ada (mis. halaman lain), tombol tidak dirender —
 * tidak ada fallback posisi yang menutupi meja.
 *
 * @param {object} props
 * @param {string|null} props.roomCode
 * @param {string|null} props.viewerId
 * @param {string} [props.name]
 * @param {boolean} [props.inGame] - batas rekaman 10 dtk (meja) vs 15 dtk (lobby).
 * @param {string} [props.portalId]
 * @param {boolean} [props.enabled] - saklar total; false → tombol hilang.
 * @param {boolean} [props.compact]
 * @param {boolean} [props.reactionsEnabled] - tampilkan panel reaksi suara.
 */
export default function PTTDock({
  roomCode,
  viewerId,
  name = '',
  inGame = false,
  portalId,
  enabled = true,
  compact = false,
  reactionsEnabled = true,
}) {
  const ptt = usePTT({ roomCode, viewerId, name, inGame, enabled });
  // Slot portal disimpan di state karena nilainya berasal dari DOM; null =
  // belum ditemukan, jadi tombol belum boleh dirender.
  const [host, setHost] = useState(null);
  // Panel reaksi suara dibuka dengan TAP pada tombol mic.
  const [reactionsOpen, setReactionsOpen] = useState(false);
  // null = belum diketahui. false = tidak ada klip di server, jadi panel tidak
  // akan pernah muncul. Dipakai agar ketukan pada mic tidak "ditelan" tanpa
  // hasil ketika fitur reaksi belum punya aset.
  const [reactionsAvailable, setReactionsAvailable] = useState(null);
  const noticeTimer = useRef(null);
  const dockRef = useRef(null);
  const clearNotice = ptt.clearNotice;
  const handleAvailability = useCallback(available => { setReactionsAvailable(available); }, []);

  // Cari slot portal. Slot bisa muncul belakangan (halaman baru selesai
  // render), jadi dicoba beberapa kali sebelum menyerah. setHost hanya
  // dipanggil setelah penemuan asinkron, bukan sinkron di dalam effect.
  useEffect(() => {
    if (!portalId || typeof document === 'undefined') return undefined;
    let attempts = 0;
    let timer = null;

    const find = () => {
      const element = document.getElementById(portalId);
      if (element) { setHost(element); return; }
      attempts += 1;
      if (attempts < 20) timer = setTimeout(find, 120);
    };
    find();

    return () => { if (timer) clearTimeout(timer); };
  }, [portalId]);

  // Tutup panel saat mengetuk di luar. Tanpa ini panel menutupi meja dan
  // pemain harus menekan mic lagi untuk menutupnya — padahal mic juga tombol
  // rekam, jadi terasa berisiko.
  useEffect(() => {
    if (!reactionsOpen) return undefined;
    const onDown = event => {
      const node = dockRef.current;
      if (node && !node.contains(event.target)) setReactionsOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [reactionsOpen]);

  // Panel tidak boleh tetap terbuka saat mulai merekam.
  useEffect(() => {
    if (ptt.recording) setReactionsOpen(false);
  }, [ptt.recording]);

  // Toast hilang sendiri setelah 3,2 detik.
  useEffect(() => {
    if (!ptt.notice) return undefined;
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => clearNotice(), 3200);
    return () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); };
  }, [ptt.notice, clearNotice]);

  const handleStart = useCallback(() => { ptt.start(); }, [ptt]);
  const handleStop = useCallback(options => { ptt.stop(options); }, [ptt]);
  const handleTap = useCallback(() => { setReactionsOpen(value => !value); }, []);
  const closeReactions = useCallback(() => { setReactionsOpen(false); }, []);

  const indicator = (
    <PTTIndicator
      speaking={ptt.speaking}
      notice={ptt.notice}
      onDismissNotice={ptt.clearNotice}
    />
  );

  // Browser tanpa MediaRecorder / tanpa format audio yang didukung → tombol
  // TIDAK dirender sama sekali (jebakan #4). Jangan tampilkan tombol yang
  // pasti gagal.
  if (!ptt.supported || !host) return indicator;

  // Panel reaksi hanya masuk akal kalau ada meja dan pemainnya.
  const showReactions = reactionsEnabled && Boolean(roomCode) && Boolean(viewerId);
  // Ketukan hanya dipasang kalau panelnya benar-benar bisa muncul. Kalau klip
  // belum tersedia (available === false), ketukan akan "ditelan" tanpa hasil:
  // tidak merekam, tidak membuka apa pun. Lebih baik mic tetap murni tombol
  // rekam sampai asetnya ada.
  const canOpenReactions = showReactions && reactionsAvailable !== false;

  const button = (
    <div className={`ptt-dock ${compact ? 'ptt-dock--compact' : ''}`} ref={dockRef}>
      <PTTButton
        onStart={handleStart}
        onStop={handleStop}
        onTap={canOpenReactions ? handleTap : undefined}
        tapActive={reactionsOpen}
        recording={ptt.recording}
        elapsed={ptt.elapsed}
        maxDurationMs={ptt.maxDurationMs}
        compact={compact}
        label="Tahan untuk bicara"
      />
      <button
        type="button"
        className={`ptt-mute ${ptt.muted ? 'is-muted' : ''}`}
        onClick={ptt.toggleMute}
        aria-pressed={ptt.muted}
        aria-label={ptt.muted ? 'Nyalakan suara pemain lain' : 'Bisukan suara pemain lain'}
        title={ptt.muted ? 'Nyalakan suara pemain lain' : 'Bisukan suara pemain lain'}
      >
        <Icon.SpeakerOff size={14} />
      </button>

      {/* Panel reaksi: bubble vertikal menempel di ATAS tombol mic. Dibatasi
          tinggi layar supaya tidak pernah meluber keluar viewport (bug lama:
          baris tombol horizontal meluber ke kanan pada layar 360px).
          Selalu di-mount (walau tertutup) agar bisa melaporkan apakah klip
          suara benar-benar tersedia — tombol mic memakai info itu. */}
      {showReactions && (
        <VoiceReactionBar
          roomCode={roomCode}
          viewerId={viewerId}
          open={reactionsOpen}
          onClose={closeReactions}
          onAvailabilityChange={handleAvailability}
          inline
        />
      )}
    </div>
  );

  return (
    <>
      {createPortal(button, host)}
      {indicator}
    </>
  );
}
