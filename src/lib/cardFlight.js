import { getCardAssetPath } from '../utils/cardAssets.js';

/**
 * cardFlight — mesin relay kartu DOM dengan Zero-Gap Physical Handoff.
 *
 * Prinsip fisik: kartu adalah benda padat. TIDAK ADA fade-out/fade-in di awal
 * atau akhir penerbangan; opacity ghost adalah 1 dari frame pertama sampai
 * frame terakhir. Relai-nya:
 *   1. TAKEOFF — pose asal diukur dari elemen kartu asli (rect + matriks
 *      transform), ghost lahir DI ATAS kartu itu dengan ukuran & rotasi
 *      identik, lalu kartu asli keluar dari kipas di commit yang sama
 *      (FLIP merapatkan kartu sisanya).
 *   2. LANDING — pose tujuan diukur dari slot yang SUDAH dipasang
 *      (pre-allocated, tersembunyi) di tumpukan/zona, jadi ghost mendarat
 *      persis di atas kartu aslinya.
 *   3. HANDOFF — `onLand` dipanggil tepat saat animasi selesai
 *      (animation.finished, tanpa jeda); pemanggil me-render kartu asli
 *      secara sinkron (flushSync) dan ghost dihapus di baris berikutnya,
 *      sehingga tidak ada frame kosong dan tidak ada gambar ganda.
 *
 * Semua posisi diukur, tidak ada koordinat tebakan.
 */

const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
const EASE_QUICK = 'cubic-bezier(0.16, 0.88, 0.28, 1)';
// Rasio intrinsik aset /cards/*.svg (viewBox 167 × 242.67)
const ASSET_RATIO = 242.67 / 167;
const LAYER_ID = 'card-flight-layer';

// Pemain yang memilih kurangi gerak tetap mendapat umpan balik mendarat,
// hanya tanpa penerbangan panjang: semua durasi dipatok pendek.
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

/**
 * Ukur pose visual sebuah elemen: titik tengah AABB, ukuran layout, sudut
 * rotasi, dan skala — semuanya dari elemen itu sendiri, sehingga ghost bisa
 * lahir/mendarat 100% identik dengan kartu aslinya.
 *
 * Koreksi FLIP: bila elemen membungkus layer pergeseran `[data-flip]` yang
 * sedang dianimasikan (kipas tangan yang sedang merapat), tengah pose
 * digeser mengikuti posisi VISUAL kartu saat ini, bukan posisi layout-nya.
 */
export function measurePose(elOrSelector) {
  const el = typeof elOrSelector === 'string' ? document.querySelector(elOrSelector) : elOrSelector;
  if (!el || !el.isConnected) return null;
  const rect = el.getBoundingClientRect();
  if (!rect.width && !rect.height) return null;
  const w = el.offsetWidth || rect.width;
  const h = el.offsetHeight || rect.height;
  let angle = 0;
  let scale = 1;
  const matrix = getComputedStyle(el).transform;
  if (matrix && matrix !== 'none') {
    const match = matrix.match(/^matrix\((.+)\)$/);
    if (match) {
      const [a, b] = match[1].split(',').map(value => parseFloat(value));
      if (Number.isFinite(a) && Number.isFinite(b)) {
        angle = Math.atan2(b, a) * (180 / Math.PI);
        scale = Math.hypot(a, b) || 1;
      }
    }
  }
  const pose = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, w, h, angle, scale };
  const flipEl = el.querySelector('[data-flip]');
  if (flipEl) {
    const flipMatrix = getComputedStyle(flipEl).transform;
    const match = flipMatrix && flipMatrix.match(/^matrix\(([^)]+)\)$/);
    if (match) {
      const tx = parseFloat(match[1].split(',')[4]) || 0;
      if (tx) {
        const rad = (angle * Math.PI) / 180;
        // Pergeseran FLIP hidup di ruang lokal elemen yang sudah dirotasi &
        // diskalakan, jadi proyeksikan ke layar dengan matriks yang sama.
        pose.x += Math.cos(rad) * tx * scale;
        pose.y += Math.sin(rad) * tx * scale;
      }
    }
  }
  return pose;
}

