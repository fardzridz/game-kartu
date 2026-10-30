import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { MotionConfig } from 'framer-motion';
import CardAsset from './CardAsset.jsx';
import { flyCard, flyDraw, flyDiscard, flyMeld, measurePose } from '../lib/cardFlight.js';
import { AvatarArt, Icon, PresenceDot, SuitIcon } from './SvgPrimitives.jsx';
import ConnectionBadgeGlobal from './ConnectionBadgeGlobal.jsx';
import { validateMeld, findDigMelds, calculateScores, pointsFor } from '../engine/gameRules.js';
import { applyIntent, DEFAULT_AVATAR } from '../engine/roomEngine.js';
import ConfirmDialog from './ConfirmDialog.jsx';
import CeremonyOverlay from './CeremonyOverlay.jsx';
import Standings from './Standings.jsx';
import TauntThrowSystem from './TauntThrowSystem.jsx';
import HighImpactBanners from './HighImpactBanners.jsx';
import GrandChampionModal from './GrandChampionModal.jsx';
import useFullscreen from '../hooks/useFullscreen.js';
import useDialogA11y from '../hooks/useDialogA11y.js';
import { vibrate } from '../utils/haptics.js';
import { play, isMuted, toggleMute, getVolume, setVolume, isMusicEnabled, toggleMusic, MAX_UI_VOLUME } from '../sound/soundFX.js';
import { startMusic, stopMusic, MUSIC_TITLE } from '../sound/music.js';
import { serverNow } from '../services/realtimeService.js';

// Berapa kartu teratas tumpukan buangan yang tampil sebagai tumpukan fisik.
// Kartu yang lebih dalam tetap bisa dibuka lewat dialog Riwayat.
const DISCARD_STACK_LIMIT = 4;

const signed = n => (n > 0 ? `+${n}` : `${n}`);

