import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AUDIO_BITS_PER_SECOND,
  MAX_AUDIO_BASE64,
  MAX_DURATION_GAME_MS,
  MAX_DURATION_LOBBY_MS,
  audioBytesPerSecond,
  estimateBase64Length,
  validateAudioPayload,
} from '../services/pttService.js';

/**
 * Regresi bug "rekaman 10 detik ditolak terlalu panjang".
 *
 * Penyebab sebenarnya bukan durasi, melainkan UKURAN berkas: MediaRecorder
 * tanpa opsi `audioBitsPerSecond` memakai default browser (~128 kbps), yang
 * untuk 10 detik menghasilkan ~107.000 karakter base64 — jauh di atas kuota
 * 60.000. Cek durasi lolos; yang menolak adalah cek ukuran.
 */

const BASE64_OVERHEAD = 4 / 3;

/** Perkiraan base64 bila bitrate TIDAK dibatasi (default browser). */
function base64At(kbps, seconds) {
  const bytes = (kbps * 1000 / 8) * seconds;
  return Math.ceil(bytes * BASE64_OVERHEAD);
}

describe('bug: rekaman 10 detik ditolak "terlalu panjang"', () => {
  it('membuktikan penyebabnya ukuran, bukan durasi', () => {
    // Durasi 10 detik MEMANG sah di meja main.
    expect(MAX_DURATION_GAME_MS).toBe(10000);
    // Tapi pada 128 kbps (default browser), base64-nya jauh melebihi kuota.
    expect(base64At(128, 10)).toBeGreaterThan(MAX_AUDIO_BASE64);
  });

  it('dengan bitrate eksplisit, 10 detik muat di kuota', () => {
    const estimate = estimateBase64Length(MAX_DURATION_GAME_MS);
    expect(estimate).toBeLessThan(MAX_AUDIO_BASE64);
  });

  it('dengan bitrate eksplisit, 15 detik (batas lobby) juga muat', () => {
    const estimate = estimateBase64Length(MAX_DURATION_LOBBY_MS);
    expect(estimate).toBeLessThanOrEqual(MAX_AUDIO_BASE64);
  });

  it('estimasi masuk akal terhadap kuota sebenarnya', () => {
    // Kuota biner = 60000 * 3/4 = 45000 byte.
    const quotaBytes = (MAX_AUDIO_BASE64 * 3) / 4;
    const bytesPerSecond = audioBytesPerSecond();
    const maxSeconds = quotaBytes / bytesPerSecond;
    // Harus bisa memuat batas lobby 15 detik.
    expect(maxSeconds).toBeGreaterThanOrEqual(15);
    // Tapi tidak berlebihan sampai 30 detik (berarti bitrate terlalu rendah).
    expect(maxSeconds).toBeLessThan(30);
  });

  it('bitrate yang dipakai adalah 20 kbps', () => {
    expect(AUDIO_BITS_PER_SECOND).toBe(20000);
  });

  it('payload hasil rekaman 15 detik pada bitrate ini lolos validasi', () => {
    const data = 'a'.repeat(estimateBase64Length(MAX_DURATION_LOBBY_MS));
    const payload = {
      from: 'pemain-1',
      ts: 1_700_000_000_000,
      dur: MAX_DURATION_LOBBY_MS,
      mime: 'audio/webm;codecs=opus',
      data,
    };
    expect(validateAudioPayload(payload, { maxDurationMs: MAX_DURATION_LOBBY_MS })).toEqual({ ok: true });
  });

  it('payload 15 detik pada bitrate default browser TETAP ditolak', () => {
    // Pengunci: kalau suatu saat opsi bitrate dihapus, tes ini menangkapnya.
    const data = 'a'.repeat(base64At(128, 15));
    const payload = {
      from: 'pemain-1',
      ts: 1_700_000_000_000,
      dur: MAX_DURATION_LOBBY_MS,
      mime: 'audio/webm;codecs=opus',
      data,
    };
    const result = validateAudioPayload(payload, { maxDurationMs: MAX_DURATION_LOBBY_MS });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('audio terlalu besar');
  });
});

describe('estimateBase64Length', () => {
  it('bertambah sebanding dengan durasi', () => {
    const short = estimateBase64Length(5000);
    const long = estimateBase64Length(10000);
    expect(long).toBeGreaterThan(short);
    expect(long / short).toBeCloseTo(2, 1);
  });

  it('aman untuk input tidak valid', () => {
    expect(estimateBase64Length(0)).toBe(0);
    expect(estimateBase64Length(-5)).toBe(0);
    expect(estimateBase64Length(null)).toBe(0);
    expect(estimateBase64Length(NaN)).toBe(0);
  });

  it('bitrate tidak valid jatuh ke nilai default', () => {
    expect(estimateBase64Length(10000, 0)).toBe(estimateBase64Length(10000));
    expect(estimateBase64Length(10000, -1)).toBe(estimateBase64Length(10000));
    expect(estimateBase64Length(10000, null)).toBe(estimateBase64Length(10000));
  });
});

describe('MediaRecorder diberi audioBitsPerSecond', () => {
  const hook = readFileSync(join(process.cwd(), 'src', 'hooks', 'usePTT.js'), 'utf8');

  it('opsi bitrate benar-benar dikirim ke MediaRecorder', () => {
    expect(hook).toContain('audioBitsPerSecond');
    expect(hook).toContain('AUDIO_BITS_PER_SECOND');
  });

  it('masih ada fallback bila browser menolak opsi bitrate', () => {
    // Sebagian browser melempar error untuk opsi ini; fitur tidak boleh mati.
    expect(hook).toContain('new window.MediaRecorder(stream, { mimeType })');
  });

  it('pesan error membedakan ukuran vs durasi', () => {
    expect(hook).toContain('Rekaman terlalu besar');
    expect(hook).toContain('Rekaman melebihi');
    // Pesan lama yang menyesatkan tidak boleh kembali.
    expect(hook).not.toContain("? 'Rekaman terlalu panjang. Coba lebih singkat.'");
  });
});
