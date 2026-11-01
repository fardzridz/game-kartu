import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// --- Tiruan Web Audio -------------------------------------------------------
// jsdom tidak punya AudioContext. Kita hanya butuh decodeAudioData dan
// fetch; keduanya diganti supaya bisa menguji LOGIKA fallback ekstensi.
const decodeAudioData = vi.fn();
const fakeBuffer = { duration: 1.2, numberOfChannels: 1 };

vi.mock('../sound/soundFX.js', () => ({
  audioContext: () => ({ decodeAudioData }),
  playVoiceBuffer: vi.fn(() => true),
}));

const { loadVoiceClip, playVoiceClip, preloadVoiceReactions, clearVoiceCache, isVoiceClipCached } =
  await import('../utils/voicePlayer.js');

const { VOICE_REACTIONS } = await import('../utils/voiceReactions.js');

/**
 * fetch tiruan: hanya URL di `available` yang membalas ok.
 * @param {string[]} available
 */
function stubFetch(available) {
  const calls = [];
  const fn = vi.fn(async url => {
    calls.push(url);
    if (available.includes(url)) {
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
    }
    return { ok: false, arrayBuffer: async () => new ArrayBuffer(0) };
  });
  vi.stubGlobal('fetch', fn);
  return calls;
}

describe('loadVoiceClip — fallback ekstensi', () => {
  beforeEach(() => {
    clearVoiceCache();
    decodeAudioData.mockReset();
    decodeAudioData.mockImplementation((_bytes, ok) => {
      ok(fakeBuffer);
      return Promise.resolve(fakeBuffer);
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('memakai .webm bila tersedia (target utama)', async () => {
    const calls = stubFetch(['/voices/mantap.webm']);
    const buffer = await loadVoiceClip('/voices/mantap.webm');
    expect(buffer).toBe(fakeBuffer);
    expect(calls).toEqual(['/voices/mantap.webm']);
  });

  it('jatuh ke .mp3 bila .webm tidak ada — berkas pemilik project tetap jalan', async () => {
    const calls = stubFetch(['/voices/mantap.mp3']);
    const buffer = await loadVoiceClip('/voices/mantap.webm');
    expect(buffer).toBe(fakeBuffer);
    expect(calls).toContain('/voices/mantap.webm');
    expect(calls).toContain('/voices/mantap.mp3');
  });

  it('berhenti mencoba setelah ekstensi pertama yang berhasil', async () => {
    const calls = stubFetch(['/voices/waduh.ogg', '/voices/waduh.mp3']);
    await loadVoiceClip('/voices/waduh.webm');
    // .ogg menang, jadi .mp3 tidak boleh diunduh.
    expect(calls).not.toContain('/voices/waduh.mp3');
  });

  it('null bila semua ekstensi gagal', async () => {
    stubFetch([]);
    expect(await loadVoiceClip('/voices/hahaha.webm')).toBeNull();
  });

  it('mengingat klip yang hilang, tidak mengulang 404 tiap tekan', async () => {
    const calls = stubFetch([]);
    await loadVoiceClip('/voices/mati-sampah.webm');
    const first = calls.length;
    await loadVoiceClip('/voices/mati-sampah.webm');
    expect(calls.length).toBe(first);
  });

  it('hasil decode di-cache di bawah path asli', async () => {
    stubFetch(['/voices/mantap.mp3']);
    await loadVoiceClip('/voices/mantap.webm');
    expect(isVoiceClipCached('/voices/mantap.webm')).toBe(true);
  });

  it('path kosong tidak menyentuh jaringan', async () => {
    const calls = stubFetch([]);
    expect(await loadVoiceClip('')).toBeNull();
    expect(calls).toEqual([]);
  });
});

describe('playVoiceClip & preloadVoiceReactions', () => {
  beforeEach(() => {
    clearVoiceCache();
    decodeAudioData.mockReset();
    decodeAudioData.mockImplementation((_bytes, ok) => {
      ok(fakeBuffer);
      return Promise.resolve(fakeBuffer);
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('playVoiceClip mengembalikan true saat klip berbunyi', async () => {
    stubFetch(['/voices/mantap.webm']);
    expect(await playVoiceClip('/voices/mantap.webm')).toBe(true);
  });

  it('playVoiceClip mengembalikan false saat klip tidak ada (tidak crash)', async () => {
    stubFetch([]);
    expect(await playVoiceClip('/voices/mantap.webm')).toBe(false);
  });

  it('preloadVoiceReactions melaporkan jumlah klip yang berhasil', async () => {
    stubFetch(['/voices/mantap.webm', '/voices/waduh.mp3']);
    const count = await preloadVoiceReactions(VOICE_REACTIONS);
    expect(count).toBe(2);
  });

  it('preloadVoiceReactions 0 bila tidak ada berkas sama sekali', async () => {
    stubFetch([]);
    expect(await preloadVoiceReactions(VOICE_REACTIONS)).toBe(0);
  });

  it('preloadVoiceReactions aman dipanggil dengan daftar kosong', async () => {
    stubFetch([]);
    expect(await preloadVoiceReactions([])).toBe(0);
    expect(await preloadVoiceReactions()).toBe(0);
  });
});
