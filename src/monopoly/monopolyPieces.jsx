import React from 'react';

/**
 * Komponen Vektor SVG untuk Dadu 3D, Rumah Hijau, Hotel Merah, dan Landmark Monopoli.
 */

export function DiceSVG({ value = 1, size = 38, isDouble = false }) {
  const pips = {
    1: [[50, 50]],
    2: [[28, 28], [72, 72]],
    3: [[28, 28], [50, 50], [72, 72]],
    4: [[28, 28], [28, 72], [72, 28], [72, 72]],
    5: [[28, 28], [28, 72], [50, 50], [72, 28], [72, 72]],
    6: [[28, 28], [28, 50], [28, 72], [72, 28], [72, 50], [72, 72]],
  };

  const coords = pips[value] || pips[1];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      style={{
        display: 'inline-block',
        filter: isDouble ? 'drop-shadow(0 0 8px #f5a623)' : 'drop-shadow(0 3px 6px rgba(0,0,0,0.5))',
      }}
    >
      <rect
        x="6"
        y="6"
        width="88"
        height="88"
        rx="18"
        fill="#fdfbf7"
        stroke={isDouble ? '#f5a623' : '#d8d2c4'}
        strokeWidth="6"
      />
      {coords.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="10" fill="#1e1b18" />
      ))}
    </svg>
  );
}

export function HouseSVG({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3L2 12h3v9h14v-9h3L12 3z" fill="#22c55e" stroke="#15803d" strokeWidth="1.8" strokeLinejoin="round" />
      <rect x="9" y="13" width="6" height="8" fill="#166534" />
    </svg>
  );
}

export function HotelSVG({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="17" rx="2" fill="#ef4444" stroke="#991b1b" strokeWidth="1.8" />
      <path d="M12 1L4 4h16l-8-3z" fill="#f5a623" />
      <rect x="6" y="7" width="3" height="3" fill="#fef08a" />
      <rect x="15" y="7" width="3" height="3" fill="#fef08a" />
      <rect x="6" y="12" width="3" height="3" fill="#fef08a" />
      <rect x="15" y="12" width="3" height="3" fill="#fef08a" />
      <rect x="10" y="15" width="4" height="6" fill="#7f1d1d" />
    </svg>
  );
}
