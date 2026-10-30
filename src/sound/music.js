// "Kopi Senja" — iringan tongkrongan akustik yang disintesis penuh lewat Web
// Audio API (tanpa file audio eksternal).
//
// Kenapa bukan dangdut koplo lagi: game ini adalah meja kartu santai bareng
// teman, bukan panggung. Loop ini sengaja dibuat seperti orang ngobrol di
// warung kopi sore: gitar dipetik pelan, cajon ringan, shaker, bas hangat, dan
// mallet yang sesekali menjawab. Tempo 104 BPM, progresi Am–F–C–G.
//
// Catatan teknis:
// - Semua nada masuk ke outGain milik sesi ini, yang tersambung ke bus musik
//   soundFX. Jadi ducking, volume, dan mute global tetap satu jalur.
// - Scheduler memakai lookahead pendek DAN resync: kalau tab sempat tidur
//   (background), nextNoteTime tidak boleh "mengejar" ratusan bar sekaligus.
// - Stop memakai fade-out, bukan potong mendadak.
import { getMusicOutput, musicAudioContext } from './soundFX.js';

const BPM = 104;
const BEAT = 60 / BPM;
const STEP = BEAT / 4;        // satu langkah = 1/16
const LOOKAHEAD = 0.28;       // jadwalkan sedikit ke depan
const TICK_MS = 90;

// Progresi: Am – F – C – G. Semua nada ditaruh di register menengah-tinggi:
// akar bas di 220 Hz ke atas, akor di 260–520 Hz, melodi di 440–800 Hz.
// Speaker ponsel tidak memutar 100 Hz, jadi menaruh bas di sana hanya
// menghasilkan distorsi — bukan suara yang lebih penuh.
const BARS = [
  {
    bass: 220.0,                                  // A3
    chord: [261.63, 329.63, 440.0, 523.25],       // C4 E4 A4 C5
    melody: [[4, 659.25], [8, 587.33], [12, 523.25]],
  },
  {
    bass: 174.61,                                 // F3
    chord: [220.0, 261.63, 349.23, 440.0],        // A3 C4 F4 A4
    melody: [[2, 523.25], [8, 440.0], [12, 523.25]],
  },
  {
    bass: 261.63,                                 // C4
    chord: [261.63, 329.63, 392.0, 523.25],       // C4 E4 G4 C5
    melody: [[4, 659.25], [10, 783.99], [14, 587.33]],
  },
  {
    bass: 196.0,                                  // G3
    chord: [246.94, 293.66, 392.0, 493.88],       // B3 D4 G4 B4
    melody: [[2, 587.33], [8, 493.88], [12, 392.0]],
  },
];

// Pola 16 langkah. Angka = step; nilai = kekuatan pukulan.
const CAJON_LOW = { 0: 0.9, 6: 0.55, 10: 0.7 };
const CAJON_SLAP = { 4: 0.5, 12: 0.62, 15: 0.18 };
const SHAKER = { 0: 0.7, 2: 0.35, 4: 0.55, 6: 0.35, 8: 0.7, 10: 0.35, 12: 0.55, 14: 0.4 };
const GUITAR_STEPS = [0, 2, 4, 6, 8, 10, 12, 14];
const GUITAR_ORDER = [0, 1, 2, 3, 2, 1, 0, 2];
const GUITAR_VELOCITY = [0.85, 0.55, 0.7, 0.5, 0.8, 0.55, 0.72, 0.5];
// Nada bas pengiring per langkah: [langkah, rasio terhadap akar, kekuatan].
// Rasio 1.5 = kwint, selalu nada akor — tidak ada nada luar yang bentrok.
const BASS_STEPS = [[0, 1, 1.6], [6, 1.5, 0.7], [10, 1, 0.85], [14, 1.5, 0.45]];

let session = null;   // { out, delay, timer }
let nextStepTime = 0;
let stepIndex = 0;
let playing = false;

export const MUSIC_TITLE = 'Kopi Senja';
export const isMusicPlaying = () => playing;

// ---------------------------------------------------------------------------
// Instrumen
// ---------------------------------------------------------------------------

