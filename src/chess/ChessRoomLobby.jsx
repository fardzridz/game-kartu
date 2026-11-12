import React, { useState } from 'react';
import { AvatarArt, Icon } from '../components/SvgPrimitives.jsx';
import { ChessPieceSVG } from './chessPieces.jsx';
import {
  BOT_LEVEL_OPTIONS,
  CHESS_CUP_MAX_SEATS,
  CHESS_MAX_SEATS,
  CHESS_MAX_SPECTATORS,
  CHESS_MODE_OPTIONS,
  CLOCK_OPTIONS,
  TURN_OPTIONS,
  bracketSizeFor,
  maxSeatsForRoom,
} from './chessEngine.js';

export default function ChessRoomLobby({ room, viewerId, onIntent, onExit, onCopyInvite, error = '' }) {
  const meSeatIndex = room.seats.findIndex(seat => seat.id === viewerId);
  const meSeat = meSeatIndex >= 0 ? room.seats[meSeatIndex] : null;
  const meSpectator = (room.spectators || []).find(spec => spec.id === viewerId);
  const isHost = room.hostId === viewerId;
  const isCup = room.settings.mode === 'cup';
  const maxSeats = maxSeatsForRoom(room);

  const humans = room.seats.filter(seat => !seat.bot);
  const readyHumans = humans.filter(seat => seat.ready || seat.id === room.hostId);
  const canStart = isCup
    ? (room.seats.length >= 2 && readyHumans.length === humans.length)
    : (room.seats.length === 2 && readyHumans.length === humans.length);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => ({ ...room.settings }));

  // Prediksi pemegang warna duel 1v1
  let nextWhiteIdx = 0;
  if (!isCup && (room.matchNo || 0) >= 1 && room.lastResult?.whiteId) {
    const prevIdx = room.seats.findIndex(seat => seat.id === room.lastResult.whiteId);
    if (prevIdx === 0) nextWhiteIdx = 1;
  }

  const projectedBracketSize = isCup ? bracketSizeFor(room.seats.length) : 2;
  const projectedByes = isCup ? Math.max(0, projectedBracketSize - room.seats.length) : 0;

  return (
    <div className="poker-home">
      <div style={{ width: 'min(100%, 520px)', display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
        <button type="button" className="poker-icon-btn" onClick={onExit} aria-label="Keluar dari meja">
          <Icon.Exit size={16} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 900 }}>
            {isCup ? 'Ruang Tunggu Turnamen Cup' : 'Ruang Tunggu Duel Catur'}
          </div>
          <div style={{ fontSize: 10.5, color: '#a39b8b' }}>
            {isCup
              ? `${room.seats.length}/${maxSeats} peserta · Bagan ${projectedBracketSize} Besar${projectedByes > 0 && !room.settings.cupFillBots ? ` (${projectedByes} BYE)` : ''}`
              : `${room.seats.length}/${CHESS_MAX_SEATS} pemain · ${(room.spectators || []).length} penonton`}
            {room.settings.clockMinutes > 0 ? ` · Blitz ${room.settings.clockMinutes}m` : ` · ${room.settings.turnSeconds}s`}
          </div>
        </div>
        <span className="poker-pill poker-pill--gold">
          <Icon.Users size={12} /> {room.seats.length + (room.spectators || []).length}
        </span>
      </div>

      <div className="poker-card-panel">
        <div className="poker-code">
          <div style={{ flex: 1 }}>
            <div className="poker-label">Kode meja</div>
            <div className="poker-code__value">{room.code}</div>
          </div>
          <button type="button" className="poker-icon-btn" onClick={onCopyInvite} aria-label="Salin tautan undangan">
            <Icon.Copy size={15} />
          </button>
        </div>

        {error && <div className="poker-error">{error}</div>}

        {room.lastResult && (
          <div style={{ padding: '9px 12px', background: 'rgba(245, 166, 35, 0.1)', border: '1px solid rgba(245, 166, 35, 0.3)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon.Trophy size={18} />
            <div style={{ fontSize: 11.5, lineHeight: 1.35 }}>
              <div style={{ color: '#ffd18a', fontWeight: 800 }}>
                {room.lastResult.isCup ? `Hasil Turnamen Cup #${room.lastResult.matchNo}` : `Hasil Babak #${room.lastResult.matchNo}`}
              </div>
              <div>{room.lastResult.label}</div>
            </div>
          </div>
        )}

        <div className="poker-label" style={{ marginTop: 2, display: 'flex', justifyContent: 'space-between' }}>
          <span>{isCup ? `Daftar Peserta Cup (${room.seats.length}/${CHESS_CUP_MAX_SEATS})` : 'Kursi Duel (Putih vs Hitam)'}</span>
          {isCup && (
            <span style={{ color: '#f5a623', fontWeight: 700, textTransform: 'none' }}>
              Bagan {projectedBracketSize} Besar
            </span>
          )}
        </div>

        {/* List Peserta */}
        <div className="poker-seat-list">
          {!isCup ? (
            [0, 1].map(slotIndex => {
              const seat = room.seats[slotIndex] || null;
              const pieceColor = slotIndex === nextWhiteIdx ? 'w' : 'b';
              const colorLabel = pieceColor === 'w' ? 'Bidak Putih (Jalan Duluan)' : 'Bidak Hitam';

              if (!seat) {
                return (
                  <div key={`empty-${slotIndex}`} className="poker-seat-row" style={{ opacity: 0.82, borderStyle: 'dashed' }}>
                    <span className="poker-seat-row__avatar" style={{ display: 'grid', placeItems: 'center' }}>
                      <ChessPieceSVG type="k" color={pieceColor} size={24} />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span className="poker-seat-row__name">Kursi Kosong ({pieceColor === 'w' ? 'Putih' : 'Hitam'})</span>
                      <span className="poker-seat-row__meta" style={{ display: 'block' }}>{colorLabel}</span>
                    </span>
                    <span className="poker-seat-row__right">
                      {meSpectator && (
                        <button
                          type="button"
                          className="poker-btn poker-btn--check"
                          style={{ minHeight: 30, padding: '0 10px', fontSize: 10.5 }}
                          onClick={() => onIntent({ type: 'takePlayerSeat' })}
                        >
                          DUDUK MAIN
                        </button>
                      )}
                      {isHost && !meSpectator && (
                        <button
                          type="button"
                          className="poker-btn poker-btn--ghost"
                          style={{ minHeight: 30, padding: '0 10px', fontSize: 10.5 }}
                          onClick={() => onIntent({ type: 'addBot' })}
                        >
                          + BOT AI
                        </button>
                      )}
                    </span>
                  </div>
                );
              }

              const isMe = seat.id === viewerId;
              const host = seat.id === room.hostId;
              return (
                <div key={seat.id} className={`poker-seat-row ${isMe ? 'is-me' : ''}`}>
                  <span className="poker-seat-row__avatar">
                    <AvatarArt avatar={seat.avatar} size={30} />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span className="poker-seat-row__name" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <ChessPieceSVG type="p" color={pieceColor} size={15} />
                      <span>{seat.name}{isMe ? ' (kamu)' : ''}</span>
                    </span>
                    <span className="poker-seat-row__meta" style={{ display: 'block' }}>
                      {colorLabel}
                      {seat.bot ? ` · Bot (${room.settings.botLevel})` : ''}
                      {(seat.wins || seat.losses || seat.draws)
                        ? ` · ${seat.wins || 0}M / ${seat.draws || 0}S / ${seat.losses || 0}K`
                        : ''}
                    </span>
                  </span>
                  <span className="poker-seat-row__right">
                    {host && <span className="poker-ready poker-ready--host">HOST</span>}
                    {seat.bot ? (
                      isHost ? (
                        <button
                          type="button"
                          className="poker-icon-btn"
                          style={{ width: 26, height: 26, borderRadius: 8 }}
                          onClick={() => onIntent({ type: 'removeBot', botId: seat.id })}
                          aria-label={`Keluarkan ${seat.name}`}
                        >
                          <Icon.Trash size={13} />
                        </button>
                      ) : <span className="poker-ready poker-ready--wait">BOT</span>
                    ) : (
                      <span className={`poker-ready ${seat.ready || host ? '' : 'poker-ready--wait'}`}>
                        {seat.ready || host ? 'SIAP' : 'MENUNGGU'}
                      </span>
                    )}
                  </span>
                </div>
              );
            })
          ) : (
            room.seats.map((seat, index) => {
              const isMe = seat.id === viewerId;
              const host = seat.id === room.hostId;
              return (
                <div key={seat.id} className={`poker-seat-row ${isMe ? 'is-me' : ''}`}>
                  <span className="poker-rank" style={{ color: index < 4 ? '#2cc597' : '#9a9284' }}>
                    #{index + 1}
                  </span>
                  <span className="poker-seat-row__avatar">
                    <AvatarArt avatar={seat.avatar || 'finn'} size={30} />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span className="poker-seat-row__name">
                      {seat.name}{isMe ? ' (kamu)' : ''}
                    </span>
                    <span className="poker-seat-row__meta" style={{ display: 'block' }}>
                      Unggulan {index + 1}
                      {seat.bot ? ' · Bot AI' : ''}
                      {seat.cups ? ` · 🏆 ${seat.cups}x Juara` : ''}
                      {(seat.wins || seat.losses || seat.draws)
                        ? ` · ${seat.wins || 0}M / ${seat.draws || 0}S / ${seat.losses || 0}K`
                        : ''}
                    </span>
                  </span>
                  <span className="poker-seat-row__right">
                    {host && <span className="poker-ready poker-ready--host">HOST</span>}
                    {seat.bot ? (
                      isHost ? (
                        <button
                          type="button"
                          className="poker-icon-btn"
                          style={{ width: 26, height: 26, borderRadius: 8 }}
                          onClick={() => onIntent({ type: 'removeBot', botId: seat.id })}
                          aria-label={`Keluarkan ${seat.name}`}
                        >
                          <Icon.Trash size={13} />
                        </button>
                      ) : <span className="poker-ready poker-ready--wait">BOT</span>
                    ) : (
                      <span className={`poker-ready ${seat.ready || host ? '' : 'poker-ready--wait'}`}>
                        {seat.ready || host ? 'SIAP' : 'MENUNGGU'}
                      </span>
                    )}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Info Bagan Sistem Gugur untuk Mode Cup */}
        {isCup && (
          <div className="chess-cup-meta-box">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, color: '#fde68a' }}>
              <Icon.Trophy size={14} /> Format Bagan: {projectedBracketSize} Besar
            </div>
            <div style={{ fontSize: 11, color: '#d9d3c7', marginTop: 2, lineHeight: 1.4 }}>
              {projectedByes > 0 && !room.settings.cupFillBots
                ? `Jumlah peserta ${room.seats.length} orang: sebanyak ${projectedByes} peserta beruntung otomatis mendapat tiket BYE langsung ke babak selanjutnya.`
                : `Semua ${room.seats.length} peserta bertanding serentak di meja masing-masing pada babak pertama!`}
            </div>
          </div>
        )}

        <div className="poker-actions">
          {meSeat && (
            <>
              <button
                type="button"
                className={`poker-btn ${meSeat.ready ? 'poker-btn--ghost' : 'poker-btn--check'}`}
                onClick={() => onIntent({ type: 'ready', ready: !meSeat.ready })}
              >
                {meSeat.ready ? 'BATAL SIAP' : 'SIAP'}
              </button>
              <button
                type="button"
                className="poker-btn poker-btn--ghost"
                onClick={() => onIntent({ type: 'spectate' })}
                title="Pindah ke bangku penonton agar teman lain bisa mendaftar"
              >
                <Icon.Eye size={13} /> JADI PENONTON
              </button>
            </>
          )}

          {meSpectator && room.seats.length < maxSeats && (
            <button
              type="button"
              className="poker-btn poker-btn--check"
              onClick={() => onIntent({ type: 'takePlayerSeat' })}
            >
              DAFTAR PESERTA CUP
            </button>
          )}

          {isHost && (
            <>
              {isCup && (
                <button
                  type="button"
                  className="poker-btn poker-btn--ghost"
                  onClick={() => onIntent({ type: 'swapSeats' })}
                  title="Acak ulang unggulan dan bagan turnamen"
                >
                  <Icon.Refresh size={13} /> ACAK BAGAN
                </button>
              )}
              {!isCup && room.seats.length === 2 && (
                <button
                  type="button"
                  className="poker-btn poker-btn--ghost"
                  onClick={() => onIntent({ type: 'swapSeats' })}
                  title="Tukar pemegang bidak Putih dan Hitam"
                >
                  <Icon.Refresh size={13} /> TUKAR WARNA
                </button>
              )}
              {room.seats.length < maxSeats && (
                <button
                  type="button"
                  className="poker-btn poker-btn--ghost"
                  onClick={() => onIntent({ type: 'addBot' })}
                >
                  <Icon.Plus size={13} /> BOT AI
                </button>
              )}
              <button
                type="button"
                className="poker-btn poker-btn--check poker-btn--wide"
                onClick={() => onIntent({ type: 'start' })}
                disabled={!canStart}
              >
                <Icon.Play size={13} /> {isCup ? 'MULAI TURNAMEN CUP 🏆' : 'MULAI PERTANDINGAN CATUR'}
              </button>
            </>
          )}
        </div>

        {/* Daftar Penonton */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="poker-label">Bangku Penonton ({(room.spectators || []).length}/{CHESS_MAX_SPECTATORS})</span>
            {meSpectator && <span className="poker-ready">KAMU MENONTON</span>}
          </div>
          {(room.spectators || []).length === 0 ? (
            <div className="poker-note">
              Belum ada penonton. Bagikan kode meja ke teman tongkrongan biar mereka ikut nonton &amp; lempar stiker!
            </div>
          ) : (
            <div className="chess-spectator-chips">
              {(room.spectators || []).map(spec => (
                <span key={spec.id} className={`chess-spectator-chip ${spec.id === viewerId ? 'is-me' : ''}`}>
                  <AvatarArt avatar={spec.avatar || 'finn'} size={18} />
                  <span>{spec.name}{spec.id === viewerId ? ' (kamu)' : ''}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {isHost && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="button"
              className="poker-btn poker-btn--ghost"
              style={{ minHeight: 36 }}
              onClick={() => {
                setDraft({ ...room.settings });
                setEditing(value => !value);
              }}
            >
              <Icon.Gear size={13} /> {editing ? 'TUTUP ATURAN' : 'ATURAN TURNAMEN & MEJA'}
            </button>
            {editing && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <span className="poker-label">Format Game</span>
                  <div className="chess-mode-toggle-grid">
                    {CHESS_MODE_OPTIONS.map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        className={`chess-mode-toggle-btn ${draft.mode === opt.id ? 'is-active' : ''}`}
                        onClick={() => setDraft(prev => ({ ...prev, mode: opt.id }))}
                      >
                        <strong>{opt.id === 'cup' ? '🏆 Turnamen Cup' : '⚔️ Duel 1v1'}</strong>
                        <span>{opt.id === 'cup' ? '3–32 Peserta' : '2 Pemain'}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="poker-settings-grid">
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <span className="poker-label">Timer per langkah</span>
                    <select
                      className="poker-select"
                      value={draft.turnSeconds}
                      onChange={event => setDraft({ ...draft, turnSeconds: Number(event.target.value) })}
                    >
                      {TURN_OPTIONS.map(option => <option key={option} value={option}>{option} detik</option>)}
                    </select>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <span className="poker-label">Jam Catur Total</span>
                    <select
                      className="poker-select"
                      value={draft.clockMinutes}
                      onChange={event => setDraft({ ...draft, clockMinutes: Number(event.target.value) })}
                    >
                      {CLOCK_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                    </select>
                  </label>
                  {draft.mode === 'cup' && (
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <span className="poker-label">Slot Bagan Ganjil</span>
                      <select
                        className="poker-select"
                        value={draft.cupFillBots ? '1' : '0'}
                        onChange={event => setDraft({ ...draft, cupFillBots: event.target.value === '1' })}
                      >
                        <option value="0">Sistem BYE Otomatis</option>
                        <option value="1">Isi Bot Penggenap</option>
                      </select>
                    </label>
                  )}
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <span className="poker-label">Level Bot AI</span>
                    <select
                      className="poker-select"
                      value={draft.botLevel}
                      onChange={event => setDraft({ ...draft, botLevel: event.target.value })}
                    >
                      {BOT_LEVEL_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                    </select>
                  </label>
                </div>
                <button
                  type="button"
                  className="poker-btn poker-btn--raise"
                  style={{ minHeight: 38 }}
                  onClick={() => {
                    onIntent({ type: 'settings', settings: draft });
                    setEditing(false);
                  }}
                >
                  SIMPAN ATURAN
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="poker-card-panel">
        <span className="poker-label">Riwayat meja</span>
        <div className="poker-log">
          {(room.log || []).slice(-10).reverse().map((line, index) => (
            <span key={`${line}-${index}`}>{line}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
