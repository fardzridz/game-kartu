import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { default: PTTButton } = await import('../components/PTTButton.jsx');

const appCss = readFileSync(join(process.cwd(), 'src', 'App.css'), 'utf8');

/** Ambil isi satu aturan CSS (yang pertama ditemukan). */
function rule(selector) {
  const index = appCss.indexOf(`${selector} {`);
  if (index === -1) return '';
  return appCss.slice(index, appCss.indexOf('}', index) + 1);
}

/**
 * Tombol mic saat merekam: kotak bersih + cincin durasi + bubble di atasnya.
 *
 * Masalah yang diperbaiki: dulu ikon, 5 bar gelombang, dan teks "10s" dipaksa
 * muat DI DALAM tombol. Di meja main tombolnya hanya 44×44 px (--ctl-h), jadi
 * di HP ketiganya saling menimpa dan tampak rusak. Sekarang:
 *
 *   - isi tombol = ikon saja, di tengah
 *   - durasi = cincin yang mengisi tepi tombol (seperti stopwatch)
 *   - gelombang + sisa detik = bubble melayang di ATAS tombol
 *
 * Semua ini tidak bisa diverifikasi di jsdom (tidak ada layout), jadi tes
 * memeriksa struktur DOM dan aturan CSS sumbernya.
 */

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
  const render = async next => {
    await act(async () => { root.render(React.createElement(PTTButton, next)); });
  };
  await render(props);
  return {
    host,
    render,
    button: () => host.querySelector('.ptt__button'),
    bubble: () => host.querySelector('.ptt__bubble'),
    unmount: async () => { await act(async () => { root.unmount(); }); host.remove(); },
  };
}

describe('PTTButton — tampilan saat merekam', () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
  afterEach(() => { vi.useRealTimers(); });

  it('tombol HANYA berisi ikon saat merekam (tidak ada bar/timer di dalam)', async () => {
    const view = await mountButton({
      recording: true, elapsed: 3200, maxDurationMs: 10000,
      onStart: vi.fn(), onStop: vi.fn(),
    });
    const button = view.button();

    // Isi tombol: ikon saja. Tidak ada gelombang, timer, atau label teks.
    expect(button.querySelector('.ptt__icon')).toBeTruthy();
    expect(button.querySelector('.ptt__wave')).toBeNull();
    expect(button.querySelector('.ptt__timer')).toBeNull();
    expect(button.querySelector('.ptt__label')).toBeNull();

    await view.unmount();
  });

  it('gelombang dan sisa detik muncul di bubble DI ATAS tombol', async () => {
    const view = await mountButton({
      recording: true, elapsed: 3200, maxDurationMs: 10000,
      onStart: vi.fn(), onStop: vi.fn(),
    });

    const bubble = view.bubble();
    expect(bubble).toBeTruthy();
    // Bubble adalah SAUDARA tombol, bukan anaknya — supaya bisa melayang di
    // atas tanpa ikut terjepit di dalam kotak 44px.
    expect(view.button().contains(bubble)).toBe(false);
    expect(bubble.parentElement.contains(view.button())).toBe(true);

    expect(bubble.querySelectorAll('.ptt__wave-bar').length).toBeGreaterThan(0);
    // 10000 - 3200 = 6800 ms → 7 detik sisa.
    expect(bubble.querySelector('.ptt__timer').textContent).toBe('7s');
    expect(bubble.getAttribute('role')).toBe('status');

    await view.unmount();
  });

  it('durasi dikirim ke CSS sebagai --ptt-progress untuk cincin border', async () => {
    const view = await mountButton({
      recording: true, elapsed: 5000, maxDurationMs: 10000,
      onStart: vi.fn(), onStop: vi.fn(),
    });
    // 5000/10000 = 50%.
    expect(view.button().style.getPropertyValue('--ptt-progress')).toBe('50%');
    await view.unmount();
  });

  it('tidak mengirim --ptt-progress saat tidak merekam', async () => {
    const view = await mountButton({ onStart: vi.fn(), onStop: vi.fn() });
    expect(view.button().style.getPropertyValue('--ptt-progress')).toBe('');
    expect(view.bubble()).toBeNull();
    await view.unmount();
  });

  it('geser ke atas mengubah bubble jadi "Lepas untuk batal"', async () => {
    // Alur nyata: tekan saat belum merekam → parent menyalakan recording →
    // geser ke atas. Kalau langsung dirender dengan recording=true, `begin`
    // sengaja berhenti lebih awal dan sliding tidak pernah ter-set.
    const view = await mountButton({ onStart: vi.fn(), onStop: vi.fn() });

    await act(async () => {
      firePointer(view.button(), 'pointerdown', { clientY: 300 });
    });
    await act(async () => {
      view.render({ recording: true, elapsed: 1000, maxDurationMs: 10000, onStart: vi.fn(), onStop: vi.fn() });
    });
    await act(async () => {
      firePointer(view.button(), 'pointermove', { clientY: 200 });
    });

    const bubble = view.bubble();
    expect(bubble.className).toContain('is-cancel');
    expect(bubble.textContent).toContain('Lepas untuk batal');

    await view.unmount();
  });
});

