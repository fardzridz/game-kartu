import React from 'react';
import { AvatarArt, Icon } from '../components/SvgPrimitives.jsx';
import { QUICK_EMOTES, RARITY_CONFIG, getRodById } from './fishingCatalog.js';
import FishingDrawer from './FishingDrawer.jsx';

function statusBadgeForSeat(seat, isMe, localPhase, localNibble) {
  const phase = isMe ? localPhase : seat.state;
  if (phase === 'reeling') {
    return { text: '🔥 STRIKE!', tone: 'strike', alert: true };
  }
  if (phase === 'waiting') {
    if (isMe && localNibble) return { text: '💧 Digigit…', tone: 'nibble', alert: false };
    return { text: '🌊 Menunggu…', tone: 'wait', alert: false };
  }
  if (phase === 'casting') {
    return { text: '🎯 Mengayun…', tone: 'cast', alert: false };
  }
  if (phase === 'result') {
    return { text: '🐟 Dapat!', tone: 'catch', alert: false };
  }
  return { text: '⚓ Siap', tone: 'idle', alert: false };
}

/**
 * Siluet Ikan SVG berlapis yang hidup di dalam air.
 */
function SwimmingFishSvg({ color = '#2cc597', accent = '#fef08a', size = 34, flip = false }) {
  return (
    <svg
      width={size}
      height={Math.round(size * 0.58)}
      viewBox="0 0 64 36"
      fill="none"
      style={{ transform: flip ? 'scaleX(-1)' : undefined, overflow: 'visible' }}
      aria-hidden="true"
    >
      {/* Ekor mengibas */}
      <path
        className="nusa-fish-tail"
        d="M12 18 L2 7 L5 18 L2 29 Z"
        fill={accent}
      />
      {/* Sirip atas & bawah */}
      <path d="M28 9 L22 2 L37 8 Z" fill={accent} opacity="0.85" />
      <path d="M28 27 L23 34 L36 28 Z" fill={accent} opacity="0.85" />
      {/* Badan ikan */}
      <ellipse cx="34" cy="18" rx="22" ry="10.5" fill={color} />
      {/* Kilau perut */}
      <path d="M18 21 Q34 27 50 20" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" opacity="0.45" />
      {/* Mata ikan */}
      <circle cx="47" cy="15" r="2.6" fill="#091326" />
      <circle cx="47.8" cy="14.2" r="1" fill="#ffffff" />
    </svg>
  );
}

// Daftar ikan latar yang berenang bolak-balik di bawah air
const AMBIENT_FISHES = [
  { id: 'amb-1', top: '22%', size: 30, dur: '10s', delay: '0s', dir: 'right', color: '#38bdf8', accent: '#bae6fd', opacity: 0.65 },
  { id: 'amb-2', top: '42%', size: 38, dur: '13s', delay: '-4s', dir: 'left', color: '#2cc597', accent: '#a7f3d0', opacity: 0.7 },
  { id: 'amb-3', top: '58%', size: 34, dur: '9s', delay: '-2s', dir: 'right', color: '#f59e0b', accent: '#fde047', opacity: 0.6 },
  { id: 'amb-4', top: '74%', size: 46, dur: '15s', delay: '-7s', dir: 'left', color: '#dc2626', accent: '#fbbf24', opacity: 0.55 },
  { id: 'amb-5', top: '32%', size: 26, dur: '8s', delay: '-5s', dir: 'left', color: '#a855f7', accent: '#e9d5ff', opacity: 0.6 },
];

