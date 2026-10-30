import React, { useEffect, useState } from 'react';
import useFullscreen from '../hooks/useFullscreen.js';
import CardSVG from './CardSVG.jsx';
import { AvatarArtButton, Icon } from './SvgPrimitives.jsx';
import ConnectionBadgeGlobal from './ConnectionBadgeGlobal.jsx';
import { AVATARS } from '../engine/roomEngine.js';

const TAB_BASE = 'h-11 rounded-xl text-xs sm:text-sm font-bold transition';
const TAB_ON = 'bg-emeraldPrimary text-canvasDeep shadow-md';
const TAB_OFF = 'text-periwinkleMuted hover:text-white hover:bg-white/5';

const CTAS = 'w-full h-12 rounded-2xl bg-emeraldPrimary text-canvasDeep hover:brightness-110 active:scale-[0.99] font-bold text-sm shadow-lg transition flex items-center justify-center gap-2';

const FIELD = 'w-full bg-[#131109] border border-white/10 rounded-xl px-3.5 text-sm text-white placeholder-periwinkleMuted focus:outline-none focus:border-emeraldPrimary focus:ring-2 focus:ring-emeraldPrimary/30 transition';

export default function Lobby({
  onCreate,
  onJoin,
  joinError = '',
  initialCode = '',
  showResume = false,
  inviteCode = '',
  onResume,
  onProbeAvatars,
  firebaseEnabled = false,
  showDevHint = false,
}) {
  const { isFullscreen, toggleFullscreen } = useFullscreen();
  // Ikuti perubahan initialCode (mis. ?room= dibaca setelah mount): otomatis
  // pindah ke tab Gabung dan isi kodenya.
  const [activeTab, setActiveTab] = useState(inviteCode || initialCode ? 'join' : 'create');
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [code, setCode] = useState(initialCode);
  const [depth, setDepth] = useState(5);
  const [bots, setBots] = useState(1);
  const [error, setError] = useState('');
  // Mencegah klik-ganda: selama proses buka/gabung berjalan, tombol terkunci
  // dan labelnya berubah ("Mencari meja…") supaya jelas aksi terdaftar.
  const [busy, setBusy] = useState('');
  // Pesan joinError dari App hanya tampil sampai pemain pindah tab / mencoba lagi.
  const [showJoinError, setShowJoinError] = useState(true);
  // Potret yang dikunci oleh pemain di meja tujuan (cek saat tab Gabung dibuka).
  const [takenAvatars, setTakenAvatars] = useState(null);
  const [takenNote, setTakenNote] = useState('');

  useEffect(() => {
    if (joinError) setShowJoinError(true);
  }, [joinError]);

  useEffect(() => {
    if (!initialCode) return;
    setActiveTab('join');
    setCode(prev => prev || initialCode);
  }, [initialCode]);

  async function handleCreate(event) {
    event.preventDefault();
    if (busy) return;
    if (!name.trim()) {
      setError('Masukkan nama panggilan kamu.');
      return;
    }
    setError('');
    setBusy('create');
    try {
      await onCreate({
        name: name.trim(),
        avatar,
        depth,
        bots,
      });
    } finally {
      setBusy('');
    }
  }

  async function handleJoin(event) {
    event.preventDefault();
    if (busy) return;
    if (!name.trim()) {
      setError('Masukkan nama panggilan kamu.');
      return;
    }
    const cleanCode = code.trim().toUpperCase();
    if (cleanCode.length !== 6) {
      setError('Kode meja harus 6 karakter.');
      return;
    }
    setError('');
    if (takenAvatars && takenAvatars[avatar]) {
      setError(`Avatar itu sudah dipakai ${takenAvatars[avatar]}. Pilih avatar lain.`);
      return;
    }
    setBusy('join');
    try {
      await onJoin({ name: name.trim(), code: cleanCode, avatar });
    } finally {
      setBusy('');
    }
  }

  // Saat kode 6 karakter lengkap, tanya engine: potret mana yang sudah dipakai?
  async function probeAvatars(rawCode) {
    const clean = rawCode.trim().toUpperCase();
    if (!onProbeAvatars || clean.length !== 6) {
      setTakenAvatars(null);
      setTakenNote('');
      return;
    }
    try {
      const map = await onProbeAvatars(clean);
      setTakenAvatars(map && typeof map === 'object' ? map : null);
      setTakenNote('');
    } catch {
      setTakenAvatars(null);
      setTakenNote('Tidak bisa memeriksa kode meja. Potret bisa berubah setelah kamu masuk.');
    }
  }

  useEffect(() => {
    if (activeTab !== 'join' || busy) return undefined;
    // debounce: jangan cek tiap keystroke
    const timer = setTimeout(() => probeAvatars(code), 450);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, activeTab, busy]);

  function switchTab(tab) {
    setActiveTab(tab);
    setError('');
    setShowJoinError(false);
  }

  const taken = activeTab === 'join' ? takenAvatars : null;

  // Potret pilihan kita tiba-tiba dipakai orang lain di meja tujuan → pindah ke
  // potret pertama yang masih kosong, supaya tombol Gabung tidak memantul.
  useEffect(() => {
    if (!taken) return;
    setAvatar(current => (taken[current] ? AVATARS.find(item => !taken[item]) || current : current));
  }, [taken]);
  const takenLabel = item => (taken && taken[item]) || '';

  const avatarPicker = (
    <div>
      <span id={`avatar-label-${activeTab}`} className="block text-xs font-semibold text-periwinkleMuted mb-2">
        Pilih Avatar
      </span>
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2" role="group" aria-labelledby={`avatar-label-${activeTab}`}>
        {AVATARS.map(item => {
          const holder = takenLabel(item);
          const isMine = avatar === item;
          return (
            <AvatarArtButton
              key={item}
              avatar={item}
              selected={isMine}
              disabled={Boolean(holder) && !isMine}
              takenBy={holder}
              onClick={() => setAvatar(item)}
            />
          );
        })}
      </div>
    </div>
  );

  return (
    // h-dvh (not min-h-screen): #root is locked to 100dvh + overflow hidden, so a
    // growing <main> would push the form/CTA below a viewport that never scrolls.
    <main className="arena-canvas h-dvh flex flex-col text-white selection:bg-emeraldPrimary selection:text-canvasDeep overflow-y-auto overscroll-contain">
      {/* Top HUD — sengaja disamakan dengan header GameBoard: pill kaca,
          brand tanpa kotak border, tombol ikon persegi, strip status di tengah. */}
      <header className="lobby-hud">
        <div className="lobby-left">
          <div className="lobby-brand">
            <span className="lobby-brand__mark"><Icon.Shield size={18} /></span>
            <div className="lobby-brand__text">
              <div className="lobby-brand__title">
                <h1 className="lobby-brand__name">Remi Tongkrongan</h1>
                <span className="lobby-brand__pro lobby-pill--hide-xs">
                  Pro Arena
                </span>
              </div>
              <span className="lobby-brand__sub">Urut 6 Kartu · 8 Kursi Realtime</span>
            </div>
          </div>
        </div>

        <div className="lobby-center">
          {/* Status server nyata: Online / Menyambung… / Offline (klik = coba lagi) */}
          <ConnectionBadgeGlobal />
          {!firebaseEnabled && (
            <span className="lobby-pill lobby-pill--ghost lobby-pill--hide-xs" title="Meja hanya tersinkron antar-tab di browser ini">
              <span className="lobby-dot lobby-dot--local" aria-hidden="true" />
              1 Perangkat
            </span>
          )}
        </div>

        <div className="lobby-right">
          <button
            type="button"
            className="lobby-icon-btn"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Keluar layar penuh' : 'Masuk layar penuh'}
            aria-label={isFullscreen ? 'Keluar layar penuh' : 'Masuk layar penuh'}
          >
            <Icon.Fullscreen size={17} exit={isFullscreen} />
          </button>
        </div>
      </header>

      {/* Resume Banner */}
      {/* Undangan dari teman: prioritas utama, form sudah terisi kode. */}
      {inviteCode && (
        <div className="w-full max-w-4xl mx-auto px-4 mt-4 z-20">
          <div className="bg-[#26221B]/90 border border-emeraldPrimary/40 rounded-2xl p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3 shadow-lg">
            <div className="flex items-start gap-2.5">
              <span className="text-emeraldPrimary shrink-0 mt-0.5"><Icon.Users size={18} /></span>
              <div>
                <p className="text-xs sm:text-sm font-medium text-white">
                  Kamu diundang ke meja <strong className="text-emeraldPrimary tabular-nums">#{inviteCode}</strong>.
                </p>
                <p className="text-[11px] text-periwinkleMuted mt-0.5">
                  Isi nama panggilan di bawah, lalu tekan “Masuk Ruang Tunggu”.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sesi lama di perangkat ini: hanya muncul kalau TIDAK sedang diundang. */}
      {showResume && !inviteCode && (
        <div className="w-full max-w-4xl mx-auto px-4 mt-4 z-20">
          <div className="bg-[#26221B]/90 border border-goldAccent/40 rounded-2xl p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-2.5">
              <span className="text-goldAccent shrink-0"><Icon.History size={18} /></span>
              <p className="text-xs sm:text-sm font-medium text-white">
                Kamu masih punya kursi tersimpan di perangkat ini. Skor dan kartumu aman.
              </p>
            </div>
            <button
              type="button"
              className="min-h-11 px-4 py-2 rounded-xl bg-emeraldPrimary hover:brightness-110 active:scale-95 font-bold text-xs sm:text-sm text-canvasDeep shadow-md transition"
              onClick={onResume}
            >
              Kembali ke Meja
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area — the form comes first on small screens so the CTA
          is reachable without scrolling past the hero illustration. */}
      <section className="flex-1 w-full max-w-5xl mx-auto px-4 py-5 sm:py-8 flex flex-col md:flex-row items-center justify-center gap-6 md:gap-12 z-20">
        {/* Hero Illustration Left */}
        <div className="order-2 md:order-1 flex flex-col items-center md:items-start text-center md:text-left max-w-md">
          {/* Card Fan Showcase */}
          <div className="relative w-56 h-40 sm:w-64 sm:h-48 mb-4 sm:mb-6 flex items-end justify-center">
            <div className="w-20 sm:w-28 absolute left-1 sm:left-2 top-2 -rotate-[16deg] shadow-card rounded-lg transition-transform hover:-translate-y-2">
              <CardSVG card={{ value: 'K', suit: '♠', kind: 'standard' }} />
            </div>
            <div className="w-20 sm:w-28 absolute left-[72px] sm:left-16 top-0 z-10 shadow-card rounded-lg transition-transform hover:-translate-y-2">
              <CardSVG back />
            </div>
            <div className="w-20 sm:w-28 absolute left-[143px] sm:left-30 top-3 rotate-[16deg] z-20 shadow-card rounded-lg transition-transform hover:-translate-y-2">
              <CardSVG card={{ value: 'A', suit: '♥', kind: 'standard' }} />
            </div>
          </div>

          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white mb-2 leading-tight">
            Sensasi Meja Tongkrongan Asli
          </h2>
          <p className="text-xs sm:text-sm text-periwinkleMuted leading-relaxed">
            Ruang tunggu 8 kursi dengan tombol SIAP, upacara kocok &amp; bagi kartu,
            gali tumpukan buangan, dan Pengocok bergilir ke pemain dengan skor terendah tiap ronde
          </p>

          <div className="mt-5 flex flex-wrap gap-2 justify-center md:justify-start">
            <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-semibold text-periwinkleMuted">
              3 Kasta Sah
            </span>
            <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-semibold text-periwinkleMuted">
              Mati Sampah
            </span>
            <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-semibold text-periwinkleMuted">
              Gali Buangan
            </span>
            <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-semibold text-periwinkleMuted">
              Bot Lokal 1–7
            </span>
          </div>
        </div>

        {/* Interactive Form Card Right */}
        <div className="order-1 md:order-2 w-full max-w-md bg-[#24211A]/90 backdrop-blur-xl border border-white/10 rounded-3xl p-5 sm:p-7 shadow-2xl">
          {/* Tabs Navigation */}
          <div className="grid grid-cols-3 gap-1 p-1 bg-[#17140F] rounded-2xl border border-white/5 mb-6" role="tablist" aria-label="Pilihan Meja">
            <button
              type="button"
              id="tab-create"
              role="tab"
              aria-selected={activeTab === 'create'}
              aria-controls="panel-create"
              className={`${TAB_BASE} ${activeTab === 'create' ? TAB_ON : TAB_OFF}`}
              onClick={() => switchTab('create')}
            >
              Buka Meja
            </button>
            <button
              type="button"
              id="tab-join"
              role="tab"
              aria-selected={activeTab === 'join'}
              aria-controls="panel-join"
              className={`${TAB_BASE} ${activeTab === 'join' ? TAB_ON : TAB_OFF}`}
              onClick={() => switchTab('join')}
            >
              Gabung Room
            </button>
            <button
              type="button"
              id="tab-rules"
              role="tab"
              aria-selected={activeTab === 'rules'}
              aria-controls="panel-rules"
              className={`${TAB_BASE} ${activeTab === 'rules' ? TAB_ON : TAB_OFF}`}
              onClick={() => switchTab('rules')}
            >
              Aturan Main
            </button>
          </div>

          {(error || (showJoinError && joinError)) && (
            <div className="mb-4 p-3 rounded-2xl bg-crimsonDanger/15 border border-crimsonDanger/30 flex items-start gap-2.5 text-xs text-white" role="alert">
              <span className="text-crimsonText shrink-0 mt-px"><Icon.Info size={15} /></span>
              <p className="leading-snug">{error || joinError}</p>
            </div>
          )}

          {activeTab === 'create' && (
            <form id="panel-create" role="tabpanel" aria-labelledby="tab-create" onSubmit={handleCreate} className="flex flex-col gap-5">
              <div>
                <label htmlFor="player-name" className="block text-xs font-semibold text-periwinkleMuted mb-1.5">
                  Nama Panggilan
                </label>
                <input
                  id="player-name"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Contoh: Budi Tongkrongan"
                  maxLength={18}
                  autoFocus
                  className={`${FIELD} h-12`}
                />
              </div>

              {avatarPicker}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label htmlFor="depth-select" className="block text-xs font-semibold text-periwinkleMuted mb-1.5">
                    Batas Gali Buangan
                  </label>
                  <select
                    id="depth-select"
                    value={depth}
                    onChange={e => setDepth(e.target.value === 'bebas' ? 112 : Number(e.target.value))}
                    className={`${FIELD} h-11 text-xs px-3`}
                  >
                    <option value={3}>Maks 3 Kartu</option>
                    <option value={4}>Maks 4 Kartu</option>
                    <option value={5}>Maks 5 Kartu (Standar)</option>
                    <option value="bebas">Bebas Tanpa Batas</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="bot-select" className="block text-xs font-semibold text-periwinkleMuted mb-1.5">
                    Jumlah Lawan Bot AI
                  </label>
                  <select
                    id="bot-select"
                    value={bots}
                    onChange={e => setBots(Number(e.target.value))}
                    className={`${FIELD} h-11 text-xs px-3`}
                  >
                    {[1, 2, 3, 4, 5, 6, 7].map(count => (
                      <option key={count} value={count}>
                        {count} Bot AI (Meja {count + 1} Orang{count === 7 ? ' — Penuh' : ''})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button type="submit" className={`${CTAS} mt-2 disabled:opacity-60`} disabled={Boolean(busy)}>
                <Icon.CardStack size={16} />
                <span>{busy === 'create' ? 'Membuka meja…' : 'Buka Ruang Tunggu'}</span>
              </button>
              <p className="text-[11px] text-center text-periwinkleMuted">
                Kamu jadi Host. Teman bisa gabung lewat kode 6 karakter atau link undangan.
              </p>
            </form>
          )}

          {activeTab === 'join' && (
            <form id="panel-join" role="tabpanel" aria-labelledby="tab-join" onSubmit={handleJoin} className="flex flex-col gap-5">
              <div>
                <label htmlFor="join-name" className="block text-xs font-semibold text-periwinkleMuted mb-1.5">
                  Nama Panggilan
                </label>
                <input
                  id="join-name"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Nama kamu"
                  maxLength={18}
                  autoFocus={Boolean(initialCode)}
                  className={`${FIELD} h-12`}
                />
              </div>

              <div>
                <label htmlFor="join-code" className="block text-xs font-semibold text-periwinkleMuted mb-1.5">
                  Kode 6 Karakter Meja
                </label>
                <input
                  id="join-code"
                  type="text"
                  value={code}
                  onChange={e => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)); }}
                  placeholder="ABC123"
                  maxLength={6}
                  inputMode="text"
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  className={`${FIELD} h-14 text-xl font-bold tracking-[0.35em] text-center text-goldAccent uppercase tabular-nums`}
                />
              </div>

              {avatarPicker}
              {takenNote && (
                <p className="text-[11px] text-goldAccent -mt-2" role="status">{takenNote}</p>
              )}

              <button type="submit" className={`${CTAS} mt-2 disabled:opacity-60`} disabled={Boolean(busy)}>
                <Icon.Play size={14} />
                <span>{busy === 'join' ? 'Mencari meja…' : 'Masuk Ruang Tunggu'}</span>
              </button>
              <p className="text-[11px] text-center text-periwinkleMuted">
                Kamu akan duduk di kursi kosong lalu menekan SIAP. Host yang memulai permainan.
              </p>
            </form>
          )}

          {activeTab === 'rules' && (
            <div id="panel-rules" role="tabpanel" aria-labelledby="tab-rules" className="flex flex-col gap-3 max-h-[360px] overflow-y-auto pr-1 text-xs text-periwinkleMuted leading-relaxed">
              <div className="p-3 rounded-2xl bg-[#17140F] border border-white/5">
                <span className="inline-block font-bold text-xs px-2 py-0.5 rounded-full bg-emeraldPrimary/20 text-emeraldPrimary mb-1.5">
                  1. Tiga Kasta Sah
                </span>
                <p className="mb-1"><strong className="text-white">Kasta Angka (2-10)</strong>: Wajib berurutan &amp; satu kembang (misal 4♠-5♠-6♠). Boleh pakai <strong className="text-white">maksimal 1 Joker</strong>. Angka kembar dilarang. <strong className="text-white">Min. 3 kartu, boleh lebih</strong> (sampai 2–10 penuh).</p>
                <p className="mb-1"><strong className="text-white">Kasta Huruf (J-Q-K)</strong>: Wajib pas J-Q-K satu kembang tanpa Joker.</p>
                <p><strong className="text-white">Kasta As (A)</strong>: 3 As atau lebih (sampai 8 As pada dua deck), kembang bebas (beda kembang maupun campur tetap sah), tanpa Joker.</p>
              </div>

              <div className="p-3 rounded-2xl bg-[#17140F] border border-white/5">
                <span className="inline-block font-bold text-xs px-2 py-0.5 rounded-full bg-goldAccent/20 text-goldAccent mb-1.5">
                  2. Mati Sampah (Tutup)
                </span>
                <p>Menang saat kartu tangan habis <strong className="text-white">setelah membuang 1 kartu terakhir</strong>. Wajib menyisakan minimal 1 kartu untuk dibuang</p>
              </div>

              <div className="p-3 rounded-2xl bg-[#17140F] border border-white/5">
                <span className="inline-block font-bold text-xs px-2 py-0.5 rounded-full bg-emeraldPrimary/20 text-emeraldPrimary mb-1.5">
                  3. Gali Tumpukan Buangan
                </span>
                <p>Bisa mengambil kartu buangan dalam batas kedalaman. Pilih kartu di tangan dulu, lalu ketuk kartu buangan; seluruh kartu di atasnya ikut masuk tanganmu.</p>
              </div>

              <div className="p-3 rounded-2xl bg-[#17140F] border border-white/5">
                <span className="inline-block font-bold text-xs px-2 py-0.5 rounded-full bg-periwinkleMuted/20 text-white mb-1.5">
                  4. Perhitungan Poin
                </span>
                <p><strong className="text-emeraldPrimary">Poin Plus (Meja)</strong>: Angka/Joker = +5, Huruf = +10, As = +15.<br />
                <strong className="text-crimsonText">Poin Minus (Tangan)</strong>: Angka = -5, Huruf = -10, As = -15, <strong className="text-white">Joker = -50</strong> (masih ringan, tapi makin untung kalau dipakai di kombinasi).<br />
                <strong className="text-white">As yang sudah dibuang</strong>: netral (tidak plus/minus) — As hanya boleh dibuang setelah punya minimal 1 kombinasi. <strong className="text-white">Joker yang dibuang kena -150</strong>.<br />
                <strong className="text-goldAccent">Kombinasi Jadi</strong>: kombinasi sah yang masih di tangan saat ronde berakhir tetap dihitung plus.<br />
                <strong className="text-goldAccent">Kartu Penutup ×2</strong>: kartu terakhir yang ditutup bernilai 2× (Angka +10, Huruf +20, As +30). <strong className="text-white">Joker penutup = +150 utuh</strong> (bebas penalti −150, hanya berlaku untuk kartu terakhir yang menutup ronde).</p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full border-t border-white/10 px-4 py-3 text-center text-[11px] text-periwinkleMuted/80 z-20">
        <span>Remi Tongkrongan Pro Arena · 8 Kursi Realtime{showDevHint ? ' · Audit Monitor: Alt + A' : ''}</span>
      </footer>
    </main>
  );
}
