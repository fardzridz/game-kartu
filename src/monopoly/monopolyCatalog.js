/**
 * Katalog Papan & Kartu Monopoli Klasik (40 Petak Standar Dunia).
 *
 * Menggunakan bendera negara SVG inline / emoji terkurasi + warna komplek resmi
 * dan kartu Kesempatan (Chance) / Dana Umum (Community Chest) khas tongkrongan.
 */

export const PROPERTY_GROUPS = {
  BROWN: { id: 'brown', name: 'Cokelat', color: '#8b4513', bg: '#fdf3ea' },
  SKY: { id: 'sky', name: 'Biru Muda', color: '#0ea5e9', bg: '#f0f9ff' },
  PINK: { id: 'pink', name: 'Merah Muda', color: '#d946ef', bg: '#fdf4ff' },
  ORANGE: { id: 'orange', name: 'Oranye', color: '#f97316', bg: '#fff7ed' },
  RED: { id: 'red', name: 'Merah', color: '#ef4444', bg: '#fef2f2' },
  YELLOW: { id: 'yellow', name: 'Kuning', color: '#eab308', bg: '#fefce8' },
  GREEN: { id: 'green', name: 'Hijau', color: '#22c55e', bg: '#f0fdf4' },
  DARK_BLUE: { id: 'dark_blue', name: 'Biru Tua', color: '#1d4ed8', bg: '#eff6ff' },
  STATION: { id: 'station', name: 'Stasiun / Bandara', color: '#64748b', bg: '#f8fafc' },
  UTILITY: { id: 'utility', name: 'Utilitas Publik', color: '#e2e8f0', bg: '#f8fafc' },
};

/**
 * 40 Petak standar Monopoli searah jarum jam (dimulai dari petak 0: MULAI / GO).
 * Indeks 0 = Pojok Bawah-Kanan (GO)
 * Indeks 10 = Pojok Bawah-Kiri (Penjara)
 * Indeks 20 = Pojok Atas-Kiri (Parkir Bebas)
 * Indeks 30 = Pojok Atas-Kanan (Masuk Penjara)
 */
export const MONOPOLY_TILES = [
  { index: 0, type: 'go', name: 'MULAI (GO)', label: 'Gaji Rp 200' },
  { index: 1, type: 'property', group: 'BROWN', name: 'Indonesia', flag: '🇮🇩', price: 60, baseRent: 2, rents: [10, 30, 90, 160, 250], houseCost: 50 },
  { index: 2, type: 'chest', name: 'Dana Umum', label: 'Ambil Kartu' },
  { index: 3, type: 'property', group: 'BROWN', name: 'Malaysia', flag: '🇲🇾', price: 60, baseRent: 4, rents: [20, 60, 180, 320, 450], houseCost: 50 },
  { index: 4, type: 'tax', name: 'Pajak Jalan', cost: 200 },
  { index: 5, type: 'station', group: 'STATION', name: 'Bandara Soekarno-Hatta', price: 200, baseRent: 25 },
  { index: 6, type: 'property', group: 'SKY', name: 'Thailand', flag: '🇹🇭', price: 100, baseRent: 6, rents: [30, 90, 270, 400, 550], houseCost: 50 },
  { index: 7, type: 'chance', name: 'Kesempatan', label: 'Ambil Kartu' },
  { index: 8, type: 'property', group: 'SKY', name: 'Vietnam', flag: '🇻🇳', price: 100, baseRent: 6, rents: [30, 90, 270, 400, 550], houseCost: 50 },
  { index: 9, type: 'property', group: 'SKY', name: 'Filipina', flag: '🇵🇭', price: 120, baseRent: 8, rents: [40, 100, 300, 450, 600], houseCost: 50 },

  { index: 10, type: 'jail', name: 'Penjara', label: 'Hanya Lewat' },
  { index: 11, type: 'property', group: 'PINK', name: 'India', flag: '🇮🇳', price: 140, baseRent: 10, rents: [50, 150, 450, 625, 750], houseCost: 100 },
  { index: 12, type: 'utility', group: 'UTILITY', name: 'Perusahaan Listrik (PLN)', price: 150, baseRent: 4 },
  { index: 13, type: 'property', group: 'PINK', name: 'Turki', flag: '🇹🇷', price: 140, baseRent: 10, rents: [50, 150, 450, 625, 750], houseCost: 100 },
  { index: 14, type: 'property', group: 'PINK', name: 'Mesir', flag: '🇪🇬', price: 160, baseRent: 12, rents: [60, 180, 500, 700, 900], houseCost: 100 },
  { index: 15, type: 'station', group: 'STATION', name: 'Bandara Changi', price: 200, baseRent: 25 },
  { index: 16, type: 'property', group: 'ORANGE', name: 'Brasil', flag: '🇧🇷', price: 180, baseRent: 14, rents: [70, 200, 550, 750, 950], houseCost: 100 },
  { index: 17, type: 'chest', name: 'Dana Umum', label: 'Ambil Kartu' },
  { index: 18, type: 'property', group: 'ORANGE', name: 'Argentina', flag: '🇦🇷', price: 180, baseRent: 14, rents: [70, 200, 550, 750, 950], houseCost: 100 },
  { index: 19, type: 'property', group: 'ORANGE', name: 'Meksiko', flag: '🇲🇽', price: 200, baseRent: 16, rents: [80, 220, 600, 800, 1000], houseCost: 100 },

  { index: 20, type: 'parking', name: 'Parkir Bebas', label: 'Istirahat' },
  { index: 21, type: 'property', group: 'RED', name: 'Jepang', flag: '🇯🇵', price: 220, baseRent: 18, rents: [90, 250, 700, 875, 1050], houseCost: 150 },
  { index: 22, type: 'chance', name: 'Kesempatan', label: 'Ambil Kartu' },
  { index: 23, type: 'property', group: 'RED', name: 'Korea Selatan', flag: '🇰🇷', price: 220, baseRent: 18, rents: [90, 250, 700, 875, 1050], houseCost: 150 },
  { index: 24, type: 'property', group: 'RED', name: 'Tiongkok', flag: '🇨🇳', price: 240, baseRent: 20, rents: [100, 300, 750, 925, 1100], houseCost: 150 },
  { index: 25, type: 'station', group: 'STATION', name: 'Bandara Haneda', price: 200, baseRent: 25 },
  { index: 26, type: 'property', group: 'YELLOW', name: 'Australia', flag: '🇦🇺', price: 260, baseRent: 22, rents: [110, 330, 800, 975, 1150], houseCost: 150 },
  { index: 27, type: 'property', group: 'YELLOW', name: 'Belanda', flag: '🇳🇱', price: 260, baseRent: 22, rents: [110, 330, 800, 975, 1150], houseCost: 150 },
  { index: 28, type: 'utility', group: 'UTILITY', name: 'Perusahaan Air (PDAM)', price: 150, baseRent: 4 },
  { index: 29, type: 'property', group: 'YELLOW', name: 'Jerman', flag: '🇩🇪', price: 280, baseRent: 24, rents: [120, 360, 850, 1025, 1200], houseCost: 150 },

  { index: 30, type: 'goto_jail', name: 'Masuk Penjara', label: 'Langsung Diborgol!' },
  { index: 31, type: 'property', group: 'GREEN', name: 'Prancis', flag: '🇫🇷', price: 300, baseRent: 26, rents: [130, 390, 900, 1100, 1275], houseCost: 200 },
  { index: 32, type: 'property', group: 'GREEN', name: 'Italia', flag: '🇮🇹', price: 300, baseRent: 26, rents: [130, 390, 900, 1100, 1275], houseCost: 200 },
  { index: 33, type: 'chest', name: 'Dana Umum', label: 'Ambil Kartu' },
  { index: 34, type: 'property', group: 'GREEN', name: 'Spanyol', flag: '🇪🇸', price: 320, baseRent: 28, rents: [150, 450, 1000, 1200, 1400], houseCost: 200 },
  { index: 35, type: 'station', group: 'STATION', name: 'Bandara Heathrow', price: 200, baseRent: 25 },
  { index: 36, type: 'chance', name: 'Kesempatan', label: 'Ambil Kartu' },
  { index: 37, type: 'property', group: 'DARK_BLUE', name: 'Inggris', flag: '🇬🇧', price: 350, baseRent: 35, rents: [175, 500, 1100, 1300, 1500], houseCost: 200 },
  { index: 38, type: 'tax', name: 'Pajak Mewah', cost: 100 },
  { index: 39, type: 'property', group: 'DARK_BLUE', name: 'Amerika Serikat', flag: '🇺🇸', price: 400, baseRent: 50, rents: [200, 600, 1400, 1700, 2000], houseCost: 200 },
];

