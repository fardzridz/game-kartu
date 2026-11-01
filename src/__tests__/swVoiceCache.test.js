import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sw = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf8');

/**
 * Regresi service worker untuk aset suara.
 *
 * Tanpa ini, klip reaksi suara TIDAK akan pernah masuk cache: regex aset
 * statis tidak mengenal .webm, sehingga setiap kali aplikasi dibuka ulang
 * berkasnya diunduh lagi — dan saat offline tombolnya diam.
 */

describe('service worker — klip suara ikut di-cache', () => {
  it('regex aset statis mengenali semua format audio yang didukung loader', () => {
    const match = sw.match(/const STATIC_FILE_RE = (\/.*\/i);/);
    expect(match).toBeTruthy();
    // Bangun ulang RegExp dari sumber agar yang diuji benar-benar regex di sw.js.
    const source = match[1];
    const re = eval(source); // eslint-disable-line no-eval
    for (const ext of ['webm', 'ogg', 'mp3', 'm4a', 'wav']) {
      expect(re.test(`/voices/klip.${ext}`), `regex harus cocok untuk .${ext}`).toBe(true);
    }
    // Aset lama tetap cocok.
    expect(re.test('/assets/index.js')).toBe(true);
    expect(re.test('/fonts/rubik-latin.woff2')).toBe(true);
  });

  it('keempat klip reaksi ada di daftar precache', () => {
    for (const name of ['mantap', 'waduh', 'hahaha', 'mati-sampah']) {
      expect(sw, `${name} harus ada di PRECACHE_URLS`).toContain(`/voices/${name}.webm`);
    }
  });

  it('precache memakai allSettled sehingga aset yang belum ada tidak menggagalkan install', () => {
    // Kalau memakai Promise.all, satu 404 untuk berkas yang belum disediakan
    // akan menggagalkan seluruh instalasi service worker.
    expect(sw).toContain('Promise.allSettled');
  });

  it('CACHE_VERSION sudah naik ke v3', () => {
    // Aturan project: setiap perubahan sw.js WAJIB menaikkan versi cache,
    // kalau tidak pengguna akan terus memakai cache lama.
    expect(sw).toContain("const CACHE_VERSION = 'v3'");
    expect(sw).not.toContain("const CACHE_VERSION = 'v2'");
  });

  it('klip suara tidak di-bypass (bukan domain luar)', () => {
    // BYPASS_HOSTS hanya untuk Firebase; aset suara lokal harus tetap di-cache.
    expect(sw).not.toContain("'localhost'");
    const bypass = sw.match(/const BYPASS_HOSTS = (\[[^\]]*\]);/);
    expect(bypass).toBeTruthy();
    expect(bypass[1]).not.toContain('voices');
  });
});
