import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { AvatarArt, Icon } from './SvgPrimitives.jsx';
import RoundScoreDetail, { ScoreCardPreview } from './RoundScoreDetail.jsx';

const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * Standings — papan peringkat kumulatif meja, diurutkan dari skor tertinggi.
 * Baris pertama (pemimpin) disorot; tiap baris menampilkan skor total dan
 * hasil ronde terakhir bila tersedia.
 *
 * Papan ini juga menjadi SATU-SATUNYA tempat rincian skor ronde dibuka: dulu
 * banner "Ronde Selesai" di RoomLobby merender grid kartu skor per pemain
 * (duplikat daftar pemain) plus RoundScoreDetail, sehingga halaman jadi dua
 * kali lebih panjang. Sekarang cukup ketuk baris pemain di sini.
 *
 * Props:
 *  - prevScores: hasil ronde terakhir (lastScores). Bila ada, baris menjadi
 *    interaktif dan bisa dibuka untuk melihat rincian angka + visual kartu.
 *  - game: state game terakhir — dipakai RoundScoreDetail untuk kombinasi di
 *    meja dan wujud kartu penutup.
 *  - interactive: paksa hidup/matikan accordion. Bawaannya hidup saat ada
 *    prevScores dan bukan mode compact (panel sempit di GameBoard/piala).
 *  - targetScore: bila > 0, tiap baris mendapat progress bar tipis menuju
 *    gelar Juara Turnamen. targetScore = 0 berarti "Mode Tanpa Batas".
 */
