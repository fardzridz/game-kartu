/**
 * Test perintah slash internal di kolom obrolan meja.
 *
 * Tiga lapis, sesuai pembagian tanggung jawab:
 *   1. `utils/slashCommands.js` — parser murni (apa yang dianggap perintah).
 *   2. `engine/roomEngine.js` + `gameRules.drawCard` — aturan main: cek Joker
 *      dulu, jatah sekali per ronde, gagal tanpa memakan jatah, audit kartu
 *      tetap utuh.
 *   3. DOM — ketikan "/" tidak pernah terkirim sebagai pesan obrolan, dan
 *      balasannya tampil di panel.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import TauntThrowSystem from '../components/TauntThrowSystem.jsx';
import { applyIntent, createRoom } from '../engine/roomEngine.js';
import { countTableCards, expectedDeckTotal, startRound } from '../engine/gameRules.js';
import { COMMANDS, parseSlashCommand } from '../utils/slashCommands.js';

const NOW = 1_700_000_000_000;
const act_ = (room, intent, actor = 'host', now = NOW) => applyIntent(room, intent, actor, now);

const setup = () => {
  let room = createRoom({ code: 'CHT123', hostId: 'host', name: 'Host', now: NOW });
  room = act_(room, { type: 'sit', name: 'Tamu', avatar: 'jake' }, 'guest').room;
  room = act_(room, { type: 'ready', value: true }, 'guest').room;
  return act_(room, { type: 'start' }, 'host').room;
};

/** Waktu setelah upacara pembagian kartu selesai. */
const afterDeal = room => room.game.dealingUntil + 1;
const joker = (n = 0) => ({ uid: `joker-${n}`, suit: null, value: 'JOKER', kind: 'joker' });
const num = (value, suit = '♠') => ({ uid: `n-${value}-${suit}`, suit, value: String(value), kind: 'standard' });

/** Ganti tumpukan minum supaya isi Joker bisa dikendalikan test. */
const withPile = (room, cards, extra = {}) => ({
  ...room,
  game: { ...room.game, drawPile: cards, discardPile: [], phase: 'draw', turn: 0, ...extra },
});

describe('utils/slashCommands (parser murni)', () => {
  it('mengenali /pleeer sebagai perintah sah', () => {
    const parsed = parseSlashCommand('/pleeer');
    expect(parsed.isCommand).toBe(true);
    expect(parsed.code).toBe('pleeer');
    expect(parsed.unknown).toBe(false);
    expect(COMMANDS.pleeer.command).toBe('/pleeer');
  });

  it('tahan huruf besar, spasi, dan argumen tambahan', () => {
    expect(parseSlashCommand('  /PLEEER  ').code).toBe('pleeer');
    expect(parseSlashCommand('/pleeer sekarang').code).toBe('pleeer');
    expect(parseSlashCommand('/pleeer sekarang').args).toEqual(['sekarang']);
  });

  it('pesan biasa bukan perintah', () => {
    expect(parseSlashCommand('halo semua').isCommand).toBe(false);
    expect(parseSlashCommand('').isCommand).toBe(false);
    expect(parseSlashCommand('a/b').isCommand).toBe(false);
  });

  it('perintah tak dikenal tetap ditandai perintah (tidak dikirim ke chat)', () => {
    expect(parseSlashCommand('/ngawur').unknown).toBe(true);
    expect(parseSlashCommand('/').unknown).toBe(true);
  });

  it('tidak menyediakan daftar/bantuan perintah (rahasia)', () => {
    // Tidak ada kode bantuan: satu-satunya jalan tahu adalah diberi tahu
    // pemilik project. `/cheat` pun dianggap tak dikenal → ditelan diam-diam.
    expect(parseSlashCommand('/cheat').unknown).toBe(true);
    expect(parseSlashCommand('/bantuan').unknown).toBe(true);
    expect(Object.keys(COMMANDS)).toEqual(['pleeer']);
  });
});

