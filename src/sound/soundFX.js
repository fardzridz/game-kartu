// Efek suara 100% Web Audio API — tanpa file eksternal yang bisa gagal load.
//
// Rantai sinyal:
//
//   voice SFX  → sfxBus ─┐
//                        ├→ master (volume) → limiter → speaker
//   voice musik → musicBus → duck ─┘
//
// Semua angka di file ini adalah PEAK GAIN di dalam rantai, bukan persentase
// UI. Mix sudah dinormalisasi pada master 1.0, jadi limiter di ujung hanya
// jaring pengaman — bukan alat untuk "mengeraskan" suara. Versi lama memakai
// master 1.8 + limiter -6 dB: yang keras mentok 0.5, yang pelan tetap pelan,
// hasilnya semua terdengar kecil dan saling menutupi.
//
// Catatan speaker HP: driver ponsel praktis mati di bawah ~400 Hz. Setiap
// bunyi rendah di sini karena itu SELALU punya dua lapis tambahan —
// harmonik (2x/3x) dan transient 2–3 kHz — supaya tetap terbaca di HP.

const DEFAULT_VOLUME = 1.0;   // master 1.0 = mix acuan
const MAX_VOLUME = 2.0;       // batas slider UI (200%)

// Gain staging. Master sengaja 1.0 supaya slider 100% berarti "sesuai mix".
// Kekerasan datang dari bus masing-masing, bukan dari mendorong master melewati
// 1.0 lalu berharap limiter mengangkatnya — limiter hanya memotong puncak,
// tidak pernah menambah level.
//
// SFX_BUS_LEVEL dinaikkan setelah envelope diperbaiki: sebelumnya gain dinaikkan
// terus tanpa hasil karena energi habis di bentuk envelope, bukan di level.
const SFX_BUS_LEVEL = 1.3;
// Musik dibuat lebih pelan dari SFX (rasio ini yang menentukan seberapa "di
// belakang" iringan berada), tapi tidak boleh ikut turun saat master turun.
const MUSIC_LEVEL = 0.5;

let ctx = null;
let master = null;
let sfxBus = null;
let musicBus = null;
let duck = null;
let volume = DEFAULT_VOLUME;
let muted = false;
let musicOn = true;
let noiseBuffer = null;
let unlocked = false;

// Skala volume berubah: dulu master 1.8 = "100%", sekarang 1.0 = mix acuan.
// Nilai tersimpan dari versi lama dipetakan ulang sekali supaya pemain yang
// sudah menggeser slider tidak tiba-tiba mendapat suara 3x lebih keras.
const VOLUME_KEY = 'remi-volume-v2';
const LEGACY_VOLUME_KEY = 'remi-volume';
const LEGACY_REFERENCE = 1.8;

try {
  const raw = localStorage.getItem(VOLUME_KEY);
  if (raw !== null) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) volume = Math.min(MAX_VOLUME, Math.max(0, parsed));
  } else {
    const legacy = localStorage.getItem(LEGACY_VOLUME_KEY);
    if (legacy !== null) {
      const parsed = Number(legacy);
      if (Number.isFinite(parsed) && parsed > 0) {
        volume = Math.min(MAX_VOLUME, Math.max(0, parsed / LEGACY_REFERENCE));
        localStorage.setItem(VOLUME_KEY, String(volume));
      }
    }
  }
} catch { /* localStorage bisa diblokir */ }
try { muted = localStorage.getItem('remi-muted') === '1'; } catch { /* ignore */ }
// Musik punya saklar sendiri, terpisah dari mute efek suara.
try { musicOn = localStorage.getItem('remi-music') !== '0'; } catch { /* ignore */ }

export const isMuted = () => muted;
// Preferensi musik TIDAK dipengaruhi mute global — kalau ikut, tombol note
// tidak bisa menyalakan musik saat suara sedang dibisukan.
export const isMusicEnabled = () => musicOn;
export const getVolume = () => volume;
export const MAX_UI_VOLUME = MAX_VOLUME;

export function setVolume(next) {
  const value = Number(next);
  volume = Number.isFinite(value) ? Math.min(MAX_VOLUME, Math.max(0, value)) : DEFAULT_VOLUME;
  try { localStorage.setItem(VOLUME_KEY, String(volume)); } catch { /* ignore */ }
  if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.02);
  return volume;
}

