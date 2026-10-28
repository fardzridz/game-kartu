import React, { useMemo, useState } from 'react';
import CardSVG from './CardSVG.jsx';
import { validateMeld } from '../engine/gameRules.js';

export default function DigModal({ discardPile, discardIndex, hand, maxDepth = 5, onConfirm, onCancel }) {
  const [picked, setPicked] = useState([]);

  const target = discardPile[discardIndex];
  const carried = discardPile.slice(discardIndex + 1);
  const depth = discardPile.length - discardIndex;

  const check = useMemo(() => {
    const chosen = hand.filter(card => picked.includes(card.uid));
    if (!target) return { valid: false, reason: 'Kartu galian tidak ditemukan.' };
    if (depth > maxDepth) return { valid: false, reason: `Kartu terkunci: kedalaman ke-${depth} melebihi batas gali ${maxDepth}.` };
    if (chosen.length < 2) return { valid: false, reason: `Pilih minimal 2 kartu tangan (${chosen.length}/2 terpilih).` };
    const val = validateMeld([target, ...chosen]);
    if (!val.valid) return { valid: false, reason: val.reason };
    const remaining = hand.length - chosen.length + carried.length;
    if (remaining < 1) return { valid: false, reason: 'Wajib menyisakan minimal 1 kartu untuk dibuang di akhir giliran!' };
    return { valid: true, reason: remaining === 1 ? 'Pas! Sisa tepat 1 kartu untuk dibuang.' : `Kombinasi sah — sisa ${remaining} kartu di tangan.` };
  }, [target, picked, hand, carried, depth, maxDepth]);

  if (!target) return null;

  function toggle(uid) {
    setPicked(prev => (prev.includes(uid) ? prev.filter(item => item !== uid) : [...prev, uid]));
  }

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Konfirmasi Gali dan Turun">
      <section className="bg-[#1B1F38] border border-white/10 rounded-3xl p-5 sm:p-6 max-w-lg w-full shadow-2xl flex flex-col gap-4 text-white">
        <header className="flex items-center justify-between pb-3 border-b border-white/10">
          <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
            <span>⛏️</span>
            <span>Gali Buangan ke-{depth}</span>
          </h3>
          <button
            type="button"
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-xs font-bold text-white transition"
            onClick={onCancel}
          >
            ✕
          </button>
        </header>

        {/* Target Card & Carried Info */}
        <div className="flex items-start gap-4 p-3 rounded-2xl bg-[#15192E] border border-white/5">
          <div className="relative w-16 sm:w-20 shrink-0 shadow-card rounded-lg overflow-hidden">
            <span className="absolute top-1 left-1 bg-[#1B1F38] text-[9px] font-bold px-1.5 py-0.5 rounded-full text-goldAccent border border-white/10 z-10">
              #{depth}
            </span>
            <CardSVG card={target} />
          </div>
          <div className="flex-1 text-xs text-periwinkleMuted">
            <p className="font-semibold text-white mb-1.5">
              <strong className="text-goldAccent">{carried.length}</strong> kartu di atasnya ikut masuk ke tanganmu:
            </p>
            <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto no-scrollbar">
              {carried.length === 0 ? (
                <span className="text-[11px] text-periwinkleMuted/60">Tidak ada — kartu ini paling atas.</span>
              ) : (
                carried.map(card => (
                  <div key={card.uid} className="w-8 h-11 rounded-[3px] overflow-hidden shadow-xs">
                    <CardSVG card={card} />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Instructions */}
        <p className="text-xs text-periwinkleMuted font-medium">
          Pilih <strong className="text-white">minimal 2 kartu tanganmu</strong> yang akan diturunkan bersama kartu galian ini:
        </p>

        {/* Hand Cards Grid */}
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-48 overflow-y-auto p-1 rounded-2xl bg-[#121526] border border-white/5">
          {hand.map(card => {
            const isPicked = picked.includes(card.uid);
            return (
              <button
                key={card.uid}
                type="button"
                className={`relative rounded-lg p-0.5 transition-all ${
                  isPicked
                    ? 'ring-3 ring-emeraldPrimary scale-105 shadow-cardHover -translate-y-1'
                    : 'opacity-85 hover:opacity-100 hover:scale-102'
                }`}
                onClick={() => toggle(card.uid)}
                aria-pressed={isPicked}
              >
                <div className="rounded-md overflow-hidden shadow-sm">
                  <CardSVG card={card} />
                </div>
                {isPicked && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-emeraldPrimary text-white text-[9px] font-bold flex items-center justify-center shadow">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Status & Actions */}
        <footer className="pt-2 border-t border-white/10 flex flex-col gap-3">
          <div
            className={`p-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 border ${
              check.valid
                ? 'bg-emeraldPrimary/15 border-emeraldPrimary/30 text-emeraldPrimary'
                : 'bg-crimsonDanger/15 border-crimsonDanger/30 text-crimsonDanger'
            }`}
          >
            <span>{check.valid ? '✓' : '✗'}</span>
            <span>{check.reason}</span>
          </div>

          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              className="px-4 py-2.5 rounded-xl bg-btnSurface hover:bg-[#5B649B] text-xs font-semibold text-white transition"
              onClick={onCancel}
            >
              Batal
            </button>
            <button
              type="button"
              className={`px-5 py-2.5 rounded-xl font-bold text-xs shadow-lg transition flex items-center gap-1.5 ${
                check.valid
                  ? 'bg-emeraldPrimary hover:brightness-110 active:scale-95 text-white'
                  : 'bg-[#252A4A] text-periwinkleMuted cursor-not-allowed opacity-60'
              }`}
              disabled={!check.valid}
              onClick={() => onConfirm(picked)}
            >
              <span>⛏️ Konfirmasi Gali &amp; Turun</span>
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
