/**
 * Penyaring teks obrolan — fungsi murni, tanpa I/O.
 *
 * JUJUR SOAL BATASANNYA: ini BUKAN AI dan BUKAN filter sempurna. Ini daftar
 * kata kasar Indonesia + normalisasi ejaan yang menangkap variasi umum
 * (`b4ngs4t`, `b a n g s a t`, `b4ngsaaat`). Pemain yang kreatif tetap bisa
 * melewatinya. Tujuannya menahan semburan kata kasar spontan, bukan menjadi
 * penjaga absolut — moderasi manusia tetap diperlukan.
 *
 * Karena fungsi-fungsi di sini murni, semuanya bisa dites tanpa DOM.
 */

/**
 * Batas panjang pesan. Nilai yang SAMA dipakai di klien, di UI, dan di
 * firebase.rules.json (`.val().length <= 200`). Kalau salah satu diubah,
 * ubah ketiganya.
 */
export const MAX_CHAT_LENGTH = 200;
/** Nama pengirim dibatasi lebih pendek (sama dengan rules). */
export const MAX_CHAT_NAME = 18;

// ---------------------------------------------------------------------------
// Daftar kata
// ---------------------------------------------------------------------------
// Sengaja pendek dan jujur: kata kasar yang benar-benar dipakai di tongkrongan
// Indonesia, tanpa mencoba mencakup seluruh bahasa daerah.
const PROFANITY = Object.freeze([
  'anjing', 'anjir', 'anjay', 'anying', 'asw', 'asu', 'bangsat', 'bangke',
  'bajingan', 'bedebah', 'bego', 'bocah', 'brengsek', 'budak',
  'cok', 'cuk', 'cangkem', 'cibai', 'cui',
  'dajjal', 'dungu',
  'goblok', 'goblog', 'gblk', 'geblek', 'gila',
  'idiot',
  'jancok', 'jancuk', 'jembut', 'jablay',
  'kampang', 'keparat', 'kontol', 'kntl', 'kuntul',
  'mampus', 'memek', 'mmk', 'monyet', 'murtad',
  'ngehe', 'ngentot', 'ngentd', 'ngewe',
  'pantek', 'pepek', 'pukimak', 'pukimai', 'ppk',
  'sempak', 'setan', 'sialan', 'sinting', 'sundal',
  'taik', 'tai', 'tahi', 'telaso', 'tolo', 'tolol', 'tengil',
  'babi', 'bacot', 'bangsat',
]);

// Singkatan & ejaan yang sering dipakai untuk mengelabui filter. Dipetakan
// sebelum pencocokan, jadi `gblk` tetap tertangkap walau bukan kata utuh.
const ALIASES = Object.freeze({
  bgsd: 'bangsat',
  bgsat: 'bangsat',
  bngst: 'bangsat',
  anjg: 'anjing',
  anj: 'anjing',
  asw: 'asu',
  kontl: 'kontol',
  memk: 'memek',
  ngent: 'ngentot',
  tolol: 'tolol',
  goblok: 'goblok',
});

/**
 * Normalisasi teks untuk pencocokan: huruf kecil, angka → huruf, buang simbol,
 * rapikan spasi.
 *
 * Leetspeak umum: 4→a, 0→o, 1→i, 3→e, 5→s, 7→t.
 *
 * @param {string} text
 * @returns {string} teks ternormalisasi, atau '' bila bukan string.
 */
export function normalizeForFilter(text) {
  if (typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .replace(/4/g, 'a')
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    // Buang semua yang bukan huruf/angka/spasi (termasuk tanda baca yang
    // dipakai menyisipkan: b.a.n.g.s.a.t).
    .replace(/[^a-z0-9\s]/g, '')
    // Huruf berulang jadi satu: bangsaaaat → bangsat.
    .replace(/(.)\1+/g, '$1')
    // Spasi berlebih jadi satu.
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Versi yang spasinya dibuang total, untuk menangkap "b a n g s a t".
 * @param {string} normalized
 * @returns {string}
 */
function compact(normalized) {
  return normalized.replace(/\s+/g, '');
}

/**
 * Apakah teks mengandung kata kasar dari daftar.
 *
 * Dua bentuk diuji: kata utuh (dengan batas kata) dan bentuk rapat tanpa spasi.
 * Bentuk rapat membuat "b a n g s a t" ikut tertangkap, dengan risiko positif
 * palsu yang kecil karena daftarnya pendek.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function containsProfanity(text) {
  const normalized = normalizeForFilter(text);
  if (!normalized) return false;

  const padded = ` ${normalized} `;
  const tight = compact(normalized);

  for (const word of PROFANITY) {
    if (padded.includes(` ${word} `)) return true;
    if (tight.includes(word)) return true;
  }
  for (const [short, full] of Object.entries(ALIASES)) {
    if (padded.includes(` ${short} `)) return true;
    if (tight.includes(short) && tight.includes(full.slice(0, 3))) return true;
  }
  return false;
}

/**
 * Bersihkan teks sebelum dikirim.
 *
 * Yang dilakukan: buang karakter kontrol, rapikan spasi berlebih, potong ke
 * MAX_CHAT_LENGTH, dan tandai bila mengandung kata kasar. Teks TIDAK dihapus
 * saat diblokir — pemanggil yang memutuskan (UI menampilkan pesan ramah dan
 * mempertahankan apa yang sudah diketik).
 *
 * Tidak ada escaping HTML di sini: React sudah meng-escape saat render, dan
 * escaping manual hanya membuat teks tampil aneh (`&lt;script&gt;`).
 *
 * @param {string} text
 * @returns {{ text: string, blocked: boolean }}
 */
export function sanitizeChatText(text) {
  const raw = typeof text === 'string' ? text : '';
  const cleaned = raw
    // Buang karakter kontrol & zero-width yang dipakai menyamarkan kata.
    .replace(/[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_CHAT_LENGTH);

  return {
    text: cleaned,
    blocked: containsProfanity(cleaned),
  };
}

/**
 * Potong nama pengirim agar muat di rules (≤ 18 karakter).
 * @param {string} name
 * @returns {string}
 */
export function sanitizeName(name) {
  const raw = typeof name === 'string' ? name : '';
  return raw.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, MAX_CHAT_NAME);
}
