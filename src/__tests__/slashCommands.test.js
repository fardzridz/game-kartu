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
import { applyIntent, createRoom, dealAcesTo } from '../engine/roomEngine.js';
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
    expect(Object.keys(COMMANDS)).toEqual(['pleeer', 'nyocot', 'pelumas']);
  });
});

describe('engine: perintah slash', () => {
  it('aktif saat giliran sendiri di fase minum dan ada Joker', () => {
    const room = withPile(setup(), [num(5), joker(), num(7)]);
    const result = act_(room, { type: 'command', code: 'pleeer' }, 'host', afterDeal(room));
    expect(result.error).toBeUndefined();
    expect(result.room.game.players[0].pendingJoker).toBe(true);
    expect(result.room.game.players[0].cmdUsed.pleeer).toBe(1);
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
    expect(second.error).toMatch(/jatah habis/i);
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
    expect(used.game.players[0].cmdUsed.pleeer).toBe(1);

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


describe('engine: /nyocot (intip kartu lawan)', () => {
  const setup3 = () => {
    let room = createRoom({ code: 'NYC123', hostId: 'host', name: 'Host', now: NOW });
    room = act_(room, { type: 'sit', name: 'Budi', avatar: 'jake' }, 'budi').room;
    room = act_(room, { type: 'sit', name: 'Ayu', avatar: 'bmo' }, 'ayu').room;
    room = act_(room, { type: 'ready', value: true }, 'budi').room;
    room = act_(room, { type: 'ready', value: true }, 'ayu').room;
    return act_(room, { type: 'start' }, 'host').room;
  };
  const withHands = (room, hands) => ({
    ...room,
    game: {
      ...room.game,
      players: room.game.players.map((player, index) => ({ ...player, hand: hands[index] || player.hand })),
    },
  });

  it('mengembalikan kartu lawan yang diminta lewat nama', () => {
    const room = setup3();
    const result = act_(room, { type: 'command', code: 'nyocot', target: 'budi' }, 'host', afterDeal(room));
    expect(result.error).toBeUndefined();
    expect(result.peek.targetName).toBe('Budi');
    expect(result.peek.cards.map(card => card.uid)).toEqual(room.game.players[1].hand.map(card => card.uid));
    expect(result.room.game.players[0].cmdUsed.nyocot).toBe(1);
  });

  it('boleh dipakai walau bukan giliran sendiri', () => {
    const base = setup3();
    const room = { ...base, game: { ...base.game, turn: 1 } };
    const result = act_(room, { type: 'command', code: 'nyocot', target: 'ayu' }, 'host', afterDeal(room));
    expect(result.error).toBeUndefined();
    expect(result.peek.targetName).toBe('Ayu');
  });

  it('jatah tiga kali per ronde, percobaan keempat ditolak', () => {
    let room = setup3();
    const time = afterDeal(room);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = act_(room, { type: 'command', code: 'nyocot', target: 'budi' }, 'host', time);
      expect(result.error).toBeUndefined();
      room = result.room;
    }
    expect(room.game.players[0].cmdUsed.nyocot).toBe(3);
    const fourth = act_(room, { type: 'command', code: 'nyocot', target: 'budi' }, 'host', time);
    expect(fourth.error).toMatch(/jatah habis/i);
    expect(fourth.room).toBeUndefined();
  });

  it('tanpa nama memilih lawan dengan kartu paling sedikit', () => {
    const base = setup3();
    const room = withHands(base, [base.game.players[0].hand, base.game.players[1].hand.slice(0, 5), base.game.players[2].hand.slice(0, 3)]);
    const result = act_(room, { type: 'command', code: 'nyocot' }, 'host', afterDeal(room));
    expect(result.peek.targetName).toBe('Ayu');
    expect(result.peek.cards).toHaveLength(3);
  });

  it('/nyocot all mengintip SEMUA lawan sekaligus', () => {
    const room = setup3();
    const result = act_(room, { type: 'command', code: 'nyocot', target: 'all' }, 'host', afterDeal(room));
    expect(result.error).toBeUndefined();
    expect(result.peek.mode).toBe('all');
    expect(result.peek.targets).toHaveLength(2);
    expect(result.peek.targets.map(target => target.name)).toEqual(['Budi', 'Ayu']);
    expect(result.peek.targets[0].cards.map(card => card.uid)).toEqual(room.game.players[1].hand.map(card => card.uid));
    // Tetap memakan satu jatah, bukan gratis.
    expect(result.room.game.players[0].cmdUsed.nyocot).toBe(1);
    expect(countTableCards(result.room.game)).toBe(countTableCards(room.game));
    expect(JSON.stringify(result.room)).not.toContain('peek');
  });

  it('mode satu lawan ditandai mode "one"', () => {
    const room = setup3();
    const result = act_(room, { type: 'command', code: 'nyocot', target: 'budi' }, 'host', afterDeal(room));
    expect(result.peek.mode).toBe('one');
    expect(result.peek.targets).toBeUndefined();
  });

  it('nama lawan dua kata tetap bisa dibidik', () => {
    let room = createRoom({ code: 'NYC999', hostId: 'host', name: 'Host', now: NOW });
    room = act_(room, { type: 'sit', name: 'Bot Dua', avatar: 'jake' }, 'bot2').room;
    room = act_(room, { type: 'ready', value: true }, 'bot2').room;
    room = act_(room, { type: 'start' }, 'host').room;
    const result = act_(room, { type: 'command', code: 'nyocot', target: 'bot dua' }, 'host', afterDeal(room));
    expect(result.peek.targetName).toBe('Bot Dua');
  });

  it('nama tak dikenal gagal tanpa memakan jatah', () => {
    const room = setup3();
    const result = act_(room, { type: 'command', code: 'nyocot', target: 'zzz' }, 'host', afterDeal(room));
    expect(result.error).toMatch(/tidak ada di meja/i);
    expect(room.game.players[0].cmdUsed).toBeUndefined();
  });

  it('hasil intip tidak ditulis ke state meja & kartu tetap utuh', () => {
    const room = setup3();
    const result = act_(room, { type: 'command', code: 'nyocot', target: 'budi' }, 'host', afterDeal(room));
    expect(JSON.stringify(result.room)).not.toContain('peek');
    expect(countTableCards(result.room.game)).toBe(countTableCards(room.game));
  });
});


describe('engine: /pelumas — tiga As sebelum ronde', () => {
  const lobby = () => {
    let room = createRoom({ code: 'PLM123', hostId: 'host', name: 'Host', now: NOW });
    room = act_(room, { type: 'sit', name: 'Tamu', avatar: 'jake' }, 'guest').room;
    room = act_(room, { type: 'ready', value: true }, 'guest').room;
    return room;
  };

  it('menandai kursi di ruang tunggu', () => {
    const room = lobby();
    const result = act_(room, { type: 'command', code: 'pelumas' }, 'host', NOW);
    expect(result.error).toBeUndefined();
    expect(result.room.seats[0].pendingAces).toBe(true);
    expect(result.message).toMatch(/As/);
  });

  it('alias /plir diperlakukan sama', () => {
    const room = lobby();
    const result = act_(room, { type: 'command', code: 'plir' }, 'guest', NOW);
    expect(result.error).toBeUndefined();
    expect(result.room.seats[1].pendingAces).toBe(true);
  });

  it('ditolak saat ronde sudah berjalan', () => {
    const playing = act_(lobby(), { type: 'start' }, 'host').room;
    const result = act_(playing, { type: 'command', code: 'pelumas' }, 'host', NOW);
    expect(result.error).toMatch(/sebelum ronde/i);
  });

  it('ditolak dua kali sebelum ronde mulai', () => {
    const once = act_(lobby(), { type: 'command', code: 'pelumas' }, 'host', NOW).room;
    const again = act_(once, { type: 'command', code: 'pelumas' }, 'host', NOW);
    expect(again.error).toMatch(/sudah siap/i);
  });

  it('setelah kocok: kursi bertanda dapat As, penanda dibersihkan, kartu utuh', () => {
    // Math.random dikunci supaya urutan kocokan sama di setiap run — tanpa ini
    // jumlah As yang tersisa di tumpukan bisa berbeda dan test jadi flaky.
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.42);
    try {
      const flagged = act_(lobby(), { type: 'command', code: 'pelumas' }, 'host', NOW).room;
      const started = act_(flagged, { type: 'start' }, 'host', NOW);
      expect(started.error).toBeUndefined();
      const me = started.room.game.players[0];
      expect(me.hand).toHaveLength(6);
      expect(me.hand.filter(card => String(card.value) === 'A').length).toBeGreaterThanOrEqual(1);
      // Penanda sekali pakai: hilang dari kursi & tidak bocor ke state ronde.
      expect(started.room.seats[0].pendingAces).toBeUndefined();
      expect(me.pendingAces).toBeUndefined();
      // Tidak ada kartu yang lahir/hilang.
      expect(countTableCards(started.room.game)).toBe(expectedDeckTotal(started.room.game.players.length));
    } finally {
      spy.mockRestore();
    }
  });

  it('dealAcesTo menukar tepat tiga As tanpa mengubah jumlah kartu', () => {
    const game = {
      players: [
        { id: 'a', hand: [num(2), num(3), num(4), num(5), num(6), num(7)] },
        { id: 'b', hand: [num(8), num(9), num(10)] },
      ],
      drawPile: [
        num(2, '♥'),
        { uid: 'as-1', suit: '♠', value: 'A', kind: 'standard' },
        { uid: 'as-2', suit: '♥', value: 'A', kind: 'standard' },
        { uid: 'as-3', suit: '♦', value: 'A', kind: 'standard' },
      ],
      discardPile: [],
    };
    const before = countTableCards(game);
    const out = dealAcesTo(game, new Set(['a']));
    expect(out.players[0].hand.filter(card => String(card.value) === 'A')).toHaveLength(3);
    expect(out.players[0].hand).toHaveLength(6);
    expect(out.drawPile).toHaveLength(4);
    expect(countTableCards(out)).toBe(before);
    // Lawan tidak tersentuh.
    expect(out.players[1].hand).toEqual(game.players[1].hand);
  });

  it('dealAcesTo tidak memaksa bila As di tumpukan kurang', () => {
    const game = {
      players: [{ id: 'a', hand: [num(2), num(3), num(4), num(5), num(6), num(7)] }],
      drawPile: [{ uid: 'as-1', suit: '♠', value: 'A', kind: 'standard' }],
      discardPile: [],
    };
    const out = dealAcesTo(game, new Set(['a']));
    expect(out.players[0].hand.filter(card => String(card.value) === 'A')).toHaveLength(1);
    expect(out.players[0].hand).toHaveLength(6);
    expect(out.drawPile).toHaveLength(1);
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

      expect(onCommand).toHaveBeenCalledWith('pleeer', []);
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


  it('meneruskan nama lawan sebagai argumen perintah', async () => {
    const onCommand = vi.fn(() => ({ ok: true, message: '🃏 Budi: 6 kartu' }));
    const view = await mount(onCommand);
    try {
      const input = view.host.querySelector('#tkfx-chat-input');
      await typeInto(input, '/nyocot budi');
      await pressEnter(input);

      expect(onCommand).toHaveBeenCalledWith('nyocot', ['budi']);
      expect(view.host.querySelector('.tkfx-chat__cmd').textContent).toContain('Budi');
      expect(channels.every(channel => channel.posted.length === 0)).toBe(true);
    } finally {
      await view.unmount();
    }
  });

  it('meneruskan "all" sebagai argumen perintah', async () => {
    const onCommand = vi.fn(() => ({ ok: true, message: '🃏 2 lawan' }));
    const view = await mount(onCommand);
    try {
      const input = view.host.querySelector('#tkfx-chat-input');
      await typeInto(input, '/nyocot all');
      await pressEnter(input);

      expect(onCommand).toHaveBeenCalledWith('nyocot', ['all']);
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
