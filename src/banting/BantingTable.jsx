import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import CardSVG from '../components/CardSVG.jsx';
import { AvatarArt, Icon } from '../components/SvgPrimitives.jsx';
import {
  bantingActions,
  comboLabel,
} from './bantingEngine.js';
import { canBeat, describeCombo, sortCards } from './hands.js';
import { vibrate } from '../utils/haptics.js';
import useBantingChat from './useBantingChat.js';
import { ChatDrawer, ScoreDrawer } from './BantingDrawer.jsx';
import { flyMeld, measurePose } from '../lib/cardFlight.js';
import { play } from '../sound/soundFX.js';

function useIsNarrow(breakpoint = 821) {
  const [narrow, setNarrow] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
  ));
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const update = () => setNarrow(window.innerWidth < breakpoint);
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    const query = window.matchMedia?.(`(max-width: ${breakpoint - 1}px)`);
    query?.addEventListener?.('change', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      query?.removeEventListener?.('change', update);
    };
  }, [breakpoint]);
  return narrow;
}

function SeatNode({ seat, seatIndex, player, isTurn, passed, finished, style, deadline, turnSeconds, now, place, compact, justPlayed }) {
  const remaining = Math.max(0, (deadline || 0) - now);
  const ratio = deadline ? Math.max(0, Math.min(1, remaining / Math.max(1, turnSeconds * 1000))) : 0;
  const secondsLeft = deadline ? Math.ceil(remaining / 1000) : null;
  const cards = player ? player.hand.length : 0;
  const avatarSize = compact ? 42 : 54;
  const isUrgent = remaining <= 10000;

  return (
    <div
      className={`player-pod banting-pod ${isTurn ? 'is-active' : ''} ${finished ? 'is-folded' : ''} ${justPlayed ? 'is-melding' : ''} ${seat.online === false ? 'is-offline' : ''} ${passed ? 'is-passed' : ''}`}
      style={style}
      data-seat-index={seatIndex}
      data-player-id={seat.id}
    >
      <div className="pod-name">
        <span className={`w-2 h-2 rounded-full ${seat.online === false ? 'bg-crimsonText' : 'bg-emeraldPrimary'}`} aria-hidden="true" />
        <span className="pod-name__text">{seat.name}</span>
        {seat.bot && <span className={`bot-tag ${isTurn ? 'is-active' : ''}`}>Bot</span>}
      </div>

      <div className="pod-avatar-wrap">
        {isTurn && secondsLeft !== null && !passed && (
          <span className={`pod-timer ${isUrgent ? 'is-critical' : ''}`}>
            <Icon.Stopwatch size={9} />
            <span className="tabular-nums">{secondsLeft}s</span>
          </span>
        )}
        <div className={`avatar-squircle-ring ${isTurn ? 'ring-green' : seat.online === false ? 'ring-red' : 'ring-idle'}`} style={{ width: avatarSize, height: avatarSize }}>
          {isTurn && !passed && (
            <svg className="turn-ring" viewBox="0 0 100 100" aria-hidden="true">
              <circle className="turn-ring__track" cx="50" cy="50" r="46" pathLength="100" />
              <circle
                className="turn-ring__fill"
                cx="50"
                cy="50"
                r="46"
                pathLength="100"
                style={{ strokeDashoffset: 100 - Math.round(ratio * 100) }}
              />
            </svg>
          )}
          <div className="w-full h-full rounded-full overflow-hidden relative">
            <AvatarArt avatar={seat.avatar} size={avatarSize} />
          </div>
        </div>
      </div>

      <div className="banting-pod__meta">
        <span className="banting-chip-pill">
          <span className="banting-mini-card-icon" aria-hidden="true">🂠</span>
          {cards} kartu
        </span>
        {finished && <span className="poker-seat__state poker-seat__state--win">🏆 MENANG{place ? ` #${place}` : ''}</span>}
        {!finished && passed && <span className="poker-seat__state poker-seat__state--passed">LEWAT</span>}
      </div>
    </div>
  );
}

