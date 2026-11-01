import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Balapan antara `start()` dan `stop()`.
 *
 * `start()` melakukan dua hal asinkron sebelum mikrofon benar-benar menyala:
 *   1. meminta kunci bicara ke server (transaksi Firebase)
 *   2. meminta izin mikrofon ke pengguna (dialog browser)
 *
 * Pada koneksi lambat atau saat dialog izin muncul pertama kali, keduanya bisa
 * memakan 1–3 detik. Pemain yang menekan tombol lalu cepat melepas (atau
 * menutup dialog) menghasilkan `stop()` SEBELUM `start()` selesai.
 *
 * Tanpa penjagaan, `start()` melanjutkan setelah jari lepas: mikrofon menyala,
 * indikator merekam berjalan, dan tidak ada tombol yang bisa ditekan untuk
 * mematikannya — karena tombolnya sudah dilepas. Tes ini mengunci perbaikan
 * tersebut.
 */

// --- Tiruan BroadcastChannel (mode lokal, tanpa Firebase) -------------------
class FakeBroadcastChannel {
  constructor(name) { this.name = name; this.closed = false; }
  postMessage() {}
  close() { this.closed = true; }
}

// --- Tiruan MediaRecorder ---------------------------------------------------
let recorderInstances = [];

class FakeMediaRecorder {
  static isTypeSupported() { return true; }

  constructor(stream, options = {}) {
    this.stream = stream;
    this.options = options;
    this.state = 'inactive';
    this.started = false;
    this.stopped = false;
    this.ondataavailable = null;
    this.onstop = null;
    this.onerror = null;
    recorderInstances.push(this);
  }

  start() { this.state = 'recording'; this.started = true; }
  stop() { this.state = 'inactive'; this.stopped = true; }
}

/** Stream tiruan: mencatat apakah track-nya dihentikan. */
function fakeStream() {
  const track = { stopped: false, stop() { this.stopped = true; } };
  return { getTracks: () => [track], track };
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

const { usePTT } = await import('../hooks/usePTT.js');

/** Komponen pembungkus: mengekspos nilai hook ke luar. */
function makeHarness() {
  const box = { current: null };
  function Harness({ roomCode, viewerId }) {
    box.current = usePTT({ roomCode, viewerId, name: 'Aku', inGame: true });
    return null;
  }
  return { box, Harness };
}

async function mountHook() {
  const { box, Harness } = makeHarness();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(Harness, { roomCode: 'ABC123', viewerId: 'me' }));
  });
  await act(async () => { await flush(); });
  return {
    box,
    unmount: async () => { await act(async () => { root.unmount(); }); host.remove(); },
  };
}

describe('usePTT — jari lepas sebelum mikrofon siap', () => {
  let getUserMedia;

  beforeEach(() => {
    recorderInstances = [];
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    Object.defineProperty(window, 'MediaRecorder', {
      configurable: true, writable: true, value: FakeMediaRecorder,
    });
    getUserMedia = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      writable: true,
      value: { getUserMedia },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('mikrofon TIDAK menyala bila stop() dipanggil saat izin masih menunggu', async () => {
    const stream = fakeStream();
    let grant;
    // getUserMedia menggantung sampai tes memutuskan — meniru dialog izin
    // yang masih terbuka di layar.
    getUserMedia.mockImplementation(() => new Promise(resolve => { grant = () => resolve(stream); }));

    const view = await mountHook();
    // Tekan tombol: start() berjalan dan berhenti di await getUserMedia.
    await act(async () => { view.box.current.start(); });
    await act(async () => { await flush(); });

    // Jari lepas sebelum izin diberikan.
    await act(async () => { view.box.current.stop({ cancel: true }); });

    // Sekarang pengguna menekan "Izinkan".
    await act(async () => { grant(); await flush(); });

    // Inti perbaikan: tidak ada recorder yang dibuat, stream langsung dimatikan,
    // dan state tidak pernah masuk "recording".
    expect(recorderInstances.length).toBe(0);
    expect(stream.track.stopped).toBe(true);
    expect(view.box.current.recording).toBe(false);

    await view.unmount();
  });

  it('perekaman normal tetap berjalan saat jari ditahan sampai izin diberikan', async () => {
    const stream = fakeStream();
    getUserMedia.mockResolvedValue(stream);

    const view = await mountHook();
    await act(async () => { view.box.current.start(); });
    await act(async () => { await flush(); });

    expect(recorderInstances.length).toBe(1);
    expect(recorderInstances[0].started).toBe(true);
    expect(recorderInstances[0].options.audioBitsPerSecond).toBe(20000);
    expect(view.box.current.recording).toBe(true);

    await act(async () => { view.box.current.stop({ cancel: true }); });
    await act(async () => { await flush(); });
    expect(stream.track.stopped).toBe(true);

    await view.unmount();
  });

  it('dua kali tekan beruntun tidak menghasilkan dua recorder', async () => {
    const stream = fakeStream();
    getUserMedia.mockResolvedValue(stream);

    const view = await mountHook();
    // Tekan dua kali sebelum start pertama selesai (jari gemetar / dobel tap).
    await act(async () => {
      view.box.current.start();
      view.box.current.start();
    });
    await act(async () => { await flush(); });

    expect(recorderInstances.length).toBe(1);
    await view.unmount();
  });

  it('unmount saat izin masih menunggu tidak menyalakan mikrofon', async () => {
    const stream = fakeStream();
    let grant;
    getUserMedia.mockImplementation(() => new Promise(resolve => { grant = () => resolve(stream); }));

    const view = await mountHook();
    await act(async () => { view.box.current.start(); });
    await act(async () => { await flush(); });

    // Pemain keluar meja sebelum dialog izin dijawab.
    await view.unmount();
    await act(async () => { grant(); await flush(); });

    expect(recorderInstances.length).toBe(0);
    expect(stream.track.stopped).toBe(true);
  });
});
