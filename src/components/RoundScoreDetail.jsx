import { useState } from 'react';
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
            className="w-7 sm:w-9 shrink-0 rounded-[3px] mr-[-7px] sm:mr-[-9px] last:mr-0 shadow-card"
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
 * ScoreCardPreview — preview mini yang SELALU terlihat di kartu skor ringkas
 * akhir ronde, tanpa perlu membuka "Rincian kartu": kartu penutup (pemenang)
 * atau tumpukan kartu sisa di tangan. Dulu semua visual kartu tersembunyi di
 * balik satu klik tambahan, sehingga pemain harus membuka tiap kartu satu-satu
 * hanya untuk tahu siapa menutup dengan kartu apa.
 *
 * dense: versi satu baris untuk baris "Peringkat Meja" — badge kartu penutup
 * ditulis mendatar ("Tutup +30") supaya tinggi baris pemain tidak membengkak.
 */
export function ScoreCardPreview({ row, game, dense = false }) {
  const closerCard = row.closerBonus > 0 ? game?.closerCard : null;
  const restCards = row.restCards || [];
  const handMeldCount = (row.handMelds || []).length;

  if (closerCard) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-lg bg-goldAccent/15 border border-goldAccent/45 pl-1 pr-1.5 py-0.5"
        title={`Kartu penutup — bonus +${row.closerBonus} poin`}
      >
        <span className="w-4 shrink-0 rounded-[2px] overflow-hidden shadow-card">
          <CardAsset card={closerCard} variant="mini" />
        </span>
        {dense ? (
          <span className="text-[8.5px] font-extrabold uppercase leading-none text-goldAccent whitespace-nowrap tabular-nums">
            Tutup +{row.closerBonus}
          </span>
        ) : (
          <span className="text-[8px] font-extrabold uppercase leading-[1.15] text-goldAccent">
            Tutup
            <br />
            <span className="tabular-nums">+{row.closerBonus}</span>
          </span>
        )}
      </span>
    );
  }

  if (restCards.length > 0) {
    const shown = restCards.slice(0, 3);
    return (
      <span className="inline-flex items-center gap-1" title={`${restCards.length} kartu sisa di tangan`}>
        <span className="flex items-center">
          {shown.map((card, i) => (
            <span
              key={card.uid || i}
              className="w-3.5 shrink-0 rounded-[2px] overflow-hidden shadow-card"
              style={{ marginLeft: i ? -6 : 0, zIndex: i }}
            >
              <CardAsset card={card} variant="mini" />
            </span>
          ))}
        </span>
        <span className="text-[8.5px] font-extrabold text-crimsonDanger whitespace-nowrap tabular-nums">
          {restCards.length} sisa
        </span>
      </span>
    );
  }

  if (handMeldCount > 0) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-lg bg-emeraldPrimary/12 border border-emeraldPrimary/35 px-1.5 py-0.5 text-[8px] font-extrabold uppercase text-emeraldPrimary whitespace-nowrap"
        title={`${handMeldCount} kombinasi masih di tangan (tetap dihitung plus)`}
      >
        +{handMeldCount} kombinasi
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 rounded-lg bg-emeraldPrimary/12 border border-emeraldPrimary/35 px-1.5 py-0.5 text-[8px] font-extrabold uppercase text-emeraldPrimary whitespace-nowrap"
      title="Tangan kosong — Mati Sampah"
    >
      Tangan kosong
    </span>
  );
}

/**
 * RoundScoreDetail — rincian per kartu di layar akhir ronde: kombinasi di
 * meja, kombinasi yang masih di tangan (tetap dihitung plus), dan sisa
 * tangan dengan penalti per kartu. Semua pemain melihat data yang sama
 * (kartu sudah terbuka saat ronde berakhir).
 *
 * Buka/tutup:
 *  - defaultExpanded: kondisi awal (dipakai untuk kartu milik sendiri dan
 *    layar lebar) supaya rincian langsung terlihat tanpa klik ekstra.
 *  - expanded + onToggle: mode terkendali — induk yang menyimpan pilihannya.
 */
export default function RoundScoreDetail({
  row,
  game,
  defaultExpanded = false,
  expanded,
  onToggle,
  collapsible = true,
}) {
  const [uncontrolled, setUncontrolled] = useState(defaultExpanded);
  const controlled = typeof expanded === 'boolean';
  const open = controlled ? expanded : uncontrolled;
  const toggle = () => {
    if (controlled) onToggle?.();
    else setUncontrolled(value => !value);
  };

  const tableMelds = game?.players?.find(player => player.id === row.playerId)?.melds || [];
  // (|| 0) defensif: ronde lama yang tersimpan mungkin belum punya field ini.
  const handPenaltyTotal = (row.negative || 0) - (row.discardedJokers || 0) * 150;
  const hasAny = tableMelds.length > 0 || (row.handMelds?.length > 0) || (row.restCards?.length > 0);

  const detail = (
    <div className={`flex flex-col gap-2.5 ${collapsible ? 'mt-2 pt-2.5 border-t border-white/10' : 'mt-1.5'}`}>
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
          <span className="w-7 sm:w-9 rounded-[3px] shadow-card inline-block">
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

  if (!collapsible) return detail;

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full h-7 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] font-bold text-periwinkleMuted hover:text-white transition flex items-center justify-center gap-1"
      >
        <span aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
        <span>{open ? 'Tutup rincian' : 'Rincian kartu'}</span>
      </button>
      {open && detail}
    </div>
  );
}
