// Musik latar dangdut koplo tersintesis penuh (Web Audio API) — tanpa file
// audio eksternal. Loop 4 bar: kendang koplo, bas walk, gong, dan melodi
// suling. Semua lewat master gain milik soundFX supaya volume/mute menyatu
// dengan efek suara game.
import { getMusicGain, isMusicEnabled, musicAudioContext } from './soundFX.js';

const BPM = 132;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;

// Progresi dangdut klasik (i - VI - VII - i) dalam D minor.
const CHORDS = [
  [146.83, 174.61, 220.0],   // Dm
  [116.54, 146.83, 174.61],  // Bb
  [130.81, 164.81, 196.0],   // C
  [146.83, 174.61, 220.0],   // Dm
];

// Melodi suling per bar (dalam Hz); null = istirahat.
const MELODY = [
  [293.66, 349.23, 440.0, 392.0, 349.23, null, 293.66, 329.63],
  [233.08, 261.63, 293.66, 349.23, 329.63, 293.66, 261.63, null],
  [261.63, 329.63, 392.0, 349.23, 329.63, null, 261.63, 293.66],
  [293.66, 349.23, 440.0, 466.16, 440.0, 392.0, 349.23, null],
];

let timer = null;
let nextNoteTime = 0;
let step = 0;
let playing = false;

// SATU AudioContext untuk seluruh aplikasi: node musik harus berada di
// context yang sama dengan gain tujuan, kalau tidak connect() melempar
// InvalidAccessError dan seluruh app ikut crash.
function audioContext() {
  return musicAudioContext();
}

// --- instrumen -------------------------------------------------------------

function kendang(ac, time, { vol = 0.5, pitch = 1 } = {}) {
  // "dug": membran rendah dengan pitch drop cepat.
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150 * pitch, time);
  osc.frequency.exponentialRampToValueAtTime(55 * pitch, time + 0.12);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(vol, time + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.2);
  osc.connect(gain).connect(getMusicGain());
  osc.start(time);
  osc.stop(time + 0.25);
}

function tak(ac, time, vol = 0.16) {
  // "tak": ketukan kayu — derau pendek lolos bandpass tinggi.
  const length = Math.max(1, Math.floor(ac.sampleRate * 0.035));
  const buffer = ac.createBuffer(1, length, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2600;
  filter.Q.value = 1.6;
  const gain = ac.createGain();
  gain.gain.value = vol;
  src.connect(filter).connect(gain).connect(getMusicGain());
  src.start(time);
}

function bassNote(ac, time, freq, dur = 0.22, vol = 0.24) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sawtooth';
  osc.frequency.value = freq / 2;
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(520, time);
  filter.frequency.exponentialRampToValueAtTime(180, time + dur);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(vol, time + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  osc.connect(filter).connect(gain).connect(getMusicGain());
  osc.start(time);
  osc.stop(time + dur + 0.05);
}

function suling(ac, time, freq, dur = 0.2, vol = 0.09) {
  // Suling: sine + vibrato ringan, sedikit menyapu masuk.
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const lfo = ac.createOscillator();
  const lfoGain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq * 0.985, time);
  osc.frequency.linearRampToValueAtTime(freq, time + 0.05);
  lfo.frequency.value = 5.2;
  lfoGain.gain.value = freq * 0.012;
  lfo.connect(lfoGain).connect(osc.frequency);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(vol, time + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  osc.connect(gain).connect(getMusicGain());
  osc.start(time);
  lfo.start(time);
  osc.stop(time + dur + 0.05);
  lfo.stop(time + dur + 0.05);
}

function gong(ac, time, vol = 0.2) {
  [110, 165, 220, 277].forEach((freq, index) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(vol / (index + 1), time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 1.1);
    osc.connect(gain).connect(getMusicGain());
    osc.start(time);
    osc.stop(time + 1.2);
  });
}

// --- penjadwal -------------------------------------------------------------

// Satu bar = 8 langkah (setengah ketukan). Pola kendang koplo + bas + melodi.
function scheduleBar(ac, barStart, barIndex) {
  const chord = CHORDS[barIndex % CHORDS.length];
  const melody = MELODY[barIndex % MELODY.length];

  // Kendang: pola koplo (dug di 1 & 3.5, tak di antara).
  const dugSteps = [0, 3, 5, 7];
  dugSteps.forEach((s, i) => kendang(ac, barStart + s * (BEAT / 2), { vol: i === 0 ? 0.5 : 0.34, pitch: i % 2 ? 1.15 : 1 }));
  [1, 2, 4, 6].forEach(s => tak(ac, barStart + s * (BEAT / 2)));

  // Bas: akar chord mengikuti pola langkah kendang.
  [0, 2, 3, 5, 6].forEach((s, i) => bassNote(ac, barStart + s * (BEAT / 2), chord[i % chord.length], BEAT * 0.42));

  // Melodi suling: satu nada per langkah genap.
  melody.forEach((freq, i) => {
    if (freq) suling(ac, barStart + i * (BEAT / 2), freq, BEAT * 0.45);
  });

  // Gong di awal loop (bar ke-4) sebagai penutup frasa.
  if (barIndex % 4 === 3) gong(ac, barStart);
}

function tick() {
  if (!playing) return;
  // Musik latar TIDAK BOLEH menjatuhkan game: error audio apa pun di sini
  // hanya mematikan musiknya sendiri.
  try {
    const ctx = audioContext();
    if (!ctx) return;
    // Jadwalkan sedikit ke depan supaya tidak glitch saat tab sibuk.
    while (nextNoteTime < ctx.currentTime + 0.35) {
      const barIndex = Math.floor(step / 8);
      scheduleBar(ctx, nextNoteTime, barIndex);
      nextNoteTime += BAR;
      step += 8;
    }
  } catch {
    stopMusic();
  }
}

export function isMusicPlaying() {
  return playing;
}

export function startMusic() {
  if (playing) return;
  if (!isMusicEnabled()) return;
  try {
    const ac = audioContext();
    if (!ac) return;
    playing = true;
    step = 0;
    nextNoteTime = ac.currentTime + 0.08;
    tick();
    timer = setInterval(tick, 120);
  } catch {
    stopMusic();
  }
}

export function stopMusic() {
  playing = false;
  if (timer) clearInterval(timer);
  timer = null;
}
