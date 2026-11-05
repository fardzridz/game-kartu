/**
 * Contekan peringkat kombinasi untuk panel "PERINGKAT" di meja Poker Banting.
 * Urut dari terkuat ke terlemah, sesuai aturan meja (2 paling tinggi).
 */

export const COMBO_RANKING = [
  {
    rank: 1,
    name: 'Royal Flush',
    desc: 'A-K-Q-J-10 satu kembang. Tidak bisa dikalahkan (paling banyak seri).',
    example: ['A♠', 'K♠', 'Q♠', 'J♠', '10♠'],
  },
  {
    rank: 2,
    name: 'Straight Flush',
    desc: 'Lima kartu berurutan satu kembang. Kalah dari Royal Flush saja.',
    example: ['9♥', '8♥', '7♥', '6♥', '5♥'],
  },
  {
    rank: 3,
    name: 'Empat Sejenis',
    desc: 'Empat kartu angka sama plus satu kartu penentu (kicker).',
    example: ['K♠', 'K♥', 'K♦', 'K♣', '7♠'],
  },
  {
    rank: 4,
    name: 'Full House',
    desc: 'Tiga sejenis ditambah sepasang. Dinilai dari trio lebih dulu.',
    example: ['Q♠', 'Q♥', 'Q♦', '8♣', '8♠'],
  },
  {
    rank: 5,
    name: 'Flush',
    desc: 'Lima kartu satu kembang, tidak berurutan. Dibandingkan dari kartu tertinggi.',
    example: ['A♥', 'J♥', '8♥', '5♥', '2♥'],
  },
  {
    rank: 6,
    name: 'Straight',
    desc: 'Lima kartu berurutan beda kembang. Di Capsa, J-Q-K-A-2 adalah yang tertinggi.',
    example: ['9♣', '8♦', '7♠', '6♥', '5♣'],
  },
  {
    rank: 7,
    name: 'Tiga Sejenis',
    desc: 'Tiga kartu angka sama plus dua kicker.',
    example: ['7♠', '7♥', '7♦', 'K♣', '4♠'],
  },
  {
    rank: 8,
    name: 'Dua Pasang',
    desc: 'Dua pasang berbeda plus satu kicker. Pasangan tertinggi menentukan.',
    example: ['J♠', 'J♥', '4♦', '4♣', 'A♠'],
  },
  {
    rank: 9,
    name: 'Satu Pasang',
    desc: 'Sepasang kartu sama plus tiga kicker.',
    example: ['10♠', '10♥', 'A♦', '7♣', '3♠'],
  },
  {
    rank: 10,
    name: 'Kartu Tunggal',
    desc: 'Satu kartu saja. Nilai tertinggi menang; kalau sama, kembang menentukan (♠ > ♥ > ♣ > ♦).',
    example: ['A♠'],
  },
];

export function cardFromNotation(text) {
  const suit = text.slice(-1);
  const value = text.slice(0, -1);
  return { uid: `${value}${suit}-ref`, suit, value, kind: 'standard' };
}
