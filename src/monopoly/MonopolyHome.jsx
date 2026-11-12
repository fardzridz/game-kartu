import React, { useState } from 'react';
import { AvatarArtButton, Icon } from '../components/SvgPrimitives.jsx';
import { AVATARS } from '../engine/roomEngine.js';

export default function MonopolyHome({
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
  const [bots, setBots] = useState(3);
  const [turnSeconds, setTurnSeconds] = useState(45);
  const [startingCash, setStartingCash] = useState(1500);

  const submitCreate = e => {
    e.preventDefault();
    if (busy || !name.trim()) return;
    onCreate({
      name: name.trim(),
      avatar,
      bots,
      settings: { turnSeconds, startingCash },
    });
  };

  const submitJoin = e => {
    e.preventDefault();
    if (busy || !name.trim()) return;
    onJoin({
      name: name.trim(),
      avatar,
      code: (code || initialCode).trim().toUpperCase(),
    });
  };

  return (
    <div className="poker-home">
      <div style={{ width: 'min(100%, 520px)', display: 'flex', alignItems: 'center', gap: 10, paddingTop: 4 }}>
        <button type="button" className="poker-icon-btn" onClick={onBack} aria-label="Kembali ke daftar game">
          <Icon.ArrowBack size={16} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 900, letterSpacing: '-0.01em' }}>Monopoli Tongkrongan</div>
          <div style={{ fontSize: 10.5, color: '#a39b8b' }}>Papan 40 Petak Dunia · Beli Tanah, Bangun Hotel &amp; Cuan!</div>
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
            GABUNG ROOM
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
                onChange={e => setName(e.target.value)}
                placeholder="Contoh: Far"
                maxLength={18}
                autoComplete="off"
              />
            </label>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span className="poker-label">Potret Bidak</span>
              <div className="poker-avatar-grid">
                {AVATARS.map(item => (
                  <AvatarArtButton key={item} avatar={item} selected={avatar === item} onClick={() => setAvatar(item)} />
                ))}
              </div>
            </div>

            <div className="poker-settings-grid">
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span className="poker-label">Bot Pengisi Awal</span>
                <select className="poker-select" value={bots} onChange={e => setBots(Number(e.target.value))}>
                  {[0, 1, 2, 3, 4, 5, 6, 7].map(n => (
                    <option key={n} value={n}>{n} Bot AI</option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span className="poker-label">Timer Giliran</span>
                <select className="poker-select" value={turnSeconds} onChange={e => setTurnSeconds(Number(e.target.value))}>
                  {[30, 45, 60, 90].map(s => (
                    <option key={s} value={s}>{s} detik</option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span className="poker-label">Modal Awal</span>
                <select className="poker-select" value={startingCash} onChange={e => setStartingCash(Number(e.target.value))}>
                  <option value={1000}>Rp 1.000 (Cepat)</option>
                  <option value={1500}>Rp 1.500 (Standar)</option>
                  <option value={2000}>Rp 2.000 (Sultan)</option>
                </select>
              </label>
            </div>

            <button type="submit" className="poker-btn poker-btn--check" style={{ height: 46 }} disabled={Boolean(busy) || !name.trim()}>
              {busy === 'create' ? 'MEMBUKA MEJA…' : 'BUKA MEJA MONOPOLI 🎩'}
            </button>
            <div className="poker-note">
              Papan 40 petak negara dunia standar. Mendukung kontrol zoom/geser kamera 2 jari di HP, tombol Follow Bidak, lempar dadu, beli tanah, bangun rumah/hotel, dan kartu kocak tongkrongan!
            </div>
          </form>
        ) : (
          <form onSubmit={submitJoin} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span className="poker-label">Kode meja (6 karakter)</span>
              <input
                className="poker-field poker-field--code"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase().slice(0, 6))}
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
                onChange={e => setName(e.target.value)}
                placeholder="Contoh: Far"
                maxLength={18}
                autoComplete="off"
              />
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span className="poker-label">Potret Bidak</span>
              <div className="poker-avatar-grid">
                {AVATARS.map(item => (
                  <AvatarArtButton key={item} avatar={item} selected={avatar === item} onClick={() => setAvatar(item)} />
                ))}
              </div>
            </div>
            <button
              type="submit"
              className="poker-btn poker-btn--check"
              style={{ height: 46 }}
              disabled={Boolean(busy) || !name.trim() || code.length !== 6}
            >
              {busy === 'join' ? 'MENYAMBUNG…' : 'GABUNG MEJA MONOPOLI'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
