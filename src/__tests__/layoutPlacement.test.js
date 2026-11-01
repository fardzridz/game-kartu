import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Tes pengunci tata letak.
 *
 * Semua ini murni pembacaan CSS — tidak ada browser. Tujuannya menjaga
 * keputusan penempatan yang mudah rusak tanpa sadar saat orang mengubah CSS
 * nanti (mis. mengembalikan mic ke tengah bawah sehingga menabrak Obrolan).
 */

const css = (...parts) => readFileSync(join(process.cwd(), 'src', ...parts), 'utf8');

const appCss = css('App.css');
const fxCss = css('styles', 'tongkronganFX.css');
const lobbyCss = css('lobby.css');

/** Ambil isi satu aturan CSS berdasarkan selektor (yang pertama ditemukan). */
function rule(source, selector) {
  const index = source.indexOf(`${selector} {`);
  if (index === -1) return '';
  const end = source.indexOf('}', index);
  return source.slice(index, end + 1);
}

describe('penempatan mic di ruang tunggu', () => {
  it('mic duduk di atas pill Obrolan, bukan di tengah bawah', () => {
    const block = rule(appCss, '.ptt-dock-slot');
    expect(block).toBeTruthy();
    // Tidak lagi di tengah.
    expect(block).not.toContain('left: 50%');
    expect(block).not.toContain('translateX(-50%)');
    // Sejajar kiri dengan pill Obrolan.
    expect(block).toContain('left: 10px');
  });

  it('posisi mic memberi ruang untuk pill Obrolan setinggi 44px', () => {
    const block = rule(appCss, '.ptt-dock-slot');
    const match = block.match(/bottom:\s*calc\((\d+)px/);
    expect(match).toBeTruthy();
    const bottom = Number(match[1]);
    // Pill Obrolan: bottom 10px + tinggi 44px = 54px. Mic harus di atasnya.
    expect(bottom).toBeGreaterThanOrEqual(54);
  });

  it('media query HP tidak mengembalikan mic ke dasar layar', () => {
    // Regresi yang pernah terjadi: aturan @media mengembalikan bottom ke 10px
    // sehingga mic dan Obrolan bertumpuk di titik yang sama di HP.
    const media = appCss.slice(appCss.indexOf('@media (max-width: 400px)'));
    const block = rule(media, '.ptt-dock-slot');
    if (block) {
      const match = block.match(/bottom:\s*calc\((\d+)px/);
      expect(Number(match[1])).toBeGreaterThanOrEqual(54);
    }
  });
});

describe('penempatan mic di meja main', () => {
  it('slot mic berada di DALAM baris dock, bukan melayang fixed', () => {
    const block = rule(appCss, '.ptt-game-slot');
    expect(block).toBeTruthy();
    // Inti permintaan pemilik project: mic sebaris dengan Ejek.
    expect(block).not.toContain('position: fixed');
    expect(block).toContain('position: relative');
    expect(block).toContain('flex: 0 0 auto');
  });

  it('slot mic diletakkan tepat setelah slot Ejek di GameBoard', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'components', 'GameBoard.jsx'), 'utf8');
    const tauntAt = source.indexOf('id="taunt-dock-slot"');
    const pttAt = source.indexOf('id="ptt-game-slot"');
    expect(tauntAt).toBeGreaterThan(-1);
    expect(pttAt).toBeGreaterThan(-1);
    // Mic SETELAH Ejek: bersebelahan dengan Ejek, bukan dengan Buang.
    expect(pttAt).toBeGreaterThan(tauntAt);
    // Tidak ada lagi slot mic kedua di luar dock.
    expect(source.indexOf('id="ptt-game-slot"', pttAt + 1)).toBe(-1);
  });

  it('tinggi tombol mic disamakan dengan tombol dock lain (--ctl-h)', () => {
    expect(appCss).toContain('.ptt-game-slot .ptt--compact .ptt__button');
    const block = rule(appCss, '.ptt-game-slot .ptt--compact .ptt__button');
    expect(block).toContain('var(--ctl-h, 44px)');
  });
});

describe('tombol Ejek di dock', () => {
  it('label Ejek disembunyikan di layar sempit (ikon saja)', () => {
    expect(fxCss).toContain('.tkfx-fab__label');
    const media = fxCss.slice(fxCss.indexOf('@media (max-width: 560px)'));
    expect(media).toContain('.tkfx-fab--dock .tkfx-fab__label');
    expect(media).toContain('display: none');
  });

  it('label tetap tampil di layar lebar', () => {
    // Tidak ada aturan global yang menyembunyikan label di luar media query.
    const base = rule(fxCss, '.tkfx-fab__label');
    expect(base).toBeTruthy();
    expect(base).not.toContain('display: none');
  });

  it('tombol Ejek tetap memakai aria-label meski label teks tersembunyi', () => {
    const source = readFileSync(
      join(process.cwd(), 'src', 'components', 'TauntThrowSystem.jsx'),
      'utf8',
    );
    expect(source).toContain('aria-label="Bumbu Tongkrongan: ejekan dan lemparan"');
  });
});

describe('tombol Tutup/Intip di dock', () => {
  it('label disembunyikan di layar sempit (ikon saja)', () => {
    const media = appCss.slice(appCss.indexOf('@media (max-width: 560px)'));
    expect(media).toContain('.hand-privacy-btn.in-dock .hand-privacy-label');
    expect(media).toContain('display: none');
  });

  it('tombol tetap 44px agar nyaman ditekan tanpa teks', () => {
    const media = appCss.slice(appCss.indexOf('@media (max-width: 560px)'));
    const block = media.slice(media.indexOf('.hand-privacy-btn.in-dock .hand-privacy-label'));
    expect(block).toContain('min-width: var(--ctl-h, 44px)');
  });

  it('status tetap terbaca lewat ikon dan warna, bukan teks', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'components', 'GameBoard.jsx'), 'utf8');
    // Ikon berganti sesuai status.
    expect(source).toContain('<Icon.Eye size={14} />');
    expect(source).toContain('<Icon.EyeClosed size={14} />');
    // Warna emas saat kartu dikaleng.
    const base = rule(appCss, '.hand-privacy-btn.is-hidden');
    expect(base).toContain('#FFD085');
  });

  it('aria-label tetap menyebut Tutup dan Intip meski teks tersembunyi', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'components', 'GameBoard.jsx'), 'utf8');
    expect(source).toContain('Kaleng kartu: tutup semua kartu di tangan (anti intip)');
    expect(source).toContain('Buka kaleng: tampilkan wajah kartu di tangan');
  });
});

describe('chat tetap hanya di ruang tunggu', () => {
  it('GameBoard tidak mengimpor RoomChat', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'components', 'GameBoard.jsx'), 'utf8');
    expect(source).not.toContain('RoomChat');
    expect(source).not.toContain('room-chat');
  });

  it('RoomChat tetap dipasang di RoomLobby', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'components', 'RoomLobby.jsx'), 'utf8');
    expect(source).toContain('<RoomChat');
  });

  it('pill Obrolan tetap di kiri bawah', () => {
    const block = rule(lobbyCss, '.room-chat');
    expect(block).toContain('left: 10px');
    expect(block).toContain('position: fixed');
  });
});
