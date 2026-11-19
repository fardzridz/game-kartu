/**
 * Test efek visual profil untuk reaksi suara (hihuu dkk).
 *
 * Tiga lapis:
 *   1. bus lokal — payload sah diteruskan, payload rusak diabaikan;
 *   2. konfigurasi katalog — hihuu punya emoji + label yang tampil;
 *   3. DOM — efek muncul di atas kursi pengirim, dedupe per id, hilang sendiri.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import VoiceProfileFx from '../components/VoiceProfileFx.jsx';
import {
  emitVoiceFx,
  fallbackPlayerPoint,
  resetVoiceFxBus,
  resolvePlayerPoint,
  subscribeVoiceFx,
} from '../utils/voiceFx.js';
import { findVoiceReactionFx } from '../utils/voiceReactions.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

/** Pasang elemen jangkar tiruan dengan ukuran tertentu. */
function addAnchor(playerId, { left = 100, top = 200, width = 40, height = 40 } = {}) {
  const node = document.createElement('div');
  node.setAttribute('data-player-id', playerId);
  node.getBoundingClientRect = () => ({
    left, top, width, height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  });
  document.body.appendChild(node);
  return node;
}

let host = null;
let root = null;

beforeEach(async () => {
  resetVoiceFxBus();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(VoiceProfileFx));
  });
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  host.remove();
  document.querySelectorAll('[data-player-id]').forEach(node => node.remove());
  resetVoiceFxBus();
  vi.useRealTimers();
});

describe('voiceFx — bus lokal', () => {
  it('meneruskan payload sah ke pendengar', () => {
    const seen = [];
    const stop = subscribeVoiceFx(detail => seen.push(detail));
    expect(emitVoiceFx({ reactionId: 'hihuu', fromId: 'p1', id: 'e1' })).toBe(true);
    stop();
    expect(seen).toEqual([{ reactionId: 'hihuu', fromId: 'p1', id: 'e1' }]);
  });

  it('membuat id sendiri bila tidak diberikan', () => {
    const seen = [];
    const stop = subscribeVoiceFx(detail => seen.push(detail));
    emitVoiceFx({ reactionId: 'waduh', fromId: 'p1' });
    stop();
    expect(seen[0].id).toBeTruthy();
    expect(seen[0].id).toContain('p1');
  });

  it('mengabaikan payload rusak dan pendengar yang sudah berhenti', () => {
    expect(emitVoiceFx(null)).toBe(false);
    expect(emitVoiceFx({})).toBe(false);
    expect(emitVoiceFx({ reactionId: 'hihuu' })).toBe(false);
    expect(emitVoiceFx({ fromId: 'p1' })).toBe(false);

    const seen = [];
    const stop = subscribeVoiceFx(detail => seen.push(detail));
    stop();
    emitVoiceFx({ reactionId: 'hihuu', fromId: 'p1' });
    expect(seen).toHaveLength(0);
  });

  it('pendengar yang error tidak memblokir pendengar lain', () => {
    const seen = [];
    const stopBad = subscribeVoiceFx(() => { throw new Error('rusak'); });
    const stopGood = subscribeVoiceFx(detail => seen.push(detail));
    emitVoiceFx({ reactionId: 'hihuu', fromId: 'p1', id: 'e2' });
    stopBad();
    stopGood();
    expect(seen).toHaveLength(1);
  });
});

describe('voiceReactions — konfigurasi efek', () => {
  it('hihuu punya emoji sorakan dan label besar', () => {
    expect(findVoiceReactionFx('hihuu')).toEqual({ emoji: '🙌', text: 'HIHUU!' });
  });

  it('reaksi tanpa efek atau id asing menghasilkan null', () => {
    expect(findVoiceReactionFx('ngawur')).toBeNull();
    expect(findVoiceReactionFx('')).toBeNull();
  });
});

describe('VoiceProfileFx — render di atas kursi', () => {
  it('muncul di profil pengirim dengan emoji dan label hihuu', async () => {
    vi.useFakeTimers();
    addAnchor('p1');

    await act(async () => {
      emitVoiceFx({ reactionId: 'hihuu', fromId: 'p1', id: 'evt-hihuu' });
      await vi.advanceTimersByTimeAsync(20);
    });

    const bursts = document.querySelectorAll('.tkfx-voicefx');
    expect(bursts).toHaveLength(1);
    expect(document.querySelector('.tkfx-voicefx__emoji').textContent).toBe('🙌');
    expect(document.querySelector('.tkfx-voicefx__text').textContent).toBe('HIHUU!');
  });

  it('id event yang sama tidak menggambar dua kali', async () => {
    addAnchor('p1');
    await act(async () => {
      emitVoiceFx({ reactionId: 'hihuu', fromId: 'p1', id: 'sama' });
      emitVoiceFx({ reactionId: 'hihuu', fromId: 'p1', id: 'sama' });
      await flush();
    });
    expect(document.querySelectorAll('.tkfx-voicefx')).toHaveLength(1);
  });

  it('reaksi tak dikenal tidak menggambar apa pun', async () => {
    addAnchor('p1');
    await act(async () => {
      emitVoiceFx({ reactionId: 'ngawur', fromId: 'p1', id: 'x' });
      await flush();
    });
    expect(document.querySelectorAll('.tkfx-voicefx')).toHaveLength(0);
  });

  it('tanpa jangkar kursi, efek tetap muncul di bawah-tengah layar', async () => {
    await act(async () => {
      emitVoiceFx({ reactionId: 'waduh', fromId: 'penonton', id: 'e3' });
      await flush();
    });
    const burst = document.querySelector('.tkfx-voicefx');
    expect(burst).toBeTruthy();
    const point = fallbackPlayerPoint();
    expect(burst.style.left).toBe(`${point.x}px`);
    expect(burst.style.top).toBe(`${point.y}px`);
  });

  it('hilang sendiri setelah masa tampil habis', async () => {
    vi.useFakeTimers();
    addAnchor('p1');
    await act(async () => {
      emitVoiceFx({ reactionId: 'hahaha', fromId: 'p1', id: 'e4' });
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(document.querySelectorAll('.tkfx-voicefx')).toHaveLength(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(2400); });
    expect(document.querySelectorAll('.tkfx-voicefx')).toHaveLength(0);
  });
});

describe('resolvePlayerPoint', () => {
  it('memakai atas-tengah avatar kursi yang cocok', () => {
    addAnchor('p7', { left: 120, top: 300, width: 60, height: 60 });
    expect(resolvePlayerPoint('p7')).toEqual({ x: 150, y: 300 });
  });

  it('mengabaikan elemen berukuran nol dan id kosong', () => {
    addAnchor('p0', { width: 0, height: 0 });
    expect(resolvePlayerPoint('p0')).toBeNull();
    expect(resolvePlayerPoint('')).toBeNull();
  });
});
