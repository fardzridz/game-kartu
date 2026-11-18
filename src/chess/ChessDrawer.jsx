import React, { useEffect, useRef, useState } from 'react';
import { AvatarArt, Icon } from '../components/SvgPrimitives.jsx';
import { THROWABLE_ICONS } from '../components/TauntGlyphs.jsx';
import { THROWABLES } from '../utils/tauntAssets.js';
import { CHESS_TAUNTS } from './useChessChat.js';
import { ChessPieceSVG } from './chessPieces.jsx';

const QUICK_PHRASES = ['Langkah bagus!', 'Skak nih bos!', 'Waduh blunder', 'Remis yuk?', 'GGWP!'];

export function ChessChatDrawer({ open, initialTab = 'chat', onClose, chat, room, viewerId, myName }) {
  const [tab, setTab] = useState(initialTab);
  const [draft, setDraft] = useState('');
  const [targetId, setTargetId] = useState(null);
  const listRef = useRef(null);

  const seats = room.seats || [];
  const defaultTarget = seats.find(seat => seat.id !== viewerId)?.id || seats[0]?.id || null;
  const activeTargetId = targetId && seats.some(seat => seat.id === targetId) ? targetId : defaultTarget;
  const activeTarget = seats.find(seat => seat.id === activeTargetId) || seats[0] || null;

  useEffect(() => {
    if (!open) return;
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
    chat.markRead();
  }, [open, chat.messages.length, chat]);

  if (!open) return null;

  const submit = event => {
    event.preventDefault();
    const result = chat.send(draft);
    if (result === 'sent') setDraft('');
  };

  return (
    <div className="poker-overlay poker-overlay--drawer" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="poker-panel poker-drawer" onClick={event => event.stopPropagation()}>
        <div className="poker-panel__title">
          <Icon.Chat size={16} /> Bumbu &amp; Obrolan Catur
          <button type="button" className="poker-icon-btn" style={{ marginLeft: 'auto', width: 28, height: 28, borderRadius: 9 }} onClick={onClose} aria-label="Tutup panel">
            <Icon.Close size={13} />
          </button>
        </div>

        <div className="poker-tabs">
          <button type="button" className={tab === 'chat' ? 'poker-tab is-active' : 'poker-tab'} onClick={() => setTab('chat')}>
            OBROLAN
          </button>
          <button type="button" className={tab === 'taunt' ? 'poker-tab is-active' : 'poker-tab'} onClick={() => setTab('taunt')}>
            EJEKAN
          </button>
          <button type="button" className={tab === 'throw' ? 'poker-tab is-active' : 'poker-tab'} onClick={() => setTab('throw')}>
            LEMPAR STIKER
          </button>
        </div>

        {/* Tiga tab tetap ter-mount dengan atribut hidden agar state input/target terjaga */}
        <div hidden={tab !== 'chat'} style={{ display: tab === 'chat' ? 'flex' : 'none', flexDirection: 'column', gap: 8 }}>
          <div className="poker-chat-list" ref={listRef}>
            {chat.messages.length === 0 && (
              <div className="poker-note">Belum ada obrolan. Pemain maupun penonton bisa mengobrol di sini!</div>
            )}
            {chat.messages.map(message => (
              <div key={message.id} className={`poker-chat-msg ${message.mine ? 'is-mine' : ''}`}>
                <span className="poker-chat-msg__name">{message.mine ? 'Kamu' : message.name}</span>
                <span className="poker-chat-msg__text">{message.text}</span>
              </div>
            ))}
          </div>

          {chat.error && <div className="poker-error">{chat.error}</div>}

          <div className="poker-chips-row">
            {QUICK_PHRASES.map(phrase => (
              <button
                key={phrase}
                type="button"
                className="poker-chip-btn"
                disabled={chat.cooldownLeft > 0}
                onClick={() => chat.send(phrase)}
              >
                {phrase}
              </button>
            ))}
          </div>

          <form className="poker-chat-form" onSubmit={submit}>
            <input
              className="poker-field"
              value={draft}
              onChange={event => setDraft(event.target.value.slice(0, 200))}
              placeholder={`Pesan sebagai ${myName || 'pemain'}…`}
              maxLength={200}
              autoComplete="off"
            />
            <button
              type="submit"
              className="poker-btn poker-btn--check"
              style={{ flex: '0 0 84px', minHeight: 44 }}
              disabled={!draft.trim() || chat.cooldownLeft > 0}
            >
              {chat.cooldownLeft > 0 ? `${Math.ceil(chat.cooldownLeft / 1000)}s` : 'KIRIM'}
            </button>
          </form>
        </div>

        <div hidden={tab !== 'taunt'} style={{ display: tab === 'taunt' ? 'flex' : 'none', flexDirection: 'column', gap: 8 }}>
          <div className="poker-note">
            Ketuk kalimat ejekan untuk memunculkan balon suara di atas meja catur:
          </div>
          <div className="chess-taunt-list">
            {CHESS_TAUNTS.map(item => (
              <button
                key={item.id}
                type="button"
                className="chess-taunt-btn"
                disabled={chat.tauntCooldownLeft > 0}
                onClick={() => {
                  if (chat.sendTaunt(item.text, activeTarget?.id)) onClose();
                }}
              >
                <span>“{item.text}”</span>
              </button>
            ))}
          </div>
          {chat.tauntCooldownLeft > 0 && (
            <div className="poker-note" style={{ textAlign: 'center' }}>
              Tunggu {Math.ceil(chat.tauntCooldownLeft / 1000)} detik sebelum mengejek lagi…
            </div>
          )}
        </div>

        <div hidden={tab !== 'throw'} style={{ display: tab === 'throw' ? 'flex' : 'none', flexDirection: 'column', gap: 10 }}>
          <div className="poker-label">Pilih Sasaran Lemparan</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {seats.map(seat => (
              <button
                key={seat.id}
                type="button"
                className={`poker-chip-btn ${activeTarget?.id === seat.id ? 'is-selected' : ''}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  borderColor: activeTarget?.id === seat.id ? '#2cc597' : undefined,
                  color: activeTarget?.id === seat.id ? '#2cc597' : undefined,
                }}
                onClick={() => setTargetId(seat.id)}
              >
                <AvatarArt avatar={seat.avatar || 'finn'} size={18} />
                <span>{seat.name}{seat.id === viewerId ? ' (kamu)' : ''}</span>
              </button>
            ))}
          </div>

          <div className="poker-label">Pilih Barang Lemparan</div>
          <div className="chess-throw-grid">
            {THROWABLES.map(item => {
              const Glyph = THROWABLE_ICONS[item.id];
              return (
                <button
                  key={item.id}
                  type="button"
                  className="chess-throw-btn"
                  disabled={chat.tauntCooldownLeft > 0 || !activeTarget}
                  onClick={() => {
                    if (chat.sendThrow(item.id, item.label, activeTarget?.id, activeTarget?.name)) {
                      onClose();
                    }
                  }}
                >
                  {Glyph && <Glyph size={28} />}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
          {chat.tauntCooldownLeft > 0 && (
            <div className="poker-note" style={{ textAlign: 'center' }}>
              Cooldown lemparan: {Math.ceil(chat.tauntCooldownLeft / 1000)} detik…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ChessInfoDrawer({ open, onClose, room, viewerId }) {
  const [tab, setTab] = useState('notasi');
  if (!open) return null;

  const seats = room.seats || [];
  const spectators = room.spectators || [];
  const moves = room.match?.moves || [];
  const history = [...(room.history || [])].reverse();

  // Kelompokkan langkah menjadi pasangan Putih & Hitam per nomor langkah penuh
  const movePairs = [];
  for (let i = 0; i < moves.length; i += 2) {
    movePairs.push({
      turnNo: Math.floor(i / 2) + 1,
      white: moves[i],
      black: moves[i + 1] || null,
    });
  }

  return (
    <div className="poker-overlay poker-overlay--drawer" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="poker-panel poker-drawer" onClick={event => event.stopPropagation()}>
        <div className="poker-panel__title">
          <Icon.Trophy size={16} /> Info, Notasi &amp; Penonton
          <button type="button" className="poker-icon-btn" style={{ marginLeft: 'auto', width: 28, height: 28, borderRadius: 9 }} onClick={onClose} aria-label="Tutup info">
            <Icon.Close size={13} />
          </button>
        </div>

        <div className="poker-tabs">
          {[
            { id: 'notasi', label: 'NOTASI' },
            { id: 'skor', label: 'SKOR & PENONTON' },
            { id: 'riwayat', label: 'RIWAYAT' },
            { id: 'aturan', label: 'ATURAN' },
          ].map(item => (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? 'poker-tab is-active' : 'poker-tab'}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === 'notasi' && (
          <div className="poker-seat-list" style={{ maxHeight: 280, overflowY: 'auto' }}>
            {movePairs.length === 0 ? (
              <div className="poker-note">Belum ada langkah yang dijalankan pada babak ini.</div>
            ) : (
              <div className="chess-notation-table">
                {movePairs.map(pair => (
                  <div key={pair.turnNo} className="chess-notation-row">
                    <span className="chess-notation-no">{pair.turnNo}.</span>
                    <span className="chess-notation-san">{pair.white?.san || ''}</span>
                    <span className="chess-notation-san">{pair.black?.san || ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'skor' && (
          <div className="poker-seat-list">
            <div className="poker-label">Kursi Pemain (Putih vs Hitam)</div>
            {seats.map(seat => {
              const color = room.match
                ? (room.match.whiteId === seat.id ? 'w' : 'b')
                : 'w';
              return (
                <div key={seat.id} className={`poker-seat-row ${seat.id === viewerId ? 'is-me' : ''}`}>
                  <span className="poker-seat-row__avatar">
                    <AvatarArt avatar={seat.avatar || 'finn'} size={30} />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span className="poker-seat-row__name" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <ChessPieceSVG type="p" color={color} size={14} />
                      <span>{seat.name}{seat.id === viewerId ? ' (kamu)' : ''}</span>
                    </span>
                    <span className="poker-seat-row__meta" style={{ display: 'block' }}>
                      {seat.wins || 0} Menang · {seat.draws || 0} Remis · {seat.losses || 0} Kalah
                    </span>
                  </span>
                </div>
              );
            })}

            <div className="poker-label" style={{ marginTop: 8 }}>Penonton di Ruangan ({spectators.length})</div>
            {spectators.length === 0 ? (
              <div className="poker-note">Belum ada penonton di meja ini.</div>
            ) : (
              <div className="chess-spectator-chips">
                {spectators.map(spec => (
                  <span key={spec.id} className={`chess-spectator-chip ${spec.id === viewerId ? 'is-me' : ''}`}>
                    <AvatarArt avatar={spec.avatar || 'finn'} size={18} />
                    <span>{spec.name}{spec.id === viewerId ? ' (kamu)' : ''}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'riwayat' && (
          <div className="poker-seat-list">
            {history.length === 0 && <div className="poker-note">Belum ada babak catur yang selesai.</div>}
            {history.map(entry => (
              <div key={entry.no} className="poker-history-row">
                <span className="poker-history-row__no">#{entry.no}</span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 800 }}>{entry.label}</span>
                  <span className="poker-seat-row__meta">{entry.moves} langkah</span>
                </span>
                <span className="banting-badge banting-badge--win">
                  {entry.isDraw ? 'REMIS' : 'MENANG'}
                </span>
              </div>
            ))}
          </div>
        )}

        {tab === 'aturan' && (
          <div className="poker-seat-list">
            <div className="poker-rule-row"><span>Timer per langkah</span><strong>{room.settings.turnSeconds} detik</strong></div>
            <div className="poker-rule-row"><span>Jam Catur Total</span><strong>{room.settings.clockMinutes > 0 ? `${room.settings.clockMinutes} menit` : 'Tanpa Jam Total'}</strong></div>
            <div className="poker-rule-row"><span>Level Bot AI</span><strong>{room.settings.botLevel}</strong></div>
            <div className="poker-rule-row"><span>Babak ke-</span><strong>{room.matchNo || 1}</strong></div>
            <div className="poker-note">
              <strong>Aturan Standar FIDE:</strong>
              <br />
              • <strong>Rokade (Castling):</strong> Raja bergeser 2 petak ke arah Benteng selama keduanya belum pernah bergerak dan tidak sedang/melintasi skak.
              <br />
              • <strong>Promosi Pion:</strong> Pion yang mencapai baris ujung otomatis bisa dipromosikan menjadi Menteri, Benteng, Gajah, atau Kuda.
              <br />
              • <strong>En Passant:</strong> Pion yang maju 2 petak sejajar pion lawan dapat ditangkap menyilang pada langkah berikutnya.
              <br />
              • <strong>Remis (Draw):</strong> Terjadi bila Stalemate (Pat), posisi yang sama berulang 3x, materi tidak cukup untuk skakmat, 50 langkah tanpa tangkapan/gerak pion, atau kedua pemain sepakat damai.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
