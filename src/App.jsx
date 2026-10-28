import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Lobby from './components/Lobby.jsx';
import RoomLobby from './components/RoomLobby.jsx';
import GameBoard from './components/GameBoard.jsx';
import HealthMonitor from './components/HealthMonitor.jsx';
import ConfirmDialog from './components/ConfirmDialog.jsx';
import { applyIntent, createRoom, DEFAULT_AVATAR, normalizeAvatar } from './engine/roomEngine.js';
import { makeId } from './utils/id.js';
import { setConnectionSnapshot } from './utils/connectionStatus.js';
import { createRealtimeService, explainFirebaseError, firebaseStartupError, firebaseConfigBroken, isFirebaseConfigured, firebaseActive, friendlyConnectionMessage, probeDatabase, serverNow } from './services/realtimeService.js';
import './App.css';

const SESSION_KEY = 'remi-session';
const session = {
  save(roomCode, playerId) {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify({ roomCode, playerId })); } catch { /* ignore */ }
  },
  load() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
  },
  clear() {
    try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  },
};

// Antrean intent saat koneksi putus. Aksi pemain TIDAK dibuang dan TIDAK
// dipaksakan ke mode lokal: disimpan sebentar, dikirim ulang begitu server
// kembali. Hanya "mulai permainan" yang ditahan karena butuh semua pemain online.
const PENDING_KEY = 'remi-pending-intent';
const pending = {
  save(intent) {
    try { localStorage.setItem(PENDING_KEY, JSON.stringify({ intent, at: serverNow() })); } catch { /* ignore */ }
  },
  take() {
    try {
      const raw = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');
      localStorage.removeItem(PENDING_KEY);
      // Lewat 20 detik aksi lama dibuang supaya tidak "hidup lagi" di ronde lain.
      if (!raw?.intent || !raw.at || serverNow() - raw.at > 20000) return null;
      return raw.intent;
    } catch { return null; }
  },
  clear() {
    try { localStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
  },
};

export function normalizeRoom(r) {
  if (!r) return r;
  const seats = (r.seats || []).map(s => ({
    ...s,
    // state lama masih menyimpan emoji avatar → id potret baru
    avatar: normalizeAvatar(s.avatar) || s.avatar,
    hand: s.hand || [],
    melds: s.melds || [],
  }));
  const game = r.game ? {
    ...r.game,
    players: (r.game.players || []).map(p => ({
      ...p,
      hand: p.hand || [],
      melds: p.melds || [],
    })),
    discardPile: r.game.discardPile || [],
    drawPile: r.game.drawPile || [],
  } : null;
  return {
    ...r,
    seats,
    actions: r.actions || [],
    game,
  };
}

function DiagnosticModal({ diagnostic, onSwitchLocal, onDismiss }) {
  return (
    <ConfirmDialog
      open={Boolean(diagnostic)}
      title={diagnostic?.title || 'Terjadi error'}
      message={diagnostic?.detail || ''}
      confirmLabel={diagnostic?.switchable ? '⚡ Beralih ke Mode Simulasi Lokal' : 'Coba Lagi'}
      cancelLabel="Tutup"
      onConfirm={() => (diagnostic?.switchable ? onSwitchLocal() : onDismiss())}
      onCancel={onDismiss}
    />
  );
}

// ---------------------------------------------------------------------------
// Koneksi: banner & layar tunggu (menggantikan modal yang memaksa mode lokal)
// ---------------------------------------------------------------------------
function ConnectionBanner({ connection, sound, mode, onRetry }) {
  // Mode lokal memang tidak pernah "online": banner itu hanya untuk meja server.
  if (mode === 'local' || connection === 'connected') return null;
  const connecting = connection === 'connecting';
  return (
    <div className={`connection-banner ${connecting ? 'is-connecting' : 'is-offline'}`} role="status" aria-live="polite">
      <span className="connection-banner__dot" aria-hidden="true" />
      <span className="connection-banner__text">
        {connecting ? friendlyConnectionMessage('timeout') : friendlyConnectionMessage('offline')}
        {sound && <span className="connection-banner__sub"> — aksimu disimpan dan dikirim otomatis setelah tersambung.</span>}
      </span>
      <button type="button" className="connection-banner__btn" onClick={onRetry}>Coba Lagi</button>
    </div>
  );
}

function ConnectingScreen({ connection, onRetry, onNewTable }) {
  const connecting = connection === 'connecting';
  return (
    <main className="arena-canvas h-dvh w-full flex flex-col items-center justify-center gap-5 px-6 text-white text-center">
      <div className={`connection-spinner ${connecting ? '' : 'is-offline'}`} aria-hidden="true" />
      <div className="max-w-sm">
        <h1 className="text-lg font-extrabold tracking-tight">
          {connecting ? 'Menghubungkan ke server…' : 'Koneksi terputus'}
        </h1>
        <p className="text-xs sm:text-sm text-periwinkleMuted mt-1.5 leading-relaxed">
          {connecting
            ? 'Sebentar ya — meja kamu masih aman. Kursi dan kartu akan kembali persis seperti terakhir.'
            : 'Periksa internet kamu. Kami terus mencoba menghubungkan ulang secara otomatis; kursimu tidak akan hilang.'}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2.5">
        <button type="button" className="lobby-danger-btn px-5" onClick={onRetry}>Coba Lagi Sekarang</button>
        <button type="button" className="lobby-icon-btn w-auto px-4 text-xs font-bold" onClick={onNewTable}>Buka Meja Baru</button>
      </div>
    </main>
  );
}

export default function App() {
  const [service, setService] = useState(null);
  const [room, setRoom] = useState(null);
  const [viewerId, setViewerId] = useState(null);
  const [presence, setPresence] = useState({});
  const [diagnostic, setDiagnostic] = useState(null);
  const [healthOpen, setHealthOpen] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [initialCode, setInitialCode] = useState('');
  // 'connected' | 'connecting' | 'disconnected' — refleksi nyata dari server,
  // bukan tebakan dari satu request yang gagal.
  const [connection, setConnection] = useState('connecting');
  // Banner "menghubungkan ulang" di layar, menggantikan modal yang memaksa lokal.
  const [connectingNotice, setConnectingNotice] = useState(false);
  const [_now, setNow] = useState(() => serverNow());
  const roomRef = useRef(null);
  const intentLock = useRef(false);

  useEffect(() => { roomRef.current = room; }, [room]);

  // Jam global untuk timer giliran & deteksi timeout (1 detik).
  useEffect(() => {
    const interval = setInterval(() => setNow(serverNow()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Panel audit: Alt + A
  useEffect(() => {
    const onKey = event => {
      if (event.altKey && (event.key === 'a' || event.key === 'A')) {
        event.preventDefault();
        setHealthOpen(open => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Keluar sengaja menyimpan sesi. Saat aplikasi dibuka lagi, langsung coba
  // pulihkan kursi (skor, kartu) tanpa perlu mengingat kode meja.
  useEffect(() => {
    const saved = session.load();
    if (!saved?.roomCode || !saved?.playerId) return undefined;
    const timer = setTimeout(() => { reconnect().catch(() => {}); }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Presence bertahan lintas reconnect/dedupe: tulis ulang tiap 15 detik SELAMA
  // tersambung. Kalau belum tersambung, efek re-connect yang mengirimnya
  // (lihat effect di bawah) — jadi tidak ada tulis yang terbuang.
  useEffect(() => {
    if (!service || !viewerId) return undefined;
    service.setPresence(true);
    const beat = () => {
      if (service.connection?.() !== 'connected') return;
      service.setPresence(!document.hidden);
    };
    // 15 detik: hemat bandwidth Firebase ±3x dibanding heartbeat 5 detik lama.
    // Status "terputus" baru muncul setelah ±45 detik tanpa heartbeat, jadi
    // jeda 15 detik masih aman (toleran 2-3 heartbeat hilang).
    const timer = setInterval(beat, 15000);
    const onVisible = () => beat();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [service, viewerId]);

  // Kirim intent lewat transaksi atomik (Turn Lock di sisi otoritas state).
  const sendIntent = useCallback(
    async intent => {
      if (!service) return;
      // Offline: jangan buang aksi pemain, simpan & kirim ulang setelah tersambung.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        pending.save(intent);
        return;
      }
      if (intentLock.current) return;
      intentLock.current = true;
      try {
        await service.transact(current => {
          const next = applyIntent(current, intent, viewerId, serverNow());
          return next.error ? null : next.room;
        });
        pending.clear();
      } catch (error) {
        // Transaksi Firebase menunggu server; error di sini berarti gangguan
        // jaringan, bukan kesalahan pemain. Simpan dan biarkan SDK reconnect.
        const networkish = !error?.code || /network|unavailable|disconnect|timeout|offline/i.test(String(error.code || error.message || ''));
        if (networkish) {
          pending.save(intent);
          setConnection(prev => (prev === 'connected' ? 'connecting' : prev));
        } else {
          const explained = error?.title ? error : explainFirebaseError(error);
          setDiagnostic({ ...explained, switchable: true });
        }
      } finally {
        intentLock.current = false;
      }
    },
    [service, viewerId]
  );

  // Status koneksi real dari SDK (atau navigator di mode lokal).
  useEffect(() => {
    if (!service) return undefined;
    const stop = service.subscribeConnection(setConnection);
    // Jaring pengaman ringan: sinkronkan dari service tiap detik (service yang
    // melakukan pengecekan jaringan tiap 10 detik, bukan komponen ini).
    const poll = setInterval(() => {
      const next = service.connection?.();
      if (next) setConnection(next);
    }, 4000);
    return () => { stop?.(); clearInterval(poll); };
  }, [service]);

  // Begitu tersambung lagi: kirim ulang aksi yang tertahan, lalu ambil alih
  // kursi bila kita sempat dinilai offline oleh server.
  useEffect(() => {
    if (!service || connection !== 'connected' || !viewerId) return;
    // Setelah tersambung lagi, onDisconnect harus dipasang ulang (server
    // melepas semua handler saat socket putus).
    service.rearmPresence?.().then(() => service.setPresence?.(!document.hidden)).catch(() => {});
    const queued = pending.take();
    if (queued) {
      sendIntent(queued).catch(() => {});
      return;
    }
    if (room?.status === 'playing') {
      const mySeat = room.seats.find(seat => seat.id === viewerId);
      if (mySeat && !mySeat.bot && (mySeat.afk || mySeat.online === false)) {
        sendIntent({ type: 'reclaim' }).catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, service, viewerId]);

  const attach = useCallback(
    adapter => {
      // lepas koneksi sebelumnya supaya tidak ada dua listener aktif
      setService(prev => {
        if (prev && prev !== adapter) prev.close();
        return adapter;
      });
      adapter.subscribe(
        value => {
          if (value) setRoom(normalizeRoom(value));
        },
        error => setDiagnostic({ ...error, switchable: true })
      );
      adapter.watchPresence(setPresence);
    },
    []
  );

  // Watcher Bot & Timeout (spec §4.2): siapa pun boleh memicu, engine yang
  // menjaga bahwa hanya kursi bot/AFK/timeout yang benar-benar dieksekusi.
  useEffect(() => {
    if (!service || !room) return undefined;
    const tick = async () => {
      const current = roomRef.current;
      if (!current || current.status !== 'playing' || !current.game) return;
      // Offline: jangan antre bot/timeout — aksi itu basi begitu pemain kembali
      // dan hanya akan menghukumnya. Tunggu sampai server tersambung lagi.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      if (service.connection?.() === 'disconnected') return;
      // Kalau kursi kita sendiri ditandai AFK padahal tab ini terlihat & kita
      // masih duduk, klaim kembali kursi secara otomatis (jangan menunggu
      // klik manual atau sampai giliran kita diambil bot).
      const mySeat = current.seats.find(seat => seat.id === viewerId);
      if (mySeat && !mySeat.bot && (mySeat.afk || mySeat.online === false) && !document.hidden) {
        await sendIntent({ type: 'reclaim' });
        return;
      }
      if (serverNow() < (current.game.dealingUntil || 0)) return;
      const turnSeat = current.seats.find(seat => seat.id === current.game.players[current.game.turn]?.id);
      const shouldRunBot = Boolean(current.game.players[current.game.turn]?.bot) || turnSeat?.afk || turnSeat?.online === false;
      const expired = serverNow() - current.lastActionAt > current.turnSeconds * 1000;
      if (shouldRunBot || expired) {
        await sendIntent({ type: shouldRunBot ? 'bot' : 'timeout' });
      }
    };
    const timer = setInterval(tick, 1500);
    return () => clearInterval(timer);
  }, [service, room, sendIntent, viewerId]);

  const create = useCallback(
    async ({ name, depth, bots, avatar }) => {
      if (firebaseActive()) {
        // Cek cepat hanya untuk masalah setting (DB belum dibuat). Jaringan
        // lambat / putus sementara tidak boleh memaksa pindah ke mode lokal.
        const probe = await probeDatabase();
        if (!probe.ok) {
          if (firebaseConfigBroken || probe.problem?.code === 'DATABASE_NOT_FOUND') {
            setDiagnostic({ ...probe.problem, switchable: true });
            return;
          }
          setDiagnostic({ ...probe.problem, switchable: false, detail: `${probe.problem.detail} Game akan mencoba menghubungkan ulang otomatis.` });
          return;
        }
      }
      const code = Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
      const id = makeId();
      const state = createRoom({ code, hostId: id, name, avatar, maxDepth: depth });
      const adapter = createRealtimeService(code, id);
      try {
        await adapter.create(state);
      } catch (error) {
        adapter.close();
        setDiagnostic({ ...explainFirebaseError(error), switchable: true });
        return;
      }
      session.save(code, id);
      setViewerId(id);
      attach(adapter);
      setRoom(normalizeRoom(state));
      for (let index = 0; index < bots; index += 1) {
        await sendIntentFor(adapter, id, { type: 'add-bot' });
      }
    },
    [attach]
  );

  // Helper add-bot saat create (sebelum state viewerId terpasang)
  async function sendIntentFor(adapter, actorId, intent) {
    try {
      await adapter.transact(current => {
        const next = applyIntent(current, intent, actorId, serverNow());
        return next.error ? null : next.room;
      });
    } catch { /* bot kosmetik: gagal diabaikan */ }
  }

  const join = useCallback(
    async ({ name, code, avatar }) => {
      if (firebaseActive()) {
        // Cek cepat hanya untuk masalah setting (DB belum dibuat). Jaringan
        // lambat / putus sementara tidak boleh memaksa pindah ke mode lokal.
        const probe = await probeDatabase();
        if (!probe.ok) {
          if (firebaseConfigBroken || probe.problem?.code === 'DATABASE_NOT_FOUND') {
            setDiagnostic({ ...probe.problem, switchable: true });
            return;
          }
          setDiagnostic({ ...probe.problem, switchable: false, detail: `${probe.problem.detail} Game akan mencoba menghubungkan ulang otomatis.` });
          return;
        }
      }
      // Pulihkan kursi lama bila perangkat ini sebelumnya sudah duduk di meja
      // yang sama (refresh / gabung ulang lewat link): identitas kursi harus
      // sama supaya kartu tangan di ronde berjalan tidak hilang.
      const saved = session.load();
      const id = saved?.roomCode === code && saved?.playerId ? saved.playerId : makeId();
      const adapter = createRealtimeService(code, id);
      let found = null;
      try {
        found = await adapter.firstValue();
      } catch (error) {
        adapter.close();
        setJoinError(error?.detail || error?.title || 'Meja tidak ditemukan. Pastikan kode 6 karakter benar dan host sedang membuka meja.');
        return;
      }
      if (!found && typeof navigator !== 'undefined' && navigator.onLine === false) {
        // Offline ≠ meja hilang. Tunggu koneksi, jangan hapus sesi.
        adapter.close();
        setJoinError('Kamu sedang offline. Sambungkan internet lalu tekan Gabung lagi — meja tidak dihapus.');
        return;
      }
      if (!found) {
        adapter.close();
        setJoinError('Meja tidak ditemukan. Pastikan kode 6 karakter benar dan host sedang membuka meja.');
        return;
      }

      // Dudukkan pemain (atau segarkan kursi lama yang sudah ada).
      let seated = found.seats?.some(seat => seat.id === id) ? found : null;
      try {
        const result = await adapter.transact(current => {
          const next = applyIntent(current, { type: 'sit', name, avatar }, id, serverNow());
          if (next.error) throw Object.assign(new Error(next.error), { isIntentError: true });
          return next.room;
        });
        if (result?.value) seated = result.value;
      } catch (error) {
        adapter.close();
        if (error?.isIntentError) {
          setJoinError(error.message);
        } else {
          setDiagnostic({ ...explainFirebaseError(error), switchable: true });
        }
        return;
      }
      // Sesi disimpan sebelum attach: snapshot awal dari subscribe bisa memicu
      // render/efek lain, jadi identitas kursi harus sudah tercatat lebih dulu.
      session.save(code, id);
      setViewerId(id);
      attach(adapter);
      // kursi lama yang ditandai AFK dipulihkan seketika
      adapter.transact(current => {
        const next = applyIntent(current, { type: 'reclaim' }, id, serverNow());
        return next.error ? null : next.room;
      }).catch(() => {});
      if (seated) setRoom(normalizeRoom(seated));
    },
    [attach]
  );

  // Lobby → tab Gabung: potret mana yang sudah dipakai di meja itu?
  // Dipakai untuk mengunci pilihan sebelum pemain benar-benar duduk.
  const probeAvatars = useCallback(async rawCode => {
    const code = String(rawCode || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) return null;
    const adapter = createRealtimeService(code, makeId());
    try {
      const found = await adapter.firstValue(4000);
      if (!found?.seats) return null;
      const map = {};
      for (const seat of found.seats || []) {
        const id = normalizeAvatar(seat?.avatar?.id || seat?.avatar);
        if (id) map[id] = seat.name || 'pemain lain';
      }
      return map;
    } catch {
      return null;
    } finally {
      adapter.close();
    }
  }, []);

  // Reconnect (spec §4.3): pulihkan sesi terakhir dari localStorage.
  const reconnect = useCallback(async () => {
    const saved = session.load();
    if (!saved?.roomCode || !saved?.playerId) return false;
    // Tidak ada preflight di sini: SDK Firebase yang menunggu & mencoba ulang.
    // Preflight yang gagal dulu membuat sesi dihapus padahal internet cuma lambat.
    const adapter = createRealtimeService(saved.roomCode, saved.playerId);
    let found = null;
    try {
      found = await adapter.firstValue(12000);
    } catch {
      found = null;
    }
    if (!found) {
      // Server belum bisa dihubungi/meja belum terbaca: JANGAN hapus sesi —
      // tampilkan layar "menghubungkan" dan biarkan auto-retry / tombol Coba Lagi.
      adapter.close();
      setConnectingNotice(true);
      return false;
    }
    if (!found.seats?.some(seat => seat.id === saved.playerId)) {
      adapter.close();
      session.clear();
      return false;
    }
    setViewerId(saved.playerId);
    attach(adapter);
    setRoom(normalizeRoom(found));
    const seat = found.seats.find(item => item.id === saved.playerId);
    adapter.transact(current => {
      const rejoin = applyIntent(current, { type: 'sit', name: seat?.name, avatar: seat?.avatar }, saved.playerId, serverNow());
      const claim = applyIntent(rejoin.error ? current : rejoin.room, { type: 'reclaim' }, saved.playerId, serverNow());
      const result = claim.error ? rejoin : claim;
      return result.error ? null : result.room;
    }).catch(() => {});
    return true;
  }, [attach]);

  // Boot: ?room=KODE diisi ke form Gabung (jangan auto-join tanpa nama),
  // lalu coba reconnect sesi terakhir dari localStorage (spec §4.3).
  const bootRef = useRef(false);
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    const urlRoom = new URLSearchParams(location.search).get('room');
    if (urlRoom && /^[A-Z0-9]{6}$/i.test(urlRoom)) {
      // Set state SEBELUM URL dibersihkan. Dulu replaceState dijalankan lebih
      // dulu, dan pada beberapa browser/perangkat React me-remount sehingga
      // ?room= hilang dan pemain mendarat di tab "Buka Meja".
      setInitialCode(urlRoom.toUpperCase());
      history.replaceState(null, '', location.pathname);
    }
    reconnect().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keluar dari meja. Sesi (kode meja + id pemain) hanya dihapus bila pemain
  // sudah keluar dari kursi (lobby), sehingga kalau tidak sengaja keluar ia
  // bisa langsung kembali ke kursi, kartu, dan skor yang sama.
  function teardownRoom(clearSession) {
    pending.clear();
    service?.setPresence(false);
    service?.close();
    if (clearSession) session.clear();
    setService(null);
    setRoom(null);
    setViewerId(null);
    setPresence({});
  }

  function leavePermanently() {
    if (room?.status === 'playing') {
      // Ronde berjalan: tetap simpan sesi supaya kartu tidak yatim.
      const code = room.code;
      const id = viewerId;
      service?.transact(current => {
        const next = applyIntent(current, { type: 'offline' }, id, serverNow());
        return next.error ? null : next.room;
      }).catch(() => {});
      if (code && id) session.save(code, id);
      teardownRoom(false);
      return;
    }
    sendIntent({ type: 'stand' }).catch(() => {});
    teardownRoom(true);
  }

  function exit() {
    leavePermanently();
  }

  // Hanya dipakai bila memang bermain sendirian di 1 perangkat — bukan solusi
  // untuk gangguan jaringan.
  function switchToLocal() {
    try { localStorage.setItem('remi-force-local', '1'); } catch { /* ignore */ }
    location.reload();
  }

  const startupProblem = useMemo(() => {
    if (!firebaseActive() && firebaseStartupError) return { ...firebaseStartupError, switchable: false };
    return null;
  }, []);

  // Badge status koneksi untuk header di semua halaman.
  useEffect(() => {
    setConnectionSnapshot({
      state: connection,
      mode: service?.mode || '',
      retry: () => reconnect().catch(() => {}),
    });
  }, [connection, service, reconnect]);

  const showStartup = Boolean(startupProblem) && !diagnostic;

  // Banner koneksi: tampil selama tidak 'connected'. Tidak memblokir layar,
  // tidak memaksa pindah mode — cukup menunggu SDK menghubungkan ulang.
  const connectionBanner = (
    <ConnectionBanner
      connection={connection}
      sound={room?.status === 'playing'}
      mode={service?.mode}
      onRetry={() => {
        setConnectingNotice(false);
        reconnect().catch(() => {});
      }}
    />
  );

  // Layar tunggu saat server belum bisa dihubungi dan sesi lama belum pulih.
  if (!room && connectingNotice) {
    return (
      <>
        {diagnostic && <DiagnosticModal diagnostic={diagnostic} onSwitchLocal={switchToLocal} onDismiss={() => setDiagnostic(null)} />}
        <ConnectingScreen
          connection={connection}
          onRetry={() => { setConnectingNotice(false); reconnect().catch(() => {}); }}
          onNewTable={() => setConnectingNotice(false)}
        />
      </>
    );
  }

  if (!room) {
    return (
      <>
        {showStartup && <DiagnosticModal diagnostic={startupProblem} onSwitchLocal={switchToLocal} onDismiss={() => setDiagnostic(null)} />}
        {diagnostic && <DiagnosticModal diagnostic={diagnostic} onSwitchLocal={switchToLocal} onDismiss={() => setDiagnostic(null)} />}
        {connectionBanner}
        <Lobby
          onCreate={create}
          onJoin={join}
          joinError={joinError}
          initialCode={initialCode}
          inviteCode={initialCode}
          showResume={Boolean(session.load())}
          onResume={() => reconnect()}
          onProbeAvatars={probeAvatars}
          firebaseEnabled={isFirebaseConfigured && firebaseActive()}
          showDevHint={Boolean(import.meta.env.DEV)}
        />
      </>
    );
  }

  const inGame = room.status === 'playing' && room.game;

  return (
    <>
      {showStartup && <DiagnosticModal diagnostic={startupProblem} onSwitchLocal={switchToLocal} onDismiss={() => setDiagnostic(null)} />}
      {diagnostic && <DiagnosticModal diagnostic={diagnostic} onSwitchLocal={switchToLocal} onDismiss={() => setDiagnostic(null)} />}
      {connectionBanner}
      {inGame ? (
        <GameBoard
          room={room}
          viewerId={viewerId}
          onIntent={sendIntent}
          onExit={exit}
          service={service}
          presence={presence}
        />
      ) : (
        <RoomLobby
          room={room}
          viewerId={viewerId}
          profile={{
            name: room.seats.find(seat => seat.id === viewerId)?.name || 'Pemain',
            avatar: room.seats.find(seat => seat.id === viewerId)?.avatar || DEFAULT_AVATAR,
          }}
          onIntent={sendIntent}
          onExit={exit}
          presence={presence}
        />
      )}
      <HealthMonitor
        open={healthOpen}
        onClose={() => setHealthOpen(false)}
        service={service}
        room={roomRef.current}
        presence={presence}
      />
    </>
  );
}