export default function FishingStage({
  room,
  viewerId,
  presence = {},
  localPhase,
  castPower,
  castFeedback,
  nibbleActive,
  biteWindow,
  reelingState,
  hookedCatch,
  resultModal,
  holdingReel,
  liveToast,
  floatingEmotes = {},
  drawerTab,
  setDrawerTab,
  onPrimaryDown,
  onPrimaryUp,
  onCloseResult,
  onBuyOrEquipRod,
  onSendEmote,
  onAddBot,
  onRemoveBot,
  onCopyInvite,
  copiedInvite,
  onExitDock,
}) {
  const seats = room?.seats || [];
  const viewer = seats.find(s => s.id === viewerId) || seats[0] || {};
  const myRod = getRodById(viewer?.rodId);

  const tension = localPhase === 'reeling' ? (reelingState?.tension || 0) : 0;
  const screenShake = localPhase === 'reeling' && tension > 80;

  // Label tombol aksi utama di Bottom Thumb-Zone
  let mainActionTitle = 'TAHAN UNTUK LEMPAR KAIL';
  let mainActionSub = 'Lepas di zona hijau (Sweet Spot) untuk hoki maksimal';
  let mainActionTone = 'cast';

  if (localPhase === 'casting') {
    mainActionTitle = `LEPAS SEKARANG! (${Math.round(castPower)}%)`;
    mainActionSub = 'Bidik area Sweet Spot hijau (74–86%)';
    mainActionTone = 'casting';
  } else if (localPhase === 'waiting') {
    if (biteWindow) {
      mainActionTitle = '⚡ SENTAK JORAN! (STRIKE!)';
      mainActionSub = 'Ikan menyambar kail — ketuk sekarang!';
      mainActionTone = 'strike';
    } else {
      mainActionTitle = nibbleActive ? 'PELAMPUNG GOYANG… JANGAN TARIK DULU' : 'MENUNGGU SAMBARAN IKAN…';
      mainActionSub = 'Ketuk jika ingin menggulung ulang kail';
      mainActionTone = 'waiting';
    }
  } else if (localPhase === 'reeling') {
    mainActionTitle = holdingReel ? '🔥 MENARIK SENAR… (LEPAS BILA NGAMUK)' : '🎣 TAHAN UNTUK TARIK REEL (HOLD)';
    mainActionSub = reelingState?.isRaging
      ? '⚠️ IKAN NGAMUK! Jangan ditahan terus atau senar putus!'
      : 'Jaga bar hijau tetap mengenai siluet ikan';
    mainActionTone = reelingState?.isRaging ? 'danger' : 'reel';
  } else if (localPhase === 'result') {
    mainActionTitle = 'LANJUT MEMANCING LAGI';
    mainActionSub = 'Ketuk untuk kembali ke posisi siap';
    mainActionTone = 'cast';
  }

  // Koordinat target ikan yang sedang terkait di kail pemain lokal
  const myIdx = Math.max(0, seats.findIndex(s => s.id === viewerId));
  const myCount = Math.max(1, seats.length);
  const myXBase = ((myIdx + 0.5) / myCount) * 880 + 60;
  const myDist = castFeedback?.distancePct || viewer?.castDistance || 72;
  const myBobberX = Math.max(110, Math.min(890, myXBase + (myIdx % 2 === 0 ? 1 : -1) * 42));
  const myBobberY = 265 + ((myDist - 25) / 75) * 175;

  // Saat reeling, ikan bergerak mendekat ke dermaga seiring naiknya progress (0..100%)
  const reelProgress = localPhase === 'reeling' ? (reelingState?.progress || 0) : 0;
  const hookedFishX = localPhase === 'reeling'
    ? myBobberX + Math.sin((reelingState?.fishPos || 0) * 0.25) * 55
    : myBobberX;
  const hookedFishY = localPhase === 'reeling'
    ? myBobberY - (reelProgress / 100) * (myBobberY - 225)
    : myBobberY + 18;

  return (
    <div
      className={`nusa-stage select-none touch-none overscroll-none ${screenShake ? 'is-shaking' : ''}`}
    >
      {/* ===================================================================
          TOP HEADER: Info Room, Koin, dan Live Feed Tangkapan Teman
         =================================================================== */}
      <header className="nusa-top-bar">
        <div className="nusa-top-bar__left">
          <button
            type="button"
            className="nusa-icon-btn"
            onClick={onExitDock}
            aria-label="Keluar dari dermaga"
            title="Keluar Dermaga"
          >
            <Icon.ArrowBack size={15} />
          </button>
          <button
            type="button"
            className="nusa-room-pill"
            onClick={() => setDrawerTab('players')}
            title="Lihat daftar pemain & kode room"
          >
            <span className="nusa-room-pill__dot" />
            <span className="nusa-room-pill__title">{room?.title || `Dermaga #${room?.code}`}</span>
            <span className="nusa-room-pill__count">{seats.length}/10 Pemain</span>
          </button>
        </div>

        <div className="nusa-top-bar__right">
          <button
            type="button"
            className="nusa-coin-pill"
            onClick={() => setDrawerTab('shop')}
            title="Buka Toko Joran"
          >
            <span>🪙 {viewer?.coins ?? 0}</span>
          </button>
        </div>
      </header>

      {/* Live Catch Toast Banner (Broadcast selebrasi tangkapan) */}
      {liveToast && (
        <div
          key={liveToast.id}
          className={`nusa-live-toast nusa-live-toast--${liveToast.rarity || 'common'}`}
          role="status"
          aria-live="polite"
        >
          <span className="nusa-live-toast__icon">
            {liveToast.rarity === 'mythic' ? '🐉' : liveToast.rarity === 'rare' ? '⚡' : '🐟'}
          </span>
          <div className="nusa-live-toast__body">
            <strong>{liveToast.playerName}</strong> menangkap{' '}
            <span className="nusa-live-toast__fish">{liveToast.fishName}</span>{' '}
            <em>({liveToast.weightKg} kg)</em>!
          </div>
          <span className="nusa-live-toast__badge">
            {(RARITY_CONFIG[liveToast.rarity] || RARITY_CONFIG.common).badge}
          </span>
        </div>
      )}

      {/* ===================================================================
          VISUAL STAGE (SVG + DOM Overlay): Langit, Laut, Dermaga 1-10 Pemain,
          Joran Melengkung, Pelampung Bergoyang, & Ikan Berenang Hidup
         =================================================================== */}
      <div className="nusa-scenery">
        {/* Langit, Awan Bergerak & Matahari Tropis */}
        <div className="nusa-sky">
          <div className="nusa-sun" />
          <div className="nusa-cloud nusa-cloud--1" />
          <div className="nusa-cloud nusa-cloud--2" />
          <div className="nusa-island nusa-island--left" />
          <div className="nusa-island nusa-island--right" />
        </div>

        {/* SVG Joran Pancing Melengkung Dinamis, Senar Bezier, Pelampung, Cipratan Air & Ikan */}
        <svg
          className="nusa-lines-svg"
          viewBox="0 0 1000 500"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="nusaLineGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#7dd3fc" stopOpacity="0.7" />
            </linearGradient>
            <linearGradient id="nusaDangerLineGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="1" />
              <stop offset="100%" stopColor="#fde047" stopOpacity="0.9" />
            </linearGradient>
          </defs>

          {seats.map((seat, idx) => {
            const isMe = seat.id === viewerId;
            const phase = isMe ? localPhase : seat.state;
            const count = Math.max(1, seats.length);
            const xBase = ((idx + 0.5) / count) * 880 + 60;
            const yHand = 178; // Posisi tangan karakter di dermaga

            // Sudut dan lengkungan joran sesuai aksi (idle, casting, waiting, reeling)
            const seatTension = isMe ? tension : (seat.tension || (phase === 'reeling' ? 60 : 12));
            const isStrike = phase === 'reeling' || (isMe && biteWindow);
            const isCasting = phase === 'casting';

            // Joran selalu digambar di tangan setiap pemancing!
            const rodPullBack = isCasting ? -28 : isStrike ? 22 : 12;
            const rodBendY = isCasting ? -25 : isStrike ? 18 + (seatTension * 0.16) : 0;
            const xRodTip = xBase + rodPullBack;
            const yRodTip = 128 + rodBendY;
            const xRodCtrl = xBase + rodPullBack * 0.45;
            const yRodCtrl = 148 - (isStrike ? 12 : 4);

            // Jika sedang idle/casting/result, gambar joran + kail menggantung
            if (phase !== 'waiting' && phase !== 'reeling') {
              const hookDropY = isCasting ? yRodTip + 18 : yRodTip + 34;
              return (
                <g key={`rod-idle-${seat.id}`} className={isCasting ? 'nusa-svg-rod-cast' : 'nusa-svg-rod-idle'}>
                  {/* Batang Joran Melengkung (Quadratic Bezier) */}
                  <path
                    d={`M ${xBase - 8} ${yHand} Q ${xRodCtrl} ${yRodCtrl} ${xRodTip} ${yRodTip}`}
                    fill="none"
                    stroke={isMe ? myRod.color : '#cbd5e1'}
                    strokeWidth={isMe ? 4.5 : 3}
                    strokeLinecap="round"
                  />
                  {/* Reel kecil di pangkal joran */}
                  <circle cx={xBase - 3} cy={yHand - 5} r="4.5" fill="#f5a623" stroke="#1e293b" strokeWidth="1.5" />
                  {/* Senar pendek + pelampung menggantung */}
                  <line
                    x1={xRodTip}
                    y1={yRodTip}
                    x2={xRodTip + (isCasting ? -10 : 2)}
                    y2={hookDropY}
                    stroke="rgba(255,255,255,0.75)"
                    strokeWidth="1.5"
                  />
                  <circle
                    cx={xRodTip + (isCasting ? -10 : 2)}
                    cy={hookDropY}
                    r="5"
                    fill={isMe ? '#ef4444' : '#38bdf8'}
                    stroke="#fff"
                    strokeWidth="1.5"
                  />
                </g>
              );
            }

            // Saat WAITING atau REELING: senar memanjang ke air + pelampung + ikan meronta
            const dist = isMe ? myDist : (seat.castDistance || 65);
            const bobberX = isMe
              ? hookedFishX
              : Math.max(90, Math.min(910, xBase + (idx % 2 === 0 ? 1 : -1) * (28 + (idx * 11) % 35)));
            const bobberY = isMe
              ? (phase === 'reeling' ? hookedFishY : myBobberY)
              : 265 + ((dist - 25) / 75) * 175;

            const sag = Math.max(2, 62 - seatTension * 0.56);
            const ctrlX = (xRodTip + bobberX) * 0.5;
            const ctrlY = Math.min(485, (yRodTip + bobberY) * 0.5 + sag);

            const strokeColor = seatTension > 75
              ? 'url(#nusaDangerLineGrad)'
              : 'url(#nusaLineGrad)';

            return (
              <g key={`line-${seat.id}`}>
                {/* Batang Joran Melengkung karena beban tarikan */}
                <path
                  d={`M ${xBase - 8} ${yHand} Q ${xRodCtrl} ${yRodCtrl} ${xRodTip} ${yRodTip}`}
                  fill="none"
                  stroke={isMe ? myRod.color : '#cbd5e1'}
                  strokeWidth={isMe ? 5 : 3.2}
                  strokeLinecap="round"
                />
                <circle cx={xBase - 3} cy={yHand - 5} r="5" fill="#f5a623" stroke="#1e293b" strokeWidth="1.5" />

                {/* Kurva Bezier Senar Pancing */}
                <path
                  d={`M ${xRodTip} ${yRodTip} Q ${ctrlX} ${ctrlY} ${bobberX} ${bobberY}`}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={isMe ? (seatTension > 75 ? 2.8 : 2.1) : 1.4}
                  strokeDasharray={seat.bot ? '4 3' : undefined}
                />

                {/* Riak Air Berlapis di titik Pelampung / Ikan */}
                <ellipse
                  cx={bobberX}
                  cy={bobberY + 4}
                  rx={isStrike ? 28 : (isMe && nibbleActive ? 20 : 13)}
                  ry={isStrike ? 9 : 4.5}
                  fill="none"
                  stroke={isStrike ? '#fde047' : 'rgba(255,255,255,0.6)'}
                  strokeWidth={isStrike ? 2.4 : 1.5}
                  className={isStrike ? 'nusa-ripple-fast' : 'nusa-ripple-slow'}
                />
                <ellipse
                  cx={bobberX}
                  cy={bobberY + 4}
                  rx={isStrike ? 42 : 22}
                  ry={isStrike ? 14 : 7}
                  fill="none"
                  stroke={isStrike ? 'rgba(239,68,68,0.65)' : 'rgba(125,211,252,0.35)'}
                  strokeWidth="1.3"
                  className="nusa-ripple-outer"
                />

                {/* Siluet Bayangan Ikan Mengintai / Meronta di Bawah Pelampung */}
                <g
                  transform={`translate(${bobberX - 18}, ${bobberY + (isStrike ? -6 : 10)})`}
                  className={isStrike ? 'nusa-svg-fish-thrash' : 'nusa-svg-fish-lurk'}
                >
                  <ellipse
                    cx="18"
                    cy="8"
                    rx={isStrike ? 16 : 12}
                    ry={isStrike ? 6.5 : 4.5}
                    fill={isStrike ? (hookedCatch?.fish?.color || '#f59e0b') : 'rgba(6, 24, 44, 0.65)'}
                  />
                  <polygon
                    points="2,8 -6,2 -4,8 -6,14"
                    fill={isStrike ? (hookedCatch?.fish?.accent || '#fde047') : 'rgba(6, 24, 44, 0.65)'}
                  />
                </g>

                {/* Cipratan Air (Splash Droplets) saat Strike / Reeling */}
                {(isStrike || (isMe && nibbleActive)) && (
                  <g className="nusa-splash-group" transform={`translate(${bobberX}, ${bobberY})`}>
                    <circle cx="-14" cy="-10" r="3" fill="#e0f2fe" />
                    <circle cx="15" cy="-12" r="3.5" fill="#ffffff" />
                    <circle cx="-6" cy="-18" r="2.5" fill="#bae6fd" />
                    <circle cx="9" cy="-20" r="2.5" fill="#e0f2fe" />
                  </g>
                )}

                {/* Pelampung Merah-Putih Klasik (Bobber) */}
                <g
                  transform={`translate(${bobberX}, ${bobberY})`}
                  className={
                    isStrike
                      ? 'nusa-bobber-strike'
                      : isMe && nibbleActive
                        ? 'nusa-bobber-nibble'
                        : 'nusa-bobber-float'
                  }
                >
                  <line x1="0" y1="-13" x2="0" y2="-5" stroke="#fde047" strokeWidth="2.2" strokeLinecap="round" />
                  <circle cx="0" cy="0" r={isMe ? 7.5 : 5.5} fill="#ffffff" stroke="#0f172a" strokeWidth="1.2" />
                  <path
                    d={isMe ? 'M -7.5 0 A 7.5 7.5 0 0 1 7.5 0 Z' : 'M -5.5 0 A 5.5 5.5 0 0 1 5.5 0 Z'}
                    fill={isStrike ? '#ef4444' : isMe ? '#f97316' : '#38bdf8'}
                  />
                </g>
              </g>
            );
          })}
        </svg>

        {/* Papan Dermaga Kayu & Barisan 1–10 Karakter Pemancing */}
        <div className="nusa-dock-stage">
          <div className="nusa-dock-pillars" />
          <div className="nusa-dock-planks" />
          <div className="nusa-anglers-row" data-testid="dock-anglers-row">
            {seats.map(seat => {
              const isMe = seat.id === viewerId;
              const phase = isMe ? localPhase : seat.state;
              const badge = statusBadgeForSeat(seat, isMe, localPhase, nibbleActive);
              const emote = floatingEmotes[seat.id];
              const isOnline = seat.bot || presence?.[seat.id]?.online !== false;

              return (
                <div
                  key={seat.id}
                  className={`nusa-angler ${isMe ? 'is-me' : ''} is-phase-${phase} ${badge.alert ? 'is-striking' : ''} ${!isOnline ? 'is-offline' : ''}`}
                  data-player-id={seat.id}
                >
                  {/* Floating Quick Emote di atas kepala */}
                  {emote && (
                    <div key={emote.ts} className="nusa-emote-bubble" aria-live="polite">
                      <span className="nusa-emote-bubble__icon">{emote.icon}</span>
                      <span className="nusa-emote-bubble__text">{emote.label}</span>
                    </div>
                  )}

                  {/* Indikator ! merah berkedip saat teman/kita sedang STRIKE! */}
                  {(badge.alert || (isMe && biteWindow)) && (
                    <div className="nusa-strike-bang" aria-label="Strike!">!</div>
                  )}

                  {/* Status Pill Realtime */}
                  <div className={`nusa-angler__status nusa-angler__status--${badge.tone}`}>
                    {badge.text}
                  </div>

                  {/* Potret Karakter */}
                  <div className="nusa-angler__avatar">
                    <AvatarArt avatar={seat.avatar} size={42} />
                  </div>

                  {/* Label Nama */}
                  <div className="nusa-angler__name">
                    {seat.name}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Permukaan Air Laut Dinamis + Kawanan Ikan Berenang */}
        <div className="nusa-water">
          <div className="nusa-wave nusa-wave--1" />
          <div className="nusa-wave nusa-wave--2" />

          {/* Kawanan Ikan Nusantara Berenang Hidup di Dalam Air */}
          <div className="nusa-aquarium" aria-hidden="true">
            {AMBIENT_FISHES.map(fish => (
              <div
                key={fish.id}
                className={`nusa-ambient-fish nusa-ambient-fish--${fish.dir}`}
                style={{
                  top: fish.top,
                  animationDuration: fish.dur,
                  animationDelay: fish.delay,
                  opacity: fish.opacity,
                }}
              >
                <SwimmingFishSvg
                  color={fish.color}
                  accent={fish.accent}
                  size={fish.size}
                  flip={fish.dir === 'left'}
                />
              </div>
            ))}
          </div>

          {/* Info singkat di atas permukaan air saat IDLE / WAITING */}
          {localPhase === 'idle' && (
            <div className="nusa-water-hint">
              <span>🎣 Joran Aktif: <strong style={{ color: myRod.color }}>{myRod.name}</strong></span>
              <small>Tahan tombol hijau di bawah untuk mengayun joran & melempar pelampung!</small>
            </div>
          )}
          {localPhase === 'waiting' && (
            <div className={`nusa-water-hint ${biteWindow ? 'is-bite' : ''}`}>
              {biteWindow ? (
                <>
                  <strong>⚡ IKAN MENYAMBAR! SENTAK SEKARANG!</strong>
                  <small>Ketuk tombol di bawah sebelum ikan kabur!</small>
                </>
              ) : (
                <>
                  <span>
                    {castFeedback?.label || 'Kail Terlempar'} ·{' '}
                    {nibbleActive ? '💧 Pelampung dipatuk ikan! Tunggu tenggelam…' : 'Perhatikan pelampung merah-putihmu di air…'}
                  </span>
                  <small>Jangan ketuk saat cuma goyang kecil (fake bite), tarik saat indikator STRIKE! menyala</small>
                </>
              )}
            </div>
          )}
        </div>

        {/* ===================================================================
            OVERLAY FASE CASTING: Power Bar dengan Sweet Spot
           =================================================================== */}
        {localPhase === 'casting' && (
          <div className="nusa-cast-overlay" data-testid="casting-power-bar">
            <div className="nusa-cast-card">
              <div className="nusa-cast-card__head">
                <span>🎯 AYUNAN JORAN</span>
                <strong>{Math.round(castPower)}%</strong>
              </div>
              <div className="nusa-cast-track">
                {/* Zona Sweet Spot: 74% - 86% */}
                <div className="nusa-cast-sweet" style={{ left: '74%', width: '12%' }}>
                  <span>SWEET SPOT</span>
                </div>
                <div className="nusa-cast-fill" style={{ width: `${castPower}%` }} />
                <div className="nusa-cast-thumb" style={{ left: `${castPower}%` }} />
              </div>
              <div className="nusa-cast-card__sub">
                Lepaskan jempol tepat di zona hijau untuk peluang ikan Rare & Mythic!
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            CENTER OVERLAY: HUD Minigame Timing Bar & Tension Meter (Fase REELING)
           =================================================================== */}
        {localPhase === 'reeling' && reelingState && (
          <div className="nusa-reel-hud" data-testid="reeling-minigame-hud">
            <div className="nusa-reel-card">
              <div className="nusa-reel-card__header">
                <div className="nusa-reel-card__fish">
                  <span
                    className="nusa-rarity-chip"
                    style={{
                      borderColor: (RARITY_CONFIG[reelingState.rarity] || RARITY_CONFIG.common).color,
                      color: (RARITY_CONFIG[reelingState.rarity] || RARITY_CONFIG.common).color,
                    }}
                  >
                    {(RARITY_CONFIG[reelingState.rarity] || RARITY_CONFIG.common).badge}
                  </span>
                  <strong>{hookedCatch?.fish?.name || 'Ikan Misterius'}</strong>
                </div>
                <div className={`nusa-rage-pill ${reelingState.isRaging ? 'is-raging' : 'is-calm'}`}>
                  {reelingState.isRaging ? '🔥 IKAN NGAMUK! (LEPAS!)' : '🌊 FASE TENANG (TARIK!)'}
                </div>
              </div>

              <div className="nusa-reel-columns">
                {/* Kolom 1: Timing Bar Vertikal (Catch Bar vs Siluet Ikan) */}
                <div className="nusa-timing-col">
                  <div className="nusa-col-label">TIMING BAR</div>
                  <div className="nusa-timing-tube">
                    {/* Catch Bar Hijau yang dikendalikan pemain */}
                    <div
                      className={`nusa-catch-bar ${reelingState.overlapping ? 'is-overlap' : ''}`}
                      style={{
                        bottom: `${reelingState.barPos}%`,
                        height: `${reelingState.barHeight}%`,
                      }}
                    />
                    {/* Siluet Ikan yang bergerak sesuai AI Rarity */}
                    <div
                      className={`nusa-fish-marker ${reelingState.isRaging ? 'is-raging' : ''}`}
                      style={{ bottom: `calc(${reelingState.fishPos}% - 14px)` }}
                    >
                      <SwimmingFishSvg
                        color={reelingState.isRaging ? '#ef4444' : (hookedCatch?.fish?.color || '#38bdf8')}
                        accent={hookedCatch?.fish?.accent || '#fde047'}
                        size={30}
                      />
                    </div>
                  </div>
                </div>

                {/* Kolom 2: Progress Tangkapan */}
                <div className="nusa-meter-col">
                  <div className="nusa-col-label">TARIKAN ({Math.round(reelingState.progress)}%)</div>
                  <div className="nusa-vertical-bar">
                    <div
                      className="nusa-vertical-bar__fill nusa-vertical-bar__fill--progress"
                      style={{ height: `${reelingState.progress}%` }}
                    />
                  </div>
                </div>

                {/* Kolom 3: Tension Meter (Ketegangan Senar) */}
                <div className="nusa-meter-col">
                  <div className="nusa-col-label">
                    TENSION ({Math.round(reelingState.tension)}%)
                  </div>
                  <div className="nusa-vertical-bar nusa-vertical-bar--tension">
                    <div
                      className={`nusa-vertical-bar__fill nusa-vertical-bar__fill--tension ${reelingState.tension > 75 ? 'is-critical' : ''}`}
                      style={{ height: `${reelingState.tension}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            OVERLAY FASE RESULT: Pop-up Tangkapan / Senar Putus
           =================================================================== */}
        {localPhase === 'result' && resultModal && (
          <div className="nusa-result-overlay" data-testid="catch-result-modal">
            <div className={`nusa-result-card nusa-result-card--${resultModal.outcome}`}>
              {resultModal.outcome === 'caught' ? (
                <>
                  <div
                    className="nusa-result-card__badge"
                    style={{
                      backgroundColor: (RARITY_CONFIG[resultModal.rarity] || RARITY_CONFIG.common).glow,
                      color: (RARITY_CONFIG[resultModal.rarity] || RARITY_CONFIG.common).color,
                    }}
                  >
                    {(RARITY_CONFIG[resultModal.rarity] || RARITY_CONFIG.common).badge}
                  </div>
                  <div className="nusa-result-card__fish-showcase">
                    <SwimmingFishSvg
                      color={resultModal.fish.color}
                      accent={resultModal.fish.accent}
                      size={84}
                    />
                  </div>
                  <h2 className="nusa-result-card__title">{resultModal.fish.name}</h2>
                  <p className="nusa-result-card__region">{resultModal.fish.region}</p>
                  <p className="nusa-result-card__desc">{resultModal.fish.desc}</p>
                  <div className="nusa-result-card__metrics">
                    <div>
                      <span>BERAT</span>
                      <strong>{resultModal.weightKg} kg</strong>
                    </div>
                    <div>
                      <span>HADIAH</span>
                      <strong className="is-gold">+{resultModal.coins} 🪙</strong>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="nusa-result-card__icon">💥</div>
                  <h2 className="nusa-result-card__title">
                    {resultModal.outcome === 'snapped' ? 'Senar Pancing Putus!' : 'Ikan Lepas Kabur!'}
                  </h2>
                  <p className="nusa-result-card__desc">
                    {resultModal.outcome === 'snapped'
                      ? 'Ketegangan senar mencapai 100% saat ikan ngamuk. Lepaskan tahanan jempol sewaktu indikator merah menyala!'
                      : 'Siluet ikan terlalu lama berada di luar Catch Bar. Upgrade joranmu di Toko Joran agar Catch Bar lebih lebar!'}
                  </p>
                </>
              )}
              <button type="button" className="nusa-cta-btn" onClick={onCloseResult}>
                🎣 LEMPAR KAIL LAGI
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ===================================================================
          BOTTOM THUMB-ZONE: Quick Emote Strip, Tombol Aksi Utama Satu Jempol,
          & Navigasi Drawer (Tas Ikan, Toko Joran, Daftar Pemain, Emote)
         =================================================================== */}
      <footer className="nusa-thumb-zone select-none touch-none">
        {/* Baris Reaksi Cepat 1-Ketuk */}
        <div className="nusa-quick-emote-strip">
          {QUICK_EMOTES.map(emote => (
            <button
              key={emote.id}
              type="button"
              className="nusa-quick-emote-chip"
              onClick={() => onSendEmote(emote)}
              title={`Kirim stiker ${emote.label}`}
            >
              <span>{emote.icon}</span>
              <span className="nusa-quick-emote-chip__text">{emote.label}</span>
            </button>
          ))}
        </div>

        {/* Tombol Utama Besar (CAST / HOLD TO REEL) — Anti-Glitch Mobile Touch */}
        <button
          type="button"
          data-testid="nusa-primary-action-btn"
          className={`nusa-action-mega-btn nusa-action-mega-btn--${mainActionTone} select-none touch-none`}
          onPointerDown={onPrimaryDown}
          onPointerUp={onPrimaryUp}
          onPointerCancel={onPrimaryUp}
          onContextMenu={e => e.preventDefault()}
        >
          <span className="nusa-action-mega-btn__title">{mainActionTitle}</span>
          <span className="nusa-action-mega-btn__sub">{mainActionSub}</span>
        </button>

        {/* Baris Navigasi Drawer Bawah */}
        <div className="nusa-nav-bar">
          <button
            type="button"
            className={`nusa-nav-btn ${drawerTab === 'bag' ? 'is-active' : ''}`}
            onClick={() => setDrawerTab('bag')}
          >
            <span>🎒</span>
            <span>Tas Ikan ({viewer?.inventory?.length || 0})</span>
          </button>
          <button
            type="button"
            className={`nusa-nav-btn ${drawerTab === 'shop' ? 'is-active' : ''}`}
            onClick={() => setDrawerTab('shop')}
          >
            <span>🎣</span>
            <span>Toko Joran</span>
          </button>
          <button
            type="button"
            className={`nusa-nav-btn ${drawerTab === 'players' ? 'is-active' : ''}`}
            onClick={() => setDrawerTab('players')}
          >
            <span>⚓</span>
            <span>Room ({seats.length}/10)</span>
          </button>
          <button
            type="button"
            className={`nusa-nav-btn ${drawerTab === 'emote' ? 'is-active' : ''}`}
            onClick={() => setDrawerTab('emote')}
          >
            <span>💬</span>
            <span>Stiker</span>
          </button>
        </div>
      </footer>

      <FishingDrawer
        openTab={drawerTab}
        onClose={() => setDrawerTab(null)}
        room={room}
        viewer={viewer}
        presence={presence}
        onBuyOrEquipRod={onBuyOrEquipRod}
        onSendEmote={onSendEmote}
        onAddBot={onAddBot}
        onRemoveBot={onRemoveBot}
        onCopyInvite={onCopyInvite}
        copiedInvite={copiedInvite}
      />
    </div>
  );
}
