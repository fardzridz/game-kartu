import React, { useState } from 'react';
import { AvatarArt, Icon } from '../components/SvgPrimitives.jsx';
import { MONOPOLY_MAX_PLAYERS } from './monopolyEngine.js';

export default function MonopolyRoomLobby({ room, viewerId, onIntent, onExit, onCopyInvite, error = '' }) {
  const me = room.seats.find(s => s.id === viewerId);
  const isHost = room.hostId === viewerId;
  const humans = room.seats.filter(s => !s.bot);
  const readyHumans = humans.filter(s => s.ready || s.id === room.hostId);
  const canStart = room.seats.length >= 2 && readyHumans.length === humans.length;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => ({ ...room.settings }));

  return (
    <div className="poker-home">
      <div style={{ width: 'min(100%, 520px)', display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
        <button type="button" className="poker-icon-btn" onClick={onExit} aria-label="Keluar dari meja">
          <Icon.Exit size={16} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 900 }}>Ruang Tunggu Monopoli</div>
          <div style={{ fontSize: 10.5, color: '#a39b8b' }}>
            {room.seats.length}/{MONOPOLY_MAX_PLAYERS} pemain · Modal Rp {room.settings.startingCash} · {room.settings.turnSeconds}s
          </div>
        </div>
        <span className="poker-pill poker-pill--gold">
          <Icon.Users size={12} /> {room.seats.length}
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

        <div className="poker-seat-list">
          {room.seats.map((seat, index) => {
            const isMe = seat.id === viewerId;
            const host = seat.id === room.hostId;
            return (
              <div key={seat.id} className={`poker-seat-row ${isMe ? 'is-me' : ''}`}>
                <span className="poker-rank" style={{ color: seat.color || '#2cc597' }}>
                  #{index + 1}
                </span>
                <span className="poker-seat-row__avatar">
                  <AvatarArt avatar={seat.avatar} size={30} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span className="poker-seat-row__name">{seat.name}{isMe ? ' (kamu)' : ''}</span>
                  <span className="poker-seat-row__meta" style={{ display: 'block' }}>
                    {seat.bot ? 'Bot AI' : 'Pemain'}
                    {seat.wins ? ` · 🏆 ${seat.wins}x Menang` : ''}
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
          })}
        </div>

        <div className="poker-actions">
          {me && (
            <button
              type="button"
              className={`poker-btn ${me.ready ? 'poker-btn--ghost' : 'poker-btn--check'}`}
              onClick={() => onIntent({ type: 'ready', ready: !me.ready })}
            >
              {me.ready ? 'BATAL SIAP' : 'SIAP'}
            </button>
          )}

          {isHost && (
            <>
              {room.seats.length < MONOPOLY_MAX_PLAYERS && (
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
                <Icon.Play size={13} /> MULAI MONOPOLI 🎲
              </button>
            </>
          )}
        </div>

        {isHost && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            <button
              type="button"
              className="poker-btn poker-btn--ghost"
              style={{ minHeight: 36 }}
              onClick={() => {
                setDraft({ ...room.settings });
                setEditing(v => !v);
              }}
            >
              <Icon.Gear size={13} /> {editing ? 'TUTUP ATURAN' : 'ATURAN MONOPOLI'}
            </button>
            {editing && (
              <>
                <div className="poker-settings-grid">
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <span className="poker-label">Timer Giliran</span>
                    <select
                      className="poker-select"
                      value={draft.turnSeconds}
                      onChange={e => setDraft({ ...draft, turnSeconds: Number(e.target.value) })}
                    >
                      {[30, 45, 60, 90].map(s => <option key={s} value={s}>{s} detik</option>)}
                    </select>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <span className="poker-label">Modal Awal</span>
                    <select
                      className="poker-select"
                      value={draft.startingCash}
                      onChange={e => setDraft({ ...draft, startingCash: Number(e.target.value) })}
                    >
                      <option value={1000}>Rp 1.000</option>
                      <option value={1500}>Rp 1.500</option>
                      <option value={2000}>Rp 2.000</option>
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
        <span className="poker-label">Riwayat Meja</span>
        <div className="poker-log">
          {(room.log || []).slice(-10).reverse().map((line, idx) => (
            <span key={`${line}-${idx}`}>{line}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
