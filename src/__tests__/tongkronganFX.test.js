import { describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import TauntThrowSystem, { TAUNTS, THROWABLES } from '../components/TauntThrowSystem.jsx';
import HighImpactBanners from '../components/HighImpactBanners.jsx';
import GrandChampionModal, { resetScoresPatch } from '../components/GrandChampionModal.jsx';

// Smoke test modul Bumbu Tongkrongan: render + interaksi dasar di jsdom.
// Gaya createElement mengikuti test lain (suite hanya menyertakan *.test.js).

const flush = () => new Promise(resolve => setTimeout(resolve, 60));

const PLAYERS = [
  { id: 'u1', name: 'Ayu' },
  { id: 'u2', name: 'Budi' },
  { id: 'bot-1', name: 'Bot 1', bot: true },
];

async function mount(element) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(element); });
  return {
    host,
    async rerender(next) { await act(async () => { root.render(next); }); },
    async unmount() { await act(async () => { root.unmount(); }); host.remove(); },
  };
}

async function click(el) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await flush();
  });
}

const card = uid => ({ uid, value: '3', suit: '♥', kind: 'standard' });

describe('TauntThrowSystem', () => {
  it('panel membuka 10 ejekan + 4 lemparan, dan kirim memicu cooldown 4 detik', async () => {
    const view = await mount(React.createElement(TauntThrowSystem, { roomCode: 'TEST1', mySeatId: 'u1', players: PLAYERS }));
    try {
      const fab = view.host.querySelector('.tkfx-fab');
      expect(fab).toBeTruthy();
      await click(fab);
      const chips = view.host.querySelectorAll('.tkfx-panel .tkfx-chip');
      expect(chips.length).toBe(TAUNTS.length + THROWABLES.length);
      await click(view.host.querySelector('.tkfx-panel .tkfx-chip'));
      expect(view.host.querySelector('.tkfx-panel')).toBeNull();
      expect(view.host.querySelector('.tkfx-fab.is-cooling')).toBeTruthy();
    } finally {
      await view.unmount();
    }
  });

  it('penonton tanpa kursi hanya menerima layer FX tanpa tombol', async () => {
    const view = await mount(React.createElement(TauntThrowSystem, { roomCode: 'TEST1', mySeatId: null, players: PLAYERS }));
    try {
      expect(view.host.querySelector('.tkfx-dock')).toBeNull();
      expect(view.host.querySelector('.tkfx-layer--taunt')).toBeTruthy();
      expect(view.host.querySelector('.tkfx-layer--shots')).toBeTruthy();
    } finally {
      await view.unmount();
    }
  });
});

describe('HighImpactBanners', () => {
  it('menampilkan badge sisa kartu untuk kursi dengan 1-2 kartu', async () => {
    const game = {
      players: [
        { id: 'u1', name: 'Ayu', hand: [card('1')], melds: [] },
        { id: 'u2', name: 'Budi', hand: [card('2'), card('3')], melds: [] },
        { id: 'u3', name: 'Cici', hand: [card('4'), card('5'), card('6')], melds: [] },
      ],
      discardPile: [card('9')],
    };
    const view = await mount(React.createElement(HighImpactBanners, { game, seats: [], status: 'playing' }));
    try {
      await act(async () => { await flush(); await flush(); });
      expect(view.host.textContent).toContain('SISA 1 KARTU!');
      expect(view.host.textContent).toContain('SISA 2 KARTU');
      expect(view.host.textContent).not.toContain('Cici');
    } finally {
      await view.unmount();
    }
  });

  it('menampilkan banner JOKER CLOSER saat ronde ditutup Joker', async () => {
    const game = {
      players: [{ id: 'u2', name: 'Budi', hand: [], melds: [] }],
      discardPile: [card('9')],
      winnerId: 'u2',
      closerCard: { uid: 'j-1', kind: 'joker', value: 'JOKER' },
    };
    const view = await mount(React.createElement(HighImpactBanners, { game, seats: [], status: 'round-end' }));
    try {
      await act(async () => { await flush(); });
      expect(view.host.textContent).toContain('JOKER CLOSER!');
      expect(view.host.textContent).toContain('+150');
    } finally {
      await view.unmount();
    }
  });

  it('menampilkan float Gali Borongan saat buangan menyusut lebih dari 2 kartu', async () => {
    const game = pileLen => ({
      players: [{ id: 'u1', name: 'Ayu', hand: [card('1')], melds: [] }],
      discardPile: Array.from({ length: pileLen }, (_, i) => card(`p${i}`)),
    });
    const view = await mount(React.createElement(HighImpactBanners, { game: game(5), seats: [], status: 'playing' }));
    try {
      await act(async () => { await flush(); });
      await view.rerender(React.createElement(HighImpactBanners, { game: game(2), seats: [], status: 'playing' }));
      await act(async () => { await flush(); });
      expect(view.host.textContent).toContain('Gali Borongan!');
      expect(view.host.textContent).toContain('(+3 Kartu)');
    } finally {
      await view.unmount();
    }
  });
});

