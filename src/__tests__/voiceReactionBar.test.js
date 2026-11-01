import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { renderToString } from 'react-dom/server';
import { createRoot } from 'react-dom/client';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// --- Tiruan BroadcastChannel ------------------------------------------------
// Di mode test `firebaseActive()` false, jadi openEphemeralChannel selalu
// memakai BroadcastChannel. Kita tiru supaya bisa menyuntikkan event.
let instances = [];
class FakeBroadcastChannel {
  constructor(name) {
    this.name = name;
    this.posted = [];
    this.closed = false;
    this.onmessage = null;
    instances.push(this);
  }
  postMessage(data) { this.posted.push(data); }
  close() { this.closed = true; }
  deliver(data) { if (this.onmessage) this.onmessage({ data }); }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 20));

// --- Tiruan modul pemutar ---------------------------------------------------
// Preload/putar audio tidak bisa diuji di jsdom (tidak ada Web Audio), jadi
// modulnya diganti. Yang diuji di sini adalah KEPUTUSAN UI, bukan decoder.
const preloadVoiceReactions = vi.fn();
const playVoiceClip = vi.fn();

vi.mock('../utils/voicePlayer.js', () => ({
  preloadVoiceReactions: (...args) => preloadVoiceReactions(...args),
  playVoiceClip: (...args) => playVoiceClip(...args),
}));

const isDataSaverActive = vi.fn(() => false);
vi.mock('../utils/dataSaver.js', () => ({
  isDataSaverActive: (...args) => isDataSaverActive(...args),
}));

const { default: VoiceReactionBar } = await import('../components/VoiceReactionBar.jsx');

/**
 * Pasang komponen lalu tunggu preload selesai.
 * @param {object} [props]
 */
async function mountBar(props = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(VoiceReactionBar, {
      roomCode: 'ABC123', viewerId: 'me', ...props,
    }));
  });
  // preload dijadwalkan lewat setTimeout(1200) di jsdom (tidak ada
  // requestIdleCallback), jadi jalankan timer tiruan agar cepat.
  await act(async () => { await flush(); });
  return {
    host,
    buttons: () => host.querySelectorAll('.voice-bar__btn'),
    unmount: async () => { await act(async () => { root.unmount(); }); host.remove(); },
  };
}

describe('VoiceReactionBar — tampil atau sembunyi', () => {
  beforeEach(() => {
    instances = [];
    preloadVoiceReactions.mockReset();
    playVoiceClip.mockReset();
    isDataSaverActive.mockReset();
    isDataSaverActive.mockReturnValue(false);
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('menyembunyikan diri saat aset audio belum tersedia (0 klip termuat)', async () => {
    preloadVoiceReactions.mockResolvedValue(0);
    const view = await mountBar();
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(view.buttons().length).toBe(0);
    expect(view.host.innerHTML).toBe('');
    await view.unmount();
  });

  it('menampilkan empat tombol saat klip berhasil dimuat', async () => {
    preloadVoiceReactions.mockResolvedValue(4);
    const view = await mountBar();
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(view.buttons().length).toBe(4);
    expect(view.host.textContent).toContain('Mantap!');
    expect(view.host.textContent).toContain('Mati Sampah!');
    await view.unmount();
  });

  it('mode hemat data: TIDAK preload tapi bar tetap tampil (bisa diputar saat ditekan)', async () => {
    // Ini syarat acceptance Task 5: "Mode hemat data → tidak preload, tapi
    // tetap bisa diputar saat ditekan". Kalau preload dijalankan, hasil 0 klip
    // akan salah dianggap "aset hilang" dan bar ikut hilang — bug yang dicegah
    // oleh tes ini.
    isDataSaverActive.mockReturnValue(true);
    preloadVoiceReactions.mockResolvedValue(0);
    const view = await mountBar();
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });

    expect(preloadVoiceReactions).not.toHaveBeenCalled();
    expect(view.buttons().length).toBe(4);
    await view.unmount();
  });

  it('tidak merender apa pun saat pemain hanya menonton (disabled)', () => {
    const html = renderToString(React.createElement(VoiceReactionBar, {
      roomCode: 'ABC123', viewerId: 'me', disabled: true,
    }));
    expect(html).toBe('');
  });
});

