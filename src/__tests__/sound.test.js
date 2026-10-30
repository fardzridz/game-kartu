// Smoke test mesin audio: memastikan setiap efek & loop musik benar-benar
// bisa dijalankan tanpa melempar error. Web Audio API di sini ditiru — yang
// diuji adalah jalur kode (node graph, jadwal, argumen), bukan suaranya.
import { beforeEach, describe, expect, it, vi } from 'vitest';

function param(value = 0, onSet = null) {
  let current = value;
  return {
    get value() { return current; },
    set value(next) {
      current = next;
      if (onSet) onSet(next);
    },
    setValueAtTime: vi.fn(next => {
      current = next;
      if (onSet) onSet(next);
      return undefined;
    }),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  };
}

function node() {
  const created = {
    connect: vi.fn(target => target),
    disconnect: vi.fn(),
  };
  return created;
}

class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.sampleRate = 48000;
    this.state = 'running';
    this.destination = node();
    this.resume = vi.fn(() => Promise.resolve());
    this.frequencies = [];        // semua frekuensi osilator yang dibuat
    this.highpass = [];           // semua frekuensi highpass yang dipasang
    this.gainOps = [];            // urutan operasi gain per node (envelope)
    FakeAudioContext.instances.push(this);
  }

  createGain() {
    const ac = this;
    const gain = param(1);
    // Rekam urutan operasi pada gain, lalu periksa pola envelope-nya.
    // Envelope yang benar: ramp naik ke X, DITAHAN di X (setValueAtTime),
    // baru turun. Envelope lama langsung turun setelah naik.
    const ops = [];
    const ramp = gain.exponentialRampToValueAtTime;
    gain.exponentialRampToValueAtTime = vi.fn((value, when) => {
      ops.push({ op: 'ramp', value });
      return ramp(value, when);
    });
    const setAt = gain.setValueAtTime;
    gain.setValueAtTime = vi.fn((value, when) => {
      ops.push({ op: 'set', value });
      return setAt(value, when);
    });
    ac.gainOps.push(ops);
    return { ...node(), gain };
  }

  createOscillator() {
    const ac = this;
    // Rekam frekuensi baik lewat `.value =` maupun setValueAtTime — bass()
    // memakai assignment langsung, jadi kalau hanya setValueAtTime yang
    // direkam, test frekuensi akan lolos palsu.
    const frequency = param(440, value => ac.frequencies.push(value));
    return {
      ...node(),
      type: 'sine',
      frequency,
      detune: param(0),
      start: vi.fn(),
      stop: vi.fn(),
    };
  }

  createBiquadFilter() {
    const ac = this;
    const filter = { ...node(), type: 'lowpass', Q: param(1) };
    const frequency = param(350, value => {
      if (filter.type === 'highpass') ac.highpass.push(value);
    });
    filter.frequency = frequency;
    return filter;
  }

  createDynamicsCompressor() {
    return {
      ...node(),
      threshold: param(-24), knee: param(30), ratio: param(12),
      attack: param(0.003), release: param(0.25),
    };
  }

  createBuffer(channels, length, rate) {
    const data = new Float32Array(length);
    return { sampleRate: rate, length, getChannelData: () => data };
  }

  createBufferSource() {
    return { ...node(), buffer: null, start: vi.fn(), stop: vi.fn() };
  }

  createWaveShaper() {
    return { ...node(), curve: null, oversample: 'none' };
  }

  createDelay() {
    return { ...node(), delayTime: param(0) };
  }
}

const EFFECTS = [
  'countdown', 'start', 'shuffle', 'deal', 'draw', 'drawSoft', 'spread', 'discard',
  'dig', 'meld', 'turn', 'turnOther', 'warn', 'tick', 'finalTick', 'win', 'roundEnd',
  'lose', 'error', 'click', 'join', 'leave', 'joker',
];

FakeAudioContext.instances = [];

