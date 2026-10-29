import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MotionConfig } from 'framer-motion';
import CardAsset from './CardAsset.jsx';
import { flyCard, flyDraw, flyDiscard, flyMeld, rectOf } from '../lib/cardFlight.js';
import { AvatarArt, Icon, PresenceDot, SuitIcon } from './SvgPrimitives.jsx';
import ConnectionBadgeGlobal from './ConnectionBadgeGlobal.jsx';
import { validateMeld, findDigMelds, calculateScores, pointsFor } from '../engine/gameRules.js';
import { applyIntent, DEFAULT_AVATAR } from '../engine/roomEngine.js';
import ConfirmDialog from './ConfirmDialog.jsx';
import CeremonyOverlay from './CeremonyOverlay.jsx';
import Standings from './Standings.jsx';
import useFullscreen from '../hooks/useFullscreen.js';
import useDialogA11y from '../hooks/useDialogA11y.js';
import { vibrate } from '../utils/haptics.js';
import { play, isMuted, toggleMute, getVolume, setVolume, isMusicEnabled, toggleMusic } from '../sound/soundFX.js';
import { startMusic, stopMusic } from '../sound/dangdut.js';
import { serverNow } from '../services/realtimeService.js';

// Berapa kartu teratas tumpukan buangan yang tampil sebagai tumpukan fisik.
// Kartu yang lebih dalam tetap bisa dibuka lewat dialog Riwayat.
const DISCARD_STACK_LIMIT = 4;

const signed = n => (n > 0 ? `+${n}` : `${n}`);

const TURN_LABEL = {
  draw: 'Ambil Kartu',
  meld: 'Buang / Turun',
  discard: 'Buang / Turun',
};

