import React, { useEffect, useState } from 'react';
import { animate, motion, MotionConfig, useReducedMotion } from 'framer-motion';
import CardSVG from './CardSVG.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import { AvatarArt, AvatarArtButton, Icon, PresenceDot } from './SvgPrimitives.jsx';
import ConnectionBadgeGlobal from './ConnectionBadgeGlobal.jsx';
import { AVATARS, avatarTakenBy, canStartRound, firstFreeAvatar, MAX_SEATS, TURN_SECONDS_OPTIONS } from '../engine/roomEngine.js';
import { play } from '../sound/soundFX.js';
import { copyInviteLink } from '../utils/share.js';

const SEAT_SLOT = index => ({
  left: `${50 + 40 * Math.cos((index / MAX_SEATS) * Math.PI * 2 - Math.PI / 2)}%`,
  top: `${50 + 38 * Math.sin((index / MAX_SEATS) * Math.PI * 2 - Math.PI / 2)}%`,
});

const CTA = 'w-full h-12 rounded-2xl bg-emeraldPrimary text-canvasDeep hover:brightness-110 active:scale-[0.99] font-bold text-sm shadow-lg transition flex items-center justify-center gap-2';
const CTA_OFF = 'bg-btnSurface text-white/60 cursor-not-allowed shadow-none brightness-100';
const FIELD = 'w-full bg-[#121526] border border-white/10 rounded-xl px-3.5 text-sm text-white placeholder-periwinkleMuted/70 focus:outline-none focus:border-emeraldPrimary focus:ring-2 focus:ring-emeraldPrimary/30 transition';

// Angka skor yang menghitung naik dari titik awal ke nilai akhir — rincian
// ronde tidak "melompat" ke angka jadi, pemain sempat membaca rinciannya.
// Hargai prefers-reduced-motion: langsung tampilkan nilai akhir.
function CountUp({ value, from = 0, delay = 0, duration = 0.7 }) {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState(from);
  useEffect(() => {
    if (reduceMotion) return undefined;
    const controls = animate(from, value, {
      delay,
      duration,
      ease: 'easeOut',
      onUpdate: latest => setShown(Math.round(latest)),
    });
    return () => controls.stop();
  }, [value, from, delay, duration, reduceMotion]);
  return <span className="tabular-nums">{reduceMotion ? value : shown}</span>;
}

