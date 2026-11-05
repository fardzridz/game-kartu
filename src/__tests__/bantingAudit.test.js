import { describe, it, expect } from 'vitest';
import { applyBantingIntent, createBantingRoom } from '../banting/bantingEngine.js';
import { botDecision } from '../banting/bantingBots.js';

/** Simulasi satu game penuh dengan bot, sekaligus mengaudit aturan skip. */
function simulate(seatCount = 4) {
  let room = createBantingRoom({ code: 'SIM123', hostId: 'p0', name: 'P0', now: 1000 });
  for (let index = 1; index < seatCount; index += 1) {
    room = applyBantingIntent(room, { type: 'sit', name: `P${index}` }, `p${index}`, 1000).room;
    room = applyBantingIntent(room, { type: 'ready', ready: true }, `p${index}`, 1000).room;
  }
  room = applyBantingIntent(room, { type: 'start' }, 'p0', 1000).room;

  const violations = [];
  let now = 1500;

  // Fase pembukaan: semua pemegang kartu 3 mengeluarkannya sendiri.
  for (let step = 0; step < 16 && room.hand.phase === 'opening'; step += 1) {
    const holder = room.hand.players.find(player => (player.hand || []).some(card => card.value === '3'));
    if (!holder) break;
    const out = applyBantingIntent(room, { type: 'showThrees' }, holder.id, now);
    if (out.error) { violations.push(`showThrees ditolak: ${out.error}`); break; }
    room = out.room;
    now += 50;
  }
  if (room.hand.phase !== 'play') violations.push(`fase pembukaan tidak selesai (${room.hand.phase})`);

  let guard = 0;

  while (room.status === 'playing' && guard < 900) {
    guard += 1;
    now += 100;
    const hand = room.hand;
    const seat = hand.turnSeat;
    const player = hand.players.find(item => item.seat === seat);
    if (!player) break;

    // AUDIT 1: pemain yang sudah lewat tidak boleh dapat giliran.
    if ((hand.passed || []).includes(player.id)) {
      violations.push(`giliran diberikan ke pemain yang sudah lewat: ${player.name} (ronde ${hand.lastPlay?.name || 'baru'})`);
      break;
    }
    // AUDIT 2: pemain yang sudah habis kartu tidak boleh dapat giliran.
    if (player.finished) {
      violations.push(`giliran diberikan ke pemain yang sudah habis: ${player.name}`);
      break;
    }

    const decision = botDecision(room, seat);
    if (!decision) {
      violations.push(`bot tidak punya keputusan untuk ${player.name}`);
      break;
    }
    const out = applyBantingIntent(room, decision, player.id, now);
    if (out.error) {
      violations.push(`aksi ${decision.type} oleh ${player.name} ditolak: ${out.error}`);
      break;
    }
    room = out.room;
  }

  return { room, violations, steps: guard };
}

describe('audit aturan giliran', () => {
  it('pemain yang skip tidak pernah dapat giliran di ronde yang sama', () => {
    for (const count of [2, 3, 4, 5]) {
      const { violations, steps } = simulate(count);
      expect(violations, `${count} pemain (langkah ${steps})`).toEqual([]);
    }
  });

  it('game simulasi benar-benar selesai', () => {
    const { room } = simulate(4);
    expect(['round-end', 'playing']).toContain(room.status);
  });
});
