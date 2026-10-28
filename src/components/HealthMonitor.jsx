import React, { useEffect, useState } from 'react';
import { auditCards } from '../engine/roomEngine.js';

// System Health & Audit Monitor (spec §1.2): panel tersembunyi Alt+A yang
// memantau koneksi, invariant total kartu 56/112, dan giliran nyangkut.
export default function HealthMonitor({ open, onClose, service, room, presence }) {
  const [ping, setPing] = useState(null);
  const [connection, setConnection] = useState('connecting');
  const [checking, setChecking] = useState(false);
  const audit = auditCards(room);
  const game = room?.game;
  const playing = room?.status === 'playing' && game;
  const sinceAction = room ? Math.max(0, Math.round((Date.now() - room.lastActionAt) / 1000)) : 0;
  const stuck = playing && sinceAction > (room.turnSeconds || 45) * 2;
  const seatCount = room?.seats?.length || 0;

  useEffect(() => {
    if (!service) return undefined;
    const stop = service.subscribeConnection?.(setConnection);
    const poll = setInterval(() => { try { setConnection(service.connection?.()); } catch { /* ignore */ } }, 5000);
    return () => { stop?.(); clearInterval(poll); };
  }, [service]);

  useEffect(() => {
    if (!open || !service) return undefined;
    let alive = true;
    const measure = async () => {
      setChecking(true);
      const value = await service.measurePing();
      if (alive) { setPing(value); setChecking(false); }
    };
    measure();
    // 10 detik (dulu 5): tiap ping = satu transaksi tulis ke presence.
    const timer = setInterval(measure, 10000);
    return () => { alive = false; clearInterval(timer); };
  }, [open, service]);

  if (!open) return null;
  return (
    <aside className="health-panel" role="dialog" aria-label="System Health dan Audit Monitor">
      <header className="health-head">
        <h3>🩺 System Health &amp; Audit</h3>
        <button type="button" onClick={onClose}>✕</button>
      </header>

      <section className="health-body">
        <div className="health-row">
          <span>Mode koneksi</span>
          <b className={service?.mode !== 'firebase' || connection === 'connected' ? 'ok' : ''}>
            {service?.mode === 'firebase'
              ? `Firebase Realtime DB · ${connection === 'connected' ? 'terhubung' : connection === 'connecting' ? 'menyambung…' : 'terputus (retry otomatis)'}`
              : 'Lokal (BroadcastChannel)'}
          </b>
        </div>
        <div className="health-row">
          <span>Latensi</span>
          <b className={checking ? 'warn' : ping == null ? 'warn' : ping < 300 ? 'ok' : 'warn'}>
            {checking ? 'mengukur…' : ping == null ? '— (sendirian/offline)' : `${ping} ms`}
          </b>
        </div>
        <div className="health-row">
          <span>Kursi terisi</span>
          <b>{seatCount} / 8 · Ronde {room?.round || 0} · rev {room?.rev ?? '—'}</b>
        </div>

        <div className={`health-audit ${audit.idle ? '' : audit.ok ? 'ok' : 'bad'}`}>
          <h4>Audit Total Kartu</h4>
          {audit.idle ? (
            <p>Belum ada ronde berjalan.</p>
          ) : audit.ok ? (
            <p>✅ PASS — total <b>{audit.total}</b> kartu sesuai deck (<b>{audit.expected}</b> kartu untuk {game.players.length} pemain).</p>
          ) : (
            <p>🚨 ALARM — terdeteksi <b>{audit.total}</b> kartu, seharusnya <b>{audit.expected}</b> (selisih {audit.diff > 0 ? '+' : ''}{audit.diff}). Segera hentikan room ini.</p>
          )}
        </div>

        <div className="health-turn">
          <h4>Sinkronisasi Giliran</h4>
          {playing ? (
            <>
              <p>Giliran: <b>{game.players[game.turn]?.name}</b> · fase <b>{game.phase === 'draw' ? 'Minum/Gali' : 'Turun/Buang'}</b></p>
              <p>Timer giliran: {sinceAction}s / {room.turnSeconds}s</p>
              <p className={stuck ? 'bad-text' : 'ok-text'}>
                {stuck ? '⚠️ Giliran terdeteksi NYANGKUT — Bot pengganti seharusnya sudah mengambil alih.' : '✅ Tidak ada indikasi stuck.'}
              </p>
            </>
          ) : (
            <p>Sedang tidak ada ronde berjalan (status: {room?.status || '—'}).</p>
          )}
        </div>

        <div className="health-presence">
          <h4>Presence Pemain</h4>
          {(room?.seats || []).map(seat => {
            const online = seat.bot || presence?.[seat.id]?.online !== false;
            return (
              <div key={seat.id} className="health-row">
                <span>{seat.avatar} {seat.name}{seat.id === room.hostId ? ' 👑' : ''}</span>
                <b className={online ? 'ok' : 'warn'}>
                  {seat.bot ? 'BOT' : online ? 'Online' : 'Offline'}{seat.afk ? ' · AFK' : ''}
                </b>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="health-foot">
        <small>Tekan Alt+A untuk menutup · refresh otomatis tiap 5 detik</small>
      </footer>
    </aside>
  );
}
