/**
 * Kunci regresi: jalur suara pemain (PTT & klip reaksi) TIDAK BOLEH melewati
 * node `duck`.
 *
 * Bug yang dikunci di sini: dulu rantainya `pttBus → duck → master`. Karena
 * `duckForVoice()` menurunkan gain `duck` ke 0.28 justru SAAT voice berbunyi,
 * suara pemain ikut tertahan 0,28× (≈ −11 dB). Akibatnya rekaman teman
 * terdengar kecil di HP pendengar padahal puncaknya sudah dinormalisasi ke 0.9.
 *
 * Yang diuji adalah BENTUK GRAF, bukan suaranya (jsdom tidak punya Web Audio).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Parameter AudioParam tiruan yang mencatat pemanggilan penjadwalan. */
function param(value = 0) {
  let current = value;
  const self = {
    cancelCalls: 0,
    ramps: [],
    targets: [],
    get value() { return current; },
    set value(next) { current = next; },
    setValueAtTime(next) { current = next; return undefined; },
    linearRampToValueAtTime(next) { self.ramps.push(next); return undefined; },
    exponentialRampToValueAtTime() { return undefined; },
    setTargetAtTime(next) { self.targets.push(next); return undefined; },
    cancelScheduledValues() { self.cancelCalls += 1; return undefined; },
  };
  return self;
}

/**
 * AudioContext tiruan yang merekam setiap `connect()` sebagai sisi graf.
 * Dari situ kita bisa menelusuri jalur sinyal seperti yang benar-benar
 * dilakukan browser.
 */
class GraphAudioContext {
  constructor() {
    this.currentTime = 0;
    this.sampleRate = 48000;
    this.state = 'running';
    this.edges = [];
    this.nodes = [];
    this.destination = this.makeNode('destination');
    this.resume = () => Promise.resolve();
    GraphAudioContext.instances.push(this);
  }

  makeNode(kind, extra = {}) {
    const node = { kind, ...extra };
    node.connect = vi.fn(target => {
      this.edges.push([node, target]);
      return target;
    });
    node.disconnect = vi.fn();
    this.nodes.push(node);
    return node;
  }

  createGain() { return this.makeNode('gain', { gain: param(1) }); }

  createBiquadFilter() {
    return this.makeNode('filter', { type: 'lowpass', Q: param(1), frequency: param(350) });
  }

  createDynamicsCompressor() {
    return this.makeNode('compressor', {
      threshold: param(-24), knee: param(30), ratio: param(12),
      attack: param(0.003), release: param(0.25),
    });
  }

  createBufferSource() {
    return this.makeNode('source', { buffer: null, start: vi.fn(), stop: vi.fn() });
  }

  createBuffer(channels, length, rate) {
    const data = new Float32Array(length);
    return { sampleRate: rate, length, numberOfChannels: channels, getChannelData: () => data };
  }

  /** Semua node yang bisa dicapai dari `start` (BFS mengikuti `connect`). */
  reachableFrom(start) {
    const seen = new Set();
    const queue = [start];
    while (queue.length) {
      const node = queue.shift();
      if (!node || seen.has(node)) continue;
      seen.add(node);
      this.edges.filter(([from]) => from === node).forEach(([, to]) => queue.push(to));
    }
    return seen;
  }
}

GraphAudioContext.instances = [];

/** Impor ulang modul dengan AudioContext tiruan yang segar (singleton ctx). */
async function freshSoundFX() {
  vi.resetModules();
  GraphAudioContext.instances = [];
  window.AudioContext = GraphAudioContext;
  window.webkitAudioContext = undefined;
  return import('../sound/soundFX.js');
}

describe('jalur suara pemain tidak boleh lewat duck', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('pttBus tidak tersambung ke node duck', async () => {
    const fx = await freshSoundFX();
    const pttBus = fx.getPTTOutput();
    expect(pttBus).toBeTruthy();

    // Ducking dijalankan persis seperti saat voice berbunyi. Node yang
    // gain-nya dijadwalkan ulang oleh fungsi ini adalah node `duck`.
    fx.duckForVoice();
    const ac = GraphAudioContext.instances[0];
    const duck = ac.nodes.find(node => node.gain && node.gain.cancelCalls > 0);
    expect(duck, 'node duck harus ada di jalur musik').toBeTruthy();

    const path = ac.reachableFrom(pttBus);
    expect(path.has(duck)).toBe(false);
    // Dan suara tetap harus sampai ke speaker.
    expect(path.has(ac.destination)).toBe(true);
  });

  it('tidak ada node yang mengecilkan suara di jalur ptt (semua gain ≥ 1)', async () => {
    const fx = await freshSoundFX();
    const pttBus = fx.getPTTOutput();
    const ac = GraphAudioContext.instances[0];
    const path = ac.reachableFrom(pttBus);
    const gains = [...path].filter(node => node.kind === 'gain').map(node => node.gain.value);
    expect(gains.length).toBeGreaterThan(0);
    expect(gains.every(value => value >= 1)).toBe(true);
  });

  it('jalur ptt melewati kompresor suara dan penguatan penyeimbang', async () => {
    const fx = await freshSoundFX();
    const pttBus = fx.getPTTOutput();
    const ac = GraphAudioContext.instances[0];
    const path = [...ac.reachableFrom(pttBus)];

    expect(path.some(node => node.kind === 'compressor')).toBe(true);
    // Makeup gain dipasang setelah kompresor: tanpanya puncak yang dipangkas
    // kompresor membuat voice justru lebih pelan dari sebelumnya.
    const makeup = path.find(node => node.kind === 'gain' && node.gain.value > 1.4);
    expect(makeup, 'butuh makeup gain > 1.4 di jalur ptt').toBeTruthy();
  });

  it('musik tetap di-duck saat voice berbunyi', async () => {
    const fx = await freshSoundFX();
    fx.getPTTOutput();
    const ac = GraphAudioContext.instances[0];

    fx.duckForVoice();
    // Node duck = satu-satunya node yang gain-nya dijadwalkan ulang.
    const duck = ac.nodes.find(node => node.gain && node.gain.cancelCalls > 0);
    expect(duck).toBeTruthy();
    // duckForVoice() menurunkan musik ke 0.28 — perilaku ini TIDAK boleh hilang
    // saat jalur voice dipisahkan dari node duck.
    expect(duck.gain.ramps.some(value => value < 0.5)).toBe(true);

    fx.unduckVoice();
    expect(duck.gain.targets.some(value => value >= 1)).toBe(true);
  });
});
