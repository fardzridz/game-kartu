import { describe, expect, it } from 'vitest';
import {
  MAX_CHAT_LENGTH,
  containsProfanity,
  normalizeForFilter,
  sanitizeChatText,
  sanitizeName,
} from '../utils/chatFilter.js';

describe('normalizeForFilter', () => {
  it('menurunkan huruf besar dan memetakan angka leetspeak', () => {
    expect(normalizeForFilter('B4NG5AT')).toBe('bangsat');
    expect(normalizeForFilter('T0L0L')).toBe('tolol');
    expect(normalizeForFilter('G1L4')).toBe('gila');
  });

  it('membuang tanda baca yang dipakai menyisipkan', () => {
    expect(normalizeForFilter('b.a.n.g.s.a.t')).toBe('bangsat');
    expect(normalizeForFilter('b4ng-s4t!')).toBe('bangsat');
  });

  it('merapatkan huruf dan spasi berulang', () => {
    expect(normalizeForFilter('bangsaaaaaat')).toBe('bangsat');
    expect(normalizeForFilter('  halo    dunia  ')).toBe('halo dunia');
  });

  it('mengembalikan string kosong untuk input bukan string', () => {
    expect(normalizeForFilter(null)).toBe('');
    expect(normalizeForFilter(undefined)).toBe('');
    expect(normalizeForFilter(42)).toBe('');
  });
});

describe('containsProfanity', () => {
  it('menangkap kata kasar biasa', () => {
    expect(containsProfanity('dasar anjing')).toBe(true);
    expect(containsProfanity('goblok banget')).toBe(true);
  });

  it('menangkap bypass ejaan b4ngs4t', () => {
    expect(containsProfanity('b4ngs4t')).toBe(true);
    expect(containsProfanity('d4s4r b4ngs4t kamu')).toBe(true);
  });

  it('menangkap bypass dengan spasi dan pengulangan huruf', () => {
    expect(containsProfanity('b a n g s a t')).toBe(true);
    expect(containsProfanity('bangssaaaat')).toBe(true);
  });

  it('menangkap singkatan umum', () => {
    expect(containsProfanity('anjg lu')).toBe(true);
    expect(containsProfanity('bgsd')).toBe(true);
  });

  it('tidak menandai teks bersih', () => {
    expect(containsProfanity('selamat sore semua')).toBe(false);
    expect(containsProfanity('kartunya bagus banget')).toBe(false);
    expect(containsProfanity('sampai jumpa di ronde depan')).toBe(false);
    expect(containsProfanity('')).toBe(false);
    expect(containsProfanity(null)).toBe(false);
  });

  it('tidak salah menandai kata yang hanya mirip', () => {
    // "menggila" bukan "gila" sebagai kata utuh, tapi daftar kita memuat
    // bentuk dasar; ini catatan positif palsu yang diterima.
    expect(containsProfanity('mangga')).toBe(false);
    expect(containsProfanity('bandung')).toBe(false);
  });
});

describe('sanitizeChatText', () => {
  it('merapikan spasi dan memangkas di batas 200 karakter', () => {
    const long = 'a'.repeat(300);
    const result = sanitizeChatText(long);
    expect(result.text.length).toBe(MAX_CHAT_LENGTH);
    expect(result.blocked).toBe(false);
  });

  it('mempertahankan teks yang diblokir (UI yang memutuskan)', () => {
    const result = sanitizeChatText('dasar bangsat');
    expect(result.blocked).toBe(true);
    expect(result.text).toBe('dasar bangsat');
  });

  it('membuang karakter kontrol dan zero-width', () => {
    const result = sanitizeChatText('ha\u200Blo\u0000 dunia');
    expect(result.text).toBe('halo dunia');
  });

  it('tidak meng-escape HTML — React yang mengurusnya', () => {
    const result = sanitizeChatText('<script>alert(1)</script>');
    expect(result.text).toBe('<script>alert(1)</script>');
    expect(result.blocked).toBe(false);
  });

  it('menangani input bukan string tanpa melempar', () => {
    expect(sanitizeChatText(null)).toEqual({ text: '', blocked: false });
    expect(sanitizeChatText(undefined)).toEqual({ text: '', blocked: false });
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
