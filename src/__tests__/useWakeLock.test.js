import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useWakeLock, supportsWakeLock } from '../hooks/useWakeLock.js';

// React 19 hanya mengaktifkan peringatan/penanganan act() bila flag ini diset.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Sentinel tiruan: mencatat release() dan bisa "melepas diri sendiri" seperti
// perilaku browser saat halaman menjadi hidden.
function fakeSentinel() {
  const listeners = [];
  return {
    released: false,
    addEventListener: (type, cb) => { if (type === 'release') listeners.push(cb); },
    removeEventListener: () => {},
    async release() { this.released = true; listeners.forEach(cb => cb()); },
    emitRelease() { listeners.forEach(cb => cb()); },
  };
}

function installWakeLockMock() {
  const sentinels = [];
  const request = vi.fn(async () => {
    const sentinel = fakeSentinel();
    sentinels.push(sentinel);
    return sentinel;
  });
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    writable: true,
    value: { request },
  });
  return { request, sentinels };
}

function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function Harness({ active }) {
  useWakeLock(active);
  return null;
}

async function mount(active) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const render = async next => {
    await act(async () => { root.render(React.createElement(Harness, { active: next })); });
    await act(async () => { await flush(); });
  };
  await render(active);
  return {
    render,
    unmount: async () => {
      await act(async () => { root.unmount(); });
      host.remove();
    },
  };
}

describe('useWakeLock', () => {
  let originalWakeLock;

  beforeEach(() => {
    originalWakeLock = navigator.wakeLock;
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      writable: true,
      value: originalWakeLock,
    });
    vi.restoreAllMocks();
  });

  it('mendeteksi dukungan browser tanpa melempar saat API tidak ada', () => {
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, writable: true, value: undefined });
    expect(supportsWakeLock()).toBe(false);
    // Hook tidak boleh crash di browser tanpa dukungan (Firefox/Safari lama).
    expect(() => installWakeLockMock()).not.toThrow();
  });

  it('tidak meminta lock sama sekali saat active = false', async () => {
    const { request } = installWakeLockMock();
    const view = await mount(false);
    expect(request).not.toHaveBeenCalled();
    await view.unmount();
  });

  it('meminta lock saat active = true dan melepasnya saat giliran berakhir', async () => {
    const { request, sentinels } = installWakeLockMock();
    const view = await mount(true);

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('screen');
    expect(sentinels[0].released).toBe(false);

    await view.render(false);
    expect(sentinels[0].released).toBe(true);

    await view.unmount();
  });

  it('mengambil ulang lock saat halaman kembali visible (bug klasik)', async () => {
    const { request } = installWakeLockMock();
    const view = await mount(true);
    expect(request).toHaveBeenCalledTimes(1);

    // Pindah app: browser melepas lock sendiri.
    setVisibility('hidden');
    await act(async () => { await flush(); });
    // Kembali ke app: lock WAJIB diambil ulang.
    setVisibility('visible');
    await act(async () => { await flush(); });

    expect(request).toHaveBeenCalledTimes(2);
    await view.unmount();
  });

  it('tidak meminta lock saat halaman masih hidden', async () => {
    const { request } = installWakeLockMock();
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    const view = await mount(true);
    expect(request).not.toHaveBeenCalled();
    await view.unmount();
  });

  it('tidak crash saat browser menolak permintaan (baterai lemah / tab pasif)', async () => {
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      writable: true,
      value: { request: vi.fn(async () => { throw new Error('NotAllowedError'); }) },
    });
    const view = await mount(true);
    // Tidak ada exception yang lolos ke React.
    expect(true).toBe(true);
    await view.unmount();
  });

  it('melepas lock saat komponen unmount', async () => {
    const { sentinels } = installWakeLockMock();
    const view = await mount(true);
    await view.unmount();
    expect(sentinels[0].released).toBe(true);
  });

  it('sentinel.onrelease menormalkan state agar acquire berikutnya tidak terlewat', async () => {
    const { request, sentinels } = installWakeLockMock();
    const view = await mount(true);
    // Browser melepas lock tanpa memberi tahu lewat visibilitychange.
    sentinels[0].emitRelease();
    await act(async () => { await flush(); });

    // Kembali visible → harus minta lagi, bukan mengira masih pegang lock.
    setVisibility('visible');
    await act(async () => { await flush(); });
    expect(request).toHaveBeenCalledTimes(2);

    await view.unmount();
  });
});
