import { describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { renderToString } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import RoomLobby from '../components/RoomLobby.jsx';
import Standings from '../components/Standings.jsx';
import RoundScoreDetail, { ScoreCardPreview } from '../components/RoundScoreDetail.jsx';
import { createRoom } from '../engine/roomEngine.js';

const card = (value, suit, extra = {}) => ({ value, suit, kind: 'standard', uid: `${value}-${suit}`, ...extra });

const lastScores = [
  {
    playerId: 'host-1',
    name: 'Host Satu',
    positive: 40,
    negative: 10,
    closerBonus: 30,
    handMelds: [],
    restCards: [card('5', '♠')],
    jokersInHand: 0,
    discardedJokers: 0,
    discardedAces: 0,
    total: 60,
  },
  {
    playerId: 'guest-2',
    name: 'Tamu Dua',
    positive: 15,
    negative: 45,
    closerBonus: 0,
    handMelds: [],
    restCards: [card('9', '♥'), card('K', '♦'), card('2', '♣')],
    jokersInHand: 0,
    discardedJokers: 0,
    discardedAces: 0,
    total: -30,
  },
];

function roundEndRoom(overrides = {}) {
  const base = createRoom({ code: '1234', hostId: 'host-1', name: 'Host Satu', avatar: 'finn' });
  return {
    ...base,
    status: 'round-end',
    round: 1,
    seats: [
      { id: 'host-1', name: 'Host Satu', avatar: 'finn', ready: false, bot: false, score: 60 },
      { id: 'guest-2', name: 'Tamu Dua', avatar: 'jake', ready: false, bot: false, score: -30 },
    ],
    lastScores,
    pendingWinnerId: 'host-1',
    game: {
      players: [{ id: 'host-1', melds: [[card('7', '♠'), card('8', '♠'), card('9', '♠')]] }],
      closerCard: card('Q', '♥'),
    },
    targetScore: 500,
    ...overrides,
  };
}

const render = (element) => renderToString(element);
// SSR menyisipkan `<!-- -->` di antara teks dinamis dan meng-escape `&`:
// helper ini mengembalikan teks yang bisa dibandingkan apa adanya.
const plain = html => html.replace(/<!-- -->/g, '').replace(/&amp;/g, '&');

describe('RoomLobby — banner Ronde Selesai', () => {
  it('menampilkan tombol SIAP langsung di banner untuk non-Host yang duduk', () => {
    const html = render(
      React.createElement(RoomLobby, {
        room: roundEndRoom(),
        viewerId: 'guest-2',
        profile: { name: 'Tamu Dua', avatar: 'jake' },
        onIntent: vi.fn(),
        onExit: vi.fn(),
        presence: {},
        intentError: null,
      }),
    );
    expect(html).toContain('SIAP LANJUT RONDE');
    // Pemain sendiri tidak diulang di daftar "Belum SIAP" — yang tampil
    // justru ajakan bahwa tinggal dia yang belum siap.
    expect(html).toContain('Semua pemain lain sudah SIAP — tinggal kamu');
  });

  it('banner mendaftar pemain lain yang belum SIAP', () => {
    const room = roundEndRoom();
    room.seats = [
      ...room.seats,
      { id: 'guest-3', name: 'Tamu Tiga', avatar: 'bmo', ready: false, bot: false, score: 0 },
    ];
    const html = render(
      React.createElement(RoomLobby, {
        room,
        viewerId: 'guest-2',
        profile: { name: 'Tamu Dua', avatar: 'jake' },
        onIntent: vi.fn(),
        onExit: vi.fn(),
        presence: {},
        intentError: null,
      }),
    );
    expect(html).toContain('Belum SIAP:');
    expect(html).toContain('Tamu Tiga');
  });

  it('menampilkan status sudah siap + pembatalan saat pemain sudah menekan SIAP', () => {
    const room = roundEndRoom();
    room.seats = room.seats.map(seat => (seat.id === 'guest-2' ? { ...seat, ready: true } : seat));
    const html = render(
      React.createElement(RoomLobby, {
        room,
        viewerId: 'guest-2',
        profile: { name: 'Tamu Dua', avatar: 'jake' },
        onIntent: vi.fn(),
        onExit: vi.fn(),
        presence: {},
        intentError: null,
      }),
    );
    expect(html).toContain('SUDAH SIAP (Klik untuk Batal)');
  });

  it('Host tetap mendapat tombol MULAI RONDE BERIKUTNYA di banner', () => {
    const html = render(
      React.createElement(RoomLobby, {
        room: roundEndRoom(),
        viewerId: 'host-1',
        profile: { name: 'Host Satu', avatar: 'finn' },
        onIntent: vi.fn(),
        onExit: vi.fn(),
        presence: {},
        intentError: null,
      }),
    );
    expect(html).toContain('MULAI RONDE BERIKUTNYA');
  });

  it('strip ringkas menampilkan hasil ronde & pemenang, bukan grid kartu skor', () => {
    const html = render(
      React.createElement(RoomLobby, {
        room: roundEndRoom(),
        viewerId: 'guest-2',
        profile: { name: 'Tamu Dua', avatar: 'jake' },
        onIntent: vi.fn(),
        onExit: vi.fn(),
        presence: {},
        intentError: null,
      }),
    );
    // Piala kini ikon SVG inline (zero emoji), bukan karakter 🏆.
    expect(html).toContain('M6 2h12v7a6 6 0 0 1-12 0V2Z');
    expect(html).toContain('Ronde ');
    expect(html).toContain('Ditutup oleh Host Satu');
    expect(html).toContain('Ketuk pemain di Peringkat Meja untuk rincian kartu');
    // Detail kartu TIDAK lagi dirender di banner atas: rincian tinggal di
    // Peringkat Meja (dan di sana pun terlipat sampai baris diketuk).
    expect(html).not.toContain('Rincian kartu');
    expect(html).not.toContain('Sisa di tangan');
    // Daftar pemain tidak diduplikasi: nama tiap pemain muncul dari
    // Peringkat Meja + strip kursi, bukan dari kartu skor terpisah.
    expect(html).not.toContain('Kombinasi: +40');
  });

  it('strip hasil ronde tidak memuat visual kartu / grid pemain sama sekali', () => {
    const html = render(
      React.createElement(RoomLobby, {
        room: roundEndRoom(),
        viewerId: 'guest-2',
        profile: { name: 'Tamu Dua', avatar: 'jake' },
        onIntent: vi.fn(),
        onExit: vi.fn(),
        presence: {},
        intentError: null,
      }),
    );
    // Ambil isi strip "Hasil ronde terakhir" saja lalu pastikan bersih dari
    // kartu & avatar: itu yang dulu membuat halaman dua kali lebih panjang.
    const start = html.indexOf('aria-label="Hasil ronde terakhir"');
    expect(start).toBeGreaterThan(-1);
    const strip = html.slice(start, html.indexOf('</section>', start));
    expect(strip).not.toContain('card-asset');
    expect(strip).not.toContain('avatars/');
    expect(strip).not.toContain('<ol');
  });

  it('strip ringkas memakai "Tumpukan minum habis" saat ronde berakhir draw', () => {
    const html = render(
      React.createElement(RoomLobby, {
        room: roundEndRoom({ pendingWinnerId: null }),
        viewerId: 'guest-2',
        profile: { name: 'Tamu Dua', avatar: 'jake' },
        onIntent: vi.fn(),
        onExit: vi.fn(),
        presence: {},
        intentError: null,
      }),
    );
    expect(html).toContain('Tumpukan minum habis');
  });

  it('preview mini kartu penutup & sisa tangan tampil di baris Peringkat Meja', () => {
    const html = render(
      React.createElement(RoomLobby, {
        room: roundEndRoom(),
        viewerId: 'guest-2',
        profile: { name: 'Tamu Dua', avatar: 'jake' },
        onIntent: vi.fn(),
        onExit: vi.fn(),
        presence: {},
        intentError: null,
      }),
    );
    expect(html).toContain('Tutup');
    expect(plain(html)).toContain('3 sisa');
    // Nilai ronde terakhir langsung terbaca di baris (tanpa membuka rincian).
    expect(plain(html)).toContain('+60 ronde');
  });

  it('Kartu Kursiku default ringkas — input nama & grid avatar tersembunyi', () => {
    const html = render(
      React.createElement(RoomLobby, {
        room: roundEndRoom(),
        viewerId: 'guest-2',
        profile: { name: 'Tamu Dua', avatar: 'jake' },
        onIntent: vi.fn(),
        onExit: vi.fn(),
        presence: {},
        intentError: null,
      }),
    );
    expect(html).toContain('Ubah Nama / Avatar');
    expect(html).not.toContain('id="seat-name"');
    expect(html).not.toContain('id="seat-profile-editor"');
    // Tombol SIAP utama tetap tampil di luar lipatan.
    expect(html).toContain('SIAP (READY)');
  });

  it('header Peringkat Meja menampilkan target tamat turnamen', () => {
    const html = render(
      React.createElement(RoomLobby, {
        room: roundEndRoom(),
        viewerId: 'guest-2',
        profile: { name: 'Tamu Dua', avatar: 'jake' },
        onIntent: vi.fn(),
        onExit: vi.fn(),
        presence: {},
        intentError: null,
      }),
    );
    expect(html).toContain('Target Tamat: 500 Poin');
  });

  it('targetScore 0 ditampilkan sebagai Mode Tanpa Batas', () => {
    const html = render(
      React.createElement(RoomLobby, {
        room: roundEndRoom({ targetScore: 0 }),
        viewerId: 'guest-2',
        profile: { name: 'Tamu Dua', avatar: 'jake' },
        onIntent: vi.fn(),
        onExit: vi.fn(),
        presence: {},
        intentError: null,
      }),
    );
    expect(html).toContain('Mode Tanpa Batas');
    expect(html).not.toContain('Target Tamat:');
  });

  it('pemain yang belum duduk tetap melihat input nama & grid avatar', () => {
    const html = render(
      React.createElement(RoomLobby, {
        room: roundEndRoom(),
        viewerId: 'guest-9',
        profile: { name: 'Penonton', avatar: 'bmo' },
        onIntent: vi.fn(),
        onExit: vi.fn(),
        presence: {},
        intentError: null,
      }),
    );
    expect(html).toContain('id="seat-name"');
    expect(html).toContain('Ganti Avatar');
    expect(html).not.toContain('Ubah Nama / Avatar');
  });

  it('splash kemenangan tidak ikut ter-render di server (hanya dipasang setelah mount)', () => {
    const html = render(
      React.createElement(RoomLobby, {
        room: roundEndRoom(),
        viewerId: 'guest-2',
        profile: { name: 'Tamu Dua', avatar: 'jake' },
        onIntent: vi.fn(),
        onExit: vi.fn(),
        presence: {},
        intentError: null,
      }),
    );
    // Banner skor tetap ada; overlay sinematik dipasang lewat effect di klien.
    expect(html).toContain('Ronde');
    expect(html).not.toContain('tkfx-victory');
  });
});

describe('Standings — progress target turnamen', () => {
  const seats = [
    { id: 'a', name: 'Ani', avatar: 'finn', score: 250 },
    { id: 'b', name: 'Budi', avatar: 'jake', score: 100 },
  ];

  it('menampilkan progress bar per baris saat targetScore > 0', () => {
    const html = render(React.createElement(Standings, { seats, viewerId: 'a', targetScore: 500 }));
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuemax="500"');
    expect(html).toContain('50%');
  });

  it('menandai pemain yang sudah mencapai target', () => {
    const html = render(React.createElement(Standings, {
      seats: [{ id: 'a', name: 'Ani', avatar: 'finn', score: 520 }],
      viewerId: 'a',
      targetScore: 500,
    }));
    expect(html).toContain('TAMAT');
  });

  it('tanpa progress bar pada Mode Tanpa Batas (targetScore 0)', () => {
    const html = render(React.createElement(Standings, { seats, viewerId: 'a', targetScore: 0 }));
    expect(html).not.toContain('role="progressbar"');
    expect(html).toContain('Mode Tanpa Batas');
  });
});

describe('Standings — rincian ronde (accordion)', () => {
  const seats = [
    { id: 'host-1', name: 'Host Satu', avatar: 'finn', score: 60 },
    { id: 'guest-2', name: 'Tamu Dua', avatar: 'jake', score: -30 },
  ];
  const game = {
    players: [{ id: 'host-1', melds: [[card('7', '♠'), card('8', '♠'), card('9', '♠')]] }],
    closerCard: card('Q', '♥'),
  };

  it('tanpa hasil ronde baris tidak bisa diketuk', () => {
    const html = render(React.createElement(Standings, { seats, viewerId: 'guest-2' }));
    expect(html).not.toContain('Lihat rincian kartu & nilai ronde');
    expect(html).not.toContain('aria-expanded');
  });

  it('menampilkan nilai ronde terakhir + chevron sebagai indikator bisa diketuk', () => {
    const html = render(React.createElement(Standings, {
      seats, viewerId: 'guest-2', prevScores: lastScores, game,
    }));
    expect(html).toContain('aria-expanded="false"');
    expect(plain(html)).toContain('Lihat rincian kartu & nilai ronde');
    expect(plain(html)).toContain('+60 ronde');
    expect(plain(html)).toContain('-30 ronde');
    // Terlipat: rincian kartu belum dirender.
    expect(html).not.toContain('Sisa di tangan');
  });

  it('mengabaikan mode compact agar panel sempit tetap ringkas', () => {
    const html = render(React.createElement(Standings, {
      seats, viewerId: 'guest-2', prevScores: lastScores, game, compact: true,
    }));
    expect(html).not.toContain('aria-expanded');
  });

  it('klik baris membuka rincian angka & kartu, klik ulang menutupnya', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const flush = () => new Promise(resolve => setTimeout(resolve, 40));

    await act(async () => {
      root.render(React.createElement(Standings, {
        seats, viewerId: 'guest-2', prevScores: lastScores, game, targetScore: 500,
      }));
    });
    await act(async () => { await flush(); });

    expect(host.textContent).not.toContain('Sisa di tangan');
    const rowButton = () => [...host.querySelectorAll('button')]
      .find(node => node.textContent.includes('Host Satu'));
    expect(rowButton()).toBeTruthy();

    await act(async () => { rowButton().click(); await flush(); });
    expect(host.textContent).toContain('Kombinasi');
    expect(host.textContent).toContain('Total Ronde');
    expect(host.textContent).toContain('Sisa di tangan');
    expect(host.textContent).toContain('Kombinasi di meja');
    expect(rowButton().getAttribute('aria-expanded')).toBe('true');

    await act(async () => { rowButton().click(); await flush(); });
    expect(host.textContent).not.toContain('Sisa di tangan');
    expect(rowButton().getAttribute('aria-expanded')).toBe('false');

    await act(async () => { root.unmount(); });
    host.remove();
  });

  it('hanya satu baris terbuka pada satu waktu', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const flush = () => new Promise(resolve => setTimeout(resolve, 40));
    await act(async () => {
      root.render(React.createElement(Standings, {
        seats, viewerId: 'guest-2', prevScores: lastScores, game,
      }));
    });
    await act(async () => { await flush(); });

    const buttons = () => [...host.querySelectorAll('button')];
    await act(async () => { buttons()[0].click(); await flush(); });
    expect(buttons().filter(node => node.getAttribute('aria-expanded') === 'true')).toHaveLength(1);

    await act(async () => { buttons()[1].click(); await flush(); });
    expect(buttons().filter(node => node.getAttribute('aria-expanded') === 'true')).toHaveLength(1);
    expect(buttons()[1].getAttribute('aria-expanded')).toBe('true');

    await act(async () => { root.unmount(); });
    host.remove();
  });
});

