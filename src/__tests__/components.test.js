import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import CardSVG from '../components/CardSVG.jsx';
import { getCardAssetPath, getCardLabel } from '../utils/cardAssets.js';

describe('CardSVG rendering & asset mapping', () => {
  it('renders card back with custom card_back.svg asset', () => {
    const html = renderToString(React.createElement(CardSVG, { back: true }));
    expect(html).toContain('src="/cards/card_back.svg"');
    expect(html).toContain('alt="Punggung Kartu"');
  });

  it('renders Ace with ace_of_{suit}.svg asset', () => {
    const html = renderToString(React.createElement(CardSVG, { card: { value: 'A', suit: '♠', kind: 'standard' } }));
    expect(html).toContain('src="/cards/ace_of_spades.svg"');
    expect(html).toContain('alt="Kartu As Sekop"');
  });

  it('renders Court cards for Jack, Queen, and King with correct SVG paths', () => {
    const tests = [
      { value: 'J', suit: '♥', expected: '/cards/jack_of_hearts.svg', label: 'Kartu Jack Hati' },
      { value: 'Q', suit: '♣', expected: '/cards/queen_of_clubs.svg', label: 'Kartu Queen Keriting' },
      { value: 'K', suit: '♦', expected: '/cards/king_of_diamonds.svg', label: 'Kartu King Wajik' },
    ];
    for (const { value, suit, expected, label } of tests) {
      const html = renderToString(React.createElement(CardSVG, { card: { value, suit, kind: 'standard' } }));
      expect(html).toContain(`src="${expected}"`);
      expect(html).toContain(`alt="${label}"`);
    }
  });

  it('renders Joker with red_joker.svg or black_joker.svg', () => {
    const redJoker = renderToString(React.createElement(CardSVG, { card: { value: 'JOKER', suit: '♥', kind: 'joker' } }));
    expect(redJoker).toContain('src="/cards/red_joker.svg"');

    const blackJoker = renderToString(React.createElement(CardSVG, { card: { value: 'JOKER', suit: '♠', uid: '0-joker-1', kind: 'joker' } }));
    expect(blackJoker).toContain('src="/cards/black_joker.svg"');
  });

  it('renders number cards 2 through 10 with exact SVG paths', () => {
    for (const num of [2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const html = renderToString(React.createElement(CardSVG, { card: { value: num, suit: '♦', kind: 'standard' } }));
      expect(html).toContain(`src="/cards/${num}_of_diamonds.svg"`);
      expect(html).toContain(`alt="Kartu ${num} Wajik"`);
    }
  });

  it('verifies helper functions getCardAssetPath and getCardLabel', () => {
    expect(getCardAssetPath(null, true)).toBe('/cards/card_back.svg');
    expect(getCardAssetPath({ value: '10', suit: '♣' })).toBe('/cards/10_of_clubs.svg');
    expect(getCardLabel({ value: '10', suit: '♣' })).toBe('Kartu 10 Keriting');
  });
});
