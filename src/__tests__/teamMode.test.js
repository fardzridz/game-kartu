import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { applyIntent, createRoom } from '../engine/roomEngine.js';
import {
  assignTeams,
  clearTeams,
  teamMembers,
  teamOfSeat,
  teamRoundTotals,
  teamTotals,
  tournamentChampion,
  tournamentOver,
} from '../utils/teams.js';
import Standings from '../components/Standings.jsx';

const NOW = 1_700_000_000_000;

const seat = (id, extra = {}) => ({ id, name: `Pemain ${id}`, avatar: 'finn', ready: true, bot: false, afk: false, online: true, score: 0, ...extra });

const countsOf = seats => seats.reduce((acc, s) => {
  const team = teamOfSeat(s);
  if (team) acc[team] += 1;
  return acc;
}, { merah: 0, biru: 0 });

const lobbyWith = (count, extra = {}) => {
  let room = createRoom({ code: 'TIM123', hostId: 'p1', name: 'Pemain p1', now: NOW, ...extra });
  for (let i = 2; i <= count; i += 1) {
    room = applyIntent(room, { type: 'sit', name: `Pemain p${i}` }, `p${i}`, NOW).room;
    room = applyIntent(room, { type: 'ready', value: true }, `p${i}`, NOW).room;
  }
  return room;
};

describe('Mode beregu — aturan tim (utils/teams.js)', () => {
  it('membagi tim otomatis dan seimbang untuk 2–8 kursi', () => {
    for (let count = 2; count <= 8; count += 1) {
      const seats = assignTeams(Array.from({ length: count }, (_, i) => seat(`p${i + 1}`)));
      const counts = seats.reduce((acc, s) => {
        acc[teamOfSeat(s)] += 1;
        return acc;
      }, { merah: 0, biru: 0 });
      expect(counts.merah + counts.biru).toBe(count);
      expect(Math.abs(counts.merah - counts.biru)).toBeLessThanOrEqual(1);
    }
  });

  it('tidak mengubah tim yang sudah ada (stabil antar ronde)', () => {
    const first = assignTeams([seat('a'), seat('b'), seat('c'), seat('d')]);
    const second = assignTeams(first);
    expect(second).toEqual(first);
  });

  it('kursi baru masuk tim yang lebih sedikit', () => {
    const seats = assignTeams([seat('a'), seat('b'), seat('c')]);
    const counts = countsOf(seats);
    const smaller = counts.merah <= counts.biru ? 'merah' : 'biru';
    const next = assignTeams([...seats, seat('d')]);
    expect(teamOfSeat(next.find(s => s.id === 'd'))).toBe(smaller);
  });

  it('clearTeams membuang penanda tim tanpa mengubah data lain', () => {
    const seats = assignTeams([seat('a', { score: 40 }), seat('b', { score: 10 })]);
    const cleared = clearTeams(seats);
    expect(cleared.every(s => !('team' in s))).toBe(true);
    expect(cleared[0].score).toBe(40);
  });

  it('skor tim = jumlah skor anggota, poin ronde dijumlah per tim', () => {
    const seats = [
      seat('a', { team: 'merah', score: 120 }),
      seat('b', { team: 'merah', score: 30 }),
      seat('c', { team: 'biru', score: 90 }),
      seat('d', { team: 'biru', score: 0 }),
    ];
    expect(teamTotals(seats)).toEqual({ merah: 150, biru: 90 });
    expect(teamRoundTotals([
      { playerId: 'a', total: 10 },
      { playerId: 'b', total: -5 },
      { playerId: 'c', total: 20 },
    ], seats)).toEqual({ merah: 5, biru: 20 });
    expect(teamMembers(seats, 'merah').map(s => s.id)).toEqual(['a', 'b']);
  });

  it('mode solo tetap tamat saat satu kursi menembus target', () => {
    const seats = [seat('a', { score: 500 }), seat('b', { score: 0 })];
    expect(tournamentOver({ seats, teamMode: false, targetScore: 500 })).toBe(true);
    expect(tournamentOver({ seats, teamMode: false, targetScore: 0 })).toBe(false);
  });

  it('mode beregu tamat saat total tim menembus target DAN unggul', () => {
    const tied = [
      seat('a', { team: 'merah', score: 300 }),
      seat('b', { team: 'merah', score: 200 }),
      seat('c', { team: 'biru', score: 250 }),
      seat('d', { team: 'biru', score: 250 }),
    ];
    expect(tournamentOver({ seats: tied, teamMode: true, targetScore: 500 })).toBe(false);

    const leading = tied.map(s => (s.id === 'a' ? { ...s, score: 320 } : s));
    expect(tournamentOver({ seats: leading, teamMode: true, targetScore: 500 })).toBe(true);
    const champion = tournamentChampion({ seats: leading, teamMode: true, targetScore: 500 });
    expect(champion.type).toBe('team');
    expect(champion.id).toBe('merah');
    expect(champion.score).toBe(520);
    expect(champion.members.map(m => m.id)).toEqual(['a', 'b']);
  });
});