// Gitar akustik: sawtooth yang ditutup lowpass + burst derau untuk bunyi pick.
// Lowpass-nya tidak boleh turun terlalu dalam — karakter "akustik" justru ada
// di harmonik atas, dan itulah bagian yang paling jelas di speaker ponsel.
//
// Envelope: petikan nyata tidak meluruh lurus dari puncak. Ada fase tahan
// singkat sebelum senar meredam. Tanpa fase itu, gitar terdengar "plink" tipis
// dan seluruh iringan terasa jauh lebih pelan daripada level aslinya.
function pluck(ac, out, time, freq, { vol = 0.16, dur = 0.9, send = 0.25 } = {}) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const filter = ac.createBiquadFilter();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(freq, time);
  filter.type = 'lowpass';
  filter.Q.value = 0.7;
  filter.frequency.setValueAtTime(Math.max(2600, freq * 8), time);
  filter.frequency.exponentialRampToValueAtTime(Math.max(1100, freq * 2.6), time + dur * 0.6);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(vol, time + 0.006);
  gain.gain.setValueAtTime(vol, time + dur * 0.18);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  osc.connect(filter).connect(gain);
  gain.connect(out);
  if (send) gain.connect(session.delay);
  osc.start(time);
  osc.stop(time + dur + 0.05);

  // Pick: derau 12ms di 3 kHz, pelan tapi penting untuk serangan nada.
  const pick = ac.createBufferSource();
  pick.buffer = getNoise(ac);
  const pf = ac.createBiquadFilter();
  pf.type = 'bandpass';
  pf.frequency.value = 3200;
  pf.Q.value = 1.4;
  const pg = ac.createGain();
  pg.gain.setValueAtTime(vol * 0.7, time);
  pg.gain.exponentialRampToValueAtTime(0.0001, time + 0.012);
  pick.connect(pf).connect(pg).connect(out);
  pick.start(time, Math.random() * 0.5);
  pick.stop(time + 0.02);
}

// Bas hangat. Tanpa saturasi dan tanpa harmonik tambahan: pada register ini
// (G3–C4) nadanya sudah jelas di speaker ponsel, dan menambah harmonisa
// hanya menumpuk low-mid sampai terdengar mumbly. Fase tahan singkat menjaga
// nada bas tetap terdengar sampai ketukan berikutnya.
function bass(ac, out, time, freq, { vol = 0.3, dur = 0.5 } = {}) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(vol, time + 0.018);
  gain.gain.setValueAtTime(vol, time + dur * 0.35);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  osc.connect(gain).connect(out);
  osc.start(time);
  osc.stop(time + dur + 0.05);
}

// Cajon "dug": sinus turun cepat. Titik akhirnya 140 Hz — cukup rendah untuk
// terasa seperti pukulan, tapi masih di atas wilayah yang tidak bisa diputar
// speaker ponsel (yang di bawah ~150 Hz hanya jadi distorsi).
function cajonLow(ac, out, time, level) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(220, time);
  osc.frequency.exponentialRampToValueAtTime(140, time + 0.08);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(0.34 * level, time + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.14);
  osc.connect(gain).connect(out);
  osc.start(time);
  osc.stop(time + 0.18);
}

// Cajon "tak": tepukan kayu di 1.8 kHz.
function cajonSlap(ac, out, time, level) {
  const src = ac.createBufferSource();
  src.buffer = getNoise(ac);
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1800;
  filter.Q.value = 1.1;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.3 * level, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
  src.connect(filter).connect(gain).connect(out);
  src.start(time, Math.random() * 0.5);
  src.stop(time + 0.08);
}

function shaker(ac, out, time, level) {
  const src = ac.createBufferSource();
  src.buffer = getNoise(ac);
  const filter = ac.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 5200;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(0.1 * level, time + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
  src.connect(filter).connect(gain).connect(out);
  src.start(time, Math.random() * 0.5);
  src.stop(time + 0.07);
}

// Mallet (marimba-ish): sine + harmonik 4x yang cepat hilang, plus sedikit
// delay supaya terasa ada ruang. Fase tahan singkat menjaga nadanya tetap
// terdengar, bukan hanya "tuk" di awal.
function mallet(ac, out, time, freq, { vol = 0.14, dur = 0.75 } = {}) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(vol, time + 0.008);
  gain.gain.setValueAtTime(vol, time + dur * 0.12);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  osc.connect(gain);
  gain.connect(out);
  gain.connect(session.delay);

  const ping = ac.createOscillator();
  const pingGain = ac.createGain();
  ping.type = 'sine';
  ping.frequency.value = freq * 4;
  pingGain.gain.setValueAtTime(vol * 0.35, time);
  pingGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.09);
  ping.connect(pingGain).connect(out);

  osc.start(time);
  ping.start(time);
  osc.stop(time + dur + 0.05);
  ping.stop(time + 0.12);
}

