import { motion, useReducedMotion } from 'framer-motion';
import { AvatarArt, Icon } from './SvgPrimitives.jsx';

const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * Standings — papan peringkat kumulatif meja, diurutkan dari skor tertinggi.
 * Baris pertama (pemimpin) disorot; tiap baris menampilkan skor total dan
 * hasil ronde terakhir bila tersedia. Dipakai di ruang tunggu dan modal
 * peringkat saat bermain.
 */
export default function Standings({ seats, viewerId, hostId = null, prevScores = null, compact = false }) {
  const reduceMotion = useReducedMotion();
  const ranked = [...seats].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const prevById = Object.fromEntries((prevScores || []).map(row => [row.playerId, row]));

  return (
    <ol className="flex flex-col gap-1.5">
      {ranked.map((seat, index) => {
        const prev = prevById[seat.id];
        const isViewer = seat.id === viewerId;
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
            className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 ${
              index === 0
                ? 'bg-goldAccent/10 border-goldAccent/35'
                : isViewer
                  ? 'bg-emeraldPrimary/8 border-emeraldPrimary/25'
                  : 'bg-white/[0.03] border-white/10'
            }`}
          >
            <span className="w-6 text-center shrink-0 text-[13px] font-extrabold text-periwinkleMuted tabular-nums" aria-label={`Peringkat ${index + 1}`}>
              {MEDALS[index] || index + 1}
            </span>
            <span className={`${compact ? 'w-6 h-6' : 'w-7 h-7'} rounded-lg overflow-hidden shrink-0`}>
              <AvatarArt avatar={seat.avatar} size={compact ? 24 : 28} />
            </span>
            <span className="min-w-0 flex-1 flex flex-col leading-tight">
              <span className="text-[11.5px] font-bold text-white truncate">
                {seat.name}
                {isViewer && <span className="text-emeraldPrimary font-extrabold"> · Kamu</span>}
              </span>
              <span className="text-[9px] font-semibold text-periwinkleMuted truncate">
                {seat.bot ? 'Bot' : seat.id === hostId ? 'Host' : 'Pemain'}
                {prev && (
                  <> • Ronde lalu <span className={prev.total >= 0 ? 'text-emeraldPrimary' : 'text-crimsonDanger'}>{prev.total > 0 ? '+' : ''}{prev.total}</span></>
                )}
              </span>
            </span>
            <span className="text-sm font-extrabold text-white tabular-nums shrink-0">
              {seat.score ?? 0}
              <span className="text-[9px] font-semibold text-periwinkleMuted ml-1">poin</span>
            </span>
          </motion.li>
        );
      })}
      {ranked.length === 0 && (
        <li className="text-xs text-periwinkleMuted text-center py-3 inline-flex items-center justify-center gap-1.5">
          <Icon.Users size={13} /> Belum ada pemain di kursi.
        </li>
      )}
    </ol>
  );
}