describe('engine: perintah slash', () => {
  it('aktif saat giliran sendiri di fase minum dan ada Joker', () => {
    const room = withPile(setup(), [num(5), joker(), num(7)]);
    const result = act_(room, { type: 'command', code: 'pleeer' }, 'host', afterDeal(room));
    expect(result.error).toBeUndefined();
    expect(result.room.game.players[0].pendingJoker).toBe(true);
    expect(result.room.game.players[0].cmdUsed.pleeer).toBe(true);
    expect(result.message).toMatch(/Joker/);
  });

  it('minum berikutnya benar-benar Joker dan tumpukan tetap utuh', () => {
    const room = withPile(setup(), [num(5), joker(), num(7)]);
    const time = afterDeal(room);
    const before = countTableCards(room.game);
    const cheated = act_(room, { type: 'command', code: 'pleeer' }, 'host', time).room;
    const drawn = act_(cheated, { type: 'draw' }, 'host', time + 10);

    const me = drawn.room.game.players[0];
    expect(me.hand.some(card => card.value === 'JOKER')).toBe(true);
    expect(me.pendingJoker).toBe(false);
    expect(drawn.room.game.drawPile.some(card => card.value === 'JOKER')).toBe(false);
    expect(drawn.room.game.drawPile).toHaveLength(2);
    // Audit meja: tidak ada kartu yang hilang atau lahir dari cheat — jumlah
    // kartu di meja harus sama persis sebelum dan sesudah.
    expect(countTableCards(drawn.room.game)).toBe(before);
    expect(expectedDeckTotal(drawn.room.game.players.length)).toBe(55);
  });

  it('gagal (dan jatah tidak hangus) bila tumpukan minum tanpa Joker', () => {
    const room = withPile(setup(), [num(2), num(3), num(4)]);
    const result = act_(room, { type: 'command', code: 'pleeer' }, 'host', afterDeal(room));
    expect(result.error).toMatch(/jatah utuh/i);
    expect(result.room).toBeUndefined();
    expect(room.game.players[0].cmdUsed).toBeUndefined();
  });

  it('hanya sekali per ronde', () => {
    const room = withPile(setup(), [joker()]);
    const time = afterDeal(room);
    const first = act_(room, { type: 'command', code: 'pleeer' }, 'host', time);
    expect(first.error).toBeUndefined();
    const second = act_(first.room, { type: 'command', code: 'pleeer' }, 'host', time);
    expect(second.error).toMatch(/sudah dipakai/i);
  });

  it('ditolak di luar giliran sendiri atau setelah fase minum', () => {
    const notMyTurn = withPile(setup(), [joker()], { turn: 1 });
    expect(act_(notMyTurn, { type: 'command', code: 'pleeer' }, 'host', afterDeal(notMyTurn)).error).toMatch(/giliranmu/i);

    const afterDraw = withPile(setup(), [joker()], { phase: 'play' });
    expect(act_(afterDraw, { type: 'command', code: 'pleeer' }, 'host', afterDeal(afterDraw)).error).toMatch(/giliranmu/i);
  });

  it('ditolak untuk penonton, kode tak dikenal, dan sebelum kartu dibagikan', () => {
    const room = withPile(setup(), [joker()]);
    expect(act_(room, { type: 'command', code: 'pleeer' }, 'penonton', afterDeal(room)).error).toMatch(/belum duduk/i);
    expect(act_(room, { type: 'command', code: 'ngawur' }, 'host', afterDeal(room)).error).toMatch(/tidak dikenal/i);
    expect(act_(room, { type: 'command', code: 'pleeer' }, 'host', NOW).error).toMatch(/Pembagian kartu/i);
  });

  it('jatah kembali penuh di ronde berikutnya', () => {
    const room = withPile(setup(), [joker()]);
    const used = act_(room, { type: 'command', code: 'pleeer' }, 'host', afterDeal(room)).room;
    expect(used.game.players[0].cmdUsed.pleeer).toBe(true);

    const nextRound = startRound(used.seats, { shufflerIndex: 0 });
    expect(nextRound.players[0].cmdUsed).toBeUndefined();
    expect(nextRound.players[0].pendingJoker).toBeUndefined();
  });

  it('minum biasa tetap mengambil kartu teratas (bukan Joker)', () => {
    const room = withPile(setup(), [num(5), joker()]);
    const drawn = act_(room, { type: 'draw' }, 'host', afterDeal(room));
    expect(drawn.room.game.players[0].hand.some(card => card.uid === 'n-5-♠')).toBe(true);
    expect(drawn.room.game.drawPile.some(card => card.value === 'JOKER')).toBe(true);
  });

  it('penanda cheat tidak menyangkut kalau Joker lenyap sebelum minum', () => {
    const base = setup();
    const room = {
      ...base,
      game: {
        ...base.game,
        drawPile: [num(9), num(10)],
        discardPile: [],
        phase: 'draw',
        turn: 0,
        players: base.game.players.map((player, index) => (index === 0 ? { ...player, pendingJoker: true } : player)),
      },
    };
    const result = act_(room, { type: 'draw' }, 'host', afterDeal(room));
    expect(result.room.game.players[0].pendingJoker).toBe(false);
    expect(result.message).toMatch(/gagal/i);
    expect(result.room.game.players[0].hand.some(card => card.uid === 'n-9-♠')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DOM: ketikan "/" tidak boleh bocor jadi pesan obrolan.
// ---------------------------------------------------------------------------

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PLAYERS = [
  { id: 'u1', name: 'Ayu', avatar: 'finn', bot: false },
  { id: 'u2', name: 'Budi', avatar: 'jake', bot: true },
];

let channels = [];

class FakeBroadcastChannel {
  constructor(name) {
    this.name = name;
    this.posted = [];
    this.onmessage = null;
    channels.push(this);
  }
  postMessage(data) { this.posted.push(data); }
  close() {}
}

const flush = () => new Promise(resolve => setTimeout(resolve, 20));

const click = async (el) => {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await flush();
  });
};

const typeInto = async (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
  });
};

const pressEnter = async (input) => {
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await flush();
  });
};

