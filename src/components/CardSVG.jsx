import React from 'react';
import { getCardAssetPath, getCardLabel } from '../utils/cardAssets.js';

/**
 * CardSVG: Component for rendering playing cards from high-definition SVG vector assets.
 * Uses exact SVG card assets from /cards/ matching Durak Arena pro styling.
 */
export function CardSVG({ card, back = false, className = '', style = {}, onClick, alt }) {
  const assetPath = getCardAssetPath(card, back);
  const label = alt || getCardLabel(card, back);

  return (
    <img
      src={assetPath}
      alt={label}
      className={`playing-card select-none ${className}`}
      style={{
        aspectRatio: '167.0869141 / 242.6669922',
        display: 'block',
        maxWidth: '100%',
        height: 'auto',
        objectFit: 'contain',
        ...style,
      }}
      draggable={false}
      onClick={onClick}
      loading="eager"
      decoding="async"
    />
  );
}

export default CardSVG;
