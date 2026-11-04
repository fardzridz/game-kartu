/**
 * Utilitas teks obrolan — fungsi murni, tanpa I/O.
 *
 * TIDAK ADA PENYARINGAN KATA KASAR. Ini keputusan pemilik project, bukan
 * kelalaian: meja ini tongkrongan pribadi dan pemainnya sering memakai bahasa
 * daerah (Jawa, Sunda, Minang, Batak, dan seterusnya). Daftar kata kasar
 * Indonesia yang dulu dipakai justru lebih banyak salah tangkap — kata harian
 * yang tidak kasar ikut diblokir — daripada menahan yang benar-benar kasar.
 * Karena itu obrolan sekarang dibiarkan bebas (full akses) dan moderasi
 * diserahkan ke manusianya. Jangan menambahkan filter kata kembali tanpa
 * persetujuan pemilik project.
 *
 * Yang TETAP dilakukan di sini bukan penyaringan isi, melainkan kebersihan
 * teknis: buang karakter kontrol/zero-width yang bisa merusak render, rapikan
 * spasi, dan potong ke batas panjang yang sama dengan `firebase.rules.json`.
 */

/**
 * Batas panjang pesan. Nilai yang SAMA dipakai di klien, di UI, dan di
 * firebase.rules.json (`.val().length <= 200`). Kalau salah satu diubah,
 * ubah ketiganya.
 */
export const MAX_CHAT_LENGTH = 200;
/** Nama pengirim dibatasi lebih pendek (sama dengan rules). */
export const MAX_CHAT_NAME = 18;

/**
 * Bersihkan teks sebelum dikirim.
 *
 * Teks TIDAK dihapus dan TIDAK disensor: isi pesan pemain dikembalikan apa
 * adanya (hanya dirapikan secara teknis). Tidak ada escaping HTML di sini —
 * React sudah meng-escape saat render, dan escaping manual hanya membuat teks
 * tampil aneh (`&lt;script&gt;`).
 *
 * @param {string} text
 * @returns {string} teks siap kirim (bisa string kosong).
 */
export function sanitizeChatText(text) {
  const raw = typeof text === 'string' ? text : '';
  return raw
    // Buang karakter kontrol & zero-width yang bisa merusak tampilan.
    .replace(/[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_CHAT_LENGTH);
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