describe('DOM: perintah slash di kolom obrolan', () => {
  beforeEach(() => {
    channels = [];
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
  });
  afterEach(() => vi.unstubAllGlobals());

  async function mount(onCommand) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(React.createElement(TauntThrowSystem, {
        roomCode: 'CHT1',
        mySeatId: 'u1',
        players: PLAYERS,
        onCommand,
      }));
    });
    await act(async () => { await flush(); });
    await click(host.querySelector('.tkfx-fab'));
    return {
      host,
      unmount: async () => {
        await act(async () => { root.unmount(); });
        host.remove();
      },
    };
  }

  it('meneruskan perintah ke engine, menampilkan balasan, dan tidak mengirim pesan', async () => {
    const onCommand = vi.fn(() => ({ ok: true, message: '🃏 Joker siap — minum berikutnya jatahmu.' }));
    const view = await mount(onCommand);
    try {
      const input = view.host.querySelector('#tkfx-chat-input');
      expect(input).toBeTruthy();
      await typeInto(input, '/pleeer');
      await pressEnter(input);

      expect(onCommand).toHaveBeenCalledWith('pleeer');
      expect(view.host.querySelector('.tkfx-chat__cmd').textContent).toContain('Joker');
      expect(input.value).toBe('');
      // Bukti tidak bocor ke obrolan: kanal tidak pernah menerima pesan.
      expect(channels.every(channel => channel.posted.length === 0)).toBe(true);
    } finally {
      await view.unmount();
    }
  });

  it('perintah yang ditolak engine tampil sebagai kegagalan', async () => {
    const onCommand = vi.fn(() => ({ ok: false, message: '🃏 Nggak ada Joker di tumpukan minum — jatah utuh.' }));
    const view = await mount(onCommand);
    try {
      const input = view.host.querySelector('#tkfx-chat-input');
      await typeInto(input, '/pleeer');
      await pressEnter(input);

      const feedback = view.host.querySelector('.tkfx-chat__cmd');
      expect(feedback.className).toContain('is-fail');
      expect(feedback.textContent).toMatch(/jatah utuh/i);
      expect(channels.every(channel => channel.posted.length === 0)).toBe(true);
    } finally {
      await view.unmount();
    }
  });

  it('perintah tak dikenal ditelan diam-diam (tidak ada jejak apa pun)', async () => {
    const onCommand = vi.fn();
    const view = await mount(onCommand);
    try {
      const input = view.host.querySelector('#tkfx-chat-input');
      await typeInto(input, '/cheat');
      await pressEnter(input);

      // Tidak diteruskan ke engine, tidak dibalas, tidak masuk obrolan:
      // kalau UI menjawab "perintah tidak dikenal", rahasianya bocor.
      expect(onCommand).not.toHaveBeenCalled();
      expect(view.host.querySelector('.tkfx-chat__cmd')).toBeNull();
      expect(input.value).toBe('');
      expect(channels.every(channel => channel.posted.length === 0)).toBe(true);
    } finally {
      await view.unmount();
    }
  });
});
