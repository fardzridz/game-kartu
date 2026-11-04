/**
 * Test utilitas teks obrolan.
 *
 * Kebijakan yang dikunci di sini: TIDAK ADA penyaringan kata. Meja ini
 * tongkrongan pribadi dan pemainnya sering memakai bahasa daerah, jadi filter
 * kata kasar Indonesia dulu lebih banyak salah tangkap daripada menahan.
 * Kalau suatu saat ada yang menambahkan filter lagi, test ini yang harus
 * diubah lebih dulu — supaya keputusannya sadar, bukan tidak sengaja.
 */

import { describe, expect, it } from 'vitest';
import { MAX_CHAT_LENGTH, sanitizeChatText, sanitizeName } from '../utils/chatFilter.js';

describe('sanitizeChatText', () => {
  it('merapikan spasi dan memangkas di batas 200 karakter', () => {
    const long = 'a'.repeat(300);
    expect(sanitizeChatText(long).length).toBe(MAX_CHAT_LENGTH);
    expect(sanitizeChatText('halo    dunia')).toBe('halo dunia');
  });

  it('TIDAK menyensor kata kasar — isi pesan kembali apa adanya', () => {
    expect(sanitizeChatText('dasar bangsat')).toBe('dasar bangsat');
    expect(sanitizeChatText('goblok banget sih')).toBe('goblok banget sih');
  });

  it('bahasa daerah lolos tanpa salah tangkap', () => {
    // Kata-kata ini dulu bisa kena filter karena kemiripan potongan huruf.
    const daerah = [
      'mangga atuh lur',
      'raimu kaya kebo',
      'lah kok gitu sih bang',
      'bagus bana kartuna',
      'horas bah, mantap',
    ];
    for (const teks of daerah) expect(sanitizeChatText(teks)).toBe(teks);
  });

  it('membuang karakter kontrol dan zero-width', () => {
    expect(sanitizeChatText('ha\u200Blo\u0000 dunia')).toBe('halo dunia');
  });

  it('tidak meng-escape HTML — React yang mengurusnya', () => {
    expect(sanitizeChatText('<script>alert(1)</script>')).toBe('<script>alert(1)</script>');
  });

  it('menangani input bukan string tanpa melempar', () => {
    expect(sanitizeChatText(null)).toBe('');
    expect(sanitizeChatText(undefined)).toBe('');
    expect(sanitizeChatText(42)).toBe('');
  });
});

describe('sanitizeName', () => {
  it('memotong nama ke 18 karakter sesuai rules', () => {
    expect(sanitizeName('Nama Yang Sangat Panjang Sekali').length).toBe(18);
    expect(sanitizeName('Budi')).toBe('Budi');
  });

  it('menangani input kosong', () => {
    expect(sanitizeName(null)).toBe('');
    expect(sanitizeName('   ')).toBe('');
  });
});
