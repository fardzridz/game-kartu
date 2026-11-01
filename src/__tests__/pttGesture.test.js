import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { default: PTTButton } = await import('../components/PTTButton.jsx');

/**
 * Mic punya DUA gestur dan salah satunya berbahaya kalau salah:
 *
 *   - KETUK  → buka panel reaksi suara (TIDAK boleh menyalakan mikrofon)
 *   - TAHAN  → rekam suara, lepas = kirim
 *
 * Tanpa jeda pembeda, `pointerdown` langsung memulai perekaman, jadi pemain
 * yang cuma ingin mengirim "Mantap!" malah merekam suaranya sendiri dan
 * memicu dialog izin mikrofon. Tes ini mengunci perilaku itu.
 */

/** Dispatch event pointer dengan properti yang dibutuhkan handler. */
function firePointer(node, type, { pointerId = 1, clientY = 100 } = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  Object.defineProperty(event, 'clientY', { value: clientY });
  node.dispatchEvent(event);
}

async function mountButton(props = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(PTTButton, props));
  });
  return {
    host,
    button: () => host.querySelector('.ptt__button'),
    unmount: async () => { await act(async () => { root.unmount(); }); host.remove(); },
  };
}

describe('PTTButton — ketuk vs tahan', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ketuk singkat memanggil onTap dan TIDAK memulai perekaman', async () => {
    const onStart = vi.fn();
    const onStop = vi.fn();
    const onTap = vi.fn();
    const view = await mountButton({ onStart, onStop, onTap });

    await act(async () => {
      firePointer(view.button(), 'pointerdown');
      // Lepas setelah 80 ms — jauh di bawah ambang 260 ms.
      await vi.advanceTimersByTimeAsync(80);
      firePointer(view.button(), 'pointerup');
    });

    expect(onTap).toHaveBeenCalledTimes(1);
    // Inti perbaikan: mikrofon tidak pernah menyala untuk sebuah ketukan.
    expect(onStart).not.toHaveBeenCalled();
    expect(onStop).not.toHaveBeenCalled();

    await view.unmount();
  });

  it('menahan melewati ambang memulai perekaman, lepas = kirim', async () => {
    const onStart = vi.fn();
    const onStop = vi.fn();
    const onTap = vi.fn();
    const view = await mountButton({ onStart, onStop, onTap });

    await act(async () => {
      firePointer(view.button(), 'pointerdown');
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onTap).not.toHaveBeenCalled();

    await act(async () => {
      firePointer(view.button(), 'pointerup');
    });

    expect(onStop).toHaveBeenCalledWith({ cancel: false });
    expect(onTap).not.toHaveBeenCalled();

    await view.unmount();
  });

  it('tahan lalu geser ke atas = batal kirim', async () => {
    const onStop = vi.fn();
    const view = await mountButton({ onStart: vi.fn(), onStop });

    await act(async () => {
      firePointer(view.button(), 'pointerdown', { clientY: 300 });
      await vi.advanceTimersByTimeAsync(400);
      firePointer(view.button(), 'pointerup', { clientY: 200 });
    });

    // 100 px ke atas > ambang 56 px.
    expect(onStop).toHaveBeenCalledWith({ cancel: true });

    await view.unmount();
  });

  it('pointercancel saat masih menunggu tidak memanggil onTap', async () => {
    const onTap = vi.fn();
    const onStart = vi.fn();
    const view = await mountButton({ onStart, onTap });

    await act(async () => {
      firePointer(view.button(), 'pointerdown');
      await vi.advanceTimersByTimeAsync(50);
      firePointer(view.button(), 'pointercancel');
    });

    expect(onTap).not.toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();

    await view.unmount();
  });

  it('unmount saat jari masih menahan membatalkan timer (tidak ada onStart nyasar)', async () => {
    const onStart = vi.fn();
    const view = await mountButton({ onStart });

    await act(async () => {
      firePointer(view.button(), 'pointerdown');
    });
    await view.unmount();

    // Timer 260 ms masih berjalan saat unmount; kalau tidak dibersihkan,
    // onStart akan terpanggil untuk komponen yang sudah hilang — mikrofon
    // menyala tanpa tombol yang bisa dilepas.
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(onStart).not.toHaveBeenCalled();
  });

  it('tanpa onTap, ketukan tidak melakukan apa pun (mode rekam saja)', async () => {    const onStart = vi.fn();
    const onStop = vi.fn();
    const view = await mountButton({ onStart, onStop });

    await act(async () => {
      firePointer(view.button(), 'pointerdown');
      await vi.advanceTimersByTimeAsync(60);
      firePointer(view.button(), 'pointerup');
    });

    expect(onStart).not.toHaveBeenCalled();
    expect(onStop).not.toHaveBeenCalled();

    await view.unmount();
  });

  it('geser ke atas sebelum ambang tahan TIDAK dianggap ketukan', async () => {
    // Pemain yang berniat membatalkan (menggeser jari ke atas) lalu melepas
    // cepat tidak boleh membuat panel reaksi terbuka — terasa seperti salah
    // pencet dan menutupi meja.
    const onTap = vi.fn();
    const onStart = vi.fn();
    const view = await mountButton({ onStart, onStop: vi.fn(), onTap });

    await act(async () => {
      firePointer(view.button(), 'pointerdown', { clientY: 300 });
      await vi.advanceTimersByTimeAsync(80);
      firePointer(view.button(), 'pointerup', { clientY: 200 });
    });

    expect(onTap).not.toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
    await view.unmount();
  });

  it('menandai tombol dengan is-tap-active dan aria-expanded saat panel terbuka', async () => {    const view = await mountButton({ onStart: vi.fn(), onStop: vi.fn(), onTap: vi.fn(), tapActive: true });
    const button = view.button();
    expect(button.className).toContain('is-tap-active');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    // Label menyebut kedua gestur supaya pemain tahu tanpa harus mencoba.
    expect(button.getAttribute('aria-label')).toContain('Ketuk untuk reaksi suara');
    expect(button.getAttribute('aria-label')).toMatch(/tahan untuk bicara/i);
    await view.unmount();
  });
});
