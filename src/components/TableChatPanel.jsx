/**
 * Tab obrolan di dalam panel "Bumbu Tongkrongan" (meja main).
 *
 * KENAPA DI DALAM MODAL, BUKAN PANEL PERMANEN: layar HP 360x640 tidak punya
 * ruang untuk panel chat tetap — kartu tangan dan tombol aksi harus tetap
 * terlihat. Karena itu obrolan menumpang di sheet yang sudah ada (Ejek), dan
 * keyboard hanya muncul saat pemain memang mau mengetik.
 *
 * ATURAN YANG TIDAK BOLEH DILANGGAR:
 *   - Teks dirender sebagai teks murni (React escape otomatis). Tidak ada
 *     injeksi HTML mentah di file ini, dan jangan pernah ditambahkan.
 *   - Timer giliran TIDAK di-pause saat pemain mengetik. Itu celah curang:
 *     pemain bisa menunda giliran sesuka hati. Karena itu ada pengingat kecil
 *     di atas daftar pesan.
 *   - Frasa cepat disediakan supaya pemain bisa bicara tanpa keyboard.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_CHAT_LENGTH } from '../utils/chatFilter.js';
import { QUICK_PHRASES } from '../utils/tableChat.js';
import { AvatarArt, Icon } from './SvgPrimitives.jsx';

const clock = ts => {
  const value = Number(ts) || 0;
  if (!value) return '';
  const date = new Date(value % 86400000);
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
};

/**
 * Isi tab obrolan meja.
 *
 * @param {object} props
 * @param {object} props.chat - hasil `useTableChat` (state + aksi).
 * @param {boolean} [props.active] - tab sedang dilihat (untuk menandai terbaca).
 */
export default function TableChatPanel({ chat, active = true }) {
  const [draft, setDraft] = useState('');
  const listRef = useRef(null);

  const { messages, cooldownLeft, error, blocked, cmdFeedback, send, clearError, clearCmdFeedback, markRead } = chat;
  const cooldownSeconds = cooldownLeft > 0 ? Math.ceil(cooldownLeft / 1000) : 0;

  // Tab dibuka = pesan dianggap terbaca.
  useEffect(() => {
    if (active) markRead();
  }, [active, markRead, messages.length]);

  // Auto-scroll ke pesan terbaru.
  useEffect(() => {
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages.length, active]);

  const handleSend = useCallback(() => {
    const result = send(draft);
    // 'command' = ketikan berawalan "/" sudah diurus engine, bukan pesan obrolan.
    if (result === 'sent' || result === 'command') setDraft('');
  }, [draft, send]);

  const handleQuick = useCallback((phrase) => {
    send(phrase);
  }, [send]);

  const handleKeyDown = useCallback((event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const remaining = MAX_CHAT_LENGTH - draft.length;
  const sendDisabled = !draft.trim() || cooldownSeconds > 0;

  return (
    <div className="tkfx-chat">
      <p className="tkfx-chat__note" role="note">
        ⏱ Timer giliran tetap jalan. Kirim cepat, lalu tutup panel.
      </p>

      <div
        className="tkfx-chat__list"
        ref={listRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Obrolan meja"
      >
        {messages.length === 0 ? (
          <p className="tkfx-chat__empty">Belum ada obrolan. Sapa temanmu!</p>
        ) : (
          messages.map(item => (
            <div key={item.id} className={`tkfx-chat__msg ${item.mine ? 'is-mine' : ''}`}>
              <span className="tkfx-chat__avatar" aria-hidden="true">
                <AvatarArt avatar={item.avatar || 'jake'} size={20} />
              </span>
              <div className="tkfx-chat__body">
                <span className="tkfx-chat__meta">
                  <span className="tkfx-chat__name">{item.mine ? 'Kamu' : item.name}</span>
                  <span className="tkfx-chat__time">{clock(item.ts)}</span>
                </span>
                {/* Teks murni — React meng-escape sendiri. */}
                <span className="tkfx-chat__text">{item.text}</span>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="tkfx-chat__quick" role="group" aria-label="Frasa cepat">
        {QUICK_PHRASES.map(phrase => (
          <button
            key={phrase}
            type="button"
            className="tkfx-chat__phrase"
            onClick={() => handleQuick(phrase)}
            disabled={cooldownSeconds > 0}
          >
            {phrase}
          </button>
        ))}
      </div>

      {/* Balasan perintah slash. Bukan pesan obrolan: hanya pemakai yang
          melihat ini (hilang sendiri setelah 6 detik), tidak pernah dikirim
          ke lawan. Jangan diberi label/hint apa pun di UI — perintahnya
          rahasia. */}
      {cmdFeedback && (
        <p
          className={`tkfx-chat__cmd ${cmdFeedback.ok ? 'is-ok' : 'is-fail'}`}
          role="status"
        >
          {cmdFeedback.text}
        </p>
      )}

      <div className="tkfx-chat__composer">
        <label className="sr-only" htmlFor="tkfx-chat-input">Tulis pesan</label>
        <input
          id="tkfx-chat-input"
          className="tkfx-chat__input"
          type="text"
          value={draft}
          onChange={event => {
            setDraft(event.target.value.slice(0, MAX_CHAT_LENGTH));
            if (error) clearError();
            if (cmdFeedback) clearCmdFeedback();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Tulis pesan…"
          maxLength={MAX_CHAT_LENGTH}
          autoComplete="off"
          enterKeyHint="send"
        />
        <button
          type="button"
          className="tkfx-chat__send"
          onClick={handleSend}
          disabled={sendDisabled}
          aria-label="Kirim pesan"
        >
          {cooldownSeconds > 0 ? `${cooldownSeconds}s` : <Icon.Send size={15} />}
        </button>
      </div>

      <div className="tkfx-chat__footer">
        <span className={`tkfx-chat__counter ${remaining <= 20 ? 'is-low' : ''}`}>
          {draft.length}/{MAX_CHAT_LENGTH}
        </span>
        {cooldownSeconds > 0 && (
          <span className="tkfx-chat__hint" role="status">
            Tunggu {cooldownSeconds} detik lagi
          </span>
        )}
        {error && (
          <span className={`tkfx-chat__error ${blocked ? 'is-blocked' : ''}`} role="alert">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Ticker pesan masuk saat panel tertutup.
 *
 * Tanpa ini obrolan meja praktis tidak berguna: pemain tidak akan membuka
 * panel hanya untuk memeriksa apakah ada pesan. Ketuk ticker = buka tab
 * obrolan.
 *
 * @param {object} props
 * @param {{id: string, name: string, text: string}|null} props.ticker
 * @param {() => void} props.onOpen
 */
export function TableChatTicker({ ticker, onOpen }) {
  if (!ticker) return null;
  return (
    <button type="button" className="tkfx-ticker" onClick={onOpen}>
      <span className="tkfx-ticker__name">{ticker.name}</span>
      <span className="tkfx-ticker__text">{ticker.text}</span>
    </button>
  );
}
