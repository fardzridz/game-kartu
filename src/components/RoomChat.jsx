import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { openEphemeralChannel } from '../services/ephemeralChannel.js';
import { serverNow } from '../services/realtimeService.js';
import {
  MAX_CHAT_LENGTH,
  sanitizeChatText,
  sanitizeName,
} from '../utils/chatFilter.js';
import { makeId } from '../utils/id.js';
import { parseSlashCommand } from '../utils/slashCommands.js';
import { AvatarArt, Icon } from './SvgPrimitives.jsx';
import { play } from '../sound/soundFX.js';

// ---------------------------------------------------------------------------
// Obrolan ruang tunggu.
//
// BATASAN PRODUK: chat teks HANYA ada di ruang tunggu, TIDAK di meja main.
// Di meja main, keyboard HP menutupi 40–50% layar sementara timer 45 detik
// tetap berjalan — pemain kehilangan pandangan ke meja lalu kehabisan waktu.
// Di sana sudah ada TauntThrowSystem yang menyelesaikan kebutuhan komunikasi
// tanpa mengetik. Jangan pasang komponen ini di GameBoard.
// ---------------------------------------------------------------------------

/** Rate limit klien: satu pesan per 2 detik. */
const SEND_COOLDOWN_MS = 2000;
/** Umur pesan di RTDB. Host membersihkan sisanya. */
const RETAIN_MS = 30000;
/** Batas riwayat yang diambil/ditampilkan. */
const HISTORY_LIMIT = 20;
/** Interval pembersihan oleh host. */
const SWEEP_INTERVAL_MS = 10000;

const CHANNEL_NAME = 'remi-chats';
const NODE_NAME = 'chats';

