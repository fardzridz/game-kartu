import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CardAsset from './CardAsset.jsx';
import { flyCard, flyDraw, flyDiscard, flyMeld, rectOf } from '../lib/cardFlight.js';
import { AvatarArt, Icon, PresenceDot, SuitIcon } from './SvgPrimitives.jsx';
import ConnectionBadgeGlobal from './ConnectionBadgeGlobal.jsx';
import { validateMeld } from '../engine/gameRules.js';
import { applyIntent, auditCards, DEFAULT_AVATAR } from '../engine/roomEngine.js';
import DigModal from './DigModal.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import CeremonyOverlay from './CeremonyOverlay.jsx';
import useFullscreen from '../hooks/useFullscreen.js';
import { play, isMuted, toggleMute } from '../sound/soundFX.js';
import { serverNow } from '../services/realtimeService.js';

// Berapa kartu teratas tumpukan buangan yang tampil sebagai tumpukan fisik.
// Kartu yang lebih dalam tetap bisa dibuka lewat dialog Riwayat.
const DISCARD_STACK_LIMIT = 4;

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
  const [inspectedPlayer, setInspectedPlayer] = useState(null);
  const [devOpen, setDevOpen] = useState(false);
  // Kartu yang sedang "di udara": ditahan tampilnya sampai mendarat (zero flicker)
  const [heldDiscard, setHeldDiscard] = useState(null);   // { uid }
  const [heldHandUids, setHeldHandUids] = useState([]);   // kartu tangan yang diterbangkan
  const [meldCelebrate, setMeldCelebrate] = useState(0);   // penanda animasi kombinasi
  const [meldCelebratePlayer, setMeldCelebratePlayer] = useState(-1);
  const thrownUids = useRef(new Set());                   // buangan yang sudah dianimasikan sendiri
  const flyingCount = useRef(0);
  const [now, setNow] = useState(() => serverNow());
  const [busy, setBusy] = useState(false);
  const [digTargetIndex, setDigTargetIndex] = useState(null);
  const [pendingDiscard, setPendingDiscard] = useState(null);
  const [muted, setMuted] = useState(isMuted());
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

  // Efek suara turn alert
  useEffect(() => {
    if (live.status === 'playing' && lastTurnRef.current !== game.turn && !dealing) {
      lastTurnRef.current = game.turn;
      if (isMyTurn) play('turn');
    }
  }, [game.turn, live.status, isMyTurn, dealing]);

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
    const count = hand.length;
    const ratio = count <= 5 ? 0.12 : count <= 7 ? 0.2 : count <= 9 ? 0.27 : count <= 11 ? 0.32 : count <= 13 ? 0.36 : 0.4;
    return Math.round(handCardW * ratio);
  }, [hand.length, handCardW]);

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

  const discardPile = game.discardPile || [];
  // Kartu buangan yang masih "di udara" (ditahan) tidak dirender dulu, supaya
  // terlihat terbang lalu mendarat — bukan muncul dua kali.
  const heldUid = heldDiscard?.uid;
  const visibleDiscard = heldUid ? discardPile.filter(c => c.uid !== heldUid) : discardPile;
  const drawPile = game.drawPile || [];
  const shownDiscards = visibleDiscard.slice(-DISCARD_STACK_LIMIT);
  const buriedCount = Math.max(0, visibleDiscard.length - shownDiscards.length);
  const totalMelds = player.melds.reduce((sum, group) => sum + group.length, 0);

  const secondsLeft = live.status === 'playing' && !dealing
    ? Math.max(0, Math.ceil((live.lastActionAt + live.turnSeconds * 1000 - now) / 1000))
    : null;
  const timedOut = secondsLeft !== null && secondsLeft <= 0;
  const turnFraction = secondsLeft !== null && live.turnSeconds
    ? Math.max(0, Math.min(1, secondsLeft / live.turnSeconds))
    : 1;

  const canDrawNow = game.phase === 'draw' && isMyTurn && !busy && !dealing;
  const canPlayNow = game.phase !== 'draw' && isMyTurn && !busy && !dealing;
  const audit = auditCards(live);

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
    // Kloningan terbang dari kartu teratas TUMPUKAN MINUM ke slot kipas tangan
    // (sebelum state berubah; slot target = kartu tangan pertama/terakhir)
    const handSlot = document.querySelector('.hand-fan .hand-card-wrapper:last-child');
    flyingCount.current += 1;
    flyDraw({
      fromEl: '.deck-stack',
      toEl: handSlot || '.hand-fan',
      card: game.drawPile[0],
      onLand: () => send({ type: 'draw' }),
      onDone: () => { flyingCount.current -= 1; setBusy(false); },
    });
    // jaring pengaman: bila callback animasi hilang (tab tidak aktif /
    // komponen remount), busy tidak boleh mengunci pemain selamanya.
    setTimeout(() => setBusy(false), 1200);
  }

  function handleDig(discardIndex) {
    if (game.phase !== 'draw' || !isMyTurn || busy || dealing) return;
    setDigTargetIndex(discardIndex);
  }

  function confirmDig(uids) {
    if (digTargetIndex === null) return;
    const discardIndex = digTargetIndex;
    const target = game.discardPile[discardIndex];
    if (!target) return;
    setBusy(true);
    play('dig');
    const landDig = () => {
      send({ type: 'dig', discardIndex, uids });
      setOrder(prev => [...prev.filter(uid => !uids.includes(uid))]);
      setSelected([]);
      setBusy(false);
      setNotice('Kartu buangan berhasil digali dan turun bersama pasangan!');
    };
    setDigTargetIndex(null);
    flyCard({
      from: rectOf('.discard-stack__slot.is-depth-1'),
      to: rectOf('[data-dropzone="meld"]'),
      card: target,
      rotateStart: -8,
      duration: 420,
      onLand: landDig,
    });
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
    const precious = cardToDiscard.kind === 'joker' || cardToDiscard.value === 'JOKER' || cardToDiscard.value === 'A';
    if (precious) {
      setPendingDiscard(cardToDiscard);
      return;
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
  const hint = meldValidation.valid
    ? { text: 'Kombinasi sah — siap Turun', tone: 'emerald' }
    : aceBlocked
      ? { text: 'As belum boleh dibuang — turunkan 1 kombinasi dulu', tone: 'danger' }
      : selected.length === 1
      ? { text: 'Siap Buang 1 kartu', tone: 'gold' }
      : selected.length > 1
        ? { text: meldValidation.reason || `${selected.length} kartu dipilih`, tone: 'gold' }
        : { text: 'Pilih kartu lalu aksi', tone: 'muted' };

  const activeName = game.players[game.turn]?.name || '-';

  return (
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
          <div
            className={`hud-pill hud-pill--emerald audit-pill ${audit.ok ? '' : 'is-bad'}`}
            title={`Audit total kartu (Alt+A): ${audit.total}/${audit.expected}${audit.ok ? '' : ' — ada selisih!'}`}
          >
            <Icon.CardStack size={14} />
            <span className="text-[11px] sm:text-xs tabular-nums">
              {audit.total}/{audit.expected}
            </span>
          </div>
        </div>

        {/* Center: active turn */}
        <div className="hud-center"><div className="turn-pill" aria-live="polite">
          <span className={`w-2 h-2 rounded-full shrink-0 ${timedOut ? 'bg-crimsonDanger' : isMyTurn ? 'bg-emeraldPrimary animate-pulse' : 'bg-goldAccent'}`} aria-hidden="true" />
          <strong className="text-[11px] sm:text-sm font-bold text-white truncate max-w-[64px] sm:max-w-[130px]">
            {activeName}
          </strong>
          <span className="hidden sm:inline text-[11px] sm:text-xs font-semibold text-periwinkleMuted whitespace-nowrap">
            {TURN_LABEL[game.phase] || 'Buang / Turun'}
          </span>
          {secondsLeft !== null && (
            <span className={`timer-chip ${secondsLeft <= 10 ? 'is-critical' : ''}`}>
              <Icon.Stopwatch size={12} />
              {timedOut ? 'HABIS' : `${secondsLeft}s`}
            </span>
          )}
        </div></div>

        {/* Right controls */}
        <div className="hud-right flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            className="icon-btn-sq"
            onClick={() => setMuted(toggleMute())}
            title={muted ? 'Nyalakan suara' : 'Bisukan suara'}
            aria-label={muted ? 'Nyalakan suara' : 'Bisukan suara'}
            aria-pressed={muted}
          >
            <Icon.Speaker muted={muted} />
          </button>
          <button
            type="button"
            className="icon-btn-sq hidden sm:grid"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Keluar layar penuh' : 'Masuk layar penuh'}
            aria-label={isFullscreen ? 'Keluar layar penuh' : 'Masuk layar penuh'}
          >
            <Icon.Fullscreen exit={isFullscreen} />
          </button>
          <button type="button" className="btn-keluar" onClick={onExit}>
            Keluar
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
          className="opponent-strip flex items-start justify-center px-2 max-w-full"
          style={{ '--pod-count': opponents.length }}
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
            <div className="discard-head">
              <span className="zone-title">Tempat Buangan ({visibleDiscard.length})</span>
              <button type="button" className="btn-riwayat" onClick={() => setHistoryOpen(true)} title="Lihat seluruh riwayat kartu buangan">
                <Icon.History size={12} />
                <span>Riwayat</span>
                {buriedCount > 0 && <span className="tabular-nums opacity-80">+{buriedCount}</span>}
              </button>
            </div>

            {shownDiscards.length === 0 ? (
              <div className="discard-stack">
                <div className="discard-stack__ghost">
                  <Icon.CardsPlaceholder />
                  <span className="text-[11px] font-bold">Buangan Kosong</span>
                </div>
              </div>
            ) : (
              <div className="discard-stack" aria-label={`Tumpukan buangan, ${discardPile.length} kartu, ${DISCARD_STACK_LIMIT} teratas tampil`}>
                {shownDiscards.map((card, offset) => {
                  const absoluteIndex = buriedCount + offset;
                  const depth = visibleDiscard.length - absoluteIndex;
                  const isLocked = depth > (live.maxDepth || 5);
                  const isTop = offset === shownDiscards.length - 1;
                  const canDigThis = !isLocked && game.phase === 'draw' && isMyTurn && !busy && !dealing;
                  const layersBelow = shownDiscards.length - 1 - offset;
                  const shift = (offset - (shownDiscards.length - 1) / 2);
                  return (
                    <button
                      key={card.uid}
                      type="button"
                      className={`discard-stack__slot ${isLocked ? 'is-locked' : 'is-diggable'} ${depth === 1 ? 'is-depth-1' : ''}`}
                      style={{
                        transform: `translate(${shift * (shownDiscards.length > 1 ? 24 : 0)}px, ${-layersBelow * 6}px) rotate(${shift === 0 ? 0 : shift * 1.4}deg)`,
                        zIndex: 10 + offset,
                      }}
                      onClick={() => canDigThis && handleDig(absoluteIndex)}
                      disabled={!canDigThis}
                      aria-label={
                        isLocked
                          ? `Kartu buangan #${depth}, terkunci (batas ${live.maxDepth || 5})`
                          : `Gali kartu buangan #${depth}`
                      }
                      title={
                        isLocked
                          ? `Terkunci: kedalaman ke-${depth} (batas ${live.maxDepth || 5})`
                          : `Klik untuk gali buangan ke-${depth}`
                      }
                    >
                      <CardAsset card={card} variant="table" dimmed={isLocked} />
                      {isTop && <span className="discard-stack__badge is-fresh">#{depth}</span>}
                      {isLocked && (
                        <span className="discard-stack__lock" aria-hidden="true">
                          <Icon.Lock size={11} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Satu aksi jelas: ambil kartu teratas (dengan pasangan), atau buang. */}
            <span className={`sub-pill discard-hint ${shownDiscards.length > 0 && canDrawNow ? 'is-live' : ''}`}>
              {shownDiscards.length === 0
                ? 'Belum ada kartu'
                : canDrawNow
                  ? 'Ketuk kartu paling atas untuk ambil'
                  : game.phase === 'draw' ? 'Menunggu giliran' : 'Sekarang: buang / turun'}
            </span>
            {shownDiscards.length > 0 && (
              <button
                type="button"
                className="discard-quick"
                disabled={!canDrawNow}
                onClick={() => handleDig(visibleDiscard.length - 1)}
                title="Ambil kartu paling atas dari buangan"
              >
                <Icon.CardsPlaceholder size={13} />
                <span>Ambil buangan teratas</span>
              </button>
            )}
            {buriedCount > 0 && (
              <span className="discard-more tabular-nums">
                {buriedCount} kartu lama — ketuk “Riwayat” bila perlu
              </span>
            )}
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
            <div className="count-pill count-pill--gold">
              <span className="tabular-nums">{totalMelds} Poin</span>
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
                <div className="hand-fan flex items-end justify-center" role="group" aria-label="Kartu di tanganmu">
                  <HandCards
                    hand={hand}
                    selected={selected}
                    overlap={dynamicOverlap}
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
              {/* Left: identity */}
              <div className="flex items-center gap-2.5 shrink-0 min-w-0">
                <div className="avatar-squircle-ring ring-green w-11 h-11 sm:w-[52px] sm:h-[52px] shrink-0">
                  <div className="w-full h-full rounded-[16px] overflow-hidden">
                    <AvatarArt avatar={mySeat?.avatar || DEFAULT_AVATAR} size={52} />
                  </div>
                </div>
                <div className="min-w-0 leading-tight hidden sm:block">
                  <span className="block text-sm font-extrabold text-white truncate max-w-[130px]">
                    {mySeat?.name || player.name || 'Kamu'}
                  </span>
                  <span className="text-[12px] text-periwinkleMuted tabular-nums">
                    {player.hand.length} kartu • <span className="text-goldAccent font-extrabold">{mySeat?.score ?? 0} poin</span>
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
                    A-Z
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
      {/* DigModal */}
      {digTargetIndex !== null && (
        <DigModal
          discardPile={discardPile}
          discardIndex={digTargetIndex}
          hand={game.players[viewerIndex]?.hand || []}
          maxDepth={live.maxDepth}
          onConfirm={confirmDig}
          onCancel={() => setDigTargetIndex(null)}
        />
      )}

      {/* ConfirmDialog for Precious Discard (Joker/Ace) */}
      <ConfirmDialog
        open={Boolean(pendingDiscard)}
        title={String(pendingDiscard?.value) === 'A' ? 'Buang As?' : 'Buang Joker? (−150 poin)'}
        message={String(pendingDiscard?.value) === 'A'
          ? 'As boleh dibuang karena kamu sudah punya kombinasi. Kalau tersisa di tangan, As dihitung −20 poin.'
          : 'Joker punya nilai −150 poin di tangan, jadi membuangnya tidak menyelamatkan skor. Lebih baik dipakai sebagai pengganti angka di kombinasi.'}
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

      {/* HistoryModal */}
      {historyOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Riwayat Buangan">
          <div className="bg-[#1B1F38] border border-white/10 rounded-3xl p-5 sm:p-6 max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl">
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
          <div className="bg-[#1B1F38] border border-white/10 rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
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
  );
}

// ===========================================================================
// OPPONENT POD (Plato/Durak squircle avatar)
// ===========================================================================
function OpponentPod({ seat, meta, offline, active, turnFraction, onInspect, compact, seatIndex, meldCount = 0, celebrating = false }) {
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
        className={`avatar-squircle-ring ${active ? 'ring-green' : 'ring-red'} ${compact ? 'w-[52px] h-[52px]' : 'w-[56px] h-[56px] sm:w-[68px] sm:h-[68px]'}`}
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
const HandCards = React.memo(function HandCards({ hand, selected, overlap, heldUids = [], onToggle }) {
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
              marginLeft: idx === 0 ? 0 : `-${overlap}px`,
              marginRight: idx === total - 1 ? 0 : `-${overlap}px`,
              zIndex: isSelected ? 90 : 20 + idx,
              '--lift': `${isSelected ? -28 : translateY}px`,
              '--tilt': `${isSelected ? 0 : rotateDeg}deg`,
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
