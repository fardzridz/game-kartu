import React, { useState } from 'react';
import { AvatarArtButton, Icon } from '../components/SvgPrimitives.jsx';
import { AVATARS } from '../engine/roomEngine.js';
import { BOT_LEVEL_OPTIONS, CLOCK_OPTIONS, TURN_OPTIONS } from './chessEngine.js';

export default function ChessHome({
  onCreate,
  onJoin,
  onBack,
  error = '',
  busy = '',
  initialCode = '',
  mode = 'local',
}) {
  const [tab, setTab] = useState(() => (initialCode ? 'join' : 'create'));
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [code, setCode] = useState(() => initialCode || '');
  const [turnSeconds, setTurnSeconds] = useState(60);
  const [clockMinutes, setClockMinutes] = useState(5);
  const [withBot, setWithBot] = useState(1);
  const [botLevel, setBotLevel] = useState('sedang');
  const [asSpectator, setAsSpectator] = useState(false);

  const submitCreate = event => {
    event.preventDefault();
    if (busy) return;
    onCreate({
      name: name.trim(),
      avatar,
      bots: withBot,
      settings: { turnSeconds, clockMinutes, botLevel },
    });
  };

  const submitJoin = event => {
    event.preventDefault();
    if (busy) return;
    onJoin({
      name: name.trim(),
      avatar,
      code: (code || initialCode).trim().toUpperCase(),
      asSpectator,
    });
  };

  return (
    <div className="poker-home">
      <div style={{ width: 'min(100%, 520px)', display: 'flex', alignItems: 'center', gap: 10, paddingTop: 4 }}>
        <button type="button" className="poker-icon-btn" onClick={onBack} aria-label="Kembali ke daftar game">
          <Icon.ArrowBack size={16} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 900, letterSpacing: '-0.01em' }}>Catur BAWASLU 1v1</div>
          <div style={{ fontSize: 10.5, color: '#a39b8b' }}>Duel 2 pemain (Putih vs Hitam) · Penonton &amp; Ejekan Live</div>
        </div>
        <span className={`poker-pill ${mode === 'local' ? '' : 'poker-pill--emerald'}`}>
          {mode === 'firebase' ? 'FIREBASE' : mode === 'relay' ? 'RELAY LOKAL' : 'LOKAL'}
        </span>
      </div>

      <div className="poker-card-panel">
        <div className="poker-tabs">
          <button type="button" className={tab === 'create' ? 'poker-tab is-active' : 'poker-tab'} onClick={() => setTab('create')}>
            BUKA MEJA
          </button>
          <button type="button" className={tab === 'join' ? 'poker-tab is-active' : 'poker-tab'} onClick={() => setTab('join')}>
            GABUNG / TONTON
          </button>
        </div>

        {error && <div className="poker-error">{error}</div>}

        {tab === 'create' ? (
          <form onSubmit={submitCreate} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span className="poker-label">Nama panggilan</span>
              <input
                className="poker-field"
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="Contoh: Far"
                maxLength={18}
                autoComplete="off"
              />
            </label>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span className="poker-label">Potret</span>
              <div className="poker-avatar-grid">
                {AVATARS.map(item => (
                  <AvatarArtButton key={item} avatar={item} selected={avatar === item} onClick={() => setAvatar(item)} />
                ))}
              </div>
            </div>

            <div className="poker-settings-grid">
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span className="poker-label">Timer per langkah</span>
                <select className="poker-select" value={turnSeconds} onChange={event => setTurnSeconds(Number(event.target.value))}>
                  {TURN_OPTIONS.map(option => <option key={option} value={option}>{option} detik</option>)}
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span className="poker-label">Jam Catur (Total)</span>
                <select className="poker-select" value={clockMinutes} onChange={event => setClockMinutes(Number(event.target.value))}>
                  {CLOCK_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span className="poker-label">Lawan awal</span>
                <select className="poker-select" value={withBot} onChange={event => setWithBot(Number(event.target.value))}>
                  <option value={1}>1 Bot AI (Siap Duel)</option>
                  <option value={0}>Tunggu Teman (0 Bot)</option>
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span className="poker-label">Level Bot AI</span>
                <select className="poker-select" value={botLevel} onChange={event => setBotLevel(event.target.value)}>
                  {BOT_LEVEL_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              </label>
            </div>

            <button type="submit" className="poker-btn poker-btn--check" style={{ height: 46 }} disabled={Boolean(busy) || !name.trim()}>
              {busy === 'create' ? 'MEMBUKA MEJA…' : 'BUKA MEJA CATUR ♟️'}
            </button>
            <div className="poker-note">
              Aturan resmi FIDE (Skakmat, Stalemate, Rokade, En Passant, Promosi Pion). Kapasitas 2 pemain
              (Putih vs Hitam) + hingga 8 penonton live yang bisa ikut ngobrol dan lempar stiker ejekan.
            </div>
          </form>
        ) : (
          <form onSubmit={submitJoin} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span className="poker-label">Kode meja (6 karakter)</span>
              <input
                className="poker-field poker-field--code"
                value={code}
                onChange={event => setCode(event.target.value.toUpperCase().slice(0, 6))}
                placeholder="ABC123"
                maxLength={6}
                autoComplete="off"
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span className="poker-label">Nama panggilan</span>
              <input
                className="poker-field"
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="Contoh: Far"
                maxLength={18}
                autoComplete="off"
              />
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span className="poker-label">Potret</span>
              <div className="poker-avatar-grid">
                {AVATARS.map(item => (
                  <AvatarArtButton key={item} avatar={item} selected={avatar === item} onClick={() => setAvatar(item)} />
                ))}
              </div>
            </div>
            <label className="banting-check">
              <input
                type="checkbox"
                checked={asSpectator}
                onChange={event => setAsSpectator(event.target.checked)}
              />
              <span>
                Masuk langsung sebagai <strong>Penonton (Spectator)</strong>. (Kalau kursi pemain sudah penuh 2/2, kamu otomatis masuk sebagai penonton).
              </span>
            </label>
            <button
              type="submit"
              className="poker-btn poker-btn--check"
              style={{ height: 46 }}
              disabled={Boolean(busy) || !name.trim() || code.length !== 6}
            >
              {busy === 'join' ? 'MENYAMBUNG…' : asSpectator ? 'MASUK SEBAGAI PENONTON 👀' : 'GABUNG MEJA CATUR'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