export default function RoomLobby({ room, viewerId, profile, onIntent, onExit, presence }) {
  const [name, setName] = useState(profile.name);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [copied, setCopied] = useState('');
  const [kickTarget, setKickTarget] = useState(null);
  const [exitOpen, setExitOpen] = useState(false);


  const reduceMotion = useReducedMotion();

  const mySeat = room.seats.find(seat => seat.id === viewerId);
  const isHost = room.hostId === viewerId;
  const startable = canStartRound(room);
  const myNameDirty = Boolean(mySeat) && name.trim() !== '' && name.trim() !== mySeat.name;
  const inviteUrl = `${location.origin}${location.pathname}?room=${room.code}`;
  const shufflerName = room.seats.find(seat => seat.id === room.shufflerId)?.name || '';
  // Status per kursi: hanya "online === false" yang eksplisit dianggap putus.
  // Presence yang belum terkirim (mode lokal / baru masuk) ≠ offline —
  // kalau dihitung offline, meja lokal selalu tampil "0 online · 1 terputus".
  const seatOnline = seat => seat.bot || presence?.[seat.id]?.online !== false;
  const seatHealth = {
    onlineCount: room.seats.filter(seatOnline).length,
    offlineNames: room.seats.filter(seat => !seatOnline(seat)).map(seat => seat.name),
  };
  seatHealth.offlineCount = seatHealth.offlineNames.length;

  // Host doesn't need a separate SIAP press: telling them *why* the button is
  // still locked is much clearer than silently waiting on them.
  const notReadyHumans = room.seats.filter(seat => !seat.bot && !seat.ready && seat.id !== room.hostId);

  // Satu potret = satu pemain. Potret yang dipakai kursi lain terkunci;
  // pemain yang sudah duduk menukar avatar lewat tombol Simpan (dan otomatis
  // pindah ke potret kosong bila potretnya direbut orang lain).
  const holderOf = item => avatarTakenBy(room, item, mySeat?.id);
  const myAvatarLocked = Boolean(holderOf(avatar));

  function sit() {
    // Potret bisa saja baru direbut orang lain di antara render & klik.
    const free = firstFreeAvatar(room, viewerId);
    const chosen = avatarTakenBy(room, avatar, viewerId) ? free : avatar;
    if (chosen) setAvatar(chosen);
    onIntent({ type: 'sit', name: name.trim() || 'Pemain', avatar: chosen || avatar });
  }

  const avatarChanged = Boolean(mySeat) && avatar !== mySeat.avatar;

  function saveProfile() {
    if (!mySeat) return;
    const nextName = name.trim() || mySeat.name;
    if (nextName === mySeat.name && avatar === mySeat.avatar) return;
    if (myAvatarLocked) return;
    onIntent({ type: 'sit', name: nextName, avatar });
  }

  async function copyInvite() {
    const result = await copyInviteLink(room.code);
    if (result.ok) {
      setCopied('Tersalin!');
      setTimeout(() => setCopied(''), 2400);
    } else if (result.via === 'unavailable') {
      // Non-secure context (http over LAN) with no share sheet: show the link
      // so the player can copy it by hand instead of a dead button.
      setCopied('manual');
    }
  }

  function begin() {
    play('start');
    // Ronde lanjutan tidak menunggu tombol SIAP: semua pemain aktif dipromosikan
    // otomatis oleh engine, poin dan identitas kursi tetap utuh.
    onIntent({ type: room.status === 'round-end' ? 'next-round' : 'start' });
  }

  function nextRound() {
    play('start');
    onIntent({ type: 'next-round' });
  }

  function handleReady() {
    if (!mySeat) return;
    play('turn');
    onIntent({ type: 'ready', value: !mySeat.ready });
  }

  return (
    <MotionConfig reducedMotion="user">
      {/* h-dvh (not min-h-screen): #root is locked to 100dvh + overflow hidden,
          so the panel's MULAI button was clipped off-screen on laptops. */}
      <main className="arena-canvas h-dvh flex flex-col text-white selection:bg-emeraldPrimary selection:text-canvasDeep overflow-y-auto overscroll-contain">
        {/* Top HUD — disamakan dengan header GameBoard: pill kaca, kode meja
            sebagai chip utama, status ronde/giliran di tengah, CTA merah gradien. */}
        <header className="lobby-hud">
          <div className="lobby-left">
            <div className="lobby-brand">
              <span className="lobby-brand__mark"><Icon.Shield size={18} /></span>
              <div className="lobby-brand__text">
                <h1 className="lobby-brand__name tabular-nums">Meja #{room.code}</h1>
                <span className="lobby-brand__sub">Ruang Tunggu · Ronde {room.round + 1}</span>
              </div>
            </div>
          </div>

          <div className="lobby-center">
            <div className="lobby-pill lobby-pill--gold" title={`Pengocok ronde ini: ${shufflerName || '—'}`}>
              <Icon.Crown size={13} />
              <span className="truncate max-w-[104px] sm:max-w-[180px]">{shufflerName || 'Pengocok —'}</span>
              <span className="lobby-pill--hide-xs opacity-70 font-semibold">· Pengocok</span>
            </div>
            <span
              className={`lobby-pill ${seatHealth.offlineCount ? 'lobby-pill--danger' : 'lobby-pill--emerald'}`}
              title={seatHealth.offlineCount ? `Terputus: ${seatHealth.offlineNames.join(', ')}` : 'Semua pemain tersambung'}
              role="status"
            >
              <span className={`lobby-dot ${seatHealth.offlineCount ? 'lobby-dot--local' : 'lobby-dot--online'}`} aria-hidden="true" />
              {seatHealth.onlineCount} online{seatHealth.offlineCount ? ` · ${seatHealth.offlineCount} terputus` : ''}
            </span>
          </div>

          <div className="lobby-right">
            <ConnectionBadgeGlobal />
            <button
              type="button"
              className={`lobby-icon-btn ${copied && copied !== 'manual' ? 'is-on' : ''}`}
              onClick={copyInvite}
              title="Bagikan link undangan"
              aria-label="Bagikan link undangan"
            >
              {copied && copied !== 'manual' ? <Icon.Check size={16} /> : <Icon.Copy size={16} />}
            </button>
            <button
              type="button"
              className="lobby-icon-btn"
              onClick={() => setExitOpen(true)}
              title="Keluar Meja"
              aria-label="Keluar Meja"
            >
              <Icon.Exit size={16} />
            </button>
          </div>
          {/* Manual-copy fallback for non-secure contexts (http over LAN) */}
          {copied === 'manual' && (
            <div className="w-full flex flex-col sm:flex-row sm:items-center gap-2 bg-[#1B1F38] border border-goldAccent/40 rounded-xl px-3 py-2 text-[11px] text-periwinkleMuted">
              <label htmlFor="invite-link" className="font-semibold text-white shrink-0">Link undangan:</label>
              <input
                id="invite-link"
                readOnly
                value={inviteUrl}
                onFocus={event => event.target.select()}
                className="flex-1 min-w-0 h-9 bg-[#121526] border border-white/10 rounded-lg px-2 text-[11px] text-goldAccent outline-none focus:border-emeraldPrimary"
              />
              <button type="button" className="min-h-11 px-3 rounded-lg bg-white/5 border border-white/10 text-white font-semibold" onClick={() => setCopied('')}>
                Tutup
              </button>
            </div>
          )}
        </header>

        {/* Strip kursi ringkas untuk layar sempit: meja melingkar ada di bawah
            fold, jadi siapa saja yang sudah duduk tetap terlihat di atas. */}
        <section className="lg:hidden w-full max-w-5xl mx-auto px-4 mt-3 z-20 shrink-0" aria-label="Pemain di meja">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            {room.seats.map(seat => (
              <span key={seat.id} className="inline-flex items-center gap-1.5 shrink-0 rounded-full bg-[#1D2444]/90 border border-white/10 pl-1 pr-2.5 py-1">
                <span className="w-6 h-6 rounded-lg overflow-hidden shrink-0">
                  <AvatarArt avatar={seat.avatar} size={24} />
                </span>
                <span className="text-[10px] font-bold text-white truncate max-w-[72px]">{seat.name}</span>
                <span className="text-[8.5px] font-extrabold uppercase px-1 rounded bg-white/10 text-periwinkleMuted">
                  {seat.id === room.hostId ? 'HOST' : seat.bot ? 'BOT' : seat.ready ? 'SIAP' : '…'}
                </span>
              </span>
            ))}
            {!mySeat && (
              <span className="text-[10px] font-semibold text-periwinkleMuted px-2 whitespace-nowrap">
                {MAX_SEATS - room.seats.length} kursi kosong
              </span>
            )}
          </div>
        </section>

        {/* Round-End Banner (when status === 'round-end') */}
        {room.status === 'round-end' && room.lastScores && (
          <section className="order-2 lg:order-1 w-full max-w-5xl mx-auto px-4 mt-4 z-20 shrink-0">
            <div className="bg-[#1B1F38]/95 border border-goldAccent/40 rounded-3xl p-5 sm:p-6 shadow-2xl">
              <h2 className="text-sm sm:text-base font-bold text-white mb-3 flex items-start gap-2">
                <span className="text-goldAccent shrink-0 mt-0.5"><Icon.Flag size={16} /></span>
                <span>
                  Ronde {room.round} selesai —{' '}
                  {room.pendingWinnerId
                    ? `Pemenang: ${room.seats.find(seat => seat.id === room.pendingWinnerId)?.name} (Tutup/Mati Remi)`
                    : 'Tumpukan minum habis (Draw/Tutup Meja)'}
                </span>
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 mb-2">
                {room.lastScores.map((row, idx) => {
                  const seat = room.seats.find(item => item.id === row.playerId);
                  const isPositive = row.total >= 0;
                  // Reveal bertahap: kartu muncul satu per satu, lalu angka
                  // Total dan Skor menghitung naik — bukan langsung "jadi".
                  const revealDelay = 0.15 + idx * 0.22;
                  const previousScore = (seat?.score ?? 0) - row.total;
                  return (
                    <motion.div
                      key={row.playerId}
                      initial={{ opacity: 0, y: 14, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ delay: reduceMotion ? 0 : revealDelay, duration: 0.35, ease: 'easeOut' }}
                      className={`p-3 rounded-2xl border flex flex-col justify-between ${
                        isPositive
                          ? 'bg-[#182B21]/80 border-emeraldPrimary/30 text-emeraldPrimary'
                          : 'bg-[#2E181D]/80 border-crimsonDanger/30 text-crimsonDanger'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-6 h-6 rounded-md overflow-hidden shrink-0">
                          <AvatarArt avatar={seat?.avatar} size={24} />
                        </span>
                        <strong className="text-white text-xs truncate max-w-[120px]">{row.name}</strong>
                      </div>
                      <div className="text-[11px] text-periwinkleMuted flex flex-wrap justify-between gap-1">
                        <span>Kombinasi: +{row.positive}</span>
                        {row.closerBonus > 0 && (
                          <span className="text-goldAccent font-semibold whitespace-nowrap">Tutup: +{row.closerBonus}</span>
                        )}
                        {row.discardedAces > 0 && (
                          <span className="whitespace-nowrap">As dibuang: {row.discardedAces} (netral)</span>
                        )}
                        {row.discardedJokers > 0 && (
                          <span className="whitespace-nowrap">Joker dibuang: −{row.discardedJokers * 150}</span>
                        )}
                        {row.jokersInHand > 0 && (
                          <span className="whitespace-nowrap">Joker di tangan: −{row.jokersInHand * 50}</span>
                        )}
                        <span>Tangan: −{row.negative - row.discardedJokers * 150}</span>
                      </div>
                      <div className="text-xs font-bold mt-1 flex justify-between pt-1 border-t border-white/5">
                        <span>
                          Total: {row.total > 0 ? '+' : ''}
                          <CountUp value={row.total} delay={reduceMotion ? 0 : revealDelay + 0.2} />
                        </span>
                        <span className="text-white">
                          Skor: <CountUp value={seat?.score ?? 0} from={previousScore} delay={reduceMotion ? 0 : revealDelay + 0.45} />
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {isHost ? (
                <>
                  <button
                    type="button"
                    className={`${CTA} w-full max-w-xs mx-auto h-12 text-sm mt-1`}
                    onClick={nextRound}
                  >
                    <Icon.Play size={15} />
                    <span>MULAI RONDE BERIKUTNYA</span>
                  </button>
                  {notReadyHumans.length > 0 && (
                    <p className="text-[11px] text-center text-goldAccent/90 leading-snug" role="status">
                      Masih menunggu SIAP: {notReadyHumans.map(seat => seat.name).join(', ')}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-[11px] text-center text-periwinkleMuted leading-snug">
                  Host yang memulai ronde. Tekan SIAP kalau sudah siap — dan sempatkan cek nama &amp; avatarmu.
                </p>
              )}
              <p className="text-[11px] text-center text-periwinkleMuted">
                Poin tetap tersimpan.
              </p>
            </div>
          </section>
        )}

        {/* Main Waiting Room Section */}
        <section className="flex-1 w-full max-w-6xl mx-auto px-4 py-5 sm:py-8 flex flex-col lg:flex-row items-center lg:items-start justify-center gap-6 lg:gap-12 z-20">
          {/* Table Felt Circular Seats (Left / Center) */}
          <div className="order-2 lg:order-1 relative w-full max-w-[560px] aspect-square rounded-[36px] bg-radial-table p-5 sm:p-7 border border-white/10 shadow-2xl flex items-center justify-center">
            <div className="relative w-full h-full rounded-[28px] border border-white/5 flex items-center justify-center">
              {/* 8 Seats Arranged in Circle. Seats are compact, so only the next
                  free slot is offered as "Duduk di sini" — clicking seat #7 never
                  silently sat you at seat #2. */}
              {Array.from({ length: MAX_SEATS }, (_, slot) => {
                const seat = room.seats[slot];
                const online = seat && (seat.bot || presence?.[seat.id]?.online !== false);
                const isNextFree = !seat && slot === room.seats.length && !mySeat;
                return (
                  <div
                    key={slot}
                    className="absolute -translate-x-1/2 -translate-y-1/2 z-20"
                    style={SEAT_SLOT(slot)}
                  >
                    {!seat ? (
                      isNextFree ? (
                        <button
                          type="button"
                          className="w-14 h-14 sm:w-[70px] sm:h-[70px] rounded-[20px] border-2 border-dashed border-emeraldPrimary/60 bg-[#16192E]/80 hover:bg-emeraldPrimary/15 text-periwinkleMuted hover:text-white transition group shadow-card"
                          onClick={sit}
                          aria-label="Duduk di kursi kosong berikutnya"
                          title="Duduk di kursi ini"
                        >
                          <span className="flex flex-col items-center justify-center gap-0.5">
                            <Icon.Plus size={18} />
                            <span className="text-[10px] font-semibold">Duduk</span>
                          </span>
                        </button>
                      ) : (
                        <div
                          className="w-14 h-14 sm:w-[70px] sm:h-[70px] rounded-[20px] border-2 border-dashed border-white/15 bg-[#16192E]/40 flex flex-col items-center justify-center gap-0.5 text-periwinkleMuted/60"
                          aria-hidden="true"
                          title="Kursi kosong"
                        >
                          <Icon.Users size={16} />
                          <span className="text-[10px] font-semibold">Kosong</span>
                        </div>
                      )
                    ) : (
                      <div className="relative flex flex-col items-center group">
                        {/* Avatar Squircle with Border */}
                        <div
                          className={`w-14 h-14 sm:w-[70px] sm:h-[70px] rounded-[20px] p-[2.5px] transition-transform ${
                            seat.ready
                              ? 'bg-emeraldPrimary shadow-cardHover'
                              : 'bg-btnSurface shadow-squircle'
                          } ${seat.id === viewerId ? 'ring-2 ring-white/40 ring-offset-2 ring-offset-[#252A4A]' : ''}`}
                        >
                          <div className="w-full h-full rounded-[17px] bg-[#1B1F38] relative overflow-hidden">
                            <AvatarArt avatar={seat.avatar} size={64} />
                            {seat.id === room.hostId && (
                              <span
                                className="absolute top-0.5 left-0.5 text-goldAccent drop-shadow"
                                title="Host / Tuan Rumah"
                                aria-label="Host"
                              >
                                <Icon.Crown size={12} />
                              </span>
                            )}
                            {seat.bot && (
                              <span className="absolute top-0.5 right-0.5 text-[9px] font-extrabold px-1 rounded bg-[#252A4A] text-goldAccent">BOT</span>
                            )}
                          </div>
                        </div>

                        {/* Name & Ready Badge — host never has to press SIAP */}
                        <span className="inline-flex items-center gap-1 mt-1 max-w-[84px]">
                          <PresenceDot online={seat.bot || presence?.[seat.id]?.online !== false} bot={seat.bot} />
                          <span className="text-[11px] font-bold text-white truncate leading-tight">{seat.name}</span>
                        </span>
                        <span
                          className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full mt-0.5 border whitespace-nowrap ${
                            seat.id === room.hostId
                              ? 'bg-goldAccent/15 text-goldAccent border-goldAccent/40'
                              : seat.ready
                                ? 'bg-emeraldPrimary/20 text-emeraldPrimary border-emeraldPrimary/40'
                                : 'bg-white/5 text-periwinkleMuted border-white/10'
                          }`}
                        >
                          {seat.id === room.hostId ? 'HOST' : seat.ready ? '✓ SIAP' : 'menyiapkan…'}
                        </span>
                        {!online && (
                          <span className="text-[9px] font-semibold text-crimsonDanger mt-0.5">offline</span>
                        )}

                        {/* Host Kick Button */}
                        {isHost && seat.id !== viewerId && room.status !== 'playing' && (
                          <button
                            type="button"
                            className="absolute -top-3 -right-3 w-11 h-11 rounded-full flex items-center justify-center text-white transition active:scale-95"
                            title={`Keluarkan ${seat.name}`}
                            aria-label={`Keluarkan ${seat.name} dari kursi`}
                            onClick={() => setKickTarget({ id: seat.id, name: seat.name, bot: seat.bot })}
                          >
                            <span className="w-6 h-6 rounded-full bg-crimsonDanger shadow-md flex items-center justify-center">
                              <Icon.Close size={11} />
                            </span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Center Table Element (Rotating Card Deck) */}
              <div className="flex flex-col items-center justify-center z-10 pointer-events-none">
                <motion.div
                  animate={reduceMotion ? undefined : { rotate: 360 }}
                  transition={reduceMotion ? undefined : { duration: 28, repeat: Infinity, ease: 'linear' }}
                  className="w-16 h-24 sm:w-20 sm:h-28 rounded-lg shadow-card p-1 bg-white mb-2"
                >
                  <div className="w-full h-full rounded-[4px] border border-[#B8333A] overflow-hidden">
                    <CardSVG back />
                  </div>
                </motion.div>
                <span className="text-xs font-bold text-white tabular-nums px-3 py-1 rounded-full bg-[#16192E]/80 border border-white/10 shadow">
                  {room.seats.length}/8 Kursi · Butuh ≥2 Pemain
                </span>
              </div>
            </div>
          </div>

          {/* Player Controls & Host Settings Card (Right) */}
          <div className="order-1 lg:order-2 w-full max-w-md bg-[#1B1F38]/90 backdrop-blur-xl border border-white/10 rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 pb-2 border-b border-white/10 flex items-center gap-2">
                <Icon.Users size={15} />
                <span>Kartu Kursiku</span>
              </h3>

              {/* Name Input */}
              <div className="mb-5">
                <label htmlFor="seat-name" className="block text-xs font-semibold text-periwinkleMuted mb-2">
                  Nama Panggilan
                </label>
                <div className="flex gap-2">
                  <input
                    id="seat-name"
                    type="text"
                    value={name}
                    maxLength={18}
                    onChange={event => setName(event.target.value)}
                    onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); saveProfile(); } }}
                    placeholder="Nama kamu"
                    className={`${FIELD} h-11 flex-1`}
                  />
                  {mySeat && (
                    <button
                      type="button"
                      disabled={!(myNameDirty || avatarChanged) || myAvatarLocked}
                      onClick={saveProfile}
                      className="h-11 px-3 rounded-xl text-xs font-bold transition bg-emeraldPrimary text-canvasDeep hover:brightness-110 disabled:bg-white/5 disabled:text-periwinkleMuted/60 disabled:cursor-not-allowed"
                    >
                      Simpan
                    </button>
                  )}
                </div>
                {mySeat && myNameDirty && (
                  <p className="text-[11px] text-goldAccent mt-1.5">Nama belum disimpan — tekan Enter atau Simpan.</p>
                )}
                {mySeat && !myNameDirty && (avatarChanged || myAvatarLocked) && (
                  <p className="text-[11px] text-goldAccent mt-1.5" role="status">
                    {myAvatarLocked
                      ? 'Potret pilihanmu sudah dipakai pemain lain. Pilih potret lain lalu Simpan.'
                      : 'Avatar belum disimpan — tekan Simpan.'}
                  </p>
                )}
              </div>

              {/* Avatar Selector */}
              <div className="mb-6">
                <span id="seat-avatar-label" className="block text-xs font-semibold text-periwinkleMuted mb-2.5">
                  Ganti Avatar
                </span>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2" role="group" aria-labelledby="seat-avatar-label">
                  {AVATARS.map(item => {
                    const holder = holderOf(item);
                    const isSaved = mySeat?.avatar === item;
                    return (
                      <AvatarArtButton
                        key={item}
                        avatar={item}
                        selected={avatar === item}
                        disabled={Boolean(holder) && !isSaved}
                        takenBy={holder?.name}
                        onClick={() => setAvatar(item)}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Seat Actions */}
              {mySeat ? (
                <div className="flex flex-col gap-3 mb-4">
                  {isHost ? (
                    <p className="text-[11px] text-periwinkleMuted leading-snug rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
                      Kamu <strong className="text-goldAccent">Host</strong> — tidak perlu menekan SIAP. Tekan
                      {' '}<strong className="text-white">MULAI</strong>{' '}begitu pemain lain sudah siap.
                    </p>
                  ) : (
                    <button
                      type="button"
                      className={`w-full h-12 rounded-2xl font-bold text-sm shadow-md transition flex items-center justify-center gap-2 ${
                        mySeat.ready
                          ? 'bg-btnSurface hover:bg-[#5B649B] text-white'
                          : CTA
                      }`}
                      onClick={handleReady}
                    >
                      {mySeat.ready ? <Icon.Play size={15} /> : <Icon.Check size={15} />}
                      <span>{mySeat.ready ? 'Batal Siap' : 'SIAP (READY)'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="w-full h-11 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-periwinkleMuted hover:text-white transition"
                    onClick={() => onIntent({ type: 'stand' })}
                  >
                    Berdiri dari Kursi
                  </button>
                  <p className="text-[10px] text-periwinkleMuted/80 text-center leading-snug -mt-1">
                    Berdiri = lepas kursi tapi tetap di ruang tunggu. Keluar Meja = keluar dari meja ini.
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  className={`${CTA} mb-5`}
                  onClick={sit}
                >
                  <Icon.Plus size={15} />
                  <span>Duduk di Kursi Kosong</span>
                </button>
              )}

              {/* Host Settings Section */}
              {isHost && room.status !== 'playing' && (
                <div className="pt-5 mt-5 border-t border-white/10 flex flex-col gap-3.5">
                  <h4 className="text-xs font-bold text-goldAccent uppercase tracking-wide flex items-center gap-1.5">
                    <Icon.Gear size={13} />
                    <span>Pengaturan Host</span>
                  </h4>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="host-depth" className="block text-[11px] font-semibold text-periwinkleMuted mb-1.5">
                        Batas Gali
                      </label>
                      <select
                        id="host-depth"
                        value={room.maxDepth}
                        onChange={e => onIntent({ type: 'settings', maxDepth: e.target.value === 'bebas' ? 112 : Number(e.target.value), turnSeconds: room.turnSeconds })}
                        className={`${FIELD} h-11 text-xs px-3`}
                      >
                        <option value={3}>Maks 3</option>
                        <option value={4}>Maks 4</option>
                        <option value={5}>Maks 5 (Std)</option>
                        <option value="bebas">Bebas</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="host-timer" className="block text-[11px] font-semibold text-periwinkleMuted mb-1.5">
                        Timer Giliran
                      </label>
                      <select
                        id="host-timer"
                        value={room.turnSeconds}
                        onChange={e => onIntent({ type: 'settings', maxDepth: room.maxDepth, turnSeconds: Number(e.target.value) })}
                        className={`${FIELD} h-11 text-xs px-3`}
                      >
                        {TURN_SECONDS_OPTIONS.map(opt => (
                          <option key={opt} value={opt}>{opt} detik</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="w-full h-11 rounded-xl bg-btnSurface hover:bg-[#5B649B] text-xs font-semibold text-white border border-white/10 transition flex items-center justify-center gap-1.5 mt-1"
                    onClick={() => onIntent({ type: 'add-bot' })}
                  >
                    <Icon.Plus size={13} />
                    <span>Tambah Bot AI di kursi kosong</span>
                  </button>

                  <button
                    type="button"
                    className={`${CTA} ${startable || room.status === 'round-end' ? '' : CTA_OFF}`}
                    disabled={!(startable || room.status === 'round-end')}
                    onClick={begin}
                  >
                    <Icon.Play size={15} />
                    <span>{room.status === 'round-end' ? 'MULAI RONDE BERIKUTNYA' : 'MULAI PERMAINAN'}</span>
                  </button>
                  {notReadyHumans.length > 0 && (
                    <p className="text-[11px] text-center text-goldAccent/90 leading-snug" role="status">
                      Masih menunggu: {notReadyHumans.map(seat => seat.name).join(', ')} (menekan SIAP)
                    </p>
                  )}
                </div>
              )}
            </div>

            <p className="text-[11px] text-center text-periwinkleMuted/70 mt-4 pt-3 border-t border-white/5">
              Bagikan kode <strong className="text-white tabular-nums">{room.code}</strong> agar teman bergabung.
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer className="w-full border-t border-white/10 px-4 py-2 text-center text-[11px] text-periwinkleMuted/80 z-20">
          <span>Remi Tongkrongan Pro Arena · Ruang Tunggu Realtime</span>
        </footer>

        <ConfirmDialog
          open={exitOpen}
          title="Keluar dari meja?"
          message="Kursimu tetap tersimpan. Kamu bisa kembali dengan kode meja atau link yang sama, dan skor serta kartumu tidak hilang."
          confirmLabel="Ya, Keluar"
          cancelLabel="Batal"
          onConfirm={() => { setExitOpen(false); onExit?.(); }}
          onCancel={() => setExitOpen(false)}
        />

        <ConfirmDialog
          open={Boolean(kickTarget)}
          title={kickTarget?.bot ? 'Hapus bot ini?' : 'Keluarkan pemain ini?'}
          message={
            kickTarget
              ? `${kickTarget.name} akan ${kickTarget.bot ? 'dihapus dari meja' : 'dikeluarkan dari kursi dan kembali ke ruang tunggu'}.`
              : ''
          }
          confirmLabel={kickTarget?.bot ? 'Hapus Bot' : 'Keluarkan'}
          cancelLabel="Batal"
          tone="danger"
          onCancel={() => setKickTarget(null)}
          onConfirm={() => {
            if (kickTarget) onIntent({ type: 'kick', seatId: kickTarget.id });
            setKickTarget(null);
          }}
        />
      </main>
    </MotionConfig>
  );
}
