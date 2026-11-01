import { describe, expect, it } from 'vitest';
import {
  AUDIO_CANDIDATES,
  LOCK_GRACE_MS,
  MAX_AUDIO_AGE_MS,
  MAX_AUDIO_BASE64,
  MAX_DURATION_GAME_MS,
  MAX_DURATION_LOBBY_MS,
  base64ByteLength,
  base64ToBuffer,
  bufferToBase64,
  canRecordAudio,
  isAudioFresh,
  isLockExpired,
  makeLivePayload,
  pickAudioMimeType,
  validateAudioPayload,
} from '../services/pttService.js';

describe('pickAudioMimeType — format per browser, bukan user-agent', () => {
  it('memilih webm/opus bila didukung (Chrome/Firefox)', () => {
    expect(pickAudioMimeType(type => type === 'audio/webm;codecs=opus')).toBe('audio/webm;codecs=opus');
  });

  it('memilih mp4 bila hanya itu yang didukung (Safari)', () => {
    const safari = type => type.startsWith('audio/mp4');
    expect(pickAudioMimeType(safari)).toBe('audio/mp4;codecs=mp4a.40.2');
  });

  it('mengembalikan null bila tidak ada yang didukung → tombol disembunyikan', () => {
    expect(pickAudioMimeType(() => false)).toBeNull();
    expect(pickAudioMimeType(null)).toBeNull();
    expect(pickAudioMimeType(undefined)).toBeNull();
  });

  it('melewati kandidat yang melempar exception', () => {
    const flaky = type => {
      if (type === AUDIO_CANDIDATES[0]) throw new Error('boom');
      return type === 'audio/webm';
    };
    expect(pickAudioMimeType(flaky)).toBe('audio/webm');
  });
});

describe('canRecordAudio', () => {
  const makeEnv = (supported = true) => ({
    window: {},
    navigator: { mediaDevices: { getUserMedia: () => {} } },
    MediaRecorder: Object.assign(function MediaRecorder() {}, {
      isTypeSupported: () => supported,
    }),
  });

  it('true saat MediaRecorder + getUserMedia tersedia dan format didukung', () => {
    expect(canRecordAudio(makeEnv(true))).toBe(true);
  });

  it('false saat tidak ada format yang didukung', () => {
    expect(canRecordAudio(makeEnv(false))).toBe(false);
  });

  it('false saat MediaRecorder tidak ada', () => {
    const env = makeEnv();
    delete env.MediaRecorder;
    expect(canRecordAudio(env)).toBe(false);
  });

  it('false saat getUserMedia tidak ada (browser tanpa izin mikrofon)', () => {
    const env = makeEnv();
    env.navigator = {};
    expect(canRecordAudio(env)).toBe(false);
  });

  it('false saat tidak ada window (SSR)', () => {
    expect(canRecordAudio({ window: undefined })).toBe(false);
  });
});

describe('base64 encode/decode', () => {
  it('bolak-balik mempertahankan byte persis', () => {
    const bytes = new Uint8Array([0, 1, 2, 127, 128, 200, 255, 42]);
    const encoded = bufferToBase64(bytes.buffer);
    expect(typeof encoded).toBe('string');
    expect(encoded).not.toContain('data:');

    const decoded = new Uint8Array(base64ToBuffer(encoded));
    expect([...decoded]).toEqual([...bytes]);
  });

  it('menangani buffer besar tanpa RangeError (dicicil)', () => {
    const big = new Uint8Array(60000);
    for (let i = 0; i < big.length; i += 1) big[i] = i % 256;
    const encoded = bufferToBase64(big.buffer);
    expect(encoded.length).toBeGreaterThan(70000);
    expect(new Uint8Array(base64ToBuffer(encoded)).length).toBe(60000);
  });

  it('mengembalikan string kosong untuk input kosong', () => {
    expect(bufferToBase64(null)).toBe('');
    expect(bufferToBase64(undefined)).toBe('');
  });

  it('mengembalikan null untuk base64 rusak', () => {
    expect(base64ToBuffer('')).toBeNull();
    expect(base64ToBuffer(null)).toBeNull();
    expect(base64ToBuffer('%%%bukan base64%%%')).toBeNull();
  });

  it('menghitung ukuran byte dari panjang base64', () => {
    expect(base64ByteLength('AAAA')).toBe(3);
    expect(base64ByteLength('AAA=')).toBe(2);
    expect(base64ByteLength('AA==')).toBe(1);
    expect(base64ByteLength('')).toBe(0);
  });
});