export default function BantingTable({ room, viewerId, now, onIntent, onExit, onCopyInvite }) {
  const narrow = useIsNarrow();
  const hand = room.hand;
  const seats = room.seats || [];
  const mySeatIndex = seats.findIndex(seat => seat.id === viewerId);
  const me = mySeatIndex >= 0 ? seats[mySeatIndex] : null;
  const myPlayer = hand ? (hand.players || []).find(player => player.id === viewerId) : null;
  const actions = bantingActions(room, viewerId);
  const [selected, setSelected] = useState([]);
  const [drawer, setDrawer] = useState(null);
  // Urutan kartu di tangan (uid). null = urut otomatis (nilai tertinggi dulu).
  const [order, setOrder] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [flash, setFlash] = useState(false);
  const dragRef = useRef(null);
  // Urutan kartu saat pertama muncul, dipakai untuk jeda animasi bagi kartu.
  // Disimpan per uid supaya menggeser kartu tidak mengubah jeda (kalau jeda
  // berubah, animasi CSS bisa "mundur" dan kartu jadi tak terlihat).
  const dealIndexRef = useRef(new Map());
  // Setelah geser kartu, klik yang menyusul harus diabaikan (biar tidak ikut
  // memilih kartu). Tombol tetap punya onClick supaya bisa dipakai keyboard.
  const suppressClickRef = useRef(false);
  const [tip, setTip] = useState(() => {
    try { return !localStorage.getItem('banting-tip'); } catch { return false; }
  });

  useEffect(() => { setSelected([]); }, [hand?.turnSeat, hand?.no, hand?.lastPlay?.at]);

  useEffect(() => { dealIndexRef.current.clear(); }, [hand?.no]);

  // Kilau meja singkat setiap ada kombinasi baru turun.
  useEffect(() => {
    if (!hand?.lastPlay?.at) return undefined;
    setFlash(true);
    const timer = setTimeout(() => setFlash(false), 900);
    return () => clearTimeout(timer);
  }, [hand?.lastPlay?.at]);

  const [unbeatableBanner, setUnbeatableBanner] = useState(null);
  const [screenShake, setScreenShake] = useState(false);
  const [heldPlayAt, setHeldPlayAt] = useState(null);
  const prevPlayFlightRef = useRef(null);

  const lastPlayAt = hand?.lastPlay?.at;
  const prevPlayAt = hand?.prevPlay?.at;
  const isUnbeatableMove = Boolean(hand?.lastPlay?.unbeatable || hand?.prevPlay?.unbeatable);
  const activeUnbeatablePlay = hand?.lastPlay?.unbeatable ? hand.lastPlay : (hand?.prevPlay?.unbeatable ? hand.prevPlay : null);

  useEffect(() => {
    if (!isUnbeatableMove || !activeUnbeatablePlay) return undefined;
    setUnbeatableBanner(activeUnbeatablePlay);
    setScreenShake(true);
    vibrate(30);
    const shakeTimer = setTimeout(() => setScreenShake(false), 600);
    const bannerTimer = setTimeout(() => setUnbeatableBanner(null), 1800);
    return () => {
      clearTimeout(shakeTimer);
      clearTimeout(bannerTimer);
    };
  }, [lastPlayAt, prevPlayAt, isUnbeatableMove, activeUnbeatablePlay]);

  // Animasi fisik terbang kartu (Zero-Gap Physical Handoff) saat kombinasi dibanting ke meja
  useLayoutEffect(() => {
    if (typeof document === 'undefined') return;
    const playData = hand?.lastPlay;
    if (!playData || !playData.cards?.length) return;
    if (prevPlayFlightRef.current === playData.at) return;
    prevPlayFlightRef.current = playData.at;

    const isSelf = playData.playerId === viewerId;
    let fromEl = null;
    if (isSelf) {
      fromEl = document.querySelector('.banting-hand');
    } else {
      fromEl = document.querySelector(`[data-player-id="${CSS.escape(String(playData.playerId))}"]`);
    }

    const fromPose = measurePose(fromEl) || {
      x: window.innerWidth / 2,
      y: isSelf ? window.innerHeight - 60 : 80,
      w: 48,
      h: 70,
      angle: 0,
      scale: 1,
    };

    const playEl = document.querySelector('.banting-play');
    const toPose = measurePose(playEl) || measurePose('.banting-center') || {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      w: 52,
      h: 75,
      angle: 0,
      scale: 1,
    };

    setHeldPlayAt(playData.at);

    const cards = playData.cards;
    const mid = (cards.length - 1) / 2;
    const cardW = Math.min(52, Math.max(34, Math.round((toPose.w || 200) / Math.max(cards.length, 1))));
    const cardH = Math.round(cardW * 1.453);

    flyMeld({
      fromEls: cards.map(() => fromPose),
      toEls: cards.map((_, i) => ({
        x: toPose.x + (i - mid) * Math.round(cardW * 0.8),
        y: toPose.y,
        w: cardW,
        h: cardH,
        angle: (i - mid) * 3,
        scale: 1,
      })),
      cards,
      gap: 40,
      onEachLand: () => play('deal'),
      onAllLand: () => {
        setHeldPlayAt(null);
        play(cards.length > 2 ? 'meld' : 'discard');
        if (playData.unbeatable) {
          play('joker');
        }
      },
    });
  }, [hand?.lastPlay, hand?.lastPlay?.at, hand?.lastPlay?.playerId, hand?.lastPlay?.cards, viewerId]);

  // Audio cue giliran lokal
  const wasTurnRef = useRef(false);
  useEffect(() => {
    if (actions.isTurn && !wasTurnRef.current) {
      play('turn');
      vibrate(14);
    }
    wasTurnRef.current = actions.isTurn;
  }, [actions.isTurn]);

  // Audio cue awal pembagian ronde
  const prevHandNoRef = useRef(null);
  useEffect(() => {
    if (hand?.no && prevHandNoRef.current !== hand.no) {
      prevHandNoRef.current = hand.no;
      play('shuffle');
      setTimeout(() => play('deal'), 350);
    }
  }, [hand?.no]);

  const chat = useBantingChat({
    roomCode: room.code,
    viewerId,
    myName: me?.name || '',
    myAvatar: me?.avatar || '',
  });

  const ring = useMemo(() => {
    const total = seats.length;
    if (!total) return [];
    const start = mySeatIndex >= 0 ? mySeatIndex : -1;
    const order = [];
    for (let step = 1; step <= total; step += 1) {
      order.push(start < 0 ? step - 1 : (start + step) % total);
    }
    return order;
  }, [seats.length, mySeatIndex]);

  const heroIndexInRing = ring.indexOf(mySeatIndex);
  const opponents = ring.filter(index => index !== mySeatIndex);

  const sortedHand = useMemo(() => (myPlayer ? sortCards(myPlayer.hand) : []), [myPlayer]);

  // Urutan kartu: kalau pemain sudah menggeser-geser (drag), pakai urutan itu.
  // Kartu baru (hasil minum) atau kartu yang hilang menyesuaikan sendiri.
  const myHand = useMemo(() => {
    if (!order || !order.length) return sortedHand;
    const byUid = new Map(sortedHand.map(card => [card.uid, card]));
    const kept = order.map(uid => byUid.get(uid)).filter(Boolean);
    const seen = new Set(kept.map(card => card.uid));
    const rest = sortedHand.filter(card => !seen.has(card.uid));
    return [...kept, ...rest];
  }, [sortedHand, order]);
  const selectedCards = useMemo(
    () => myHand.filter(card => selected.includes(card.uid)),
    [myHand, selected],
  );
  const selectedCombo = useMemo(
    () => (selectedCards.length ? describeCombo(selectedCards) : null),
    [selectedCards],
  );
  const lastCombo = hand?.lastPlay?.combo || null;
  const beatCheck = useMemo(() => {
    if (!selectedCombo) return null;
    return canBeat(selectedCombo, lastCombo, { fiveAnyCategory: room.settings?.fiveAnyCategory !== false });
  }, [selectedCombo, lastCombo, room.settings]);

  const canPlay = Boolean(actions.isTurn) && selectedCards.length > 0 && Boolean(beatCheck?.ok);
  const turnSeat = hand && hand.turnSeat >= 0 ? seats[hand.turnSeat] : null;
  const remaining = hand ? Math.max(0, (hand.deadline || 0) - now) : 0;
  const turnRatio = hand ? Math.max(0, Math.min(1, remaining / Math.max(1, (room.settings?.turnSeconds || 30) * 1000))) : 0;

  const toggleCard = uid => {
    if (!actions.isTurn) return;
    vibrate(8);
    setSelected(prev => (prev.includes(uid) ? prev.filter(item => item !== uid) : [...prev, uid]));
  };

  /** Pindahkan kartu `uid` ke posisi index ke-`index` di tangan. */
  const moveToIndex = (uid, index) => {
    setOrder(prev => {
      const base = (prev && prev.length ? prev : myHand.map(card => card.uid)).slice();
      const from = base.indexOf(uid);
      if (from < 0) return base;
      const target = Math.max(0, Math.min(base.length - 1, index));
      if (from === target) return base;
      base.splice(from, 1);
      base.splice(target, 0, uid);
      return base;
    });
  };

  /** Jeda animasi bagi kartu: dihitung sekali per uid, tidak berubah saat digeser. */
  const dealDelayFor = (uid, index) => {
    if (!dealIndexRef.current.has(uid)) dealIndexRef.current.set(uid, dealIndexRef.current.size || index);
    return dealIndexRef.current.get(uid);
  };

  const onCardPointerDown = (event, uid) => {
    dragRef.current = {
      uid,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onCardPointerMove = event => {
    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.active) {
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (Math.hypot(dx, dy) < 8) return; // masih dianggap ketuk
      drag.active = true;
      setDragging(drag.uid);
      vibrate(10);
    }
    event.preventDefault();

    // Cari slot terdekat dari posisi jari: bandingkan ke titik tengah tiap
    // kartu. Setelah kartu pindah, kartu terdekat adalah dirinya sendiri,
    // jadi tidak ada bolak-balik (jitter).
    const nodes = [...document.querySelectorAll('.banting-hand .banting-card')];
    let best = -1;
    let bestDistance = Infinity;
    nodes.forEach((node, index) => {
      const rect = node.getBoundingClientRect();
      const dx = event.clientX - (rect.x + rect.width / 2);
      const dy = event.clientY - (rect.y + rect.height / 2);
      const distance = Math.hypot(dx, dy);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    if (best >= 0) {
      const currentIndex = nodes.findIndex(node => node.dataset.uid === drag.uid);
      if (best !== currentIndex) {
        moveToIndex(drag.uid, best);
        vibrate(5);
      }
    }
  };

  const endCardDrag = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragging(null);
    // Geseran selesai → klik yang menyusul jangan sampai memilih kartu.
    if (drag?.active) suppressClickRef.current = true;
  };

  const onCardClick = uid => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    toggleCard(uid);
  };

  const submitPlay = () => {
    if (!canPlay) return;
    vibrate(16);
    play('discard');
    onIntent({ type: 'play', cards: selected });
    setSelected([]);
    if (tip) dismissTip();
  };

  const dismissTip = () => {
    setTip(false);
    try { localStorage.setItem('banting-tip', '1'); } catch { /* abaikan */ }
  };

  const seatStyle = index => {
    const total = Math.max(seats.length, 2);
    const position = heroIndexInRing >= 0 ? ring.indexOf(index) : index;
    const angle = (90 + (360 * (position + 1)) / total) * (Math.PI / 180);
    return { left: `${50 + 41 * Math.cos(angle)}%`, top: `${50 + 37 * Math.sin(angle)}%` };
  };

  const manyOpponents = opponents.length > 3;

  const seatNode = (seatIndex, style) => {
    const seat = seats[seatIndex];
    if (!seat) return null;
    const player = hand ? (hand.players || []).find(item => item.seat === seatIndex) : null;
    const place = player?.finished ? (hand.finishOrder || []).indexOf(player.id) + 1 : 0;
    const isPassed = (hand?.passed || []).includes(seat.id);
    return (
      <SeatNode
        key={seat.id}
        seat={seat}
        seatIndex={seatIndex}
        player={player}
        isTurn={Boolean(hand) && hand.turnSeat === seatIndex && room.status === 'playing' && !isPassed}
        passed={isPassed}
        finished={Boolean(player?.finished)}
        style={style}
        deadline={hand?.deadline}
        turnSeconds={room.settings?.turnSeconds || 30}
        now={now}
        place={place}
        compact={narrow && manyOpponents}
        justPlayed={Boolean(hand?.lastPlay)
          && hand.lastPlay.seat === seatIndex
          && now - (hand.lastPlay.at || 0) < 1500}
      />
    );
  };

  const lastPlay = hand?.lastPlay;

  const fabButtons = (
    <>
      <button type="button" className="poker-fab__btn" onClick={() => setDrawer('chat')} aria-label="Buka obrolan meja">
        <Icon.Chat size={15} />
        {chat.unread > 0 && <span className="poker-fab__badge">{chat.unread > 9 ? '9+' : chat.unread}</span>}
      </button>
      <button type="button" className="poker-fab__btn" onClick={() => setDrawer('score')} aria-label="Buka papan skor dan aturan">
        <Icon.Trophy size={15} />
      </button>
    </>
  );

  return (
    <div className="poker-body">
      {!narrow && (
        <div className="poker-fab">
          {fabButtons}
        </div>
      )}

      <div className="poker-table-wrap banting-wrap">
        {narrow && (
          <div className={`poker-rail banting-rail ${manyOpponents ? 'banting-rail--many' : ''}`}>
            {opponents.map(index => seatNode(index))}
          </div>
        )}
        <div className={`poker-felt banting-felt ${flash ? 'is-flash' : ''} ${screenShake ? 'is-shaking' : ''}`}>
          {!narrow && opponents.map(index => seatNode(index, seatStyle(index)))}
          <div
            key={`${hand?.no}-${lastPlay ? lastPlay.at : `round-${hand?.rev}`}`}
            className={`banting-center ${lastPlay || hand?.phase === 'opening' ? '' : 'is-round'}`}
          >
            {unbeatableBanner && (
              <div className="banting-unbeatable-banner">
                <span className="banting-unbeatable-banner__icon">🔥</span>
                <div className="banting-unbeatable-banner__text">
                  <span className="banting-unbeatable-banner__title">KARTU 2 SAKTI!</span>
                  <span className="banting-unbeatable-banner__sub">Auto-Win Ronde · Meja Di-reset</span>
                </div>
              </div>
            )}
            {hand?.phase === 'opening' ? (
              <div className="banting-opening">
                <span className="banting-center__who">Fase Setor Kartu 3</span>
                {(hand.opening || []).length === 0 && (
                  <span className="banting-center__combo">Pilih kartu 3 di tangan lalu tekan SETOR…</span>
                )}
                {(hand.opening || []).map(entry => (
                  <span key={entry.id} className="banting-opening__row">
                    <span className="banting-opening__name">{entry.name}</span>
                    <span className="banting-play">
                      {entry.cards.map(card => (
                        <span key={card.uid} className="banting-play__card banting-play__card--opening">
                          <CardSVG card={card} />
                        </span>
                      ))}
                    </span>
                  </span>
                ))}
              </div>
            ) : lastPlay ? (
              <>
                <span className="banting-center__who">
                  {lastPlay.name} menaruh
                  {(hand.players || []).find(item => item.id === lastPlay.playerId)?.finished ? ' · sudah habis' : ''}
                </span>
                <span className={`banting-play ${heldPlayAt === lastPlay.at ? 'is-in-flight' : ''}`}>
                  {lastPlay.cards.map((card, cardIndex) => (
                    <span key={card.uid} className="banting-play__card" style={{ '--i': cardIndex }}>
                      <CardSVG card={card} />
                    </span>
                  ))}
                </span>
                <span className="banting-center__combo">
                  {lastPlay.combo.label}
                  <em>{comboLabel(lastPlay.cards)}</em>
                </span>
              </>
            ) : hand?.prevPlay ? (
              <div className="banting-prev-play">
                <span className="banting-center__who banting-center__who--prev">
                  🏆 {hand.prevPlay.name} menang ronde ini (semua lewat)
                </span>
                <span className="banting-play banting-play--prev">
                  {hand.prevPlay.cards.map((card, cardIndex) => (
                    <span key={card.uid} className="banting-play__card banting-play__card--prev" style={{ '--i': cardIndex }}>
                      <CardSVG card={card} />
                    </span>
                  ))}
                </span>
                <span className="banting-center__combo banting-center__combo--prev">
                  {hand.prevPlay.combo.label} · Ronde Baru
                  <em>{turnSeat ? `${turnSeat.name} buka kombinasi bebas` : '—'}</em>
                </span>
              </div>
            ) : (
              <>
                <span className="banting-center__who">
                  {room.status === 'playing' ? 'Ronde baru' : 'Permainan selesai'}
                </span>
                <span className="banting-center__combo">
                  {turnSeat ? `${turnSeat.name} buka dengan kombinasi apa saja` : '—'}
                </span>
              </>
            )}
            {room.status === 'playing' && turnSeat && (
              <span className="banting-center__turn">Giliran {turnSeat.name}</span>
            )}
          </div>
        </div>
      </div>

      <div className="glass-hud poker-hero banting-hero">
        <div className="dock-inner w-full max-w-6xl mx-auto flex flex-col gap-2">
          <div className="banting-hand-row">
            <div className={`banting-hand ${selected.length ? 'has-selection' : ''} ${actions.isTurn ? 'is-tappable' : ''}`}>
              {myHand.length === 0 && (
                <span className="poker-hero__hint">
                  {myPlayer?.finished ? 'Kartumu sudah habis — kamu menang! 🎉' : 'Kamu penonton di meja ini.'}
                </span>
              )}
              {myHand.map((card, cardIndex) => {
                const isSelected = selected.includes(card.uid);
                return (
                  <button
                    key={card.uid}
                    type="button"
                    data-uid={card.uid}
                    style={{ animationDelay: `${Math.min(dealDelayFor(card.uid, cardIndex), 16) * 26}ms` }}
                    className={`banting-card ${isSelected ? 'is-selected' : ''} ${actions.isTurn ? 'is-tappable' : ''} ${dragging === card.uid ? 'is-dragging' : ''}`}
                    onPointerDown={event => onCardPointerDown(event, card.uid)}
                    onPointerMove={onCardPointerMove}
                    onPointerUp={endCardDrag}
                    onPointerCancel={endCardDrag}
                    onClick={() => onCardClick(card.uid)}
                    aria-pressed={isSelected}
                    aria-disabled={!actions.isTurn}
                    aria-label={`${card.value} ${card.suit}${isSelected ? ' (dipilih)' : ''}`}
                  >
                    <CardSVG card={card} />
                    {isSelected && <span className="banting-card__check" aria-hidden="true">✓</span>}
                  </button>
                );
              })}
            </div>
            
            <div className="dock-identity flex items-center gap-2.5 shrink-0 min-w-0">
              <span className={`pod-avatar-wrap dock-avatar-wrap ${actions.isTurn ? 'is-active' : ''}`}>
                {actions.isTurn && remaining > 0 && (
                  <span className={`pod-timer pod-timer--dock ${remaining <= 10000 ? 'is-critical' : ''}`}>
                    <span className="tabular-nums">{Math.ceil(remaining / 1000)}s</span>
                  </span>
                )}
                <div className={`avatar-squircle-ring ${actions.isTurn ? 'ring-green' : 'ring-idle'} w-11 h-11 shrink-0`}>
                  {actions.isTurn && (
                    <svg className="turn-ring" viewBox="0 0 100 100" aria-hidden="true">
                      <circle className="turn-ring__track" cx="50" cy="50" r="46" pathLength="100" />
                      <circle
                        className="turn-ring__fill"
                        cx="50"
                        cy="50"
                        r="46"
                        pathLength="100"
                        style={{ strokeDashoffset: 100 - Math.round(turnRatio * 100) }}
                      />
                    </svg>
                  )}
                  <div className="w-full h-full rounded-full overflow-hidden">
                    <AvatarArt avatar={me?.avatar || 'finn'} size={44} />
                  </div>
                </div>
              </span>
              <div className="dock-identity-text min-w-0 leading-tight">
                <span className="dock-name-row flex items-center gap-1.5">
                  <span className="dock-name-text font-bold text-xs truncate">{me?.name || 'Kamu'}</span>
                  <span className="dock-round-badge text-[10px] px-1.5 py-0.5 rounded bg-emeraldPrimary/20 text-emeraldPrimary font-bold">
                    Ronde {hand?.no || 1}
                  </span>
                </span>
                <span className="text-[11px] text-periwinkleMuted tabular-nums block">
                  {myHand.length} kartu di tangan
                </span>
              </div>
              <div className="banting-fab-inline flex items-center gap-1 ml-auto">{fabButtons}</div>
            </div>
          </div>

        {room.status === 'playing' && (
          <div className="poker-timer">
            <div className="poker-timer__fill" style={{ width: `${turnRatio * 100}%` }} />
          </div>
        )}

        {tip && hand?.phase !== 'opening' && (
          <div className="banting-tip">
            <span>
              Ketuk kartu untuk memilih (boleh beberapa), lalu tekan <b>MAIN</b>. Geser kartu
              untuk mengatur urutannya. Kalau kombinasinya belum bisa menimpa, alasannya muncul
              di bawah kartu.
            </span>
            <button type="button" className="banting-tip__ok" onClick={dismissTip}>OK</button>
          </div>
        )}

        {selectedCards.length > 0 && beatCheck && !beatCheck.ok && (
          <div className="banting-warn">
            {beatCheck.reason}
            {lastPlay ? ` (meja: ${comboLabel(lastPlay.cards)})` : ''}
          </div>
        )}

        {actions.canShowThrees ? (
          <div className="poker-actions">
            <button
              type="button"
              className="poker-btn poker-btn--check poker-btn--wide"
              onClick={() => { vibrate(16); onIntent({ type: 'showThrees' }); }}
            >
              SETOR {actions.myThrees.length} KARTU 3 🃏
              <span className="poker-btn__sub">lempar ke meja penentuan pembuka</span>
            </button>
          </div>
        ) : actions.canPassThrees ? (
          <div className="poker-actions">
            <button
              type="button"
              className="poker-btn poker-btn--ghost poker-btn--wide"
              onClick={() => { vibrate(8); onIntent({ type: 'passThrees' }); }}
            >
              TIDAK PUNYA 3 / LEWAT
              <span className="poker-btn__sub">konfirmasi tidak memegang kartu 3</span>
            </button>
          </div>
        ) : actions.phase === 'opening' && actions.alreadyConfirmedThrees ? (
          <div className="poker-wait">
            ⏳ Kartu 3 sudah dikonfirmasi — Menunggu pemain lain menyetor...
          </div>
        ) : actions.hasPassed ? (
          <div className="poker-wait banting-wait--passed">
            🚫 Kamu LEWAT di ronde ini — Menunggu ronde baru...
          </div>
        ) : actions.isTurn ? (
          <div className="poker-actions">
            {selected.length > 0 && (
              <button
                type="button"
                className="banting-actions__clear"
                onClick={() => { vibrate(6); setSelected([]); }}
                aria-label="Hapus pilihan kartu"
              >
                ✕
              </button>
            )}
            <button
              type="button"
              className="poker-btn poker-btn--ghost"
              onClick={() => { vibrate(6); setSelected([]); onIntent({ type: 'skip' }); }}
              disabled={!actions.canSkip}
            >
              SKIP
              <span className="poker-btn__sub">{actions.canSkip ? 'keluar ronde ini' : 'kamu yang buka'}</span>
            </button>
            <button
              type="button"
              className="poker-btn poker-btn--check poker-btn--wide"
              onClick={submitPlay}
              disabled={!canPlay}
            >
              MAIN{selectedCards.length ? ` ${selectedCards.length} KARTU` : ''}
              <span className="poker-btn__sub">
                {selectedCombo
                  ? (beatCheck?.ok ? selectedCombo.label : 'belum bisa menimpa')
                  : 'ketuk kartu untuk dipilih'}
              </span>
            </button>
          </div>
        ) : (
          <div className="poker-wait">
            {room.status !== 'playing' ? 'Permainan selesai.'
              : actions.phase === 'opening'
                ? 'Fase setor kartu 3 — menentukan siapa yang membuka ronde pertama...'
                : myPlayer?.finished
                  ? 'Kartumu habis — kamu menang! 🎉 Menunggu pemain lain.'
                  : turnSeat ? `Menunggu giliran ${turnSeat.name}…` : 'Menunggu pemain lain…'}
          </div>
        )}
        </div>
      </div>

      {(room.status === 'round-end') && (
        <ResultOverlay room={room} viewerId={viewerId} onIntent={onIntent} onExit={onExit} onCopyInvite={onCopyInvite} />
      )}

      <ChatDrawer open={drawer === 'chat'} onClose={() => setDrawer(null)} chat={chat} myName={me?.name || ''} />
      <ScoreDrawer open={drawer === 'score'} onClose={() => setDrawer(null)} room={room} viewerId={viewerId} />
    </div>
  );
}

function ResultOverlay({ room, viewerId, onIntent, onExit, onCopyInvite }) {
  const result = room.lastResult;
  const isHost = room.hostId === viewerId;
  const ranking = result?.ranking || [];
  const winner = ranking[0];
  const loser = ranking.find(entry => entry.loser);

  return (
    <div className="poker-overlay" role="dialog" aria-modal="true">
      <div className="poker-panel">
        <div className="poker-panel__title">
          <Icon.Trophy size={17} /> {winner?.name || 'Pemain'} habis kartunya!
        </div>
        <div className="poker-panel__sub">
          {loser ? `${loser.name} masih pegang kartu paling akhir — dia yang kalah. 😅` : 'Permainan selesai.'}
        </div>

        <div className="poker-seat-list">
          {ranking.map(entry => (
            <div key={entry.id} className={`poker-seat-row ${entry.loser ? '' : 'is-me'}`}>
              <span className="poker-rank">{entry.place}</span>
              <span style={{ minWidth: 0 }}>
                <span className="poker-seat-row__name">
                  {entry.name}{entry.id === viewerId ? ' (kamu)' : ''}
                </span>
                <span className="poker-seat-row__meta" style={{ display: 'block' }}>
                  {entry.loser ? 'kalah — masih pegang kartu' : 'kartunya habis'}
                </span>
              </span>
              <span className="poker-seat-row__right">
                <span className={`banting-badge ${entry.loser ? 'banting-badge--lose' : 'banting-badge--win'}`}>
                  {entry.loser ? 'KALAH' : 'MENANG'}
                </span>
              </span>
            </div>
          ))}
        </div>

        <div className="poker-actions">
          <button type="button" className="poker-btn poker-btn--check poker-btn--wide" onClick={() => onIntent({ type: 'toLobby' })}>
            KEMBALI KE LOBBY
          </button>
          <button type="button" className="poker-btn poker-btn--ghost" onClick={() => onIntent({ type: 'next' })}>
            LANGSUNG MAIN LAGI
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, width: '100%' }}>
          <button type="button" className="poker-btn poker-btn--ghost" onClick={isHost ? () => onIntent({ type: 'restart' }) : onCopyInvite} style={{ flex: 1, minHeight: 38 }}>
            {isHost ? 'RESET SKOR' : 'BAGIKAN KODE'}
          </button>
          <button type="button" className="poker-btn poker-btn--ghost" onClick={onExit} style={{ flex: 1, minHeight: 38 }}>
            KELUAR
          </button>
        </div>
      </div>
    </div>
  );
}
