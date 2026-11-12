import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AvatarArt } from '../components/SvgPrimitives.jsx';
import {
  MONOPOLY_TILES,
  PROPERTY_GROUPS,
} from './monopolyCatalog.js';
import {
  calculateNetWorth,
  hasFullColorGroup,
} from './monopolyEngine.js';
import { DiceSVG, HotelSVG, HouseSVG } from './monopolyPieces.jsx';
import { play } from '../sound/soundFX.js';
import { vibrate } from '../utils/haptics.js';

export default function MonopolyTable({ room, viewerId, onIntent }) {
  const seats = room.seats || [];
  const currentSeat = seats[room.turnIndex] || seats[0] || null;
  const isMyTurn = currentSeat?.id === viewerId;

  // Kamera Pan & Zoom (Overview, Follow, Pinch to zoom)
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [followCamera, setFollowCamera] = useState(true);
  const boardContainerRef = useRef(null);

  // Modal inspeksi properti
  const [inspectedTile, setInspectedTile] = useState(null);

  // SFX lempar dadu & aksi
  const prevDiceRef = useRef(room.dice);
  useEffect(() => {
    if (prevDiceRef.current !== room.dice) {
      prevDiceRef.current = room.dice;
      play('shuffle');
      vibrate(25);
    }
  }, [room.dice]);

  const currentSeatPos = currentSeat?.position;
  // Auto follow kamera ke bidak yang sedang giliran bila followCamera aktif
  useEffect(() => {
    if (!followCamera || currentSeatPos === undefined) return;
    const targetEl = document.querySelector(`[data-tile-index="${currentSeatPos}"]`);
    if (targetEl && boardContainerRef.current) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }
  }, [currentSeatPos, followCamera]);

  const tileAtCurrentPos = MONOPOLY_TILES[currentSeat?.position || 0];
  const currentProp = room.properties?.[currentSeat?.position || 0];

  // Tombol aksi yang tersedia untuk pemain lokal
  const canRoll = isMyTurn && room.turnPhase === 'roll' && room.status === 'playing';
  const canEndTurn = isMyTurn && room.turnPhase === 'action' && room.status === 'playing';
  const canBuy = isMyTurn
    && room.turnPhase === 'action'
    && ['property', 'station', 'utility'].includes(tileAtCurrentPos?.type)
    && currentProp
    && !currentProp.ownerId
    && currentSeat.cash >= (tileAtCurrentPos.price || 0);

  const canPayJailFine = isMyTurn && currentSeat?.inJail && currentSeat.cash >= 50;
  const canUseJailCard = isMyTurn && currentSeat?.inJail && currentSeat.jailCards > 0;

  const currentCash = currentSeat?.cash || 0;
  // Cek apakah ada tanah milik pemain yang bisa di-upgrade rumah
  const upgradeableTiles = useMemo(() => {
    if (!isMyTurn || room.turnPhase !== 'action') return [];
    return MONOPOLY_TILES.filter(t => {
      if (t.type !== 'property' || !t.houseCost) return false;
      const p = room.properties[t.index];
      return p?.ownerId === viewerId && p.houses < 5 && hasFullColorGroup(room, viewerId, t.group) && currentCash >= t.houseCost;
    });
  }, [isMyTurn, room, viewerId, currentCash]);

  return (
    <main className="monopoly-arena">
      {/* HUD Atas: Status Giliran & Kartu Aktif */}
      <div className="monopoly-turn-strip">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
          <div className="avatar-squircle-ring ring-green" style={{ width: 34, height: 34, flexShrink: 0 }}>
            <AvatarArt avatar={currentSeat?.avatar || 'finn'} size={34} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 900, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{currentSeat?.name}{isMyTurn ? ' (Kamu)' : ''}</span>
              {currentSeat?.inJail && <span className="monopoly-tag is-jail">PENJARA</span>}
              {currentSeat?.bankrupt && <span className="monopoly-tag is-bankrupt">BANGKRUT</span>}
            </div>
            <div style={{ fontSize: 10.5, color: '#f5a623', fontWeight: 800 }}>
              Kas: Rp {currentSeat?.cash} · Aset: Rp {calculateNetWorth(room, currentSeat?.id)}
            </div>
          </div>
        </div>

        {/* Tampilan Dadu Terakhir */}
        <div className="monopoly-dice-display">
          <DiceSVG value={room.dice[0]} size={28} isDouble={room.dice[0] === room.dice[1]} />
          <DiceSVG value={room.dice[1]} size={28} isDouble={room.dice[0] === room.dice[1]} />
          {room.doubleCount > 0 && <span className="monopoly-double-badge">DOUBLE!</span>}
        </div>
      </div>

      {/* Kartu Kesempatan / Dana Umum yang Sedang Muncul */}
      {room.activeCard && (
        <div className={`monopoly-card-alert ${room.activeCard.kind === 'chance' ? 'is-chance' : 'is-chest'}`}>
          <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {room.activeCard.kind === 'chance' ? '❓ KESEMPATAN' : '📦 DANA UMUM'}
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 800, marginTop: 2 }}>
            {room.activeCard.text}
          </div>
        </div>
      )}

      {/* Kontrol Kamera Papan (Zoom, Follow, Overview) */}
      <div className="monopoly-cam-bar">
        <button
          type="button"
          className={`monopoly-cam-btn ${followCamera ? 'is-active' : ''}`}
          onClick={() => setFollowCamera(v => !v)}
          title="Otomatis ikuti langkah bidak giliran"
        >
          <span>{followCamera ? '📍 Following' : '📌 Free Cam'}</span>
        </button>
        <button
          type="button"
          className="monopoly-cam-btn"
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
            setFollowCamera(false);
          }}
          title="Tampilkan peta monopoli global utuh"
        >
          <span>Peta Global</span>
        </button>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          <button
            type="button"
            className="monopoly-cam-btn"
            onClick={() => setZoom(z => Math.max(0.6, z - 0.2))}
            title="Perkecil zoom"
          >
            -
          </button>
          <span style={{ fontSize: 10.5, fontWeight: 800, alignSelf: 'center', minWidth: 32, textAlign: 'center' }}>
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            className="monopoly-cam-btn"
            onClick={() => setZoom(z => Math.min(2.0, z + 0.2))}
            title="Perbesar zoom"
          >
            +
          </button>
        </div>
      </div>

      {/* Papan Monopoli 40 Petak Prosedural */}
      <div className="monopoly-board-wrapper" ref={boardContainerRef}>
        <div
          className="monopoly-board"
          style={{
            transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
            transformOrigin: 'center center',
          }}
        >
          {/* Petak Papan 0..39 disusun melingkar searah jarum jam */}
          {MONOPOLY_TILES.map(tile => {
            const prop = room.properties?.[tile.index];
            const owner = prop?.ownerId ? room.seats.find(s => s.id === prop.ownerId) : null;
            const playersHere = seats.filter(s => !s.bankrupt && s.position === tile.index);
            const groupMeta = tile.group ? PROPERTY_GROUPS[tile.group] : null;

            return (
              <div
                key={tile.index}
                data-tile-index={tile.index}
                className={`monopoly-tile monopoly-tile--${tile.type} tile-pos-${tile.index}`}
                onClick={() => setInspectedTile(tile)}
              >
                {/* Header Warna Komplek */}
                {groupMeta && (
                  <div
                    className="monopoly-tile__header"
                    style={{ backgroundColor: groupMeta.color }}
                  >
                    {prop?.houses > 0 && prop.houses < 5 && (
                      <div className="monopoly-house-row">
                        {Array.from({ length: prop.houses }).map((_, i) => (
                          <HouseSVG key={i} size={11} />
                        ))}
                      </div>
                    )}
                    {prop?.houses === 5 && <HotelSVG size={13} />}
                  </div>
                )}

                <div className="monopoly-tile__body">
                  {tile.flag && <span className="monopoly-tile__flag">{tile.flag}</span>}
                  <span className="monopoly-tile__name">{tile.name}</span>
                  {tile.price && <span className="monopoly-tile__price">Rp {tile.price}</span>}
                  {tile.cost && <span className="monopoly-tile__price">Rp {tile.cost}</span>}
                  {tile.label && <span className="monopoly-tile__label">{tile.label}</span>}
                </div>

                {/* Badge Pemilik Tanah */}
                {owner && (
                  <div className="monopoly-owner-badge" style={{ backgroundColor: owner.color || '#2cc597' }}>
                    {owner.name.slice(0, 3)}
                  </div>
                )}

                {/* Bidak Pemain yang Sedang Berada di Petak Ini */}
                {playersHere.length > 0 && (
                  <div className="monopoly-tokens-row">
                    {playersHere.map(p => (
                      <div
                        key={p.id}
                        className="monopoly-token-pip"
                        style={{ borderColor: p.color || '#2cc597' }}
                        title={`${p.name} (Rp ${p.cash})`}
                      >
                        <AvatarArt avatar={p.avatar} size={15} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Pusat Meja Monopoli */}
          <div className="monopoly-board__center">
            <div className="monopoly-center-logo">
              <span style={{ fontSize: 28 }}>🎩</span>
              <span className="monopoly-center-title">MONOPOLI</span>
              <span className="monopoly-center-sub">BAWASLU TONGKRONGAN</span>
            </div>
          </div>
        </div>
      </div>

      {/* Dock Bar Aksi Bawah */}
      <div className="monopoly-action-dock">
        {canRoll && (
          <button
            type="button"
            className="poker-btn poker-btn--check poker-btn--wide"
            onClick={() => onIntent({ type: 'roll' })}
          >
            🎲 LEMPAR DADU
          </button>
        )}

        {canBuy && (
          <button
            type="button"
            className="poker-btn poker-btn--check"
            style={{ backgroundColor: '#0284c7', borderColor: '#38bdf8' }}
            onClick={() => onIntent({ type: 'buy' })}
          >
            🏢 BELI {tileAtCurrentPos.name} (Rp {tileAtCurrentPos.price})
          </button>
        )}

        {canPayJailFine && (
          <button
            type="button"
            className="poker-btn poker-btn--ghost"
            onClick={() => onIntent({ type: 'payJailFine' })}
          >
            💸 BAYAR DENDA (Rp 50)
          </button>
        )}

        {canUseJailCard && (
          <button
            type="button"
            className="poker-btn poker-btn--check"
            onClick={() => onIntent({ type: 'useJailCard' })}
          >
            🎟️ KARTU BEBAS
          </button>
        )}

        {upgradeableTiles.length > 0 && (
          <button
            type="button"
            className="poker-btn poker-btn--ghost"
            style={{ color: '#22c55e', borderColor: '#22c55e' }}
            onClick={() => onIntent({ type: 'upgrade', tileIndex: upgradeableTiles[0].index })}
          >
            🏗️ BANGUN {upgradeableTiles[0].name} (Rp {upgradeableTiles[0].houseCost})
          </button>
        )}

        {canEndTurn && (
          <button
            type="button"
            className="poker-btn poker-btn--ghost"
            onClick={() => onIntent({ type: 'endTurn' })}
          >
            AKHIRI GILIRAN ⏩
          </button>
        )}

        {!isMyTurn && room.status === 'playing' && (
          <div className="monopoly-wait-banner">
            Menunggu <strong>{currentSeat?.name || 'pemain lain'}</strong> melangkah…
          </div>
        )}
      </div>

      {/* Modal Detail Properti / Kartu Sewa */}
      {inspectedTile && (
        <div className="poker-overlay" role="dialog" aria-modal="true" onClick={() => setInspectedTile(null)}>
          <div className="poker-panel" style={{ maxWidth: 330 }} onClick={e => e.stopPropagation()}>
            <div
              className="poker-panel__title"
              style={{
                backgroundColor: inspectedTile.group ? PROPERTY_GROUPS[inspectedTile.group]?.color : undefined,
                color: inspectedTile.group ? '#fff' : undefined,
                padding: '8px 12px',
                borderRadius: '10px 10px 0 0',
                margin: '-14px -14px 10px',
              }}
            >
              {inspectedTile.flag} {inspectedTile.name}
            </div>

            {inspectedTile.type === 'property' && (
              <div className="monopoly-rent-table">
                <div className="monopoly-rent-row"><span>Sewa Tanah Kosong:</span><strong>Rp {inspectedTile.baseRent}</strong></div>
                <div className="monopoly-rent-row"><span>1 Rumah:</span><strong>Rp {inspectedTile.rents[0]}</strong></div>
                <div className="monopoly-rent-row"><span>2 Rumah:</span><strong>Rp {inspectedTile.rents[1]}</strong></div>
                <div className="monopoly-rent-row"><span>3 Rumah:</span><strong>Rp {inspectedTile.rents[2]}</strong></div>
                <div className="monopoly-rent-row"><span>4 Rumah:</span><strong>Rp {inspectedTile.rents[3]}</strong></div>
                <div className="monopoly-rent-row is-hotel"><span>HOTEL:</span><strong>Rp {inspectedTile.rents[4]}</strong></div>
                <div className="monopoly-rent-row"><span>Biaya Bangun Rumah/Hotel:</span><strong>Rp {inspectedTile.houseCost}</strong></div>
              </div>
            )}

            {['station', 'utility'].includes(inspectedTile.type) && (
              <div className="poker-note">
                Harga Beli: Rp {inspectedTile.price}. Sewa berlipat ganda sesuai jumlah stasiun/utilitas yang dimiliki pemilik!
              </div>
            )}

            <button
              type="button"
              className="poker-btn poker-btn--check"
              style={{ width: '100%', marginTop: 10 }}
              onClick={() => setInspectedTile(null)}
            >
              TUTUP
            </button>
          </div>
        </div>
      )}

      {/* Modal Akhir Permainan (Juara Monopoli) */}
      {room.status === 'round-end' && (
        <div className="poker-overlay" role="dialog" aria-modal="true">
          <div className="poker-panel" style={{ maxWidth: 380, textAlign: 'center' }}>
            <div style={{ fontSize: 44 }}>🏆</div>
            <div className="poker-panel__title" style={{ justifyContent: 'center' }}>
              RAJA MONOPOLI TONGKRONGAN!
            </div>
            <div className="poker-note" style={{ fontSize: 13, color: '#fde68a', margin: '8px 0 14px' }}>
              {room.seats.find(s => !s.bankrupt)?.name || 'Pemenang'} berhasil memonopoli seluruh aset dan membuat lawan bangkrut!
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
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
                style={{ flex: 1.2 }}
                onClick={() => onIntent({ type: 'start' })}
              >
                MAIN LAGI 🎲
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