describe('Mode beregu — engine room', () => {
  it('bawaan mati; Host menyalakannya lewat settings', () => {
    let room = lobbyWith(4);
    expect(room.teamMode).toBe(false);
    expect(room.seats.every(s => !('team' in s))).toBe(true);

    room = applyIntent(room, { type: 'settings', teamMode: true }, 'p1', NOW).room;
    expect(room.teamMode).toBe(true);
    expect(countsOf(room.seats)).toEqual({ merah: 2, biru: 2 });
  });

  it('mematikan mode beregu membersihkan penanda tim', () => {
    let room = lobbyWith(4);
    room = applyIntent(room, { type: 'settings', teamMode: true }, 'p1', NOW).room;
    room = applyIntent(room, { type: 'settings', teamMode: false }, 'p1', NOW).room;
    expect(room.teamMode).toBe(false);
    expect(room.seats.every(s => !('team' in s))).toBe(true);
  });

  it('kursi yang bergabung saat mode beregu langsung masuk tim terkecil', () => {
    let room = lobbyWith(3);
    room = applyIntent(room, { type: 'settings', teamMode: true }, 'p1', NOW).room;
    const before = countsOf(room.seats);
    const smaller = before.merah <= before.biru ? 'merah' : 'biru';
    room = applyIntent(room, { type: 'sit', name: 'Pemain p4' }, 'p4', NOW).room;
    expect(teamOfSeat(room.seats.find(s => s.id === 'p4'))).toBe(smaller);
  });

  it('mulai ronde membagikan tim ke pemain game dan bertahan ke ronde berikutnya', () => {
    let room = lobbyWith(4);
    room = applyIntent(room, { type: 'settings', teamMode: true }, 'p1', NOW).room;
    room = applyIntent(room, { type: 'start' }, 'p1', NOW).room;
    expect(room.status).toBe('playing');
    expect(room.game.players.map(p => p.team).sort()).toEqual(['biru', 'biru', 'merah', 'merah']);
    const teamsBefore = room.seats.map(s => s.team);

    room = { ...room, status: 'round-end' };
    const next = applyIntent(room, { type: 'next-round' }, 'p1', NOW);
    expect(next.error).toBeUndefined();
    expect(next.room.seats.map(s => s.team)).toEqual(teamsBefore);
  });
});

describe('Mode beregu — papan peringkat', () => {
  it('menampilkan total tim saat teamMode aktif', () => {
    const seats = [
      seat('a', { team: 'merah', score: 120 }),
      seat('b', { team: 'biru', score: 80 }),
    ];
    const html = renderToStaticMarkup(
      React.createElement(Standings, { seats, viewerId: 'a', targetScore: 500, teamMode: true })
    );
    expect(html).toContain('Tim Merah');
    expect(html).toContain('Tim Biru');
    expect(html).toContain('poin tim');
    expect(html).toContain('120');
  });

  it('tanpa teamMode tidak menampilkan ringkasan tim', () => {
    const seats = [seat('a', { score: 120 }), seat('b', { score: 80 })];
    const html = renderToStaticMarkup(
      React.createElement(Standings, { seats, viewerId: 'a', targetScore: 500 })
    );
    expect(html).not.toContain('poin tim');
  });
});
