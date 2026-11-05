import React, { useEffect, useState } from 'react';
import { AvatarArtButton, Icon } from '../components/SvgPrimitives.jsx';
import { AVATARS } from '../engine/roomEngine.js';
import { DECK_OPTIONS, TURN_OPTIONS } from './bantingEngine.js';

export default function BantingHome({
  onCreate,
  onJoin,
  onBack,
  error = '',
  busy = '',
  initialCode = '',
  mode = 'local',
}) {
  const [tab, setTab] = useState(initialCode ? 'join' : 'create');
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [code, setCode] = useState(initialCode);
  const [turnSeconds, setTurnSeconds] = useState(30);
  const [decks, setDecks] = useState('auto');
  const [bots, setBots] = useState(2);

  useEffect(() => {
    if (initialCode) {
      setTab('join');
      setCode(prev => prev || initialCode);
    }
  }, [initialCode]);

  const submitCreate = event => {
    event.preventDefault();
    if (busy) return;
    onCreate({
      name: name.trim(),
      avatar,
      bots,
      settings: { turnSeconds, decks, fiveAnyCategory: true },
    });
  };

  const submitJoin = event => {
    event.preventDefault();
    if (busy) return;
    onJoin({ name: name.trim(), avatar, code: code.trim().toUpperCase() });
  };

  return (
    <div className="poker-home">
      <div style={{ width: 'min(100%, 520px)', display: 'flex', alignItems: 'center', gap: 10, paddingTop: 4 }}>
        <button type="button" className="poker-icon-btn" onClick={onBack} aria-label="Kembali ke daftar game">
          <Icon.ArrowBack size={16} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 900, letterSpacing: '-0.01em' }}>Poker Banting</div>
          <div style={{ fontSize: 10.5, color: '#a39b8b' }}>Capsa · buang kartu, habis duluan menang</div>
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
            GABUNG
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
                placeholder="Contoh: Ridz"
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
                <span className="poker-label">Waktu giliran</span>
                <select className="poker-select" value={turnSeconds} onChange={event => setTurnSeconds(Number(event.target.value))}>
                  {TURN_OPTIONS.map(option => <option key={option} value={option}>{option} detik</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span className="poker-label">Set kartu</span>
                <select className="poker-select" value={decks} onChange={event => setDecks(event.target.value)}>
                  {DECK_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span className="poker-label">Bot pengisi</span>
                <select className="poker-select" value={bots} onChange={event => setBots(Number(event.target.value))}>
                  {[0, 1, 2, 3, 4, 5, 6, 7].map(option => <option key={option} value={option}>{option} bot</option>)}
                </select>
              </label>
            </div>

            <button type="submit" className="poker-btn poker-btn--check" style={{ height: 46 }} disabled={Boolean(busy) || !name.trim()}>
              {busy === 'create' ? 'MEMBUKA MEJA…' : 'BUKA MEJA BANTING'}
            </button>
            <div className="poker-note">
              Kartu dibagi rata sampai dek habis. Pemegang 3♦ mulai duluan. Yang kartunya habis
              duluan menang; yang terakhir masih pegang kartu kalah.
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
                placeholder="Contoh: Ridz"
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
            <button
              type="submit"
              className="poker-btn poker-btn--check"
              style={{ height: 46 }}
              disabled={Boolean(busy) || !name.trim() || code.length !== 6}
            >
              {busy === 'join' ? 'MENYAMBUNG…' : 'GABUNG MEJA'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
