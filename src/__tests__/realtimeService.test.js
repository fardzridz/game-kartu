import { beforeEach, describe, expect, it } from 'vitest';
import { classifyFirebaseError, createRealtimeService, evaluatePresence, friendlyConnectionMessage } from '../services/realtimeService.js';
describe('local room transport',()=>{
 beforeEach(()=>localStorage.clear());
 it('persists room state and notifies local subscribers',async()=>{const host=createRealtimeService('ROOM01','host');const received=[];const stop=host.subscribe(room=>received.push(room));await host.create({players:[{id:'host'}]});await host.update({turn:1});expect(JSON.parse(localStorage.getItem('remi-room-ROOM01')).turn).toBe(1);expect(received.at(-1)?.turn).toBe(1);stop();host.close()});
 it('removes subscribers on unsubscribe and close',async()=>{const room=createRealtimeService('ROOM02','a');const seen=[];const stop=room.subscribe(value=>seen.push(value));await room.create({round:1});stop();await room.update({round:2});expect(seen.map(item=>item.round)).toEqual([1]);room.close()});
});

describe('koneksi: pesan & klasifikasi (jangan paksa mode lokal)', () => {
  it('gangguan jaringan diklasifikasikan sebagai network (harus ditunggu)', () => {
    expect(classifyFirebaseError({ code: 'database/unavailable' })).toBe('network');
    expect(classifyFirebaseError({ code: 'network-request-failed' })).toBe('network');
    expect(classifyFirebaseError({ message: 'client is offline' })).toBe('network');
  });

  it('salah setting project diklasifikasikan sebagai config', () => {
    expect(classifyFirebaseError({ code: 'database/permission-denied' })).toBe('config');
    expect(classifyFirebaseError({ code: 'database/database-url-invalid' })).toBe('config');
  });

  it('pesan koneksi tidak menyarankan pindah ke mode lokal', () => {
    for (const reason of ['offline', 'timeout', 'closed', undefined]) {
      expect(friendlyConnectionMessage(reason)).not.toMatch(/mode lokal/i);
    }
  });

  it('mode lokal melaporkan status koneksi sederhana', () => {
    const room = createRealtimeService('ROOM03', 'a');
    const seen = [];
    const stop = room.subscribeConnection(value => seen.push(value));
    expect(seen.at(-1)).toBe('connected');
    expect(room.connection()).toBe('connected');
    stop();
    room.close();
  });
});

describe('status online per kursi', () => {
  const seats = [
    { id: 'h', name: 'Host', bot: false, online: true },
    { id: 'g', name: 'Tamu', bot: false, online: true },
    { id: 'b', name: 'Bot 2', bot: true, online: true },
  ];
  const now = 1_800_000_000_000;

  it('heartbeat baru = online, heartbeat basi = offline, bot selalu hijau', () => {
    const live = evaluatePresence(seats, {
      h: { online: true, lastSeen: now - 3000 },
      g: { online: true, lastSeen: now - 120000 },
    }, now);
    expect(live.online.map(seat => seat.id)).toEqual(['h', 'b']);
    expect(live.offline.map(seat => seat.id)).toEqual(['g']);
    expect(live.bots).toBe(1);
    expect(live.known).toBe(true);
  });

  it('presence belum pernah masuk = unknown, bukan "semua offline"', () => {
    const live = evaluatePresence(seats, {}, now);
    expect(live.known).toBe(false);
    expect(live.stale).toBe(false);
  });

  it('entry dengan online:false langsung dianggap offline', () => {
    const live = evaluatePresence(seats, { h: { online: false, lastSeen: now }, g: { online: true, lastSeen: now } }, now);
    expect(live.offline.map(seat => seat.id)).toEqual(['h']);
  });
});
