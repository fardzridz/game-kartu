/**
 * NUSA STRIKE — Synthesizer Efek Suara (Web Audio API).
 *
 * Menggunakan singleton `audioContext()` dari `src/sound/soundFX.js` agar tidak
 * membuat AudioContext ganda dan menghormati status mute aplikasi (`isMuted()`).
 * Menyediakan bunyi cipratan air (splash), lemparan kail (cast), gigitan palsu
 * (nibble), tarikan strike, bunyi klik reel saat ditarik, peringatan tension,
 * senar putus (snap), dan selebrasi tangkapan (common..mythic).
 */

import { audioContext, isMuted } from '../sound/soundFX.js';

function synthTone({ freq = 440, slideTo = 0, dur = 0.14, type = 'sine', vol = 0.25, delay = 0 } = {}) {
  if (isMuted()) return;
  const ac = audioContext();
  if (!ac) return;
  try {
    const t = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo > 0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + dur);
    }
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.min(0.6, vol), t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  } catch {
    /* abaikan jika Web Audio belum siap */
  }
}

function synthSplash({ dur = 0.28, vol = 0.28, fromFreq = 1800, toFreq = 320, delay = 0 } = {}) {
  if (isMuted()) return;
  const ac = audioContext();
  if (!ac) return;
  try {
    const t = ac.currentTime + delay;
    const length = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buffer = ac.createBuffer(1, length, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (length * 0.45));
    }
    const source = ac.createBufferSource();
    source.buffer = buffer;

    const filter = ac.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.1;
    filter.frequency.setValueAtTime(fromFreq, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(100, toFreq), t + dur);

    const gain = ac.createGain();
    gain.gain.setValueAtTime(Math.min(0.7, vol), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    source.connect(filter).connect(gain).connect(ac.destination);
    source.start(t);
    source.stop(t + dur + 0.02);
  } catch {
    /* abaikan */
  }
}

let lastReelTickAt = 0;

export function playFishingSFX(name, payload = {}) {
  if (isMuted()) return;
  switch (name) {
    case 'cast': {
      // Desir joran melengkung + cipratan kail jatuh ke air
      synthTone({ freq: 340, slideTo: 980, dur: 0.16, type: 'triangle', vol: 0.22 });
      synthSplash({ dur: 0.26, vol: 0.28, fromFreq: 1900, toFreq: 380, delay: 0.16 });
      synthTone({ freq: 520, slideTo: 240, dur: 0.14, type: 'sine', vol: 0.18, delay: 0.18 });
      break;
    }
    case 'nibble': {
      // Pelampung goyang / fake bite
      synthTone({ freq: 580, slideTo: 360, dur: 0.09, type: 'sine', vol: 0.16 });
      synthSplash({ dur: 0.1, vol: 0.12, fromFreq: 1200, toFreq: 500, delay: 0.02 });
      break;
    }
    case 'strike': {
      // Real strike! Bunyi nyaring + cipratan besar
      synthTone({ freq: 520, slideTo: 880, dur: 0.14, type: 'square', vol: 0.26 });
      synthTone({ freq: 880, slideTo: 1320, dur: 0.22, type: 'sawtooth', vol: 0.24, delay: 0.11 });
      synthSplash({ dur: 0.34, vol: 0.35, fromFreq: 2400, toFreq: 280, delay: 0.05 });
      break;
    }
    case 'reelTick': {
      const now = Date.now();
      if (now - lastReelTickAt < 75) return;
      lastReelTickAt = now;
      const tension = Number(payload?.tension) || 0;
      const baseFreq = 680 + tension * 6.5;
      synthTone({
        freq: baseFreq,
        slideTo: baseFreq * 1.12,
        dur: 0.035,
        type: tension > 75 ? 'sawtooth' : 'triangle',
        vol: tension > 75 ? 0.18 : 0.11,
      });
      break;
    }
    case 'snap': {
      // Senar putus!
      synthTone({ freq: 1450, slideTo: 180, dur: 0.32, type: 'sawtooth', vol: 0.32 });
      synthSplash({ dur: 0.2, vol: 0.24, fromFreq: 3200, toFreq: 400 });
      break;
    }
    case 'escape': {
      synthTone({ freq: 440, slideTo: 220, dur: 0.22, type: 'triangle', vol: 0.2 });
      synthTone({ freq: 310, slideTo: 170, dur: 0.26, type: 'triangle', vol: 0.18, delay: 0.18 });
      break;
    }
    case 'catch': {
      const rarity = payload?.rarity || 'common';
      synthSplash({ dur: 0.3, vol: 0.28, fromFreq: 2100, toFreq: 420 });
      const chords = rarity === 'mythic'
        ? [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98]
        : rarity === 'rare'
          ? [523.25, 659.25, 783.99, 1046.5]
          : [440, 554.37, 659.25];
      chords.forEach((f, idx) => {
        synthTone({
          freq: f,
          slideTo: f * 1.02,
          dur: rarity === 'mythic' ? 0.28 : 0.2,
          type: rarity === 'mythic' ? 'sawtooth' : 'triangle',
          vol: rarity === 'mythic' ? 0.26 : 0.22,
          delay: 0.06 + idx * 0.085,
        });
      });
      break;
    }
    case 'buy': {
      synthTone({ freq: 660, slideTo: 990, dur: 0.12, type: 'triangle', vol: 0.22 });
      synthTone({ freq: 990, slideTo: 1320, dur: 0.18, type: 'sine', vol: 0.22, delay: 0.1 });
      break;
    }
    case 'emote': {
      synthTone({ freq: 740, slideTo: 1080, dur: 0.1, type: 'sine', vol: 0.16 });
      break;
    }
    default:
      break;
  }
}
