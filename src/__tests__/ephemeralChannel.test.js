import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  isStaleEvent,
  openEphemeralChannel,
  publishEphemeral,
} from '../services/ephemeralChannel.js';

// Mode test membuat firebaseActive() === false, sehingga openEphemeralChannel
// selalu jatuh ke BroadcastChannel. Itu jalur yang bisa dites tanpa jaringan —
// dan justru jalur yang dipakai mode simulasi lokal.

describe('isStaleEvent — filter riwayat lama', () => {
  const boot = 1_000_000;

  it('meloloskan pesan yang masih baru', () => {
    expect(isStaleEvent(boot - 100, boot, 30000)).toBe(false);
    expect(isStaleEvent(boot, boot, 30000)).toBe(false);
  });

  it('membuang pesan yang lebih tua dari batas', () => {
    expect(isStaleEvent(boot - 30001, boot, 30000)).toBe(true);
    expect(isStaleEvent(0, boot, 30000)).toBe(true);
  });

  it('tepat di batas masih dianggap baru', () => {
    expect(isStaleEvent(boot - 30000, boot, 30000)).toBe(false);
  });

  it('membuang timestamp yang tidak masuk akal', () => {
    expect(isStaleEvent(undefined, boot, 30000)).toBe(true);
    expect(isStaleEvent(null, boot, 30000)).toBe(true);
    expect(isStaleEvent('bukan angka', boot, 30000)).toBe(true);
    expect(isStaleEvent(NaN, boot, 30000)).toBe(true);
  });

  it('memakai batas default 30 detik saat staleMs tidak diberikan', () => {
    expect(isStaleEvent(boot - 31000, boot)).toBe(true);
    expect(isStaleEvent(boot - 1000, boot)).toBe(false);
  });
});

describe('publishEphemeral — tulis lalu bersihkan sendiri', () => {
  it('menulis payload lalu menghapus node setelah retainMs', () => {
    const node = { path: 'rooms/ABC/chats/-1' };
    const write = vi.fn(async () => {});
    const remove = vi.fn(async () => {});
    const timers = [];
    const schedule = vi.fn((fn, ms) => { timers.push({ fn, ms }); });

    const ok = publishEphemeral({ node, write, remove, retainMs: 30000, schedule, payload: { text: 'halo' } });

    expect(ok).toBe(true);
    expect(write).toHaveBeenCalledWith(node, { text: 'halo' });
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(timers[0].ms).toBe(30000);
    // Belum dihapus sebelum waktunya — pendengar lambat masih bisa membaca.
    expect(remove).not.toHaveBeenCalled();

    timers[0].fn();
    expect(remove).toHaveBeenCalledWith(node);
  });

  it('tidak melempar saat penulisan gagal (rules menolak / offline)', () => {
    const schedule = vi.fn();
    const ok = publishEphemeral({
      node: {},
      write: () => { throw new Error('PERMISSION_DENIED'); },
      remove: vi.fn(),
      schedule,
      payload: {},
    });
    expect(ok).toBe(false);
    expect(schedule).not.toHaveBeenCalled();
  });

  it('mengabaikan kegagalan penghapusan (node sudah hilang)', async () => {
    const timers = [];
    publishEphemeral({
      node: {},
      write: vi.fn(async () => {}),
      remove: () => { throw new Error('sudah dihapus host'); },
      retainMs: 10,
      schedule: (fn) => timers.push(fn),
      payload: {},
    });
    expect(() => timers[0]()).not.toThrow();
  });

  it('menelan promise rejection dari write dan remove', async () => {
    const timers = [];
    publishEphemeral({
      node: {},
      write: () => Promise.reject(new Error('offline')),
      remove: () => Promise.reject(new Error('offline')),
      retainMs: 10,
      schedule: fn => timers.push(fn),
      payload: {},
    });
    expect(() => timers[0]()).not.toThrow();
    await Promise.resolve();
  });
});

describe('openEphemeralChannel — mode BroadcastChannel', () => {
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
    // Mensimulasikan pesan dari tab lain.
    deliver(data) { if (this.onmessage) this.onmessage({ data }); }
  }

  beforeEach(() => {
    instances = [];
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('meneruskan pesan dari klien lain dan menyaring pesan sendiri', () => {
    const onEvent = vi.fn();
    openEphemeralChannel({
      roomCode: 'ABC123',
      nodeName: 'chats',
      channelName: 'remi-chats',
      selfClientId: 'me',
      onEvent,
    });

    const channel = instances[0];
    channel.deliver({ clientId: 'other', roomCode: 'ABC123', text: 'halo' });
    expect(onEvent).toHaveBeenCalledWith({ clientId: 'other', roomCode: 'ABC123', text: 'halo' });

    onEvent.mockClear();
    channel.deliver({ clientId: 'me', roomCode: 'ABC123', text: 'punyaku' });
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('menyaring pesan dari meja lain', () => {
    const onEvent = vi.fn();
    openEphemeralChannel({
      roomCode: 'ABC123',
      nodeName: 'chats',
      channelName: 'remi-chats',
      selfClientId: 'me',
      onEvent,
    });
    instances[0].deliver({ clientId: 'other', roomCode: 'ZZZ999', text: 'meja lain' });
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('mengabaikan payload rusak', () => {
    const onEvent = vi.fn();
    openEphemeralChannel({
      roomCode: 'ABC123', nodeName: 'chats', channelName: 'remi-chats', selfClientId: 'me', onEvent,
    });
    instances[0].deliver(null);
    instances[0].deliver(undefined);
    instances[0].deliver('teks');
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('send meng-echo ke pengirim sendiri karena BroadcastChannel tidak echo', () => {
    const onEvent = vi.fn();
    const channel = openEphemeralChannel({
      roomCode: 'ABC123', nodeName: 'chats', channelName: 'remi-chats', selfClientId: 'me', onEvent,
    });

    expect(channel.send({ text: 'hai' })).toBe(true);
    expect(instances[0].posted[0]).toMatchObject({ text: 'hai', clientId: 'me', roomCode: 'ABC123' });
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ text: 'hai' }));
  });

  it('close menutup channel', () => {
    const channel = openEphemeralChannel({
      roomCode: 'ABC123', nodeName: 'chats', channelName: 'remi-chats', selfClientId: 'me', onEvent: () => {},
    });
    channel.close();
    expect(instances[0].closed).toBe(true);
  });

  it('memakai nama channel yang diberikan (chat vs PTT terpisah)', () => {
    openEphemeralChannel({
      roomCode: 'ABC123', nodeName: 'chats', channelName: 'remi-chats', selfClientId: 'me', onEvent: () => {},
    });
    openEphemeralChannel({
      roomCode: 'ABC123', nodeName: 'ptt', channelName: 'remi-ptt', selfClientId: 'me', onEvent: () => {},
    });
    expect(instances.map(c => c.name)).toEqual(['remi-chats', 'remi-ptt']);
  });
});

describe('openEphemeralChannel — tanpa BroadcastChannel', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('mengembalikan no-op yang aman, tidak melempar', () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const onEvent = vi.fn();
    const channel = openEphemeralChannel({
      roomCode: 'ABC123', nodeName: 'chats', channelName: 'remi-chats', selfClientId: 'me', onEvent,
    });
    expect(channel.send({ text: 'x' })).toBe(false);
    expect(() => channel.close()).not.toThrow();
    expect(onEvent).not.toHaveBeenCalled();
  });
});
