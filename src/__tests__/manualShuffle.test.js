import { describe, it, expect, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createRoom, applyIntent } from '../engine/roomEngine.js';
import CeremonyOverlay from '../components/CeremonyOverlay.jsx';

describe('F-43: Ritual Pengocok Manual (Opsi A)', () => {
  const base = () => {
    let r = createRoom({ hostId: 'host', name: 'Farid' });
    r = applyIntent(r, { type: 'sit', name: 'Budi' }, 'guest').room;
    r = applyIntent(r, { type: 'ready', value: true }, 'guest').room;
    return r;
  };

  it('menginisialisasi room dalam fase shuffleState manual saat pengocok adalah manusia', () => {
    const lobby = base();
    const started = applyIntent(lobby, { type: 'start' }, 'host');
    expect(started.error).toBeUndefined();
    const room = started.room;
    expect(room.status).toBe('playing');
    expect(room.shufflerId).toBe('host');
    expect(room.game.shuffleState).toBe('manual');
    expect(room.game.shuffleCount).toBe(0);
    expect(room.game.dealingUntil).toBeGreaterThan(Date.now());
  });

  it('pengocok bisa menekan kocok berkali-kali dan mengacak ulang kartu', () => {
    let room = applyIntent(base(), { type: 'start' }, 'host').room;

    // Host (Pengocok) klik kocok pertama kali
    let res = applyIntent(room, { type: 'shuffle' }, 'host');
    expect(res.error).toBeUndefined();
    expect(res.room.game.shuffleCount).toBe(1);

    // Host klik kocok kedua kali
    res = applyIntent(res.room, { type: 'shuffle' }, 'host');
    expect(res.error).toBeUndefined();
    expect(res.room.game.shuffleCount).toBe(2);

    // Host klik kocok ketiga kali
    res = applyIntent(res.room, { type: 'shuffle' }, 'host');
    expect(res.error).toBeUndefined();
    expect(res.room.game.shuffleCount).toBe(3);
    expect(res.room.game.shuffleState).toBe('manual');
  });

  it('pemain lain (bukan pengocok) ditolak saat mencoba mengocok atau membagikan kartu', () => {
    const room = applyIntent(base(), { type: 'start' }, 'host').room;

    // Guest mencoba mengocok
    const deniedShuffle = applyIntent(room, { type: 'shuffle' }, 'guest');
    expect(deniedShuffle.error).toBe('Hanya Pengocok yang bisa mengocok kartu.');

    // Guest mencoba membagikan
    const deniedDeal = applyIntent(room, { type: 'deal' }, 'guest');
    expect(deniedDeal.error).toBe('Hanya Pengocok yang bisa membagikan kartu.');
  });

  it('pengocok menekan deal (Mulai Bagi) untuk memulai pembagian flyer dan timer ronde', () => {
    let room = applyIntent(base(), { type: 'start' }, 'host').room;
    room = applyIntent(room, { type: 'shuffle' }, 'host').room;
    expect(room.game.shuffleCount).toBe(1);

    const dealRes = applyIntent(room, { type: 'deal' }, 'host', 10000);
    expect(dealRes.error).toBeUndefined();
    const playingRoom = dealRes.room;
    expect(playingRoom.game.shuffleState).toBe('dealing');
    expect(playingRoom.game.dealStartedAt).toBe(10000);
    expect(playingRoom.game.dealingUntil).toBeGreaterThan(10000);
    expect(playingRoom.lastActionAt).toBe(playingRoom.game.dealingUntil);
  });

  it('pengocok bot otomatis langsung dealing tanpa fase manual yang menggantung', () => {
    let r = createRoom({ hostId: 'host', name: 'Farid' });
    r = applyIntent(r, { type: 'add-bot' }, 'host').room;
    const botId = r.seats[1].id;
    r = { ...r, hostId: botId, shufflerId: botId };
    const started = applyIntent(r, { type: 'start' }, botId);
    expect(started.room.game.shuffleState).toBe('dealing');
  });

  it('UI CeremonyOverlay merender tombol Kocok & Mulai Bagi khusus Pengocok', async () => {
    const onIntent = vi.fn();
    const positions = [{ x: 50, y: 80 }, { x: 50, y: 20 }];
    const now = 5000;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        React.createElement(CeremonyOverlay, {
          dealStartedAt: 1000,
          dealingUntil: now + 20000,
          seatCount: 2,
          seatPositions: positions,
          shufflerName: 'Farid',
          shufflerId: 'host',
          myId: 'host',
          round: 1,
          now,
          shuffleState: 'manual',
          shuffleCount: 2,
          onIntent,
        })
      );
    });

    const shuffleBtn = host.querySelector('.ceremony-btn--shuffle');
    const dealBtn = host.querySelector('.ceremony-btn--deal');
    expect(shuffleBtn).not.toBeNull();
    expect(dealBtn).not.toBeNull();
    expect(host.textContent).toContain('2x');

    // Klik tombol Kocok
    await act(async () => {
      shuffleBtn.click();
    });
    expect(onIntent).toHaveBeenCalledWith({ type: 'shuffle' });

    // Klik tombol Mulai Bagi
    await act(async () => {
      dealBtn.click();
    });
    expect(onIntent).toHaveBeenCalledWith({ type: 'deal' });

    root.unmount();
    host.remove();
  });

  it('UI CeremonyOverlay merender teks menunggu untuk pemain lawan (bukan Pengocok)', async () => {
    const onIntent = vi.fn();
    const positions = [{ x: 50, y: 80 }, { x: 50, y: 20 }];
    const now = 5000;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        React.createElement(CeremonyOverlay, {
          dealStartedAt: 1000,
          dealingUntil: now + 20000,
          seatCount: 2,
          seatPositions: positions,
          shufflerName: 'Farid',
          shufflerId: 'host',
          myId: 'guest',
          round: 1,
          now,
          shuffleState: 'manual',
          shuffleCount: 3,
          onIntent,
        })
      );
    });

    // Lawan tidak boleh melihat tombol kocok / bagi
    expect(host.querySelector('.ceremony-btn--shuffle')).toBeNull();
    expect(host.querySelector('.ceremony-btn--deal')).toBeNull();

    // Lawan melihat status Farid sedang mengocok
    expect(host.textContent).toContain('Farid sedang mengocok kartu');
    expect(host.textContent).toContain('3x');

    root.unmount();
    host.remove();
  });
});
