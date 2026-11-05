/**
 * Obrolan meja Poker Banting.
 *
 * Memakai kanal ephemeral yang sama dengan Jengges, tetapi dengan root
 * `bantingRooms` supaya tidak bertabrakan dengan meja lain. Pesan hidup 5 menit
 * dan tidak pernah menyentuh state permainan.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { openEphemeralChannel } from '../services/ephemeralChannel.js';
import { serverNow } from '../services/realtimeService.js';
import { sanitizeChatText, sanitizeName } from '../utils/chatFilter.js';
import { makeId } from '../utils/id.js';
import {
  TABLE_CHAT_COOLDOWN_MS,
  TABLE_CHAT_HISTORY,
  TABLE_CHAT_RETAIN_MS,
  appendMessage,
  cooldownLeftAt,
  pruneExpired,
  sendGate,
  toChatEntry,
} from '../utils/tableChat.js';

const NODE = 'tableChats';
const CHANNEL = 'banting-table-chats';
const ROOT = 'bantingRooms';

export default function useBantingChat({ roomCode = null, viewerId = null, myName = '', myAvatar = '' }) {
  const [messages, setMessages] = useState([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState('');
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => serverNow());

  const channelRef = useRef(null);
  const seenRef = useRef(new Set());
  const lastSentRef = useRef(0);
  const clientIdRef = useRef(makeId());
  const canChat = Boolean(roomCode && viewerId);

  useEffect(() => {
    if (!canChat) return undefined;
    const channel = openEphemeralChannel({
      roomCode,
      nodeName: NODE,
      channelName: CHANNEL,
      root: ROOT,
      selfClientId: clientIdRef.current,
      staleMs: TABLE_CHAT_RETAIN_MS,
      retainMs: TABLE_CHAT_RETAIN_MS,
      limit: TABLE_CHAT_HISTORY,
      onEvent: payload => {
        const entry = toChatEntry(payload, viewerId);
        if (!entry.text) return;
        if (seenRef.current.has(entry.id)) return;
        seenRef.current.add(entry.id);
        if (seenRef.current.size > 80) seenRef.current = new Set([...seenRef.current].slice(-40));
        setMessages(prev => appendMessage(prev, entry, TABLE_CHAT_HISTORY));
        if (!entry.mine) setUnread(count => count + 1);
      },
    });
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      channel.close();
    };
  }, [canChat, roomCode, viewerId]);

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

  const send = useCallback(raw => {
    if (!canChat) return 'failed';
    const current = serverNow();
    const gate = sendGate(lastSentRef.current, current, TABLE_CHAT_COOLDOWN_MS);
    if (!gate.allowed) {
      setCooldownUntil(gate.until);
      setNow(current);
      return 'cooling';
    }
    const text = sanitizeChatText(raw);
    if (!text) {
      setError('Tulis dulu pesannya.');
      return 'empty';
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
    setError('');
    return 'sent';
  }, [canChat, myAvatar, myName, viewerId]);

  const markRead = useCallback(() => setUnread(0), []);

  return {
    messages,
    unread,
    error,
    canChat,
    cooldownLeft: cooldownLeftAt(cooldownUntil, now),
    send,
    markRead,
  };
}