export default function GameBoard({ room, viewerId, onIntent, onExit, service, presence }) {
  const { isFullscreen, toggleFullscreen } = useFullscreen();

  // Optimistic state: terapkan intent lokal dulu, server konfirmasi via rev
  const [optRoom, setOptRoom] = useState(null);
  const live = optRoom && optRoom.rev >= room.rev ? optRoom : room;
  useEffect(() => { setOptRoom(null); }, [room.rev]);

  const game = live.game;
  const seats = live.seats;
  const viewerIndex = Math.max(
    0,
    game.players.findIndex(p => p.id === viewerId)
  );
  const isSpectator = !game.players.some(p => p.id === viewerId);

  const [viewerOverride, setViewerOverride] = useState(null);
  const viewIndex = viewerOverride ?? viewerIndex;
  const player = game.players[viewIndex] || game.players[0];
  const isMyTurn = game.turn === viewIndex && live.status === 'playing' && !isSpectator && viewerOverride === null;

  const [order, setOrder] = useState(() => (game.players[viewerIndex]?.hand || []).map(c => c.uid));
  const [selected, setSelected] = useState([]);
  const [sortMode, setSortMode] = useState('custom');
  const [notice, setNotice] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [inspectedPlayer, setInspectedPlayer] = useState(null);
  // Modal info meja bertingkat: null = tertutup, 'menu' = pilihan,
  // 'peringkat' / 'nilai' = halaman isi. Escape selalu kembali satu langkah.
  const [infoPanel, setInfoPanel] = useState(null);
  const [devOpen, setDevOpen] = useState(false);
  // Kartu yang sedang "di udara": ditahan tampilnya sampai mendarat (zero flicker)
  const [heldDiscard, setHeldDiscard] = useState(null);   // { uid }
  const [heldHandUids, setHeldHandUids] = useState([]);   // kartu tangan yang diterbangkan
  // Kipas buangan: tumpukan diklik → kartu benar-benar terangkat dari tumpukan
  // lalu membentang ke busur di bawahnya. Mesin status:
  //   'closed'   — tidak ada kipas
  //   'entering' — kartu kipas baru lahir DI POSISI TUMPUKAN (menggantikan slot)
  //   'open'     — kartu membentang ke busur, siap dipilih
  //   'closing'  — kartu menyatu balik ke tumpukan, lalu slot asli muncul lagi
  const [fanPhase, setFanPhase] = useState('closed');
  const fanSeq = useRef(0);
  const [pickedFanIndex, setPickedFanIndex] = useState(null); // kartu kipas yang tergali
  const [fanMeasure, setFanMeasure] = useState({ w: 0, maxW: 0 });
  const fanRef = useRef(null);
  const [meldCelebrate, setMeldCelebrate] = useState(0);   // penanda animasi kombinasi
  const [meldCelebratePlayer, setMeldCelebratePlayer] = useState(-1);
  const thrownUids = useRef(new Set());                   // buangan yang sudah dianimasikan sendiri
  const flyingCount = useRef(0);
  const [now, setNow] = useState(() => serverNow());
  const [busy, setBusy] = useState(false);
  const [pendingDiscard, setPendingDiscard] = useState(null);
  const [muted, setMuted] = useState(isMuted());
  const [musicOn, setMusicOn] = useState(isMusicEnabled());
  const [volume, setVolumeState] = useState(getVolume());
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  // Pengingat setelah Joker benar-benar dibuang (tanpa konfirmasi di depan).
  const [jokerShock, setJokerShock] = useState(null);
  // Kartu tangan: 'fan' = busur tumpuk (default), 'spread' = sejajar agar mudah diklik.
  const [handSpread, setHandSpread] = useState(false);
  // Pilihan kombinasi gali (hanya muncul kalau ada lebih dari satu opsi sah).
  const [digChoices, setDigChoices] = useState(null);
  // Escape + fokus untuk modal ringan (ConfirmDialog sudah punya trap sendiri).
  const historyPanelRef = useDialogA11y(historyOpen, () => setHistoryOpen(false));
  const helpPanelRef = useDialogA11y(helpOpen, () => setHelpOpen(false));
  const inspectPanelRef = useDialogA11y(inspectedPlayer !== null, () => setInspectedPlayer(null));
  const closeInfoPanel = () => setInfoPanel(prev => (prev && prev !== 'menu' ? 'menu' : null));
  const standingsPanelRef = useDialogA11y(Boolean(infoPanel), closeInfoPanel);
  const digPanelRef = useDialogA11y(Boolean(digChoices), () => setDigChoices(null));
  const lastTurnRef = useRef(game.turn);
  // Nilai snapshot pada COMMIT SEBELUMNYA. Dibaca saat render (bukan di dalam
  // effect) karena notify() lokal bersifat sinkron: saat kita klik aksi, send()
  // langsung memanggil setRoom sehingga effect dengan rev baru ikut jalan di
  // batch yang sama. Kalau baseline dibaca di dalam effect, ketiga commit itu
  // melihat baseline yang sama dan animasi lawan tidak pernah terpicu.
  const remotePrevRef = useRef(null);

  const dealing = game.dealingUntil && now < game.dealingUntil;
  const dealTick = Boolean(dealing);

  // Jam UI untuk countdown giliran & deal animation
  useEffect(() => {
    const interval = setInterval(() => setNow(serverNow()), dealing ? 100 : 1000);
    return () => clearInterval(interval);
  }, [dealing]);

  // ==========================================================================
  // AKSI PEMAIN LAIN (Bot 1–5): baca snapshot baru, lalu terbangkan kartu dari
  // kipas mini avatar bot ke tempat buangan (buang) atau dari tumpukan minum ke
  // kipas mini bot (minum). Semua koordinat diukur, tidak ditaksir.
  // ==========================================================================
  const remoteSnap = {
    rev: live.rev,
    turn: game.turn,
    discard: (game.discardPile || []).length,
    draw: (game.drawPile || []).length,
    hands: (game.players || []).map(p => (p.hand || []).length),
    melds: (game.players || []).map(p => (p.melds || []).reduce((sum, group) => sum + group.length, 0)),
  };

  useEffect(() => {
    const prev = remotePrevRef.current;
    const next = remoteSnap;
    // baseline selalu dimajukan di akhir effect (setelah animasi dipicu)
    remotePrevRef.current = next;
    if (!prev) return;
    if (dealTick) return;
    if (live.rev === prev.rev) return;             // bukan snapshot baru
    const pileRect = rectOf('.discard-stack, [data-dropzone="discard"]');
    if (!pileRect) return;

    const seatEl = idx => document.querySelector(`[data-seat-index="${idx}"] .pod-fan`);

    // ---- BUANG: kartu baru masuk ke tumpukan ----
    if (next.discard > prev.discard) {
      const card = game.discardPile[next.discard - 1];
      // pelaku = pemain yang sedang giliran SEBELUM snapshot ini
      const culpritIndex = prev.turn ?? game.turn;
      const culprit = game.players[culpritIndex];
      if (card && !thrownUids.current.has(card.uid) && culprit && culprit.id !== viewerId) {
        setHeldDiscard({ uid: card.uid });
        flyingCount.current += 1;
        flyCard({
          from: rectOf(seatEl(culpritIndex)),
          to: pileRect,
          card,
          rotateStart: -12,
          rotateFinal: 0,
          duration: 500,
          onLand: () => setHeldDiscard(cur => (cur?.uid === card.uid ? null : cur)),
          onDone: () => { flyingCount.current -= 1; },
        });
        play('discard');
      }
    }

    // ---- KOMBINASI: ada pemain lain yang baru menurunkan kartu ke meja ----
    next.melds.forEach((count, index) => {
      const added = count - (prev.melds?.[index] ?? count);
      const owner = game.players[index];
      if (added <= 0 || !owner || owner.id === viewerId) return;
      const meldEl = document.querySelector('[data-dropzone="meld"]');
      const fresh = (owner.melds || []).slice(-1)[0] || [];
      // hanya kartu yang benar-benar baru (slice ekor sesuai jumlah bertambah)
      const newCards = fresh.slice(Math.max(0, fresh.length - added));
      flyingCount.current += 1;
      flyMeld({
        fromEls: [seatEl(index)],
        toEl: meldEl,
        cards: newCards.length ? newCards : [{ uid: `meld-${index}-${count}`, value: '?', suit: '' }],
        gap: 80,
        onEachLand: () => play('deal'),
        onAllLand: () => {
          play('meld');
          setMeldCelebratePlayer(index);
          setMeldCelebrate(Date.now());
          flyingCount.current -= 1;
        },
      });
    });

    // ---- MINUM: tumpukan berkurang & tangan bot bertambah 1 ----
    if (next.draw < prev.draw) {
      // cari pemain yang tangannya bertambah; pemain utama diabaikan
      // (minum sendiri sudah dianimasikan dari handler klik)
      const gainedIndex = next.hands.findIndex((n, i) => n === prev.hands[i] + 1 && game.players[i]?.id !== viewerId);
      const bot = gainedIndex >= 0 ? game.players[gainedIndex] : null;
      if (bot) {
        flyingCount.current += 1;
        flyDraw({
          fromEl: '.deck-stack',
          toEl: seatEl(gainedIndex),
          card: null,
          onDone: () => { flyingCount.current -= 1; },
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- remoteSnap dibentuk tiap render; cukup dipicu oleh field sumbernya
  }, [live.rev, game.discardPile, game.drawPile, game.turn, game.players, dealTick, viewerId]);

  const mySeat = seats.find(seat => seat.id === viewerId);
  const mySeatOffline = mySeat && !mySeat.bot && presence?.[mySeat.id]?.online === false;

  const hand = useMemo(() => {
    const byId = new Map((game.players[viewerIndex]?.hand || []).map(c => [c.uid, c]));
    const list = order.map(uid => byId.get(uid)).filter(Boolean);
    for (const card of game.players[viewerIndex]?.hand || []) {
      if (!list.includes(card)) list.push(card);
    }
    if (sortMode === 'custom') return list;
    const rankVal = v => (v === 'JOKER' ? 99 : v === 'A' ? 1 : v === 'J' ? 11 : v === 'Q' ? 12 : v === 'K' ? 13 : Number(v) || 0);
    return [...list].sort((a, b) => {
      if (sortMode === 'value') return (rankVal(a.value) - rankVal(b.value)) || String(a.suit).localeCompare(String(b.suit));
      return String(a.suit).localeCompare(String(b.suit)) || rankVal(a.value) - rankVal(b.value);
    });
  }, [game.players, viewerIndex, order, sortMode]);

  // Overlap in px from the measured card width so every card keeps a readable index
  const [handCardW, setHandCardW] = useState(100);
  useEffect(() => {
    const measure = () => {
      const first = document.querySelector('.hand-card-size');
      if (first) setHandCardW(first.getBoundingClientRect().width || 100);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [hand.length]);

  const dynamicOverlap = useMemo(() => {
    if (handSpread) return 0;
    const count = hand.length;
    const ratio = count <= 5 ? 0.12 : count <= 7 ? 0.2 : count <= 9 ? 0.27 : count <= 11 ? 0.32 : count <= 13 ? 0.36 : 0.4;
    return Math.round(handCardW * ratio);
  }, [hand.length, handCardW, handSpread]);

  // Mode bentang: jarak 8px antar kartu dan lebar kartu TIDAK dikecilkan.
  // Kalau baris lebih lebar dari layar, baris digeser ke samping (scroll)
  // supaya tiap kartu tetap besar dan mudah diklik.
  // Mulai dari kartu pertama tiap kali mode bentang dinyalakan.
  useEffect(() => {
    if (!handSpread) return;
    const fan = document.querySelector('.hand-fan.is-spread');
    fan?.scrollTo({ left: 0 });
  }, [handSpread]);

  const chosenCards = useMemo(() => hand.filter(card => selected.includes(card.uid)), [hand, selected]);
  const meldValidation = useMemo(() => validateMeld(chosenCards), [chosenCards]);

  const opponents = useMemo(() => {
    const list = [];
    const count = game.players.length;
    for (let offset = 1; offset < count; offset++) {
      const idx = (viewIndex + offset) % count;
      list.push({ seat: game.players[idx], meta: seats.find(s => s.id === game.players[idx].id), index: idx });
    }
    return list;
  }, [game.players, seats, viewIndex]);

  // Papan poin live: estimasi poin ronde berjalan memakai aturan hitung akhir
  // yang sama (kombinasi meja & tangan = plus, sisa tangan = minus, Joker di
  // tangan -50), plus hasil ronde terakhir yang masih relevan saat ronde baru
  // berjalan. Murah: hitung ulang hanya saat players berubah.
  const liveScoreById = useMemo(
    () => Object.fromEntries(calculateScores(game.players).map(row => [row.playerId, row])),
    [game.players],
  );
  const prevScoreById = useMemo(
    () => Object.fromEntries((live.prevScores || []).map(row => [row.playerId, row])),
    [live.prevScores],
  );

  const discardPile = game.discardPile || [];
  // Kartu buangan yang masih "di udara" (ditahan) tidak dirender dulu, supaya
  // terlihat terbang lalu mendarat — bukan muncul dua kali.
  const heldUid = heldDiscard?.uid;
  const visibleDiscard = heldUid ? discardPile.filter(c => c.uid !== heldUid) : discardPile;
  const drawPile = game.drawPile || [];
  const shownDiscards = visibleDiscard.slice(-DISCARD_STACK_LIMIT);
  const buriedCount = Math.max(0, visibleDiscard.length - shownDiscards.length);
  const totalMelds = player.melds.reduce((sum, group) => sum + group.length, 0);
  // Nilai poin kombinasi yang sudah diturunkan ke meja — aturan hitung sama
  // dengan penilaian akhir ronde (Joker di kombinasi +5). Pill lama keliru
  // menampilkan jumlah kartu sebagai "Poin".
  const meldPoints = player.melds
    .flat()
    .reduce((sum, card) => sum + ((card.kind === 'joker' || card.value === 'JOKER') ? 5 : pointsFor(card)), 0);

  // Kartu yang tampil di kipas: semua kedalaman yang masih sah digali
  // (≤ batas gali), dipatok 12 teratas supaya kipas tetap terbaca.
  const fanCards = useMemo(() => {
    if (fanPhase === 'closed') return [];
    const maxShow = Math.min(live.maxDepth || 5, 12, visibleDiscard.length);
    return visibleDiscard.slice(-maxShow).map((card, i, arr) => {
      const absoluteIndex = visibleDiscard.length - arr.length + i;
      const depth = visibleDiscard.length - absoluteIndex;
      return { card, absoluteIndex, depth, locked: depth > (live.maxDepth || 5) };
    });
  }, [fanPhase, visibleDiscard, live.maxDepth]);

  const secondsLeft = live.status === 'playing' && !dealing
    ? Math.max(0, Math.ceil((live.lastActionAt + live.turnSeconds * 1000 - now) / 1000))
    : null;
  const timedOut = secondsLeft !== null && secondsLeft <= 0;

  // Bunyi hitung mundur 10 detik terakhir. Dipicu per angka (bukan per tick
  // jam) supaya tidak dobel, dan hanya saat giliranku atau giliran aktif.
  const lastTickRef = useRef(null);
  useEffect(() => {
    if (secondsLeft === null) { lastTickRef.current = null; return; }
    if (secondsLeft > 10) { lastTickRef.current = null; return; }
    if (secondsLeft <= 0) return;
    if (lastTickRef.current === secondsLeft) return;
    // Lewati lompatan besar (mis. tab baru dibuka) agar tidak menumpuk suara.
    if (lastTickRef.current !== null && lastTickRef.current - secondsLeft > 1) { lastTickRef.current = secondsLeft; return; }
    lastTickRef.current = secondsLeft;
    if (secondsLeft <= 3) play('finalTick');
    else play('tick', (10 - secondsLeft) / 7);
  }, [secondsLeft]);
  const turnFraction = secondsLeft !== null && live.turnSeconds
    ? Math.max(0, Math.min(1, secondsLeft / live.turnSeconds))
    : 1;

  const canDrawNow = game.phase === 'draw' && isMyTurn && !busy && !dealing;
  const canPlayNow = game.phase !== 'draw' && isMyTurn && !busy && !dealing;

  // ==========================================================================
  // KIPAS BUANGAN — tumpukan diklik: kartu menyebar membentuk busur ke bawah,
  // pemain ketuk kartu yang mau digali, ketuk di luar / Esc = meluncur balik.
  // ==========================================================================
  function openFan() {
    if (!canDrawNow || !discardPile.length || fanPhase !== 'closed') return;
    play('spread');
    const seq = ++fanSeq.current;
    setFanPhase('entering');
    // dua frame: kartu kipas tergambar dulu DI ATAS TUMPUKAN (mengambil alih
    // slot yang menghilang), baru transisi membentang ke busurnya.
    const reveal = () => { if (fanSeq.current === seq) setFanPhase('open'); };
    requestAnimationFrame(() => requestAnimationFrame(reveal));
    // Halaman yang dibekukan browser (pindah aplikasi, layar ponsel mati)
    // tidak pernah menjalankan rAF — tanpa timer ini kipas macet di 'entering'.
    setTimeout(reveal, 160);
  }

  function closeFan(withSound = true) {
    if (fanPhase === 'closed' || fanPhase === 'closing') return;
    fanSeq.current += 1;
    if (withSound) play('discard');
    setFanPhase('closing');
    // tunggu kartu menyatu balik ke tumpukan sebelum melepasnya dari layar
    window.setTimeout(() => setFanPhase('closed'), 460);
  }

  // Ronde pindah / aksi lain terjadi → kipas menutup sendiri tanpa suara.
  useEffect(() => {
    if (fanPhase === 'open' && !canDrawNow) closeFan(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fanPhase, canDrawNow]);

  // Escape + klik di luar kipas menutupnya. Klik pada kartu tangan TETAP
  // berfungsi (memilih kartu) sambil menutup kipas — bukan ditelan veil.
  useEffect(() => {
    if (fanPhase === 'closed') return undefined;
    const onKey = event => { if (event.key === 'Escape') closeFan(); };
    const onDown = event => {
      const target = event.target;
      if (target instanceof Element && target.closest('.discard-fan, .discard-stack')) return;
      closeFan();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fanPhase]);

  // Ukur lebar wadah & kartu kipas sekali terbuka → jarak antar kartu
  // menyesuaikan otomatis (makin banyak kartu makin rapat, seperti kipas tangan).
  useLayoutEffect(() => {
    if (fanPhase === 'closed') return undefined;
    const measure = () => {
      const fan = fanRef.current;
      if (!fan) return;
      const first = fan.querySelector('.discard-fan__card');
      setFanMeasure({
        maxW: fan.getBoundingClientRect().width || 320,
        w: first ? first.getBoundingClientRect().width : 90,
      });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [fanPhase, fanCards.length]);

  // Fokus keyboard masuk ke kartu teratas (#1, ujung kanan) saat kipas terbuka.
  useLayoutEffect(() => {
    if (fanPhase !== 'open') return;
    const pickers = Array.from(fanRef.current?.querySelectorAll('button.discard-fan__card:not(:disabled)') || []);
    pickers[pickers.length - 1]?.focus({ preventScroll: true });
  }, [fanPhase]);

  function send(intent) {
    const result = applyIntent(live, intent, viewerId);
    if (result.error) {
      setNotice(result.error);
      play('error');
      return false;
    }
    setOptRoom(result.room);
    onIntent(intent);
    const rev = result.room.rev;
    setTimeout(() => setOptRoom(cur => (cur && cur.rev === rev ? null : cur)), 1600);
    return true;
  }

  function handleDraw() {
    if (!canDrawNow) return;
    if (!game.drawPile.length) {
      setNotice('Tumpukan minum habis.');
      return;
    }
    setBusy(true);
    play('draw');
    if (!muted) vibrate(8);
    // Kloningan terbang dari kartu teratas TUMPUKAN MINUM ke slot kipas tangan
    // (sebelum state berubah; slot target = kartu tangan pertama/terakhir)
    const handSlot = document.querySelector('.hand-fan .hand-card-wrapper:last-child');
    flyingCount.current += 1;
    // Intent dikirim SEKALI saja: dari callback animasi, atau dari timer
    // di bawah bila animasi tidak pernah selesai (halaman dibekukan browser /
    // rAF ditangguhkan) — tanpa ini klik minum "tidak pernah terjadi".
    let landed = false;
    const commitDraw = () => {
      if (landed) return;
      landed = true;
      send({ type: 'draw' });
    };
    flyDraw({
      fromEl: '.deck-stack',
      toEl: handSlot || '.hand-fan',
      card: game.drawPile[0],
      onLand: commitDraw,
      onDone: () => { flyingCount.current -= 1; setBusy(false); },
    });
    // jaring pengaman: bila callback animasi hilang (tab tidak aktif /
    // komponen remount), busy tidak boleh mengunci pemain selamanya.
    setTimeout(() => { commitDraw(); setBusy(false); }, 1200);
  }

  // ---------------------------------------------------------------
  // GALI LANGSUNG (tanpa modal): pilih kartu di tangan → ketuk kartu buangan.
  // ---------------------------------------------------------------
  function doDig(discardIndex, uids, target) {
    setBusy(true);
    play('dig');
    // kipas meluncur balik rapat; kartu yang tergali disembunyikan persis saat
    // kloningan lahir supaya tidak tampil dua kali (pola heldDiscard).
    closeFan(false);
    setPickedFanIndex(discardIndex);
    // Dipicu callback animasi ATAU timer fallback — sebelumnya hanya dari
    // animasi, jadi halaman yang dibekukan browser membuat gali macet total
    // (intent tak terkirim dan busy tidak pernah lepas).
    let landed = false;
    const landDig = () => {
      if (landed) return;
      landed = true;
      send({ type: 'dig', discardIndex, uids });
      setOrder(prev => prev.filter(uid => !uids.includes(uid)));
      setSelected([]);
      setBusy(false);
      setNotice('Kartu buangan digali, pasangan turun ke meja.');
    };
    flyCard({
      from: rectOf(fanPhase !== 'closed'
        ? `.discard-fan__card[data-index="${discardIndex}"]`
        : `.discard-stack__slot[data-index="${discardIndex}"]`) || rectOf('.discard-stack__slot.is-depth-1'),
      to: rectOf('[data-dropzone="meld"]'),
      card: target,
      rotateStart: -8,
      duration: 420,
      onLand: landDig,
    });
    setTimeout(landDig, 900);
  }

  function runDig(option, discardIndex, target, carried) {
    const uids = option.cards.filter(card => card.uid !== target.uid).map(card => card.uid);
    const remaining = player.hand.length - uids.length + carried.length;
    if (remaining < 1) {
      play('error');
      setNotice('Wajib menyisakan minimal 1 kartu untuk dibuang di akhir giliran.');
      return;
    }
    setDigChoices(null);
    setNotice(
      `${option.cards.length} kartu jadi kombinasi${carried.length ? `, ${carried.length} kartu di atas buangan ikut masuk tangan` : ''}.`,
    );
    doDig(discardIndex, uids, target);
  }

  function handleDig(discardIndex) {
    if (game.phase !== 'draw' || !isMyTurn || busy || dealing) return;
    const target = game.discardPile[discardIndex];
    if (!target) return;
    const depth = game.discardPile.length - discardIndex;
    if (depth > (live.maxDepth || 5)) {
      play('error');
      setNotice(`Kartu urutan ke-${depth} terlalu dalam (batas ${live.maxDepth || 5}).`);
      return;
    }
    const carried = game.discardPile.slice(discardIndex + 1);

    // Belum pilih kartu tangan: beri petunjuk, jangan buka modal.
    if (!selected.length) {
      play('error');
      setNotice(`Pilih kartu di tangan dulu, lalu ketuk kartu buangan urutan ke-${depth}.`);
      return;
    }

    // Pilihan tangan dipakai sebagai isyarat "kartu mana yang ingin dipakai".
    // Semua kombinasi sah (3..8 kartu, termasuk joker) dihitung otomatis; saat
    // ada kartu terbawa, gali boleh menghabiskan tangan (reserve 0).
    const options = findDigMelds(target, player.hand, 8, carried.length ? 0 : 1);
    const fitsSelection = options.filter(option =>
      selected.every(uid => option.cards.some(card => card.uid === uid)),
    );
    const pool = fitsSelection.length ? fitsSelection : options;
    if (!pool.length) {
      play('error');
      setNotice(selected.length
        ? 'Kartu tangan yang dipilih belum bisa digabung dengan kartu buangan itu.'
        : 'Kartu buangan itu belum membentuk kombinasi dengan kartu tanganmu.');
      return;
    }
    if (pool.length > 1) {
      setDigChoices({ discardIndex, options: pool, target });
      return;
    }
    runDig(pool[0], discardIndex, target, carried);
  }

  function handleMeld(cardsToMeld = chosenCards) {
    if (game.phase === 'draw') {
      setNotice('Ambil kartu dari minum atau gali buangan terlebih dahulu.');
      return;
    }
    if (busy || !isMyTurn || !cardsToMeld.length) return;

    // 1) ukur SEMUA posisi sebelum state berubah
    const fromEls = cardsToMeld
      .map(card => document.querySelector(`.hand-card-wrapper[data-uid="${CSS.escape(String(card.uid))}"]`))
      .filter(Boolean);
    const meldRect = rectOf('[data-dropzone="meld"]');

    cardsToMeld.forEach(card => thrownUids.current.add(card.uid));
    setHeldHandUids(cardsToMeld.map(card => card.uid));   // sembunyikan aslinya selama terbang
    setBusy(true);

    let landed = false;
    const commit = () => {
      if (landed) return;
      landed = true;
      const ok = send({ type: 'meld', uids: cardsToMeld.map(card => card.uid) });
      if (ok) {
        play('meld');
        if (!muted) vibrate([15, 40, 20]);
        setOrder(prev => prev.filter(uid => !cardsToMeld.some(card => card.uid === uid)));
        setSelected([]);
        setNotice('Kombinasi sah turun ke meja!');
        setMeldCelebratePlayer(viewIndex);
        setMeldCelebrate(Date.now());
      } else {
        cardsToMeld.forEach(card => thrownUids.current.delete(card.uid));
      }
      setHeldHandUids([]);
      setBusy(false);
    };

    // 2) kartu terbang bergiliran dari tangan → zona kombinasi meja
    flyMeld({
      fromEls,
      toEl: meldRect ? '[data-dropzone="meld"]' : null,
      cards: cardsToMeld,
      gap: 70,
      onEachLand: () => play('deal'),
      onAllLand: commit,
    });
    // jaring pengaman bila callback animasi hilang (tab tidak aktif)
    setTimeout(commit, 2600);
  }

  function requestDiscard(cardToDiscard) {
    if (game.phase === 'draw' || !isMyTurn || busy || !cardToDiscard) return;
    // ATURAN AS: As haram dibuang sebelum pemain punya minimal satu kombinasi.
    if (String(cardToDiscard.value) === 'A' && !(player.melds || []).length) {
      setNotice('Kartu As hanya boleh dibuang setelah kamu punya minimal satu kombinasi di meja.');
      play('error');
      setSelected([]);
      return;
    }
    // Hanya As yang perlu konfirmasi (syarat: sudah punya kombinasi).
    if (String(cardToDiscard.value) === 'A') {
      setPendingDiscard(cardToDiscard);
      return;
    }
    // Joker langsung dibuang, lalu muncul pengingat + suara stinger. Bila ini
    // kartu terakhir (menutup ronde), pesannya justru kabar gembira: Joker
    // penutup bebas penalti dan bonus penutup +150 tetap utuh.
    if (cardToDiscard.kind === 'joker' || cardToDiscard.value === 'JOKER') {
      const closing = player.hand.length === 1;
      setJokerShock({ card: cardToDiscard, closing });
      if (!closing) {
        play('joker');
        if (!muted) vibrate([70, 50, 70]);
      }
    }
    executeDiscard(cardToDiscard);
  }

  function executeDiscard(cardToDiscard) {
    // 1) Ukur dulu SEMUA rect sebelum state berubah (kartu tangan & tumpukan)
    const handEl = document.querySelector(`.hand-card-wrapper[data-uid="${CSS.escape(String(cardToDiscard.uid))}"]`);

    thrownUids.current.add(cardToDiscard.uid);
    setHeldDiscard({ uid: cardToDiscard.uid });
    setHeldHandUids([cardToDiscard.uid]);   // kartu di tangan disembunyikan saat kloningan lahir

    let landed = false;
    const commit = () => {
      if (landed) return;
      landed = true;
      const ok = send({ type: 'discard', uid: cardToDiscard.uid });
      if (ok) {
        play('discard');
        if (!muted) vibrate(10);
        setOrder(prev => prev.filter(uid => uid !== cardToDiscard.uid));
        setSelected([]);
        setPendingDiscard(null);
        setNotice('');
      } else {
        thrownUids.current.delete(cardToDiscard.uid);
      }
      // kartu asli tampil di tumpukan & di tangan tepat saat mendarat
      setHeldDiscard(null);
      setHeldHandUids([]);
    };

    // 2) Kartu diangkat & membesar (masih tertutup) → FLIP ke muka saat
    //    masih besar → mengecil masuk tumpukan. Zero flicker: kartu asli
    //    disembunyikan selama terbang, tampil tepat saat mendarat.
    flyDiscard({
      fromEl: handEl,
      pileEl: '.discard-stack, [data-dropzone="discard"]',
      card: cardToDiscard,
      onLand: commit,
      onDone: () => {
        if (!landed) commit();
      },
    });
  }

  const toggleCard = useCallback((card) => {
    setSelected(prev => (prev.includes(card.uid) ? prev.filter(uid => uid !== card.uid) : [...prev, card.uid]));
  }, []);

  const shufflerBanner = live.status === 'playing' && !dealing
    && game.phase === 'draw'
    && game.players[game.turn]?.id === live.shufflerId
    && discardPile.length === 0;

  // Volume popover: tempel ke grup kanan header dan selalu berada di dalam layar.
  const rightRef = useRef(null);
  const volumeRef = useRef(null);
  useLayoutEffect(() => {
    const group = rightRef.current;
    const pop = volumeRef.current;
    if (!group || !pop) return;
    pop.style.position = 'fixed';
    const rect = group.getBoundingClientRect();
    const width = pop.offsetWidth;
    pop.style.top = `${Math.round(rect.bottom + 8)}px`;
    pop.style.left = `${Math.round(Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)))}px`;
  }, [volumeOpen]);

  // Strip lawan yang digeser: pastikan pod giliran aktif terlihat.
  const stripRef = useRef(null);
  const activeOpponentKey = opponents.find(item => game.turn === item.index)?.seat?.id || '';
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || !strip.classList.contains('is-scrollable')) return;
    const el = strip.querySelector('.player-pod.is-active');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeOpponentKey]);

  const seatPositions = useMemo(() => {
    const positions = [];
    const totalOpponents = game.players.length - 1;
    let opponentOrder = 0;
    for (let index = 0; index < game.players.length; index++) {
      if (index === viewerIndex) positions.push({ x: 50, y: 92 });
      else {
        // Kursi lawan mengikuti busur atas (sama dengan layout pod)
        const fraction = totalOpponents <= 1 ? 0.5 : opponentOrder / (totalOpponents - 1);
        const spread = Math.min(40, 18 + totalOpponents * 9);
        positions.push({ x: 50 + (fraction - 0.5) * 2 * spread, y: 16 });
        opponentOrder++;
      }
    }
    return positions;
  }, [game.players.length, viewerIndex]);

  // Petunjuk: kartu As yang dipilih tapi belum punya kombinasi = tidak boleh dibuang
  const aceBlocked = selected.length === 1 && String(chosenCards[0]?.value) === 'A' && !(player.melds || []).length;
  const digHint = selected.length > 0 && game.phase === 'draw' && isMyTurn && !dealing && discardPile.length > 0
    ? ` · atau ketuk kartu buangan untuk digali`
    : '';
  const hint = meldValidation.valid
    ? { text: `Kombinasi sah — siap Turun${digHint}`, tone: 'emerald' }
    : aceBlocked
      ? { text: 'As belum boleh dibuang — turunkan 1 kombinasi dulu', tone: 'danger' }
      : selected.length === 1
      ? { text: `Siap Buang 1 kartu${digHint}`, tone: 'gold' }
      : selected.length > 1
        ? { text: `${meldValidation.reason || `${selected.length} kartu dipilih`}${digHint}`, tone: 'gold' }
        : { text: 'Pilih kartu lalu aksi', tone: 'muted' };

  const activeName = game.players[game.turn]?.name || '-';
  const nextName = game.players[(game.turn + 1) % game.players.length]?.name || '';

  // Jarak antar kartu kipas: pas muat di lebar wadah — makin banyak kartu,
  // makin rapat bertumpuk (matematika yang sama dengan kipas tangan).
  const fanOverlap = fanCards.length > 1
    ? Math.max(0, fanMeasure.w - Math.max(0, fanMeasure.maxW - fanMeasure.w) / (fanCards.length - 1))
    : 0;
  // Pengumuman untuk screen reader: HANYA berubah saat giliran/fase berganti,
  // bukan tiap detik seperti angka timer (aria-live tidak boleh membaca tick).
  const announce = useMemo(() => {
    if (live.status !== 'playing' || dealing) return '';
    return isMyTurn
      ? `Giliranmu: ${TURN_LABEL[game.phase] || 'buang atau turunkan kombinasi'}`
      : `Giliran ${activeName}`;
  }, [live.status, dealing, isMyTurn, game.phase, activeName]);

  // Musik dangdut latar: hanya selama ronde berjalan, ikut mute global, dan
  // bisa dimatikan sendiri lewat tombol note di HUD.
  useEffect(() => {
    if (live.status === 'playing' && musicOn && !muted) startMusic();
    else stopMusic();
    return () => stopMusic();
  }, [live.status, musicOn, muted]);

  // Umpan balik turn suara + getar saat giliran berpindah
  useEffect(() => {
    if (live.status === 'playing' && lastTurnRef.current !== game.turn && !dealing) {
      lastTurnRef.current = game.turn;
      if (isMyTurn) {
        play('turn');
        if (!muted) vibrate([12, 50, 12]);
      }
    }
  }, [game.turn, live.status, isMyTurn, dealing, muted]);

  return (
    <MotionConfig reducedMotion="user">
    <main className="arena-canvas arena-root flex flex-col text-white selection:bg-emeraldPrimary selection:text-canvas relative">
      {/* ==================== 1. TOP GLASS HUD ==================== */}
      <header className="arena-hud relative z-40 w-full shrink-0 px-2 sm:px-5 pt-2 pb-1.5 bg-gradient-to-b from-[#14182E]/85 to-transparent">
        {/* Left group */}
        <div className="hud-left flex items-center gap-1.5 sm:gap-2.5 min-w-0">
          <div className="hud-pill">
            <span className="w-2 h-2 rounded-full bg-emeraldPrimary shadow-[0_0_8px_#2ECC71]" aria-hidden="true" />
            <span className="text-xs sm:text-sm font-bold tabular-nums text-white truncate">#{live.code}</span>
          </div>
          <div className="hud-pill hidden xs:flex sm:flex text-[#C5CCF0] text-[11px] sm:text-xs">
            Ronde {live.round}
          </div>
          <div className="hud-pill hidden sm:flex audit-badge-wrap">
            <ConnectionBadgeGlobal />
          </div>
        </div>

        {/* Center: active turn. Timer sengaja TANPA aria-live: angka berubah
            tiap detik akan membanjiri screen reader. Pengumuman giliran lewat
            region sr-only yang teksnya hanya berubah saat giliran berganti. */}
        <div className="hud-center">
          <div className="turn-pill">
            <span className={`w-2 h-2 rounded-full shrink-0 ${timedOut ? 'bg-crimsonDanger' : isMyTurn ? 'bg-emeraldPrimary animate-pulse' : 'bg-goldAccent'}`} aria-hidden="true" />
            <strong className="text-[11px] sm:text-sm font-bold text-white truncate max-w-[64px] sm:max-w-[130px]">
              {activeName}
            </strong>
            <span className="hidden sm:inline text-[11px] sm:text-xs font-semibold text-periwinkleMuted whitespace-nowrap">
              {TURN_LABEL[game.phase] || 'Buang / Turun'}
            </span>
            {nextName && !isMyTurn && (
              <span className="hidden lg:inline text-[10px] font-semibold text-periwinkleMuted/90 whitespace-nowrap" title="Giliran berikutnya">
                · Berikutnya: {nextName}
              </span>
            )}
            {secondsLeft !== null && (
              <span className={`timer-chip ${secondsLeft <= 10 ? 'is-critical' : ''}`}>
                <Icon.Stopwatch size={12} />
                {timedOut ? 'HABIS' : `${secondsLeft}s`}
              </span>
            )}
          </div>
          {/* Papan skor mobile: sejajar pill giliran/waktu. Blok identitas di
              dock bawah tersembunyi di layar kecil, jadi total kumulatif ikut
              di sini beserta poin live ronde ini dan hasil ronde lalu. */}
          {!isSpectator && (
            <div
              className="turn-score-chip sm:hidden"
              title="Skor kumulatif • poin ronde ini (live, aturan hitung akhir) • hasil ronde lalu"
            >
              <span className="text-goldAccent">{mySeat?.score ?? 0}</span>
              <span className={liveScoreById[viewerId]?.total >= 0 ? 'text-emeraldPrimary' : 'text-crimsonDanger'}>
                Ini {signed(liveScoreById[viewerId]?.total ?? 0)}
              </span>
              {prevScoreById[viewerId] && (
                <span className="text-periwinkleMuted">Lalu {signed(prevScoreById[viewerId].total)}</span>
              )}
            </div>
          )}
          <div className="sr-only" role="status" aria-live="polite">{announce}</div>
        </div>

        {/* Right controls */}
        <div className="hud-right flex items-center gap-1.5 sm:gap-2 shrink-0" ref={rightRef}>
          <button
            type="button"
            className={`icon-btn-sq ${musicOn && !muted ? 'is-on' : ''}`}
            onClick={() => setMusicOn(toggleMusic())}
            title={musicOn ? 'Matikan musik dangdut' : 'Nyalakan musik dangdut'}
            aria-label={musicOn ? 'Matikan musik dangdut' : 'Nyalakan musik dangdut'}
            aria-pressed={musicOn}
          >
            <Icon.Note size={15} />
          </button>
          <button
            type="button"
            className="icon-btn-sq"
            onClick={() => { setMuted(toggleMute()); setVolumeOpen(false); }}
            onDoubleClick={() => setVolumeOpen(open => !open)}
            title={muted ? 'Nyalakan suara (klik ganda: atur volume)' : 'Bisukan suara (klik ganda: atur volume)'}
            aria-label={muted ? 'Nyalakan suara' : 'Bisukan suara'}
            aria-pressed={muted}
          >
            <Icon.Speaker muted={muted} />
          </button>
          <button
            type="button"
            className={`icon-btn-sq ${volumeOpen ? 'is-on' : ''}`}
            onClick={() => setVolumeOpen(open => !open)}
            title="Atur volume suara"
            aria-label="Atur volume suara"
            aria-expanded={volumeOpen}
          >
            <span className="text-[10px] font-extrabold tabular-nums">{Math.round(volume * 100)}%</span>
          </button>
          {volumeOpen && (
            <div className="volume-pop" role="dialog" aria-label="Volume suara" ref={volumeRef}>
              <label htmlFor="volume-range" className="text-[10px] font-bold uppercase tracking-wide text-periwinkleMuted">Volume</label>
              <input
                id="volume-range"
                type="range"
                min="0"
                max="300"
                step="10"
                value={Math.round(volume * 100)}
                onChange={event => setVolumeState(setVolume(Number(event.target.value) / 100))}
                onPointerUp={() => play('turn')}
                className="volume-range"
              />
              <div className="flex items-center justify-between text-[10px] text-periwinkleMuted tabular-nums">
                <span>Pelan</span>
                <b className="text-white">{Math.round(volume * 100)}%</b>
                <span>Keras</span>
              </div>
            </div>
          )}
          <button
            type="button"
            className="icon-btn-sq btn-fullscreen"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Keluar layar penuh' : 'Masuk layar penuh'}
            aria-label={isFullscreen ? 'Keluar layar penuh' : 'Masuk layar penuh'}
          >
            <Icon.Fullscreen exit={isFullscreen} />
          </button>
          <button
            type="button"
            className="icon-btn-sq"
            onClick={() => setHelpOpen(true)}
            title="Bantuan aturan singkat"
            aria-label="Bantuan aturan singkat"
            aria-haspopup="dialog"
          >
            <span className="text-base font-extrabold leading-none">?</span>
          </button>
          <button type="button" className="btn-keluar" onClick={() => setExitOpen(true)} aria-label="Keluar meja">
            <Icon.Exit size={14} className="sm:hidden shrink-0" />
            <span className="hidden sm:inline">Keluar</span>
          </button>
        </div>
      </header>

      {/* Floating status strips */}
      <div className="relative z-30 w-full shrink-0 flex flex-col items-center gap-1">
        {shufflerBanner && (
          <div className="status-strip status-strip--gold" role="status">
            <Icon.Crown size={13} />
            <span>Giliran Pengocok ({game.players[game.turn]?.name}): wajib minum 1 kartu lalu buang 1 kartu</span>
          </div>
        )}
        {timedOut && isMyTurn && (
          <div className="status-strip status-strip--danger animate-pulse" role="status">
            <Icon.Stopwatch size={13} />
            <span>Waktu habis — bot mengambil alih giliranmu…</span>
          </div>
        )}
        {(mySeat?.afk || mySeatOffline) && (
          <div className="afk-bar" role="status">
            <span className="text-periwinkleMuted">Kamu sedang terputus / AFK.</span>
            <button type="button" className="btn-reconnect" onClick={() => send({ type: 'reclaim' })}>
              <Icon.Plug size={13} />
              <span className="hidden sm:inline">Ambil Alih Kembali Kursi</span>
              <span className="sm:hidden">Ambil Alih</span>
            </button>
          </div>
        )}
      </div>

      {/* ==================== 2. OPPONENT PODS ==================== */}
      <section className="relative z-20 w-full shrink-0 flex flex-col items-center pt-1.5 pb-2">
        {/* Strip profil lawan: lebar kartu mengecil otomatis sesuai jumlah
            pemain supaya 5-7 lawan tetap terlihat tanpa terpotong ke samping. */}
        <div
          className={`opponent-strip items-start px-2 max-w-full ${opponents.length > 4 ? 'is-scrollable' : 'justify-center'}`}
          style={{ '--pod-count': opponents.length }}
          ref={stripRef}
        >
          {opponents.map(({ seat, meta, index }) => {
            const offline = !seat.bot && (meta?.afk || presence?.[seat.id]?.online === false);
            const active = game.turn === index && live.status === 'playing';
            return (
              <OpponentPod
                key={seat.id}
                seat={seat}
                seatIndex={index}
                meta={meta}
                offline={offline}
                active={active}
                turnFraction={active ? turnFraction : 1}
                onInspect={() => setInspectedPlayer(inspectedPlayer === index ? null : index)}
                compact={opponents.length > 3}
                meldCount={(game.players[index]?.melds || []).reduce((sum, group) => sum + group.length, 0)}
                celebrating={meldCelebrate > 0 && meldCelebratePlayer === index}
                prevTotal={prevScoreById[seat.id]?.total}
              />
            );
          })}
        </div>
      </section>

      {/* ==================== 3. CENTER PLAYFIELD ==================== */}
      <section className="arena-field relative flex-1 min-h-0 w-full flex items-center justify-center px-2 sm:px-4 z-10">
        {/* Ceremony Dealing Animation Overlay */}
        {Boolean(dealing) && (
          <CeremonyOverlay
            dealStartedAt={game.dealStartedAt}
            dealingUntil={game.dealingUntil}
            seatCount={game.players.length}
            seatPositions={seatPositions}
            shufflerName={seats.find(seat => seat.id === live.shufflerId)?.name || 'Pengocok'}
            round={live.round}
            now={now}
          />
        )}

        {/* Kartu buangan: di atas versi HP, di kanan versi lebar */}
        <div className="arena-grid w-full">
          {/* ---------- LEFT: TUMPUKAN MINUM ---------- */}
          <div className="playfield-side flex flex-col items-center gap-2 min-w-0" data-dropzone="draw">
            <span className="zone-title">Tumpukan Minum</span>
            <button
              type="button"
              className={`deck-stack ${canDrawNow ? 'is-live' : ''}`}
              onClick={handleDraw}
              disabled={!canDrawNow}
              aria-label={`Ambil kartu minum, ${drawPile.length} kartu tersisa`}
            >
              <span className="deck-stack__layer" aria-hidden="true" />
              <span className="deck-stack__layer" aria-hidden="true" />
              <span className="deck-stack__layer" aria-hidden="true">
                <CardAsset back variant="fill" />
              </span>
            </button>
            <div className="count-pill mt-1">
              <Icon.Refresh size={12} />
              <span className="tabular-nums">{drawPile.length} Minum</span>
            </div>
            <span className={`sub-pill ${canDrawNow ? 'is-live' : ''}`}>
              {canDrawNow ? 'Ketuk untuk ambil' : game.phase === 'draw' ? 'Menunggu giliran' : 'Sudah ambil'}
            </span>
          </div>

          {/* ---------- CENTER: TEMPAT BUANGAN (kartu langsung di atas felt) ---------- */}
          <div className="playfield-center" data-dropzone="discard">
            <div className="playfield-center__inner">
            <div className="discard-head">
              <span className="zone-title">Tempat Buangan ({visibleDiscard.length})</span>
              <button type="button" className="btn-riwayat" onClick={() => setHistoryOpen(true)} title="Lihat seluruh riwayat kartu buangan">
                <Icon.History size={12} />
                <span>Riwayat</span>
                {buriedCount > 0 && <span className="tabular-nums opacity-80">+{buriedCount}</span>}
              </button>
            </div>

            {shownDiscards.length === 0 ? (
              <div className="discard-stack" style={{ '--stack-count': 1 }}>
                <div className="discard-stack__ghost">
                  <Icon.CardsPlaceholder />
                  <span className="text-[11px] font-bold">Buangan Kosong</span>
                </div>
              </div>
            ) : (
              <div className="discard-stack-anchor">
                <button
                  type="button"
                  className={`discard-stack ${selected.length && canDrawNow ? 'is-ready' : ''} ${fanPhase === 'closing' ? 'is-fan-closing' : fanPhase !== 'closed' ? 'is-fan-open' : ''}`}
                  style={{ '--stack-count': shownDiscards.length }}
                  onClick={() => (fanPhase !== 'closed' ? closeFan() : openFan())}
                  disabled={!canDrawNow}
                  aria-expanded={fanPhase !== 'closed'}
                  aria-label={`Bentangkan kartu buangan (${discardPile.length} kartu) untuk memilih`}
                  title={canDrawNow ? 'Ketuk untuk membentang, lalu pilih kartu yang mau digali' : undefined}
                >
                  {shownDiscards.map((card, offset) => {
                    const absoluteIndex = buriedCount + offset;
                    const depth = visibleDiscard.length - absoluteIndex;
                    const isLocked = depth > (live.maxDepth || 5);
                    const isTop = offset === shownDiscards.length - 1;
                    const layersBelow = shownDiscards.length - 1 - offset;
                    const shift = (offset - (shownDiscards.length - 1) / 2);
                    return (
                      <span
                        key={card.uid}
                        className={`discard-stack__slot ${isLocked ? 'is-locked' : ''} ${depth === 1 ? 'is-depth-1' : ''}`}
                        data-index={absoluteIndex}
                        aria-hidden="true"
                        style={{
                          transform: `translate(calc(var(--discard-shift, 24px) * ${shownDiscards.length > 1 ? shift : 0}), calc(var(--discard-lift, 6px) * ${-layersBelow})) rotate(${shift === 0 ? 0 : shift * 1.4}deg)`,
                          zIndex: 10 + offset,
                        }}
                      >
                        <CardAsset card={card} variant="table" dimmed={isLocked} />
                        {isTop && <span className="discard-stack__badge is-fresh">#{depth}</span>}
                        {isLocked && (
                          <span className="discard-stack__lock" aria-hidden="true">
                            <Icon.Lock size={11} />
                          </span>
                        )}
                      </span>
                    );
                  })}
                </button>

                {/* Kipas terbuka: kartu lahir di atas tumpukan lalu membentang */}
                {fanPhase !== 'closed' && fanCards.length > 0 && (
                  <div
                    ref={fanRef}
                    className={`discard-fan ${fanPhase === 'open' ? 'is-open' : fanPhase === 'closing' ? 'is-closing' : 'is-entering'}`}
                    role="group"
                    aria-label="Kipas kartu buangan — ketuk kartu untuk digali"
                    style={{ '--fan-overlap': `${Math.round(fanOverlap)}px` }}
                  >
                    {fanCards.map(({ card, absoluteIndex, depth, locked }, i) => {
                      const n = fanCards.length;
                      const mid = (n - 1) / 2;
                      const t = n > 1 ? i / (n - 1) : 0.5;
                      const arcAmp = fanMeasure.maxW > 0 && fanMeasure.maxW < 420 ? 14 : 24;
                      const arcY = Math.sin(Math.PI * t) * arcAmp;
                      const tilt = (i - mid) * 4.2;
                      const canDigThis = !locked && canDrawNow;
                      // Titik lahir tiap kartu = di atas tumpukan, dengan acak
                      // kecil supaya terasa seperti tumpukan nyata
                      const fanIn = fanPhase === 'open';
                      const stackH = fanMeasure.w > 0 ? fanMeasure.w * 1.4 : 120;
                      const pileX = ((i % 3) - 1) * 3;
                      const pileY = i * 1.6;
                      const pileRot = ((i % 5) - 2) * 1.1;
                      return (
                        <button
                          key={card.uid}
                          type="button"
                          className={`discard-fan__card ${locked ? 'is-locked' : ''}`}
                          data-index={absoluteIndex}
                          disabled={!canDigThis}
                          onClick={() => handleDig(absoluteIndex)}
                          style={{
                            marginLeft: i === 0 ? undefined : 'calc(var(--fan-overlap, 0px) * -1)',
                            transform: fanIn
                              ? `translateY(${arcY.toFixed(1)}px) rotate(${tilt.toFixed(1)}deg)`
                              : `translate(${pileX}px, ${(-stackH + pileY).toFixed(1)}px) rotate(${pileRot.toFixed(1)}deg) scale(0.95)`,
                            zIndex: 10 + i,
                            transitionDelay: `${fanIn ? i * 38 : 0}ms`,
                            visibility: pickedFanIndex === absoluteIndex ? 'hidden' : undefined,
                          }}
                          aria-label={
                            locked
                              ? `Kartu buangan #${depth}, terkunci (batas ${live.maxDepth || 5})`
                              : `Gali kartu buangan #${depth}`
                          }
                          title={
                            locked
                              ? `Terkunci: kedalaman ke-${depth} (batas ${live.maxDepth || 5})`
                              : `Gali buangan ke-${depth}`
                          }
                        >
                          <CardAsset card={card} variant="table" dimmed={locked} />
                          <span className={`discard-stack__badge ${depth === 1 ? 'is-fresh' : ''}`}>#{depth}</span>
                          {locked && (
                            <span className="discard-stack__lock" aria-hidden="true">
                              <Icon.Lock size={11} />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <span className={`sub-pill discard-hint ${shownDiscards.length > 0 && canDrawNow ? 'is-live' : ''}`}>
              {shownDiscards.length === 0
                ? 'Belum ada kartu'
                : canDrawNow
                  ? 'Ketuk tumpukan untuk membentang'
                  : game.phase === 'draw' ? 'Menunggu giliran' : 'Sekarang: buang / turun'}
            </span>

            {buriedCount > 0 && (
              <span className="discard-more tabular-nums">
                {buriedCount} kartu lama — ketuk “Riwayat” bila perlu
              </span>
            )}
            </div>
          </div>

          <div className="playfield-side flex flex-col items-center gap-2 min-w-0 w-full" data-dropzone="meld">
            <span className="zone-title zone-title--emerald">Kombinasi Meja Kartu</span>
            {player.melds.length === 0 ? (
              <div className="meld-zone meld-zone--empty">
                <Icon.Star size={16} />
                <span>Belum ada kombinasi</span>
                <small>Kamu: turunkan min. 3 kartu sah</small>
              </div>
            ) : (
              <div className={`meld-zone ${meldCelebrate > 0 ? 'meld-zone--flash' : ''}`} key={`meld-${meldCelebrate}`}>
                <div className="flex flex-col gap-2 max-h-[196px] overflow-y-auto no-scrollbar w-full items-center py-1">
                  {player.melds.map((meldGroup, groupIdx) => (
                    <div key={groupIdx} className="flex items-end justify-center">
                      {meldGroup.map((card, ci) => (
                        <div
                          key={card.uid}
                          className="w-[42px] shrink-0 rounded-[6px] mr-[-10px] last:mr-0 shadow-card"
                          style={{ transform: `translateY(${Math.abs(ci - (meldGroup.length - 1) / 2) * 2}px) rotate(${(ci - (meldGroup.length - 1) / 2) * 3}deg)`, zIndex: ci }}
                        >
                          <CardAsset card={card} variant="mini" />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="count-pill count-pill--gold" title={`Total nilai ${totalMelds} kartu kombinasi di meja — Joker di kombinasi bernilai +5`}>
              <span className="tabular-nums">+{meldPoints} Poin</span>
            </div>
          </div>
        </div>

        {!isSpectator && (
            <div className="hand-stage">
              {dealing ? (
                <div className="text-xs text-periwinkleMuted font-medium my-auto animate-pulse">
                  Membagikan kartu…
                </div>
              ) : (
                <div className={`hand-fan flex items-end justify-center ${handSpread ? 'is-spread' : ''}`} role="group" aria-label="Kartu di tanganmu" style={handSpread ? { '--spread-gap': '8px' } : undefined}>
                  <HandCards
                    hand={hand}
                    selected={selected}
                    overlap={dynamicOverlap}
                    spread={handSpread}
                    heldUids={heldHandUids}
                    onToggle={toggleCard}
                  />
                </div>
              )}
            </div>
        )}
      </section>

      {/* ==================== 4. HAND + GLASS DOCK ==================== */}
      {isSpectator ? (
        <section className="glass-hud w-full shrink-0 py-4 px-6 text-center text-xs font-semibold text-periwinkleMuted z-30">
          <span className="inline-flex items-center gap-2">
            <Icon.Eye size={14} />
            Mode Penonton — ronde sedang berlangsung. Kamu bisa duduk di ruang tunggu saat ronde berikutnya berakhir.
          </span>
        </section>
      ) : (
        <section aria-label="Kartu Tangan & Kontrol Pemain" className="hand-dock-stage relative w-full shrink-0 z-30">
          {/* Floating Dev Tools pill (local mode only) */}
          {service?.mode === 'local' && (
            <button
              type="button"
              className="dev-tools-pill"
              onClick={() => setDevOpen(!devOpen)}
              aria-expanded={devOpen}
              aria-controls="dev-tools-panel"
            >
              <Icon.Gear size={13} />
              <span>Dev</span>
              <span className="text-[9px] opacity-70" aria-hidden="true">{devOpen ? '▲' : '▼'}</span>
            </button>
          )}

          {/* Bottom Glassmorphic Dock */}
          <div className="glass-hud relative z-40 w-full px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3">
            <div className="w-full max-w-6xl mx-auto flex items-center gap-3 lg:gap-5">
              {/* Left: identity — avatar membuka papan peringkat meja */}
              <div className="flex items-center gap-2.5 shrink-0 min-w-0">
                <button
                  type="button"
                  onClick={() => setInfoPanel('menu')}
                  aria-label="Buka peringkat meja"
                  aria-haspopup="dialog"
                  className={`avatar-squircle-ring ${isMyTurn ? 'ring-green' : 'ring-idle'} w-11 h-11 sm:w-[52px] sm:h-[52px] shrink-0 transition hover:brightness-110 active:scale-95`}
                >
                  <div className="w-full h-full rounded-[16px] overflow-hidden">
                    <AvatarArt avatar={mySeat?.avatar || DEFAULT_AVATAR} size={52} />
                  </div>
                </button>
                <div className="min-w-0 leading-tight hidden sm:block">
                  <span className="block text-sm font-extrabold text-white truncate max-w-[130px]">
                    {mySeat?.name || player.name || 'Kamu'}
                  </span>
                  <span className="text-[12px] text-periwinkleMuted tabular-nums">
                    {player.hand.length} kartu • <span className="text-goldAccent font-extrabold">{mySeat?.score ?? 0} poin</span>
                  </span>
                  <span className="text-[10px] text-periwinkleMuted/80 tabular-nums" title="Estimasi poin ronde berjalan (aturan hitung akhir) dan hasil ronde terakhir">
                    Ronde ini <span className={liveScoreById[player.id]?.total >= 0 ? 'text-emeraldPrimary font-bold' : 'text-crimsonDanger font-bold'}>{signed(liveScoreById[player.id]?.total ?? 0)}</span>
                    {prevScoreById[player.id] && (
                      <> • Ronde lalu <span className="text-white/80 font-semibold">{signed(prevScoreById[player.id].total)}</span></>
                    )}
                  </span>
                </div>
              </div>

              {/* Center: primary actions */}
              <div className="flex items-center gap-2 flex-1 min-w-0 justify-center">
                <button
                  type="button"
                  className={`action-btn ${meldValidation.valid && canPlayNow ? 'is-turun-active' : ''}`}
                  onClick={() => handleMeld()}
                  disabled={!meldValidation.valid || !canPlayNow}
                  aria-label="Turunkan kombinasi kartu terpilih ke meja"
                >
                  <Icon.Star size={15} />
                  <span>Turun</span>
                </button>
                <button
                  type="button"
                  className={`action-btn ${selected.length === 1 && canPlayNow ? 'is-buang-active' : ''}`}
                  onClick={() => requestDiscard(chosenCards[0])}
                  disabled={selected.length !== 1 || !canPlayNow}
                  aria-label="Buang kartu terpilih ke tempat buangan"
                >
                  <Icon.Trash size={15} />
                  <span>Buang</span>
                </button>
              </div>

              {/* Right: sort utilities */}
              <div className="flex items-center gap-2.5 shrink-0">
                <div className="sort-group">
                  <button
                    type="button"
                    className={`sort-btn ${sortMode === 'value' ? 'is-active' : ''}`}
                    onClick={() => setSortMode('value')}
                    aria-label="Urutkan kartu berdasarkan angka"
                    aria-pressed={sortMode === 'value'}
                  >
                    Angka
                  </button>
                  <button
                    type="button"
                    className={`sort-btn ${sortMode === 'suit' ? 'is-active' : ''}`}
                    onClick={() => setSortMode('suit')}
                    aria-label="Urutkan kartu berdasarkan simbol"
                    aria-pressed={sortMode === 'suit'}
                  >
                    <SuitIcon suit="♠" color="currentColor" size={11} />
                    <SuitIcon suit="♥" color="#E53935" size={11} />
                    <span className="spread-label">Simbol</span>
                  </button>
                  <button
                    type="button"
                    className={`sort-btn sort-btn--spread ${handSpread ? 'is-active' : ''}`}
                    onClick={() => { play('turn'); setHandSpread(v => !v); }}
                    aria-label={handSpread ? 'Rapatkan kartu tangan' : 'Bentangkan kartu tangan agar mudah dipilih'}
                    aria-pressed={handSpread}
                    title={handSpread ? 'Rapatkan kartu (kembali ke busur)' : 'Bentangkan kartu agar mudah diklik'}
                  >
                    <Icon.CardsPlaceholder size={13} />
                    <span className="spread-label">{handSpread ? 'Rapat' : 'Bentang'}</span>
                  </button>
                </div>
                <span className={`helper-hint hidden md:block hint--${hint.tone}`}>{hint.text}</span>
                <span className={`helper-hint md:hidden text-[11px] hint--${hint.tone}`}>{hint.text}</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Floating Action Notice Toast */}
      {notice && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 bg-[#1B1F38]/98 border border-emeraldPrimary/50 text-white pl-3.5 pr-1.5 py-1.5 rounded-2xl shadow-2xl flex items-center gap-2 max-w-md w-[92%]" role="status">
          <span className="text-emeraldPrimary shrink-0" aria-hidden="true"><Icon.Info size={16} /></span>
          <span className="text-xs sm:text-sm font-medium leading-snug flex-1">{notice}</span>
          <button
            type="button"
            className="w-11 h-11 shrink-0 rounded-xl text-periwinkleMuted hover:text-white hover:bg-white/10 transition flex items-center justify-center"
            onClick={() => setNotice('')}
            aria-label="Tutup notifikasi"
          >
            <Icon.Close size={14} />
          </button>
        </div>
      )}

      {/* ==================== MODALS ==================== */}
      {/* Konfirmasi keluar meja — mencegah salah tekan di tengah ronde */}
      <ConfirmDialog
        open={exitOpen}
        title="Keluar dari meja?"
        message="Kursimu tetap tersimpan. Saat ronde selesai atau kamu gabung lagi dengan kode/link yang sama, kamu kembali ke kursi, kartu, dan skor yang sama. Kalau giliranmu habis waktu, bot mengambil alih sementara."
        confirmLabel="Ya, Keluar Sementara"
        cancelLabel="Tetap di Meja"
        onConfirm={() => { setExitOpen(false); onExit?.(); }}
        onCancel={() => setExitOpen(false)}
      />

      {/* ConfirmDialog for Precious Discard (Joker/Ace) */}
      <ConfirmDialog
        open={Boolean(pendingDiscard)}
        title="Buang As?"
        message="As boleh dibuang karena kamu sudah punya kombinasi. As yang dibuang netral (tidak minus); kalau tersisa di tangan, As dihitung −15 poin."
        confirmLabel="Ya, Buang Saja"
        cancelLabel="Batal"
        onConfirm={() => pendingDiscard && executeDiscard(pendingDiscard)}
        onCancel={() => setPendingDiscard(null)}
      >
        {pendingDiscard && (
          <div className="w-20 mx-auto my-3 shadow-card rounded-lg overflow-hidden">
            <CardAsset card={pendingDiscard} variant="table" />
          </div>
        )}
      </ConfirmDialog>

      {/* Pilihan kombinasi gali (muncul hanya bila ada >1 opsi sah) */}
      {digChoices && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          role="dialog" aria-modal="true" aria-label="Pilih kombinasi gali"
          onClick={() => setDigChoices(null)}
        >
          <div ref={digPanelRef} onClick={event => event.stopPropagation()} className="bg-[#1B1F38] border border-white/10 rounded-3xl p-5 max-w-md w-full shadow-2xl flex flex-col gap-3 text-white">
            <header className="flex items-center justify-between pb-2 border-b border-white/10">
              <h3 className="text-sm font-bold">Pilih Kombinasi Gali</h3>
              <button type="button" className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center" onClick={() => setDigChoices(null)} aria-label="Batal gali">
                <Icon.Close size={13} />
              </button>
            </header>
            <p className="text-[11px] text-periwinkleMuted">
              Kartu buangan bisa membentuk lebih dari satu kombinasi. Pilih yang mau diturunkan.
            </p>
            {digChoices.options.map((option, index) => {
              const uids = option.cards.filter(card => card.uid !== digChoices.target.uid).length;
              return (
                <button
                  key={option.key}
                  type="button"
                  className="text-left p-2.5 rounded-2xl bg-[#15192E] border border-white/10 hover:border-emeraldPrimary/60 flex flex-col gap-1.5"
                  onClick={() => runDig(option, digChoices.discardIndex, digChoices.target, game.discardPile.slice(digChoices.discardIndex + 1))}
                >
                  <span className="text-[11px] font-bold text-emeraldPrimary">
                    Opsi {index + 1} · {option.cards.length} kartu ({uids} dari tangan)
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {option.cards.map(card => (
                      <span key={card.uid} className={`w-8 ${card.uid === digChoices.target.uid ? 'ring-2 ring-goldAccent rounded' : ''}`}>
                        <CardAsset card={card} variant="mini" />
                      </span>
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Pengingat Joker dibuang: stinger + modal kaget. Bila Joker adalah
          kartu penutup, jadi kabar gembira (bonus +150, bukan penalti). */}
      <ConfirmDialog
        open={Boolean(jokerShock)}
        title={jokerShock?.closing ? 'Menutup dengan Joker!' : 'Jokermu Terbuang!'}
        message={jokerShock?.closing
          ? 'Kartu terakhirmu Joker — dan itu MENUTUP ronde! Joker penutup bukan penalti: bonus penutup +150 tetap utuh.'
          : 'Joker yang dibuang tetap dihitung −150 di skor akhir. Di dalam kombinasi, Joker justru penyelamat — pastikan memang kartu ini yang mau kamu lepas.'}
        confirmLabel={jokerShock?.closing ? 'Sikat, Menang!' : 'Aaah, Paham!'}
        cancelLabel="Tutup"
        tone={jokerShock?.closing ? 'success' : 'danger'}
        onConfirm={() => setJokerShock(null)}
        onCancel={() => setJokerShock(null)}
      >
        {jokerShock && (
          <div className="w-20 mx-auto my-3 shadow-card rounded-lg overflow-hidden joker-shock-card">
            <CardAsset card={jokerShock.card} variant="table" />
          </div>
        )}
      </ConfirmDialog>

      {/* Bantuan aturan singkat (tombol ? di header) */}
      {helpOpen && (
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          role="dialog" aria-modal="true" aria-label="Bantuan aturan singkat"
          onClick={() => setHelpOpen(false)}
        >
          <div ref={helpPanelRef} onClick={event => event.stopPropagation()} className="bg-[#1B1F38] border border-white/10 rounded-3xl p-5 sm:p-6 max-w-md w-full max-h-[85vh] overflow-y-auto shadow-2xl flex flex-col gap-3 text-white">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h3 className="text-sm font-bold flex items-center gap-2"><Icon.Info size={15} /> Ringkasan Aturan</h3>
              <button type="button" className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center" onClick={() => setHelpOpen(false)} aria-label="Tutup bantuan">
                <Icon.Close size={13} />
              </button>
            </div>
            <div className="text-xs text-periwinkleMuted leading-relaxed flex flex-col gap-2.5">
              <p><strong className="text-white">1. Alur giliran:</strong> minum 1 kartu (dari tumpukan atau gali buangan) lalu buang 1 / turunkan kombinasi. Skor terendah jadi Pengocok di ronde berikutnya.</p>
              <p><strong className="text-white">2. Kombinasi sah:</strong> deret 2–10 sejenis (boleh 1 Joker), J-Q-K sejenis (tanpa Joker), 3–4 As kembang bebas. Min. 3 kartu — deret angka boleh lebih (sampai 2–10 penuh).</p>
              <p><strong className="text-white">3. Gali buangan:</strong> pilih kartu di tangan, lalu ketuk kartu buangan (tombol #1–#n). Semua kartu di atasnya ikut masuk tanganmu.</p>
              <p><strong className="text-white">4. Menang (Mati Sampah):</strong> tangan habis setelah membuang 1 kartu terakhir — wajib menyisakan kartu buangan.</p>
              <p><strong className="text-white">5. Poin:</strong> kartu di meja = plus, di tangan = minus. <span className="text-goldAccent font-bold">Joker di tangan −50, dibuang −150</span> — pakai di kombinasi! As baru boleh dibuang setelah punya 1 kombinasi.</p>
            </div>
            <p className="text-[10px] text-periwinkleMuted/80 text-center">Aturan lengkap ada di tab “Aturan Main” di halaman awal.</p>
          </div>
        </div>
      )}

      {/* HistoryModal */}
      {historyOpen && (
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          role="dialog" aria-modal="true" aria-label="Riwayat Buangan"
          onClick={() => setHistoryOpen(false)}
        >
          <div ref={historyPanelRef} onClick={event => event.stopPropagation()} className="bg-[#1B1F38] border border-white/10 rounded-3xl p-5 sm:p-6 max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <Icon.History size={15} />
                <span>Riwayat Kartu Buangan ({discardPile.length} Kartu)</span>
              </h3>
              <button
                type="button"
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-xs font-bold text-white transition"
                onClick={() => setHistoryOpen(false)}
                aria-label="Tutup riwayat"
              >
                <Icon.Close size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto pr-1">
              {discardPile.length === 0 ? (
                <p className="text-xs text-periwinkleMuted text-center py-8">Belum ada kartu di tempat buangan.</p>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2.5">
                  {discardPile.map((card, i) => (
                    <div key={card.uid} className="flex flex-col items-center gap-1">
                      <span className="text-[10px] text-periwinkleMuted font-bold tabular-nums">
                        #{discardPile.length - i}
                      </span>
                      <div className="w-full">
                        <CardAsset card={card} variant="mini" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* InspectModal: Kombinasi Meja Lawan */}
      {inspectedPlayer !== null && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setInspectedPlayer(null)}>
          <div ref={inspectPanelRef} className="bg-[#1B1F38] border border-white/10 rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Icon.Eye size={15} />
                <span>Kombinasi Meja {game.players[inspectedPlayer]?.name}</span>
              </h4>
              <button
                type="button"
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-xs font-bold text-white transition"
                onClick={() => setInspectedPlayer(null)}
                aria-label="Tutup kombinasi meja"
              >
                <Icon.Close size={14} />
              </button>
            </div>
            <div>
              {(game.players[inspectedPlayer]?.melds || []).length === 0 ? (
                <p className="text-xs text-periwinkleMuted text-center py-6">Pemain ini belum menurunkan kombinasi kartu.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {game.players[inspectedPlayer].melds.map((group, gi) => (
                    <div key={gi} className="flex gap-1.5 p-2 rounded-2xl bg-white/5 border border-white/10">
                      {group.map(c => (
                        <div key={c.uid} className="w-12 rounded-md overflow-hidden shadow-card">
                          <CardAsset card={c} variant="mini" />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Papan peringkat meja — dibuka dari avatar profil pojok bawah.
          Menampilkan peringkat kumulatif, hasil ronde lalu, dan detail kartu
          yang memang publik: kombinasi meja tiap pemain + jumlah kartu sisa. */}
      {infoPanel && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setInfoPanel(null)}>
          <div
            ref={standingsPanelRef}
            role="dialog"
            aria-modal="true"
            aria-label={infoPanel === 'menu' ? 'Info meja' : infoPanel === 'peringkat' ? 'Peringkat meja' : 'Nilai meja'}
            className="bg-[#1B1F38] border border-white/10 rounded-3xl p-4 sm:p-5 max-w-md w-full max-h-[85vh] flex flex-col shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3 shrink-0 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {infoPanel !== 'menu' && (
                  <button
                    type="button"
                    className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition shrink-0"
                    onClick={() => setInfoPanel('menu')}
                    aria-label="Kembali ke menu info"
                  >
                    <Icon.ArrowBack size={14} />
                  </button>
                )}
                <h4 className="text-sm font-bold text-white flex items-center gap-2 min-w-0">
                  {infoPanel === 'menu' && <><Icon.Users size={15} /><span>Info Meja</span></>}
                  {infoPanel === 'peringkat' && <><Icon.Crown size={15} /><span className="truncate">Peringkat</span></>}
                  {infoPanel === 'nilai' && <><Icon.Star size={15} /><span className="truncate">Nilai</span></>}
                  <span className="text-[10px] font-semibold text-periwinkleMuted whitespace-nowrap">Ronde {live.round}</span>
                </h4>
              </div>
              <button
                type="button"
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-xs font-bold text-white transition shrink-0"
                onClick={() => setInfoPanel(null)}
                aria-label="Tutup info meja"
              >
                <Icon.Close size={14} />
              </button>
            </div>

            {infoPanel === 'menu' && (
              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => setInfoPanel('peringkat')}
                  className="w-full text-left rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-goldAccent/40 px-3.5 py-3 transition flex items-center gap-3 group"
                >
                  <span className="w-10 h-10 rounded-xl bg-goldAccent/15 border border-goldAccent/30 text-goldAccent flex items-center justify-center shrink-0">
                    <Icon.Crown size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-white">Peringkat</span>
                    <span className="block text-[10px] text-periwinkleMuted">Urutan skor semua pemain di meja</span>
                  </span>
                  <span className="text-periwinkleMuted group-hover:text-white transition" aria-hidden="true">›</span>
                </button>

                <button
                  type="button"
                  onClick={() => setInfoPanel('nilai')}
                  className="w-full text-left rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-emeraldPrimary/40 px-3.5 py-3 transition flex items-center gap-3 group"
                >
                  <span className="w-10 h-10 rounded-xl bg-emeraldPrimary/15 border border-emeraldPrimary/30 text-emeraldPrimary flex items-center justify-center shrink-0">
                    <Icon.Star size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-white">Nilai</span>
                    <span className="block text-[10px] text-periwinkleMuted">Rincian poin &amp; kartu kombinasi per pemain</span>
                  </span>
                  <span className="text-periwinkleMuted group-hover:text-white transition" aria-hidden="true">›</span>
                </button>
              </div>
            )}

            {infoPanel === 'peringkat' && (
              <div className="overflow-y-auto no-scrollbar min-h-0">
                <Standings seats={seats} viewerId={viewerId} hostId={live.hostId} prevScores={live.prevScores || null} compact />
              </div>
            )}

            {infoPanel === 'nilai' && (
              <div className="overflow-y-auto no-scrollbar flex flex-col gap-3 min-h-0">
                {/* Ringkasan nilai diri sendiri: total, poin ronde ini (live —
                    hanya pemain sendiri yang boleh melihatnya), ronde lalu. */}
                <section className="rounded-2xl bg-emeraldPrimary/8 border border-emeraldPrimary/25 px-3 py-2.5">
                  <p className="text-[9px] font-extrabold uppercase tracking-wider text-periwinkleMuted mb-1.5">Nilaimu</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-sm font-extrabold text-goldAccent tabular-nums">{mySeat?.score ?? 0}</p>
                      <p className="text-[9px] font-semibold text-periwinkleMuted">Total</p>
                    </div>
                    <div>
                      <p className={`text-sm font-extrabold tabular-nums ${liveScoreById[viewerId]?.total >= 0 ? 'text-emeraldPrimary' : 'text-crimsonDanger'}`}>
                        {signed(liveScoreById[viewerId]?.total ?? 0)}
                      </p>
                      <p className="text-[9px] font-semibold text-periwinkleMuted">Ronde ini</p>
                    </div>
                    <div>
                      <p className="text-sm font-extrabold text-white tabular-nums">
                        {prevScoreById[viewerId] ? signed(prevScoreById[viewerId].total) : '—'}
                      </p>
                      <p className="text-[9px] font-semibold text-periwinkleMuted">Ronde lalu</p>
                    </div>
                  </div>
                </section>

                {/* Nilai publik per pemain: total kombinasi di meja + sisa
                    kartu di tangan. Isi tangan lawan tidak dibuka. */}
                <section>
                  <p className="text-[9px] font-extrabold uppercase tracking-wider text-periwinkleMuted mb-2">Nilai per pemain</p>
                  <div className="flex flex-col gap-2">
                    {seats.map(seat => {
                      const gPlayer = game.players.find(p => p.id === seat.id);
                      const melds = gPlayer?.melds || [];
                      const meldValue = melds.flat().reduce((sum, c) => sum + ((c.kind === 'joker' || c.value === 'JOKER') ? 5 : pointsFor(c)), 0);
                      const prev = prevScoreById[seat.id];
                      return (
                        <div key={seat.id} className="rounded-xl bg-white/[0.03] border border-white/10 px-2.5 py-2">
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <span className="text-[11px] font-bold text-white truncate">
                              {seat.name}
                              {seat.id === viewerId && <span className="text-emeraldPrimary font-extrabold"> · Kamu</span>}
                            </span>
                            <span className="text-[10px] font-extrabold text-white tabular-nums shrink-0">
                              {seat.score ?? 0} <span className="text-[8.5px] font-semibold text-periwinkleMuted">total</span>
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-x-2.5 gap-y-1 text-[9.5px] font-semibold text-periwinkleMuted tabular-nums">
                            <span>Meja: <b className="text-emeraldPrimary">+{meldValue}</b></span>
                            <span>Tangan: <b className="text-white">{gPlayer ? `${gPlayer.hand.length} kartu` : '—'}</b></span>
                            <span>Ronde lalu: <b className={prev && prev.total < 0 ? 'text-crimsonDanger' : 'text-white'}>{prev ? signed(prev.total) : '—'}</b></span>
                          </div>
                          {melds.length > 0 && (
                            <div className="flex flex-col gap-1 mt-1.5">
                              {melds.map((group, gi) => (
                                <div key={gi} className="flex items-center">
                                  {group.map((c, ci) => (
                                    <span
                                      key={c.uid}
                                      className="w-6 sm:w-7 shrink-0 rounded-[4px] mr-[-6px] last:mr-0 shadow-card"
                                      style={{ zIndex: ci }}
                                    >
                                      <CardAsset card={c} variant="mini" />
                                    </span>
                                  ))}
                                  <span className="ml-2 text-[9.5px] font-bold text-emeraldPrimary tabular-nums shrink-0">
                                    +{group.reduce((sum, c) => sum + ((c.kind === 'joker' || c.value === 'JOKER') ? 5 : pointsFor(c)), 0)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
            )}

            {infoPanel !== 'menu' && (
              <p className="text-[10px] text-periwinkleMuted/80 text-center pt-3 mt-1 border-t border-white/5 shrink-0">
                Isi tangan pemain lain tetap tertutup sampai ronde selesai.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Dev Tools panel (local mode only) */}
      {service?.mode === 'local' && devOpen && (
        <aside id="dev-tools-panel" className="fixed bottom-24 right-4 z-40 bg-[#1B1F38]/95 border border-white/15 rounded-2xl shadow-2xl p-3 w-64">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-white inline-flex items-center gap-1.5"><Icon.Gear size={12} /> Dev Tools</span>
            <button type="button" className="text-periwinkleMuted hover:text-white" onClick={() => setDevOpen(false)} aria-label="Tutup dev tools">
              <Icon.Close size={12} />
            </button>
          </div>
          <label className="block text-[11px] text-periwinkleMuted">
            <span>Sudut Pandang Kursi:</span>
            <select
              value={viewIndex}
              onChange={event => {
                const next = Number(event.target.value);
                setViewerOverride(next === viewerIndex ? null : next);
                setOrder((game.players[next]?.hand || []).map(c => c.uid));
                setSelected([]);
              }}
              className="w-full bg-[#121526] border border-white/10 rounded-lg px-2 py-1 mt-1 text-xs text-white"
            >
              {game.players.map((p, i) => (
                <option key={p.id} value={i}>
                  Pemain {i + 1}: {p.name} {p.bot ? '(Bot)' : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-2 text-[10px] text-periwinkleMuted flex flex-col gap-0.5 border-t border-white/5 pt-1.5 tabular-nums">
            <div>Deck: {game.drawPile.length} | Buang: {game.discardPile.length}</div>
            <div>Turn: {game.players[game.turn]?.name} | Fase: {game.phase}</div>
          </div>
        </aside>
      )}
    </main>
    </MotionConfig>
  );
}

// ===========================================================================
// OPPONENT POD (Plato/Durak squircle avatar)
// ===========================================================================
function OpponentPod({ seat, meta, offline, active, turnFraction, onInspect, compact, seatIndex, meldCount = 0, celebrating = false, prevTotal }) {
  const size = compact ? 46 : 64;
  const fan = Math.min(Math.max(seat.hand.length, 1), 5);
  return (
    <button
      type="button"
      className={`player-pod ${active ? 'is-active' : ''} ${meldCount > 0 ? 'has-meld' : ''} ${celebrating ? 'is-melding' : ''} ${compact ? 'is-compact' : ''}`}
      data-seat-index={seatIndex}
      onClick={onInspect}
      aria-label={`Intip kombinasi ${seat.name}${offline ? ', sedang offline' : ''}${active ? ', giliran aktif' : ''}`}
    >
      <span className="pod-name">
        <PresenceDot online={!offline} bot={seat.bot} size={8} />
        <span className="pod-name__text">{seat.name}</span>
        {seat.bot && <span className={`bot-tag ${active ? 'is-active' : ''}`}>{active ? 'AKTIF' : 'BOT'}</span>}
        {meldCount > 0 && (
          <span className="pod-meld-badge" title={`${meldCount} kartu sudah dikombinasikan`}>
            <Icon.Star size={9} />
            <span className="tabular-nums">{meldCount}</span>
          </span>
        )}
        {offline && <span className="pod-offline"><Icon.Offline size={10} /></span>}
      </span>

      <span
        className={`avatar-squircle-ring ${active ? 'ring-green' : offline ? 'ring-red' : 'ring-idle'} ${compact ? 'w-[52px] h-[52px]' : 'w-[56px] h-[56px] sm:w-[68px] sm:h-[68px]'}`}
        style={{ '--turn-frac': `${Math.round(turnFraction * 360)}deg` }}
      >
        <span className="block w-full h-full rounded-[16px] overflow-hidden relative">
          <AvatarArt avatar={meta?.avatar || seat.name.slice(0, 1)} name={seat.name} size={size} />
        </span>
      </span>

      <span className="pod-fan" aria-hidden="true">
        {Array.from({ length: fan }, (_, n) => {
          const mid = (fan - 1) / 2;
          return (
            <span
              key={n}
              className="pod-fan__card"
              style={{
                transform: `rotate(${(n - mid) * (fan > 3 ? 11 : 9)}deg)`,
                zIndex: n,
              }}
            >
              <CardAsset back variant="fill" />
            </span>
          );
        })}
      </span>

      <span className="pod-points">
        <span className="tabular-nums">{meta?.score ?? 0} Poin</span>
        {typeof prevTotal === 'number' && (
          <>
            <span className="pod-points__sep" aria-hidden="true">•</span>
            <span
              className={`tabular-nums font-bold ${prevTotal >= 0 ? 'text-emeraldPrimary' : 'text-crimsonDanger'}`}
              title="Poin ronde terakhir"
            >
              {signed(prevTotal)}
            </span>
          </>
        )}
        <span className="pod-points__sep" aria-hidden="true">•</span>
        <span className="tabular-nums">{seat.hand.length} kartu</span>
      </span>
    </button>
  );
}

// Small placeholder emblem for the empty discard mat
Icon.CardsPlaceholder = function CardsPlaceholder({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ opacity: 0.5 }}>
      <rect x="4" y="3" width="12" height="17" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="9" y="6" width="11" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
};

// ===========================================================================
// FANNED HAND — memoized so the per-second game clock never re-renders cards
// ===========================================================================
const HandCards = React.memo(function HandCards({ hand, selected, overlap, spread = false, heldUids = [], onToggle }) {
  const total = hand.length;
  const mid = (total - 1) / 2;
  return (
    <>
      {hand.map((card, idx) => {
        const isSelected = selected.includes(card.uid);
        const offset = idx - mid;
        const norm = mid === 0 ? 0 : offset / Math.max(1, mid);
        const rotateDeg = norm * (total <= 5 ? 8 : 6);
        const translateY = Math.abs(norm) * Math.abs(norm) * 14;
        return (
          <div
            key={card.uid}
            data-uid={card.uid}
            className={`hand-card-wrapper relative hand-card-size cursor-pointer ${isSelected ? 'is-selected' : ''} ${heldUids.includes(card.uid) ? 'is-in-flight' : ''}`}
            style={{
              marginLeft: idx === 0 ? 0 : spread ? 'var(--spread-gap, 6px)' : `-${overlap}px`,
              zIndex: isSelected ? 90 : 20 + idx,
              '--lift': `${isSelected ? -28 : spread ? 0 : translateY}px`,
              '--tilt': `${isSelected ? 0 : spread ? 0 : rotateDeg}deg`,
              '--grow': isSelected ? 1.06 : 1,
            }}
          >
            <button
              type="button"
              className="hand-card-btn"
              onClick={() => onToggle(card)}
              aria-pressed={isSelected}
              aria-label={`Kartu ${card.value} ${card.suit || ''}${isSelected ? ', terpilih' : ''}`}
            >
              <CardAsset card={card} variant="hand" glow={isSelected} />
            </button>
          </div>
        );
      })}
    </>
  );
});
