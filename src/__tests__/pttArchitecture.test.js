import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts) => readFileSync(join(process.cwd(), 'src', ...parts), 'utf8');

// Test ini menjaga keputusan arsitektur PTT yang MAHAL kalau diubah belakangan.
// Semuanya statis (baca file) karena pelanggarannya tidak akan terlihat dari
// perilaku runtime — justru itu sebabnya perlu dikunci di sini.

describe('PTT — keputusan arsitektur', () => {
  it('di-mount di App.jsx, bukan di RoomLobby atau GameBoard', () => {
    const app = read('App.jsx');
    expect(app).toContain("from './components/PTTDock.jsx'");
    expect(app).toContain('<PTTDock');

    // Halaman TIDAK boleh merender PTTDock sendiri: kalau di dalam salah satu
    // halaman, MediaRecorder mati saat pindah layar.
    expect(read('components', 'RoomLobby.jsx')).not.toContain('PTTDock');
    expect(read('components', 'GameBoard.jsx')).not.toContain('PTTDock');
  });

  it('memakai portal ke slot yang disediakan tiap halaman', () => {
    expect(read('App.jsx')).toContain("portalId={inGame ? 'ptt-game-slot' : 'ptt-dock-slot'}");
    expect(read('components', 'GameBoard.jsx')).toContain('id="ptt-game-slot"');
    expect(read('components', 'RoomLobby.jsx')).toContain('id="ptt-dock-slot"');
    expect(read('components', 'PTTDock.jsx')).toContain('createPortal');
  });

  it('tidak membuat AudioContext baru di luar soundFX.js', () => {
    const files = [
      read('hooks', 'usePTT.js'),
      read('components', 'PTTDock.jsx'),
      read('components', 'PTTButton.jsx'),
      read('components', 'PTTIndicator.jsx'),
      read('services', 'pttTransport.js'),
      read('services', 'pttService.js'),
    ];
    for (const source of files) {
      expect(source).not.toContain('new AudioContext');
      expect(source).not.toContain('new window.AudioContext');
      expect(source).not.toContain('webkitAudioContext');
    }
    // Hook memakai singleton yang sudah ada.
    expect(read('hooks', 'usePTT.js')).toContain("from '../sound/soundFX.js'");
  });

  it('memutar audio lewat Web Audio API, bukan elemen <audio src>', () => {
    const hook = read('hooks', 'usePTT.js');
    expect(hook).toContain('decodeAudioData');
    expect(hook).toContain('playVoiceBuffer');
    expect(hook).not.toContain('new Audio(');
    expect(hook).not.toContain('<audio');

    // Node sumber dibuat di soundFX.js dan disambungkan ke pttBus.
    const fx = read('sound', 'soundFX.js');
    expect(fx).toContain('createBufferSource');
    expect(fx).toContain('pttBus');
  });

  it('pttBus masuk ke node duck yang sudah ada, bukan bus baru terpisah', () => {
    const fx = read('sound', 'soundFX.js');
    expect(fx).toMatch(/pttBus\s*=\s*ctx\.createGain\(\)/);
    expect(fx).toMatch(/pttBus\.connect\(duck\)/);
  });

  it('memakai serverNow(), bukan Date.now(), untuk timestamp', () => {
    const hook = read('hooks', 'usePTT.js');
    expect(hook).toContain('serverNow');
    expect(hook).not.toContain('Date.now()');

    const service = read('services', 'pttService.js');
    expect(service).toContain('serverNow');
    expect(service).not.toContain('Date.now()');

    const transport = read('services', 'pttTransport.js');
    expect(transport).toContain('serverNow');
    expect(transport).not.toContain('Date.now()');
  });

  it('tidak memakai dangerouslySetInnerHTML di jalur PTT', () => {
    for (const file of ['usePTT.js']) {
      expect(read('hooks', file)).not.toContain('dangerouslySetInnerHTML');
    }
    for (const file of ['PTTDock.jsx', 'PTTButton.jsx', 'PTTIndicator.jsx']) {
      expect(read('components', file)).not.toContain('dangerouslySetInnerHTML');
    }
  });

  it('mendeteksi format lewat isTypeSupported, bukan user-agent', () => {
    const service = read('services', 'pttService.js');
    expect(service).toContain('isTypeSupported');
    expect(service).not.toContain('navigator.userAgent');
    expect(read('hooks', 'usePTT.js')).not.toContain('userAgent');
  });

  it('menangani touchcancel, blur, dan visibilitychange saat merekam', () => {
    const button = read('components', 'PTTButton.jsx');
    expect(button).toContain('onTouchCancel');
    expect(button).toContain('onPointerCancel');

    const hook = read('hooks', 'usePTT.js');
    expect(hook).toContain("addEventListener('blur'");
    expect(hook).toContain('visibilitychange');
  });

  it('menggunakan runTransaction untuk mutex pttLive', () => {
    const transport = read('services', 'pttTransport.js');
    expect(transport).toContain('runTransaction');
    expect(transport).toContain('pttLive');
    // Dua node terpisah: pttLive kecil, ptt besar.
    expect(transport).toContain("const LIVE_NODE = 'pttLive'");
    expect(transport).toContain("const AUDIO_NODE = 'ptt'");
  });
});

describe('Rules Firebase — node baru punya batas panjang', () => {
  const rules = JSON.parse(readFileSync(join(process.cwd(), 'firebase.rules.json'), 'utf8'));
  const room = rules.rules.rooms.$code;

  it('chats membatasi text 200 karakter dan name 18 karakter', () => {
    const validate = room.chats.$eventId['.validate'];
    expect(validate).toContain("newData.child('text').val().length <= 200");
    expect(validate).toContain("newData.child('name').val().length <= 18");
  });

  it('ptt membatasi data 60000 karakter dan dur 15000 ms', () => {
    const validate = room.ptt.$eventId['.validate'];
    expect(validate).toContain("newData.child('data').val().length <= 60000");
    expect(validate).toContain("newData.child('dur').val() <= 15000");
  });

  it('pttLive punya batas durasi juga', () => {
    expect(room.pttLive['.validate']).toContain("newData.child('dur').val() <= 15000");
  });

  it('chat & PTT berada di sub-node, bukan di level /rooms/$code', () => {
    // Node chat/PTT yang ditulis langsung di level room akan ditolak validasi
    // room-level, karena node itu tidak punya code/hostId/seats/status/rev.
    // Yang dijaga di sini: keduanya memang hidup sebagai sub-node.
    expect(room.chats).toBeTruthy();
    expect(room.ptt).toBeTruthy();
    expect(room.pttLive).toBeTruthy();
    // Validasi room-level tetap mensyaratkan field inti room.
    expect(room['.write']).toContain("newData.hasChildren(['code', 'hostId', 'seats', 'status', 'rev'])");
  });
});
