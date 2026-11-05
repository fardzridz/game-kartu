import React, { useState } from 'react';
import { AvatarArt, AvatarArtButton, Icon } from '../components/SvgPrimitives.jsx';
import { AVATARS } from '../engine/roomEngine.js';
import { BANTING_MAX_SEATS, DECK_OPTIONS, TURN_OPTIONS } from './bantingEngine.js';

export default function BantingRoomLobby({ room, viewerId, onIntent, onExit, onCopyInvite, error = '' }) {
  const me = room.seats.find(seat => seat.id === viewerId);
  const isHost = room.hostId === viewerId;
  const humans = room.seats.filter(seat => !seat.bot);
  const readyHumans = humans.filter(seat => seat.ready || seat.id === room.hostId);
  const canStart = room.seats.length >= 2 && readyHumans.length === humans.length;
  const [name, setName] = useState(me?.name || '');
  const [avatar, setAvatar] = useState(me?.avatar || AVATARS[0]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(room.settings);

  const usedAvatars = new Set(room.seats.map(seat => seat.avatar).filter(Boolean));

  return (
    <div className="poker-home">
      <div style={{ width: 'min(100%, 520px)', display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
        <button type="button" className="poker-icon-btn" onClick={onExit} aria-label="Keluar dari meja">
          <Icon.Exit size={16} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 900 }}>Ruang Tunggu Banting</div>
          <div style={{ fontSize: 10.5, color: '#a39b8b' }}>
            {room.seats.length}/{BANTING_MAX_SEATS} kursi · {room.settings.decks === 'auto' ? 'set otomatis' : `${room.settings.decks} set`} · {room.settings.turnSeconds}s
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

        {room.lastResult && (
          <div style={{ padding: '8px 12px', background: 'rgba(245, 166, 35, 0.1)', border: '1px solid rgba(245, 166, 35, 0.3)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>🏆</span>
            <div style={{ fontSize: 11, lineHeight: 1.3 }}>
              <span style={{ color: '#ffd18a', fontWeight: 800 }}>Pemenang Game Lalu: </span>
              <b>{room.lastResult.ranking?.[0]?.name || '-'}</b>
              {room.lastResult.loserId && (
                <span style={{ color: '#9ca3af', marginLeft: 6 }}>
                  (Kalah: {room.seats.find(s => s.id === room.lastResult.loserId)?.name || '-'})
                </span>
              )}
            </div>
          </div>
        )}

        <div className="poker-seat-list">
          {room.seats.map((seat, index) => {
            const isMe = seat.id === viewerId;
            const host = seat.id === room.hostId;
            return (
              <div key={seat.id} className={`poker-seat-row ${isMe ? 'is-me' : ''}`}>
                <span className="poker-seat-row__avatar">
                  <AvatarArt avatar={seat.avatar} size={30} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span className="poker-seat-row__name">{seat.name}{isMe ? ' (kamu)' : ''}</span>
                  <span className="poker-seat-row__meta" style={{ display: 'block' }}>
                    Kursi {index + 1}
                    {seat.bot ? ' · bot' : ''}
                    {seat.wins || seat.losses ? ` · ${seat.wins || 0}M / ${seat.losses || 0}K` : ''}
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

        {me ? (
          <div className="poker-actions">
            <button
              type="button"
              className={`poker-btn ${me.ready ? 'poker-btn--ghost' : 'poker-btn--check'}`}
              onClick={() => onIntent({ type: 'ready', ready: !me.ready })}
            >
              {me.ready ? 'BATAL SIAP' : 'SIAP'}
            </button>
            {isHost && (
              <>
                <button
                  type="button"
                  className="poker-btn poker-btn--ghost"
                  onClick={() => onIntent({ type: 'addBot' })}
                  disabled={room.seats.length >= BANTING_MAX_SEATS}
                >
                  <Icon.Plus size={13} /> BOT
                </button>
                <button
                  type="button"
                  className="poker-btn poker-btn--check poker-btn--wide"
                  onClick={() => onIntent({ type: 'start' })}
                  disabled={!canStart}
                >
                  <Icon.Play size={13} /> BAGIKAN KARTU
                </button>
              </>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="poker-label">Duduk di kursi kosong</span>
            <input
              className="poker-field"
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder="Nama panggilan"
              maxLength={18}
            />
            <div className="poker-avatar-grid">
              {AVATARS.slice(0, 8).map(item => (
                <AvatarArtButton
                  key={item}
                  avatar={item}
                  selected={avatar === item}
                  disabled={usedAvatars.has(item)}
                  onClick={() => setAvatar(item)}
                />
              ))}
            </div>
            <button
              type="button"
              className="poker-btn poker-btn--check"
              onClick={() => onIntent({ type: 'sit', name: name.trim(), avatar })}
              disabled={!name.trim()}
            >
              DUDUK
            </button>
          </div>
        )}

        {isHost && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="button"
              className="poker-btn poker-btn--ghost"
              style={{ minHeight: 36 }}
              onClick={() => {
                setDraft(room.settings);
                setEditing(value => !value);
              }}
            >
              <Icon.Gear size={13} /> {editing ? 'TUTUP ATURAN' : 'ATURAN MEJA'}
            </button>
            {editing && (
              <>
                <div className="poker-settings-grid">
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <span className="poker-label">Waktu giliran</span>
                    <select
                      className="poker-select"
                      value={draft.turnSeconds}
                      onChange={event => setDraft({ ...draft, turnSeconds: Number(event.target.value) })}
                    >
                      {TURN_OPTIONS.map(option => <option key={option} value={option}>{option} detik</option>)}
                    </select>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <span className="poker-label">Set kartu</span>
                    <select
                      className="poker-select"
                      value={draft.decks}
                      onChange={event => setDraft({ ...draft, decks: event.target.value })}
                    >
                      {DECK_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                    </select>
                  </label>
                </div>
                <label className="banting-check">
                  <input
                    type="checkbox"
                    checked={draft.fiveAnyCategory !== false}
                    onChange={event => setDraft({ ...draft, fiveAnyCategory: event.target.checked })}
                  />
                  <span>
                    Lima kartu bebas jenis (aturan Capsa): flush boleh menimpa straight.
                    Matikan kalau di meja kamu wajib jenis sama.
                  </span>
                </label>
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

        <div className="poker-note">
          {room.seats.length < 2
            ? 'Butuh minimal 2 pemain (boleh 1 manusia + 1 bot) untuk membagi kartu.'
            : canStart
              ? 'Semua siap — host bisa membagikan kartu.'
              : 'Menunggu semua pemain menekan SIAP.'}
        </div>
      </div>

      <div className="poker-card-panel">
        <span className="poker-label">Riwayat meja</span>
        <div className="poker-log">
          {(room.log || []).slice(-12).reverse().map((line, index) => (
            <span key={`${line}-${index}`}>{line}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
