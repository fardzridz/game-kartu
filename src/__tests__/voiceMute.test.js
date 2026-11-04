/**
 * Test status bisu SUARA ORANG (tombol mute di samping mic).
 *
 * Bug yang dijaga di sini: dulu tombol mute hanya menyaring audio PTT yang
 * masuk, sementara klip reaksi suara (dari pemain lain maupun milik sendiri)
 * tetap berbunyi karena jalurnya berakhir di `playVoiceBuffer` tanpa gerbang.
 * Sekarang statusnya hidup di satu modul dan dibaca di gerbang terakhir itu.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isVoiceMuted,
  resetVoiceMuteForTests,
  setVoiceMuted,
  toggleVoiceMuted,
} from '../utils/voiceMute.js';

describe('utils/voiceMute', () => {
  beforeEach(() => {
    localStorage.clear();
    resetVoiceMuteForTests();
  });

  it('default tidak bisu', () => {
    expect(isVoiceMuted()).toBe(false);
  });

  it('set & toggle mengubah status', () => {
    expect(setVoiceMuted(true)).toBe(true);
    expect(isVoiceMuted()).toBe(true);
    expect(toggleVoiceMuted()).toBe(false);
    expect(isVoiceMuted()).toBe(false);
  });

  it('pilihan disimpan supaya tidak hilang saat refresh', () => {
    setVoiceMuted(true);
    expect(localStorage.getItem('remi-voice-muted')).toBe('1');
    setVoiceMuted(false);
    expect(localStorage.getItem('remi-voice-muted')).toBe('0');
  });

  it('membaca nilai tersimpan saat modul dimuat', async () => {
    localStorage.setItem('remi-voice-muted', '1');
    vi.resetModules();
    const fresh = await import('../utils/voiceMute.js');
    expect(fresh.isVoiceMuted()).toBe(true);
    fresh.setVoiceMuted(false);
  });

  it('localStorage diblokir tidak membuat modul melempar', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => setVoiceMuted(true)).not.toThrow();
    expect(isVoiceMuted()).toBe(true);
    getItem.mockRestore();
    setItem.mockRestore();
    resetVoiceMuteForTests();
  });
});