function resolvePose(input) {
  if (!input) return null;
  if (input instanceof Element || typeof input === 'string') return measurePose(input);
  return input; // sudah pose { x, y, w, h, angle, scale }
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

// Tunggu satu animasi WAAPI selesai; resolusi tepat di frame terakhir
// (animation.finished) dengan jaring pengaman bila tab dibekukan.
function settle(anim, ms) {
  if (!anim) return new Promise(resolve => { setTimeout(resolve, ms); });
  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    anim.finished.then(finish, finish);
    setTimeout(finish, ms + 400);
  });
}

/**
 * Terbangkan satu kartu sebagai benda padat.
 *   from / to  : elemen | selector | pose { x, y, w, h, angle, scale }
 *   back       : punggung saja (kartu lawan), tanpa flip ke muka
 *   flipToFace : punggung -> muka di sepertiga awal terbang (minum kartu)
 *   zoomFlip   : angkat -> flip 3D di puncak -> jatuh ke slot tujuan (buang)
 *   rotateStart: gaya tambahan sudut awal (untuk lemparan dari pod lawan yang
 *                tidak punya kartu asli untuk diukur)
 *
 * `onLand` WAJIB me-render kartu asli secara sinkron (flushSync); ghost
 * dihapus di baris tepat setelahnya, di frame yang sama.
 */
