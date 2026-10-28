import React, { useEffect, useRef } from 'react';

export default function ScoreModal({ scores, players, onNext }) {
  const action = useRef(null);

  useEffect(() => {
    if (!scores) return undefined;
    action.current?.focus();
    const close = event => {
      if (event.key === 'Escape') onNext();
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [scores, onNext]);

  if (!scores) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="score-title">
      <section className="bg-[#1B1F38] border border-white/10 rounded-3xl p-5 sm:p-6 max-w-lg w-full shadow-2xl flex flex-col gap-4 text-white">
        <header className="pb-2 border-b border-white/10">
          <h2 id="score-title" className="text-base font-bold text-white flex items-center gap-2">
            <span>🏁</span>
            <span>Skor Ronde</span>
          </h2>
          <p className="text-xs text-periwinkleMuted mt-1">
            Kartu meja memberi poin plus (+). Kartu sisa di tangan mengurangi skor (−).
          </p>
        </header>

        <div className="flex flex-col gap-2.5 max-h-72 overflow-y-auto pr-1">
          {scores.map(row => {
            const player = players.find(item => item.id === row.playerId);
            const meldCards = player?.melds?.flat() || [];
            const remaining = player?.hand || [];
            const isPos = row.total >= 0;

            return (
              <article
                key={row.playerId}
                className="p-3 rounded-2xl bg-[#15192E] border border-white/5 flex flex-col gap-1.5"
              >
                <div className="flex items-center justify-between">
                  <strong className="text-xs sm:text-sm font-bold text-white truncate max-w-[180px]">
                    {row.name}
                  </strong>
                  <span className={`text-xs font-bold tabular-nums ${isPos ? 'text-emeraldPrimary' : 'text-crimsonDanger'}`}>
                    {row.total > 0 ? '+' : ''}{row.total}
                  </span>
                </div>

                <div className="text-[11px] text-periwinkleMuted flex justify-between">
                  <span>
                    Meja: <b className="text-emeraldPrimary">+{row.positive}</b>{' '}
                    <small className="opacity-75">({meldCards.map(c => `${c.value}${c.suit || ''}`).join(', ') || 'Belum ada'})</small>
                  </span>
                  <span>
                    Tangan: <b className="text-crimsonDanger">−{row.negative}</b>{' '}
                    <small className="opacity-75">({remaining.map(c => `${c.value}${c.suit || ''}`).join(', ') || 'Habis'})</small>
                  </span>
                </div>

                <div className="text-[10px] text-periwinkleMuted pt-1 border-t border-white/5 flex justify-between">
                  <span>Skor kumulatif setelah ronde:</span>
                  <b className="text-white tabular-nums">{(player?.score || 0) + row.total}</b>
                </div>
              </article>
            );
          })}
        </div>

        <button
          ref={action}
          type="button"
          className="w-full py-3 rounded-2xl bg-emeraldPrimary hover:brightness-110 active:scale-95 font-bold text-sm text-white shadow-lg transition mt-2"
          onClick={onNext}
        >
          Main Ronde Berikutnya
        </button>
      </section>
    </div>
  );
}
