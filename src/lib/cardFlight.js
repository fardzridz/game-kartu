import { getCardAssetPath } from '../utils/cardAssets.js';

/**
 * cardFlight — mesin animasi kartu DOM Bounding-Box.
 *
 * Prinsip: TIDAK ADA koordinat tebakan. Semua posisi awal/akhir diukur dengan
 * getBoundingClientRect() tepat sebelum animasi, lalu kloning visual kartu
 * diterbangkan di satu layer fixed (#card-flight-layer).
 *
 * WAJAH KARTU:
 *   Kartu di tangan pemain sendiri pada dasarnya tertutup (punggung) dan baru
 *   dibuka saat diangkat. Jadi saat dibuang: kartu membesar di tempat →
 *   FLIP ke muka saat masih besar → baru mengecil masuk tumpukan.
 */

const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
const EASE_QUICK = 'cubic-bezier(0.16, 0.88, 0.28, 1)';
// Rasio intrinsik aset /cards/*.svg (viewBox 167 × 242.67)
const ASSET_RATIO = 242.67 / 167;
const LAYER_ID = 'card-flight-layer';

// Pemain yang memilih kurangi gerak tetap dapat umpan balik mendarat, hanya
// tanpa penerbangan panjang: semua durasi dipatok pendek.
function prefersReducedMotion() {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function ensureFlightLayer() {
  if (typeof document === 'undefined') return null;
  let layer = document.getElementById(LAYER_ID);
  if (!layer) {
    layer = document.createElement('div');
    layer.id = LAYER_ID;
    Object.assign(layer.style, {
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none',
      zIndex: '9999',
      overflow: 'hidden',
    });
    document.body.appendChild(layer);
  }
  return layer;
}

export function rectOf(elOrSelector) {
  if (typeof document === 'undefined') return null;
  const el = typeof elOrSelector === 'string' ? document.querySelector(elOrSelector) : elOrSelector;
  if (!el || !el.isConnected) return null;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return r;
}

// Supaya animasi bisa sepenuhnya ditunggu tanpa transisi CSS bergantung
// dukungan browser: tiap fase memakai WAAPI + fallback setTimeout.
function startTracked(el, keyframes, options) {
  try {
    const anim = el.animate(keyframes, options);
    return anim && typeof anim.finished?.then === 'function' ? anim : null;
  } catch {
    return null;
  }
}

function wait(el, anim, ms) {
  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    if (anim) {
      anim.finished.then(finish, finish);
      // jaring pengaman: WAAPI tidak boleh menggantung animasi
      setTimeout(finish, ms + 260);
    } else if (typeof el.offsetWidth === 'number') {
      setTimeout(finish, ms);
    } else {
      finish();
    }
  });
}

/**
 * Terbangkan satu kartu.
 *   from / to   : DOMRect (boleh null; null = mulai/berhenti di sasaran)
 *   zoomFlip    : punggung → membesar → FLIP ke muka saat besar → masuk target
 *   flipToFace  : punggung → muka (kecil, dipakai minum kartu)
 */
