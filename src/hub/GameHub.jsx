import React from 'react';
import './hub.css';

const GAMES = [
  {
    id: 'jengges',
    name: 'Jengges',
    meta: '2–8 pemain · Remi urut 6',
    desc: 'Remi urut 6 khas tongkrongan. Tiga kasta sah, gali buangan, dan mati sampah.',
    art: ['/cards/ace_of_spades.svg', '/cards/king_of_hearts.svg', '/cards/10_of_clubs.svg'],
    mark: '♠',
    tint: 'emerald',
    flag: 'Siap dimainkan',
  },
  {
    id: 'banting',
    name: 'Poker Banting',
    meta: '2–8 pemain · Capsa',
    desc: 'Kartu dibagi habis, timpa kombinasi lebih tinggi. Habis duluan menang.',
    art: ['/cards/2_of_spades.svg', '/cards/ace_of_hearts.svg', '/cards/king_of_clubs.svg'],
    mark: '♣',
    tint: 'gold',
    flag: 'Siap dimainkan',
  },
  {
    id: 'fishing',
    name: 'Nusa Strike',
    meta: '1–10 pemain · Dermaga 2D',
    desc: 'Mancing bareng real-time di perairan Nusantara. Tarik-ulur senar & buru ikan Mitos!',
    mark: '⚓',
    tint: 'ocean',
    kind: 'fishing',
    flag: 'Siap dimainkan',
  },
  {
    id: 'chess',
    name: 'Catur BAWASLU',
    meta: '3–32 pemain · Cup & Duel 1v1',
    desc: 'Turnamen Cup sistem gugur multi-meja & duel klasik 1v1 dengan bagan live, penonton & ejekan.',
    mark: '♞',
    tint: 'gold',
    kind: 'chess',
    flag: 'Siap dimainkan',
  },
  {
    id: 'dominoqq',
    name: 'Domino QQ',
    meta: '2–6 pemain · Domino',
    desc: 'Domino 28 kartu, adu nilai bulatan.',
    mark: '⬢',
    tint: 'violet',
    kind: 'domino',
    flag: 'Segera',
    soon: true,
  },
  {
    id: 'gaple',
    name: 'Domino Gaple',
    meta: '2–4 pemain · Domino',
    desc: 'Domino 28 kartu, balak dan lapangan.',
    mark: '⬢',
    tint: 'violet',
    kind: 'domino',
    flag: 'Segera',
    soon: true,
  },
  {
    id: 'cangkulan',
    name: 'Cangkulan',
    meta: '3–4 pemain · Kartu remi',
    desc: 'Kartu bertumpuk di tengah meja, rebutan buangan.',
    art: ['/cards/queen_of_hearts.svg', '/cards/jack_of_spades.svg', '/cards/10_of_diamonds.svg'],
    mark: '♥',
    tint: 'emerald',
    kind: 'ghost',
    flag: 'Segera',
    soon: true,
  },
  {
    id: 'usul',
    name: 'Game Lain?',
    meta: 'Usul ke panitia',
    desc: 'Punya permainan favorit tongkrongan? Usulkan biar ditambah di ronde berikutnya.',
    mark: '+',
    tint: 'dashed',
    flag: 'Usul',
    soonLabel: 'Usul',
    soon: true,
  },
];

function IconMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="11" height="15" rx="2" />
      <path d="M9 7h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v4.5l3 1.8" />
    </svg>
  );
}

function IconSpark() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l1.9 5.2L19 10l-5.1 1.8L12 17l-1.9-5.2L5 10l5.1-1.8z" />
    </svg>
  );
}

