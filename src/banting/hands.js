/**
 * Kombinasi & perbandingan kartu untuk **Poker Banting** (Capsa / Big Two).
 *
 * Aturan yang dipakai (sesuai kesepakatan meja):
 *  - Urutan nilai: **2 paling tinggi**, lalu A, K, Q, J, 10 … 3 paling rendah.
 *  - Kembang: ♠ > ♥ > ♣ > ♦. Dipakai untuk menentukan pembuka game baru
 *    (pemegang kartu 3 terbanyak) — BUKAN untuk menimpa: nilai sama tetap
 *    tidak bisa menimpa, harus benar-benar lebih tinggi.
 *  - Kombinasi sah: 1 kartu, pasang (2), tiga sejenis (3), dua pasang (4),
 *    empat sejenis (4 kartu), dan lima kartu (straight, flush, full house,
 *    straight flush, royal flush).
 *  - Kekuatan: tunggal < pasang < tiga sejenis < dua pasang < straight < flush
 *    < full house < empat sejenis < straight flush < royal flush.
 *  - Empat sejenis (4 kartu) boleh menimpa kombinasi 5 kartu, tapi dua pasang
 *    hanya bisa dilawan dua pasang.
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

/**
 * Kekuatan kombinasi dari terlemah ke terkuat (aturan meja):
 *
 *   tunggal < pasang < tiga sejenis < dua pasang < straight < flush
 *   < full house < EMPAT SEJENIS < straight flush < royal flush
 *
 * Catatan penting:
 *  - Empat sejenis dimainkan sebagai **4 kartu** dan boleh menimpa kombinasi
 *    5 kartu (straight/flush/full house), tapi TIDAK boleh menimpa dua pasang.
 *  - Dua pasang hanya bisa dilawan dua pasang.
 *  - Lima kartu yang isinya 4 kartu sama + 1 bebas tidak sah.
 */
export const COMBO_POWER = {
  single: 100,
  pair: 200,
  trips: 300,
  'two-pair': 400,
  straight: 500,
  flush: 600,
  'full-house': 700,
  quads: 800,
  'straight-flush': 900,
  royal: 1000,
};

export const COMBO_POWER_ORDER = [
  'single', 'pair', 'trips', 'two-pair', 'straight', 'flush',
  'full-house', 'quads', 'straight-flush', 'royal',
];

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

const combo = (type, size, key, label) => ({
  type,
  size,
  key,
  top: key[0],
  power: COMBO_POWER[type],
  label: label || COMBO_NAME[type],
});

/**
 * @returns {{type:string, size:number, key:number[], power:number, label:string, top:number}|null}
 */
