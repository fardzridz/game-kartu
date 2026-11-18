/**
 * Obrolan & Ejekan/Lemparan (Taunt) meja Catur BAWASLU.
 *
 * Terbuka untuk kedua pemain (Putih/Hitam) maupun semua penonton (Spectator)
 * di dalam ruangan. Menggunakan kanal ephemeral dengan root `chessRooms`
 * sehingga tidak menyentuh transaksi state papan utama.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { openEphemeralChannel } from '../services/ephemeralChannel.js';
import { serverNow } from '../services/realtimeService.js';
import { sanitizeChatText, sanitizeName } from '../utils/chatFilter.js';
import { makeId } from '../utils/id.js';
import { play } from '../sound/soundFX.js';
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

const CHAT_NODE = 'tableChats';
const CHAT_CHANNEL = 'chess-table-chats';
const TAUNT_NODE = 'taunts';
const TAUNT_CHANNEL = 'chess-taunts';
const ROOT = 'chessRooms';
const TAUNT_COOLDOWN_MS = 3500;
const TAUNT_TTL_MS = 4200;

export const CHESS_TAUNTS = [
  { id: 'lamun', text: 'Mikir apa ngelamun bos? Keburu subuh!' },
  { id: 'skak', text: 'Awas Raja masuk angin, SKAK dulu bosku!' },
  { id: 'blunder', text: 'Waduh blundernya kelihatan dari kecamatan sebelah!' },
  { id: 'kuda', text: 'Hati-hati kuda lumping siap melompat!' },
  { id: 'kopi', text: 'Kopi udah dingin nih, cepetan jalan elah!' },
  { id: 'remis', text: 'Kalau udah gemeteran, tawar remis aja bos!' },
  { id: 'menteri', text: 'Titip salam buat Menteri-nya ya bos!' },
  { id: 'ampun', text: 'Ampun Grandmaster, jangan galak-galak...' },
];

export default function useChessChat({
  roomCode = null,
  viewerId = null,
  myName = '',
  myAvatar = '',
  myRole = 'Pemain',
}) {
  const [messages, setMessages] = useState([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState('');
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [tauntCooldownUntil, setTauntCooldownUntil] = useState(0);
  const [tauntEvents, setTauntEvents] = useState([]);
  const [now, setNow] = useState(() => serverNow());

  const chatChannelRef = useRef(null);
  const tauntChannelRef = useRef(null);
  const seenChatRef = useRef(new Set());
  const seenTauntRef = useRef(new Set());
  const lastSentRef = useRef(0);
  const lastTauntRef = useRef(0);
  const clientIdRef = useRef(makeId());
  const canChat = Boolean(roomCode && viewerId);

  useEffect(() => {
    if (!canChat) return undefined;
    const channel = openEphemeralChannel({
      roomCode,
      nodeName: CHAT_NODE,
      channelName: CHAT_CHANNEL,
      root: ROOT,
      selfClientId: clientIdRef.current,
      staleMs: TABLE_CHAT_RETAIN_MS,
      retainMs: TABLE_CHAT_RETAIN_MS,
      limit: TABLE_CHAT_HISTORY,
      onEvent: payload => {
        const entry = toChatEntry(payload, viewerId);
        if (!entry.text) return;
        if (seenChatRef.current.has(entry.id)) return;
        seenChatRef.current.add(entry.id);
        if (seenChatRef.current.size > 80) {
          seenChatRef.current = new Set([...seenChatRef.current].slice(-40));
        }
        setMessages(prev => appendMessage(prev, entry, TABLE_CHAT_HISTORY));
        if (!entry.mine) setUnread(count => count + 1);
      },
    });
    chatChannelRef.current = channel;
    return () => {
      chatChannelRef.current = null;
      channel.close();
    };
  }, [canChat, roomCode, viewerId]);

  useEffect(() => {
    if (!canChat) return undefined;
    const channel = openEphemeralChannel({
      roomCode,
      nodeName: TAUNT_NODE,
      channelName: TAUNT_CHANNEL,
      root: ROOT,
      selfClientId: clientIdRef.current,
      staleMs: 12000,
      retainMs: 15000,
      limit: 12,
      onEvent: payload => {
        if (!payload || !payload.id) return;
        if (seenTauntRef.current.has(payload.id)) return;
        seenTauntRef.current.add(payload.id);
        if (seenTauntRef.current.size > 60) {
          seenTauntRef.current = new Set([...seenTauntRef.current].slice(-30));
        }
        const expireAt = serverNow() + TAUNT_TTL_MS;
        setTauntEvents(prev => [...prev.slice(-4), { ...payload, expireAt }]);
        play(payload.type === 'throw' ? 'discard' : 'click');
      },
    });
    tauntChannelRef.current = channel;
    return () => {
      tauntChannelRef.current = null;
      channel.close();
    };
  }, [canChat, roomCode]);

  useEffect(() => {
    if (!cooldownUntil && !tauntCooldownUntil && tauntEvents.length === 0) return undefined;
    const timer = setInterval(() => {
      const current = serverNow();
      setNow(current);
      setTauntEvents(prev => {
        const next = prev.filter(item => item.expireAt > current);
        return next.length === prev.length ? prev : next;
      });
    }, 250);
    return () => clearInterval(timer);
  }, [cooldownUntil, tauntCooldownUntil, tauntEvents.length]);

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
    const baseName = sanitizeName(myName) || 'Pemain';
    const displayRole = myRole === 'Penonton' ? `${baseName} (Penonton)` : baseName;
    const payload = {
      id: makeId(),
      from: viewerId,
      name: displayRole.slice(0, 18),
      avatar: typeof myAvatar === 'string' ? myAvatar.slice(0, 32) : '',
      text,
      ts: current,
    };
    const sent = chatChannelRef.current?.send(payload);
    if (sent === false) {
      setError('Pesan gagal terkirim. Periksa koneksi lalu coba lagi.');
      return 'failed';
    }
    lastSentRef.current = current;
    setCooldownUntil(current + TABLE_CHAT_COOLDOWN_MS);
    setNow(current);
    setError('');
    return 'sent';
  }, [canChat, myAvatar, myName, myRole, viewerId]);

  const sendTaunt = useCallback((tauntText, targetId = null) => {
    if (!canChat) return false;
    const current = serverNow();
    if (current - lastTauntRef.current < TAUNT_COOLDOWN_MS) {
      setTauntCooldownUntil(lastTauntRef.current + TAUNT_COOLDOWN_MS);
      setNow(current);
      return false;
    }
    const payload = {
      id: makeId(),
      type: 'taunt',
      from: viewerId,
      name: (sanitizeName(myName) || 'Pemain').slice(0, 18),
      role: myRole,
      text: String(tauntText || '').slice(0, 120),
      targetId: targetId || null,
      ts: current,
    };
    const ok = tauntChannelRef.current?.send(payload);
    if (ok === false) return false;
    seenTauntRef.current.add(payload.id);
    setTauntEvents(prev => [...prev.slice(-4), { ...payload, expireAt: current + TAUNT_TTL_MS }]);
    play('click');
    lastTauntRef.current = current;
    setTauntCooldownUntil(current + TAUNT_COOLDOWN_MS);
    setNow(current);
    return true;
  }, [canChat, myName, myRole, viewerId]);

  const sendThrow = useCallback((itemId, itemLabel, targetId, targetName) => {
    if (!canChat) return false;
    const current = serverNow();
    if (current - lastTauntRef.current < TAUNT_COOLDOWN_MS) {
      setTauntCooldownUntil(lastTauntRef.current + TAUNT_COOLDOWN_MS);
      setNow(current);
      return false;
    }
    const payload = {
      id: makeId(),
      type: 'throw',
      from: viewerId,
      name: (sanitizeName(myName) || 'Pemain').slice(0, 18),
      role: myRole,
      itemId,
      itemLabel,
      targetId: targetId || null,
      targetName: (targetName || 'Lawan').slice(0, 18),
      text: `melempar ${itemLabel} ke ${targetName || 'meja'}!`,
      ts: current,
    };
    const ok = tauntChannelRef.current?.send(payload);
    if (ok === false) return false;
    seenTauntRef.current.add(payload.id);
    setTauntEvents(prev => [...prev.slice(-4), { ...payload, expireAt: current + TAUNT_TTL_MS }]);
    play('discard');
    lastTauntRef.current = current;
    setTauntCooldownUntil(current + TAUNT_COOLDOWN_MS);
    setNow(current);
    return true;
  }, [canChat, myName, myRole, viewerId]);

  const markRead = useCallback(() => setUnread(0), []);

  return {
    messages,
    unread,
    error,
    canChat,
    cooldownLeft: cooldownLeftAt(cooldownUntil, now),
    tauntCooldownLeft: cooldownLeftAt(tauntCooldownUntil, now),
    tauntEvents,
    send,
    sendTaunt,
    sendThrow,
    markRead,
  };
}
