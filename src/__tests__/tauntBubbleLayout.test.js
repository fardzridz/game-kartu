/**
 * Regresi tata letak balon ejekan (F-41).
 *
 * Keluhan lapangan: balon ejekan di atas profil lawan "keluar layar" di HP.
 * Terukur sebelum perbaikan (viewport 360x640, 7 lawan):
 *   - balon dari pod paling kiri : kiri = -69px  → 69px teks kepotong
 *   - balon dari pod tergeser    : kiri = 686px  → sama sekali tak terlihat
 *   - 4 balon barengan           : saling menumpuk + naik sampai y = -55
 *
 * Perbaikannya: posisi balon dijepit ke dalam layar (dx/dy lewat CSS variable
 * yang ikut dipakai keyframes), dan jumlah balon dibatasi menurut lebar layar.
 *
 * Diuji lewat pembacaan sumber (pola layoutPlacement.test.js): posisi balon
 * dihitung dari layout nyata, terlalu terikat DOM untuk diuji di jsdom.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = path => readFileSync(join(process.cwd(), path), 'utf8');
const system = read('src/components/TauntThrowSystem.jsx');
const css = read('src/styles/tongkronganFX.css');

describe('F-41: balon ejekan tidak keluar layar', () => {
  it('posisi balon dijepit dengan dx/dy, bukan dibiarkan di tengah pod', () => {
    expect(system).toContain('const padAtas = 8 + 24;');
    expect(system).toContain("'--tkfx-dx'");
    expect(system).toContain("'--tkfx-dy'");
    // Dihitung dari ukuran layout, bukan rect (animasi scale membuat rect menipu).
    expect(system).toContain('el.offsetWidth');
    expect(system).toContain('el.offsetHeight');
  });

  it('CSS dan keyframes sama-sama memakai dx/dy (kalau tidak, animasi menimpanya)', () => {
    const semua = css.match(/translate: calc\(-50% \+ var\(--tkfx-dx, 0px\)\)/g) || [];
    // 1 aturan dasar + 3 keyframes (0%, 9%, 100%).
    expect(semua.length).toBeGreaterThanOrEqual(4);
    expect(css).not.toContain('translate: -50% calc(-100% - var(--tkfx-stack');
  });

  it('di HP hanya satu balon sekaligus, di layar lebar masih dua', () => {
    expect(system).toContain('const sempit = typeof window !== \'undefined\' && window.innerWidth <= 560;');
    expect(system).toContain('...(sempit ? [] : prev.slice(-1)),');
  });

  it('jarak antar balon di layar lebar tetap dijaga', () => {
    expect(system).toContain('BUBBLE_STACK_PX');
    expect(system).toContain('const stack = offset * BUBBLE_STACK_PX;');
  });
});