export function describeCombo(cards = []) {
  const size = cards.length;
  if (!size || size > 5) return null;
  const ranks = cards.map(card => rankValue(card.value)).sort((a, b) => b - a);
  const sameSuit = cards.every(card => card.suit === cards[0].suit);
  const groups = new Map();
  for (const card of cards) {
    const rank = rankValue(card.value);
    groups.set(rank, (groups.get(rank) || 0) + 1);
  }
  const byCount = [...groups.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  // Kembang TIDAK dipakai untuk menimpa: nilai sama berarti tidak bisa.
  if (size === 1) return combo('single', size, [ranks[0]]);

  if (size === 2) {
    if (byCount.length !== 1) return null;
    return combo('pair', size, [ranks[0]]);
  }

  if (size === 3) {
    // Hanya tiga sejenis — kembang boleh apa saja.
    if (byCount.length !== 1) return null;
    return combo('trips', size, [ranks[0]]);
  }

  if (size === 4) {
    // Empat kartu nominal sama = empat sejenis.
    if (byCount.length === 1) return combo('quads', size, [ranks[0]]);
    // Dua pasang.
    if (byCount.length === 2 && byCount[0][1] === 2 && byCount[1][1] === 2) {
      const high = Math.max(byCount[0][0], byCount[1][0]);
      const low = Math.min(byCount[0][0], byCount[1][0]);
      return combo('two-pair', size, [high, low]);
    }
    return null;
  }

  // Lima kartu: straight, flush, full house, straight flush, royal flush.
  // Empat sejenis + 1 kartu bebas TIDAK sah (empat sejenis harus tepat 4 kartu).
  if (byCount[0][1] === 4) return null;

  const straightTop = isConsecutive(ranks);
  const isFlush = sameSuit;

  if (straightTop && isFlush) {
    const royal = straightTop === 14 && !ranks.includes(15) && ranks.includes(11);
    return royal
      ? combo('royal', size, [straightTop])
      : combo('straight-flush', size, [straightTop]);
  }
  if (byCount[0][1] === 3 && byCount[1][1] === 2) {
    return combo('full-house', size, [byCount[0][0], byCount[1][0]]);
  }
  if (isFlush) return combo('flush', size, [...ranks]);
  if (straightTop) return combo('straight', size, [straightTop]);
  return null;
}

/** -1 / 0 / 1 untuk dua kombinasi yang sebanding. */
export function compareCombos(a, b) {
  const length = Math.max(a.key.length, b.key.length);
  for (let i = 0; i < length; i += 1) {
    const left = a.key[i] || 0;
    const right = b.key[i] || 0;
    if (left !== right) return left > right ? 1 : -1;
  }
  return 0;
}

const isQuads = item => Boolean(item) && item.type === 'quads';
const isFiveCard = item => Boolean(item) && item.size === 5;
const isTwoPair = item => Boolean(item) && item.type === 'two-pair';

/** Jumlah kartu boleh beda hanya pada empat sejenis vs kombinasi 5 kartu. */
function sizeCompatible(candidate, last) {
  if (candidate.size === last.size) return true;
  return (isQuads(candidate) && isFiveCard(last)) || (isFiveCard(candidate) && isQuads(last));
}

/**
 * Boleh tidak `candidate` menimpa `last`?
 *
 * @param {object} candidate hasil describeCombo
 * @param {object} last      kombinasi terakhir di meja
 * @param {{ fiveAnyCategory?: boolean }} options
 *   `fiveAnyCategory` (default true) = lima kartu jenis apa pun boleh saling
 *   menimpa selama kategorinya lebih tinggi (flush menimpa straight, dst).
 * @returns {{ok:boolean, reason?:string}}
 */
export function canBeat(candidate, last, options = {}) {
  if (!candidate) return { ok: false, reason: 'Kombinasi tidak sah.' };
  if (!last) return { ok: true };

  if (!sizeCompatible(candidate, last)) {
    if (isQuads(last)) return { ok: false, reason: 'Empat sejenis hanya bisa dilawan empat sejenis lebih tinggi, straight flush, atau royal flush.' };
    if (isFiveCard(last)) return { ok: false, reason: `Harus ${last.size} kartu, atau empat sejenis / straight flush / royal flush.` };
    return { ok: false, reason: `Jumlah kartu harus sama (${last.size} kartu).` };
  }

  // Dua pasang hanya bisa dilawan dua pasang.
  if (isTwoPair(last) || isTwoPair(candidate)) {
    if (!(isTwoPair(last) && isTwoPair(candidate))) {
      return { ok: false, reason: 'Dua pasang hanya bisa dilawan dua pasang.' };
    }
    if (compareCombos(candidate, last) > 0) return { ok: true };
    return { ok: false, reason: 'Dua pasang harus punya pasangan yang lebih tinggi.' };
  }

  // Lima kartu vs lima kartu.
  if (isFiveCard(candidate) && isFiveCard(last)) {
    if (options.fiveAnyCategory !== false) {
      // Aturan Capsa: kategori lebih tinggi boleh menimpa (flush > straight).
      if (candidate.power > last.power) return { ok: true };
      if (candidate.power < last.power) return { ok: false, reason: `Kalah kategori dari ${last.label}.` };
      if (compareCombos(candidate, last) > 0) return { ok: true };
      return { ok: false, reason: `Harus lebih tinggi dari ${last.label}.` };
    }
    // Setelan meja "wajib jenis sama".
    if (candidate.type !== last.type) return { ok: false, reason: `Harus jenis yang sama (${last.label}).` };
    if (compareCombos(candidate, last) > 0) return { ok: true };
    return { ok: false, reason: `Harus lebih tinggi dari ${last.label}.` };
  }

  if (candidate.power > last.power) return { ok: true };
  if (candidate.power < last.power) return { ok: false, reason: `Kalah dari ${last.label}.` };
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

/**
 * Berapa set kartu yang dipakai untuk jumlah pemain tertentu.
 * Aturan meja: 1 set untuk 4 pemain; tiap kelipatan 4 berikutnya menambah
 * 1 set (5–8 pemain = 2 set, dst).
 */
export function deckSetsFor(seatCount, mode = 'auto') {
  if (mode === '1') return 1;
  if (mode === '2') return 2;
  return Math.max(1, Math.ceil(Math.max(1, seatCount) / 4));
}
