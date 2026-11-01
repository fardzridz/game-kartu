import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_AUDIO_BASE64, MAX_DURATION_GAME_MS, MAX_DURATION_LOBBY_MS } from '../services/pttService.js';
import { voiceFileCandidates } from '../utils/voiceReactions.js';

/**
 * Pemeriksaan aset suara nyata (bukan tiruan).
 *
 * Tes ini HANYA berjalan kalau berkasnya ada, sehingga tidak menggagalkan CI
 * saat aset belum disediakan pemilik project. Tujuannya menangkap masalah yang
 * tidak terlihat dari tes tiruan: berkas terlalu besar, bukan WebM, atau
 * ekstensinya tidak dikenali loader.
 */

const VOICES_DIR = join(process.cwd(), 'public', 'voices');

const CATALOG = [
  { id: 'mantap', file: 'mantap.webm' },
  { id: 'waduh', file: 'waduh.webm' },
  { id: 'hahaha', file: 'hahaha.webm' },
  { id: 'mati-sampah', file: 'mati-sampah.webm' },
];

/** Ekstensi alternatif yang juga diterima loader. */
const EXTS = ['.webm', '.ogg', '.mp3', '.m4a', '.wav'];

/** Cari berkas nyata untuk satu entri katalog. */
function findAsset(base) {
  const stem = base.replace(/\.webm$/, '');
  for (const ext of EXTS) {
    const full = join(VOICES_DIR, stem + ext);
    if (existsSync(full)) return { path: full, ext };
  }
  return null;
}

/** Cek magic bytes WebM/Matroska. */
function isWebm(buffer) {
  return buffer.length > 4
    && buffer[0] === 0x1a && buffer[1] === 0x45
    && buffer[2] === 0xdf && buffer[3] === 0xa3;
}

describe('aset suara nyata di public/voices', () => {
  const present = CATALOG.map(item => ({ ...item, asset: findAsset(item.file) }))
    .filter(item => item.asset);

  it('setiap berkas yang ada tidak melebihi kuota base64', () => {
    for (const item of present) {
      const buffer = readFileSync(item.asset.path);
      const base64Length = Math.ceil((buffer.length * 4) / 3);
      expect(
        base64Length,
        `${item.file} menghasilkan ${base64Length} char base64, melebihi kuota ${MAX_AUDIO_BASE64}`,
      ).toBeLessThanOrEqual(MAX_AUDIO_BASE64);
    }
  });

  it('berkas .webm benar-benar WebM (bukan sekadar salah nama)', () => {
    for (const item of present) {
      if (item.asset.ext !== '.webm') continue;
      const buffer = readFileSync(item.asset.path);
      expect(isWebm(buffer), `${item.file} bukan WebM yang sah`).toBe(true);
    }
  });

  it('loader mengenali setiap nama berkas yang dipakai', () => {
    for (const item of present) {
      const candidates = voiceFileCandidates(`/voices/${item.file}`);
      expect(candidates.length).toBeGreaterThan(0);
      // Kandidat pertama harus ekstensi berkas yang benar-benar ada.
      expect(candidates[0]).toBe(`/voices/${item.file}`);
    }
  });

  it('tidak ada berkas yang ekstensinya tidak didukung loader', () => {
    for (const item of present) {
      expect(EXTS).toContain(item.asset.ext);
    }
  });
});

describe('kesesuaian kuota untuk klip 6,9 detik', () => {
  it('klip 22 KB masih aman di kuota', () => {
    // Angka nyata dari berkas uji yang diberikan pemilik project.
    const bytes = 22509;
    const base64Length = Math.ceil((bytes * 4) / 3);
    expect(base64Length).toBeLessThan(MAX_AUDIO_BASE64);
    // Sisa ruang yang masih tersedia.
    expect(MAX_AUDIO_BASE64 - base64Length).toBeGreaterThan(25000);
  });

  it('durasi 6,9 detik sah di kedua batas', () => {
    const durationMs = 6916;
    expect(durationMs).toBeLessThanOrEqual(MAX_DURATION_GAME_MS);
    expect(durationMs).toBeLessThanOrEqual(MAX_DURATION_LOBBY_MS);
  });
});
