import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { findVoiceReactionFx } from '../utils/voiceReactions.js';
import { fallbackPlayerPoint, resolvePlayerPoint, subscribeVoiceFx } from '../utils/voiceFx.js';
import '../styles/tongkronganFX.css';

/**
 * Efek visual reaksi suara di atas profil pengirim.
 *
 * Alurnya sengaja dipisah dari audio:
 *   - `VoiceReactionBar` mengirim event reaksi lalu meneruskannya ke bus lokal
 *     (`utils/voiceFx.js`);
 *   - komponen ini berlangganan bus itu dan menggambar emoji + label di atas
 *     kursi pengirim — persis pola balon ejekan, tapi tanpa menyentuh
 *     `TauntThrowSystem` (file itu punya jalur dan tesnya sendiri).
 *
 * Posisi diambil dari atribut `data-player-id` yang dipasang di avatar kursi
 * (meja main dan ruang tunggu). Kalau kursi tidak ketemu (penonton, tata letak
 * belum siap), efek jatuh ke bawah-tengah layar — area profil sendiri.
 */

const FX_TTL_MS = 2200;
const MAX_CONCURRENT = 3;
/** Jarak emoji di atas tepi atas avatar. */
const LIFT_PX = 10;
const EDGE_PAD = 8;

// Percikan kecil mengelilingi emoji. Arahnya menyebar, bukan berputar penuh,
// supaya terbaca sebagai "sorakan" dan tidak menutupi teks.
const SPARKS = [
  { tx: -30, ty: -34, delay: 0 },
  { tx: 30, ty: -30, delay: 90 },
  { tx: -24, ty: -10, delay: 40 },
  { tx: 26, ty: -12, delay: 130 },
];

function ProfileBurst({ item, onDone }) {
  const rootRef = useRef(null);
  const [point, setPoint] = useState(null);
  const [nudge, setNudge] = useState({ dx: 0, dy: 0 });

  useEffect(() => {
    const timer = setTimeout(() => onDone(item.id), FX_TTL_MS);
    return () => clearTimeout(timer);
  }, [item.id, onDone]);

  // Layar bisa berubah (rotasi HP, dock naik-turun) selama efek hidup, jadi
  // jangkar diukur ulang berkala seperti balon ejekan.
  useEffect(() => {
    const place = () => {
      const next = resolvePlayerPoint(item.fromId) || fallbackPlayerPoint();
      setPoint(prev => (prev && prev.x === next.x && prev.y === next.y ? prev : next));
    };
    place();
    const timer = setInterval(place, 400);
    return () => clearInterval(timer);
  }, [item.fromId]);

  useLayoutEffect(() => {
    const node = rootRef.current;
    if (!node || !point || typeof window === 'undefined') return;
    const width = node.offsetWidth;
    const height = node.offsetHeight;
    const viewportWidth = window.innerWidth;
    const left = point.x - width / 2;
    let dx = 0;
    if (left < EDGE_PAD) dx = EDGE_PAD - left;
    else if (left + width > viewportWidth - EDGE_PAD) dx = viewportWidth - EDGE_PAD - (left + width);
    // Efek tumbuh ke atas dari tepi avatar; kalau mepet langit-langit layar,
    // geser turun secukupnya agar emoji tidak terpotong.
    const top = point.y - height - LIFT_PX;
    const dy = top < EDGE_PAD ? EDGE_PAD - top : 0;
    setNudge(prev => (prev.dx === dx && prev.dy === dy ? prev : { dx, dy }));
  }, [point, item.id]);

  if (!point) return null;

  return (
    <div
      ref={rootRef}
      className="tkfx-voicefx"
      style={{
        left: point.x,
        top: point.y,
        '--vfx-dx': `${nudge.dx}px`,
        '--vfx-dy': `${nudge.dy}px`,
      }}
    >
      <span className="tkfx-voicefx__emoji">{item.emoji}</span>
      <span className="tkfx-voicefx__text">{item.text}</span>
      {SPARKS.map((spark, index) => (
        <span
          key={index}
          className="tkfx-voicefx__spark"
          style={{ '--tx': `${spark.tx}px`, '--ty': `${spark.ty}px`, '--d': `${spark.delay}ms` }}
        />
      ))}
    </div>
  );
}

/**
 * Lapisan efek profil reaksi suara. Cukup di-mount sekali (PTTDock) — tidak
 * butuh props, karena sumber datanya bus lokal.
 */
export default function VoiceProfileFx() {
  const [items, setItems] = useState([]);
  // Dedupe per id event: event yang sama bisa datang dari bus (pengirim) dan
  // dari echo kanal; efeknya tidak boleh muncul dua kali.
  const seenRef = useRef(new Set());

  useEffect(() => subscribeVoiceFx(detail => {
    const fx = findVoiceReactionFx(detail.reactionId);
    if (!fx) return;
    if (seenRef.current.has(detail.id)) return;
    seenRef.current.add(detail.id);
    if (seenRef.current.size > 40) {
      seenRef.current = new Set([...seenRef.current].slice(-20));
    }
    setItems(prev => [
      ...prev.slice(-(MAX_CONCURRENT - 1)),
      { id: detail.id, fromId: detail.fromId, emoji: fx.emoji, text: fx.text },
    ]);
  }), []);

  const remove = useCallback(id => {
    setItems(prev => prev.filter(item => item.id !== id));
  }, []);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="tkfx-voicefx-layer" aria-hidden="true">
      {items.map(item => (
        <ProfileBurst key={item.id} item={item} onDone={remove} />
      ))}
    </div>,
    document.body,
  );
}
