import React from 'react';
import { AvatarArt, Icon } from '../components/SvgPrimitives.jsx';
import { FISH_CATALOG, QUICK_EMOTES, RARITY_CONFIG, ROD_CATALOG, getRodById } from './fishingCatalog.js';

export default function FishingDrawer({
  openTab,
  onClose,
  room,
  viewer,
  presence = {},
  onBuyOrEquipRod,
  onSendEmote,
  onAddBot,
  onRemoveBot,
  onCopyInvite,
  copiedInvite = false,
}) {
  if (!openTab) return null;

  const myCoins = viewer?.coins ?? 0;
  const myRodId = viewer?.rodId || ROD_CATALOG[0].id;
  const myOwnedRods = new Set(viewer?.ownedRods || [ROD_CATALOG[0].id]);
  const myInventory = viewer?.inventory || [];

  return (
    <div className="nusa-drawer-backdrop select-none" onClick={onClose} role="dialog" aria-modal="true">
      <div className="nusa-drawer" onClick={e => e.stopPropagation()}>
        <header className="nusa-drawer__head">
          <div className="nusa-drawer__title">
            {openTab === 'bag' && '🎒 Tas Ikan & Ensiklopedia Nusantara'}
            {openTab === 'shop' && '🎣 Toko Joran Nusantara'}
            {openTab === 'players' && `⚓ Daftar Pemancing Dermaga (${room?.seats?.length || 0}/10)`}
            {openTab === 'emote' && '💬 Kirim Stiker Reaksi Cepat'}
          </div>
          <button type="button" className="nusa-icon-btn" onClick={onClose} aria-label="Tutup panel">
            <Icon.Close size={14} />
          </button>
        </header>

        <div className="nusa-drawer__body">
          {openTab === 'bag' && (
            <div className="nusa-drawer__section">
              <div className="nusa-bag-summary">
                <div>
                  <span className="nusa-bag-summary__label">Total Tangkapan</span>
                  <strong>{viewer?.totalCaught || 0} ekor</strong>
                </div>
                <div>
                  <span className="nusa-bag-summary__label">Rekor Terberat</span>
                  <strong>
                    {viewer?.bestCatch ? `${viewer.bestCatch.fishName} (${viewer.bestCatch.weightKg} kg)` : 'Belum ada'}
                  </strong>
                </div>
              </div>

              <h3 className="nusa-subhead">Tangkapan Terakhir di Tas ({myInventory.length})</h3>
              {myInventory.length === 0 ? (
                <div className="nusa-empty">Belum ada ikan di tasmu. Lempar kail sekarang!</div>
              ) : (
                <div className="nusa-fish-list">
                  {myInventory.map(item => {
                    const rCfg = RARITY_CONFIG[item.rarity] || RARITY_CONFIG.common;
                    return (
                      <div key={item.uid} className="nusa-fish-row">
                        <div className="nusa-fish-row__badge" style={{ borderColor: rCfg.color, color: rCfg.color }}>
                          {rCfg.badge}
                        </div>
                        <div className="nusa-fish-row__info">
                          <div className="nusa-fish-row__name">{item.fishName}</div>
                          <div className="nusa-fish-row__meta">{item.region} · {item.weightKg} kg</div>
                        </div>
                        <div className="nusa-fish-row__coins">+{item.coins} 🪙</div>
                      </div>
                    );
                  })}
                </div>
              )}

              <h3 className="nusa-subhead" style={{ marginTop: 14 }}>Koleksi Ikan Lokal Indonesia</h3>
              <div className="nusa-catalog-grid">
                {FISH_CATALOG.map(fish => {
                  const caughtCount = myInventory.filter(i => i.fishId === fish.id).length;
                  const rCfg = RARITY_CONFIG[fish.rarity] || RARITY_CONFIG.common;
                  return (
                    <div key={fish.id} className={`nusa-catalog-card ${caughtCount > 0 ? 'is-caught' : ''}`}>
                      <div className="nusa-catalog-card__top">
                        <span className="nusa-catalog-card__rarity" style={{ color: rCfg.color }}>{rCfg.label}</span>
                        <span className="nusa-catalog-card__count">{caughtCount > 0 ? `${caughtCount}x` : '—'}</span>
                      </div>
                      <div className="nusa-catalog-card__name">{fish.name}</div>
                      <div className="nusa-catalog-card__region">{fish.region} · {fish.minKg}–{fish.maxKg} kg</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {openTab === 'shop' && (
            <div className="nusa-drawer__section">
              <div className="nusa-shop-wallet">
                <span>Saldo Koin Kamu:</span>
                <strong>🪙 {myCoins} Koin</strong>
              </div>
              <div className="nusa-rod-list">
                {ROD_CATALOG.map(rod => {
                  const owned = myOwnedRods.has(rod.id);
                  const equipped = myRodId === rod.id;
                  const canAfford = myCoins >= rod.price;
                  return (
                    <div key={rod.id} className={`nusa-rod-card ${equipped ? 'is-equipped' : ''}`}>
                      <div className="nusa-rod-card__main">
                        <div className="nusa-rod-card__title" style={{ color: rod.color }}>
                          Lv.{rod.level} · {rod.name}
                        </div>
                        <div className="nusa-rod-card__desc">{rod.desc}</div>
                        <div className="nusa-rod-card__stats">
                          <span>Catch Bar +{rod.barBonus}%</span>
                          <span>Tahan Senar +{Math.round(rod.tensionResist * 100)}%</span>
                          <span>Hoki +{Math.round(rod.luckBonus * 100)}%</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className={`nusa-rod-card__btn ${equipped ? 'is-active' : owned ? 'is-owned' : ''}`}
                        disabled={equipped || (!owned && !canAfford)}
                        onClick={() => onBuyOrEquipRod(rod)}
                      >
                        {equipped ? 'DIPAKAI' : owned ? 'PASANG' : `BELI (${rod.price} 🪙)`}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {openTab === 'players' && (
            <div className="nusa-drawer__section">
              <div className="nusa-room-share">
                <div>
                  <div className="nusa-room-share__title">{room?.title}</div>
                  <div className="nusa-room-share__code">Kode Room: <strong>{room?.code}</strong></div>
                </div>
                <button type="button" className="nusa-share-btn" onClick={onCopyInvite}>
                  <Icon.Copy size={13} />
                  <span>{copiedInvite ? 'Tersalin!' : 'Salin Undangan'}</span>
                </button>
              </div>

              <div className="nusa-bot-controls">
                <button
                  type="button"
                  className="nusa-mini-btn"
                  onClick={onAddBot}
                  disabled={(room?.seats?.length || 0) >= 10}
                >
                  + Tambah Teman Bot
                </button>
                <button
                  type="button"
                  className="nusa-mini-btn nusa-mini-btn--muted"
                  onClick={onRemoveBot}
                  disabled={!room?.seats?.some(s => s.bot)}
                >
                  − Kurangi Bot
                </button>
              </div>

              <div className="nusa-player-list">
                {(room?.seats || []).map(seat => {
                  const rod = getRodById(seat.rodId);
                  const isOnline = seat.bot || presence?.[seat.id]?.online !== false;
                  const stateLabel = seat.state === 'reeling'
                    ? '🔥 STRIKE! Tarik-ulur'
                    : seat.state === 'waiting'
                      ? '🌊 Menunggu umpan'
                      : seat.state === 'casting'
                        ? '🎯 Mengayun kail'
                        : seat.state === 'result'
                          ? '🐟 Baru dapat ikan!'
                          : '⚓ Bersantai di dermaga';
                  return (
                    <div key={seat.id} className="nusa-player-row">
                      <div className="nusa-player-row__avatar">
                        <AvatarArt avatar={seat.avatar} size={36} />
                      </div>
                      <div className="nusa-player-row__info">
                        <div className="nusa-player-row__name">
                          {seat.name}
                          {seat.id === viewer?.id && <span className="nusa-tag">KAMU</span>}
                          {seat.bot && <span className="nusa-tag nusa-tag--bot">BOT</span>}
                          {!isOnline && <span className="nusa-tag nusa-tag--off">OFF</span>}
                        </div>
                        <div className="nusa-player-row__sub">
                          {stateLabel} · {rod.name}
                        </div>
                      </div>
                      <div className="nusa-player-row__stats">
                        <div>🐟 {seat.totalCaught || 0}</div>
                        <div className="nusa-player-row__coins">🪙 {seat.coins || 0}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {openTab === 'emote' && (
            <div className="nusa-drawer__section">
              <div className="nusa-emote-grid">
                {QUICK_EMOTES.map(emote => (
                  <button
                    key={emote.id}
                    type="button"
                    className="nusa-emote-btn"
                    onClick={() => {
                      onSendEmote(emote);
                      onClose();
                    }}
                  >
                    <span className="nusa-emote-btn__icon">{emote.icon}</span>
                    <span className="nusa-emote-btn__label">{emote.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