export function flyCard({
  from,
  to,
  card,
  back = false,
  lift = 0,
  rotateStart = 0,
  rotateFinal = 0,
  duration = 620,
  onLand,
  onDone,
  flipToFace = false,
  zoomFlip = false,
  peakScale = 1.6,
}) {
  if (typeof document === 'undefined') return Promise.resolve(null);
  const layer = ensureFlightLayer();
  if (!layer || !to) {
    onLand?.();
    onDone?.();
    return Promise.resolve(null);
  }
  if (prefersReducedMotion()) {
    duration = Math.min(140, duration);
    peakScale = 1;
    rotateStart = 0;
  }

  // Lebar = lebar kartu tujuan, tinggi = rasio aset (tanpa bantalan).
  const w = Math.round(to.width);
  const h = Math.round(w * ASSET_RATIO);
  const src = from || to;

  const deltaX = src.left + src.width / 2 - (to.left + to.width / 2);
  const deltaY = src.top + src.height / 2 - (to.top + to.height / 2);
  const startScale = Math.max(0.05, src.width / w);
  const autoArc = lift || Math.min(34, Math.max(14, Math.abs(deltaY) * 0.12));
  const arcY = -Math.abs(autoArc);

  const ghost = document.createElement('div');
  Object.assign(ghost.style, {
    position: 'absolute',
    left: `${(to.left + to.width / 2 - w / 2).toFixed(2)}px`,
    top: `${(to.top + to.height / 2 - h / 2).toFixed(2)}px`,
    width: `${w}px`,
    height: `${h}px`,
    borderRadius: `${Math.max(4, Math.round(w * 0.075))}px`,
    background: '#fff',
    transformOrigin: 'center center',
    willChange: 'transform, box-shadow',
    transform: `translate3d(${deltaX.toFixed(2)}px, ${deltaY.toFixed(2)}px, 0) scale(${startScale.toFixed(3)}) rotate(${rotateStart}deg)`,
    contain: 'layout paint',
    zIndex: String(10 + Math.round(w)),
  });

  const makeImg = path => {
    const img = document.createElement('img');
    img.src = path;
    img.alt = '';
    img.draggable = false;
    Object.assign(img.style, {
      display: 'block',
      width: '100%',
      height: '100%',
      objectFit: 'fill',
      borderRadius: 'inherit',
      pointerEvents: 'none',
      userSelect: 'none',
    });
    return img;
  };

  // ====== FLIP 3D ASLI ======
  // Kunci: `backface-visibility` DIABAIKAN Chrome bila elemen punya
  // `overflow: hidden`, dan `preserve-3d` hilang bila ada `overflow: hidden`
  // di antara parent-child. Jadi: bingkai 3D tanpa overflow/radius (radius &
  // clip dipasang di tiap FACE, di bawah img), dan penyembunyian sisi
  // belakang memakai backface-visibility pada face + img-nya langsung.
  // CATATAN: `perspective` TIDAK dipasang di parent. Bila perspective ada di
  // parent, anak yang di-rotate 180° "diterbalikkan" oleh parent sehingga
  // backface-visibility tidak pernah aktif (kartu tetap tampil di sisi
  // belakang). Perspektif harus berada di transform yang SAMA dengan rotate
  // (transform: perspective(...) rotateY(...)).
  const scene = document.createElement('div');
  Object.assign(scene.style, {
    position: 'absolute',
    inset: '0',
  });
  const FOV = Math.max(700, Math.round(w * 5));

  const frame = document.createElement('div');
  Object.assign(frame.style, {
    position: 'absolute',
    inset: '0',
    transformStyle: 'preserve-3d',
    transformOrigin: 'center center',
    transform: 'rotateY(0deg)',
    willChange: 'transform',
  });

  // Sisi depan/belakang kartu. `backface-visibility` tidak dipakai karena
  // tidak konsisten (Chrome mengabaikannya pada div wajah ber-overflow).
  // Sebagai gantinya: punggung & muka diberi sedikit Z berbeda — di dalam
  // raster 3D (kotak datar), punggung selalu berada di depan saat sudut 0°
  // dan muka berada di depan setelah kartu melewati 90°.
  const FACE_Z = Math.max(0.5, w * 0.012);
  const makeFace = (path, initialRotate, zIndex, zOffset = 0) => {
    const face = document.createElement('div');
    Object.assign(face.style, {
      position: 'absolute',
      inset: '0',
      borderRadius: `${Math.max(4, Math.round(w * 0.075))}px`,
      overflow: 'hidden',
      background: '#fff',
      transform: `perspective(${FOV}px) rotateY(${initialRotate}deg) translateZ(${zOffset}px)`,
      transformOrigin: 'center center',
      zIndex: String(zIndex),
      backfaceVisibility: 'hidden',
      webkitBackfaceVisibility: 'hidden',
      pointerEvents: 'none',
    });
    face.appendChild(makeImg(path));
    return face;
  };

  const faceBack = makeFace(getCardAssetPath(card, true), 0, 2, FACE_Z);
  const revealFacesEarly = !back || flipToFace;
  const faceFront = makeFace(getCardAssetPath(card, false), 180, 1, -FACE_Z);

  scene.appendChild(frame);
  frame.appendChild(faceBack);
  frame.appendChild(faceFront);
  ghost.appendChild(scene);
  layer.appendChild(ghost);

  const glow = scale => `0 ${Math.round(18 * scale)}px ${Math.round(42 * scale)}px rgba(0,0,0,0.5), 0 ${Math.round(6 * scale)}px ${Math.round(14 * scale)}px rgba(0,0,0,0.3)`;

  const finish = () => {
    // fade halus saat kloningan dilepas, supaya kartu asli tidak "kedip"
    ghost.style.transition = 'opacity 90ms linear';
    ghost.style.opacity = '0';
    setTimeout(() => ghost.remove(), 95);
  };

  if (zoomFlip) {
    // ---- FASE 1: angkat & membesar di tempat (masih punggung) ----
    // Angkat 34% · PUTAR (dipertajam agar terlihat jelas) 26% · jatuh sisanya
    const liftMs = Math.round(duration * 0.34);
    const flipMs = Math.round(duration * 0.26);
    const flyMs = duration - liftMs - Math.round(flipMs * 0.5);
    const peak = Math.max(1.2, peakScale);
    const pX = deltaX * 0.22;
    const pY = deltaY * 0.18 - 96;

    return (async () => {
      const up = startTracked(
        ghost,
        [
          { transform: `translate3d(${deltaX.toFixed(2)}px, ${deltaY.toFixed(2)}px, 0) scale(${startScale.toFixed(3)}) rotate(${rotateStart}deg)` },
          { transform: `translate3d(${pX.toFixed(2)}px, ${pY.toFixed(2)}px, 0) scale(${peak}) rotate(${rotateStart * 0.3}deg)` },
        ],
        { duration: liftMs, easing: EASE_OUT, fill: 'forwards' },
      );
      startTracked(ghost, [{ boxShadow: glow(startScale) }, { boxShadow: glow(peak) }], { duration: liftMs, easing: 'ease-out', fill: 'forwards' });
      await wait(ghost, up, liftMs);

      // ---- FASE 2: PUTAR kartu 180° di ruang 3D saat MASIH BESAR ----
      // Bingkai berputar penuh (bukan "dipencet"): punggung mengecil ke tepi
      // lalu hilang di 90° dan muka muncul dari tepi. Ditambah sedikit miring
      // (rotateX) supaya terlihat seperti kartu benar-benar diangkat.
      const spin = startTracked(
        frame,
        [
          { transform: `perspective(${FOV}px) rotateX(0deg) rotateY(0deg)` },
          { transform: `perspective(${FOV}px) rotateX(-12deg) rotateY(110deg)`, offset: 0.55 },
          { transform: `perspective(${FOV}px) rotateX(0deg) rotateY(180deg)` },
        ],
        { duration: flipMs, easing: EASE_QUICK, fill: 'forwards' },
      );
      startTracked(ghost, [
        { transform: `translate3d(${pX.toFixed(2)}px, ${pY.toFixed(2)}px, 0) scale(${peak}) rotate(${rotateStart * 0.3}deg)` },
        { transform: `translate3d(${pX.toFixed(2)}px, ${(pY - 14).toFixed(2)}px, 0) scale(${peak * 1.04}) rotate(${(rotateStart * 0.3) * 0.5}deg)`, offset: 0.55 },
        { transform: `translate3d(${pX.toFixed(2)}px, ${pY.toFixed(2)}px, 0) scale(${peak}) rotate(0deg)` },
      ], { duration: flipMs, easing: EASE_QUICK, fill: 'forwards' });
      await wait(ghost, spin, flipMs + 60);

      // ---- FASE 3: mengecil & jatuh tepat ke tumpukan ----
      const drop = startTracked(
        ghost,
        [
          { transform: `translate3d(${pX.toFixed(2)}px, ${pY.toFixed(2)}px, 0) scale(${peak}) rotate(${rotateStart * 0.3}deg)` },
          { transform: `translate3d(0px, ${arcY.toFixed(2)}px, 0) scale(1.04) rotate(${rotateFinal}deg)`, offset: 0.45 },
          { transform: `translate3d(0px, 0px, 0) scale(1) rotate(${rotateFinal}deg)` },
        ],
        { duration: flyMs, easing: EASE_QUICK, fill: 'forwards' },
      );
      startTracked(ghost, [{ boxShadow: glow(peak) }, { boxShadow: glow(1) }], { duration: flyMs, easing: 'ease-in', fill: 'forwards' });
      await wait(ghost, drop, flyMs);

      onLand?.();
      finish();
      onDone?.();
      return ghost;
    })();
  }

  // ---- Jalur normal: penerbangan lengkung (opsional flip saat mendarat) ----
  // `back` = jangan buka wajah. `flipToFace` = buka wajah (kartu minum).
  const revealFaces = revealFacesEarly;

  return new Promise(resolve => {
    let settled = false;
    let flipTimer = null;
    let landTimer = null;

    const land = () => {
      if (settled) return;
      settled = true;
      clearTimeout(flipTimer);
      clearTimeout(landTimer);
      onLand?.();
      finish();
      onDone?.();
      resolve(ghost);
    };

    const doFlip = () => {
      if (!revealFaces) return;
      startTracked(
        frame,
        [
          { transform: `perspective(${FOV}px) rotateX(0deg) rotateY(0deg)` },
          { transform: `perspective(${FOV}px) rotateX(-10deg) rotateY(100deg)`, offset: 0.5 },
          { transform: `perspective(${FOV}px) rotateX(0deg) rotateY(180deg)` },
        ],
        { duration: Math.round(duration * 0.36), easing: EASE_QUICK, fill: 'forwards' },
      );
    };

    void ghost.offsetWidth;
    requestAnimationFrame(() => {
      const spinMs = Math.round(duration * 1.12);
      const move = startTracked(
        ghost,
        [
          { transform: `translate3d(${deltaX.toFixed(2)}px, ${deltaY.toFixed(2)}px, 0) scale(${startScale.toFixed(3)}) rotate(${rotateStart}deg)` },
          { transform: `translate3d(0px, ${arcY.toFixed(2)}px, 0) scale(1.02) rotate(${rotateFinal}deg)`, offset: 0.7 },
          { transform: `translate3d(0px, 0px, 0) scale(1) rotate(${rotateFinal}deg)` },
        ],
        { duration: spinMs, easing: EASE_OUT, fill: 'forwards' },
      );
      flipTimer = setTimeout(doFlip, Math.round(duration * (flipToFace ? 0.22 : 0.45)));
      landTimer = setTimeout(land, spinMs + 40);
      wait(ghost, move, spinMs).then(() => {});
    });
  });
}