describe('soundFX', () => {
  let soundFX;

  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    window.AudioContext = FakeAudioContext;
    soundFX = await import('../sound/soundFX.js');
  });

  it('memutar semua efek tanpa melempar error', () => {
    EFFECTS.forEach(name => {
      expect(() => soundFX.play(name), name).not.toThrow();
    });
  });

  it('meneruskan argumen urgensi ke tick', () => {
    // Regresi: play(name) dulu hanya menerima satu argumen sehingga
    // play('tick', urgency) membuang level urgensinya.
    expect(() => soundFX.play('tick', 1)).not.toThrow();
    expect(() => soundFX.play('tick', 0.2)).not.toThrow();
  });

  it('volume 0 tetap tersimpan sebagai 0, bukan kembali ke default', () => {
    // Regresi: `Number(raw) || DEFAULT` membuat "0" dianggap kosong.
    soundFX.setVolume(0);
    expect(soundFX.getVolume()).toBe(0);
  });

  it('memigrasikan volume skala lama tanpa melipatgandakan suara', () => {
    // Versi lama memakai master 1.8 sebagai "100%". Nilai itu harus dipetakan
    // ke 1.0, bukan diteruskan apa adanya (yang berarti 1.8x lebih keras).
    localStorage.setItem('remi-volume', '1.8');
    return import('../sound/soundFX.js?migrasi').then(mod => {
      expect(mod.getVolume()).toBeCloseTo(1.0, 5);
    });
  });

  it('membatasi volume ke rentang yang didukung UI', () => {
    soundFX.setVolume(9);
    expect(soundFX.getVolume()).toBe(soundFX.MAX_UI_VOLUME);
    soundFX.setVolume(-3);
    expect(soundFX.getVolume()).toBe(0);
  });

  it('preferensi musik tidak ikut terkunci oleh mute', () => {
    // Regresi: isMusicEnabled() = musicOn && !muted membuat tombol note
    // tidak bisa menyalakan musik saat suara dibisukan.
    soundFX.toggleMute();
    expect(soundFX.isMuted()).toBe(true);
    expect(soundFX.isMusicEnabled()).toBe(true);
    soundFX.toggleMusic();
    expect(soundFX.isMusicEnabled()).toBe(false);
    soundFX.toggleMusic();
    expect(soundFX.isMusicEnabled()).toBe(true);
  });

  it('tidak memaksakan frekuensi di bawah jangkauan speaker HP', () => {
    // Speaker ponsel tidak memutar 60–150 Hz. Nada di wilayah itu tidak
    // menjadi "bass" — hanya distorsi yang memakan headroom. Semua nada SFX
    // harus berada di register yang benar-benar bisa diputar.
    EFFECTS.forEach(name => soundFX.play(name));
    const ac = FakeAudioContext.instances.at(-1);
    const tooLow = ac.frequencies.filter(freq => freq < 150);
    expect(tooLow).toEqual([]);
  });

  it('memasang highpass di jalur SFX sebagai jaring pengaman', () => {
    soundFX.play('discard');
    const ac = FakeAudioContext.instances.at(-1);
    expect(ac.highpass.some(hz => hz >= 100)).toBe(true);
  });

  it('mempertahankan puncak di puncak, bukan langsung meluruh', () => {
    // Regresi: envelope lama meluncur dari puncak ke nol sepanjang durasi.
    // Untuk bunyi 55–90ms itu membuang ~18 dB energi, sehingga gain berapa
    // pun tetap terasa pelan. Harus ada fase tahan (sustain) di puncak:
    // pola operasinya ramp-naik → set(puncak) → ramp-turun.
    //
    // Diuji pada 'turn' yang murni tone(); efek seperti 'draw' juga memakai
    // whoosh yang punya sustain sendiri, jadi bisa lolos palsu.
    soundFX.play('turn');
    const ac = FakeAudioContext.instances.at(-1);
    const hasSustain = ac.gainOps.some(ops => {
      const up = ops.findIndex(o => o.op === 'ramp' && o.value > 0.01);
      if (up < 0) return false;
      const peak = ops[up].value;
      const next = ops[up + 1];
      return next && next.op === 'set' && Math.abs(next.value - peak) < 1e-6;
    });
    expect(hasSustain).toBe(true);
  });
});

describe('musik latar', () => {
  let music;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    localStorage.clear();
    window.AudioContext = FakeAudioContext;
    FakeAudioContext.instances = [];
    music = await import('../sound/music.js');
  });

  it('mulai dan berhenti tanpa melempar error', () => {
    expect(() => music.startMusic()).not.toThrow();
    expect(music.isMusicPlaying()).toBe(true);
    expect(() => vi.advanceTimersByTime(2000)).not.toThrow();
    expect(() => music.stopMusic()).not.toThrow();
    expect(music.isMusicPlaying()).toBe(false);
    vi.useRealTimers();
  });

  it('tidak menjadwalkan ratusan bar setelah tab lama tidur', () => {
    // Regresi: scheduler lama memakai while(nextNoteTime < now + 0.35) tanpa
    // resync. Setelah tab background 5 menit, ia menjadwalkan ribuan nada
    // sekaligus dalam satu tick. Guard harus melompat ke "sekarang".
    music.startMusic();
    vi.advanceTimersByTime(200);
    const ac = FakeAudioContext.instances.at(-1);
    const oscillator = ac.createOscillator.bind(ac);
    let scheduled = 0;
    ac.createOscillator = () => {
      scheduled += 1;
      return oscillator();
    };
    // Tab tidur 5 menit: jam context maju jauh, timer baru bangun sekarang.
    ac.currentTime += 300;
    vi.advanceTimersByTime(100);
    // Satu bar = 16 langkah; tanpa guard ini akan menjadi ratusan nada.
    expect(scheduled).toBeLessThan(80);
    expect(music.isMusicPlaying()).toBe(true);
    music.stopMusic();
    vi.useRealTimers();
  });

  it('startMusic dua kali tidak membuat loop ganda', () => {
    music.startMusic();
    music.startMusic();
    expect(music.isMusicPlaying()).toBe(true);
    music.stopMusic();
    vi.useRealTimers();
  });

  it('menjaga seluruh nada musik di atas jangkauan speaker HP', () => {
    // Versi sebelumnya menaruh bas di A2/F2 (87–110 Hz) lalu menambal dengan
    // saturasi. Di speaker ponsel itu bukan bass — hanya distorsi. Semua nada
    // (bas, akor, cajon, melodi) harus berada di register yang bisa diputar.
    music.startMusic();
    vi.advanceTimersByTime(4000);
    const ac = FakeAudioContext.instances.at(-1);
    const tooLow = ac.frequencies.filter(freq => freq > 0 && freq < 130);
    expect(tooLow).toEqual([]);
    music.stopMusic();
    vi.useRealTimers();
  });

  it('memasang highpass di jalur musik', () => {
    music.startMusic();
    const ac = FakeAudioContext.instances.at(-1);
    expect(ac.highpass.some(hz => hz >= 110)).toBe(true);
    music.stopMusic();
    vi.useRealTimers();
  });
});
