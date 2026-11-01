import { describe, expect, it, vi } from 'vitest';

// jsdom tidak punya Web Audio; kita hanya menguji fungsi murni-nya.
vi.mock('../sound/soundFX.js', async importOriginal => {
  const actual = await importOriginal();
  return actual;
});

const { voicePeakGain } = await import('../sound/soundFX.js');

/**
 * Buffer tiruan dengan puncak tertentu.
 * @param {number} peak
 * @param {number} [length]
 */
function fakeBuffer(peak, length = 4000) {
  const data = new Float32Array(length);
  // Isi dengan nilai kecil, lalu taruh puncak di indeks yang pasti terbaca
  // oleh sampling tiap-4 (indeks 0 selalu diperiksa).
  data.fill(peak * 0.1);
  data[0] = peak;
  return {
    numberOfChannels: 1,
    getChannelData: () => data,
  };
}

describe('voicePeakGain — menyamakan suara pemain dengan SFX', () => {
  it('mengangkat rekaman pelan (−18 dBFS) mendekati target', () => {
    // 0.125 ≈ −18 dBFS, tipikal rekaman mikrofon HP.
    const gain = voicePeakGain(fakeBuffer(0.125));
    expect(gain).toBeGreaterThan(1);
    expect(0.125 * gain).toBeCloseTo(0.9, 2);
  });

  it('tidak mengubah klip yang sudah keras', () => {
    expect(voicePeakGain(fakeBuffer(0.95))).toBe(1);
    expect(voicePeakGain(fakeBuffer(1.0))).toBe(1);
  });

  it('membatasi penguatan klip yang sangat pelan', () => {
    // 0.01 butuh gain 90, tapi dibatasi maxBoost (default 8).
    const gain = voicePeakGain(fakeBuffer(0.01));
    expect(gain).toBe(8);
  });

  it('tidak mengangkat buffer senyap total (hanya akan mengangkat noise)', () => {
    const silent = { numberOfChannels: 1, getChannelData: () => new Float32Array(1000) };
    expect(voicePeakGain(silent)).toBe(1);
  });

  it('menangani buffer multichannel dengan mengambil puncak tertinggi', () => {
    const left = new Float32Array(1000).fill(0.2);
    const right = new Float32Array(1000).fill(0.1);
    right[0] = 0.5;
    const buffer = {
      numberOfChannels: 2,
      getChannelData: channel => (channel === 0 ? left : right),
    };
    // Puncak tertinggi = 0.5 → gain 1.8
    expect(voicePeakGain(buffer)).toBeCloseTo(1.8, 5);
  });

  it('aman untuk input tidak valid', () => {
    expect(voicePeakGain(null)).toBe(1);
    expect(voicePeakGain(undefined)).toBe(1);
    expect(voicePeakGain({})).toBe(1);
    expect(voicePeakGain({ numberOfChannels: 1, getChannelData: () => null })).toBe(1);
  });

  it('tidak pernah mengembalikan nilai di bawah 1', () => {
    for (const peak of [0.01, 0.1, 0.3, 0.6, 0.9, 1]) {
      expect(voicePeakGain(fakeBuffer(peak))).toBeGreaterThanOrEqual(1);
    }
  });

  it('menghormati targetPeak dan maxBoost kustom', () => {
    expect(voicePeakGain(fakeBuffer(0.5), 1.0, 10)).toBeCloseTo(2, 5);
    expect(voicePeakGain(fakeBuffer(0.05), 0.9, 2)).toBe(2);
  });

  it('SFX tidak terpengaruh: konstanta bus SFX tetap', async () => {
    // Pengunci regresi: permintaan pemilik project adalah "jangan sentuh SFX".
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src', 'sound', 'soundFX.js'), 'utf8');
    expect(src).toContain('const SFX_BUS_LEVEL = 1.3;');
    expect(src).toContain('const MUSIC_LEVEL = 0.5;');
  });
});