export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('remi-muted', muted ? '1' : '0'); } catch { /* ignore */ }
  // Mute = master gain 0, bukan menghentikan musik. Scheduler tetap jalan
  // sehingga menyalakan suara lagi tidak memotong iringan di tengah bar.
  if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.03);
  return muted;
}

export function toggleMusic() {
  musicOn = !musicOn;
  try { localStorage.setItem('remi-music', musicOn ? '1' : '0'); } catch { /* ignore */ }
  return musicOn;
}

// ---------------------------------------------------------------------------
// Rantai audio
// ---------------------------------------------------------------------------

// iOS/Safari membuat AudioContext dalam keadaan suspended kalau tidak dibuat
// di dalam gesture. Satu listener global membangunkan context pada interaksi
// pertama, sehingga musik yang dijadwalkan dari useEffect tetap terdengar.
function bindUnlock() {
  if (unlocked || typeof document === 'undefined') return;
  unlocked = true;
  const wake = () => {
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  };
  ['pointerdown', 'touchstart', 'keydown'].forEach(event => {
    document.addEventListener(event, wake, { passive: true });
  });
}

// Batas bawah yang boleh sampai ke speaker. Driver ponsel tidak memutar
// 60–150 Hz; energi di sana tidak terdengar sebagai bass, hanya memakan
// headroom lalu keluar sebagai distorsi. Kedua bus karena itu diberi highpass
// sebagai jaring pengaman — bukan sebagai pembentuk suara. Nada-nadanya sendiri
// sudah ditaruh di register yang bisa diputar HP.
const SFX_HIGHPASS_HZ = 110;
const MUSIC_HIGHPASS_HZ = 130;

function audioContext() {
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;

    // Limiter hanya menahan puncak sesekali; ambang tinggi supaya dinamika
    // antar efek tidak diratakan.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1.5;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.1;
    master.connect(limiter).connect(ctx.destination);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = SFX_BUS_LEVEL;
    const sfxHighpass = ctx.createBiquadFilter();
    sfxHighpass.type = 'highpass';
    sfxHighpass.frequency.value = SFX_HIGHPASS_HZ;
    sfxHighpass.Q.value = 0.7;
    sfxBus.connect(sfxHighpass).connect(master);

    // Jalur musik: bus → highpass → duck → master. Duck menurunkan musik
    // sesaat setiap ada SFX, jadi efek kartu tidak tenggelam di balik iringan.
    musicBus = ctx.createGain();
    musicBus.gain.value = MUSIC_LEVEL;
    const musicHighpass = ctx.createBiquadFilter();
    musicHighpass.type = 'highpass';
    musicHighpass.frequency.value = MUSIC_HIGHPASS_HZ;
    musicHighpass.Q.value = 0.7;
    duck = ctx.createGain();
    duck.gain.value = 1;
    musicBus.connect(musicHighpass).connect(duck).connect(master);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  bindUnlock();
  return ctx;
}

export function getMusicOutput() {
  audioContext();
  return musicBus;
}

export const musicAudioContext = audioContext;

// Turunkan musik sesaat supaya SFX menonjol, lalu naik lagi pelan. Ducking
// sengaja tidak terlalu dalam: SFX sudah dinaikkan lewat bus, jadi musik tidak
// perlu "dibungkam" — cukup minggir sedikit. Duck berlebihan justru membuat
// iringan terasa bolong-bolong setiap kali kartu dibuang.
function duckMusic(strength = 0.35, hold = 0.08) {
  if (!duck || !ctx) return;
  const t = ctx.currentTime;
  const target = Math.max(0.15, 1 - strength);
  duck.gain.cancelScheduledValues(t);
  duck.gain.setValueAtTime(duck.gain.value, t);
  duck.gain.linearRampToValueAtTime(target, t + 0.02);
  duck.gain.setTargetAtTime(1, t + hold, 0.12);
}

// ---------------------------------------------------------------------------
// Bahan dasar
// ---------------------------------------------------------------------------