describe('VoiceReactionBar — kirim & rate limit', () => {
  beforeEach(() => {
    instances = [];
    preloadVoiceReactions.mockReset();
    preloadVoiceReactions.mockResolvedValue(4);
    playVoiceClip.mockReset();
    isDataSaverActive.mockReset();
    isDataSaverActive.mockReturnValue(false);
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('menekan tombol mengirim event kind=voice dan memutar klip sendiri', async () => {
    const view = await mountBar();
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });

    await act(async () => { view.buttons()[0].click(); });
    await act(async () => { await flush(); });

    const sent = instances[0].posted.find(item => item.kind === 'voice');
    expect(sent).toBeTruthy();
    expect(sent.reactionId).toBe('mantap');
    expect(sent.from).toBe('me');
    // Umpan balik instan untuk penekan, tanpa menunggu round-trip.
    expect(playVoiceClip).toHaveBeenCalledWith('/voices/mantap.webm');
    await view.unmount();
  });

  it('menekan dua kali beruntun dibatasi cooldown 3 detik', async () => {
    const view = await mountBar();
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });

    await act(async () => { view.buttons()[0].click(); });
    await act(async () => { await flush(); });
    const afterFirst = instances[0].posted.filter(item => item.kind === 'voice').length;

    // Selama cooldown tombol dinonaktifkan, jadi tekan kedua tidak mengirim
    // apa pun. Ini pertahanan lapis pertama; penjaga di `send` adalah lapis
    // kedua untuk pemanggilan programatik.
    expect(view.buttons()[0].disabled).toBe(true);

    await act(async () => { view.buttons()[1].click(); });
    await act(async () => { await flush(); });
    const afterSecond = instances[0].posted.filter(item => item.kind === 'voice').length;

    expect(afterFirst).toBe(1);
    expect(afterSecond).toBe(1);
    await view.unmount();
  });

  it('cooldown lepas setelah 3 detik dan tombol aktif kembali', async () => {
    const view = await mountBar();
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });

    await act(async () => { view.buttons()[0].click(); });
    await act(async () => { await flush(); });
    expect(view.buttons()[0].disabled).toBe(true);

    await act(async () => { await vi.advanceTimersByTimeAsync(3200); });
    expect(view.buttons()[0].disabled).toBe(false);

    await act(async () => { view.buttons()[2].click(); });
    await act(async () => { await flush(); });
    const sent = instances[0].posted.filter(item => item.kind === 'voice');
    expect(sent.length).toBe(2);
    expect(sent[1].reactionId).toBe('hahaha');
    await view.unmount();
  });

  it('memutar klip saat menerima reaksi pemain lain', async () => {
    const view = await mountBar();
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    playVoiceClip.mockClear();

    await act(async () => {
      instances[0].deliver({
        clientId: 'other', roomCode: 'ABC123', kind: 'voice',
        reactionId: 'hahaha', id: 'evt-2', from: 'lawan', ts: Date.now(),
      });
    });
    await act(async () => { await flush(); });

    expect(playVoiceClip).toHaveBeenCalledWith('/voices/hahaha.webm');
    await view.unmount();
  });

  it('mengabaikan reaksi milik sendiri (tidak diputar dua kali)', async () => {
    const view = await mountBar();
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    playVoiceClip.mockClear();

    await act(async () => {
      instances[0].deliver({
        clientId: 'other', roomCode: 'ABC123', kind: 'voice',
        reactionId: 'waduh', id: 'evt-3', from: 'me', ts: Date.now(),
      });
    });
    await act(async () => { await flush(); });

    expect(playVoiceClip).not.toHaveBeenCalled();
    await view.unmount();
  });

  it('mengabaikan event ejekan biasa (bukan kind=voice)', async () => {
    const view = await mountBar();
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    playVoiceClip.mockClear();

    await act(async () => {
      instances[0].deliver({
        clientId: 'other', roomCode: 'ABC123', type: 'taunt',
        tauntId: 'lamun', id: 'evt-4', from: 'lawan', ts: Date.now(),
      });
    });
    await act(async () => { await flush(); });

    expect(playVoiceClip).not.toHaveBeenCalled();
    await view.unmount();
  });
});
