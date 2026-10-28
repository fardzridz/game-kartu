import React from 'react';
import { getCardAssetPath, getCardLabel } from '../utils/cardAssets.js';

/**
 * CardAsset — satu-satunya renderer kartu di arena.
 * Memakai aset SVG resmi /cards/*.svg (dist/cards): index, pip, court art dan
 * punggung kartu sudah digambar di aset, jadi UI tidak pernah menggambar ulang
 * angka/karakter dengan cara sendiri.
 *
 * variant mengatur ukuran lewat CSS custom properties (.card-asset--*):
 *   hand    — kartu tangan besar
 *   table   — kartu meja / buangan
 *   mini    — kartu kombinasi (turun ke meja, riwayat)
 */
export default function CardAsset({ card, back = false, variant = 'table', dimmed = false, glow = false, className = '', style = {} }) {
  const src = getCardAssetPath(card, back);
  const label = getCardLabel(card, back);

  return (
    <span
      className={`card-asset card-asset--${variant} ${glow ? 'card-asset--glow' : ''} ${dimmed ? 'card-asset--dim' : ''} ${className}`}
      style={style}
    >
      <img
        src={src}
        alt={label}
        className="card-asset__img"
        draggable={false}
        loading="eager"
        decoding="async"
      />
    </span>
  );
}
