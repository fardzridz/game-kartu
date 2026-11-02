/**
 * Hook obrolan meja main.
 *
 * KENAPA HOOK, BUKAN DI DALAM PANEL: kanal harus hidup walaupun panel sedang
 * tertutup. Kalau listener dipasang di dalam panel (yang cuma mount saat
 * dibuka), pemain tidak akan pernah tahu ada pesan masuk — badge dan ticker
 * mustahil muncul. Jadi listener tinggal di sini, UI tinggal menampilkan.
 *
 * Pola kanal mengikuti `openEphemeralChannel` (RTDB saat online,
 * BroadcastChannel saat mode simulasi lokal). Tidak pernah menyentuh transaksi
 * state room utama, jadi tidak ada risiko konflik `rev`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { openEphemeralChannel } from '../services/ephemeralChannel.js';
import { serverNow } from '../services/realtimeService.js';
import { sanitizeChatText, sanitizeName } from '../utils/chatFilter.js';
import { makeId } from '../utils/id.js';
import {
  TABLE_CHAT_CHANNEL,
  TABLE_CHAT_COOLDOWN_MS,
  TABLE_CHAT_HISTORY,
  TABLE_CHAT_NODE,
  TABLE_CHAT_RETAIN_MS,
  TABLE_CHAT_TICKER_MS,
  appendMessage,
  cooldownLeftAt,
  pruneExpired,
  sendGate,
  toChatEntry,
} from '../utils/tableChat.js';

/**
 * @param {object} options
 * @param {string|null} options.roomCode
 * @param {string|null} options.viewerId - id pemain lokal; null = penonton.
 * @param {string} [options.myName]
 * @param {string} [options.myAvatar]
 * @returns {object} state + aksi obrolan meja.
 */
export default function useTableChat({ roomCode = null, viewerId = null, myName = '', myAvatar = '' }) {
  const [messages, setMessages] = useState([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => serverNow());
  const [ticker, setTicker] = useState(null);

  const channelRef = useRef(null);
  const seenRef = useRef(new Set());
  const lastSentRef = useRef(0);
  const clientIdRef = useRef(makeId());

  const canChat = Boolean(roomCode && viewerId);

  // --- Kanal -------------------------------------------------------------
  useEffect(() => {
    if (!canChat) return undefined;

    const channel = openEphemeralChannel({
      roomCode,
      nodeName: TABLE_CHAT_NODE,
      channelName: TABLE_CHAT_CHANNEL,
      selfClientId: clientIdRef.current,
      staleMs: TABLE_CHAT_RETAIN_MS,
      retainMs: TABLE_CHAT_RETAIN_MS,
      limit: TABLE_CHAT_HISTORY,
      onEvent: payload => {
        const entry = toChatEntry(payload, viewerId);
        if (!entry.text) return;
        if (seenRef.current.has(entry.id)) return;
        seenRef.current.add(entry.id);
        if (seenRef.current.size > 80) {
          seenRef.current = new Set([...seenRef.current].slice(-40));
        }

        setMessages(prev => appendMessage(prev, entry, TABLE_CHAT_HISTORY));
        if (!entry.mine) {
          setUnread(count => count + 1);
          // Ticker: pesan masuk kelihatan walau panel tertutup.
          setTicker({ id: entry.id, name: entry.name, text: entry.text });
        }
      },
    });

    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      channel.close();
    };
  }, [canChat, roomCode, viewerId]);

  // --- Ticker hilang sendiri ---------------------------------------------
  useEffect(() => {
    if (!ticker) return undefined;
    const timer = setTimeout(() => setTicker(null), TABLE_CHAT_TICKER_MS);
    return () => clearTimeout(timer);
  }, [ticker]);

  // --- Jam untuk cooldown & pemangkasan umur pesan ------------------------
  useEffect(() => {
    if (!cooldownUntil) return undefined;
    const timer = setInterval(() => setNow(serverNow()), 200);
    return () => clearInterval(timer);
  }, [cooldownUntil]);

  useEffect(() => {
    const timer = setInterval(() => {
      const current = serverNow();
      setNow(current);
      setMessages(prev => {
        const next = pruneExpired(prev, current, TABLE_CHAT_RETAIN_MS);
        return next.length === prev.length ? prev : next;
      });
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const cooldownLeft = cooldownLeftAt(cooldownUntil, now);

  /**
   * Kirim pesan. Teks TIDAK dihapus kalau gagal — pemain bisa memperbaiki.
   *
   * @param {string} raw
   * @returns {'sent'|'empty'|'blocked'|'cooling'|'failed'}
   */
  const send = useCallback((raw) => {
    if (!canChat) return 'failed';
    const current = serverNow();
    const gate = sendGate(lastSentRef.current, current, TABLE_CHAT_COOLDOWN_MS);
    if (!gate.allowed) {
      setCooldownUntil(gate.until);
      setNow(current);
      return 'cooling';
    }

    const { text, blocked: hasProfanity } = sanitizeChatText(raw);
    if (!text) {
      setError('Tulis dulu pesannya.');
      return 'empty';
    }
    if (hasProfanity) {
      setBlocked(true);
      setError('Pesan mengandung kata kasar. Tolong diubah dulu ya.');
      return 'blocked';
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
      setError('Pesan gagal terkirim. Periksa koneksi lalu coba lagi.');
      return 'failed';
    }

    lastSentRef.current = current;
    setCooldownUntil(current + TABLE_CHAT_COOLDOWN_MS);
    setNow(current);
    setBlocked(false);
    setError('');
    return 'sent';
  }, [canChat, myAvatar, myName, viewerId]);

  const clearError = useCallback(() => setError(''), []);
  /** Dipanggil saat tab obrolan dibuka. */
  const markRead = useCallback(() => setUnread(0), []);
  const dismissTicker = useCallback(() => setTicker(null), []);

  return {
    messages,
    unread,
    error,
    blocked,
    cooldownLeft,
    ticker,
    canChat,
    send,
    clearError,
    markRead,
    dismissTicker,
  };
}