const clock = ms => {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

/**
 * Panel obrolan ruang tunggu.
 *
 * @param {object} props
 * @param {object} props.room - state room (butuh `code`).
 * @param {string} props.viewerId - id klien sendiri.
 * @param {string} props.myName - nama tampilan pengirim.
 * @param {string} [props.myAvatar] - id avatar untuk ditampilkan di pesan sendiri.
 * @param {boolean} [props.isHost] - hanya host yang membersihkan node.
 * @param {(code: string, args: string[]) => ({ok?: boolean, message?: string}|undefined)} [props.onCommand]
 *   Penerus perintah slash RAHASIA (mis. penanda sebelum ronde). Ketikan
 *   berawalan "/" tidak pernah dikirim sebagai pesan obrolan.
 */
export default function RoomChat({ room, viewerId, myName, myAvatar, isHost = false, onCommand = null }) {
  // Satu id klien per mount; dipakai menyaring echo BroadcastChannel.
  const clientId = useRef(makeId()).current;

  const [messages, setMessages] = useState([]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  // Balasan perintah slash. Hanya di layar pemakai, hilang sendiri setelah
  // beberapa detik — lawan tidak boleh tahu perintah ini ada.
  const [cmdFeedback, setCmdFeedback] = useState(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => serverNow());
  const [unread, setUnread] = useState(0);

  const listRef = useRef(null);
  const channelRef = useRef(null);
  const lastSentAt = useRef(0);
  // Semua id pesan yang sudah pernah masuk — mencegah duplikat saat channel
  // mengirim ulang (echo + snapshot RTDB untuk pesan sendiri).
  const seenIds = useRef(new Set());

  const roomCode = room?.code || null;
  const canChat = Boolean(viewerId);

  // --- Kanal -------------------------------------------------------------
  useEffect(() => {
    if (!roomCode) return undefined;

    const channel = openEphemeralChannel({
      roomCode,
      nodeName: NODE_NAME,
      channelName: CHANNEL_NAME,
      selfClientId: clientId,
      staleMs: RETAIN_MS,
      retainMs: RETAIN_MS,
      limit: HISTORY_LIMIT,
      onEvent: payload => {
        const id = payload.id || `${payload.from}-${payload.ts}-${payload.text}`;
        if (seenIds.current.has(id)) return;
        seenIds.current.add(id);

        const entry = {
          id,
          from: String(payload.from || ''),
          name: sanitizeName(payload.name) || 'Pemain',
          avatar: typeof payload.avatar === 'string' ? payload.avatar.slice(0, 32) : '',
          text: String(payload.text || '').slice(0, MAX_CHAT_LENGTH),
          ts: Number(payload.ts) || serverNow(),
          mine: payload.from === viewerId,
        };
        setMessages(prev => [...prev, entry].slice(-HISTORY_LIMIT));
        setUnread(count => (entry.mine ? count : count + 1));
        if (!entry.mine) play('turn');
      },
    });

    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      channel.close();
    };
  }, [roomCode, viewerId, clientId]);

  // --- Pembersihan oleh host ---------------------------------------------
  // Hanya SATU klien (host) yang menghapus, supaya tidak ada tabrakan hapus.
  useEffect(() => {
    if (!isHost || !roomCode) return undefined;
    const sweep = setInterval(() => {
      const cutoff = serverNow() - RETAIN_MS;
      setMessages(prev => prev.filter(item => item.ts >= cutoff));
    }, SWEEP_INTERVAL_MS);
    return () => clearInterval(sweep);
  }, [isHost, roomCode]);

  // --- Jam untuk cooldown ------------------------------------------------
  useEffect(() => {
    if (!cooldownUntil) return undefined;
    const timer = setInterval(() => setNow(serverNow()), 200);
    return () => clearInterval(timer);
  }, [cooldownUntil]);

  // Balasan perintah slash hilang sendiri: rahasia tidak boleh menggantung
  // di layar sampai ada yang mengintip.
  useEffect(() => {
    if (!cmdFeedback) return undefined;
    const timer = setTimeout(() => setCmdFeedback(null), 6000);
    return () => clearTimeout(timer);
  }, [cmdFeedback]);

  const cooldownLeft = Math.max(0, cooldownUntil - now);

  // Auto-scroll ke bawah saat ada pesan baru dan panel terbuka.
  useEffect(() => {
    if (!open) return;
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, open]);

  useEffect(() => {
    if (open) setUnread(0);
  }, [open, messages.length]);

  const remaining = MAX_CHAT_LENGTH - draft.length;

  const handleChange = useCallback(event => {
    const value = event.target.value;
    // Batas panjang di klien: cegah mengetik lebih dari 200 karakter.
    setDraft(value.slice(0, MAX_CHAT_LENGTH));
    setError('');
  }, []);

  const handleSend = useCallback(() => {
    if (!canChat) return;
    const current = serverNow();
    if (current - lastSentAt.current < SEND_COOLDOWN_MS) {
      setCooldownUntil(lastSentAt.current + SEND_COOLDOWN_MS);
      return;
    }

    // Perintah slash (RAHASIA, tidak pernah ditampilkan di UI). Dicek sebelum
    // sanitasi & cooldown: bukan pesan, jadi tidak dikirim ke kanal dan tidak
    // memakan jeda 2 detik. Perintah tak dikenal ditelan diam-diam.
    const command = parseSlashCommand(draft);
    if (command.isCommand) {
      if (command.unknown) {
        setDraft('');
        return;
      }
      const result = onCommand?.(command.code, command.args);
      setCmdFeedback({
        ok: result?.ok !== false,
        text: result?.message || (result?.ok === false ? '🃏 nggak bisa.' : '🃏 siap.'),
      });
      setDraft('');
      return;
    }

    // Tanpa penyaringan kata: obrolan tongkrongan dibiarkan bebas, termasuk
    // bahasa daerah (lihat catatan kebijakan di utils/chatFilter.js).
    const text = sanitizeChatText(draft);
    if (!text) {
      setError('Tulis dulu pesannya.');
      return;
    }

    const payload = {
      id: makeId(),
      from: viewerId,
      name: sanitizeName(myName) || 'Pemain',
      avatar: typeof myAvatar === 'string' ? myAvatar.slice(0, 32) : '',
      text,
      ts: current,
    };

    const sent = channelRef.current?.send(payload);
    if (sent === false) {
      // Jangan hilangkan teks yang sudah diketik.
      setError('Pesan gagal terkirim. Periksa koneksi lalu coba lagi.');
      return;
    }

    lastSentAt.current = current;
    setCooldownUntil(current + SEND_COOLDOWN_MS);
    setDraft('');
    setError('');
  }, [canChat, draft, myName, viewerId]);

  const handleKeyDown = useCallback(event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const sorted = useMemo(
    () => messages.slice().sort((a, b) => (a.ts || 0) - (b.ts || 0)),
    [messages],
  );

  if (!roomCode) return null;

  const sendDisabled = !canChat || !draft.trim() || cooldownLeft > 0;

  return (
    <section className={`room-chat ${open ? 'is-open' : ''}`} aria-label="Obrolan ruang tunggu">
      <button
        type="button"
        className="room-chat__toggle"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-controls="room-chat-panel"
      >
        <span className="room-chat__toggle-icon" aria-hidden="true"><Icon.Chat size={16} /></span>
        <span className="room-chat__toggle-label">Obrolan</span>
        {unread > 0 && !open && (
          <span className="room-chat__badge" aria-label={`${unread} pesan baru`}>{unread > 9 ? '9+' : unread}</span>
        )}
        <span className={`room-chat__chevron ${open ? 'is-open' : ''}`} aria-hidden="true">
          <Icon.ChevronDown size={14} />
        </span>
      </button>

      {open && (
        <div className="room-chat__panel" id="room-chat-panel">
          <div className="room-chat__list" ref={listRef} role="log" aria-live="polite" aria-relevant="additions">
            {sorted.length === 0 ? (
              <p className="room-chat__empty">Belum ada obrolan. Sapa temanmu!</p>
            ) : (
              sorted.map(item => (
                <div key={item.id} className={`room-chat__msg ${item.mine ? 'is-mine' : ''}`}>
                  <span className="room-chat__avatar" aria-hidden="true">
                    <AvatarArt
                      avatar={item.mine ? (myAvatar || 'jake') : (item.avatar || 'jake')}
                      size={22}
                    />                  </span>
                  <div className="room-chat__body">
                    <span className="room-chat__meta">
                      <span className="room-chat__name">{item.mine ? 'Kamu' : item.name}</span>
                      <span className="room-chat__time">{clock(item.ts % 86400000)}</span>
                    </span>
                    {/* Teks murni. React meng-escape otomatis, dan file ini
                        sengaja tidak memakai injeksi HTML mentah sama sekali. */}
                    <span className="room-chat__text">{item.text}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="room-chat__composer">
            <label className="sr-only" htmlFor="room-chat-input">Tulis pesan</label>
            <input
              id="room-chat-input"
              className="room-chat__input"
              type="text"
              value={draft}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="Tulis pesan…"
              maxLength={MAX_CHAT_LENGTH}
              autoComplete="off"
              enterKeyHint="send"
              disabled={!canChat}
            />
            <button
              type="button"
              className="room-chat__send"
              onClick={handleSend}
              disabled={sendDisabled}
              aria-label="Kirim pesan"
            >
              {cooldownLeft > 0 ? `${Math.ceil(cooldownLeft / 1000)}s` : <Icon.Send size={15} />}
            </button>
          </div>

          <div className="room-chat__footer">
            <span className={`room-chat__counter ${remaining <= 20 ? 'is-low' : ''}`}>
              {draft.length}/{MAX_CHAT_LENGTH}
            </span>
            {cooldownLeft > 0 && (
              <span className="room-chat__hint" role="status">
                Tunggu {Math.ceil(cooldownLeft / 1000)} detik lagi
              </span>
            )}
            {cmdFeedback && (
              <span className={`room-chat__cmd ${cmdFeedback.ok ? 'is-ok' : 'is-fail'}`} role="status">
                {cmdFeedback.text}
              </span>
            )}
            {error && (
              <span className="room-chat__error" role="alert">{error}</span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
