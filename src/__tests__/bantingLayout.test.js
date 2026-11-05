import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Tes pengunci tata letak meja Poker Banting (baca CSS, tanpa browser).
 *
 * Dua bug yang pernah terjadi dan dijaga di sini:
 * 1. Kartu tangan terhimpit jadi satu kolom 46px karena blok identitas pemain
 *    (avatar + nama + ronde) duduk SEBARIS dengan tangan. Akibatnya kartu
 *    menumpuk ke atas dan keluar layar.
 * 2. Pill header memakai utility Tailwind `hidden sm:inline-flex`, tapi
 *    `hidden` kalah oleh `display: inline-flex` milik .hud-pill sehingga pill
 *    tetap muncul di HP dan mendorong tombol kanan (Keluar) keluar layar.
 */

const css = (...parts) => readFileSync(join(process.cwd(), 'src', ...parts), 'utf8');
const bantingCss = css('banting', 'banting.css');
const bantingApp = css('banting', 'BantingApp.jsx');

/** Isi satu aturan CSS berdasarkan selektor (yang pertama ditemukan). */
function rule(source, selector) {
  const index = source.indexOf(`${selector} {`);
  if (index === -1) return '';
  const end = source.indexOf('}', index);
  return source.slice(index, end + 1);
}

/** Blok @media (max-width: 820px) TERAKHIR — di situlah aturan tata letak HP. */
function phoneBlock(source) {
  const start = source.lastIndexOf('@media (max-width: 820px)');
  if (start === -1) return '';
  const next = source.indexOf('@media', start + 10);
  return source.slice(start, next === -1 ? undefined : next);
}

describe('meja Banting di HP — kartu tangan', () => {
  it('tangan memakai flex-wrap supaya baris terakhir tetap di tengah', () => {
    const block = rule(bantingCss, '.banting-hand');
    expect(block).toContain('display: flex');
    expect(block).toContain('flex-wrap: wrap');
    expect(block).toContain('justify-content: center');
    // Grid auto-fit pernah menyusut jadi satu kolom 46px saat lebar induk sempit.
    expect(block).not.toContain('grid-template-columns');
  });

  it('kartu punya lebar tetap sendiri, bukan width: 100%', () => {
    const block = rule(bantingCss, '.banting-card');
    expect(block).toContain('width: var(--card-w');
    expect(block).not.toContain('width: 100%');
  });

  it('identitas pemain naik ke baris sendiri di atas tangan (bukan sebelahnya)', () => {
    const phone = phoneBlock(bantingCss);
    expect(phone).toBeTruthy();
    const block = rule(phone, '.banting-hand-row > .dock-identity');
    expect(block).toBeTruthy();
    expect(block).toContain('order: -1');
    expect(block).toContain('flex: 0 0 100%');
    expect(block).toContain('width: 100%');
    // Tangan memakai lebar penuh baris, bukan menyusut selebar isinya.
    expect(rule(phone, '.banting-hand')).toContain('flex: 1 1 100%');
  });
});

describe('header meja Banting — pill hanya untuk layar lebar', () => {
  it('pill GILIRAN & badge koneksi tidak memakai utility `hidden` Tailwind', () => {
    expect(bantingApp).not.toMatch(/hud-pill hidden (sm|md):inline-flex/);
    expect(bantingApp).toContain('hud-pill banting-hud-pill--sm');
    expect(bantingApp).toContain('hud-pill banting-hud-pill--md');
  });

  it('pill disembunyikan bawaan dan baru muncul di breakpoint masing-masing', () => {
    const base = rule(bantingCss, '.banting-hud-pill--sm,\n.banting-hud-pill--md');
    expect(base).toContain('display: none !important');
    expect(bantingCss).toContain('@media (min-width: 640px) { .banting-hud-pill--sm');
    expect(bantingCss).toContain('@media (min-width: 768px) { .banting-hud-pill--md');
  });
});

describe('arena Banting tanpa permukaan meja (sama seperti Jengges)', () => {
  const tableJsx = css('banting', 'BantingTable.jsx');

  it('felt tidak punya latar, bingkai, bayangan, atau garis dalam', () => {
    const felt = rule(bantingCss, '.banting-felt');
    expect(felt).toContain('background: none !important');
    expect(felt).toContain('box-shadow: none !important');
    expect(felt).toContain('border-radius: 0 !important');
    expect(bantingCss).toContain('.banting-felt::after { display: none !important; }');
  });

  it('lawan selalu jadi baris pod di atas arena, bukan disebar mengelilingi elips', () => {
    expect(tableJsx).not.toContain('seatStyle(');
    expect(tableJsx).not.toMatch(/!narrow && opponents\.map/);
    expect(tableJsx).toContain('poker-rail banting-rail');
  });
});
