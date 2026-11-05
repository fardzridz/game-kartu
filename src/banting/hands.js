/**
 * Kombinasi & perbandingan kartu untuk **Poker Banting** (Capsa / Big Two).
 *
 * Aturan yang dipakai (sesuai kesepakatan meja):
 *  - Urutan nilai: **2 paling tinggi**, lalu A, K, Q, J, 10 … 3 paling rendah.
 *  - Kembang: ♠ > ♥ > ♣ > ♦ (dipakai untuk kartu tunggal dan penentu terakhir).
 *  - Kombinasi sah: 1 kartu, pair (2), tiga sejenis (3), dua pasang (4), dan
 *    lima kartu (straight, flush, full house, empat sejenis, straight flush /
 *    royal flush).
 *  - Menimpa: jumlah kartu harus sama, nilainya **harus lebih tinggi**
 *    (nilai sama tidak boleh — pair 9 tidak bisa dilawan pair 9).
 */

export const SUITS = ['♠', '♥', '♣', '♦'];
export const SUIT_VALUE = { '♠': 4, '♥': 3, '♣': 2, '♦': 1 };
export const SUIT_NAME = { '♠': 'Sekop', '♥': 'Hati', '♣': 'Keriting', '♦': 'Wajik' };

/** 2 = 15 (tertinggi), A = 14, K = 13, … 3 = 3. */
export function rankValue(value) {
  const text = String(value).toUpperCase();
  if (text === '2') return 15;
  if (text === 'A') return 14;
  if (text === 'K') return 13;
  if (text === 'Q') return 12;
  if (text === 'J') return 11;
  const number = Number(text);
  return Number.isFinite(number) ? number : 0;
}

export function suitValue(suit) {
  return SUIT_VALUE[suit] || 0;
}

/** Nilai total satu kartu (untuk sortir tangan). */
export function cardScore(card) {
  return rankValue(card.value) * 10 + suitValue(card.suit);
}

export function sortCards(cards = []) {
  return [...cards].sort((a, b) => cardScore(b) - cardScore(a));
}

export function cardLabel(card) {
  return `${card.value}${card.suit}`;
}

export function comboLabel(cards = []) {
  return sortCards(cards).map(cardLabel).join(' ');
}

// ---------------------------------------------------------------------------
// Deteksi kombinasi
// ---------------------------------------------------------------------------

export const COMBO_NAME = {
  single: 'Kartu Tunggal',
  pair: 'Satu Pasang',
  trips: 'Tiga Sejenis',
  'two-pair': 'Dua Pasang',
  straight: 'Straight',
  flush: 'Flush',
  'full-house': 'Full House',
  quads: 'Empat Sejenis',
  'straight-flush': 'Straight Flush',
  royal: 'Royal Flush',
};

/** Urutan kategori 5 kartu dari terlemah ke terkuat. */
export const FIVE_CATEGORY = ['straight', 'flush', 'full-house', 'quads', 'straight-flush'];

function isConsecutive(values = []) {
  // Urutan straight mengikuti nilai Capsa: 3-4-5-6-7 (terendah) sampai
  // J-Q-K-A-2 (tertinggi). Tidak ada putaran A-2-3-4-5.
  const unique = [...new Set(values)].sort((a, b) => a - b);
  if (unique.length !== 5) return 0;
  for (let i = 1; i < 5; i += 1) {
    if (unique[i] - unique[i - 1] !== 1) return 0;
  }
  return unique[4];
}

/**
 * @returns {{type:string, size:number, key:number[], label:string, top:number}|null}
 */