/** Buang kartu: kartu diangkat membesar → FLIP ke muka → jatuh ke tumpukan. */
export function flyDiscard({ fromEl, pileEl, card, onLand, onDone, duration = 640 }) {
  const from = rectOf(fromEl);
  const to = rectOf(pileEl);
  return flyCard({
    from,
    to,
    card,
    zoomFlip: true,
    rotateStart: from && to && from.left < to.left ? -9 : 9,
    rotateFinal: 0,
    duration,
    onLand,
    onDone,
  });
}

/** Kombinasi: kartu terbang bergiliran dari tangan/kipas ke zona meja. */
export async function flyMeld({ fromEls = [], toEl, cards = [], onEachLand, onAllLand, gap = 70 }) {
  const targets = fromEls.length ? fromEls : [null];
  const to = rectOf(toEl);
  await Promise.all(
    cards.map((card, index) =>
      new Promise(resolve => {
        const toRect = to
          ? {
              left: to.left + (index - (cards.length - 1) / 2) * 6,
              top: to.top,
              width: to.width,
              height: to.height,
            }
          : null;
        setTimeout(() => {
          flyCard({
            from: rectOf(targets[index % targets.length]),
            to: toRect,
            card,
            lift: 64,
            rotateStart: -14 + index * 7,
            rotateFinal: -6 + index * 5,
            duration: 420,
            flipToFace: false,
            onLand: () => onEachLand?.(card, index),
            onDone: resolve,
          });
        }, index * gap);
      }),
    ),
  );
  onAllLand?.();
}

/** Minum kartu: tumpukan minum → tangan (punggung → muka saat mendarat). */
export function flyDraw({ fromEl, toEl, card, onLand, onDone }) {
  const from = rectOf(fromEl);
  const to = rectOf(toEl);
  if (!to) {
    onLand?.();
    onDone?.();
    return Promise.resolve(null);
  }
  return flyCard({
    from,
    to,
    card,
    lift: 46,
    rotateStart: -16,
    rotateFinal: 0,
    duration: 520,
    flipToFace: Boolean(card),
    onLand,
    onDone,
  });
}
