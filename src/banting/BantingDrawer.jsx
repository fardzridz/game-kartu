import React, { useEffect, useRef, useState } from 'react';
import CardSVG from '../components/CardSVG.jsx';
import { AvatarArt, Icon } from '../components/SvgPrimitives.jsx';
import { COMBO_RANKING, cardFromNotation } from './ranking.js';

const QUICK_PHRASES = ['Mantap!', 'Skip ah', 'Kartu bagus nih', 'Hoki lu 😅', 'GG'];

export function ChatDrawer({ open, onClose, chat, myName }) {
  const [draft, setDraft] = useState('');
  const listRef = useRef(null);

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
          <Icon.Chat size={16} /> Obrolan Meja
          <button type="button" className="poker-icon-btn" style={{ marginLeft: 'auto', width: 28, height: 28, borderRadius: 9 }} onClick={onClose} aria-label="Tutup obrolan">
            <Icon.Close size={13} />
          </button>
        </div>

        <div className="poker-chat-list" ref={listRef}>
          {chat.messages.length === 0 && (
            <div className="poker-note">Belum ada pesan. Sapa meja dulu — pesan hilang sendiri setelah 5 menit.</div>
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
    </div>
  );
}

export function ScoreDrawer({ open, onClose, room, viewerId }) {
  const [tab, setTab] = useState('papan');
  if (!open) return null;

  const seats = room.seats || [];
  const ranking = [...seats].sort((a, b) => (b.wins || 0) - (a.wins || 0) || (a.losses || 0) - (b.losses || 0));
  const history = [...(room.history || [])].reverse();
  const players = room.hand?.players || [];

  return (
    <div className="poker-overlay poker-overlay--drawer" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="poker-panel poker-drawer" onClick={event => event.stopPropagation()}>
        <div className="poker-panel__title">
          <Icon.Trophy size={16} /> Papan &amp; Aturan
          <button type="button" className="poker-icon-btn" style={{ marginLeft: 'auto', width: 28, height: 28, borderRadius: 9 }} onClick={onClose} aria-label="Tutup papan">
            <Icon.Close size={13} />
          </button>
        </div>

        <div className="poker-tabs">
          {[
            { id: 'papan', label: 'PAPAN' },
            { id: 'riwayat', label: 'RIWAYAT' },
            { id: 'aturan', label: 'ATURAN' },
            { id: 'peringkat', label: 'PERINGKAT' },
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

        {tab === 'papan' && (
          <div className="poker-seat-list">
            {ranking.map((seat, index) => {
              const live = players.find(player => player.id === seat.id);
              return (
                <div key={seat.id} className={`poker-seat-row ${seat.id === viewerId ? 'is-me' : ''}`}>
                  <span className="poker-rank">{index + 1}</span>
                  <span className="poker-seat-row__avatar">
                    <AvatarArt avatar={seat.avatar} size={30} />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span className="poker-seat-row__name">
                      {seat.name}{seat.id === viewerId ? ' (kamu)' : ''}
                    </span>
                    <span className="poker-seat-row__meta" style={{ display: 'block' }}>
                      {seat.wins || 0} menang · {seat.losses || 0} kalah
                      {live ? ` · ${live.hand.length} kartu` : ''}
                      {seat.bot ? ' · bot' : ''}
                    </span>
                  </span>
                  <span className="poker-seat-row__right">
                    {live?.finished && <span className="banting-badge banting-badge--win">HABIS</span>}
                  </span>
                </div>
              );
            })}
            <div className="poker-note">
              Yang kartunya habis duluan menang. Permainan lanjut sampai tinggal satu orang — dia yang kalah.
            </div>
          </div>
        )}

        {tab === 'riwayat' && (
          <div className="poker-seat-list">
            {history.length === 0 && <div className="poker-note">Belum ada permainan yang selesai.</div>}
            {history.map(entry => (
              <div key={entry.no} className="poker-history-row">
                <span className="poker-history-row__no">#{entry.no}</span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 800 }}>{entry.winner}</span>
                  <span className="poker-seat-row__meta">
                    {entry.players} pemain · kalah: {entry.loser}
                  </span>
                </span>
                <span className="banting-badge banting-badge--win">MENANG</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'aturan' && (
          <div className="poker-seat-list">
            <div className="poker-rule-row"><span>Waktu per giliran</span><strong>{room.settings.turnSeconds} detik</strong></div>
            <div className="poker-rule-row"><span>Set kartu</span><strong>{room.hand?.sets || (room.settings.decks === 'auto' ? 'otomatis' : room.settings.decks)}</strong></div>
            <div className="poker-rule-row"><span>Lima kartu</span><strong>{room.settings.fiveAnyCategory ? 'Bebas jenis (Capsa)' : 'Harus jenis sama'}</strong></div>
            <div className="poker-rule-row"><span>Permainan ke-</span><strong>{room.handNo}</strong></div>
            <div className="poker-rule-row"><span>Kursi</span><strong>{room.seats.length} / 8</strong></div>
            <div className="poker-note">
              Kartu dikocok lalu dibagi rata sampai dek habis. Nilai: <strong>2 paling tinggi</strong>,
              lalu A, K, Q, J, 10 … 3. Kembang ♠ &gt; ♥ &gt; ♣ &gt; ♦.
              Menimpa harus jumlah kartu sama dan nilainya lebih tinggi. Kalau tidak bisa, tekan SKIP —
              sekali lewat, kamu keluar dari ronde itu dan baru ikut lagi di ronde berikutnya.
              Kalau semua pemain lain lewat, yang terakhir menaruh kartu mulai ronde baru.
            </div>
          </div>
        )}

        {tab === 'peringkat' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="poker-note">
              Urutan kombinasi dari terkuat ke terlemah. Untuk 5 kartu, kategori lebih tinggi selalu
              menang (flush mengalahkan straight, full house mengalahkan flush, dst).
            </div>
            <div className="poker-ranking">
              {COMBO_RANKING.map(entry => (
                <div key={entry.rank} className="poker-ranking__row">
                  <span className={`poker-ranking__no ${entry.rank <= 3 ? 'is-top' : ''}`}>{entry.rank}</span>
                  <span className="poker-ranking__body">
                    <span className="poker-ranking__name">{entry.name}</span>
                    <span className="poker-ranking__desc">{entry.desc}</span>
                  </span>
                  <span className="poker-ranking__cards">
                    {entry.example.map(notation => (
                      <span key={`${entry.rank}-${notation}`} className="poker-ranking__card">
                        <CardSVG card={cardFromNotation(notation)} />
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
