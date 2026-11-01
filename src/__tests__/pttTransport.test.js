import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  acquireTalkLock,
  publishAudio,
  releaseTalkLock,
  subscribeAudio,
  subscribeLiveState,
} from '../services/pttTransport.js';
import { MAX_AUDIO_BASE64 } from '../services/pttService.js';
import { serverNow } from '../services/realtimeService.js';

// Mode test membuat firebaseActive() === false, jadi jalur yang dites adalah
// BroadcastChannel — jalur yang sama dengan mode simulasi lokal. Ini penting:
// PTT harus tetap jalan tanpa Firebase (acceptance brief).

const validPayload = overrides => ({
  from: 'pengirim',
  // serverNow() dipakai supaya filter umur audio konsisten dengan produksi.
  ts: serverNow(),
  dur: 1800,
  mime: 'audio/webm;codecs=opus',
  data: 'AAAAAAAA',
  // Pesan BroadcastChannel membawa roomCode supaya tab meja lain tidak ikut
  // mendengar (publishAudio menambahkannya sendiri saat menyiarkan).
  roomCode: 'ABC123',
  ...overrides,
});

describe('pttTransport — mode lokal (BroadcastChannel)', () => {
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

  beforeEach(() => {
    instances = [];
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('acquireTalkLock selalu granted di mode lokal (tanpa otoritas pusat)', async () => {
    const result = await acquireTalkLock({
      roomCode: 'ABC123', clientId: 'a', name: 'A', maxDurationMs: 15000,
    });
    expect(result.granted).toBe(true);
  });

  it('acquireTalkLock menyiarkan status bicara di mode lokal', async () => {
    await acquireTalkLock({ roomCode: 'ABC123', clientId: 'a', name: 'Andi', maxDurationMs: 15000 });
    const liveChannel = instances.find(item => item.name === 'remi-ptt-live');
    expect(liveChannel).toBeTruthy();
    expect(liveChannel.posted[0]).toMatchObject({ roomCode: 'ABC123', from: 'a', name: 'Andi' });
  });

  it('releaseTalkLock menyiarkan null (berhenti bicara) di mode lokal', async () => {
    await releaseTalkLock({ roomCode: 'ABC123', clientId: 'a' });
    const liveChannel = instances.find(item => item.name === 'remi-ptt-live');
    expect(liveChannel.posted[0]).toBeNull();
  });

  it('publishAudio menolak payload tidak sah sebelum menyentuh jaringan', async () => {
    const tooBig = await publishAudio({
      roomCode: 'ABC123',
      payload: validPayload({ data: 'a'.repeat(MAX_AUDIO_BASE64 + 1) }),
    });
    expect(tooBig.ok).toBe(false);
    expect(tooBig.reason).toMatch(/terlalu besar/);

    const noData = await publishAudio({ roomCode: 'ABC123', payload: validPayload({ data: '' }) });
    expect(noData.ok).toBe(false);
  });

  it('publishAudio menyiarkan payload sah ke kanal audio', async () => {
    const result = await publishAudio({ roomCode: 'ABC123', payload: validPayload() });
    expect(result.ok).toBe(true);

    const audioChannel = instances.find(item => item.name === 'remi-ptt');
    expect(audioChannel).toBeTruthy();
    expect(audioChannel.posted[0]).toMatchObject({ roomCode: 'ABC123', from: 'pengirim' });
  });

  it('subscribeAudio menerima audio pemain lain dan menyaring milik sendiri', () => {
    const received = [];
    const stop = subscribeAudio({
      roomCode: 'ABC123',
      selfClientId: 'aku',
      onAudio: payload => received.push(payload),
    });

    const channel = instances.find(item => item.name === 'remi-ptt');
    channel.deliver(validPayload({ from: 'orang-lain' }));
    expect(received).toHaveLength(1);

    // Rekaman sendiri tidak boleh diputar (aturan produk: bikin bingung).
    channel.deliver(validPayload({ from: 'aku' }));
    expect(received).toHaveLength(1);

    // Meja lain diabaikan.
    channel.deliver(validPayload({ from: 'orang-lain', roomCode: 'ZZZ999' }));
    expect(received).toHaveLength(1);

    stop();
    expect(channel.closed).toBe(true);
  });

  it('subscribeAudio membuang audio basi (reconnect tidak memutar ulang)', () => {
    const received = [];
    subscribeAudio({ roomCode: 'ABC123', selfClientId: 'aku', onAudio: payload => received.push(payload) });
    const channel = instances.find(item => item.name === 'remi-ptt');

    channel.deliver(validPayload({ from: 'lain', ts: serverNow() - 60000 }));
    expect(received).toHaveLength(0);

    channel.deliver(validPayload({ from: 'lain', ts: serverNow() - 100 }));
    expect(received).toHaveLength(1);
  });

  it('subscribeAudio membuang payload data yang kebesaran sebelum di-decode', () => {
    const received = [];
    subscribeAudio({ roomCode: 'ABC123', selfClientId: 'aku', onAudio: payload => received.push(payload) });
    const channel = instances.find(item => item.name === 'remi-ptt');
    channel.deliver(validPayload({ from: 'lain', data: 'a'.repeat(MAX_AUDIO_BASE64 + 1) }));
    expect(received).toHaveLength(0);
  });

  it('subscribeLiveState melaporkan pembicara lain dan mengabaikan diri sendiri', () => {
    const states = [];
    subscribeLiveState({
      roomCode: 'ABC123',
      selfClientId: 'aku',
      onChange: state => states.push(state),
    });
    const liveChannel = instances.find(item => item.name === 'remi-ptt-live');

    liveChannel.deliver({
      clientId: 'lain', roomCode: 'ABC123', from: 'lain', name: 'Budi',
      ts: serverNow(), dur: 5000,
    });
    expect(states[states.length - 1]).toEqual({ from: 'lain', name: 'Budi' });

    liveChannel.deliver({
      clientId: 'aku', roomCode: 'ABC123', from: 'aku', name: 'Aku',
      ts: serverNow(), dur: 5000,
    });
    expect(states[states.length - 1]).not.toEqual({ from: 'aku', name: 'Aku' });
  });

  it('subscribeLiveState mengabaikan kunci yang sudah kedaluwarsa', () => {
    const states = [];
    subscribeLiveState({ roomCode: 'ABC123', selfClientId: 'aku', onChange: state => states.push(state) });
    const liveChannel = instances.find(item => item.name === 'remi-ptt-live');

    liveChannel.deliver({
      clientId: 'lain', roomCode: 'ABC123', from: 'lain', name: 'Budi',
      ts: serverNow() - 60000, dur: 5000,
    });
    // Kunci bocor tidak boleh menahan indikator selamanya.
    expect(states[states.length - 1]).toBeNull();
  });

  it('semua subscribe aman dipanggil tanpa roomCode', () => {
    expect(() => subscribeAudio({ roomCode: null, selfClientId: 'a', onAudio: () => {} })()).not.toThrow();
    expect(() => subscribeLiveState({ roomCode: null, selfClientId: 'a', onChange: () => {} })()).not.toThrow();
  });
});

describe('pttTransport — tanpa BroadcastChannel', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('publishAudio mengembalikan alasan yang jelas, tidak melempar', async () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const result = await publishAudio({ roomCode: 'ABC123', payload: validPayload() });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/kanal/);
  });

  it('subscribeAudio mengembalikan no-op', () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const stop = subscribeAudio({ roomCode: 'ABC123', selfClientId: 'a', onAudio: () => {} });
    expect(() => stop()).not.toThrow();
  });
});


