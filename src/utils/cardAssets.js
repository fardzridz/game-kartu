/**
 * Card Asset Resolver & Preloader
 * Maps Remi card objects to SVG files in /cards/
 */

const SUIT_MAP = {
  '♠': 'spades',
  '♥': 'hearts',
  '♦': 'diamonds',
  '♣': 'clubs',
  'spade': 'spades',
  'spades': 'spades',
  'heart': 'hearts',
  'hearts': 'hearts',
  'diamond': 'diamonds',
  'diamonds': 'diamonds',
  'club': 'clubs',
  'clubs': 'clubs',
};

const SUIT_NAMES = {
  'spades': 'Sekop',
  'hearts': 'Hati',
  'diamonds': 'Wajik',
  'clubs': 'Keriting',
};

const RANK_MAP = {
  'A': 'ace',
  '1': 'ace',
  'J': 'jack',
  'Q': 'queen',
  'K': 'king',
};

const RANK_NAMES = {
  'ace': 'As',
  'jack': 'Jack',
  'queen': 'Queen',
  'king': 'King',
};

export function getCardAssetPath(card, back = false) {
  if (back || !card) {
    return '/cards/card_back.svg';
  }

  const isJoker = card.kind === 'joker' || card.value === 'JOKER';
  if (isJoker) {
    // Alternasikan joker merah dan hitam
    const uidStr = String(card.uid || '');
    const isRed = uidStr.endsWith('0') || uidStr.endsWith('2') || card.suit === '♥' || card.suit === '♦';
    return isRed ? '/cards/red_joker.svg' : '/cards/black_joker.svg';
  }

  const rawRank = String(card.value || 'A').toUpperCase();
  const rank = RANK_MAP[rawRank] || rawRank;

  const rawSuit = String(card.suit || '♠').toLowerCase();
  const suit = SUIT_MAP[rawSuit] || SUIT_MAP[card.suit] || 'spades';

  return `/cards/${rank}_of_${suit}.svg`;
}

export function getCardLabel(card, back = false) {
  if (back || !card) return 'Punggung Kartu';
  if (card.kind === 'joker' || card.value === 'JOKER') {
    const path = getCardAssetPath(card);
    return path.includes('red') ? 'Kartu Joker Merah' : 'Kartu Joker Hitam';
  }
  const rawRank = String(card.value || 'A').toUpperCase();
  const rank = RANK_MAP[rawRank] || rawRank;
  const rankName = RANK_NAMES[rank] || rank;
  const suit = SUIT_MAP[card.suit] || 'spades';
  const suitName = SUIT_NAMES[suit] || suit;
  return `Kartu ${rankName} ${suitName}`;
}

const ALL_RANKS = ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'];
const ALL_SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];

export const ALL_CARD_PATHS = [
  '/cards/card_back.svg',
  '/cards/red_joker.svg',
  '/cards/black_joker.svg',
  ...ALL_SUITS.flatMap(suit => ALL_RANKS.map(rank => `/cards/${rank}_of_${suit}.svg`)),
];

let preloaded = false;
export function preloadCardImages() {
  if (preloaded || typeof window === 'undefined') return;
  preloaded = true;
  ALL_CARD_PATHS.forEach(src => {
    const img = new Image();
    img.src = src;
  });
}