export const CHANCE_CARDS = [
  { id: 'c1', text: 'Maju langsung ke petak MULAI (GO)! Kumpulkan Rp 200.', action: 'goto', target: 0, collect: 200 },
  { id: 'c2', text: 'Kena tilang knalpot brong saat konvoi. Bayar denda Rp 50!', action: 'pay', amount: 50 },
  { id: 'c3', text: 'Jalan-jalan ke Bandara Heathrow. Maju langsung ke Bandara Heathrow!', action: 'goto', target: 35 },
  { id: 'c4', text: 'Ketahuan nyontek saat ujian BAWASLU! Langsung MASUK PENJARA!', action: 'jail' },
  { id: 'c5', text: 'Menang lomba tanding gaple tongkrongan. Dapatkan Rp 150!', action: 'collect', amount: 150 },
  { id: 'c6', text: 'Kartu Bebas Penjara! Simpan kartu ini untuk keluar penjara gratis.', action: 'jail_free' },
  { id: 'c7', text: 'Biaya servis AC & renovasi properti. Bayar Rp 25 per rumah & Rp 100 per hotel.', action: 'repair', house: 25, hotel: 100 },
  { id: 'c8', text: 'Traktir kopi satu tongkrongan! Bayar Rp 20 ke tiap pemain.', action: 'pay_all', amount: 20 },
];

export const CHEST_CARDS = [
  { id: 'ch1', text: 'Maju langsung ke petak MULAI (GO)! Dapatkan Rp 200.', action: 'goto', target: 0, collect: 200 },
  { id: 'ch2', text: 'Dapat THR dadakan dari Panitia! Kumpulkan Rp 100.', action: 'collect', amount: 100 },
  { id: 'ch3', text: 'Bayar iuran kas tongkrongan dan BPJS. Bayar Rp 50.', action: 'pay', amount: 50 },
  { id: 'ch4', text: 'Ulang tahunmu dirayakan bareng-bareng! Terima Rp 20 dari tiap pemain.', action: 'collect_all', amount: 20 },
  { id: 'ch5', text: 'Kartu Bebas Penjara! Simpan kartu ini untuk keluar penjara gratis.', action: 'jail_free' },
  { id: 'ch6', text: 'Kena razia kosan malam hari! Langsung MASUK PENJARA!', action: 'jail' },
  { id: 'ch7', text: 'Klaim asuransi properti cair. Dapatkan Rp 50.', action: 'collect', amount: 50 },
  { id: 'ch8', text: 'Mundur 3 petak ke belakang.', action: 'back_steps', steps: 3 },
];