export function describeCombo(cards = []) {
  const size = cards.length;
  if (!size || size > 5) return null;
  const ranks = cards.map(card => rankValue(card.value)).sort((a, b) => b - a);
  const suits = cards.map(card => suitValue(card.suit));
  const sameSuit = cards.every(card => card.suit === cards[0].suit);
  const groups = new Map();
  for (const card of cards) {
    const rank = rankValue(card.value);
    groups.set(rank, (groups.get(rank) || 0) + 1);
  }
  const byCount = [...groups.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  if (size === 1) {
    return {
      type: 'single',
      size,
      key: [ranks[0], suits[0]],
      top: ranks[0],
      label: COMBO_NAME.single,
    };
  }

  if (size === 2) {
    if (byCount.length !== 1) return null;
    return { type: 'pair', size, key: [ranks[0]], top: ranks[0], label: COMBO_NAME.pair };
  }

  if (size === 3) {
    if (byCount.length !== 1) return null;
    return { type: 'trips', size, key: [ranks[0]], top: ranks[0], label: COMBO_NAME.trips };
  }

  if (size === 4) {
    // Hanya dua pasang (4 kartu sejenis tidak sah sebagai kombinasi).
    if (byCount.length !== 2 || byCount[0][1] !== 2 || byCount[1][1] !== 2) return null;
    const high = Math.max(byCount[0][0], byCount[1][0]);
    const low = Math.min(byCount[0][0], byCount[1][0]);
    return { type: 'two-pair', size, key: [high, low], top: high, label: COMBO_NAME['two-pair'] };
  }

  // Lima kartu.
  const straightTop = isConsecutive(ranks);
  const isFlush = sameSuit;
  const maxSuit = Math.max(...suits);

  if (straightTop && isFlush) {
    const royal = straightTop === 14 && ranks.includes(15) === false && ranks.includes(11);
    const type = royal ? 'royal' : 'straight-flush';
    return {
      type,
      size,
      key: [straightTop, maxSuit],
      top: straightTop,
      label: royal ? COMBO_NAME.royal : COMBO_NAME['straight-flush'],
    };
  }
  if (byCount[0][1] === 4) {
    return {
      type: 'quads',
      size,
      key: [byCount[0][0], byCount[1][0]],
      top: byCount[0][0],
      label: COMBO_NAME.quads,
    };
  }
  if (byCount[0][1] === 3 && byCount[1][1] === 2) {
    return {
      type: 'full-house',
      size,
      key: [byCount[0][0], byCount[1][0]],
      top: byCount[0][0],
      label: COMBO_NAME['full-house'],
    };
  }
  if (isFlush) {
    return { type: 'flush', size, key: [...ranks, maxSuit], top: ranks[0], label: COMBO_NAME.flush };
  }
  if (straightTop) {
    return { type: 'straight', size, key: [straightTop], top: straightTop, label: COMBO_NAME.straight };
  }
  return null;
}

/** -1 / 0 / 1 untuk dua kombinasi yang sebanding (ukuran & jenis sama). */
export function compareCombos(a, b) {
  const length = Math.max(a.key.length, b.key.length);
  for (let i = 0; i < length; i += 1) {
    const left = a.key[i] || 0;
    const right = b.key[i] || 0;
    if (left !== right) return left > right ? 1 : -1;
  }
  return 0;
}

const categoryRank = type => {
  if (type === 'royal') return FIVE_CATEGORY.length + 1;
  const index = FIVE_CATEGORY.indexOf(type);
  return index < 0 ? -1 : index;
};

/**
 * Boleh tidak `candidate` menimpa `last`?
 *
 * @param {object} candidate hasil describeCombo
 * @param {object} last      kombinasi terakhir di meja
 * @param {{ fiveAnyCategory?: boolean }} options
 *   `fiveAnyCategory` (default true) = aturan Capsa: lima kartu jenis apa pun
 *   boleh saling menimpa selama kategorinya lebih tinggi (flush menimpa
 *   straight, full house menimpa flush, dst).
 * @returns {{ok:boolean, reason?:string}}
 */
export function canBeat(candidate, last, options = {}) {
  if (!candidate) return { ok: false, reason: 'Kombinasi tidak sah.' };
  if (!last) return { ok: true };
  if (candidate.size !== last.size) {
    return { ok: false, reason: `Jumlah kartu harus sama (${last.size} kartu).` };
  }
  if (candidate.size === 5 && options.fiveAnyCategory !== false) {
    const mine = categoryRank(candidate.type);
    const theirs = categoryRank(last.type);
    if (mine > theirs) return { ok: true };
    if (mine < theirs) return { ok: false, reason: `Kalah kategori dari ${last.label}.` };
    const compared = compareCombos(candidate, last);
    if (compared > 0) return { ok: true };
    return { ok: false, reason: `Harus lebih tinggi dari ${last.label}.` };
  }
  if (candidate.type !== last.type) {
    return { ok: false, reason: `Harus jenis yang sama (${last.label}).` };
  }
  if (compareCombos(candidate, last) > 0) return { ok: true };
  return { ok: false, reason: `Harus lebih tinggi dari ${last.label}.` };
}

// ---------------------------------------------------------------------------
// Dek
// ---------------------------------------------------------------------------

const VALUES = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];

export function createDeck(sets = 1) {
  const cards = [];
  for (let set = 0; set < sets; set += 1) {
    for (const suit of SUITS) {
      for (const value of VALUES) {
        cards.push({ uid: `${value}${suit}#${set}`, suit, value, kind: 'standard' });
      }
    }
  }
  return cards;
}

/** Berapa set kartu yang dipakai untuk jumlah pemain tertentu. */
export function deckSetsFor(seatCount, mode = 'auto') {
  if (mode === '1') return 1;
  if (mode === '2') return 2;
  return seatCount >= 5 ? 2 : 1;
}