export default function Standings({
  seats,
  viewerId,
  hostId = null,
  prevScores = null,
  compact = false,
  targetScore = null,
  game = null,
  interactive,
}) {
  const reduceMotion = useReducedMotion();
  // Satu baris terbuka pada satu waktu: daftar tetap ringkas walau meja penuh.
  // Penanda `sig` membuat pilihan lama tidak terbawa ke ronde berikutnya —
  // saat hasil ronde baru masuk, tak ada baris yang otomatis terbuka.
  const [opened, setOpened] = useState({ id: null, sig: null });
  const ranked = [...seats].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const prevById = Object.fromEntries((prevScores || []).map(row => [row.playerId, row]));
  const unlimited = targetScore === 0;
  const showProgress = Number.isFinite(targetScore) && targetScore > 0;
  const expandable = (typeof interactive === 'boolean' ? interactive : !compact) && Boolean(prevScores?.length);
  const roundSig = (prevScores || []).map(row => `${row.playerId}:${row.total}`).join('|');
  const toggle = (id, sig) => setOpened(current => (
    current.id === id && current.sig === sig ? { id: null, sig } : { id, sig }
  ));

  return (
    <ol className="flex flex-col gap-1.5">
      {ranked.map((seat, index) => {
        const prev = prevById[seat.id];
        const isViewer = seat.id === viewerId;
        const score = seat.score ?? 0;
        const progress = showProgress ? Math.max(0, Math.min(100, (score / targetScore) * 100)) : 0;
        const reached = showProgress && score >= targetScore;
        const canOpen = expandable && Boolean(prev);
        const open = canOpen && opened.id === seat.id && opened.sig === roundSig;
        const panelId = `standings-detail-${seat.id}`;
        const rowClass = `rounded-xl border ${compact ? 'px-2 py-1.5' : 'px-2.5 py-2'} ${
          index === 0
            ? 'bg-goldAccent/10 border-goldAccent/35'
            : isViewer
              ? 'bg-emeraldPrimary/8 border-emeraldPrimary/25'
              : 'bg-white/[0.03] border-white/10'
        }`;

        // Isi baris dipakai dua kali: sebagai <button> (bisa diketuk) atau
        // sebagai <div> biasa saat tidak ada rincian ronde untuk dibuka.
        const header = (
          <>
            <span className="w-6 text-center shrink-0 text-[13px] font-extrabold text-periwinkleMuted tabular-nums" aria-label={`Peringkat ${index + 1}`}>
              {MEDALS[index] || index + 1}
            </span>
            <span className={`${compact ? 'w-6 h-6' : 'w-7 h-7'} rounded-lg overflow-hidden shrink-0`}>
              <AvatarArt avatar={seat.avatar} size={compact ? 24 : 28} />
            </span>
            <span className="min-w-0 flex-1 flex flex-col leading-tight gap-0.5">
              <span className="text-[11.5px] font-bold text-white truncate">
                {seat.name}
                {isViewer && <span className="text-emeraldPrimary font-extrabold"> · Kamu</span>}
              </span>
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="text-[9px] font-semibold text-periwinkleMuted truncate shrink-0">
                  {seat.bot ? 'Bot' : seat.id === hostId ? 'Host' : 'Pemain'}
                  {prev && !canOpen && (
                    <> • Ronde lalu <span className={prev.total >= 0 ? 'text-emeraldPrimary' : 'text-crimsonDanger'}>{prev.total > 0 ? '+' : ''}{prev.total}</span></>
                  )}
                </span>
                {/* Preview kartu penutup / sisa tangan: tetap terlihat tanpa
                    perlu membuka rincian. */}
                {canOpen && <ScoreCardPreview row={prev} game={game} dense />}
              </span>
            </span>
            <span className="shrink-0 flex flex-col items-end leading-tight">
              <span className="text-sm font-extrabold text-white tabular-nums">
                {score}
                <span className="text-[9px] font-semibold text-periwinkleMuted ml-1">poin</span>
              </span>
              {canOpen && (
                <span
                  className={`text-[9.5px] font-extrabold tabular-nums ${
                    prev.total >= 0 ? 'text-emeraldPrimary' : 'text-crimsonDanger'
                  }`}
                >
                  {prev.total > 0 ? '+' : ''}{prev.total} ronde
                </span>
              )}
            </span>
            {canOpen && (
              <span
                aria-hidden="true"
                className={`shrink-0 text-[10px] text-periwinkleMuted transition-transform ${open ? 'rotate-180' : ''}`}
              >
                ▾
              </span>
            )}
          </>
        );

        return (
          <motion.li
            key={seat.id}
            layout="position"
            initial={reduceMotion ? false : { opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={reduceMotion
              ? { duration: 0 }
              : {
                delay: index * 0.05,
                duration: 0.25,
                // Tukar peringkat menggeser baris naik/turun dengan pegas,
                // bukan lompatan instan saat skor berubah.
                layout: { type: 'spring', stiffness: 500, damping: 40 },
              }}
            className={rowClass}
          >
            {canOpen ? (
              <button
                type="button"
                onClick={() => toggle(seat.id, roundSig)}
                aria-expanded={open}
                aria-controls={open ? panelId : undefined}
                title={open ? 'Tutup rincian kartu' : 'Lihat rincian kartu & nilai ronde'}
                className="w-full flex items-center gap-2.5 text-left rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-emeraldPrimary/60"
              >
                {header}
              </button>
            ) : (
              <div className="flex items-center gap-2.5">{header}</div>
            )}

            {/* Progress bar tipis menuju target tamat turnamen. Hanya muncul
                bila targetScore > 0; "Tanpa Batas" memang tak punya garis akhir. */}
            {showProgress && (
              <div className="mt-1 flex items-center gap-1.5 pl-[34px]">
                <span
                  className="relative h-1 flex-1 rounded-full bg-white/10 overflow-hidden"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={targetScore}
                  aria-valuenow={Math.max(0, Math.min(targetScore, score))}
                  aria-label={`Progres ${seat.name} menuju target ${targetScore} poin`}
                >
                  <motion.span
                    className={`absolute inset-y-0 left-0 rounded-full ${reached ? 'bg-goldAccent' : 'bg-emeraldPrimary'}`}
                    initial={false}
                    animate={{ width: `${progress}%` }}
                    transition={reduceMotion ? { duration: 0 } : { duration: 0.45, ease: 'easeOut' }}
                  />
                </span>
                <span className={`text-[8.5px] font-bold tabular-nums shrink-0 ${reached ? 'text-goldAccent' : 'text-periwinkleMuted'}`}>
                  {reached ? 'TAMAT' : `${Math.min(100, Math.round(progress))}%`}
                </span>
              </div>
            )}

            {/* Accordion rincian ronde: angka + visual kartu, tepat di bawah
                baris pemain yang diketuk. */}
            {open && (
              <div id={panelId} className="mt-1.5 pt-2 border-t border-white/10">
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-periwinkleMuted">
                  <span>Kombinasi <b className="text-emeraldPrimary tabular-nums">+{prev.positive ?? 0}</b></span>
                  {prev.closerBonus > 0 && (
                    <span>Tutup <b className="text-goldAccent tabular-nums">+{prev.closerBonus}</b></span>
                  )}
                  {(prev.discardedAces || 0) > 0 && (
                    <span>As dibuang <b className="text-white/70 tabular-nums">{prev.discardedAces}</b> <span className="opacity-70">(netral)</span></span>
                  )}
                  {(prev.discardedJokers || 0) > 0 && (
                    <span>Joker dibuang <b className="text-crimsonDanger tabular-nums">−{(prev.discardedJokers || 0) * 150}</b></span>
                  )}
                  {(prev.jokersInHand || 0) > 0 && (
                    <span>Joker di tangan <b className="text-crimsonDanger tabular-nums">−{(prev.jokersInHand || 0) * 50}</b></span>
                  )}
                  <span>
                    Sisa tangan{' '}
                    <b className="text-crimsonDanger tabular-nums">
                      −{(prev.negative || 0) - (prev.discardedJokers || 0) * 150}
                    </b>
                  </span>
                  <span className="ml-auto font-bold text-white">
                    Total Ronde{' '}
                    <b className={`tabular-nums ${prev.total >= 0 ? 'text-emeraldPrimary' : 'text-crimsonDanger'}`}>
                      {prev.total > 0 ? '+' : ''}{prev.total}
                    </b>
                  </span>
                </div>

                <RoundScoreDetail row={prev} game={game} collapsible={false} />
              </div>
            )}
          </motion.li>
        );
      })}
      {ranked.length === 0 && (
        <li className="text-xs text-periwinkleMuted text-center py-3 inline-flex items-center justify-center gap-1.5">
          <Icon.Users size={13} /> Belum ada pemain di kursi.
        </li>
      )}
      {unlimited && ranked.length > 0 && (
        <li className="text-[9px] text-center font-semibold text-periwinkleMuted/80 pt-0.5">
          Mode Tanpa Batas — main sampai puas.
        </li>
      )}
    </ol>
  );
}