describe('CSS — cincin durasi dan bubble', () => {
  it('bubble diposisikan absolut di atas tombol', () => {
    const block = rule('.ptt__bubble');
    expect(block).toBeTruthy();
    expect(block).toContain('position: absolute');
    expect(block).toContain('bottom: calc(100% + 8px)');
    // Mengambang di tengah tombol.
    expect(block).toContain('translateX(-50%)');
    // Tidak boleh menangkap sentuhan: ia menutupi area di atas tombol.
    expect(block).toContain('pointer-events: none');
  });

  it('wadah .ptt position relative agar bubble menempel pada tombol', () => {
    const block = rule('.ptt');
    expect(block).toBeTruthy();
    expect(block).toContain('position: relative');
  });

  it('durasi digambar sebagai cincin conic-gradient, bukan garis di dasar', () => {
    const block = rule('.ptt__button.is-recording::after');
    expect(block).toBeTruthy();
    expect(block).toContain('conic-gradient');
    expect(block).toContain('var(--ptt-progress, 0%)');
    // Lubang di tengah: hanya tepi yang terlihat.
    expect(block).toContain('mask-composite');
    expect(block).toContain('inset: -3px');
  });

  it('tombol tidak memakai overflow hidden (akan memotong cincin)', () => {
    const block = rule('.ptt__button');
    expect(block).toBeTruthy();
    expect(block).not.toContain('overflow: hidden');
  });

  it('garis progres lama di dasar tombol sudah dihapus', () => {
    // .ptt__progress lama adalah div 3px di dasar tombol — tidak terlihat di
    // kotak 44px, dan itulah yang membuat tampilan terasa berantakan.
    expect(appCss).not.toContain('.ptt__progress');
    expect(appCss).not.toContain('.ptt__live');
  });

  it('saat merekam tombol menyusut jadi kotak (padding 0)', () => {
    const block = rule('.ptt__button.is-recording:not(.is-cancel)');
    expect(block).toBeTruthy();
    expect(block).toContain('padding: 0');
    expect(block).toContain('aspect-ratio: 1');
  });

  it('warna batal menang atas warna rekam di meja main (spesifisitas)', () => {
    // Regresi nyata: aturan rekam di meja main punya 4 kelas
    // (`.ptt-game-slot .ptt--compact .ptt__button.is-recording`) sehingga
    // mengalahkan `.ptt__button.is-cancel` yang hanya 2 kelas — akibatnya
    // pemain menggeser jari ke atas tapi tombolnya tetap merah "merekam",
    // tidak ada konfirmasi bahwa pelepasannya akan membatalkan.
    const mediaBlock = rule('.ptt-game-slot .ptt--compact .ptt__button.is-recording:not(.is-cancel)');
    expect(mediaBlock).toBeTruthy();
    expect(mediaBlock).toContain(':not(.is-cancel)');

    const cancelBlock = rule('.ptt-game-slot .ptt--compact .ptt__button.is-recording.is-cancel');
    expect(cancelBlock).toBeTruthy();
    expect(cancelBlock).toContain('#6B6257');
  });
});