// ---------------------------------------------------------------------------
// Utilitas
// ---------------------------------------------------------------------------

let noiseCache = null;
function getNoise(ac) {
  if (noiseCache && noiseCache.sampleRate === ac.sampleRate) return noiseCache;
  const length = Math.floor(ac.sampleRate * 0.5);
  noiseCache = ac.createBuffer(1, length, ac.sampleRate);
  const data = noiseCache.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return noiseCache;
}

// Delay pendek dengan feedback rendah: memberi kesan ruangan tanpa reverb
// berat. Output-nya ikut outGain sesi, jadi ikut fade saat stop.
function makeDelay(ac, out) {
  const delay = ac.createDelay(1);
  delay.delayTime.value = BEAT * 0.75;
  const feedback = ac.createGain();
  feedback.gain.value = 0.22;
  const tone = ac.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 2600;
  const wet = ac.createGain();
  wet.gain.value = 0.3;
  delay.connect(tone).connect(feedback).connect(delay);
  tone.connect(wet).connect(out);
  return delay;
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

function scheduleStep(ac, time, step) {
  const bar = BARS[Math.floor(step / 16) % BARS.length];
  const local = step % 16;

  if (CAJON_LOW[local]) cajonLow(ac, session.out, time, CAJON_LOW[local]);
  if (CAJON_SLAP[local]) cajonSlap(ac, session.out, time, CAJON_SLAP[local]);
  if (SHAKER[local]) shaker(ac, session.out, time, SHAKER[local]);

  const guitarIndex = GUITAR_STEPS.indexOf(local);
  if (guitarIndex >= 0) {
    const note = bar.chord[GUITAR_ORDER[guitarIndex] % bar.chord.length];
    pluck(ac, session.out, time, note, {
      vol: 0.13 * GUITAR_VELOCITY[guitarIndex],
      dur: local === 0 ? 1.1 : 0.8,
      send: 0.2,
    });
  }

  BASS_STEPS.forEach(([at, ratio, velocity]) => {
    if (at !== local) return;
    bass(ac, session.out, time, bar.bass * ratio, { vol: 0.28 * velocity, dur: 0.42 });
  });

  bar.melody.forEach(([at, freq]) => {
    if (at === local) mallet(ac, session.out, time, freq, { vol: 0.13 });
  });
}

function tick() {
  if (!playing || !session) return;
  try {
    const ac = musicAudioContext();
    if (!ac) return;
    const now = ac.currentTime;
    // Tab sempat tidur: jangan jadwalkan ratusan langkah yang sudah lewat.
    // Loncat ke posisi sekarang — lebih baik kehilangan beberapa ketukan
    // daripada membunyikan satu menit musik dalam satu detik.
    if (nextStepTime < now - 0.25) {
      nextStepTime = now + 0.06;
      stepIndex = Math.round(stepIndex / 16) * 16;   // mulai dari awal bar
    }
    while (nextStepTime < now + LOOKAHEAD) {
      scheduleStep(ac, nextStepTime, stepIndex);
      nextStepTime += STEP;
      stepIndex = (stepIndex + 1) % (BARS.length * 16);
    }
  } catch {
    stopMusic();
  }
}

export function startMusic() {
  if (playing) return;
  const ac = musicAudioContext();
  if (!ac) return;
  const out = getMusicOutput();
  if (!out) return;

  playing = true;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(1, ac.currentTime + 0.6);
  gain.connect(out);

  session = { out: gain, delay: null, timer: null };
  session.delay = makeDelay(ac, gain);

  stepIndex = 0;
  nextStepTime = ac.currentTime + 0.12;
  tick();
  session.timer = setInterval(tick, TICK_MS);
}

export function stopMusic() {
  playing = false;
  const current = session;
  session = null;
  if (!current) return;
  if (current.timer) clearInterval(current.timer);
  try {
    const ac = musicAudioContext();
    const t = ac.currentTime;
    current.out.gain.cancelScheduledValues(t);
    current.out.gain.setValueAtTime(Math.max(0.0001, current.out.gain.value), t);
    current.out.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    // Lepas node setelah fade selesai; nada yang masih terjadwal ikut hilang.
    setTimeout(() => {
      try { current.out.disconnect(); } catch { /* sudah lepas */ }
    }, 600);
  } catch { /* context bisa sudah ditutup */ }
}
