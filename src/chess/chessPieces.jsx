import React from 'react';

/**
 * Bidak catur vektor SVG bergaya Staunton kontras tinggi.
 * Dirancang agar tajam di layar HP maupun desktop, dengan siluet jelas
 * baik untuk bidak Putih (#fdfaf2) maupun Hitam (#1e1b18 dengan rim terang).
 */

const PROMOTION_PIECES = [
  { type: 'q', label: 'Menteri' },
  { type: 'r', label: 'Benteng' },
  { type: 'b', label: 'Gajah' },
  { type: 'n', label: 'Kuda' },
];

export function ChessPieceSVG({ type = 'p', color = 'w', size = 40, className = '' }) {
  const isWhite = color === 'w';
  const fill = isWhite ? '#fcf8ee' : '#211e1a';
  const stroke = isWhite ? '#231f1b' : '#f5ebd6';
  const innerStroke = isWhite ? '#231f1b' : '#d8ccb4';
  const accent = isWhite ? '#e7dcc6' : '#3a342c';
  const kind = String(type || 'p').toLowerCase();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 45 45"
      className={className}
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', pointerEvents: 'none', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.42))' }}
    >
      {kind === 'p' && (
        <g fill={fill} stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22.5 9c-3.6 0-6.5 2.9-6.5 6.5 0 2.3 1.2 4.3 3 5.5-2.8 2.1-4.5 5.4-4.5 9.5h16c0-4.1-1.7-7.4-4.5-9.5 1.8-1.2 3-3.2 3-5.5 0-3.6-2.9-6.5-6.5-6.5z" />
          <path d="M11.5 34.5h22c.8 0 1.5.7 1.5 1.5v2H10v-2c0-.8.7-1.5 1.5-1.5z" fill={accent} />
          <line x1="15" y1="30.5" x2="30" y2="30.5" stroke={innerStroke} strokeWidth="1.6" />
        </g>
      )}

      {kind === 'r' && (
        <g fill={fill} stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 35h23v3H11z" fill={accent} />
          <path d="M13 31.5l1.5-14.5h16l1.5 14.5H13z" />
          <path d="M12 17h21v-6h-3.5v2.5h-3.5V11h-7v2.5H15.5V11H12v6z" />
          <line x1="14.5" y1="31.5" x2="30.5" y2="31.5" stroke={innerStroke} strokeWidth="1.6" />
        </g>
      )}

      {kind === 'n' && (
        <g fill={fill} stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 35h23v3H11z" fill={accent} />
          <path d="M15 32c.5-7 5.5-9.5 8-12-2.2.8-5.2.8-7.5-.5-.8-2.2 1.2-5.2 4.5-6.5V9.5l3.5 2.5c3.5-.5 7.5 2.2 8.5 7.5 1 5.2-.5 10.2-2.5 12.5H15z" />
          <circle cx="20.5" cy="15.5" r="1.3" fill={innerStroke} stroke="none" />
        </g>
      )}

      {kind === 'b' && (
        <g fill={fill} stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 35h23v3H11z" fill={accent} />
          <circle cx="22.5" cy="8.5" r="2.3" />
          <path d="M15 32c-1.5-5.5-.5-12.5 7.5-19.5 8 7 9 14 7.5 19.5H15z" />
          <line x1="19.5" y1="17.5" x2="25.5" y2="17.5" stroke={innerStroke} strokeWidth="1.8" />
          <line x1="22.5" y1="14.5" x2="22.5" y2="20.5" stroke={innerStroke} strokeWidth="1.8" />
          <line x1="15" y1="31.5" x2="30" y2="31.5" stroke={innerStroke} strokeWidth="1.6" />
        </g>
      )}

      {kind === 'q' && (
        <g fill={fill} stroke={stroke} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 35h23v3H11z" fill={accent} />
          <path d="M13 32L10 15l6.5 6.5L22.5 13l6 8.5L35 15l-3 17H13z" />
          <circle cx="10" cy="13" r="1.8" />
          <circle cx="16.2" cy="11" r="1.8" />
          <circle cx="22.5" cy="10" r="1.9" />
          <circle cx="28.8" cy="11" r="1.8" />
          <circle cx="35" cy="13" r="1.8" />
          <line x1="14" y1="31.5" x2="31" y2="31.5" stroke={innerStroke} strokeWidth="1.6" />
        </g>
      )}

      {kind === 'k' && (
        <g fill={fill} stroke={stroke} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
          <line x1="22.5" y1="5.5" x2="22.5" y2="11.5" stroke={stroke} strokeWidth="2.4" />
          <line x1="19.5" y1="8.2" x2="25.5" y2="8.2" stroke={stroke} strokeWidth="2.4" />
          <path d="M11 35h23v3H11z" fill={accent} />
          <path d="M13.5 32c-2.5-6.5-1.5-14.5 9-18.5 10.5 4 11.5 12 9 18.5h-18z" />
          <path d="M17.5 22c2.5-2 7.5-2 10 0" fill="none" stroke={innerStroke} strokeWidth="1.6" />
          <line x1="14" y1="31.5" x2="31" y2="31.5" stroke={innerStroke} strokeWidth="1.6" />
        </g>
      )}
    </svg>
  );
}

export function PromotionModal({ open, color = 'w', onSelect, onCancel }) {
  if (!open) return null;
  return (
    <div className="poker-overlay" role="dialog" aria-modal="true" aria-label="Pilih bidak promosi pion" onClick={onCancel}>
      <div className="poker-panel" style={{ maxWidth: 340 }} onClick={event => event.stopPropagation()}>
        <div className="poker-panel__title">Promosi Pion</div>
        <div className="poker-note" style={{ marginBottom: 10 }}>
          Pion mencapai baris ujung! Pilih bidak pengganti:
        </div>
        <div className="chess-promo-grid">
          {PROMOTION_PIECES.map(item => (
            <button
              key={item.type}
              type="button"
              className="chess-promo-btn"
              onClick={() => onSelect(item.type)}
            >
              <ChessPieceSVG type={item.type} color={color} size={44} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
