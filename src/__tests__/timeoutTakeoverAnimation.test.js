/**
 * Regresi: animasi saat kursi pemain diambil alih bot (timeout / AFK).
 *
 * Bug yang dikunci di sini: efek snapshot di GameBoard dulu mengecualikan
 * kursi sendiri secara mentah-mentah (`culprit.id !== viewerId`), dengan
 * asumsi "minum sendiri sudah dianimasikan handler klik". Asumsi itu gagal
 * justru di kasus paling penting: saat pemain kehabisan waktu dan bot
 * menjalankan kursinya, TIDAK ADA klik — jadi kartu hilang dari tangan dan
 * muncul di tumpukan tanpa satu pun gerakan.
 *
 * Perbaikannya memakai penanda eksplisit (`selfDrawAt` + `thrownUids`) supaya
 * aksi manual tetap tidak dianimasikan dua kali, tapi aksi bot atas nama kita
 * tetap mendapat animasi.
 *
 * Test ini membaca sumber (pola yang sudah dipakai layoutPlacement.test.js):
 * efeknya terlalu terikat DOM untuk diuji utuh di jsdom, sedangkan yang ingin
 * dijaga adalah bentuk keputusan di dalamnya.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'src', 'components', 'GameBoard.jsx'), 'utf8');

/** Ambil blok efek snapshot pemain lain (dari penanda BUANG sampai penutupnya). */
function remoteEffectBlock() {
  const start = source.indexOf('// ---- BUANG: kartu baru masuk ke tumpukan ----');
  const end = source.indexOf('react-hooks/exhaustive-deps -- remoteSnap');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('animasi pengambilalihan kursi oleh bot', () => {
  it('buangan kursi sendiri tidak lagi dikecualikan mentah-mentah', () => {
    const block = remoteEffectBlock();
    // Penjaga yang benar: kartu belum pernah dianimasikan handler klik.
    expect(block).toContain('thrownUids.current.has(card.uid)');
    // Penjaga lama (membuat kasus timeout bisu) tidak boleh kembali.
    expect(block).not.toContain('culprit.id !== viewerId');
    expect(block).toContain('culprit.id === viewerId ? selfHandOrigin()');
  });

  it('minum kursi sendiri punya jalur animasi khusus', () => {
    const block = remoteEffectBlock();
    expect(block).toContain('SELF_DRAW_WINDOW_MS');
    expect(block).toContain('selfDrawAt.current');
    expect(block).toContain("gained.id === viewerId");
    // Kartu yang baru masuk ditebak dari selisih UID tangan.
    expect(block).toContain('handUids');
    expect(block).toContain('setPendingDrawCard(drawnCard)');
  });

  it('kombinasi yang diturunkan bot atas nama kita juga diterbangkan', () => {
    const block = remoteEffectBlock();
    expect(block).toContain('owner.id === viewerId');
    expect(block).toContain("measurePose('.meld-zone')");
    expect(block).toContain('setMeldCelebratePlayer(index)');
  });

  it('klik minum sendiri menandai dirinya supaya tidak dianimasikan dua kali', () => {
    // Handler klik wajib mengisi penanda SEBELUM animasinya dimulai.
    const handler = source.indexOf('selfDrawAt.current = performance.now();');
    const flyDrawCall = source.indexOf('flyDraw({', handler);
    expect(handler).toBeGreaterThan(-1);
    expect(flyDrawCall).toBeGreaterThan(handler);
  });
});
