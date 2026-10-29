import CardAsset from './CardAsset.jsx';
import { handPenaltyFor, pointsFor } from '../engine/gameRules.js';

// Nilai poin satu kombinasi — aturan hitung sama dengan penilaian akhir ronde
// (angka +5, huruf +10, As +15, Joker pengisi +5).
const meldGroupPoints = group =>
  group.reduce((sum, card) => sum + ((card.kind === 'joker' || card.value === 'JOKER') ? 5 : pointsFor(card)), 0);

function MeldGroup({ group }) {
  return (
    <div className="rounded-lg bg-black/25 border border-white/10 px-2 py-1.5">
      <div className="flex items-center justify-center">
        {group.map((card, i) => (
          <span
            key={card.uid}
            className="w-7 sm:w-9 shrink-0 rounded-[5px] mr-[-7px] sm:mr-[-9px] last:mr-0 shadow-card"
            style={{ zIndex: i, transform: `rotate(${(i - (group.length - 1) / 2) * 3}deg)` }}
          >
            <CardAsset card={card} variant="mini" />
          </span>
        ))}
      </div>
      <p className="text-center text-[9px] font-bold text-emeraldPrimary mt-1.5 tabular-nums">+{meldGroupPoints(group)}</p>
    </div>
  );
}

// Kartu sisa tangan dengan badge penalti menempel di kakinya (Joker −50,
// As −15, huruf −10, angka −5) — persis aturan handPenaltyFor.
function HandCard({ card }) {
  return (
    <span className="relative w-7 sm:w-9 shrink-0 inline-block">
      <CardAsset card={card} variant="mini" />
      <span className="absolute inset-x-0 bottom-0 text-center text-[8.5px] leading-[1.2] py-[1px] bg-black/70 text-crimsonDanger font-bold tabular-nums rounded-b-[5px]">
        −{handPenaltyFor(card)}
      </span>
    </span>
  );
}

/**
 * RoundScoreDetail — rincian per kartu di layar akhir ronde: kombinasi di
 * meja, kombinasi yang masih di tangan (tetap dihitung plus), dan sisa
 * tangan dengan penalti per kartu. Semua pemain melihat data yang sama
 * (kartu sudah terbuka saat ronde berakhir).
 */
export default function RoundScoreDetail({ row, game }) {
  const tableMelds = game?.players?.find(player => player.id === row.playerId)?.melds || [];
  const handPenaltyTotal = row.negative - row.discardedJokers * 150;
  const hasAny = tableMelds.length > 0 || (row.handMelds?.length > 0) || (row.restCards?.length > 0);

  return (
    <div className="mt-2 pt-2.5 border-t border-white/10 flex flex-col gap-2.5">
      {tableMelds.length > 0 && (
        <section>
          <p className="text-[9px] font-extrabold uppercase tracking-wider text-periwinkleMuted mb-1.5">Kombinasi di meja</p>
          <div className="flex flex-wrap gap-x-2 gap-y-1.5">
            {tableMelds.map((group, gi) => <MeldGroup key={`t${gi}`} group={group} />)}
          </div>
        </section>
      )}

      {row.handMelds?.length > 0 && (
        <section>
          <p className="text-[9px] font-extrabold uppercase tracking-wider text-periwinkleMuted mb-1.5">
            Kombinasi di tangan <span className="normal-case font-semibold">(tetap dihitung plus)</span>
          </p>
          <div className="flex flex-wrap gap-x-2 gap-y-1.5">
            {row.handMelds.map((group, gi) => <MeldGroup key={`h${gi}`} group={group} />)}
          </div>
        </section>
      )}

      {row.restCards?.length > 0 && (
        <section>
          <p className="text-[9px] font-extrabold uppercase tracking-wider text-periwinkleMuted mb-1.5">
            Sisa di tangan <span className="text-crimsonDanger normal-case">total −{handPenaltyTotal}</span>
          </p>
          <div className="flex flex-wrap gap-x-1.5 gap-y-1.5">
            {row.restCards.map(card => <HandCard key={card.uid} card={card} />)}
          </div>
        </section>
      )}

      {row.closerBonus > 0 && game?.closerCard && (
        <section className="flex items-center gap-2">
          <p className="text-[9px] font-extrabold uppercase tracking-wider text-periwinkleMuted">Kartu penutup</p>
          <span className="w-7 sm:w-9 rounded-[5px] shadow-card inline-block">
            <CardAsset card={game.closerCard} variant="mini" />
          </span>
          <span className="text-[10px] font-bold text-goldAccent tabular-nums">+{row.closerBonus}</span>
        </section>
      )}

      {!hasAny && (
        <p className="text-[10px] text-periwinkleMuted">Tangan kosong — Mati Sampah, rapi!</p>
      )}
    </div>
  );
}
