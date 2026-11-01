import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PTTButton from './PTTButton.jsx';
import PTTIndicator from './PTTIndicator.jsx';
import { Icon } from './SvgPrimitives.jsx';
import { usePTT } from '../hooks/usePTT.js';

/**
 * Push-to-Talk global.
 *
 * Di-mount SEKALI di App.jsx (bukan di RoomLobby/GameBoard) supaya MediaRecorder
 * dan listener Firebase tidak ikut mati saat host menekan MULAI dan halaman
 * berganti dari ruang tunggu ke meja main.
 *
 * Tombolnya sendiri dirender lewat React Portal ke slot yang disediakan tiap
 * halaman — pola `fabPortalId` yang sudah dipakai TauntThrowSystem:
 *
 *   - Ruang tunggu: slot `ptt-dock-slot` (tengah bawah, santai)
 *   - Meja main   : slot `ptt-game-slot` (kanan bawah, JAUH dari kartu tangan
 *                   dan dari tombol Turun/Buang supaya tidak tersenggol saat
 *                   orang mau membuang kartu)
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
 */
export default function PTTDock({
  roomCode,
  viewerId,
  name = '',
  inGame = false,
  portalId,
  enabled = true,
  compact = false,
}) {
  const ptt = usePTT({ roomCode, viewerId, name, inGame, enabled });
  // Slot portal disimpan di state karena nilainya berasal dari DOM; null =
  // belum ditemukan, jadi tombol belum boleh dirender.
  const [host, setHost] = useState(null);
  const noticeTimer = useRef(null);
  const clearNotice = ptt.clearNotice;

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

  // Toast hilang sendiri setelah 3,2 detik.
  useEffect(() => {
    if (!ptt.notice) return undefined;
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => clearNotice(), 3200);
    return () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); };
  }, [ptt.notice, clearNotice]);

  const handleStart = useCallback(() => { ptt.start(); }, [ptt]);
  const handleStop = useCallback(options => { ptt.stop(options); }, [ptt]);

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

  const button = (
    <div className={`ptt-dock ${compact ? 'ptt-dock--compact' : ''}`}>
      <PTTButton
        onStart={handleStart}
        onStop={handleStop}
        recording={ptt.recording}
        elapsed={ptt.elapsed}
        maxDurationMs={ptt.maxDurationMs}
        compact={compact}
        label={inGame ? 'Tahan untuk bicara' : 'Tahan untuk bicara'}
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
    </div>
  );

  return (
    <>
      {createPortal(button, host)}
      {indicator}
    </>
  );
}
