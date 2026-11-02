/**
 * Test obrolan meja main (tab "Obrolan" di panel Bumbu Tongkrongan).
 *
 * Dua lapis:
 *   1. Fungsi murni di utils/tableChat.js — tanpa DOM, cepat, deterministik.
 *   2. DOM: tab bar 3 tab di TauntThrowSystem + komposer chat + rate limit.
 *
 * Catatan penting: test lama di tongkronganFX.test.js menghitung
 * `TAUNTS.length + THROWABLES.length` chip di dalam panel. Test di sini
 * mengunci janji itu secara eksplisit — semua chip harus tetap ter-mount
 * walau hanya satu tab yang terlihat.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import TauntThrowSystem, { TAUNTS, THROWABLES } from '../components/TauntThrowSystem.jsx';
import {
  QUICK_PHRASES,
  TABLE_CHAT_NODE,
  appendMessage,
  cooldownLeftAt,
  pruneExpired,
  sendGate,
  toChatEntry,
} from '../utils/tableChat.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PLAYERS = [
  { id: 'u1', name: 'Ayu', avatar: 'finn', bot: false },
  { id: 'u2', name: 'Budi', avatar: 'jake', bot: true },
];

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
}

const flush = () => new Promise(resolve => setTimeout(resolve, 20));

const click = async (el) => {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await flush();
  });
};

async function mountPanel(props = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(TauntThrowSystem, {
      roomCode: 'TAB1',
      mySeatId: 'u1',
      players: PLAYERS,
      ...props,
    }));
  });
  await act(async () => { await flush(); });
  return {
    host,
    open: async () => {
      await click(host.querySelector('.tkfx-fab'));
    },
    unmount: async () => {
      await act(async () => { root.unmount(); });
      host.remove();
    },
  };
}

const tabByText = (host, label) => Array.from(host.querySelectorAll('.tkfx-tab'))
  .find(node => node.textContent.startsWith(label));

describe('utils/tableChat (fungsi murni)', () => {
  it('menormalkan payload jaringan dan menandai pesan sendiri', () => {
    const entry = toChatEntry({
      id: 'm1',
      from: 'u1',
      name: '  Ayu  ',
      avatar: 'x'.repeat(40),
      text: 'halo',
      ts: 1700000000000,
    }, 'u1');

    expect(entry.id).toBe('m1');
    expect(entry.name).toBe('Ayu');
    expect(entry.avatar.length).toBe(32);
    expect(entry.mine).toBe(true);
  });

  it('memotong teks ke 200 karakter dan memberi nama cadangan', () => {
    const entry = toChatEntry({ from: 'u2', text: 'a'.repeat(500), ts: 1 }, 'u1');
    expect(entry.text.length).toBe(200);
    expect(entry.name).toBe('Pemain');
    expect(entry.mine).toBe(false);
  });

  it('id cadangan stabil supaya pesan tanpa id tidak tampil ganda', () => {
    const payload = { from: 'u2', text: 'hai', ts: 42 };
    expect(toChatEntry(payload, 'u1').id).toBe(toChatEntry(payload, 'u1').id);
  });

  it('appendMessage membuang duplikat id, mengurutkan, dan membatasi riwayat', () => {
    const a = { id: 'a', ts: 2, text: 'dua' };
    const b = { id: 'b', ts: 1, text: 'satu' };
    let list = appendMessage([], a);
    list = appendMessage(list, b);
    expect(list.map(item => item.id)).toEqual(['b', 'a']);
    // Duplikat tidak menambah panjang.
    expect(appendMessage(list, a)).toHaveLength(2);
    // Batas riwayat.
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `m${i}`, ts: i }));
    expect(appendMessage(many, { id: 'last', ts: 99 }, 20)).toHaveLength(20);
  });

  it('pruneExpired membuang pesan yang lewat umur tampilan', () => {
    const now = 100000;
    const list = [{ id: 'old', ts: now - 40000 }, { id: 'new', ts: now - 1000 }];
    expect(pruneExpired(list, now, 30000).map(item => item.id)).toEqual(['new']);
  });

  it('cooldown 2 detik dihitung dari serverNow', () => {
    expect(cooldownLeftAt(0, 5000)).toBe(0);
    expect(cooldownLeftAt(7000, 5000)).toBe(2000);
    expect(sendGate(1000, 2500)).toEqual({ allowed: false, until: 3000 });
    expect(sendGate(1000, 3000)).toEqual({ allowed: true, until: 3000 });
  });
});

describe('Tab panel Bumbu Tongkrongan', () => {
  beforeEach(() => {
    instances = [];
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('membuka 3 tab dengan tab Ejekan aktif secara default', async () => {
    const view = await mountPanel();
    try {
      await view.open();
      const tabs = view.host.querySelectorAll('.tkfx-tab');
      expect(tabs).toHaveLength(3);
      expect(tabByText(view.host, 'Ejekan').getAttribute('aria-selected')).toBe('true');
      expect(tabByText(view.host, 'Lempar').getAttribute('aria-selected')).toBe('false');
      expect(tabByText(view.host, 'Obrolan').getAttribute('aria-selected')).toBe('false');
    } finally {
      await view.unmount();
    }
  });

  it('semua chip ejekan & lemparan tetap ter-mount (kontrak test lama)', async () => {
    const view = await mountPanel();
    try {
      await view.open();
      const chips = view.host.querySelectorAll('.tkfx-panel .tkfx-chip');
      expect(chips).toHaveLength(TAUNTS.length + THROWABLES.length);
      // Pane yang tidak aktif disembunyikan, bukan dibuang dari DOM.
      expect(view.host.querySelector('#tkfx-pane-lempar').hasAttribute('hidden')).toBe(true);
      expect(view.host.querySelector('#tkfx-pane-ejekan').hasAttribute('hidden')).toBe(false);
    } finally {
      await view.unmount();
    }
  });

  it('ganti ke tab Lempar menampilkan barang dan menyembunyikan ejekan', async () => {
    const view = await mountPanel();
    try {
      await view.open();
      await click(tabByText(view.host, 'Lempar'));
      expect(view.host.querySelector('#tkfx-pane-lempar').hasAttribute('hidden')).toBe(false);
      expect(view.host.querySelector('#tkfx-pane-ejekan').hasAttribute('hidden')).toBe(true);
      expect(tabByText(view.host, 'Lempar').getAttribute('aria-selected')).toBe('true');
    } finally {
      await view.unmount();
    }
  });

  it('tab Obrolan punya komposer, frasa cepat, dan pengingat timer', async () => {
    const view = await mountPanel();
    try {
      await view.open();
      await click(tabByText(view.host, 'Obrolan'));

      const input = view.host.querySelector('#tkfx-chat-input');
      expect(input).toBeTruthy();
      expect(input.getAttribute('maxlength')).toBe('200');
      expect(view.host.querySelectorAll('.tkfx-chat__phrase')).toHaveLength(QUICK_PHRASES.length);
      expect(view.host.querySelector('.tkfx-chat__note').textContent).toContain('Timer giliran tetap jalan');
      expect(view.host.querySelector('.tkfx-chat__empty').textContent).toContain('Belum ada obrolan');
    } finally {
      await view.unmount();
    }
  });

  it('frasa cepat terkirim sebagai teks murni lalu kena rate limit', async () => {
    const view = await mountPanel();
    try {
      await view.open();
      await click(tabByText(view.host, 'Obrolan'));

      const phrases = view.host.querySelectorAll('.tkfx-chat__phrase');
      await click(phrases[0]);

      const msgs = view.host.querySelectorAll('.tkfx-chat__msg');
      expect(msgs).toHaveLength(1);
      expect(msgs[0].textContent).toContain('Mantap!');
      expect(msgs[0].textContent).toContain('Kamu');
      // Kirim kedua langsung: ditahan cooldown, tidak menambah pesan.
      await click(phrases[1]);
      expect(view.host.querySelectorAll('.tkfx-chat__msg')).toHaveLength(1);
      expect(view.host.querySelector('.tkfx-chat__hint').textContent).toContain('Tunggu');
    } finally {
      await view.unmount();
    }
  });

  it('chat tidak bocor ke DOM di luar panel dan tidak memakai HTML mentah', async () => {
    const view = await mountPanel();
    try {
      await view.open();
      await click(tabByText(view.host, 'Obrolan'));
      const input = view.host.querySelector('#tkfx-chat-input');
      // Teks berbahaya tetap jadi nilai input biasa, bukan markup.
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, '<script>alert(1)</script>');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await flush();
      });
      expect(view.host.querySelector('#tkfx-chat-input').value).toBe('<script>alert(1)</script>');
      expect(view.host.querySelector('script')).toBeNull();
    } finally {
      await view.unmount();
    }
  });
});

describe('Aturan proyek tetap dijaga', () => {
  const read = path => readFileSync(join(process.cwd(), path), 'utf8');

  it('tidak ada dangerouslySetInnerHTML di modul chat meja', () => {
    ['src/components/TableChatPanel.jsx', 'src/hooks/useTableChat.js', 'src/utils/tableChat.js']
      .forEach(path => expect(read(path)).not.toContain('dangerouslySetInnerHTML'));
  });

  it('node RTDB tableChats punya batas panjang 200 karakter', () => {
    const rules = JSON.parse(read('firebase.rules.json'));
    const node = rules.rules.rooms.$code[TABLE_CHAT_NODE];
    expect(node).toBeTruthy();
    expect(node.$eventId['.validate']).toContain("val().length <= 200");
    expect(node.$eventId['.validate']).toContain('isNumber()');
  });

  it('engine tidak diimpor oleh modul chat meja (aturan keras brief)', () => {
    ['src/hooks/useTableChat.js', 'src/utils/tableChat.js', 'src/components/TableChatPanel.jsx']
      .forEach(path => expect(read(path)).not.toContain('/engine/'));
  });

  it('GameBoard meneruskan objek room ke panel Bumbu (dibutuhkan kode meja)', () => {
    expect(read('src/components/GameBoard.jsx')).toContain('room={live}');
  });
});
