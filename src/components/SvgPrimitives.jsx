import React from 'react';

/**
 * SvgPrimitives — inline-vector building blocks for the arena.
 * Zero emoji, zero icon fonts: every suit, HUD icon, avatar and card face
 * is a hand-layered <svg>. Card assets come from /cards/*.svg (CardSVG img).
 */

// ===========================================================================
// SUITS
// ===========================================================================
const SUIT_PATHS = {
  '♠': { id: 'spade', path: 'M12 2C7 8 3 11.5 3 15.2C3 17.9 5.1 20 7.8 20C9.4 20 10.8 19.1 11.4 17.9L10.1 22H13.9L12.6 17.9C13.2 19.1 14.6 20 16.2 20C18.9 20 21 17.9 21 15.2C21 11.5 17 8 12 2Z' },
  '♥': { id: 'heart', path: 'M12 21.35L10.55 20.03C5.4 15.36 2 12.27 2 8.5C2 5.41 4.42 3 7.5 3C9.24 3 10.91 3.81 12 5.08C13.09 3.81 14.76 3 16.5 3C19.58 3 22 5.41 22 8.5C22 12.27 18.6 15.36 13.45 20.03L12 21.35Z' },
  '♦': { id: 'diamond', path: 'M12 2L20 12L12 22L4 12L12 2Z' },
  '♣': { id: 'club', path: 'M12 2C9.8 2 8 3.8 8 6C8 7.4 8.7 8.6 9.8 9.3C7.1 9.6 5 11.9 5 14.7C5 17.2 7 19.2 9.5 19.2C10.7 19.2 11.8 18.7 12.6 17.9L11.3 22H14.7L13.4 17.9C14.2 18.7 15.3 19.2 16.5 19.2C19 19.2 21 17.2 21 14.7C21 11.9 18.9 9.6 16.2 9.3C17.3 8.6 18 7.4 18 6C18 3.8 16.2 2 14 2H12Z' },
  JOKER: { id: 'spade', path: 'M12 2C7 8 3 11.5 3 15.2C3 17.9 5.1 20 7.8 20C9.4 20 10.8 19.1 11.4 17.9L10.1 22H13.9L12.6 17.9C13.2 19.1 14.6 20 16.2 20C18.9 20 21 17.9 21 15.2C21 11.5 17 8 12 2Z' },
};

export function isRedSuit(suit) {
  return suit === '♥' || suit === '♦';
}

export function suitPath(suit) {
  return (SUIT_PATHS[suit] || SUIT_PATHS['♠']).path;
}

export function SuitIcon({ suit = '♠', size = 14, color, className = '', style = {} }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      style={{ display: 'block', flexShrink: 0, ...style }}
      aria-hidden="true"
      focusable="false"
    >
      <path d={suitPath(suit)} fill={color || (isRedSuit(suit) ? '#E53935' : '#1B1F3B')} />
    </svg>
  );
}

// ===========================================================================
// HUD / ACTION ICONS (stroke = currentColor)
// ===========================================================================
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' };

