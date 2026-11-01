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
  it('mic duduk di KANAN bawah, sejajar dengan pill Obrolan di kiri', () => {
    const block = rule(appCss, '.ptt-dock-slot');
    expect(block).toBeTruthy();
    // Sejajar kanan-kiri, bukan bertumpuk vertikal.
    expect(block).toContain('right: 10px');
    expect(block).not.toContain('left: 10px');
    // Tidak lagi di tengah.
    expect(block).not.toContain('left: 50%');
    expect(block).not.toContain('translateX(-50%)');
  });

  it('garis bawahnya sama dengan pill Obrolan sehingga benar-benar sejajar', () => {
    const ptt = rule(appCss, '.ptt-dock-slot');
    const chat = rule(lobbyCss, '.room-chat');
    const bottomOf = source => {
      const match = source.match(/bottom:\s*calc\((\d+)px/);
      return match ? Number(match[1]) : null;
    };
    // Keduanya 10px + safe-area-inset → satu garis horizontal.
    expect(bottomOf(ptt)).toBe(10);
    expect(bottomOf(chat)).toBe(10);
  });

  it('tidak ada aturan media query yang menimpa posisi mic', () => {
    // Regresi yang pernah terjadi: @media mengembalikan bottom ke 62px
    // sehingga mic melompat ke atas dan tidak lagi sejajar dengan Obrolan.
    const mediaBlocks = appCss.match(/@media[^{]+\{[\s\S]*?\n\}/g) || [];
    for (const media of mediaBlocks) {
      const block = rule(media, '.ptt-dock-slot');
      if (block) {
        expect(block).not.toContain('bottom:');
        expect(block).not.toContain('left:');
      }
    }
  });

  it('di HP label mic disembunyikan sehingga tinggal ikon', () => {
    expect(appCss).toContain('.ptt-dock-slot .ptt__label');
    const media = appCss.slice(appCss.indexOf('@media (max-width: 560px)'));
    expect(media).toContain('.ptt-dock-slot .ptt__label');
    expect(media).toContain('display: none');
  });

  it('tombol mic tetap 44px saat tanpa label', () => {
    const media = appCss.slice(appCss.indexOf('@media (max-width: 560px)'));
    expect(media).toContain('min-width: 44px');
  });

  it('mic TIDAK dinaikkan di atas panel obrolan (akan menutupi tombol kirim)', () => {
    // Saat panel obrolan terbuka di HP, panel selebar hampir seluruh layar.
    // Mic dan tombol KIRIM sama-sama di sudut kanan bawah — kalau mic
    // dinaikkan z-index-nya, ia menutupi tombol kirim dan chat jadi tak
    // terpakai. Jadi mic harus tetap DI BAWAH panel obrolan.
    const ptt = rule(appCss, '.ptt-dock-slot');
    const chat = rule(lobbyCss, '.room-chat');
    const zOf = source => {
      const match = source.match(/z-index:\s*(\d+)/);
      return match ? Number(match[1]) : 0;
    };
    expect(zOf(ptt)).toBeLessThan(zOf(chat));
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

describe('panel reaksi suara = bubble di atas tombol mic', () => {
  it('wadah tombol mic position:relative agar bubble menempel padanya', () => {
    const block = rule(appCss, '.ptt-dock');
    expect(block).toBeTruthy();
    expect(block).toContain('position: relative');
  });

  it('bubble diposisikan absolut di ATAS tombol mic, bukan deret di dalam dock', () => {
    const block = rule(appCss, '.voice-bar--bubble,');
    // Aturan gabungan `.voice-bar--bubble, .voice-bar--inline {` diambil utuh.
    const full = block || appCss.slice(
      appCss.indexOf('.voice-bar--bubble,'),
      appCss.indexOf('}', appCss.indexOf('.voice-bar--bubble,')) + 1,
    );
    expect(full).toBeTruthy();
    expect(full).toContain('position: absolute');
    // Menempel ke atas: bottom = 100% dari tinggi tombol + jarak.
    expect(full).toContain('bottom: calc(100% + 8px)');
    // Kolom vertikal, bukan baris horizontal.
    expect(full).toContain('flex-direction: column');
  });

  it('lebar bubble dibatasi lebar viewport sehingga tidak bisa meluber', () => {
    // Bug lama: deretan tombol horizontal meluber ke kanan pada layar 360px
    // sehingga "Mantap!" dan "Waduh!" terpotong.
    const start = appCss.indexOf('.voice-bar--bubble,');
    const block = appCss.slice(start, appCss.indexOf('}', start) + 1);
    expect(block).toContain('max-width: min(180px, calc(100vw - 24px))');
    // Tinggi juga dibatasi supaya tidak memotong tombol teratas di layar pendek.
    expect(block).toContain('max-height: min(60vh, 320px)');
    expect(block).toContain('overflow-y: auto');
  });

  it('GameBoard tidak lagi merender VoiceReactionBar sendiri', () => {
    // Panel ikut tombol mic (portal dari App.jsx). Kalau GameBoard merendernya
    // lagi, akan ada dua panel dan salah satunya kembali meluber di dock.
    const source = readFileSync(join(process.cwd(), 'src', 'components', 'GameBoard.jsx'), 'utf8');
    expect(source).not.toContain('VoiceReactionBar');
  });

  it('PTTDock merender panel di dalam wadah tombol (bukan fixed terpisah)', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'components', 'PTTDock.jsx'), 'utf8');
    expect(source).toContain('<VoiceReactionBar');
    expect(source).toContain('inline');
    // Terbuka lewat ketukan pada tombol mic.
    expect(source).toContain('onTap');
    expect(source).toContain('reactionsOpen');
  });

  it('penonton tidak mendapat panel reaksi (tidak punya kursi)', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'App.jsx'), 'utf8');
    expect(source).toContain('reactionsEnabled={room.seats.some(seat => seat.id === viewerId)}');
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