// Pemain yang memilih kurangi gerak tidak perlu getar layar (bisa memicu
// ketidaknyamanan); bunyi + toast penalti tetap jalan.
const prefersReducedMotion = () => {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

const TURN_LABEL = {
  draw: 'Ambil Kartu',
  meld: 'Buang / Turun',
  discard: 'Buang / Turun',
};

export default function GameBoard({ room, viewerId, onIntent, onExit, service, presence, intentError }) {
  const { isFullscreen, toggleFullscreen } = useFullscreen();

  // Optimistic state: terapkan intent lokal dulu, server konfirmasi via rev
  const [optRoom, setOptRoom] = useState(null);
  const live = optRoom && optRoom.rev >= room.rev ? optRoom : room;
  useEffect(() => { setOptRoom(null); }, [room.rev]);
  // Penolakan intent dari engine (server) kini dilaporkan: tampilkan alasannya
  // sebagai toast dan batalkan state optimis SEKETIKA supaya UI tidak menampilkan
  // aksi yang ternyata ditolak (dulu optimisme menggantung sampai 1,6 detik).
  const lastIntentErrorRef = useRef(null);
  useEffect(() => {
    if (!intentError || lastIntentErrorRef.current === intentError) return;
    lastIntentErrorRef.current = intentError;
    setNotice(intentError.message);
    play('error');
    setOptRoom(null);
  }, [intentError]);

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
  // Kartu buangan yang sedang "di udara". Selama terbang, slot-nya SUDAH
  // dirender di tumpukan (tersembunyi, pre-allocated) supaya ghost mendarat
  // tepat di atas kartu aslinya dan kaskade menata posisi final sejak awal.
  const [heldDiscard, setHeldDiscard] = useState(null);   // { uid, card }
  // Kursi lawan yang kartu minumnya sedang terbang menuju kipas mini. Kartu
  // mini terakhir disembunyikan sampai ghost mendarat supaya tidak tampil dua.
  // Dipetakan per kursi ({ [seatIndex]: token }) agar dua bot yang minum
  // beruntun tidak saling menghapus status sembunyi.
  const [podDrawHold, setPodDrawHold] = useState({});
  const podDrawSeq = useRef(0);
  // Kartu tangan yang dikeluarkan dari kipas selama terbang (meld/discard):
  // FLIP di HandCards yang merapatkan kartu sisanya secara mulus.
  const [flyingHandUids, setFlyingHandUids] = useState([]);
  // Kartu hasil draw yang sedang terbang: sudah dirender di ujung kipas
  // (tersembunyi) sebagai slot pre-allocated tujuan ghost.
  const [pendingDrawCard, setPendingDrawCard] = useState(null);
  // Kartu meld (sendiri/lawan) yang sedang terbang: disembunyikan di zona
  // tujuan sampai ghost-nya mendarat, lalu muncul satu per satu.
  const [heldMeldUids, setHeldMeldUids] = useState([]);
  // Grup kombinasi placeholder (tersembunyi) yang menunggu kartu meld/gali.
  const [meldPreview, setMeldPreview] = useState(null);
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
  const handFanRef = useRef(null);
  const [meldCelebrate, setMeldCelebrate] = useState(0);   // penanda animasi kombinasi
  const [meldCelebratePlayer, setMeldCelebratePlayer] = useState(-1);
  const thrownUids = useRef(new Set());                   // buangan yang sudah dianimasikan sendiri
  const [now, setNow] = useState(() => serverNow());
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(isMuted());
  const [musicOn, setMusicOn] = useState(isMusicEnabled());
  const [volume, setVolumeState] = useState(getVolume());
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  // Timestamp efek kaget buang Joker (0 = tidak aktif). Dipakai untuk
  // menyalakan kelas shake + kilat merah selama ~600ms.
  const [jokerShockAt, setJokerShockAt] = useState(0);
  // Kartu tangan: 'fan' = busur tumpuk (default), 'spread' = sejajar agar mudah diklik.
  const [handSpread, setHandSpread] = useState(false);
  // Kalengan: kartu tangan dibalik jadi punggung agar musuh yang mengintip layar tidak melihat isinya.
  const [handHidden, setHandHidden] = useState(false);
  // Intip sekali: saat tangan dikaleng, kartu yang diklik menampilkan WAJAHNYA
  // sendiri (satu-satunya yang terbuka); kartu lain tetap punggung. Wujudnya
  // uid kartu yang sedang diintip (array 0..1 kartu untuk pola selesai cukup).
  const [peekedUids, setPeekedUids] = useState([]);
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

  // Efek kaget Joker: getar layar dipasang ke <body> (semua fixed child ikut
  // bergoyang), lalu dilepas otomatis. State timestamp dipakai supaya kilat
  // merah bisa di-key ulang setiap kali Joker dibuang.
  useEffect(() => {
    if (!jokerShockAt) return undefined;
    if (!prefersReducedMotion()) {
      document.body.classList.add('tkfx-shake');
    }
    const stop = setTimeout(() => {
      document.body.classList.remove('tkfx-shake');
      setJokerShockAt(0);
    }, 620);
    return () => {
      clearTimeout(stop);
      document.body.classList.remove('tkfx-shake');
    };
  }, [jokerShockAt]);

  // Selebrasi kombinasi bersih setelah seluruh animasinya selesai (pop pod
  // 720ms + kilau zona 900ms) — kalau tidak di-reset, class is-melding
  // menempel permanen dan bisa main lagi tiap pod remount.
  useEffect(() => {
    if (!meldCelebrate) return undefined;
    const timer = setTimeout(() => setMeldCelebrate(0), 1000);
    return () => clearTimeout(timer);
  }, [meldCelebrate]);

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

  // useLayoutEffect: kartu tujuan harus disembunyikan SEBELUM paint — kalau
  // efek biasa, kartu asli sempat terlihat satu frame lalu menghilang.
  useLayoutEffect(() => {
    const prev = remotePrevRef.current;
    const next = remoteSnap;
    // baseline selalu dimajukan di akhir effect (setelah animasi dipicu)
    remotePrevRef.current = next;
    if (!prev) return;
    if (dealTick) return;
    if (live.rev === prev.rev) return;             // bukan snapshot baru

    const seatEl = idx => document.querySelector(`[data-seat-index="${idx}"] .pod-fan`);

    // ---- BUANG: kartu baru masuk ke tumpukan ----
    if (next.discard > prev.discard) {
      const card = game.discardPile[next.discard - 1];
      // pelaku = pemain yang sedang giliran SEBELUM snapshot ini
      const culpritIndex = prev.turn ?? game.turn;
      const culprit = game.players[culpritIndex];
      if (card && !thrownUids.current.has(card.uid) && culprit && culprit.id !== viewerId) {
        // Slot paling atas sudah dirender (kartu sudah ada di state); tahan
        // tampilnya sampai ghost mendarat, lalu muncul instan di tempat sama.
        const toPose = measurePose('.discard-stack__slot.is-depth-1');
        setHeldDiscard({ uid: card.uid, card });
        flyCard({
          from: measurePose(seatEl(culpritIndex)),
          to: toPose,
          card,
          rotateStart: -12,
          duration: 520,
          onLand: () => flushSync(() => setHeldDiscard(cur => (cur?.uid === card.uid ? null : cur))),
        });
        play('discard');
      }
    }

    // ---- KOMBINASI: ada pemain lain yang baru menurunkan kartu ke meja ----
    next.melds.forEach((count, index) => {
      const added = count - (prev.melds?.[index] ?? count);
      const owner = game.players[index];
      if (added <= 0 || !owner || owner.id === viewerId) return;
      const fresh = (owner.melds || []).slice(-1)[0] || [];
      // hanya kartu yang benar-benar baru (slice ekor sesuai jumlah bertambah)
      const newCards = fresh.slice(Math.max(0, fresh.length - added));
      const flightCards = newCards.length
        ? newCards
        : [{ uid: `meld-${index}-${count}`, value: '?', suit: '' }];

      // Zona kombinasi di tengah layar hanya menampilkan kombinasi DIRI
      // SENDIRI, jadi lawan tidak punya slot tujuan di sana. Dulu daftar
      // tujuan kosong dan seluruh animasi langsung selesai tanpa gerakan.
      // Sekarang kartu lawan terbang dari kipas mini pod-nya ke badge
      // kombinasi di pod itu sendiri, mengecil seperti diserap ke tumpukan.
      const seatRoot = document.querySelector(`[data-seat-index="${index}"]`);
      const seatFan = seatRoot?.querySelector('.pod-fan');
      const badgeEl = seatRoot?.querySelector('.pod-meld-badge')
        || seatRoot?.querySelector('.pod-avatar-wrap');
      const badgePose = measurePose(badgeEl);
      if (!badgePose) return;
      const fanPose = measurePose(seatFan);
      const minis = seatFan ? Array.from(seatFan.querySelectorAll('.pod-fan__card')) : [];
      const ghostW = 30;
      const ghostH = Math.round(ghostW * 1.453);
      const midCard = (flightCards.length - 1) / 2;
      flyMeld({
        // Sumber: kartu mini terakhir di kipas pod (posisi tempat kartu itu
        // barusan lepas). Ghost lahir dengan skala kartu mini, jadi tidak
        // ada lompatan ukuran di awal penerbangan.
        fromEls: flightCards.map((_, i) => minis[minis.length - 1 - i] || fanPose || seatFan),
        toEls: flightCards.map((_, i) => ({
          x: badgePose.x + (i - midCard) * 4,
          y: badgePose.y + (i - midCard) * 1.5,
          w: ghostW,
          h: ghostH,
          angle: (i - midCard) * 8,
          // Visual akhir ±19px — seukuran badge, jadi kartu benar-benar
          // "masuk" ke penanda kombinasi, bukan menghilang di udara.
          scale: 0.62,
        })),
        cards: flightCards,
        gap: 90,
        // Kombinasi lawan selalu tertutup: pemain tidak boleh membaca kartu
        // yang sedang terbang ke meja orang lain.
        back: true,
        onEachLand: () => play('deal'),
        onAllLand: () => {
          play('meld');
          setMeldCelebratePlayer(index);
          setMeldCelebrate(Date.now());
        },
      });
    });

    // ---- MINUM: tumpukan berkurang & tangan bot bertambah 1 ----
    if (next.draw < prev.draw) {
      // cari pemain yang tangannya bertambah; pemain utama diabaikan
      // (minum sendiri sudah dianimasikan dari handler klik)
      let gainedIndex = next.hands.findIndex((n, i) => n === prev.hands[i] + 1 && game.players[i]?.id !== viewerId);
      if (gainedIndex < 0) {
        // Snapshot bisa menggabungkan minum + buang dalam SATU rev kalau bot
        // bergerak cepat: jumlah kartu tangan kembali sama walau drawPile
        // berkurang. Jatuh ke pemain yang tadi memegang giliran supaya kartu
        // minum tetap terlihat terbang ke kipas mini-nya.
        const candidate = prev.turn ?? game.turn;
        if (
          live.status === 'playing'
          && candidate != null
          && game.players[candidate]
          && game.players[candidate].id !== viewerId
        ) gainedIndex = candidate;
      }
      const bot = gainedIndex >= 0 ? game.players[gainedIndex] : null;
      if (bot) {
        // Bunyi kartu lawan sengaja lebih pelan: kita perlu tahu meja
        // bergerak, tapi tidak boleh terdengar seperti aksi kita sendiri.
        play('drawSoft');
        // Target = kartu mini TERAKHIR di kipas pod, bukan kontainer .pod-fan.
        // Kontainer itu lebar (~60px) tapi tinggi cuma 26px, jadi ghost dulu
        // terbang sebagai persegi gepeng. Ghost dibuat lebih besar dari kartu
        // mini lalu diskalakan turun, supaya tetap berbentuk kartu sepanjang
        // penerbangan dan mendarat pas di ukuran mini.
        const fan = document.querySelector(`[data-seat-index="${gainedIndex}"] .pod-fan`);
        const minis = fan ? fan.querySelectorAll('.pod-fan__card') : [];
        const miniPose = measurePose(minis[minis.length - 1] || fan);
        let target = miniPose || fan;
        if (miniPose) {
          const ghostW = Math.max(30, Math.round(miniPose.w * 1.7));
          target = {
            ...miniPose,
            w: ghostW,
            // Rasio kotak mini (≈5:7) supaya ghost mendarat PERSIS di kartu
            // mini tanpa lompatan tinggi 1-2px saat handoff.
            h: Math.round(ghostW * (miniPose.h / miniPose.w)),
            scale: miniPose.w / ghostW,
          };
        }
        // Kartu mini terakhir hanya perlu disembunyikan bila kartu baru
        // MEMANG tampil sebagai mini baru. Bandingkan jumlah kartu asli, bukan
        // jumlah mini (yang di-clamp min 1): bot yang tadinya 0 kartu lalu
        // minum tetap menampilkan 1 mini, dan mini itu yang harus ditahan.
        const prevCount = prev.hands[gainedIndex] ?? 0;
        const nextCount = next.hands[gainedIndex] ?? 0;
        const showsNewMini = nextCount > prevCount && nextCount <= 5;
        if (showsNewMini) {
          const token = ++podDrawSeq.current;
          // useLayoutEffect berjalan SEBELUM paint: setState biasa di sini
          // sudah di-flush React sebelum frame berikutnya, jadi kartu mini
          // baru tidak pernah sempat terlihat sebelum ghost lahir.
          setPodDrawHold(cur => ({ ...cur, [gainedIndex]: token }));
          flyDraw({
            fromEl: '.deck-stack',
            toEl: target,
            card: null,
            duration: 520,
            onLand: () => flushSync(() => setPodDrawHold(cur => {
              if (cur[gainedIndex] !== token) return cur;
              const nextHold = { ...cur };
              delete nextHold[gainedIndex];
              return nextHold;
            })),
          });
        } else {
          flyDraw({ fromEl: '.deck-stack', toEl: target, card: null, duration: 520 });
        }
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

  // Tangan yang TAMPAK di kipas: kartu yang sedang terbang (meld/discard)
  // dikeluarkan seketika supaya FLIP merapatkan kartu sisanya sejak awal
  // terbang, dan kartu draw yang masih di udara sudah menempati slotnya.
  const displayHand = useMemo(() => {
    const base = hand.filter(card => !flyingHandUids.includes(card.uid));
    if (pendingDrawCard && !base.some(card => card.uid === pendingDrawCard.uid)) {
      return [...base, pendingDrawCard];
    }
    return base;
  }, [hand, flyingHandUids, pendingDrawCard]);

  // Lebar kartu tangan aktual untuk menghitung overlap kipas.
  // Token --hand-card-w berisi clamp(...) sehingga TIDAK bisa di-parse sebagai
  // px. Dulu pengukuran mengandalkan .hand-card-size yang belum ada selama
  // upacara bagi kartu → nilainya tertahan 100px dan kipas tampak menumpuk
  // rapat sampai kartu pertama diminum. Solusi: elemen probe tersembunyi yang
  // selalu ter-render dan memakai token yang sama, jadi lebarnya benar sejak
  // frame pertama (termasuk saat dealing / sebelum ada kartu di tangan).
  const [handCardW, setHandCardW] = useState(100);
  useLayoutEffect(() => {
    const measure = () => {
      const probe = document.querySelector('.hand-card-probe');
      const width = probe ? probe.getBoundingClientRect().width : 0;
      if (width) setHandCardW(width);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [displayHand.length, dealing, handSpread]);

  // Overlap in px from the measured card width so every card keeps a readable index.
  // Tangan bertambah banyak (hasil gali dalam) tidak boleh melebarkan layar:
  // langkah antar kartu dipatok agar total lebar kipas selalu muat di viewport.
  const dynamicOverlap = useMemo(() => {
    if (handSpread) return 0;
    const count = Math.max(1, displayHand.length);
    const ratio = count <= 5 ? 0.12 : count <= 7 ? 0.2 : count <= 9 ? 0.27 : count <= 11 ? 0.32 : count <= 13 ? 0.36 : 0.4;
    const defaultOverlap = Math.round(handCardW * ratio);
    const maxAvailable = Math.max(220, (typeof window !== 'undefined' ? window.innerWidth : 800) - 24);
    // total = w + (n-1) × langkah ≤ maxAvailable → langkah maksimum:
    const maxStep = Math.max(12, (maxAvailable - handCardW) / (count - 1 || 1));
    const defaultStep = handCardW - defaultOverlap;
    const step = Math.min(defaultStep, maxStep);
    return Math.max(0, Math.round(handCardW - step));
  }, [displayHand.length, handCardW, handSpread]);

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

  // useMemo: identitas stabil untuk dep fanCards & pileNow (fallback || []
  // membuat array baru tiap render dan menggagalkan memoisasi).
  const discardPile = useMemo(() => game.discardPile || [], [game.discardPile]);
  const drawPile = useMemo(() => game.drawPile || [], [game.drawPile]);
  // Selama kartu buangan "di udara", tumpukan sudah dirender dengan slot
  // kartu itu (tersembunyi, pre-allocated) supaya kaskade menata posisi final
  // sejak awal terbang dan ghost mendarat tepat di slotnya (zero-gap).
  const flightCard = heldDiscard?.card || null;
  const flightUid = heldDiscard?.uid || null;
  const pileNow = flightCard && !discardPile.some(card => card.uid === flightUid)
    ? [...discardPile, flightCard]
    : discardPile;
  const shownDiscards = pileNow.slice(-DISCARD_STACK_LIMIT);
  const buriedCount = Math.max(0, pileNow.length - shownDiscards.length);
  // Zona meld hanya milik pemain; penonton mendapat tampilan netral (dulu
  // penonton melihat meld pemain indeks 0 seolah miliknya).
  const totalMelds = isSpectator ? 0 : player.melds.reduce((sum, group) => sum + group.length, 0);
  // Nilai poin kombinasi yang sudah diturunkan ke meja — aturan hitung sama
  // dengan penilaian akhir ronde (Joker di kombinasi +5). Pill lama keliru
  // menampilkan jumlah kartu sebagai "Poin".
  const meldPoints = isSpectator ? 0 : player.melds
    .flat()
    .reduce((sum, card) => sum + ((card.kind === 'joker' || card.value === 'JOKER') ? 5 : pointsFor(card)), 0);

  // Kartu yang tampil di kipas: semua kedalaman yang masih sah digali
  // (≤ batas gali), dipatok 12 teratas supaya kipas tetap terbaca.
  const fanCards = useMemo(() => {
    if (fanPhase === 'closed') return [];
    const maxShow = Math.min(live.maxDepth || 5, 12, discardPile.length);
    return discardPile.slice(-maxShow).map((card, i, arr) => {
      const absoluteIndex = discardPile.length - arr.length + i;
      const depth = discardPile.length - absoluteIndex;
      return { card, absoluteIndex, depth, locked: depth > (live.maxDepth || 5) };
    });
  }, [fanPhase, discardPile, live.maxDepth]);

  const secondsLeft = live.status === 'playing' && !dealing
    ? Math.max(0, Math.ceil((live.lastActionAt + live.turnSeconds * 1000 - now) / 1000))
    : null;
  const timedOut = secondsLeft !== null && secondsLeft <= 0;

  // Bunyi hitung mundur 10 detik terakhir. Dipicu per angka (bukan per tick
  // jam) supaya tidak dobel. Peringatan "warn" hanya untuk giliranku sendiri:
  // pemain lain tidak perlu dikejutkan oleh timer yang bukan miliknya.
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
    else if (secondsLeft === 10 && isMyTurn) play('warn');
    else play('tick', (10 - secondsLeft) / 7);
  }, [secondsLeft, isMyTurn]);
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

  // Ukur kartu kipas sekali terbuka → jarak antar kartu menyesuaikan otomatis.
  // Anggaran lebar diambil dari VIEWPORT (bukan lebar tray yang ikut berubah
  // sesuai isi) supaya perhitungan langkah antar kartu stabil, tidak melingkar.
  useLayoutEffect(() => {
    if (fanPhase === 'closed') return undefined;
    const measure = () => {
      const fan = fanRef.current;
      if (!fan) return;
      const first = fan.querySelector('.discard-fan__card');
      setFanMeasure({
        maxW: Math.min(window.innerWidth * 0.92, 560),
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

  async function copyRoomCode() {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(live.code);
      else throw new Error('clipboard tidak tersedia');
      setNotice('Kode meja berhasil disalin!');
      play('turn');
    } catch {
      setNotice(`Kode meja: ${live.code}`);
    }
  }

  // Ketuk area meja kosong = batal pilih semua kartu di tangan. Listener di
  // dokumen agar tetap jalan di felt di luar elemen React; semua kontrol
  // (kartu, tombol, dialog, zona) dikecualikan lewat closest().
  useEffect(() => {
    if (!selected.length) return undefined;
    const onDown = event => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('.hand-fan, .hand-privacy-btn, .glass-hud, .meld-zone, .discard-stack, .discard-fan, .player-pod, .arena-hud, button, input, select, textarea, [role="dialog"], .tkfx-dock, .tkfx-panel')) return;
      setSelected([]);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [selected.length]);

  function handleDraw() {
    if (!canDrawNow) return;
    if (!game.drawPile.length) {
      setNotice('Tumpukan minum habis.');
      return;
    }
    const card = game.drawPile[0];
    setBusy(true);
    play('draw');
    if (!muted) vibrate(8);
    // Slot kartu hasil draw SUDAH dirender di ujung kipas (tersembunyi,
    // pre-allocated) sebelum ghost lahir: kipas membuka ruang secara halus
    // (FLIP) dan ghost mendarat tepat di posisi kartu aslinya.
    flushSync(() => setPendingDrawCard(card));
    const slotEl = document.querySelector(`.hand-card-wrapper[data-uid="${CSS.escape(String(card.uid))}"]`);
    // Ukuran kartu tangan AKTIF sebagai patokan minimum slot tujuan. Slot
    // pre-allocated baru bisa terukur setengah jadi (gambar belum termuat /
    // terkompresi flexbox) — tanpa ini ghost terbang kecil lalu membesar
    // mendadak saat menjadi kartu asli.
    const handRef = measurePose(
      Array.from(document.querySelectorAll('.hand-fan .hand-card-wrapper:not(.is-in-flight)'))
        .find(el => el.offsetWidth > 0) || null,
    );
    const handMinSize = handRef
      ? { w: handRef.w, h: handRef.h || handRef.w * 1.453 }
      : { w: handCardW || 100, h: (handCardW || 100) * 1.453 };
    let landed = false;
    const commitDraw = () => {
      if (landed) return;
      landed = true;
      // flushSync: kartu asli tampil di kipas pada frame yang sama dengan
      // penghapusan ghost (zero-gap handoff).
      flushSync(() => {
        send({ type: 'draw' });
        setPendingDrawCard(null);
      });
    };
    // Intent dikirim SEKALI saja: dari callback animasi, atau dari timer
    // di bawah bila animasi tidak pernah selesai (halaman dibekukan browser) —
    // tanpa ini klik minum "tidak pernah terjadi".
    flyDraw({
      fromEl: '.deck-stack',
      toEl: slotEl || '.hand-fan',
      card,
      minSize: handMinSize,
      onLand: commitDraw,
      onDone: () => setBusy(false),
    });
    setTimeout(() => { commitDraw(); setBusy(false); }, 1400);
  }

  // ---------------------------------------------------------------
  // GALI LANGSUNG (tanpa modal): pilih kartu di tangan → ketuk kartu buangan.
  // ---------------------------------------------------------------
  function doDig(discardIndex, uids, target) {
    setBusy(true);
    play('dig');
    // Kipas meluncur balik rapat; kartu yang tergali disembunyikan persis
    // saat ghost lahir supaya tidak tampil dua kali.
    closeFan(false);
    setPickedFanIndex(discardIndex);
    // Grup hasil gali = [target, ...kartu terpilih] — urutan yang sama dengan
    // engine (digWithCards, pool = tangan + kartu terangkut). Kartu terangkut
    // yang ikut turun ikut diterbangkan; sisanya masuk tangan.
    const carried = game.discardPile.slice(discardIndex + 1);
    const chosen = [...player.hand, ...carried].filter(card => uids.includes(card.uid));
    const flightCards = [target, ...chosen];
    flushSync(() => {
      setMeldPreview({ cards: flightCards });
      setHeldMeldUids(flightCards.map(card => card.uid));
    });
    const toEls = flightCards
      .map(card => document.querySelector(`[data-meld-flight="${CSS.escape(String(card.uid))}"]`))
      .filter(Boolean);
    const discardEl = fanPhase !== 'closed'
      ? document.querySelector(`.discard-fan__card[data-index="${discardIndex}"]`)
      : document.querySelector(`.discard-stack__slot[data-index="${discardIndex}"]`);
    // Elemen asal per kartu: target & kartu terangkut dari slot buangan/kipas,
    // kartu tangan dari kipas tangan — pasangan from↔card harus sejajar.
    const fromEls = flightCards.map(card => {
      if (card.uid === target.uid) {
        return discardEl || document.querySelector('.discard-stack__slot.is-depth-1');
      }
      const carriedIndex = carried.findIndex(item => item.uid === card.uid);
      if (carriedIndex >= 0) {
        return document.querySelector(`.discard-fan__card[data-index="${discardIndex + 1 + carriedIndex}"]`)
          || document.querySelector(`.discard-stack__slot[data-index="${discardIndex + 1 + carriedIndex}"]`);
      }
      return document.querySelector(`.hand-card-wrapper[data-uid="${CSS.escape(String(card.uid))}"]`);
    });
    // Dipicu callback animasi ATAU timer fallback — sebelumnya hanya dari
    // animasi, jadi halaman yang dibekukan browser membuat gali macet total
    // (intent tak terkirim dan busy tidak pernah lepas).
    let landed = false;
    const landDig = () => {
      if (landed) return;
      landed = true;
      flushSync(() => {
        send({ type: 'dig', discardIndex, uids });
        setOrder(prev => prev.filter(uid => !uids.includes(uid)));
        setSelected([]);
        setMeldPreview(null);
        setHeldMeldUids([]);
        setFlyingHandUids([]);
        setPickedFanIndex(null);
        setBusy(false);
        setNotice('Kartu buangan digali, pasangan turun ke meja.');
      });
    };
    flyMeld({
      fromEls,
      toEls,
      cards: flightCards,
      gap: 70,
      onFlightStart: card => {
        if (uids.includes(card.uid)) setFlyingHandUids(prev => [...prev, card.uid]);
      },
      onEachLand: card => {
        play('deal');
        flushSync(() => setHeldMeldUids(prev => prev.filter(uid => uid !== card.uid)));
      },
      onAllLand: landDig,
    });
    setTimeout(landDig, 1600);
  }

  function runDig(option, discardIndex, target, carried) {
    const uids = option.cards.filter(card => card.uid !== target.uid).map(card => card.uid);
    // Kartu terangkut yang TIDAK ikut turun tetap masuk tangan, jadi sisa
    // tangan = tangan + terangkut − kartu yang diturunkan. Wajib >= 1 untuk
    // Kartu Tutupan.
    const remaining = player.hand.length + carried.length - uids.length;
    if (remaining < 1) {
      play('error');
      setNotice('Wajib menyisakan minimal 1 kartu di tangan untuk Kartu Tutupan!');
      return;
    }
    setDigChoices(null);
    const joinedCarried = uids.filter(uid => carried.some(card => card.uid === uid)).length;
    setNotice(
      `${option.cards.length} kartu jadi kombinasi${carried.length ? `, ${joinedCarried} kartu terangkut ikut turun, ${carried.length - joinedCarried} masuk tangan` : ''}.`,
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

    // Tangan sedang dkaleng: kartu pendamping lain punya sisi yang belum dilihat
    // pemain, jadi gali buangan ditunda sampai tangan dibuka (tombol Intip).
    if (handHidden) {
      play('error');
      setNotice('Buka kartu tangan dulu (tombol Intip) untuk gali buangan.');
      return;
    }

    // Pilihan tangan dipakai sebagai isyarat "kartu mana yang ingin dipakai".
    // Semua variasi kombinasi sah (3..8 kartu) dihitung dari pool tangan +
    // kartu terangkut; kombinasi MURNI selalu didahulukan, varian Joker
    // ditampilkan terpisah dan TIDAK pernah diselipkan otomatis.
    // Jalur EKSAK (F-22: kartu pendamping ditentukan pemain sendiri): bila
    // kartu terpilih + kartu galian sudah sah sendirinya, jalankan PERSIS
    // seleksinya — Joker yang tidak ikut dipilih tidak boleh diselipkan otomatis.
    const selectedCards = player.hand.filter(card => selected.includes(card.uid));
    if (selectedCards.length >= 2) {
      const exactMeld = [target, ...selectedCards];
      const remaining = player.hand.filter(card => !selected.includes(card.uid));
      if (validateMeld(exactMeld).valid && (remaining.length > 0 || carried.length > 0)) {
        runDig({ cards: exactMeld }, discardIndex, target, carried);
        return;
      }
    }
    const options = findDigMelds(target, [...player.hand, ...carried], 8, 1);
    const fitsSelection = selected.length
      ? options.filter(option => selected.every(uid => option.cards.some(card => card.uid === uid)))
      : [];
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

    // 1) ukur pose kartu di tangan sebelum state berubah
    const fromEls = cardsToMeld
      .map(card => document.querySelector(`.hand-card-wrapper[data-uid="${CSS.escape(String(card.uid))}"]`))
      .filter(Boolean);

    // 2) grup placeholder tersembunyi dipasang di zona meld sebagai target
    //    presisi; tiap kartu baru tampil instan saat ghost-nya mendarat.
    flushSync(() => {
      setMeldPreview({ cards: cardsToMeld });
      setHeldMeldUids(cardsToMeld.map(card => card.uid));
    });
    const toEls = cardsToMeld
      .map(card => document.querySelector(`[data-meld-flight="${CSS.escape(String(card.uid))}"]`))
      .filter(Boolean);

    cardsToMeld.forEach(card => thrownUids.current.add(card.uid));
    setBusy(true);

    let landed = false;
    const commit = () => {
      if (landed) return;
      landed = true;
      flushSync(() => {
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
        setMeldPreview(null);
        setHeldMeldUids([]);
        setFlyingHandUids([]);
        setBusy(false);
      });
    };

    // 3) kartu terbang bergiliran dari tangan ke slotnya masing-masing;
    //    kartu sumber keluar dari kipas satu per satu tepat saat terbang.
    flyMeld({
      fromEls,
      toEls,
      cards: cardsToMeld,
      gap: 70,
      onFlightStart: card => setFlyingHandUids(prev => (prev.includes(card.uid) ? prev : [...prev, card.uid])),
      onEachLand: card => {
        play('deal');
        flushSync(() => setHeldMeldUids(prev => prev.filter(uid => uid !== card.uid)));
      },
      onAllLand: commit,
    });
    // jaring pengaman bila callback animasi hilang (tab tidak aktif)
    setTimeout(commit, 2400);
  }

  function requestDiscard(cardToDiscard) {
    if (game.phase === 'draw' || !isMyTurn || busy || !cardToDiscard) return;
    // ATURAN AS: As haram dibuang sebelum pemain punya minimal satu kombinasi.
    // Ini aturan mesin — cukup ditolak + toast, tanpa dialog konfirmasi.
    if (String(cardToDiscard.value) === 'A' && !(player.melds || []).length) {
      setNotice('Kartu As hanya boleh dibuang setelah kamu punya minimal satu kombinasi di meja.');
      play('error');
      setSelected([]);
      return;
    }
    // As dan Joker dibuang LANGSUNG tanpa dialog. Aturannya sudah diketahui
    // sebelum duduk, tapi Joker tetap butuh umpan balik "kaget": bunyi
    // khusus + layar bergetar + toast penalti, semuanya non-blocking.
    //
    // PENGECUALIAN: Joker sebagai Kartu Tutupan (kartu terakhir di tangan)
    // BUKAN penalti — mesin memberinya bonus +150 utuh. Efek kaget merah
    // tidak boleh muncul di sana; perayaannya ditangani banner JOKER CLOSER
    // begitu ronde berakhir.
    const isJoker = cardToDiscard.kind === 'joker' || cardToDiscard.value === 'JOKER';
    const isClosingCard = player.hand.length <= 1;
    if (isJoker && !isClosingCard) {
      triggerJokerShock();
    }
    executeDiscard(cardToDiscard);
  }

  // Efek "kaget" buang Joker: bunyi berat, layar bergetar, kilat merah, dan
  // toast penalti. Tidak memblokir permainan — kartu tetap langsung terbang.
  function triggerJokerShock() {
    play('joker');
    if (!muted) vibrate([40, 60, 120, 40, 90]);
    setJokerShockAt(Date.now());
    setNotice('JOKER DIBUANG! Penalti −150 poin masuk ke skormu di akhir ronde.');
  }

  function executeDiscard(cardToDiscard) {
    // Kartu ini sedang terbang: abaikan klik kedua selama penerbangan.
    if (heldDiscard?.uid === cardToDiscard.uid) return;

    // 1) Ukur pose kartu di tangan SEBELUM state berubah.
    const handEl = document.querySelector(`.hand-card-wrapper[data-uid="${CSS.escape(String(cardToDiscard.uid))}"]`);
    const fromPose = measurePose(handEl);

    thrownUids.current.add(cardToDiscard.uid);
    // 2) Kartu keluar dari kipas (FLIP merapatkan kartu sisanya) dan slot
    //    tujuannya dipasang tersembunyi di tumpukan — ghost lahir dan
    //    mendarat di koordinat yang sama persis (zero-gap handoff).
    flushSync(() => {
      setHeldDiscard({ uid: cardToDiscard.uid, card: cardToDiscard });
      setFlyingHandUids([cardToDiscard.uid]);
    });
    const toPose = measurePose('.discard-stack__slot.is-held');

    let landed = false;
    const commit = () => {
      if (landed) return;
      landed = true;
      flushSync(() => {
        const ok = send({ type: 'discard', uid: cardToDiscard.uid });
        if (ok) {
          play('discard');
          if (!muted) vibrate(10);
          setOrder(prev => prev.filter(uid => uid !== cardToDiscard.uid));
          setSelected([]);
          setPeekedUids([]);   // intip habis bersama kartu yang dibuangnya
          // Toast penalti Joker SENGAJA dipertahankan: commit ini berjalan
          // ~0,6 detik setelah klik (saat kartu mendarat), jadi kalau ikut
          // dibersihkan pesannya tidak pernah sempat terbaca. Toast lain
          // tetap dibersihkan seperti biasa.
          setNotice(prev => (prev.startsWith('JOKER DIBUANG') ? prev : ''));
        } else {
          thrownUids.current.delete(cardToDiscard.uid);
        }
        // kartu asli tampil di tumpukan pada frame yang sama dengan
        // penghapusan ghost
        setHeldDiscard(null);
        setFlyingHandUids([]);
      });
    };

    // 3) Kartu diangkat & membesar (masih tertutup) → FLIP ke muka saat
    //    masih besar → turun PERSIS ke slot yang sudah disiapkan. Ghost
    //    padat dari frame pertama sampai terakhir: tanpa fade, tanpa celah.
    flyDiscard({
      from: fromPose,
      to: toPose,
      card: cardToDiscard,
      onLand: commit,
      onDone: () => {
        if (!landed) commit();
      },
    });
  }

  const toggleCard = useCallback((card) => {
    // Kartu sedang dikaleng (punggung tampil): klik jadi "intip sekali" — kartu
    // yang diklik menampilkan wajahnya sendiri, kartu lain tetap punggung.
    // Karena wajah kartu yang diintip SUDAH terlihat, kartu itu langsung dianggap
    // terpilih → tombol Buang bisa jalan (termasuk dialog konfirmasi As/Joker
    // yang menampilkan wajahnya). Menutup intip = kartu yang sama juga melepas
    // pilihan; menintip kartu lain = intip + pilihan berpindah.
    if (handHidden) {
      const isPeeking = peekedUids[0] === card.uid;
      setPeekedUids(isPeeking ? [] : [card.uid]);
      setSelected(isPeeking ? [] : [card.uid]);
      return;
    }
    setSelected(prev => (prev.includes(card.uid) ? prev.filter(uid => uid !== card.uid) : [...prev, card.uid]));
  }, [handHidden, peekedUids]);

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

  // Jarak antar kartu kipas: minimal ~44px langkah terlihat supaya jempol di
  // HP bisa menekan kartu ke-2/ke-3/ke-4 tanpa salah sentuh kartu teratas.
  // Bila semua kartu tidak muat pada langkah minimum (gali sangat dalam),
  // kipas sendiri yang jadi bisa digeser horizontal (overflow-x di CSS).
  const fanOverlap = (() => {
    if (fanCards.length <= 1) return 0;
    const w = fanMeasure.w || 90;
    const budget = fanMeasure.maxW || 320;
    const fitStep = Math.max(0, (budget - 12 - w) / (fanCards.length - 1));
    const step = Math.max(44, Math.min(w * 0.62, fitStep));
    return Math.round(w - step);
  })();
  // Pengumuman untuk screen reader: HANYA berubah saat giliran/fase berganti,
  // bukan tiap detik seperti angka timer (aria-live tidak boleh membaca tick).
  const announce = useMemo(() => {
    if (live.status !== 'playing' || dealing) return '';
    return isMyTurn
      ? `Giliranmu: ${TURN_LABEL[game.phase] || 'buang atau turunkan kombinasi'}`
      : `Giliran ${activeName}`;
  }, [live.status, dealing, isMyTurn, game.phase, activeName]);

  // Musik latar: hanya selama ronde berjalan, dan punya saklar sendiri.
  // Mute TIDAK menghentikan scheduler — mute bekerja di master gain, jadi
  // saat suara dinyalakan lagi iringan tetap di posisinya, bukan mulai ulang.
  useEffect(() => {
    if (live.status === 'playing' && musicOn) startMusic();
    else stopMusic();
    return () => stopMusic();
  }, [live.status, musicOn]);

  // Umpan balik turn suara + getar saat giliran berpindah. Giliran lawan
  // diberi bunyi lebih pelan supaya pemain tahu meja bergerak tanpa dikira
  // gilirannya sendiri.
  useEffect(() => {
    if (live.status === 'playing' && lastTurnRef.current !== game.turn && !dealing) {
      lastTurnRef.current = game.turn;
      if (isMyTurn) {
        play('turn');
        // Getar halus satu ketuk saat giliran tiba (diabaikan bila mute / iOS).
        if (!muted) vibrate(60);
      } else {
        play('turnOther');
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
          <button
            type="button"
            className="hud-pill hud-code-btn"
            onClick={copyRoomCode}
            title="Ketuk untuk salin kode meja"
            aria-label={`Salin kode meja ${live.code}`}
          >
            <span className="w-2 h-2 rounded-full bg-emeraldPrimary shadow-[0_0_8px_#2ECC71]" aria-hidden="true" />
            <span className="text-xs sm:text-sm font-bold tabular-nums text-white truncate">#{live.code}</span>
          </button>
          <div className="hud-pill hidden sm:flex audit-badge-wrap">
            <ConnectionBadgeGlobal />
          </div>
        </div>

        {/* Pengumuman giliran untuk screen reader. Pill giliran + timer TIDAK
            lagi di header (terlalu padat di HP) — keduanya tampil di kartu
            profil pemain pada dock bawah. Timer sengaja tanpa aria-live:
            angka berubah tiap detik akan membanjiri screen reader. */}
        <div className="sr-only" role="status" aria-live="polite">{announce}</div>

        {/* Right controls */}
        <div className="hud-right flex items-center gap-1.5 sm:gap-2 shrink-0" ref={rightRef}>
          <button
            type="button"
            className={`icon-btn-sq ${musicOn ? 'is-on' : ''}`}
            onClick={() => setMusicOn(toggleMusic())}
            title={musicOn ? `Matikan musik “${MUSIC_TITLE}”` : `Nyalakan musik “${MUSIC_TITLE}”`}
            aria-label={musicOn ? 'Matikan musik latar' : 'Nyalakan musik latar'}
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
                max={MAX_UI_VOLUME * 100}
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
        {/* Strip profil lawan: 1-2 lawan rata tengah; 3+ lawan memakai pod
            kompak yang bisa digeser horizontal (snap) agar ujung kiri/kanan
            tidak terpotong kasar. */}
        <div
          className={`opponent-strip items-start max-w-full ${opponents.length > 2 ? 'is-scrollable' : 'justify-center'}`}
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
                secondsLeft={active ? secondsLeft : null}
                timedOut={timedOut}
                onInspect={() => setInspectedPlayer(inspectedPlayer === index ? null : index)}
                compact={opponents.length > 2}
                meldCount={(game.players[index]?.melds || []).reduce((sum, group) => sum + group.length, 0)}
                celebrating={meldCelebrate > 0 && meldCelebratePlayer === index}
                drawHeld={Boolean(podDrawHold[index])}
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
          <div className={`playfield-center ${fanPhase !== 'closed' ? 'is-fan-floating' : ''}`} data-dropzone="discard">
            <div className="playfield-center__inner">
            <div className="discard-head">
              <span className="zone-title">Tempat Buangan ({pileNow.length})</span>
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
                    const depth = pileNow.length - absoluteIndex;
                    const isLocked = depth > (live.maxDepth || 5);
                    const isTop = offset === shownDiscards.length - 1;
                    const isHeld = flightUid === card.uid;
                    const layersBelow = shownDiscards.length - 1 - offset;
                    const shift = (offset - (shownDiscards.length - 1) / 2);
                    return (
                      <span
                        key={card.uid}
                        className={`discard-stack__slot ${isLocked ? 'is-locked' : ''} ${depth === 1 ? 'is-depth-1' : ''} ${isHeld ? 'is-held' : ''}`}
                        data-index={absoluteIndex}
                        aria-hidden="true"
                        style={{
                          transform: `translate(calc(var(--discard-shift, 24px) * ${shownDiscards.length > 1 ? shift : 0}), calc(var(--discard-lift, 6px) * ${-layersBelow})) rotate(${shift === 0 ? 0 : shift * 1.4}deg)`,
                          zIndex: 10 + offset,
                          // Kartu yang sedang digali disembunyikan persis saat
                          // ghost-nya lahir (sumber = slot ini saat kipas rapat).
                          visibility: pickedFanIndex === absoluteIndex ? 'hidden' : undefined,
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

                {/* Tray bentangan: popover SOLID di tengah zona buangan — kartu
                    #1..#n berjejer rapi di dalamnya, tidak pernah meluber
                    transparan menimpa zona kombinasi di bawahnya. */}
                {fanPhase !== 'closed' && fanCards.length > 0 && (
                  <div
                    ref={fanRef}
                    className={`discard-fan ${fanPhase === 'open' ? 'is-open' : fanPhase === 'closing' ? 'is-closing' : 'is-entering'}`}
                    role="group"
                    aria-label="Kipas kartu buangan — ketuk kartu untuk digali"
                    style={{ '--fan-overlap': `${Math.round(fanOverlap)}px` }}
                  >
                    <button
                      type="button"
                      className="discard-fan__close"
                      onClick={() => closeFan()}
                      aria-label="Tutup bentangan buangan"
                      title="Tutup bentangan (Esc)"
                    >
                      ✕
                    </button>
                    <div className="discard-fan__cards">
                      {fanCards.map(({ card, absoluteIndex, depth, locked }, i) => {
                        const n = fanCards.length;
                        const mid = (n - 1) / 2;
                        const t = n > 1 ? i / (n - 1) : 0.5;
                        const arcAmp = fanMeasure.maxW > 0 && fanMeasure.maxW < 420 ? 10 : 18;
                        const arcY = Math.sin(Math.PI * t) * arcAmp;
                        const tilt = (i - mid) * 3.2;
                        const canDigThis = !locked && canDrawNow;
                        // Titik lahir tiap kartu = posisi tray sendiri (tray
                        // sudah di tengah tumpukan), dengan acak kecil supaya
                        // terasa seperti kartu diangkat dari tumpukan nyata.
                        const fanIn = fanPhase === 'open';
                        const pileX = ((i % 3) - 1) * 3;
                        const pileY = -6 + i * 1.6;
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
                                : `translate(${pileX}px, ${pileY.toFixed(1)}px) rotate(${pileRot.toFixed(1)}deg) scale(0.95)`,
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
            {/* Judul + pill poin SATU BARIS: hemat ~28px vertikal di bawah kotak
                kombinasi — headroom untuk kartu tangan yang terangkat. */}
            {/* Judul teks zona dihapus (terlalu padat di HP) — pill poin tetap
                jadi penanda zona. Label lengkap tetap tersedia untuk screen
                reader lewat sr-only di bawah. */}
            <div className="meld-head">
              <span className="sr-only">{isSpectator ? 'Kombinasi Meja' : 'Kombinasi Meja Kartu'}</span>
              {!isSpectator && (
                <span
                  className="count-pill count-pill--gold"
                  title={`Total nilai ${totalMelds} kartu kombinasi di meja — Joker di kombinasi bernilai +5`}
                >
                  <span className="tabular-nums">+{meldPoints} Poin</span>
                </span>
              )}
            </div>
            {isSpectator ? (
              <div className="meld-zone meld-zone--empty">
                <Icon.Eye size={16} />
                <span>Mode Penonton</span>
                <small>Kombinasi tiap pemain bisa dilihat lewat kursi masing-masing</small>
              </div>
            ) : player.melds.length === 0 && !meldPreview ? (
              <div className="meld-zone meld-zone--empty">
                <Icon.Star size={16} />
                <span>Belum ada kombinasi</span>
                <small>Kamu: turunkan min. 3 kartu sah</small>
              </div>
            ) : (
              <div className={`meld-zone ${meldCelebrate > 0 ? 'meld-zone--flash' : ''}`} key={`meld-${meldCelebrate}`}>
                <div className="meld-zone__scroll no-scrollbar">
                  {player.melds.map((meldGroup, groupIdx) => (
                    <div key={groupIdx} className="flex items-end justify-center">
                      {meldGroup.map((card, ci) => {
                        const groupMid = (meldGroup.length - 1) / 2;
                        return (
                          <div
                            key={card.uid}
                            data-meld-uid={card.uid}
                            className="w-[42px] shrink-0 rounded-[6px] mr-[-10px] last:mr-0 shadow-card"
                            style={{
                              transform: `translateY(${Math.abs(ci - groupMid) * 2}px) rotate(${(ci - groupMid) * 3}deg)`,
                              zIndex: ci,
                              // Kartu lawan yang baru turun disembunyikan sampai
                              // ghost-nya mendarat (zero-gap handoff).
                              visibility: heldMeldUids.includes(card.uid) ? 'hidden' : undefined,
                            }}
                          >
                            <CardAsset card={card} variant="mini" />
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  {meldPreview && (
                    <div className="flex items-end justify-center" aria-hidden="true">
                      {meldPreview.cards.map((card, ci) => {
                        const previewMid = (meldPreview.cards.length - 1) / 2;
                        return (
                          <div
                            key={card.uid}
                            data-meld-flight={card.uid}
                            className="w-[42px] shrink-0 rounded-[6px] mr-[-10px] last:mr-0 shadow-card"
                            style={{
                              transform: `translateY(${Math.abs(ci - previewMid) * 2}px) rotate(${(ci - previewMid) * 3}deg)`,
                              zIndex: ci,
                              visibility: heldMeldUids.includes(card.uid) ? 'hidden' : undefined,
                            }}
                          >
                            <CardAsset card={card} variant="mini" />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
            {!isSpectator && (
              <span className="sr-only" aria-live="polite">Total poin kombinasi meja: +{meldPoints}</span>
            )}
          </div>
        </div>

        {!isSpectator && (
            <div className="hand-stage">
              {/* Probe ukur: selalu ter-render (termasuk saat dealing) dengan
                  lebar token --hand-card-w, jadi overlap kipas konsisten sejak
                  ronde baru dimulai — bukan baru benar setelah kartu diminum. */}
              <span className="hand-card-probe" aria-hidden="true" />
              {dealing ? (
                <div className="text-xs text-periwinkleMuted font-medium my-auto animate-pulse">
                  Membagikan kartu…
                </div>
              ) : (
                <>
                  <div ref={handFanRef} className={`hand-fan flex items-end justify-center ${handSpread ? 'is-spread' : ''}`} role="group" aria-label="Kartu di tanganmu" style={handSpread ? { '--spread-gap': '8px' } : undefined}>
                    <HandCards
                      hand={displayHand}
                      selected={selected}
                      overlap={dynamicOverlap}
                      spread={handSpread}
                      heldUids={pendingDrawCard ? [pendingDrawCard.uid] : []}
                      hidden={handHidden}
                      peeked={peekedUids}
                      aceLocked={player.melds.length === 0}
                      onToggle={toggleCard}
                      fanRef={handFanRef}
                    />
                  </div>
                </>
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
            <div className="dock-inner w-full max-w-6xl mx-auto flex items-center gap-3 lg:gap-5">
              {/* Left: identity — avatar membuka papan peringkat meja.
                  Timer giliran diri sendiri menempel di TENGAH lingkaran
                  (sama seperti pod lawan), plus cincin progres giliran. */}
              <div className="dock-identity flex items-center gap-2.5 shrink-0 min-w-0">
                <span className={`pod-avatar-wrap dock-avatar-wrap ${isMyTurn ? 'is-active' : ''}`}>
                  {isMyTurn && secondsLeft !== null && (
                    <span
                      className={`pod-timer pod-timer--dock ${timedOut || secondsLeft <= 10 ? 'is-critical' : ''}`}
                      title={timedOut ? 'Waktu giliranmu habis' : `Sisa waktu giliranmu ${secondsLeft} detik`}
                    >
                      <span className="tabular-nums">{timedOut ? 'HABIS' : `${secondsLeft}s`}</span>
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setInfoPanel('menu')}
                    aria-label={isMyTurn && secondsLeft !== null ? `Buka peringkat meja, sisa ${secondsLeft} detik` : 'Buka peringkat meja'}
                    aria-haspopup="dialog"
                    className={`avatar-squircle-ring ${isMyTurn ? 'ring-green' : 'ring-idle'} w-11 h-11 sm:w-[52px] sm:h-[52px] shrink-0 transition hover:brightness-110 active:scale-95`}
                  >
                    {isMyTurn && (
                      <svg className="turn-ring" viewBox="0 0 100 100" aria-hidden="true">
                        <circle className="turn-ring__track" cx="50" cy="50" r="46" pathLength="100" />
                        <circle
                          className="turn-ring__fill"
                          cx="50"
                          cy="50"
                          r="46"
                          pathLength="100"
                          style={{ strokeDashoffset: 100 - Math.round(turnFraction * 100) }}
                        />
                      </svg>
                    )}
                    <div className="w-full h-full rounded-full overflow-hidden">
                      <AvatarArt avatar={mySeat?.avatar || DEFAULT_AVATAR} size={52} />
                    </div>
                  </button>
                </span>
                <div className="dock-identity-text min-w-0 leading-tight">
                  {/* Nama + badge Ronde SEJAJAR satu baris (badge di samping
                      nama, bukan di bawahnya). */}
                  <span className="dock-name-row">
                    <span className="dock-name-text">
                      {mySeat?.name || player.name || 'Kamu'}
                    </span>
                    <span className="dock-round-badge">
                      <span className="dock-round-dot" aria-hidden="true" />
                      Ronde {live.round}
                    </span>
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

              {/* Center: primary actions — Tutup/Intip pindah ke dock supaya
                  semua kontrol utama ada di satu bar jempol yang sama. */}
              <div className="dock-actions flex items-center gap-2 flex-1 min-w-0 justify-center">
                {hand.length > 0 && (
                  <button
                    type="button"
                    className={`hand-privacy-btn in-dock ${handHidden ? 'is-hidden' : ''}`}
                    onClick={() => {
                      play('turn');
                      const nextHidden = !handHidden;
                      setHandHidden(nextHidden);
                      // Kartu dibalik saat ada kartu terpilih → lepas seleksi,
                      // biar tombol Turun/Buang tidak berlaku di kartu yang tidak terlihat.
                      if (nextHidden) setSelected([]);
                      // Buka/tutup semua juga mengakhiri mode intip satu kartu.
                      setPeekedUids([]);
                    }}
                    aria-pressed={handHidden}
                    aria-label={handHidden ? 'Buka kaleng: tampilkan wajah kartu di tangan' : 'Kaleng kartu: tutup semua kartu di tangan (anti intip)'}
                    title={handHidden ? 'Tampilkan kartu di tangan' : 'Tutup kartu di tangan (anti intip)'}
                  >
                    {handHidden ? <Icon.Eye size={14} /> : <Icon.EyeClosed size={14} />}
                    <span className="hand-privacy-label">{handHidden ? 'Intip' : 'Tutup'}</span>
                  </button>
                )}
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
                {/* Slot tombol 💬 Ejek (portal dari TauntThrowSystem) — baris
                    dock yang sama dengan Tutup/Turun/Buang, kipas kartu bebas
                    dari tombol melayang. */}
                <span id="taunt-dock-slot" className="taunt-dock-slot" />
              </div>

              {/* Right: sort utilities */}
              <div className="dock-sort flex items-center gap-2.5 shrink-0">
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
                    <Icon.SpreadCards size={14} spread={!handSpread} />
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

      {/* Kilat merah + kartu Joker melayang saat penalti -150 dijatuhkan.
          Non-blocking: permainan tetap jalan, cuma umpan balik visual. */}
      {jokerShockAt > 0 && (
        <div className="joker-shock-layer" aria-hidden="true">
          <span className="joker-shock-flash" />
          <span className="joker-shock-badge">JOKER −150</span>
        </div>
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

      {/* ==================== BUMBU TONGKRONGAN & BANNER MEJA ==================== */}
      {/* Efek otomatis pembaca game (badge sisa kartu, Joker Closer, Gali
          Borongan) — read-only, tidak menyentuh state meja. */}
      <HighImpactBanners game={game} seats={seats} status={live.status} />
      {/* Ejekan & lemparan sendal: kanal sendiri (rooms/{code}/taunts atau
          BroadcastChannel lokal), FAB menempel di atas dock kanan-bawah —
          area jempol, tidak menutupi kipas kartu yang center. */}
      <TauntThrowSystem
        roomCode={live.code}
        mySeatId={isSpectator ? null : viewerId}
        players={game.players}
        fabPortalId="taunt-dock-slot"
      />
      {/* Piala turnamen: otomatis terbuka saat round-end dan ada kursi yang
          mencapai targetScore (0 = tanpa batas → tidak pernah terbuka). */}
      <GrandChampionModal
        room={live}
        targetScore={live.targetScore ?? 500}
        viewerId={viewerId}
        isHost={live.hostId === viewerId}
        onResetScores={() => send({ type: 'reset-tournament' })}
      />

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

      {/* Pilihan kombinasi gali (muncul bila ada lebih dari satu variasi sah) */}
      {digChoices && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          role="dialog" aria-modal="true" aria-label="Pilih kombinasi gali"
          onClick={() => setDigChoices(null)}
        >
          <div ref={digPanelRef} onClick={event => event.stopPropagation()} className="bg-[#1B1F38] border border-white/10 rounded-3xl p-5 max-w-md w-full max-h-[85vh] shadow-2xl flex flex-col gap-3 text-white overflow-y-auto">
            <header className="flex items-center justify-between pb-2 border-b border-white/10 sticky top-0 bg-[#1B1F38]">
              <h3 className="text-sm font-bold">Pilih Kombinasi Gali</h3>
              <button type="button" className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center" onClick={() => setDigChoices(null)} aria-label="Batal gali">
                <Icon.Close size={13} />
              </button>
            </header>
            <p className="text-[11px] text-periwinkleMuted">
              Kartu buangan bisa membentuk beberapa kombinasi (semua panjang dicantumkan). Kombinasi murni didahulukan; opsi "dengan Joker" memakai Joker dari tanganmu.
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
                    {option.usesJoker && <span className="ml-1.5 text-goldAccent">· dengan Joker</span>}
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
              <p><strong className="text-white">2. Kombinasi sah:</strong> deret 2–10 sejenis (boleh 1 Joker), J-Q-K sejenis (tanpa Joker), 3 As atau lebih kembang bebas. Min. 3 kartu — deret angka boleh lebih (sampai 2–10 penuh).</p>
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
                        <div key={c.uid} className="w-12 rounded-[3px] overflow-hidden shadow-card">
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
                                      className="w-6 sm:w-7 shrink-0 rounded-[3px] mr-[-6px] last:mr-0 shadow-card"
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
function OpponentPod({ seat, meta, offline, active, turnFraction, secondsLeft, timedOut, onInspect, compact, seatIndex, meldCount = 0, celebrating = false, drawHeld = false }) {
  const size = compact ? 46 : 64;
  const fan = Math.min(Math.max(seat.hand.length, 1), 5);
  return (
    <button
      type="button"
      className={`player-pod ${active ? 'is-active' : ''} ${meldCount > 0 ? 'has-meld' : ''} ${celebrating ? 'is-melding' : ''} ${compact ? 'is-compact' : ''}`}
      data-seat-index={seatIndex}
      onClick={onInspect}
      aria-label={`Intip kombinasi ${seat.name}${offline ? ', sedang offline' : ''}${active ? `, giliran aktif${secondsLeft !== null ? `, sisa ${secondsLeft} detik` : ''}` : ''}`}
    >
      {/* Badge dinamis (meld/offline) berada DI LUAR alur .pod-name — posisi
          absolut di sudut pod, sehingga kemunculannya tidak pernah menggeser
          pod lawan lain di strip (zero layout shift). */}
      {meldCount > 0 && (
        <span className="pod-meld-badge" title={`${meldCount} kartu sudah dikombinasikan`}>
          <Icon.Star size={9} />
          <span className="tabular-nums">{meldCount}</span>
        </span>
      )}
      {offline && <span className="pod-offline"><Icon.Offline size={10} /></span>}

      <span className="pod-name">
        <PresenceDot online={!offline} bot={seat.bot} size={8} />
        <span className="pod-name__text">{seat.name}</span>
        {seat.bot && <span className={`bot-tag ${active ? 'is-active' : ''}`}>{active ? 'AKTIF' : 'BOT'}</span>}
      </span>

      <span className={`pod-avatar-wrap ${active ? 'is-active' : ''} ${offline ? 'is-offline' : ''}`}>
        {/* Timer giliran tiap kursi: hanya tampil saat kursi ini sedang
            giliran (angka ikut hitung mundur). Menempel di avatar, tidak
            menggeser pod lain karena posisinya absolut. */}
        {active && secondsLeft !== null && (
          <span className={`pod-timer ${timedOut || secondsLeft <= 10 ? 'is-critical' : ''}`} title={`Sisa waktu giliran ${seat.name}`}>
            <Icon.Stopwatch size={9} />
            <span className="tabular-nums">{timedOut ? 'HABIS' : `${secondsLeft}s`}</span>
          </span>
        )}
        <span
          className={`avatar-squircle-ring ${active ? 'ring-green' : offline ? 'ring-red' : 'ring-idle'} ${compact ? 'w-[52px] h-[52px]' : 'w-[56px] h-[56px] sm:w-[68px] sm:h-[68px]'}`}
        >
          {active && (
            // Cincin progres giliran: lingkaran penuh (rx = 50) supaya
            // border giliran benar-benar bulat, bukan squircle.
            <svg className="turn-ring" viewBox="0 0 100 100" aria-hidden="true">
              <circle className="turn-ring__track" cx="50" cy="50" r="46" pathLength="100" />
              <circle
                className="turn-ring__fill"
                cx="50"
                cy="50"
                r="46"
                pathLength="100"
                style={{ strokeDashoffset: 100 - Math.round(turnFraction * 100) }}
              />
            </svg>
          )}
          <span className="block w-full h-full rounded-full overflow-hidden relative">
            <AvatarArt avatar={meta?.avatar || seat.name.slice(0, 1)} name={seat.name} size={size} />
          </span>
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
                // Kartu mini terakhir disembunyikan selama ghost minum masih
                // terbang — kalau tidak, kartu tampil dua kali (ghost + asli).
                visibility: drawHeld && n === fan - 1 ? 'hidden' : undefined,
              }}
            >
              <CardAsset back variant="fill" />
            </span>
          );
        })}
      </span>

      <span className="pod-points">
        <span className="tabular-nums">{meta?.score ?? 0} Poin</span>
        <span className="pod-points__sep" aria-hidden="true">•</span>
        {/* Sisa kartu 1-2 = sinyal "awas tutup". Cukup diwarnai di sini —
            tidak perlu badge melayang yang menutupi profil. */}
        <span className={`tabular-nums pod-cards-left ${seat.hand.length <= 2 ? 'is-low' : ''} ${seat.hand.length <= 1 ? 'is-critical' : ''}`}>
          {seat.hand.length <= 2 && <span aria-hidden="true">{seat.hand.length <= 1 ? '🔥' : '⚠️'} </span>}
          {seat.hand.length} kartu
        </span>
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

// Ikon kipas kartu untuk tombol Bentang/Rapat: tiga kartu yang saling
// mengipas — terbaca sebagai "bentangkan" tanpa opacity pudar seperti
// CardsPlaceholder (ikon itu khusus buangan kosong). Saat mode bentang aktif,
// ikon berubah jadi tiga kartu rapat sejajar (aksi berikutnya = Rapat).
Icon.SpreadCards = function SpreadCards({ size = 14, spread = true }) {
  if (!spread) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none">
        <rect x="4.2" y="4.6" width="7.4" height="10.6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="8.3" y="6.6" width="7.4" height="10.6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="12.4" y="8.6" width="7.4" height="10.6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none">
      <rect
        x="2.6" y="6.2" width="7.4" height="10.6" rx="1.5"
        stroke="currentColor" strokeWidth="1.5"
        transform="rotate(-16 6.3 11.5)"
      />
      <rect
        x="8.3" y="4.6" width="7.4" height="10.6" rx="1.5"
        stroke="currentColor" strokeWidth="1.5"
      />
      <rect
        x="14" y="6.2" width="7.4" height="10.6" rx="1.5"
        stroke="currentColor" strokeWidth="1.5"
        transform="rotate(16 17.7 11.5)"
      />
    </svg>
  );
};

// ===========================================================================
// FANNED HAND — memoized so the per-second game clock never re-renders cards
//
// Posisi kipas tetap milik flex + margin (satu sumber kebenaran layout),
// tetapi setiap perubahan posisi (draw, discard, meld, sort, bentang)
// dianimasikan lewat FLIP: delta posisi lama -> baru dibalik di layer
// .hand-flip lalu dilepas ke 0, sehingga kartu MERAPAT/MEMBUBA dengan mulus
// alih-alih snap. Pose (lift/tilt/grow) tetap milik wrapper via CSS vars.
// ===========================================================================
const HandCards = React.memo(function HandCards({ hand, selected, overlap, spread = false, heldUids = [], hidden = false, peeked = [], aceLocked = false, onToggle, fanRef }) {
  const total = hand.length;
  const mid = (total - 1) / 2;
  const flipPrevRef = useRef(new Map());

  useLayoutEffect(() => {
    const fan = fanRef?.current;
    if (!fan) return undefined;
    const nodes = Array.from(fan.querySelectorAll('.hand-card-wrapper'));
    const prev = flipPrevRef.current;
    const next = new Map();
    nodes.forEach(el => {
      const uid = el.dataset.uid;
      const flip = el.querySelector('[data-flip]');
      const before = prev.get(uid);
      const after = el.offsetLeft;
      next.set(uid, after);
      if (before == null || !flip || Math.abs(before - after) < 0.5) return;
      // Lanjutkan dari posisi visual saat ini supaya FLIP yang belum selesai
      // tidak melompat saat terinterupsi aksi berikutnya.
      let carry = 0;
      const matrix = getComputedStyle(flip).transform;
      const match = matrix && matrix.match(/^matrix\(([^)]+)\)$/);
      if (match) carry = parseFloat(match[1].split(',')[4]) || 0;
      const delta = carry + (before - after);
      flip.style.transition = 'none';
      flip.style.transform = Math.abs(delta) < 0.5 ? '' : `translate3d(${delta.toFixed(2)}px, 0, 0)`;
      void flip.offsetWidth;   // kunci posisi awal sebelum transisi dilepas
      flip.style.transition = '';
      flip.style.transform = '';
    });
    prev.clear();
    next.forEach((value, uid) => prev.set(uid, value));
    return undefined;
  });

  return (
    <>
      {hand.map((card, idx) => {
        // Kaleng + intip sekali: kartu menampilkan wajah juga bila ia satu yang
        // terdaftar di intip. Seleksi tetap dibekukan selama tangan dikaleng.
        const isPeeked = hidden && peeked.includes(card.uid);
        const isFaceDown = hidden && !isPeeked;
        const isSelected = !hidden && selected.includes(card.uid);
        const offset = idx - mid;
        const norm = mid === 0 ? 0 : offset / Math.max(1, mid);
        const rotateDeg = norm * (total <= 5 ? 8 : 6);
        const translateY = Math.abs(norm) * Math.abs(norm) * 14;
        return (
          <div
            key={card.uid}
            data-uid={card.uid}
            className={`hand-card-wrapper relative hand-card-size cursor-pointer ${isSelected ? 'is-selected' : ''} ${isFaceDown ? 'is-face-down' : ''} ${heldUids.includes(card.uid) ? 'is-in-flight' : ''}`}
            style={{
              marginLeft: idx === 0 ? 0 : spread ? 'var(--spread-gap, 6px)' : `-${overlap}px`,
              // Kartu diintip terangkat sedikit supaya wajahnya terbaca jelas di
              // atas kartu tetangga — perilaku visual meniru kartu terpilih.
              zIndex: isSelected ? 90 : isPeeked ? 82 : 20 + idx,
              '--lift': `${isSelected ? -28 : isPeeked ? -26 : spread ? 0 : translateY}px`,
              '--tilt': `${isSelected ? 0 : isPeeked ? 0 : spread ? 0 : rotateDeg}deg`,
              '--grow': isSelected ? 1.06 : isPeeked ? 1.04 : 1,
            }}
          >
            <div className="hand-flip" data-flip="true">
              <button
                type="button"
                className="hand-card-btn"
                onClick={() => onToggle(card)}
                aria-pressed={hidden ? isPeeked : isSelected}
                aria-label={isFaceDown
                  ? `Kartu tertutup di tangan, posisi ${idx + 1}`
                  : `Kartu ${card.value} ${card.suit || ''}${isSelected ? ', terpilih' : ''}${isPeeked ? ', sedang diintip' : ''}`}
              >
                {isFaceDown ? (
                  <CardAsset card={card} back variant="hand" />
                ) : (
                  <CardAsset card={card} variant="hand" glow={isSelected} />
                )}
              </button>
              {/* Pengingat aturan As: tanpa kombinasi di meja, As belum boleh dibuang. */}
              {aceLocked && !isFaceDown && String(card.value) === 'A' && (
                <span className="ace-lock" title="As baru boleh dibuang setelah kamu punya kombinasi di meja" aria-hidden="true">🔒</span>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
});
