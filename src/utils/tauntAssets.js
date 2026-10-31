/**
 * Katalog ejekan & barang lemparan. Dipisah dari komponen supaya panel dan
 * proyektil bisa memakainya tanpa memuat modul Firebase/React.
 *
 * Sengaja tanpa emoji: ikon barang lempar digambar inline SVG di
 * TauntGlyphs.jsx, sesuai aturan zero-emoji di DESIGN.md.
 */
export const TAUNTS = [
  { id: 'lamun', text: 'Mikir apa ngelamun bos? Keburu subuh!' },
  { id: 'kopi-dingin', text: 'Kopi udah dingin nih, cepetan elah!' },
  { id: 'umpan', text: 'Makasih umpannya bosku, GALI DULU!' },
  { id: 'wangi', text: 'Sory ya, kartu gue wangi banget hari ini!' },
  { id: 'tipis', text: 'Ati-ati bos, tangan gue udah tipis nih!' },
  { id: 'joker', text: 'HAHAHAHA MAMPUS KENA JOKER!' },
  { id: 'gudang', text: 'Gali terus bos, mau buka gudang kartu?' },
  { id: 'ampas', text: 'Ampun suhu, kartu gue ampas semua...' },
  { id: 'jangan-tutup', text: 'Jangan tutup dulu woi, belum turun nih!' },
  { id: 'sedekah', text: 'Sedekah poin dulu buat yang membutuhkan...' },
];

export const THROWABLES = [
  { id: 'sendal', label: 'Sendal Jepit' },
  { id: 'kopi', label: 'Kopi Panas' },
  { id: 'bom', label: 'Bom Tongkrongan' },
  { id: 'tomat', label: 'Tomat Busuk' },
];