describe('RoundScoreDetail — preview & buka otomatis', () => {
  const row = lastScores[1];

  it('ScoreCardPreview menampilkan jumlah kartu sisa di tangan', () => {
    const html = render(React.createElement(ScoreCardPreview, { row, game: null }));
    expect(html).toMatch(/3<!-- -->\s*sisa/);
  });

  it('ScoreCardPreview menampilkan badge kartu penutup untuk pemenang', () => {
    const html = render(
      React.createElement(ScoreCardPreview, { row: lastScores[0], game: { closerCard: card('Q', '♥') } }),
    );
    expect(html).toContain('Tutup');
    expect(html).toContain('+30');
  });

  it('defaultExpanded langsung membuka rincian kartu', () => {
    const html = render(
      React.createElement(RoundScoreDetail, { row, game: null, defaultExpanded: true }),
    );
    expect(html).toContain('Sisa di tangan');
    expect(html).toContain('Tutup rincian');
  });

  it('tanpa defaultExpanded rincian tetap terlipat', () => {
    const html = render(React.createElement(RoundScoreDetail, { row, game: null }));
    expect(html).not.toContain('Sisa di tangan');
    expect(html).toContain('Rincian kartu');
  });

  it('mode terkendali mengikuti prop expanded', () => {
    const closed = render(
      React.createElement(RoundScoreDetail, { row, game: null, expanded: false, onToggle: vi.fn() }),
    );
    const opened = render(
      React.createElement(RoundScoreDetail, { row, game: null, expanded: true, onToggle: vi.fn() }),
    );
    expect(closed).not.toContain('Sisa di tangan');
    expect(opened).toContain('Sisa di tangan');
  });

  it('collapsible={false} merender rincian langsung (dipakai accordion Standings)', () => {
    const html = render(
      React.createElement(RoundScoreDetail, { row, game: null, collapsible: false }),
    );
    expect(html).toContain('Sisa di tangan');
    expect(html).not.toContain('Rincian kartu');
    expect(html).not.toContain('Tutup rincian');
  });
});