export const Icon = {
  CardStack: ({ size = 15 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="4" width="12" height="16" rx="2" {...stroke} />
      <path d="M9 8H19C20.1 8 21 8.9 21 10V20C21 21.1 20.1 22 19 22H9" {...stroke} />
    </svg>
  ),
  Stopwatch: ({ size = 13 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="13" r="8" {...stroke} />
      <path d="M12 9V13L14.5 14.5M9 3H15" {...stroke} />
    </svg>
  ),
  Speaker: ({ size = 18, muted = false }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11 5L6 9H2V15H6L11 19V5Z" fill="currentColor" />
      {muted ? (
        <path d="M15.5 9.5L20.5 14.5M20.5 9.5L15.5 14.5" {...stroke} />
      ) : (
        <path d="M15.5 8.5C16.8 9.8 16.8 14.2 15.5 15.5M18.5 5.5C21.2 8.2 21.2 15.8 18.5 18.5" {...stroke} />
      )}
    </svg>
  ),
  Fullscreen: ({ size = 17, exit = false }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {exit ? (
        <path d="M9 4V9H4M15 4V9H20M9 20V15H4M15 20V15H20" {...stroke} />
      ) : (
        <path d="M4 9V4H9M20 9V4H15M4 15V20H9M20 15V20H15" {...stroke} />
      )}
    </svg>
  ),
  Plug: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2V6M12 18V22M4.93 4.93L7.76 7.76M16.24 16.24L19.07 19.07M2 12H6M18 12H22" {...stroke} strokeWidth={2.6} />
    </svg>
  ),
  // Tarik kartu: satu lingkaran penuh dengan panah di ujungnya
  Refresh: ({ size = 13 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19.6 12A7.6 7.6 0 1 1 17.37 6.63" {...stroke} strokeWidth={2.2} />
      <path d="M19.6 3.6V7.7H15.5" {...stroke} strokeWidth={2.2} />
    </svg>
  ),
  Star: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="currentColor" />
    </svg>
  ),
  Trash: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 6H21M8 6V4C8 2.9 8.9 2 10 2H14C15.1 2 16 2.9 16 4V6M19 6L18 20C18 21.1 17.1 22 16 22H8C6.9 22 6 21.1 6 20L5 6" {...stroke} />
    </svg>
  ),
  Gear: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" {...stroke} />
      <path d="M19.4 15A1.65 1.65 0 0 0 21 13.35V10.65A1.65 1.65 0 0 0 19.4 9L17.7 8.3A6.9 6.9 0 0 0 16.5 6.3L17.2 4.6A1.65 1.65 0 0 0 15.3 2.7L13.6 3.4A6.9 6.9 0 0 0 10.4 3.4L8.7 2.7A1.65 1.65 0 0 0 6.8 4.6L7.5 6.3A6.9 6.9 0 0 0 6.3 8.3L4.6 9A1.65 1.65 0 0 0 3 10.65V13.35A1.65 1.65 0 0 0 4.6 15L6.3 15.7A6.9 6.9 0 0 0 7.5 17.7L6.8 19.4A1.65 1.65 0 0 0 8.7 21.3L10.4 20.6A6.9 6.9 0 0 0 13.6 20.6L15.3 21.3A1.65 1.65 0 0 0 17.2 19.4L16.5 17.7A6.9 6.9 0 0 0 17.7 15.7Z" {...stroke} />
    </svg>
  ),
  // Riwayat: jam dengan jarum, busur mundur dengan kepala panah
  History: ({ size = 13 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.6 12A8.6 8.6 0 1 1 18.08 5.92" {...stroke} strokeWidth={2.2} />
      <path d="M20.6 3.4V7.6H16.4" {...stroke} strokeWidth={2.2} />
      <path d="M12 7.4V12L15.3 13.9" {...stroke} strokeWidth={1.9} />
    </svg>
  ),
  Lock: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor" />
      <path d="M8 11V7A4 4 0 0 1 16 7V11" {...stroke} />
    </svg>
  ),
  Close: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6L18 18M18 6L6 18" {...stroke} strokeWidth={2.4} />
    </svg>
  ),
  Info: ({ size = 15 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" {...stroke} />
      <path d="M12 11V16M12 7.6V8.2" {...stroke} strokeWidth={2.4} />
    </svg>
  ),
  Check: ({ size = 13 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12.5L9.5 18L20 6.5" {...stroke} strokeWidth={2.8} />
    </svg>
  ),
  Crown: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 8L7.5 12L12 4.5L16.5 12L21 8L19 19H5L3 8Z" fill="currentColor" />
    </svg>
  ),
  Droplet: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.5C12 2.5 5.5 9.6 5.5 14.5A6.5 6.5 0 0 0 18.5 14.5C18.5 9.6 12 2.5 12 2.5Z" fill="currentColor" />
      <path d="M9 15.5A3.2 3.2 0 0 0 12.2 18.7" {...stroke} strokeWidth={1.6} stroke="#fff" strokeOpacity={0.55} />
    </svg>
  ),
  Offline: ({ size = 12 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 18H12V21H5C3.9 21 3 20.1 3 19V18ZM7 14H21V17H9C7.9 17 7 16.1 7 15V14ZM13 10H21V13H15C13.9 13 13 12.1 13 11V10ZM12 5H12.5V8H12.5" fill="currentColor" />
      <path d="M15 3H21V9" {...stroke} strokeWidth={2} stroke="#8E96C7" />
    </svg>
  ),
  Eye: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M1.5 12S5.5 5 12 5S22.5 12 22.5 12S18.5 19 12 19S1.5 12 1.5 12Z" {...stroke} />
      <circle cx="12" cy="12" r="3" {...stroke} />
    </svg>
  ),
  Copy: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="9" width="12" height="12" rx="2" {...stroke} />
      <path d="M15 9V5C15 3.9 14.1 3 13 3H5C3.9 3 3 3.9 3 5V13C3 14.1 3.9 15 5 15H9" {...stroke} />
    </svg>
  ),
  Share: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="18" cy="5" r="3" {...stroke} />
      <circle cx="6" cy="12" r="3" {...stroke} />
      <circle cx="18" cy="19" r="3" {...stroke} />
      <path d="M8.6 10.6L15.4 6.4M8.6 13.4L15.4 17.6" {...stroke} />
    </svg>
  ),
  Users: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9" cy="8" r="3.4" {...stroke} />
      <path d="M3 20C3 16.2 5.7 14 9 14C12.3 14 15 16.2 15 20" {...stroke} />
      <path d="M16 4.6A3.4 3.4 0 0 1 16 11.4M17.5 14.4C19.9 15.1 21.5 17.1 21.5 20" {...stroke} />
    </svg>
  ),
  Plus: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5V19M5 12H19" {...stroke} strokeWidth={2.4} />
    </svg>
  ),
  Exit: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 4H19C20.1 4 21 4.9 21 6V18C21 19.1 20.1 20 19 20H15" {...stroke} />
      <path d="M10 8L6 12L10 16M6 12H16" {...stroke} />
    </svg>
  ),
  Flag: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 22V3M5 4H17L14.5 8.5L17 13H5" {...stroke} />
    </svg>
  ),
  Play: ({ size = 13 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4.5L19.5 12L7 19.5V4.5Z" fill="currentColor" />
    </svg>
  ),
  Shield: ({ size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M16 4L26 8.5V16.5C26 22.8 21.6 27.4 16 29C10.4 27.4 6 22.8 6 16.5V8.5L16 4Z" fill="currentColor" stroke="#A7F3D0" strokeWidth="1.5" />
      <path d="M16 9.5L20.5 16L16 22.5L11.5 16L16 9.5Z" fill="#1D213B" />
    </svg>
  ),
  ArrowBack: ({ size = 13 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 12H5M11 6L5 12L11 18" {...stroke} strokeWidth={2.4} />
    </svg>
  ),
  // Nada ganda — penanda musik latar (dangdut) di HUD.
  Note: ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 18V6l10-2v11" {...stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="6.5" cy="18" r="2.5" fill="currentColor" />
      <circle cx="16.5" cy="15" r="2.5" fill="currentColor" />
    </svg>
  ),
};

// ===========================================================================
// AVATAR PORTRAITS — pixel-art portraits from /avatars/*.png, keyed by the
// avatar id carried by the engine so identity stays consistent everywhere.
// ===========================================================================
export const AVATAR_META = {
  finn: { file: 'A_Finn.png', name: 'Finn' },
  jake: { file: 'A_Jake.png', name: 'Jake' },
  bmo: { file: 'A_BMO.png', name: 'BMO' },
  marceline: { file: 'A_Marceline.png', name: 'Marceline' },
  'princess-bubblegum': { file: 'A_Princess_Bubblegum.png', name: 'Princess Bubblegum' },
  'ice-king': { file: 'A_Ice_King.png', name: 'Ice King' },
  gunter: { file: 'A_Gunter.png', name: 'Gunter' },
  fiona: { file: 'A_Fiona.png', name: 'Fiona' },
  'flame-princess': { file: 'A_Flame_Princess.png', name: 'Flame Princess' },
  'lady-rainicorn': { file: 'A_Lady_Rainicorn.png', name: 'Lady Rainicorn' },
  lemongrab: { file: 'A_Lemongrab.png', name: 'Lemongrab' },
  'lumpy-space-princess': { file: 'A_Lumpy_Space_Princess.png', name: 'Lumpy Space Princess' },
  'slime-princess': { file: 'A_Slime_Princess.png', name: 'Slime Princess' },
  'tree-trunks': { file: 'A_Tree_Trunks.png', name: 'Tree Trunks' },
  cake: { file: 'A_Cake.png', name: 'Cake' },
  'peppermint-butler': { file: 'A_Peppermint_Butler.png', name: 'Peppermint Butler' },
};

export function avatarName(avatar) {
  return AVATAR_META[avatar]?.name || 'Avatar';
}

export function avatarSrc(avatar) {
  const file = AVATAR_META[avatar]?.file;
  return file ? `/avatars/${file}` : null;
}

/**
 * Badge koneksi global: muncul di SEMUA halaman (lobby, ruang tunggu, meja).
 * Konfirmasi baca-tulis ke server (bukan cuma socket terbuka).
 */
export function ConnectionBadge({ connection, onRetry, className = '' }) {
  const label = connection === 'connected'
    ? 'Online'
    : connection === 'connecting' ? 'Menyambung…' : 'Offline';
  const tone = connection === 'connected' ? 'is-online' : connection === 'connecting' ? 'is-connecting' : 'is-offline';
  return (
    <button
      type="button"
      className={`connection-badge ${tone} ${className}`}
      onClick={connection === 'connected' ? undefined : onRetry}
      disabled={connection === 'connected'}
      title={connection === 'connected' ? 'Tersambung ke server' : 'Klik untuk menyambung ulang'}
      aria-live="polite"
      aria-label={`Status koneksi: ${label}`}
    >
      <span className="connection-badge__dot" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

/** Titik status kecil untuk kursi pemain (online / offline / bot). */
export function PresenceDot({ online, bot = false, size = 10 }) {
  const tone = bot ? 'is-bot' : online ? 'is-online' : 'is-offline';
  return (
    <span
      className={`presence-dot ${tone}`}
      style={{ width: size, height: size }}
      title={bot ? 'Bot' : online ? 'Online' : 'Offline'}
      aria-label={bot ? 'Bot' : online ? 'online' : 'offline'}
      role="img"
    />
  );
}

export function AvatarArt({ avatar, size = 64 }) {
  const src = avatarSrc(avatar);
  return (
    <img
      src={src || '/avatars/A_Finn.png'}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      draggable={false}
      style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', imageRendering: 'pixelated' }}
    />
  );
}

/**
 * Round avatar chip used by the lobby pickers. The portrait itself is
 * decorative; the button carries the accessible label.
 */
/**
 * takenBy: nama pemain/bot yang sudah memakai avatar ini → tombol dikunci
 * (disabled) dan diberi label "sudah dipakai X". Satu avatar = satu pemain.
 */
export function AvatarArtButton({ avatar, size = 28, selected = false, disabled = false, takenBy = '', onClick, label }) {
  const displayName = avatarName(avatar);
  const base = `Pilih avatar ${displayName}`;
  const name = disabled
    ? `${displayName} (terkunci — sudah dipakai ${takenBy || 'pemain lain'})`
    : label || base;
  return (
    <button
      type="button"
      className={`relative w-full h-11 rounded-2xl flex items-center justify-center overflow-hidden border transition ${
        selected
          ? 'border-emeraldPrimary ring-2 ring-emeraldPrimary/40 bg-emeraldPrimary/10'
          : 'border-white/10 bg-[#15192E] hover:border-white/30 '
      } ${disabled ? 'opacity-35 grayscale cursor-not-allowed hover:border-white/10' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={name}
      title={name}
    >
      <img
        src={avatarSrc(avatar)}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        draggable={false}
        style={{ display: 'block', width: size, height: size, objectFit: 'cover', imageRendering: 'pixelated', borderRadius: 8 }}
      />
      {disabled && (
        <span className="absolute inset-0 flex items-center justify-center text-white/90" aria-hidden="true">
          <Icon.Lock size={12} />
        </span>
      )}
    </button>
  );
}