export function flyCard({
  from, to, card, back = false,
  rotateStart = 0,
  duration = 560,
  onLand, onDone,
  flipToFace = false,
  zoomFlip = false,
  peakScale = 1.6,
}) {
  if (typeof document === 'undefined') { onLand?.(); onDone?.(); return Promise.resolve(null); }
  const layer = ensureFlightLayer();
  const fromPose = resolvePose(from);
  const toPose = resolvePose(to);
  if (!layer || !toPose) { onLand?.(); onDone?.(); return Promise.resolve(null); }
  if (prefersReducedMotion()) { duration = Math.min(160, duration); peakScale = 1; }

  // Kotak ghost = ukuran kartu TUJUAN; pose asal & tujuan murni transform,
  // jadi ukuran kartu tidak pernah berubah selama terbang (benda rigid).
  const w = Math.max(8, Math.round(toPose.w));
  const h = Math.max(8, Math.round(toPose.h > 0 ? toPose.h : w * ASSET_RATIO));
  const src = fromPose || toPose;
  const startAngle = (fromPose ? fromPose.angle : 0) + rotateStart;
  const startScale = fromPose ? Math.max(0.05, (fromPose.w * fromPose.scale) / w) : 1;
  const endAngle = toPose.angle;
  const endScale = toPose.scale || 1;
  const deltaX = src.x - toPose.x;
  const deltaY = src.y - toPose.y;
  const arc = Math.min(40, Math.max(16, Math.abs(deltaY) * 0.12));
  const startPose = `translate3d(${deltaX.toFixed(2)}px, ${deltaY.toFixed(2)}px, 0) rotate(${startAngle.toFixed(2)}deg) scale(${startScale.toFixed(3)})`;
  const endPose = `translate3d(0px, 0px, 0px) rotate(${endAngle.toFixed(2)}deg) scale(${endScale.toFixed(3)})`;

  const ghost = document.createElement('div');
  Object.assign(ghost.style, {
    position: 'absolute',
    left: `${(toPose.x - w / 2).toFixed(2)}px`,
    top: `${(toPose.y - h / 2).toFixed(2)}px`,
    width: `${w}px`,
    height: `${h}px`,
    borderRadius: `${Math.max(4, Math.round(w * 0.075))}px`,
    background: '#fff',
    transformOrigin: 'center center',
    willChange: 'transform',
    transform: startPose,
    contain: 'layout paint',
    zIndex: '10',
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
  // backface-visibility tidak pernah aktif. Perspektif harus berada di
  // transform yang SAMA dengan rotate.
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
  const faceFront = makeFace(getCardAssetPath(card, false), 180, 1, -FACE_Z);

  scene.appendChild(frame);
  frame.appendChild(faceBack);
  frame.appendChild(faceFront);
  ghost.appendChild(scene);
  layer.appendChild(ghost);

  // HANDOFF: onLand me-render kartu asli secara sinkron, ghost dihapus di
  // baris berikutnya (frame yang sama). Tidak ada fade, tidak ada celah.
  const land = () => {
    try { onLand?.(); } finally { ghost.remove(); onDone?.(); }
  };

  const glow = scale => `0 ${Math.round(18 * scale)}px ${Math.round(42 * scale)}px rgba(0,0,0,0.5), 0 ${Math.round(6 * scale)}px ${Math.round(14 * scale)}px rgba(0,0,0,0.3)`;

  if (zoomFlip) {
    // ---- Jalur upacara buang: angkat -> flip 3D -> jatuh ke slot ----
    // Proporsi dibuat tepat 1.0x `duration`: lift 0.30 + flip 0.26 + drop 0.44.
    const liftMs = Math.round(duration * 0.3);
    const flipMs = Math.round(duration * 0.26);
    const flyMs = Math.max(120, duration - liftMs - flipMs);
    const peak = Math.max(1.2, peakScale);
    const liftPx = Math.round(Math.min(120, Math.max(70, h * 0.6)));
    const pX = deltaX * 0.22;
    const pY = deltaY * 0.22 - liftPx;
    const liftAngle = startAngle * 0.3;
    const liftPose = `translate3d(${pX.toFixed(2)}px, ${pY.toFixed(2)}px, 0) rotate(${liftAngle.toFixed(2)}deg) scale(${peak.toFixed(3)})`;

    return (async () => {
      // ---- FASE 1: angkat & membesar (masih punggung) ----
      const up = startTracked(ghost, [{ transform: startPose }, { transform: liftPose }], { duration: liftMs, easing: EASE_OUT, fill: 'forwards' });
      startTracked(ghost, [{ boxShadow: glow(startScale) }, { boxShadow: glow(peak) }], { duration: liftMs, easing: 'ease-out', fill: 'forwards' });
      await settle(up, liftMs);

      // ---- FASE 2: flip 3D di puncak angkat. Posisi ghost disemat di
      //      liftPose sehingga transisi antar fase tanpa lonjakan. ----
      const spin = startTracked(frame, [
        { transform: `perspective(${FOV}px) rotateX(0deg) rotateY(0deg)` },
        { transform: `perspective(${FOV}px) rotateX(-12deg) rotateY(110deg)`, offset: 0.55 },
        { transform: `perspective(${FOV}px) rotateX(0deg) rotateY(180deg)` },
      ], { duration: flipMs, easing: EASE_QUICK, fill: 'forwards' });
      startTracked(ghost, [
        { transform: liftPose },
        { transform: `translate3d(${pX.toFixed(2)}px, ${(pY - 10).toFixed(2)}px, 0) rotate(${liftAngle.toFixed(2)}deg) scale(${(peak * 1.03).toFixed(3)})`, offset: 0.5 },
        { transform: liftPose },
      ], { duration: flipMs, easing: EASE_QUICK, fill: 'forwards' });
      await settle(spin, flipMs);

      // ---- FASE 3: jatuh ke slot tujuan, mendarat persis di atasnya ----
      const midFlyAngle = liftAngle + (endAngle - liftAngle) * 0.5;
      const midFlyScale = peak + (endScale - peak) * 0.55;
      const drop = startTracked(ghost, [
        { transform: liftPose },
        { transform: `translate3d(0px, ${(-arc).toFixed(2)}px, 0) rotate(${midFlyAngle.toFixed(2)}deg) scale(${midFlyScale.toFixed(3)})`, offset: 0.5 },
        { transform: endPose },
      ], { duration: flyMs, easing: EASE_QUICK, fill: 'forwards' });
      startTracked(ghost, [{ boxShadow: glow(peak) }, { boxShadow: glow(endScale) }], { duration: flyMs, easing: 'ease-in', fill: 'forwards' });
      await settle(drop, flyMs);

      land();
      return ghost;
    })();
  }

  // ---- Jalur normal: penerbangan lengkung satu animasi (compositor) ----
  const revealFaces = !back || flipToFace;
  const midX = deltaX * 0.22;
  const midY = deltaY * 0.22 - arc;
  const midAngle = startAngle + (endAngle - startAngle) * 0.55;
  const midScale = startScale + (endScale - startScale) * 0.55;

  return new Promise(resolve => {
    let settled = false;
    let flipTimer = null;
    let safety = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(flipTimer);
      clearTimeout(safety);
      land();
      resolve(ghost);
    };
    // Jaring pengaman: WAAPI tidak boleh menggantung (tab dibekukan).
    safety = setTimeout(finish, duration + 400);
    const doFlip = () => {
      startTracked(frame, [
        { transform: `perspective(${FOV}px) rotateX(0deg) rotateY(0deg)` },
        { transform: `perspective(${FOV}px) rotateX(-10deg) rotateY(100deg)`, offset: 0.5 },
        { transform: `perspective(${FOV}px) rotateX(0deg) rotateY(180deg)` },
      ], { duration: Math.round(duration * 0.36), easing: EASE_QUICK, fill: 'forwards' });
    };
    const move = startTracked(ghost, [
      { transform: startPose },
      { transform: `translate3d(${midX.toFixed(2)}px, ${midY.toFixed(2)}px, 0) rotate(${midAngle.toFixed(2)}deg) scale(${midScale.toFixed(3)})`, offset: 0.62 },
      { transform: endPose },
    ], { duration, easing: EASE_OUT, fill: 'forwards' });
    if (revealFaces) flipTimer = setTimeout(doFlip, Math.round(duration * (flipToFace ? 0.25 : 0.45)));
    // Mendarat tepat saat animasi selesai (0ms), bukan lewat timer.
    if (move && move.finished) move.finished.then(finish, finish);
    else setTimeout(finish, duration);
  });
}

/**
 * Buang kartu: diangkat membesar -> flip ke muka -> jatuh PERSIS ke slot
 * pre-allocated di tumpukan. `from`/`to` pose atau elemen; ukur sebelum
 * state berubah supaya 100% identik.
 */
export function flyDiscard({ from, to, card, duration = 640, onLand, onDone }) {
  return flyCard({ from, to, card, zoomFlip: true, duration, onLand, onDone });
}

/**
 * Kombinasi: kartu terbang bergiliran dari sumbernya masing-masing ke slot
 * placeholder di zona tujuan. `onFlightStart(card)` dipanggil tepat sebelum
 * ghost kartu itu lahir — pemanggil memakainya untuk mengeluarkan kartu dari
 * kipas SATU PER SATU (FLIP), bukan semua sekaligus.
 */
export function flyMeld({ fromEls = [], toEls = [], cards = [], gap = 70, onFlightStart, onEachLand, onAllLand }) {
  if (typeof document === 'undefined') { onAllLand?.(); return Promise.resolve(); }
  const list = cards.length ? cards : [];
  return Promise.all(
    list.map((card, index) => new Promise(resolve => {
      setTimeout(() => {
        onFlightStart?.(card, index);
        flyCard({
          from: fromEls[index % Math.max(1, fromEls.length)] || null,
          to: toEls?.[index] || toEls?.[toEls.length - 1] || null,
          card,
          duration: 440,
          onLand: () => onEachLand?.(card, index),
          onDone: () => resolve(card),
        });
      }, index * gap);
    })),
  ).then(() => { onAllLand?.(); });
}

/**
 * Minum kartu: tumpukan minum -> slot pre-allocated di ujung kipas tangan
 * (punggung -> muka di sepertiga awal bila kartu diketahui).
 *
 * `minSize` ({ w, h }): ukuran kartu tangan aktif. Slot tujuan yang baru
 * dirender bisa terukur lebih kecil dari kartu tangan sebenarnya (gambar
 * belum termuat / terkompresi flexbox) — pose tujuan dipaksa memakai ukuran
 * ini supaya ghost membesar MULUS dari ukuran deck ke ukuran kartu tangan
 * dan tidak "pop" saat handoff.
 */
export function flyDraw({ fromEl, toEl, card, minSize = null, duration = 560, onLand, onDone }) {
  let target = toEl;
  if (minSize && typeof document !== 'undefined') {
    const pose = measurePose(toEl);
    if (pose && (pose.w < minSize.w - 0.5 || pose.h < minSize.h - 0.5)) {
      // Pertahankan pusat slot, ganti dimensi dengan ukuran kartu tangan.
      target = { ...pose, w: minSize.w, h: minSize.h, angle: 0, scale: 1 };
    }
  }
  return flyCard({
    from: fromEl,
    to: target,
    card,
    back: !card,
    flipToFace: Boolean(card),
    duration,
    onLand,
    onDone,
  });
}
