import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AvatarArt, Icon } from '../components/SvgPrimitives.jsx';
import { THROWABLE_ICONS } from '../components/TauntGlyphs.jsx';
import {
  boardSquaresFromFen,
  chessActions,
  evaluateMaterial,
  findKingSquare,
  legalMovesFromSquare,
} from './chessEngine.js';
import { ChessPieceSVG, PromotionModal } from './chessPieces.jsx';
import useChessChat from './useChessChat.js';
import { ChessChatDrawer, ChessInfoDrawer } from './ChessDrawer.jsx';
import { play } from '../sound/soundFX.js';
import { vibrate } from '../utils/haptics.js';

function formatClock(ms) {
  const totalSec = Math.max(0, Math.ceil((ms || 0) / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function PlayerStrip({
  seat,
  color,
  isTurn,
  inCheck,
  deadline,
  turnSeconds,
  clockMinutes,
  clockMs,
  turnStartedAt,
  now,
  captured = [],
  materialAdvantage = 0,
  tauntBubble = null,
  isViewer = false,
}) {
  const remainingTurnMs = isTurn && deadline ? Math.max(0, deadline - now) : 0;
  const turnSecLeft = isTurn && deadline ? Math.ceil(remainingTurnMs / 1000) : null;
  const ratio = isTurn && deadline
    ? Math.max(0, Math.min(1, remainingTurnMs / Math.max(1000, (turnSeconds || 60) * 1000)))
    : 0;
  const isUrgent = isTurn && remainingTurnMs > 0 && remainingTurnMs <= 10000;

  const liveClockMs = clockMinutes > 0
    ? (isTurn && turnStartedAt ? Math.max(0, clockMs - Math.max(0, now - turnStartedAt)) : clockMs)
    : 0;

  const ThrowGlyph = tauntBubble?.type === 'throw' ? THROWABLE_ICONS[tauntBubble.itemId] : null;

  return (
    <div
      className={`chess-player-strip ${isTurn ? 'is-turn' : ''} ${inCheck ? 'is-check' : ''}`}
      data-player-id={seat?.id || color}
    >
      <div className="chess-player-strip__avatar-wrap">
        <div className={`avatar-squircle-ring ${isTurn ? 'ring-green' : seat?.online === false ? 'ring-red' : 'ring-idle'}`} style={{ width: 42, height: 42 }}>
          {isTurn && (
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
            <AvatarArt avatar={seat?.avatar || 'finn'} size={42} />
          </div>
        </div>
        <span className={`chess-color-dot chess-color-dot--${color}`} title={color === 'w' ? 'Bidak Putih' : 'Bidak Hitam'}>
          <ChessPieceSVG type="p" color={color} size={13} />
        </span>
      </div>

      <div className="chess-player-strip__info">
        <div className="chess-player-strip__top">
          <span className="chess-player-strip__name">
            {seat?.name || (color === 'w' ? 'Putih' : 'Hitam')}
            {isViewer ? ' (Kamu)' : ''}
          </span>
          {seat?.bot && <span className={`bot-tag ${isTurn ? 'is-active' : ''}`}>Bot</span>}
          {inCheck && <span className="chess-badge chess-badge--check">SKAK!</span>}
          {!inCheck && isTurn && <span className="chess-badge chess-badge--turn">GILIRAN</span>}
        </div>

        <div className="chess-player-strip__captured">
          {captured.length === 0 ? (
            <span className="chess-captured-empty">{color === 'w' ? 'Putih' : 'Hitam'} · {seat?.wins || 0}M {seat?.draws || 0}S</span>
          ) : (
            <div className="chess-captured-list">
              {captured.slice(0, 12).map((pieceType, idx) => (
                <span key={`${pieceType}-${idx}`} className="chess-captured-icon">
                  <ChessPieceSVG type={pieceType} color={color === 'w' ? 'b' : 'w'} size={15} />
                </span>
              ))}
              {captured.length > 12 && (
                <span className="chess-material-adv">+{captured.length - 12}</span>
              )}
            </div>
          )}
          {materialAdvantage > 0 && (
            <span className="chess-material-adv">+{materialAdvantage}</span>
          )}
        </div>
      </div>

      <div className="chess-player-strip__timers">
        {clockMinutes > 0 && (
          <span className={`chess-clock-pill ${isTurn ? 'is-active' : ''} ${liveClockMs <= 20000 ? 'is-urgent' : ''}`}>
            <Icon.Stopwatch size={11} />
            <span className="tabular-nums">{formatClock(liveClockMs)}</span>
          </span>
        )}
        {turnSecLeft !== null && (
          <span className={`chess-turn-pill ${isUrgent ? 'is-urgent' : ''}`}>
            <span className="tabular-nums">{turnSecLeft}s</span>
          </span>
        )}
      </div>

      {tauntBubble && (
        <div className={`chess-taunt-pop ${tauntBubble.type === 'throw' ? 'is-throw' : ''}`} role="status">
          {ThrowGlyph && <ThrowGlyph size={22} />}
          <span>
            <strong>{tauntBubble.name}:</strong> {tauntBubble.text}
          </span>
        </div>
      )}
    </div>
  );
}

export default function ChessTable({ room, viewerId, now, onIntent }) {
  const match = room.match;
  const seats = room.seats || [];
  const spectators = room.spectators || [];
  const actions = chessActions(room, viewerId);

  const meSeat = seats.find(seat => seat.id === viewerId) || null;
  const meSpec = spectators.find(spec => spec.id === viewerId) || null;
  const myName = meSeat?.name || meSpec?.name || 'Pemain';
  const myAvatar = meSeat?.avatar || meSpec?.avatar || 'finn';
  const myRole = actions.isPlayer ? 'Pemain' : 'Penonton';

  const [manualFlip, setManualFlip] = useState(false);
  const [selection, setSelection] = useState({ fen: '', square: null });
  const [pendingPromo, setPendingPromo] = useState(null);
  const [drawer, setDrawer] = useState(null); // null | 'chat' | 'taunt' | 'throw' | 'info'
  const [confirmResign, setConfirmResign] = useState(false);
  const [dragGhost, setDragGhost] = useState(null);
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);

  const currentFen = match?.fen || '';
  const selectedSquare = selection.fen === currentFen ? selection.square : null;

  // Orientasi papan: bila pemain memegang Hitam, papan otomatis menghadap Hitam di bawah
  const isFlipped = (actions.myColor === 'b') !== manualFlip;

  const whiteSeat = seats.find(seat => seat.id === match?.whiteId) || seats[0] || null;
  const blackSeat = seats.find(seat => seat.id === match?.blackId) || seats[1] || null;

  const topColor = isFlipped ? 'w' : 'b';
  const bottomColor = isFlipped ? 'b' : 'w';
  const topSeat = topColor === 'w' ? whiteSeat : blackSeat;
  const bottomSeat = bottomColor === 'w' ? whiteSeat : blackSeat;

  const matrix = useMemo(() => boardSquaresFromFen(currentFen), [currentFen]);
  const displayRows = useMemo(() => {
    const rows = isFlipped ? [...matrix].reverse() : matrix;
    return rows.map(row => (isFlipped ? [...row].reverse() : row));
  }, [matrix, isFlipped]);

  const legalMoves = useMemo(
    () => (selectedSquare && actions.isTurn ? legalMovesFromSquare(currentFen, selectedSquare) : []),
    [currentFen, selectedSquare, actions.isTurn],
  );

  const legalTargetMap = useMemo(() => {
    const map = new Map();
    for (const move of legalMoves) {
      const existing = map.get(move.to) || [];
      existing.push(move);
      map.set(move.to, existing);
    }
    return map;
  }, [legalMoves]);

  const matchInCheck = Boolean(match?.inCheck);
  const matchTurn = match?.turn || 'w';
  const checkedKingSquare = useMemo(
    () => (matchInCheck ? findKingSquare(currentFen, matchTurn) : null),
    [currentFen, matchInCheck, matchTurn],
  );

  const material = useMemo(() => evaluateMaterial(currentFen), [currentFen]);

  const chat = useChessChat({
    roomCode: room.code,
    viewerId,
    myName,
    myAvatar,
    myRole,
  });

  // Efek suara langkah, tangkapan, skak, dan akhir permainan
  const prevMoveAtRef = useRef(match?.lastMove?.at || 0);
  useEffect(() => {
    const moveAt = match?.lastMove?.at || 0;
    if (!moveAt || moveAt === prevMoveAtRef.current) return;
    prevMoveAtRef.current = moveAt;

    if (match?.phase === 'ended') {
      play(match?.result?.winnerId ? 'win' : 'roundEnd');
      vibrate([30, 50, 40]);
      return;
    }
    if (match?.inCheck) {
      play('warn');
      vibrate([25, 35, 25]);
      return;
    }
    if (match?.lastMove?.captured) {
      play('meld');
      vibrate(18);
      return;
    }
    play('deal');
  }, [match?.lastMove?.at, match?.lastMove?.captured, match?.inCheck, match?.phase, match?.result?.winnerId]);

  const wasTurnRef = useRef(false);
  useEffect(() => {
    if (actions.isTurn && !wasTurnRef.current) {
      play('turn');
      vibrate(14);
    }
    wasTurnRef.current = actions.isTurn;
  }, [actions.isTurn]);

  const executeOrPromote = (fromSq, toSq) => {
    const candidates = legalMovesFromSquare(currentFen, fromSq).filter(m => m.to === toSq);
    if (!candidates.length) return false;
    setSelection({ fen: currentFen, square: null });

    const isPromotion = candidates.some(m => Boolean(m.promotion));
    if (isPromotion) {
      setPendingPromo({ from: fromSq, to: toSq });
      return true;
    }

    onIntent({ type: 'move', from: fromSq, to: toSq, promotion: 'q' });
    return true;
  };

  const handleSquareClick = cell => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (!actions.isTurn || match?.phase !== 'play') return;

    // Bila petak tujuan adalah langkah sah dari bidak yang sedang dipilih -> jalankan!
    if (selectedSquare && legalTargetMap.has(cell.square)) {
      executeOrPromote(selectedSquare, cell.square);
      return;
    }

    // Bila mengetuk bidak sendiri -> pilih petak tersebut
    if (cell.piece && cell.piece.color === actions.myColor) {
      setSelection(prev => ({
        fen: currentFen,
        square: prev.fen === currentFen && prev.square === cell.square ? null : cell.square,
      }));
      play('click');
      return;
    }

    setSelection({ fen: currentFen, square: null });
  };

  const handlePointerDown = (event, cell) => {
    if (!actions.isTurn || match?.phase !== 'play') return;
    if (!cell.piece || cell.piece.color !== actions.myColor) return;
    if (event.button !== undefined && event.button !== 0) return;

    const startX = event.clientX;
    const startY = event.clientY;
    dragRef.current = {
      from: cell.square,
      piece: cell.piece,
      startX,
      startY,
      moved: false,
      overSquare: cell.square,
    };

    const onMove = moveEvent => {
      const state = dragRef.current;
      if (!state) return;
      const dx = moveEvent.clientX - state.startX;
      const dy = moveEvent.clientY - state.startY;
      if (!state.moved && Math.hypot(dx, dy) > 7) {
        state.moved = true;
        setSelection({ fen: currentFen, square: state.from });
      }
      if (!state.moved) return;

      const targetEl = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
      const sqNode = targetEl?.closest?.('[data-square]');
      const overSquare = sqNode?.getAttribute('data-square') || null;
      state.overSquare = overSquare;
      setDragGhost({
        from: state.from,
        piece: state.piece,
        x: moveEvent.clientX,
        y: moveEvent.clientY,
        overSquare,
      });
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      const state = dragRef.current;
      dragRef.current = null;
      setDragGhost(null);
      if (!state || !state.moved) return;
      suppressClickRef.current = true;
      setTimeout(() => { suppressClickRef.current = false; }, 60);

      if (state.overSquare && state.overSquare !== state.from) {
        executeOrPromote(state.from, state.overSquare);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  // Balon ejekan terbaru untuk pemain atas & bawah
  const latestTaunt = chat.tauntEvents[chat.tauntEvents.length - 1] || null;
  const topTaunt = latestTaunt && (!latestTaunt.targetId || latestTaunt.targetId === topSeat?.id)
    ? latestTaunt
    : null;
  const bottomTaunt = latestTaunt && latestTaunt.targetId === bottomSeat?.id
    ? latestTaunt
    : null;

  const lastMessage = chat.messages[chat.messages.length - 1] || null;

  return (
    <main className="chess-arena">
      {/* Banner Penonton bila user adalah Spectator */}
      {actions.isSpectator && (
        <div className="chess-spectator-banner">
          <Icon.Eye size={14} />
          <span>
            Mode Penonton ({spectators.length} menonton) — Kamu bebas ngobrol &amp; lempar stiker ejekan!
          </span>
        </div>
      )}

      {/* Tawaran Remis dari Lawan */}
      {actions.canAcceptDraw && (
        <div className="chess-draw-offer-bar" role="alert">
          <span>🤝 Lawan menawarkan <strong>Remis (Damai)</strong>. Terima?</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className="poker-btn poker-btn--check"
              style={{ minHeight: 30, padding: '0 10px', fontSize: 11 }}
              onClick={() => onIntent({ type: 'acceptDraw' })}
            >
              TERIMA REMIS
            </button>
            <button
              type="button"
              className="poker-btn poker-btn--ghost"
              style={{ minHeight: 30, padding: '0 10px', fontSize: 11 }}
              onClick={() => onIntent({ type: 'declineDraw' })}
            >
              TOLAK
            </button>
          </div>
        </div>
      )}

      {/* Bar Pemain Atas */}
      <PlayerStrip
        seat={topSeat}
        color={topColor}
        isTurn={match?.phase === 'play' && match?.turn === topColor}
        inCheck={match?.phase === 'play' && match?.inCheck && match?.turn === topColor}
        deadline={match?.deadline}
        turnSeconds={room.settings.turnSeconds}
        clockMinutes={room.settings.clockMinutes}
        clockMs={topColor === 'w' ? match?.whiteMs : match?.blackMs}
        turnStartedAt={match?.turnStartedAt}
        now={now}
        captured={match?.captured?.[topColor] || []}
        materialAdvantage={topColor === 'w' ? Math.max(0, material.diff) : Math.max(0, -material.diff)}
        tauntBubble={topTaunt}
        isViewer={topSeat?.id === viewerId}
      />

      {/* Papan Catur 8x8 */}
      <div className="chess-board-shell">
        <div
          className={`chess-board ${actions.isTurn ? 'is-my-turn' : ''}`}
          role="grid"
          aria-label="Papan Catur 8x8"
          onContextMenu={event => event.preventDefault()}
        >
          {displayRows.map((row, rIdx) => (
            row.map((cell, cIdx) => {
              const isSelected = selectedSquare === cell.square;
              const isLastFrom = match?.lastMove?.from === cell.square;
              const isLastTo = match?.lastMove?.to === cell.square;
              const isLegalTarget = legalTargetMap.has(cell.square);
              const isCaptureTarget = isLegalTarget && Boolean(cell.piece || legalTargetMap.get(cell.square)?.some(m => m.flags?.includes('e')));
              const isKingInCheck = checkedKingSquare === cell.square;
              const isDragOver = dragGhost?.overSquare === cell.square;
              const isDraggingSource = dragGhost?.from === cell.square;

              const showRankCoord = cIdx === 0;
              const showFileCoord = rIdx === 7;

              return (
                <button
                  key={cell.square}
                  type="button"
                  data-square={cell.square}
                  aria-label={`Petak ${cell.square}${cell.piece ? ` ${cell.piece.color === 'w' ? 'Putih' : 'Hitam'} ${cell.piece.type}` : ''}`}
                  className={[
                    'chess-sq',
                    cell.isLight ? 'chess-sq--light' : 'chess-sq--dark',
                    isSelected ? 'is-selected' : '',
                    isLastFrom || isLastTo ? 'is-last-move' : '',
                    isKingInCheck ? 'is-king-check' : '',
                    isDragOver && isLegalTarget ? 'is-drag-over' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => handleSquareClick(cell)}
                  onPointerDown={event => handlePointerDown(event, cell)}
                  onDragStart={event => event.preventDefault()}
                >
                  {showRankCoord && (
                    <span className="chess-coord chess-coord--rank" aria-hidden="true">{cell.rank}</span>
                  )}
                  {showFileCoord && (
                    <span className="chess-coord chess-coord--file" aria-hidden="true">{cell.file}</span>
                  )}

                  {cell.piece && (
                    <span className={`chess-piece-wrap ${isDraggingSource ? 'is-dragging-source' : ''}`}>
                      <ChessPieceSVG
                        type={cell.piece.type}
                        color={cell.piece.color}
                        size="100%"
                      />
                    </span>
                  )}

                  {isLegalTarget && !isCaptureTarget && (
                    <span className="chess-legal-dot" aria-hidden="true" />
                  )}
                  {isLegalTarget && isCaptureTarget && (
                    <span className="chess-legal-capture" aria-hidden="true" />
                  )}
                </button>
              );
            })
          ))}
        </div>
      </div>

      {/* Bar Pemain Bawah */}
      <PlayerStrip
        seat={bottomSeat}
        color={bottomColor}
        isTurn={match?.phase === 'play' && match?.turn === bottomColor}
        inCheck={match?.phase === 'play' && match?.inCheck && match?.turn === bottomColor}
        deadline={match?.deadline}
        turnSeconds={room.settings.turnSeconds}
        clockMinutes={room.settings.clockMinutes}
        clockMs={bottomColor === 'w' ? match?.whiteMs : match?.blackMs}
        turnStartedAt={match?.turnStartedAt}
        now={now}
        captured={match?.captured?.[bottomColor] || []}
        materialAdvantage={bottomColor === 'w' ? Math.max(0, material.diff) : Math.max(0, -material.diff)}
        tauntBubble={bottomTaunt}
        isViewer={bottomSeat?.id === viewerId}
      />

      {/* Baris Status Langkah Terakhir & Ticker Chat */}
      <div className="chess-status-line">
        <span className="chess-status-line__move">
          {match?.lastMove
            ? `Langkah #${match.lastMove.no}: ${match.lastMove.san} (${match.lastMove.color === 'w' ? 'Putih' : 'Hitam'})`
            : 'Pilih atau geser bidak untuk melangkah'}
        </span>
        {lastMessage && (
          <button
            type="button"
            className="chess-chat-ticker"
            onClick={() => setDrawer('chat')}
          >
            <strong>{lastMessage.mine ? 'Kamu' : lastMessage.name}:</strong> {lastMessage.text}
          </button>
        )}
      </div>

      {/* Dock Tombol Aksi Bawah */}
      <div className="chess-dock">
        <button
          type="button"
          className="chess-dock-btn"
          onClick={() => setManualFlip(v => !v)}
          title="Putar arah pandang papan catur"
        >
          <Icon.Refresh size={14} />
          <span>Putar</span>
        </button>

        {actions.isPlayer && match?.phase === 'play' && (
          <>
            <button
              type="button"
              className="chess-dock-btn"
              disabled={!actions.canOfferDraw}
              onClick={() => onIntent({ type: 'offerDraw' })}
              title="Tawarkan hasil seri/remis ke lawan"
            >
              <span>{match?.drawOfferBy === viewerId ? 'Remis Dikirim' : 'Tawar Remis'}</span>
            </button>

            <button
              type="button"
              className="chess-dock-btn chess-dock-btn--danger"
              onClick={() => setConfirmResign(true)}
              title="Menyerah dari babak ini"
            >
              <Icon.Flag size={14} />
              <span>Menyerah</span>
            </button>
          </>
        )}

        <button
          type="button"
          className="chess-dock-btn chess-dock-btn--gold"
          onClick={() => setDrawer('taunt')}
          title="Kirim ejekan atau lempar stiker ke meja"
        >
          <span>Ejek / Stiker</span>
        </button>

        <button
          type="button"
          className="chess-dock-btn"
          onClick={() => setDrawer('chat')}
          title="Buka obrolan meja"
        >
          <Icon.Chat size={14} />
          <span>Obrolan</span>
          {chat.unread > 0 && <span className="chess-unread-dot">{chat.unread}</span>}
        </button>

        <button
          type="button"
          className="chess-dock-btn"
          onClick={() => setDrawer('info')}
          title="Lihat notasi langkah, skor, dan penonton"
        >
          <Icon.Trophy size={14} />
          <span>Notasi</span>
        </button>
      </div>

      {/* Ghost Bidak saat Drag-and-Drop */}
      {dragGhost && (
        <div
          className="chess-drag-ghost"
          style={{ left: dragGhost.x, top: dragGhost.y }}
          aria-hidden="true"
        >
          <ChessPieceSVG type={dragGhost.piece.type} color={dragGhost.piece.color} size={56} />
        </div>
      )}

      {/* Modal Promosi Pion */}
      <PromotionModal
        open={Boolean(pendingPromo)}
        color={actions.myColor || 'w'}
        onSelect={pieceType => {
          if (pendingPromo) {
            onIntent({
              type: 'move',
              from: pendingPromo.from,
              to: pendingPromo.to,
              promotion: pieceType,
            });
          }
          setPendingPromo(null);
        }}
        onCancel={() => setPendingPromo(null)}
      />

      {/* Modal Konfirmasi Menyerah */}
      {confirmResign && (
        <div className="poker-overlay" role="dialog" aria-modal="true" onClick={() => setConfirmResign(false)}>
          <div className="poker-panel" style={{ maxWidth: 340 }} onClick={event => event.stopPropagation()}>
            <div className="poker-panel__title">Menyerah Babak Ini?</div>
            <div className="poker-note" style={{ marginBottom: 12 }}>
              Lawan akan langsung dinyatakan menang pada babak ini. Yakin ingin menyerah?
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="poker-btn poker-btn--ghost"
                style={{ flex: 1 }}
                onClick={() => setConfirmResign(false)}
              >
                BATAL
              </button>
              <button
                type="button"
                className="poker-btn poker-btn--raise"
                style={{ flex: 1 }}
                onClick={() => {
                  setConfirmResign(false);
                  onIntent({ type: 'resign' });
                }}
              >
                YA, MENYERAH
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Akhir Babak (Checkmate / Remis / Resign / Timeout) */}
      {(room.status === 'round-end' || match?.phase === 'ended') && match?.result && (
        <div className="poker-overlay" role="dialog" aria-modal="true">
          <div className="poker-panel" style={{ maxWidth: 380 }}>
            <div className="poker-panel__title">
              <Icon.Trophy size={18} />{' '}
              {match.result.winnerId ? `Pemenang: ${match.result.winnerName}` : ' Pertandingan Remis!'}
            </div>
            <div className="poker-note" style={{ fontSize: 12.5, color: '#e7dfd0', marginBottom: 10 }}>
              {match.result.label}
            </div>
            <div className="poker-rule-row">
              <span>Putih ({match.result.whiteName}) vs Hitam ({match.result.blackName})</span>
              <strong>{match.result.movesCount} langkah</strong>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              {(actions.isPlayer || room.hostId === viewerId) ? (
                <>
                  <button
                    type="button"
                    className="poker-btn poker-btn--ghost"
                    style={{ flex: 1 }}
                    onClick={() => onIntent({ type: 'toLobby' })}
                  >
                    KE LOBBY
                  </button>
                  <button
                    type="button"
                    className="poker-btn poker-btn--check"
                    style={{ flex: 1.3 }}
                    onClick={() => onIntent({ type: 'next' })}
                  >
                    MAIN LAGI (TUKAR WARNA)
                  </button>
                </>
              ) : (
                <div className="poker-note" style={{ width: '100%', textAlign: 'center' }}>
                  Menunggu pemain memulai babak berikutnya…
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Drawer Obrolan / Ejekan / Lempar Stiker */}
      <ChessChatDrawer
        open={drawer === 'chat' || drawer === 'taunt' || drawer === 'throw'}
        initialTab={drawer === 'taunt' ? 'taunt' : drawer === 'throw' ? 'throw' : 'chat'}
        onClose={() => setDrawer(null)}
        chat={chat}
        room={room}
        viewerId={viewerId}
        myName={myName}
      />

      {/* Drawer Info, Notasi, Skor & Penonton */}
      <ChessInfoDrawer
        open={drawer === 'info'}
        onClose={() => setDrawer(null)}
        room={room}
        viewerId={viewerId}
      />
    </main>
  );
}