describe('GrandChampionModal', () => {
  const room = {
    code: 'TEST1',
    hostId: 'u1',
    status: 'round-end',
    round: 2,
    seats: [
      { id: 'u1', name: 'Ayu', avatar: 'finn', score: 320 },
      { id: 'u2', name: 'Budi', avatar: 'jake', score: -40, discardedJokers: 3 },
    ],
    game: {
      players: [
        { id: 'u1', name: 'Ayu', hand: [], melds: [[card('m1')]] },
        { id: 'u2', name: 'Budi', hand: [], melds: [] },
      ],
    },
  };

  it('menampilkan podium, award otomatis, dan tombol reset dua langkah untuk host', async () => {
    let resetCalled = false;
    const view = await mount(React.createElement(GrandChampionModal, {
      room,
      targetScore: 300,
      viewerId: 'u2',
      isHost: true,
      onResetScores: () => { resetCalled = true; },
    }));
    try {
      expect(view.host.textContent).toContain('Ayu');
      expect(view.host.textContent).toContain('Raja Tongkrongan');
      expect(view.host.textContent).toContain('Bandar Sedekah / Tukang Kocok Abadi');
      expect(view.host.textContent).toContain('Korban Joker');
      expect(view.host.textContent).toContain('Mandor Gali');
      const primary = view.host.querySelector('.tkfx-btn--primary');
      await click(primary);
      expect(primary.textContent).toContain('Yakin');
      await click(view.host.querySelector('.tkfx-btn--primary'));
      expect(resetCalled).toBe(true);
    } finally {
      await view.unmount();
    }
  });

  it('tertutup dengan Escape dan tidak muncul bila belum ada yang mencapai target', async () => {
    const view = await mount(React.createElement(GrandChampionModal, { room, targetScore: 300, viewerId: 'u1', isHost: false }));
    try {
      expect(view.host.querySelector('.tkfx-champ__card')).toBeTruthy();
      await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await flush();
      });
      expect(view.host.querySelector('.tkfx-champ__card')).toBeNull();

      const lowScore = { ...room, seats: room.seats.map(seat => ({ ...seat, score: seat.score - 500 })) };
      const closed = await mount(React.createElement(GrandChampionModal, { room: lowScore, targetScore: 300 }));
      try {
        expect(closed.host.querySelector('.tkfx-champ__card')).toBeNull();
      } finally {
        await closed.unmount();
      }
    } finally {
      await view.unmount();
    }
  });

  it('resetScoresPatch mengembalikan skor, counter, dan status ke lobby', () => {
    const patch = resetScoresPatch(room);
    expect(patch.status).toBe('lobby');
    expect(patch.round).toBe(0);
    expect(patch.game).toBeNull();
    expect(patch.lastScores).toBeNull();
    expect(patch.seats.every(seat => seat.score === 0 && !seat.ready && (seat.discardedJokers ?? 0) === 0)).toBe(true);
    expect(patch.seats.map(seat => seat.id)).toEqual(['u1', 'u2']);
  });
});