describe('validateAudioPayload — mirror rules', () => {
  const valid = () => ({
    from: 'pemain-1',
    ts: 1_700_000_000_000,
    dur: 2000,
    mime: 'audio/webm;codecs=opus',
    data: 'AAAAAAAA',
  });

  it('menerima payload yang sah', () => {
    expect(validateAudioPayload(valid()).ok).toBe(true);
  });

  it('menolak payload tanpa field wajib', () => {
    for (const field of ['from', 'ts', 'dur', 'mime', 'data']) {
      const payload = valid();
      delete payload[field];
      expect(validateAudioPayload(payload).ok).toBe(false);
    }
  });

  it('menolak data > 60000 karakter (jebakan kuota)', () => {
    const payload = valid();
    payload.data = 'a'.repeat(MAX_AUDIO_BASE64 + 1);
    const result = validateAudioPayload(payload);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/terlalu besar/);
  });

  it('menerima data tepat di batas 60000 karakter', () => {
    const payload = valid();
    payload.data = 'a'.repeat(MAX_AUDIO_BASE64);
    expect(validateAudioPayload(payload).ok).toBe(true);
  });

  it('menolak durasi di atas batas yang diminta', () => {
    const payload = valid();
    payload.dur = MAX_DURATION_GAME_MS + 1;
    expect(validateAudioPayload(payload, { maxDurationMs: MAX_DURATION_GAME_MS }).ok).toBe(false);
    // Batas ruang tunggu lebih longgar (15 detik).
    expect(validateAudioPayload(payload, { maxDurationMs: MAX_DURATION_LOBBY_MS }).ok).toBe(true);
  });

  it('menolak durasi nol / negatif / bukan angka', () => {
    for (const dur of [0, -5, 'abc', null, undefined]) {
      const payload = { ...valid(), dur };
      expect(validateAudioPayload(payload).ok).toBe(false);
    }
  });

  it('menolak payload bukan objek', () => {
    expect(validateAudioPayload(null).ok).toBe(false);
    expect(validateAudioPayload('teks').ok).toBe(false);
  });
});

describe('isAudioFresh — jebakan #1 (audio lama saat reconnect)', () => {
  const now = 1_700_000_000_000;

  it('meloloskan audio yang baru saja dikirim', () => {
    expect(isAudioFresh(now - 200, now)).toBe(true);
    expect(isAudioFresh(now, now)).toBe(true);
  });

  it('membuang audio lebih tua dari 5 detik', () => {
    expect(isAudioFresh(now - MAX_AUDIO_AGE_MS - 1, now)).toBe(false);
    expect(isAudioFresh(now - 60000, now)).toBe(false);
  });

  it('tepat di batas 5 detik masih diputar', () => {
    expect(isAudioFresh(now - MAX_AUDIO_AGE_MS, now)).toBe(true);
  });

  it('menoleransi ts sedikit di masa depan (jam belum tersinkron)', () => {
    expect(isAudioFresh(now + 800, now)).toBe(true);
  });

  it('membuang ts yang tidak valid', () => {
    expect(isAudioFresh(undefined, now)).toBe(false);
    expect(isAudioFresh(NaN, now)).toBe(false);
    expect(isAudioFresh('x', now)).toBe(false);
  });
});

describe('isLockExpired — jebakan #5 (mutex bocor)', () => {
  const now = 1_700_000_000_000;

  it('kunci kosong boleh direbut', () => {
    expect(isLockExpired(null, now)).toBe(true);
    expect(isLockExpired(undefined, now)).toBe(true);
    expect(isLockExpired({}, now)).toBe(true);
  });

  it('kunci yang masih berjalan TIDAK boleh direbut', () => {
    const live = { from: 'a', ts: now - 1000, dur: 5000 };
    expect(isLockExpired(live, now)).toBe(false);
  });

  it('kunci kedaluwarsa setelah ts + dur + grace', () => {
    const dur = 5000;
    const live = { from: 'a', ts: now - dur - LOCK_GRACE_MS - 1, dur };
    expect(isLockExpired(live, now)).toBe(true);
  });

  it('tepat di batas grace masih dianggap dipegang', () => {
    const dur = 5000;
    const live = { from: 'a', ts: now - dur - LOCK_GRACE_MS, dur };
    expect(isLockExpired(live, now)).toBe(false);
  });

  it('memakai durasi default bila dur tidak masuk akal', () => {
    const live = { from: 'a', ts: now - 1000, dur: 'rusak' };
    expect(isLockExpired(live, now)).toBe(false);
  });

  it('ts rusak berarti kunci dianggap bocor', () => {
    expect(isLockExpired({ from: 'a', ts: 'x', dur: 5000 }, now)).toBe(true);
  });
});

describe('makeLivePayload', () => {
  it('menyertakan from, ts, dur, dan nama yang dipotong', () => {
    const payload = makeLivePayload({ from: 'p1', dur: 4000, name: 'Nama Yang Sangat Panjang Sekali' });
    expect(payload.from).toBe('p1');
    expect(typeof payload.ts).toBe('number');
    expect(payload.dur).toBe(4000);
    expect(payload.name.length).toBe(18);
  });

  it('dur minimal 1 ms walau input nol', () => {
    expect(makeLivePayload({ from: 'p1', dur: 0 }).dur).toBeGreaterThanOrEqual(1);
  });
});
