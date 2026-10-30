import { describe, expect, it, vi } from 'vitest';
import { releaseSeat } from '../utils/leaveRoom.js';
import { applyIntent, createRoom } from '../engine/roomEngine.js';

// Service tiruan: transact menjalankan mutator pada state "server" lokal,
// persis seperti realtimeService.transact (null = batal).
function fakeService(state) {
  const store = { state };
  return {
    store,
    transact: vi.fn(async mutator => {
      const next = mutator(store.state);
      if (!next) return { committed: false, value: store.state };
      store.state = next;
      return { committed: true, value: next };
    }),
  };
}

function lobbyWithGuests() {
  const room = createRoom({ code: 'ABC123', hostId: 'host-1', name: 'Host' });
  const sat = applyIntent(room, { type: 'sit', name: 'Tamu', avatar: 'jake' }, 'guest-2');
  return sat.room;
}

describe('releaseSeat — Keluar dari meja', () => {
  it('melepas kursi sendiri di ruang tunggu (intent stand)', async () => {
    const service = fakeService(lobbyWithGuests());
    await releaseSeat(service, service.store.state, 'guest-2');
    expect(service.store.state.seats.map(seat => seat.id)).toEqual(['host-1']);
  });

  it('tidak mengirim apa pun bila pemain belum duduk', async () => {
    const service = fakeService(lobbyWithGuests());
    const result = releaseSeat(service, service.store.state, 'penonton-9');
    expect(result).toBeNull();
    expect(service.transact).not.toHaveBeenCalled();
  });

  it('tidak melempar saat service belum siap (bug .catch pada undefined)', () => {
    // Dulu App memanggil sendIntent(...).catch() padahal sendIntent tidak
    // mengembalikan promise → TypeError sebelum teardownRoom(), pemain
    // tersangkut di Ruang Tunggu. Helper ini harus aman tanpa service.
    expect(() => releaseSeat(null, lobbyWithGuests(), 'guest-2')).not.toThrow();
    expect(releaseSeat(null, lobbyWithGuests(), 'guest-2')).toBeNull();
    expect(releaseSeat(undefined, null, null)).toBeNull();
  });

  it('saat ronde berjalan kursi hanya ditandai offline (kartu tidak yatim)', async () => {
    const service = fakeService({ ...lobbyWithGuests(), status: 'playing' });
    await releaseSeat(service, service.store.state, 'guest-2');
    const seat = service.store.state.seats.find(item => item.id === 'guest-2');
    expect(seat).toBeTruthy();
    expect(seat.online).toBe(false);
    expect(seat.afk).toBe(true);
  });

  it('kursi terakhir tetap ditandai pergi walau engine menolak "stand"', async () => {
    const solo = createRoom({ code: 'ABC123', hostId: 'host-1', name: 'Host' });
    const service = fakeService(solo);
    await releaseSeat(service, service.store.state, 'host-1');
    const seat = service.store.state.seats.find(item => item.id === 'host-1');
    expect(seat.online).toBe(false);
  });

  it('status dibaca dari state server, bukan snapshot klien yang basi', async () => {
    // Klien masih mengira 'lobby', padahal server sudah masuk ronde berikutnya.
    const client = lobbyWithGuests();
    const service = fakeService({ ...client, status: 'playing' });
    await releaseSeat(service, client, 'guest-2');
    const seat = service.store.state.seats.find(item => item.id === 'guest-2');
    expect(seat.online).toBe(false);
    expect(seat.afk).toBe(true);
  });
});
