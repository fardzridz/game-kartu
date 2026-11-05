/**
 * Contekan peringkat kombinasi untuk panel "PERINGKAT" di meja Poker Banting.
 * Urut dari terkuat ke terlemah, sesuai aturan meja (2 paling tinggi).
 *
 * Catatan aturan:
 *  - Empat sejenis dimainkan sebagai 4 kartu (bukan 5) dan boleh menimpa
 *    straight/flush/full house.
 *  - Dua pasang hanya bisa dilawan dua pasang.
 */

export const COMBO_RANKING = [
  {
    rank: 1,
    name: 'Royal Flush',
    desc: '10-J-Q-K-A satu kembang. Paling tinggi — tidak bisa ditimpa apa pun.',
    example: ['A♠', 'K♠', 'Q♠', 'J♠', '10♠'],
  },
  {
    rank: 2,
    name: 'Straight Flush',
    desc: 'Lima kartu berurutan satu kembang. Kalah hanya dari Royal Flush.',
    example: ['9♥', '8♥', '7♥', '6♥', '5♥'],
  },
  {
    rank: 3,
    name: 'Empat Sejenis',
    desc: '4 kartu nominal sama (tanpa kicker). Boleh menimpa straight, flush, dan full house. Dikalahkan empat sejenis lebih tinggi, straight flush, atau royal flush.',
    example: ['K♠', 'K♥', 'K♦', 'K♣'],
  },
  {
    rank: 4,
    name: 'Full House',
    desc: 'Tiga sejenis + sepasang. Dinilai dari trio-nya lebih dulu.',
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
    desc: 'Lima kartu berurutan beda kembang. Urutan Capsa: 3-4-5-6-7 terendah, J-Q-K-A-2 tertinggi.',
    example: ['9♣', '8♦', '7♠', '6♥', '5♣'],
  },
  {
    rank: 7,
    name: 'Dua Pasang',
    desc: 'Dua pasang (4 kartu). Hanya bisa dilawan dua pasang lain yang salah satu pasangannya lebih tinggi.',
    example: ['J♠', 'J♥', '4♦', '4♣'],
  },
  {
    rank: 8,
    name: 'Tiga Sejenis',
    desc: 'Tiga kartu nominal sama (3 kartu). Kembang boleh apa saja.',
    example: ['7♠', '7♥', '7♦'],
  },
  {
    rank: 9,
    name: 'Satu Pasang',
    desc: 'Dua kartu nominal sama.',
    example: ['10♠', '10♥'],
  },
  {
    rank: 10,
    name: 'Kartu Tunggal',
    desc: 'Satu kartu. Nilai harus benar-benar lebih tinggi — nilai sama tidak bisa menimpa (kembang tidak menolong).',
    example: ['A♠'],
  },
];

export function cardFromNotation(text) {
  const suit = text.slice(-1);
  const value = text.slice(0, -1);
  return { uid: `${value}${suit}-ref`, suit, value, kind: 'standard' };
}
