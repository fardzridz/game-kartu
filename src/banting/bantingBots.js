/**
 * Bot Poker Banting.
 *
 * Strategi sederhana tapi tidak bodoh:
 *  - Saat membuka ronde: buang kombinasi dengan nilai terendah (kartu kecil
 *    keluar dulu), dan kalau nilainya sama, pilih yang memuat lebih banyak
 *    kartu supaya tangan cepat ringan.
 *  - Saat menimpa: pilih kombinasi **paling murah** yang masih menang, supaya
 *    kartu besar tetap disimpan untuk belakangan.
 *  - Tidak pernah membuang kartu 2 (tertinggi) selama masih ada pilihan lain.
 */
import { canBeat, describeCombo, rankValue, sortCards } from './hands.js';

/** Semua kombinasi sah berukuran `size` dari sebuah tangan. */
export function allCombos(hand = [], size) {
  const cards = sortCards(hand);
  const out = [];
  if (size === 1) {
    for (const card of cards) out.push([card]);
    return out;
  }

  const byRank = new Map();
  for (const card of cards) {
    const rank = rankValue(card.value);
    if (!byRank.has(rank)) byRank.set(rank, []);
    byRank.get(rank).push(card);
  }

  if (size === 2) {
    for (const group of byRank.values()) {
      if (group.length >= 2) {
        for (let i = 0; i < group.length; i += 1) {
          for (let j = i + 1; j < group.length; j += 1) out.push([group[i], group[j]]);
        }
      }
    }
    return out;
  }

  if (size === 3) {
    for (const group of byRank.values()) {
      if (group.length >= 3) out.push(group.slice(0, 3));
    }
    return out;
  }

  if (size === 4) {
    // Empat sejenis.
    for (const group of byRank.values()) {
      if (group.length >= 4) out.push(group.slice(0, 4));
    }
    // Dua pasang.
    const ranks = [...byRank.keys()].sort((a, b) => a - b);
    for (let i = 0; i < ranks.length; i += 1) {
      for (let j = i + 1; j < ranks.length; j += 1) {
        const first = byRank.get(ranks[i]);
        const second = byRank.get(ranks[j]);
        if (first.length >= 2 && second.length >= 2) {
          out.push([first[0], first[1], second[0], second[1]]);
        }
      }
    }
    return out;
  }

  // Lima kartu: cukup enumerasi kombinasi 5 dari tangan (maks ~20 kartu).
  const n = cards.length;
  if (n < 5) return out;
  const combo = [];
  const walk = (start, depth) => {
    if (depth === 5) {
      const parsed = describeCombo(combo);
      if (parsed) out.push(combo.slice());
      return;
    }
    for (let i = start; i <= n - (5 - depth); i += 1) {
      combo[depth] = cards[i];
      walk(i + 1, depth + 1);
    }
  };
  walk(0, 0);
  return out;
}

function cheapest(list) {
  let best = null;
  for (const entry of list) {
    const parsed = describeCombo(entry);
    if (!parsed) continue;
    if (!best) {
      best = { cards: entry, combo: parsed };
      continue;
    }
    const score = parsed.power * 1000 + parsed.top * 10 - parsed.size * 2;
    const bestScore = best.combo.power * 1000 + best.combo.top * 10 - best.combo.size * 2;
    if (score < bestScore) best = { cards: entry, combo: parsed };
  }
  return best;
}

export function botDecision(room, seatIndex) {
  const hand = room?.hand;
  if (!hand || room.status !== 'playing') return null;
  const player = (hand.players || []).find(item => item.seat === seatIndex);
  if (!player || player.finished) return null;
  if (hand.turnSeat !== seatIndex) return null;

  const options = { fiveAnyCategory: room.settings?.fiveAnyCategory !== false };
  const last = hand.lastPlay;

  if (last) {
    const sizes = new Set([last.combo.size]);
    // Empat sejenis boleh menimpa kombinasi 5 kartu, dan straight flush /
    // royal flush boleh menimpa empat sejenis.
    if (last.combo.size === 5) sizes.add(4);
    if (last.combo.size === 4) sizes.add(5);
    const candidates = [...sizes]
      .flatMap(size => allCombos(player.hand, size))
      .filter(cards => canBeat(describeCombo(cards), last.combo, options).ok);
    if (!candidates.length) return { type: 'skip' };
    // Hindari membuang kartu 2 kalau masih ada alternatif.
    const withoutDeuce = candidates.filter(cards => describeCombo(cards).top < 15);
    const pick = cheapest(withoutDeuce.length ? withoutDeuce : candidates);
    if (!pick) return { type: 'skip' };
    return { type: 'play', cards: pick.cards.map(card => card.uid) };
  }

  // Membuka ronde: kumpulkan opsi dari semua ukuran, pilih yang paling murah.
  const pool = [
    ...allCombos(player.hand, 1),
    ...allCombos(player.hand, 2),
    ...allCombos(player.hand, 3),
    ...allCombos(player.hand, 4),
    ...allCombos(player.hand, 5),
  ];
  const safe = pool.filter(cards => describeCombo(cards)?.top < 15);
  const pick = cheapest(safe.length ? safe : pool);
  if (!pick) {
    // Tidak ada kombinasi sah (praktis mustahil): buang kartu terendah.
    const lowest = sortCards(player.hand).at(-1);
    return lowest ? { type: 'play', cards: [lowest.uid] } : null;
  }
  return { type: 'play', cards: pick.cards.map(card => card.uid) };
}

export default botDecision;