describe('RoomLobby — header & tombol Keluar', () => {
  const lobbyRoom = overrides => roundEndRoom({ status: 'lobby', round: 0, lastScores: null, pendingWinnerId: null, ...overrides });

  it('header tidak menggandakan indikator online (pill tengah + badge global)', () => {
    const html = render(
      React.createElement(RoomLobby, {
        room: lobbyRoom(),
        viewerId: 'guest-2',
        profile: { name: 'Tamu Dua', avatar: 'jake' },
        onIntent: vi.fn(),
        onExit: vi.fn(),
        presence: {},
        intentError: null,
      }),
    );
    const start = html.indexOf('class="lobby-hud"');
    const header = html.slice(start, html.indexOf('</header>', start));
    // Badge koneksi global tetap ada…
    expect(header).toContain('connection-badge');
    // …tapi tidak ada lagi pill "N online" yang menduplikasi status yang sama.
    expect(header).not.toMatch(/\d+ online/);
  });

  it('menampilkan peringatan hanya saat ada kursi terputus', () => {
    const html = render(
      React.createElement(RoomLobby, {
        room: lobbyRoom(),
        viewerId: 'guest-2',
        profile: { name: 'Tamu Dua', avatar: 'jake' },
        onIntent: vi.fn(),
        onExit: vi.fn(),
        presence: { 'host-1': { online: false } },
        intentError: null,
      }),
    );
    expect(plain(html)).toContain('1 terputus');
  });

  it('tombol Keluar tampil sebagai CTA berlabel, bukan ikon tanpa teks', () => {
    const html = render(
      React.createElement(RoomLobby, {
        room: lobbyRoom(),
        viewerId: 'guest-2',
        profile: { name: 'Tamu Dua', avatar: 'jake' },
        onIntent: vi.fn(),
        onExit: vi.fn(),
        presence: {},
        intentError: null,
      }),
    );
    expect(html).toContain('lobby-danger-btn');
    expect(html).toMatch(/aria-label="Keluar Meja"/);
    expect(html).toContain('>Keluar<');
  });

  it('konfirmasi Keluar memanggil onExit (kembali ke halaman utama)', async () => {
    const onExit = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const flush = () => new Promise(resolve => setTimeout(resolve, 40));

    await act(async () => {
      root.render(React.createElement(RoomLobby, {
        room: lobbyRoom(),
        viewerId: 'guest-2',
        profile: { name: 'Tamu Dua', avatar: 'jake' },
        onIntent: vi.fn(),
        onExit,
        presence: {},
        intentError: null,
      }));
    });
    await act(async () => { await flush(); });

    const trigger = host.querySelector('button[aria-label="Keluar Meja"]');
    expect(trigger).toBeTruthy();
    await act(async () => { trigger.click(); await flush(); });
    // Dialog konfirmasi menyebut tujuan sebenarnya: halaman utama.
    expect(host.textContent).toContain('halaman utama');

    const confirm = [...host.querySelectorAll('button')]
      .find(node => node.textContent.includes('Ya, Keluar ke Halaman Utama'));
    expect(confirm).toBeTruthy();
    await act(async () => { confirm.click(); await flush(); });
    expect(onExit).toHaveBeenCalledTimes(1);

    await act(async () => { root.unmount(); });
    host.remove();
  });
});
