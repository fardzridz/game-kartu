import React, { useEffect, useMemo, useState } from 'react';
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

function SeatNode({ seat, player, isTurn, passed, finished, style, deadline, turnSeconds, now, place, compact }) {
  const remaining = Math.max(0, (deadline || 0) - now);
  const ratio = deadline ? Math.max(0, Math.min(1, remaining / Math.max(1, turnSeconds * 1000))) : 0;
  const cards = player ? player.hand.length : 0;

  return (
    <div
      className={`poker-seat banting-seat ${isTurn ? 'is-turn' : ''} ${finished ? 'is-folded' : ''} ${seat.online === false ? 'is-offline' : ''}`}
      style={style}
    >
      <div className="poker-seat__top">
        <span className="poker-seat__avatar">
          <AvatarArt avatar={seat.avatar} size={compact ? 26 : 34} />
        </span>
        <span className="poker-seat__meta">
          <span className="poker-seat__name">{seat.name}</span>
          <span className="poker-seat__chips">{cards} kartu</span>
        </span>
      </div>
      <span className="banting-fan" aria-hidden="true">
        {Array.from({ length: Math.min(cards, 7) }).map((_, index) => (
          <span key={index} className="banting-fan__card" />
        ))}
      </span>
      {isTurn && deadline ? (
        <span className="poker-timer" style={{ width: '88%', marginTop: 3 }}>
          <span className="poker-timer__fill" style={{ width: `${ratio * 100}%` }} />
        </span>
      ) : null}
      {finished && <span className="poker-seat__state poker-seat__state--win">HABIS{place ? ` #${place}` : ''}</span>}
      {!finished && passed && <span className="poker-seat__state">LEWAT</span>}
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
  const [tip, setTip] = useState(() => {
    try { return !localStorage.getItem('banting-tip'); } catch { return false; }
  });

  useEffect(() => { setSelected([]); }, [hand?.turnSeat, hand?.no, hand?.lastPlay?.at]);

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

  const myHand = useMemo(() => (myPlayer ? sortCards(myPlayer.hand) : []), [myPlayer]);
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

  const submitPlay = () => {
    if (!canPlay) return;
    vibrate(16);
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
    return (
      <SeatNode
        key={seat.id}
        seat={seat}
        player={player}
        isTurn={Boolean(hand) && hand.turnSeat === seatIndex && room.status === 'playing'}
        passed={(hand?.passed || []).includes(seat.id)}
        finished={Boolean(player?.finished)}
        style={style}
        deadline={hand?.deadline}
        turnSeconds={room.settings?.turnSeconds || 30}
        now={now}
        place={place}
        compact={narrow && manyOpponents}
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
        <div className="poker-felt banting-felt">
          {!narrow && opponents.map(index => seatNode(index, seatStyle(index)))}
          <div className="banting-center">
            {hand?.phase === 'opening' ? (
              <div className="banting-opening">
                <span className="banting-center__who">Fase pembukaan · kartu 3</span>
                {(hand.opening || []).length === 0 && (
                  <span className="banting-center__combo">Menunggu kartu 3 dikeluarkan…</span>
                )}
                {(hand.opening || []).map(entry => (
                  <span key={entry.id} className="banting-opening__row">
                    <span className="banting-opening__name">{entry.name}</span>
                    <span className="banting-play">
                      {entry.cards.map(card => (
                        <span key={card.uid} className="banting-play__card">
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
                <span className="banting-play">
                  {lastPlay.cards.map(card => (
                    <span key={card.uid} className="banting-play__card">
                      <CardSVG card={card} />
                    </span>
                  ))}
                </span>
                <span className="banting-center__combo">
                  {lastPlay.combo.label}
                  <em>{comboLabel(lastPlay.cards)}</em>
                </span>
              </>
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

      <div className="poker-hero banting-hero">
        <div className="banting-hand-row">
          <div className={`banting-hand ${selected.length ? 'has-selection' : ''} ${actions.isTurn ? 'is-tappable' : ''}`}>
            {myHand.length === 0 && (
              <span className="poker-hero__hint">
                {myPlayer?.finished ? 'Kartumu sudah habis — kamu menang! 🎉' : 'Kamu penonton di meja ini.'}
              </span>
            )}
            {myHand.map(card => {
              const isSelected = selected.includes(card.uid);
              return (
                <button
                  key={card.uid}
                  type="button"
                  className={`banting-card ${isSelected ? 'is-selected' : ''} ${actions.isTurn ? 'is-tappable' : ''}`}
                  onClick={() => toggleCard(card.uid)}
                  disabled={!actions.isTurn}
                  aria-pressed={isSelected}
                  aria-label={`${card.value} ${card.suit}${isSelected ? ' (dipilih)' : ''}`}
                >
                  <CardSVG card={card} />
                  {isSelected && <span className="banting-card__check" aria-hidden="true">✓</span>}
                </button>
              );
            })}
          </div>
          <div className="poker-hero__info banting-info">
            <div className="poker-hero__name">{me?.name || 'Penonton'}</div>
            <div className="poker-hero__chips">{myHand.length} kartu</div>
            {narrow && <div className="banting-fab-inline">{fabButtons}</div>}
            {selectedCombo ? (
              <div className={`poker-hero__hand-name ${beatCheck?.ok ? '' : 'is-bad'}`}>
                {selectedCombo.label}
              </div>
            ) : (
              <div className="poker-hero__hint">
                {actions.isTurn
                  ? (actions.mustLead
                    ? 'Buka ronde: pilih kombinasi apa saja'
                    : lastPlay
                      ? `Timpa ${lastPlay.combo.label} · ${comboLabel(lastPlay.cards)}`
                      : 'Pilih kartu untuk mulai')
                  : (myPlayer?.finished
                    ? 'Kamu sudah selesai'
                    : actions.hasPassed ? 'Kamu lewat — ikut lagi di ronde baru' : '')}
              </div>
            )}
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
              Ketuk kartu untuk memilih (boleh beberapa), lalu tekan <b>MAIN</b>. Kalau
              kombinasinya belum bisa menimpa, alasannya muncul tepat di bawah kartu.
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
              onClick={() => { vibrate(12); onIntent({ type: 'showThrees' }); }}
            >
              KELUARKAN {actions.myThrees.length} KARTU 3
              <span className="poker-btn__sub">menentukan siapa yang buka</span>
            </button>
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
                ? (actions.myThrees.length
                  ? 'Kartu 3 kamu sudah keluar — menunggu pemain lain…'
                  : 'Fase pembukaan — menunggu pemain yang pegang kartu 3…')
                : myPlayer?.finished
                  ? 'Kartumu habis — kamu menang! Menunggu pemain lain.'
                  : turnSeat ? `Menunggu ${turnSeat.name}…` : 'Menunggu pemain lain…'}
          </div>
        )}
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
          <button type="button" className="poker-btn poker-btn--check poker-btn--wide" onClick={() => onIntent({ type: 'next' })}>
            MAIN LAGI
          </button>
          <button type="button" className="poker-btn poker-btn--ghost" onClick={isHost ? () => onIntent({ type: 'restart' }) : onCopyInvite}>
            {isHost ? 'RESET SKOR' : 'BAGIKAN KODE'}
          </button>
        </div>
        <button type="button" className="poker-btn poker-btn--ghost" onClick={onExit} style={{ minHeight: 38 }}>
          KELUAR
        </button>
      </div>
    </div>
  );
}