export default function GameHub({ onPickGame, hasJenggesSession = false, onResumeJengges, firebaseEnabled = false }) {
  return (
    <main className="hub-root">
      <div className="hub-shell">
        <header className="hub-top">
          <span className="hub-mark"><IconMark /></span>
          <span className="hub-top__text">
            <span className="hub-top__title">Multi Game Pemagangan BAWASLU</span>
            <span className="hub-top__sub">Arena Kartu Peserta</span>
          </span>
          <span className={`hub-conn ${firebaseEnabled ? 'hub-conn--ok' : 'hub-conn--local'}`}>
            <span className="hub-conn__dot" />
            {firebaseEnabled ? 'Server aktif' : 'Mode lokal'}
          </span>
        </header>

        <section className="hub-hero">
          <div className="hub-hero__eyebrow">Selamat datang</div>
          <h1 className="hub-hero__title">
            Selamat datang di <em>Multi Game Pemagangan BAWASLU</em>
          </h1>
          <p className="hub-hero__sub">
            Satu tempat untuk semua permainan kartu peserta pemagangan. Pilih meja,
            bagikan kode 6 karakter, lalu main bareng dari HP atau laptop — tanpa
            perlu install apa pun.
          </p>
          <div className="hub-hero__stats">
            <span className="hub-stat"><IconSpark /> <strong>4</strong> game siap</span>
            <span className="hub-stat"><IconClock /> <strong>3</strong> game menyusul</span>
            <span className="hub-stat"><strong>1–10</strong> pemain realtime</span>
          </div>
        </section>

        {hasJenggesSession && (
          <div className="hub-resume">
            <span>Kamu masih punya kursi di meja Jengges terakhir.</span>
            <button type="button" className="hub-resume__btn" onClick={onResumeJengges}>Lanjutkan</button>
          </div>
        )}

        <div className="hub-section-head">
          <h2>Pilih Game</h2>
          <span>Klik kartu untuk masuk ke ruang tunggu</span>
        </div>

        <div className="hub-grid">
          {GAMES.map(game => (
            <button
              key={game.id}
              type="button"
              className={`hub-card hub-card--${game.tint || 'emerald'} ${game.soon ? 'is-soon' : ''}`}
              onClick={() => { if (!game.soon) onPickGame(game.id); }}
              disabled={Boolean(game.soon)}
              aria-label={game.soon ? `${game.name} — segera hadir` : `Main ${game.name}`}
              title={game.soon ? `${game.name} — segera hadir` : game.desc}
            >
              <span className="hub-card__thumb">
                <span className="hub-card__mark" aria-hidden="true">{game.mark}</span>
                {game.kind === 'domino' ? (
                  <span className="hub-card__domino-pair" aria-hidden="true">
                    <i className="hub-card__domino" />
                    <i className="hub-card__domino hub-card__domino--b" />
                  </span>
                ) : game.kind === 'fishing' ? (
                  <span className="hub-card__fishing-scene" aria-hidden="true">
                    <span className="hub-card__fishing-rod" />
                    <span className="hub-card__fishing-bobber" />
                    <span className="hub-card__fishing-fish">🐟</span>
                  </span>
                ) : game.kind === 'chess' ? (
                  <span className="hub-card__chess-scene" aria-hidden="true">
                    <span className="hub-card__chess-board" />
                    <span className="hub-card__chess-piece hub-card__chess-piece--w">♔</span>
                    <span className="hub-card__chess-piece hub-card__chess-piece--b">♞</span>
                  </span>
                ) : game.art ? (
                  <span className={`hub-card__fan ${game.kind === 'ghost' ? 'is-ghost' : ''}`}>
                    {game.art.map((src, index) => (
                      <i
                        key={`${src}-${index}`}
                        className="hub-card__fan-card"
                        style={{ backgroundImage: `url(${src})` }}
                      />
                    ))}
                  </span>
                ) : (
                  <span className="hub-card__soon-mark">
                    <span style={{ fontSize: 34, opacity: 0.55 }}>{game.mark}</span>
                    {game.soonLabel || 'Segera'}
                  </span>
                )}
                <span className={`hub-card__flag ${game.soon ? 'hub-card__flag--soon' : ''}`}>{game.flag}</span>
              </span>
              <span className="hub-card__body">
                <span className="hub-card__name">{game.name}</span>
                <span className="hub-card__meta">{game.meta}</span>
                <span className="hub-card__desc">{game.desc}</span>
              </span>
            </button>
          ))}
        </div>

        <p className="hub-foot">
          Multi Game Pemagangan BAWASLU · dibuat untuk main bareng di sela kegiatan.
          Semua meja berjalan realtime; tanpa koneksi server, permainan otomatis
          memakai Mode Simulasi Lokal (satu perangkat, banyak tab).
        </p>
      </div>
    </main>
  );
}
