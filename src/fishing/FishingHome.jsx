import React, { useState } from 'react';
import { AvatarArtButton, Icon } from '../components/SvgPrimitives.jsx';
import { AVATARS } from '../engine/roomEngine.js';
import { PUBLIC_DOCKS, getRodById } from './fishingCatalog.js';

export default function FishingHome({
  profile,
  onJoinPublic,
  onCreatePrivate,
  onJoinPrivate,
  onBack,
  error = '',
  busy = '',
  initialCode = '',
  mode = 'local',
}) {
  const [tab, setTab] = useState(initialCode ? 'private' : 'public');
  const [name, setName] = useState(profile?.name || '');
  const [avatar, setAvatar] = useState(profile?.avatar || AVATARS[0]);
  const [selectedDock, setSelectedDock] = useState(PUBLIC_DOCKS[0].code);
  const [privateCode, setPrivateCode] = useState(initialCode || '');
  const [bots, setBots] = useState(2);

  const activeRod = getRodById(profile?.rodId);

  const handlePublic = event => {
    event.preventDefault();
    if (busy || !name.trim()) return;
    onJoinPublic({
      name: name.trim(),
      avatar,
      code: selectedDock,
      bots,
    });
  };

  const handleCreatePrivate = () => {
    if (busy || !name.trim()) return;
    onCreatePrivate({
      name: name.trim(),
      avatar,
      bots,
    });
  };

  const handleJoinPrivate = event => {
    event.preventDefault();
    if (busy || !name.trim() || privateCode.trim().length !== 6) return;
    onJoinPrivate({
      name: name.trim(),
      avatar,
      code: privateCode.trim().toUpperCase(),
    });
  };

  return (
    <div className="nusa-home select-none">
      <div className="nusa-home__shell">
        <header className="nusa-home__top">
          <button
            type="button"
            className="nusa-icon-btn"
            onClick={onBack}
            aria-label="Kembali ke daftar game"
          >
            <Icon.ArrowBack size={16} />
          </button>
          <div className="nusa-home__brand">
            <div className="nusa-home__title">
              Nusa Strike <span className="nusa-home__tag">2D Mabar</span>
            </div>
            <div className="nusa-home__sub">Dermaga Nusantara · 1–10 Pemancing Realtime</div>
          </div>
          <span className={`nusa-mode-pill ${mode === 'local' ? '' : 'is-live'}`}>
            {mode === 'firebase' ? 'SERVER LIVE' : mode === 'relay' ? 'RELAY LOKAL' : 'SIMULASI LOKAL'}
          </span>
        </header>

        {/* Ringkasan Profil Singkat Pemancing */}
        <section className="nusa-profile-card">
          <div className="nusa-profile-card__stat">
            <span className="nusa-profile-card__label">Koin Dompet</span>
            <strong className="nusa-profile-card__val nusa-profile-card__val--gold">
              🪙 {profile?.coins ?? 100}
            </strong>
          </div>
          <div className="nusa-profile-card__stat">
            <span className="nusa-profile-card__label">Joran Aktif</span>
            <strong className="nusa-profile-card__val" style={{ color: activeRod.color }}>
              🎣 {activeRod.name}
            </strong>
          </div>
          <div className="nusa-profile-card__stat">
            <span className="nusa-profile-card__label">Total Tangkapan</span>
            <strong className="nusa-profile-card__val">
              🐟 {profile?.totalCaught ?? 0} ekor
            </strong>
          </div>
        </section>

        <div className="nusa-panel">
          <div className="nusa-tabs">
            <button
              type="button"
              className={`nusa-tab ${tab === 'public' ? 'is-active' : ''}`}
              onClick={() => setTab('public')}
            >
              🌊 PUBLIC ROOM (DERMAGA)
            </button>
            <button
              type="button"
              className={`nusa-tab ${tab === 'private' ? 'is-active' : ''}`}
              onClick={() => setTab('private')}
            >
              🔑 PRIVATE ROOM
            </button>
          </div>

          {error && <div className="nusa-alert">{error}</div>}

          <div className="nusa-form-group">
            <label className="nusa-label" htmlFor="nusa-angler-name">Nama Panggilan Pemancing</label>
            <input
              id="nusa-angler-name"
              className="nusa-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Contoh: Ridz"
              maxLength={18}
              autoComplete="off"
            />
          </div>

          <div className="nusa-form-group">
            <span className="nusa-label">Pilih Karakter Dermaga</span>
            <div className="nusa-avatar-grid">
              {AVATARS.slice(0, 12).map(item => (
                <AvatarArtButton
                  key={item}
                  avatar={item}
                  selected={avatar === item}
                  onClick={() => setAvatar(item)}
                />
              ))}
            </div>
          </div>

          {tab === 'public' ? (
            <form onSubmit={handlePublic} className="nusa-form-stack">
              <div className="nusa-form-group">
                <span className="nusa-label">Pilih Dermaga Publik (Maks 10 Pemain)</span>
                <div className="nusa-dock-list">
                  {PUBLIC_DOCKS.map(dock => (
                    <button
                      key={dock.code}
                      type="button"
                      className={`nusa-dock-item ${selectedDock === dock.code ? 'is-selected' : ''}`}
                      onClick={() => setSelectedDock(dock.code)}
                    >
                      <div>
                        <div className="nusa-dock-item__name">{dock.name}</div>
                        <div className="nusa-dock-item__meta">Channel #{dock.code} · Drop-in Mabar</div>
                      </div>
                      <span className="nusa-dock-item__badge">BUKA</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="nusa-form-group">
                <label className="nusa-label" htmlFor="nusa-bot-count">Teman Pancing Bot (Peramai Dermaga)</label>
                <select
                  id="nusa-bot-count"
                  className="nusa-select"
                  value={bots}
                  onChange={e => setBots(Number(e.target.value))}
                >
                  {[0, 1, 2, 3, 4, 5].map(n => (
                    <option key={n} value={n}>{n === 0 ? 'Tanpa Bot (Murni Pemain)' : `${n} Pemancing Bot`}</option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="nusa-cta-btn"
                disabled={Boolean(busy) || !name.trim()}
              >
                {busy ? 'MASUK KE DERMAGA…' : '🎣 TERJUN KE DERMAGA PUBLIK'}
              </button>
            </form>
          ) : (
            <div className="nusa-form-stack">
              <form onSubmit={handleJoinPrivate} className="nusa-form-stack">
                <div className="nusa-form-group">
                  <label className="nusa-label" htmlFor="nusa-private-code">Gabung Private Room (Kode 6 Karakter)</label>
                  <div className="nusa-code-row">
                    <input
                      id="nusa-private-code"
                      className="nusa-input nusa-input--code"
                      value={privateCode}
                      onChange={e => setPrivateCode(e.target.value.toUpperCase().slice(0, 6))}
                      placeholder="KODE6X"
                      maxLength={6}
                      autoComplete="off"
                    />
                    <button
                      type="submit"
                      className="nusa-cta-btn nusa-cta-btn--compact"
                      disabled={Boolean(busy) || !name.trim() || privateCode.trim().length !== 6}
                    >
                      GABUNG
                    </button>
                  </div>
                </div>
              </form>

              <div className="nusa-divider"><span>ATAU BUAT DERMAGA PRIVAT BARU</span></div>

              <div className="nusa-form-group">
                <label className="nusa-label" htmlFor="nusa-private-bots">Teman Pancing Bot Awal</label>
                <select
                  id="nusa-private-bots"
                  className="nusa-select"
                  value={bots}
                  onChange={e => setBots(Number(e.target.value))}
                >
                  {[0, 1, 2, 3, 4, 5].map(n => (
                    <option key={n} value={n}>{n} Pemancing Bot</option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                className="nusa-cta-btn nusa-cta-btn--gold"
                onClick={handleCreatePrivate}
                disabled={Boolean(busy) || !name.trim()}
              >
                {busy ? 'MEMBUAT ROOM…' : '✨ BUAT PRIVATE ROOM BARU'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
