// Efek suara 100% Web Audio API synthesizer — tanpa file eksternal yang bisa gagal load.
let ctx = null;
let muted = false;
try { muted = localStorage.getItem('remi-muted') === '1'; } catch { /* ignore */ }

export const isMuted = () => muted;
export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('remi-muted', muted ? '1' : '0'); } catch { /* ignore */ }
  return muted;
}

function audioContext() {
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function blip({ freq = 440, dur = 0.1, type = 'triangle', vol = 0.16, slideTo = 0, delay = 0 }) {
  const ac = audioContext();
  if (!ac) return;
  const start = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), start + dur);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(vol, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

// Whoosh/snap kartu: derau putih pendek yang difilter menyapu turun.
function cardNoise({ dur = 0.08, vol = 0.14, from = 3200, to = 700, delay = 0 } = {}) {
  const ac = audioContext();
  if (!ac) return;
  const start = ac.currentTime + delay;
  const length = Math.max(1, Math.floor(ac.sampleRate * dur));
  const buffer = ac.createBuffer(1, length, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(from, start);
  filter.frequency.exponentialRampToValueAtTime(Math.max(60, to), start + dur);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(vol, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(filter).connect(gain).connect(ac.destination);
  src.start(start);
}

const library = {
  countdown: () => blip({ freq: 540, dur: 0.11, type: 'square', vol: 0.1 }),
  start: () => { blip({ freq: 660, dur: 0.16, vol: 0.18 }); blip({ freq: 990, dur: 0.3, vol: 0.18, delay: 0.14 }); },
  shuffle: () => { cardNoise({ dur: 0.16, from: 2600, to: 500 }); cardNoise({ dur: 0.14, from: 2200, to: 420, delay: 0.18 }); cardNoise({ dur: 0.12, from: 2400, to: 460, delay: 0.36 }); },
  deal: () => cardNoise({ dur: 0.06, from: 3600, to: 900, vol: 0.1 }),
  draw: () => cardNoise({ dur: 0.1, from: 3000, to: 800 }),
  dig: () => { blip({ freq: 300, slideTo: 640, dur: 0.18, type: 'sawtooth', vol: 0.1 }); cardNoise({ dur: 0.12, delay: 0.05 }); },
  // kombinasi sah: kartu "diklep" lalu arpeggio naik yang berkilau
  meld: () => {
    cardNoise({ dur: 0.07, from: 2600, to: 800, vol: 0.08 });
    [523, 659, 784, 1047].forEach((freq, index) => {
      blip({ freq, dur: 0.13, vol: 0.15, delay: 0.06 + index * 0.085 });
    });
    blip({ freq: 1568, dur: 0.22, type: 'sine', vol: 0.07, delay: 0.42 });
  },
  discard: () => { cardNoise({ dur: 0.07, from: 1800, to: 500 }); blip({ freq: 220, dur: 0.06, vol: 0.08 }); },
  turn: () => blip({ freq: 760, dur: 0.12, vol: 0.12 }),
  warn: () => blip({ freq: 200, dur: 0.22, type: 'square', vol: 0.09 }),
  win: () => { [523, 659, 784, 1047].forEach((freq, index) => blip({ freq, dur: 0.16, vol: 0.16, delay: index * 0.13 })); },
  error: () => blip({ freq: 160, dur: 0.2, type: 'square', vol: 0.08 }),
};

export function play(name) {
  if (muted) return;
  try { library[name]?.(); } catch { /* audio gagal tidak boleh menghentikan game */ }
}