function getNoise(ac) {
  if (noiseBuffer && noiseBuffer.sampleRate === ac.sampleRate) return noiseBuffer;
  const length = Math.floor(ac.sampleRate);
  noiseBuffer = ac.createBuffer(1, length, ac.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return noiseBuffer;
}

// Nada tunggal dengan envelope attack–sustain–release.
//
// Kenapa bukan decay eksponensial penuh seperti versi lama: bunyi kartu hanya
// 55–90ms. Kalau gain langsung meluncur dari puncak ke nol sepanjang durasi
// itu, energi rata-ratanya jatuh ~18 dB di bawah puncak — telinga nyaris tidak
// menangkap apa pun, dan berapa pun gain-nya dinaikkan hasilnya tetap terasa
// pelan. Dengan menahan puncak selama ~45% durasi, energi yang terdengar naik
// sekitar 12 dB tanpa menaikkan puncak sama sekali.
function tone({
  freq = 440, dur = 0.12, type = 'triangle', vol = 0.3, slideTo = 0,
  delay = 0, harm = 0, attack = 0.004, bus = null, detune = 0, sustain = 0.45,
}) {
  const ac = audioContext();
  if (!ac) return;
  const t = ac.currentTime + delay;
  const out = bus || sfxBus;
  const level = Math.min(1, vol);
  const hold = t + Math.max(attack * 1.5, dur * sustain);

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(level, t + attack);
  gain.gain.setValueAtTime(level, hold);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  const voices = [{ ratio: 1, level: 1 }];
  if (harm) voices.push({ ratio: 2, level: harm });

  voices.forEach(({ ratio, level: mixLevel }) => {
    const osc = ac.createOscillator();
    osc.type = type;
    if (detune) osc.detune.value = detune;
    const f = freq * ratio;
    osc.frequency.setValueAtTime(f, t);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(60, slideTo * ratio), t + dur);
    }
    const mix = ac.createGain();
    mix.gain.value = mixLevel;
    osc.connect(mix).connect(gain);
    osc.start(t);
    osc.stop(t + dur + 0.06);
  });

  gain.connect(out);
}

// Ketukan body: nada pendek di register MENENGAH, bukan sub-bass.
//
// Speaker ponsel praktis tidak memutar 60–150 Hz. Memaksakan energi di sana
// tidak membuat bass "terdengar" — driver hanya berhenti mengikuti sinyal dan
// keluar sebagai distorsi: suara jadi mumbly, dan headroom habis untuk bunyi
// yang toh tidak sampai ke telinga. Karena itu body efek ditaruh di 200–400 Hz
// (masih jelas di HP maupun laptop) dan dipertegas klik tinggi.
function tock({ freq = 300, to = 210, dur = 0.12, vol = 0.35, delay = 0, click = 0.3 } = {}) {
  tone({ freq, slideTo: to, dur, type: 'triangle', vol, delay, attack: 0.004 });
  if (click > 0) clickLayer({ delay, vol: vol * click, freq: 3200, dur: 0.01 });
}

// Derau bandpass punya puncak jauh lebih rendah daripada osilator pada angka
// gain yang sama: derau putih ±1 setelah bandpass Q≈1 di 2 kHz puncaknya
// tinggal sekitar separuh. Tanpa kompensasi, whoosh kartu nominal 0.3 hanya
// keluar ~0.1 — inilah sebab efek kartu terasa jauh lebih pelan daripada
// tick timer yang memakai osilator. Faktor ini menyamakan persepsi keduanya.
const NOISE_GAIN = 2;

