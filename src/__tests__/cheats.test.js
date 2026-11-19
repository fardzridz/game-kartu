/**
 * Test saklar cheat (src/utils/cheats.js).
 *
 * Yang dijaga:
 *   1. Bawaan MATI — perangkat baru tidak bisa cheat tanpa diminta.
 *   2. `?cheat=1` / `?cheat=0` MENANG atas localStorage, supaya URL bisa
 *      dipakai walau perangkat sudah pernah menyimpan nilai lain.
 *   3. Override manual (dipakai test) menang atas semuanya.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CHEATS_DEFAULT,
  cheatsEnabled,
  resetCheatsOverride,
  setCheatsEnabled,
} from '../utils/cheats.js';

const KEY = 'remi-cheats';
const setUrl = search => window.history.replaceState(null, '', `/${search}`);

beforeEach(() => {
  resetCheatsOverride();
  localStorage.clear();
  setUrl('');
});

afterEach(() => {
  resetCheatsOverride();
  localStorage.clear();
  setUrl('');
});

describe('cheats.js — nilai bawaan', () => {
  it('mati kalau perangkat belum pernah memilih', () => {
    expect(CHEATS_DEFAULT).toBe(false);
    expect(cheatsEnabled()).toBe(false);
  });
});

describe('cheats.js — localStorage', () => {
  it('nilai tersimpan dipakai saat URL tidak menentukan', () => {
    localStorage.setItem(KEY, '1');
    expect(cheatsEnabled()).toBe(true);

    localStorage.setItem(KEY, '0');
    expect(cheatsEnabled()).toBe(false);
  });

  it('nilai asing diabaikan, kembali ke bawaan', () => {
    localStorage.setItem(KEY, 'maybe');
    expect(cheatsEnabled()).toBe(false);
  });
});

describe('cheats.js — parameter URL', () => {
  it('?cheat=1 menyalakan dan menyimpannya', () => {
    setUrl('?cheat=1');
    expect(cheatsEnabled()).toBe(true);
    expect(localStorage.getItem(KEY)).toBe('1');
  });

  it('?cheat=0 mematikan dan menyimpannya', () => {
    setUrl('?cheat=0');
    expect(cheatsEnabled()).toBe(false);
    expect(localStorage.getItem(KEY)).toBe('0');
  });

  it('URL menang atas nilai tersimpan yang berlawanan', () => {
    localStorage.setItem(KEY, '0');
    setUrl('?cheat=1');
    expect(cheatsEnabled()).toBe(true);

    localStorage.setItem(KEY, '1');
    setUrl('?cheat=0');
    expect(cheatsEnabled()).toBe(false);
  });

  it('parameter selain 0/1 tidak berpengaruh', () => {
    localStorage.setItem(KEY, '1');
    setUrl('?cheat=yes');
    expect(cheatsEnabled()).toBe(true);
  });
});

describe('cheats.js — override manual', () => {
  it('setCheatsEnabled menang atas URL dan localStorage', () => {
    setUrl('?cheat=0');
    setCheatsEnabled(true);
    expect(cheatsEnabled()).toBe(true);

    setUrl('?cheat=1');
    setCheatsEnabled(false);
    expect(cheatsEnabled()).toBe(false);
  });

  it('resetCheatsOverride mengembalikan pembacaan normal', () => {
    setCheatsEnabled(true);
    localStorage.setItem(KEY, '0');
    resetCheatsOverride();
    expect(cheatsEnabled()).toBe(false);
  });
});
