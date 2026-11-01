import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  connectionQuality,
  dataSaverLabel,
  isDataSaverActive,
  shouldReduceMotion,
  shouldSkipHeavyPreload,
  subscribeConnectionChange,
} from '../utils/dataSaver.js';

// navigator.connection tidak ada di jsdom — kita pasang/lepas sendiri per test.
function setConnection(value) {
  Object.defineProperty(navigator, 'connection', {
    configurable: true,
    writable: true,
    value,
  });
}

function setOnLine(value) {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => value,
  });
}

describe('dataSaver', () => {
  const originalConnection = navigator.connection;
  const originalOnLine = navigator.onLine;

  beforeEach(() => {
    setConnection(undefined);
    setOnLine(true);
  });

  afterEach(() => {
    setConnection(originalConnection);
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => originalOnLine,
    });
    vi.restoreAllMocks();
  });

  // Kasus 1: browser tanpa Network Information API (Firefox/Safari).
  describe('browser tanpa navigator.connection', () => {
    it('tidak crash dan menganggap mode hemat data tidak aktif', () => {
      expect(() => isDataSaverActive()).not.toThrow();
      expect(isDataSaverActive()).toBe(false);
      expect(connectionQuality()).toBe('unknown');
      expect(shouldSkipHeavyPreload()).toBe(false);
      expect(shouldReduceMotion()).toBe(false);
      expect(dataSaverLabel()).toBeNull();
    });
  });

  // Kasus 2: pengguna menyalakan Save-Data.
  describe('saveData: true', () => {
    beforeEach(() => setConnection({ saveData: true, effectiveType: '4g', addEventListener() {}, removeEventListener() {} }));

    it('mendeteksi mode hemat data aktif', () => {
      expect(isDataSaverActive()).toBe(true);
      expect(shouldSkipHeavyPreload()).toBe(true);
      expect(shouldReduceMotion()).toBe(true);
      expect(dataSaverLabel()).toBe('Mode hemat data');
    });

    it('tetap melaporkan kualitas jaringan apa adanya (saveData terpisah)', () => {
      // saveData bisa menyala di wifi kencang; keduanya informasi berbeda.
      expect(connectionQuality()).toBe('ok');
    });
  });

  // Kasus 3: saveData mati, jaringan normal.
  describe('saveData: false', () => {
    it('berjalan normal pada jaringan cepat', () => {
      setConnection({ saveData: false, effectiveType: '4g' });
      expect(isDataSaverActive()).toBe(false);
      expect(connectionQuality()).toBe('ok');
      expect(shouldSkipHeavyPreload()).toBe(false);
      expect(dataSaverLabel()).toBeNull();
    });

    it('melewati preload di jaringan lambat walau saveData mati', () => {
      for (const type of ['slow-2g', '2g', '3g']) {
        setConnection({ saveData: false, effectiveType: type });
        expect(connectionQuality()).toBe('slow');
        expect(shouldSkipHeavyPreload()).toBe(true);
        // Tapi ini bukan mode hemat data: musik tetap boleh main.
        expect(isDataSaverActive()).toBe(false);
      }
    });
  });

  describe('offline', () => {
    it('dianggap hemat data supaya tidak mencoba memulai musik', () => {
      setOnLine(false);
      expect(isDataSaverActive()).toBe(true);
      expect(connectionQuality()).toBe('offline');
    });
  });

  describe('subscribeConnectionChange', () => {
    it('mendaftarkan dan melepas listener pada connection + window', () => {
      const addEventListener = vi.fn();
      const removeEventListener = vi.fn();
      setConnection({ saveData: false, effectiveType: '4g', addEventListener, removeEventListener });
      const windowAdd = vi.spyOn(window, 'addEventListener');
      const windowRemove = vi.spyOn(window, 'removeEventListener');

      const unsubscribe = subscribeConnectionChange(() => {});
      expect(addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
      expect(windowAdd).toHaveBeenCalledWith('online', expect.any(Function));
      expect(windowAdd).toHaveBeenCalledWith('offline', expect.any(Function));

      unsubscribe();
      expect(removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
      expect(windowRemove).toHaveBeenCalledWith('online', expect.any(Function));
      expect(windowRemove).toHaveBeenCalledWith('offline', expect.any(Function));
    });

    it('tidak melempar saat callback bukan fungsi atau tidak ada connection', () => {
      expect(() => subscribeConnectionChange(null)()).not.toThrow();
      const unsubscribe = subscribeConnectionChange(() => {});
      expect(() => unsubscribe()).not.toThrow();
    });

    it('mengirim state terbaru saat event change terjadi', () => {
      let handler = null;
      setConnection({
        saveData: true,
        effectiveType: '3g',
        addEventListener: (type, cb) => { if (type === 'change') handler = cb; },
        removeEventListener: () => {},
      });
      const seen = [];
      const unsubscribe = subscribeConnectionChange(state => seen.push(state));
      handler();
      expect(seen).toEqual([{ dataSaver: true, quality: 'slow' }]);
      unsubscribe();
    });
  });
});