// Klik transient tinggi: komponen yang paling jelas di speaker ponsel.
// Envelope-nya sengaja dibuat pendek dan langsung jatuh — klik memang harus
// tajam, bukan ditekan.
function clickLayer({ delay = 0, vol = 0.2, freq = 2800, dur = 0.014 } = {}) {
  const ac = audioContext();
  if (!ac) return;
  const t = ac.currentTime + delay;
  const src = ac.createBufferSource();
  src.buffer = getNoise(ac);
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = 1.1;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(Math.min(1, vol * NOISE_GAIN), t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(gain).connect(sfxBus);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

// Whoosh kartu: derau yang disapu turun, plus klik di depan supaya bunyinya
// "kertas" dan bukan cuma desis. Envelope-nya ditahan di puncak sebentar
// (sustain) sebelum dilepas — tanpa itu, whoosh 55ms kehilangan hampir semua
// energinya dan terdengar seperti bunyi yang "hilang".
function whoosh({
  dur = 0.09, vol = 0.3, from = 3200, to = 700, delay = 0, q = 0.9, click = 0.5,
} = {}) {
  const ac = audioContext();
  if (!ac) return;
  const t = ac.currentTime + delay;
  const level = Math.min(1, vol * NOISE_GAIN);
  const hold = t + Math.max(0.012, dur * 0.4);
  const src = ac.createBufferSource();
  src.buffer = getNoise(ac);
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(80, to), t + dur);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(level, t + 0.008);
  gain.gain.setValueAtTime(level, hold);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(gain).connect(sfxBus);
  src.start(t, Math.random() * 0.4);
  src.stop(t + dur + 0.02);
  if (click > 0) clickLayer({ delay, vol: vol * click, freq: Math.min(4200, from * 0.9), dur: 0.012 });
}

// ---------------------------------------------------------------------------
// Pustaka efek
// ---------------------------------------------------------------------------

const library = {
  // --- upacara pembuka ---
  countdown: () => {
    tone({ freq: 560, dur: 0.1, type: 'square', vol: 0.2 });
    clickLayer({ vol: 0.12, freq: 2600 });
  },
  start: () => {
    tone({ freq: 660, dur: 0.16, vol: 0.3, harm: 0.25 });
    tone({ freq: 990, dur: 0.34, vol: 0.3, delay: 0.13, harm: 0.2 });
    tock({ freq: 300, to: 240, dur: 0.18, vol: 0.24, delay: 0.13, click: 0.4 });
  },
  shuffle: () => {
    whoosh({ dur: 0.14, from: 2800, to: 900, vol: 0.3, delay: 0 });
    whoosh({ dur: 0.13, from: 2400, to: 800, vol: 0.28, delay: 0.16 });
    whoosh({ dur: 0.12, from: 2600, to: 850, vol: 0.26, delay: 0.32 });
  },

  // --- kartu ---
  // Kartu adalah kertas, bukan benda berat: seluruh bunyinya hidup di
  // 1–4 kHz. Tidak ada komponen rendah sama sekali.
  deal: () => whoosh({ dur: 0.055, from: 3800, to: 1800, vol: 0.3, q: 1.2, click: 0.8 }),
  draw: () => {
    whoosh({ dur: 0.1, from: 3400, to: 1300, vol: 0.38, click: 0.7 });
    clickLayer({ delay: 0.02, vol: 0.16, freq: 3600 });
  },
  drawSoft: () => whoosh({ dur: 0.09, from: 2600, to: 1000, vol: 0.17, click: 0.5 }),
  spread: () => whoosh({ dur: 0.18, from: 2800, to: 900, vol: 0.36, q: 0.7, click: 0.35 }),
  discard: () => {
    whoosh({ dur: 0.07, from: 2200, to: 850, vol: 0.38, click: 0.7 });
    tock({ freq: 340, to: 260, dur: 0.1, vol: 0.2, click: 0.5 });
  },
  dig: () => {
    tone({ freq: 380, slideTo: 760, dur: 0.15, type: 'sawtooth', vol: 0.22, harm: 0.15 });
    whoosh({ dur: 0.12, delay: 0.04, vol: 0.26, click: 0.45 });
  },

  // --- kombinasi ---
  meld: () => {
    whoosh({ dur: 0.06, from: 3000, to: 1400, vol: 0.3, click: 0.8 });
    [523, 659, 784, 1047].forEach((freq, index) => {
      tone({ freq, dur: 0.15, vol: 0.26, delay: 0.05 + index * 0.075, harm: 0.22 });
    });
    tone({ freq: 1568, dur: 0.24, type: 'sine', vol: 0.13, delay: 0.38 });
  },

  // --- giliran ---
  turn: () => {
    tone({ freq: 620, dur: 0.09, vol: 0.26, harm: 0.25 });
    tone({ freq: 930, dur: 0.13, vol: 0.22, delay: 0.07, harm: 0.25 });
  },
  turnOther: () => {
    tone({ freq: 520, dur: 0.1, type: 'sine', vol: 0.15, harm: 0.15 });
    clickLayer({ vol: 0.08, freq: 2400 });
  },

  // --- peringatan ---
  warn: () => {
    tone({ freq: 440, dur: 0.12, type: 'square', vol: 0.22, harm: 0.15 });
    tone({ freq: 330, dur: 0.16, type: 'square', vol: 0.22, delay: 0.11, harm: 0.15 });
  },
  // Detak waktu: makin mendesak makin tinggi DAN makin keras. Level dihitung
  // dari sisa detik, jadi bunyi ini memang harus menerima argumen.
  tick: (urgency = 0.3) => {
    const level = Math.max(0, Math.min(1, Number(urgency) || 0));
    const freq = 720 + level * 700;
    tone({ freq, dur: 0.08, type: 'square', vol: 0.24 + level * 0.18, harm: 0.2 });
    clickLayer({ vol: 0.14 + level * 0.1, freq: 3400 });
  },
  finalTick: () => {
    tone({ freq: 1600, dur: 0.09, type: 'square', vol: 0.38, harm: 0.15 });
    tone({ freq: 2300, dur: 0.07, type: 'sine', vol: 0.24, delay: 0.01 });
    clickLayer({ vol: 0.24, freq: 3000, dur: 0.02 });
  },

  // --- hasil ronde ---
  win: () => {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((freq, index) => {
      tone({ freq, dur: 0.2, vol: 0.3, delay: index * 0.11, harm: 0.25 });
    });
    tone({ freq: 2093, dur: 0.5, type: 'sine', vol: 0.14, delay: 0.55 });
    tock({ freq: 320, to: 260, dur: 0.3, vol: 0.22, delay: 0.55, click: 0.4 });
  },
  roundEnd: () => {
    [523.25, 659.25, 587.33].forEach((freq, index) => {
      tone({ freq, dur: 0.18, vol: 0.24, delay: index * 0.12, harm: 0.2 });
    });
  },
  lose: () => {
    [392, 349.23, 293.66].forEach((freq, index) => {
      tone({ freq, dur: 0.2, type: 'triangle', vol: 0.22, delay: index * 0.13, harm: 0.15 });
    });
  },

  // --- UI & status ---
  error: () => {
    tone({ freq: 320, dur: 0.12, type: 'square', vol: 0.24, harm: 0.2 });
    tone({ freq: 240, dur: 0.16, type: 'square', vol: 0.24, delay: 0.11, harm: 0.2 });
  },
  click: () => {
    clickLayer({ vol: 0.12, freq: 2800 });
    tone({ freq: 900, dur: 0.04, type: 'sine', vol: 0.08 });
  },
  join: () => {
    tone({ freq: 587.33, dur: 0.1, vol: 0.2, harm: 0.2 });
    tone({ freq: 880, dur: 0.16, vol: 0.2, delay: 0.08, harm: 0.2 });
  },
  leave: () => {
    tone({ freq: 587.33, dur: 0.1, vol: 0.18, harm: 0.2 });
    tone({ freq: 392, dur: 0.16, vol: 0.18, delay: 0.08, harm: 0.2 });
  },

  // JOKER DIBUANG: stinger turun tajam + hentakan + sisa getar. "Hentakan"
  // di sini adalah tock 200–300 Hz, bukan sub-bass: yang penting adalah
  // kesan berat, dan kesan itu datang dari transient + durasi, bukan dari
  // frekuensi yang tidak bisa diputar speaker HP.
  //
  // Level komponennya sengaja lebih rendah dari efek lain: enam lapis bunyi
  // yang bertumpuk mudah menembus limiter, dan begitu kena limiter semua
  // dinamikanya hilang — hasilnya justru terdengar lebih pelan, bukan lebih
  // dramatis. Puncak gabungannya dijaga di sekitar 1.0.
  joker: () => {
    tone({ freq: 1500, slideTo: 300, dur: 0.45, type: 'sawtooth', vol: 0.26, harm: 0.2 });
    tone({ freq: 900, slideTo: 220, dur: 0.42, type: 'square', vol: 0.18, delay: 0.04 });
    whoosh({ dur: 0.2, from: 5200, to: 600, vol: 0.24, click: 0.6 });
    tock({ freq: 280, to: 200, dur: 0.3, vol: 0.22, delay: 0.04, click: 0.6 });
    [0.32, 0.42, 0.52].forEach((delay, index) => {
      tock({ freq: 300 - index * 20, to: 240, dur: 0.13, vol: 0.18 - index * 0.04, delay, click: 0.4 });
    });
  },
};

// `play(name, ...args)` meneruskan argumen ke efek. Sebelumnya fungsi ini
// hanya menerima nama, jadi play('tick', urgency) membuang level urgensinya.
export function play(name, ...args) {
  if (muted) return;
  const effect = library[name];
  if (!effect) return;
  try {
    effect(...args);
    // Tick berbunyi tiap detik; kalau musik ikut di-duck tiap kali, hasilnya
    // pompa yang mengganggu. Duck hanya untuk efek sekali jalan.
    if (name !== 'tick') duckMusic(name === 'finalTick' ? 0.3 : 0.35);
  } catch { /* audio gagal tidak boleh menghentikan game */ }
}
