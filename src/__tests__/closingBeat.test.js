/**
 * Regresi dua keluhan lapangan (F-39):
 *
 *  1. "Di profil lawan masih 3 kartu padahal dia baru minum jadi 4."
 *     Penyebab: kipas mini menahan kartu terakhir selama animasi minum.
 *     Pelepasannya dulu HANYA lewat callback animasi + setTimeout jaring
 *     pengaman, dan keduanya di-throttle browser saat tab di latar belakang →
 *     kipas bisa tertahan lama. Sekarang ada batas keras + pelepasan saat tab
 *     kembali terlihat.
 *
 *  2. "Masih 4 kartu, seharusnya 1, baru itu ditutup."
 *     Penyebab: begitu ronde tutup, GameBoard langsung unmount sehingga angka
 *     terakhir tidak pernah dirender. Sekarang ada closing beat singkat.
 *
 * Efek animasi + transisi view terlalu terikat DOM untuk diuji utuh di jsdom,
 * jadi test ini mengunci BENTUK keputusan di sumber — pola yang sama dipakai
 * layoutPlacement.test.js.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = path => readFileSync(join(process.cwd(), path), 'utf8');
const board = read('src/components/GameBoard.jsx');
const app = read('src/App.jsx');

describe('F-39a: kipas mini lawan tidak boleh tertahan', () => {
  it('punya batas keras pelepasan yang tidak bergantung callback animasi', () => {
    expect(board).toContain('POD_HOLD_MAX_MS');
    expect(board).toContain('setTimeout(() => releasePodHold(gainedIndex, token), POD_HOLD_MAX_MS)');
  });

  it('melepas semua penahanan saat tab kembali terlihat', () => {
    expect(board).toContain("document.addEventListener('visibilitychange'");
    // Pelepasan massal: objek hold dikosongkan.
    expect(board).toContain('setPodDrawHold(cur => (Object.keys(cur).length ? {} : cur))');
  });

  it('pemain 0 kartu tampil tanpa kipas mini (bukan 1 kipas palsu)', () => {
    expect(board).toContain('const fan = Math.min(seat.hand.length, 5);');
    expect(board).not.toContain('Math.min(Math.max(seat.hand.length, 1), 5)');
  });
});

describe('F-39b: closing beat sebelum layar skor', () => {
  it('menahan papan sebentar setelah ronde tutup', () => {
    expect(app).toContain('CLOSING_BEAT_MS');
    expect(app).toContain('setClosingBeat(true)');
    // Papan tetap dipakai selama jeda, bukan langsung dilempar ke lobby.
    expect(app).toContain("(room.status === 'round-end' && closingBeat)");
  });

  it('hanya untuk transisi playing → round-end, bukan saat buka langsung', () => {
    expect(app).toContain("previous === 'playing'");
  });

  it('dilewati kalau turnamen tamat (modal juara yang jadi panggung)', () => {
    expect(app).toContain('championPending');
    expect(app).toContain('&& !championPending');
  });
});
