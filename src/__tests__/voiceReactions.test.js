import { describe, expect, it } from 'vitest';
import {
  VOICE_COOLDOWN_MS,
  VOICE_REACTIONS,
  cooldownLeft,
  findVoiceReaction,
  isValidVoiceReaction,
  isVoiceEvent,
  makeVoiceEvent,
} from '../utils/voiceReactions.js';

describe('katalog voice reaction', () => {
  it('berisi empat klip yang diminta brief', () => {
    const labels = VOICE_REACTIONS.map(item => item.label);
    expect(labels).toEqual(['Mantap!', 'Waduh!', 'Hahaha', 'Mati Sampah!']);
  });

  it('semua entri punya id, file, dan text yang terisi', () => {
    for (const item of VOICE_REACTIONS) {
      expect(item.id).toBeTruthy();
      expect(item.file.startsWith('/voices/')).toBe(true);
      expect(item.text).toBeTruthy();
    }
  });

  it('id unik satu sama lain', () => {
    const ids = VOICE_REACTIONS.map(item => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('findVoiceReaction', () => {
  it('menemukan reaksi yang dikenal', () => {
    expect(findVoiceReaction('mantap')?.label).toBe('Mantap!');
    expect(findVoiceReaction('mati-sampah')?.label).toBe('Mati Sampah!');
  });

  it('mengembalikan null untuk id asing', () => {
    expect(findVoiceReaction('tidak-ada')).toBeNull();
    expect(findVoiceReaction('')).toBeNull();
    expect(findVoiceReaction(null)).toBeNull();
    expect(findVoiceReaction(123)).toBeNull();
  });

  it('isValidVoiceReaction konsisten dengan findVoiceReaction', () => {
    expect(isValidVoiceReaction('waduh')).toBe(true);
    expect(isValidVoiceReaction('ngawur')).toBe(false);
  });
});

describe('makeVoiceEvent', () => {
  it('membuat payload yang lolos validasi node taunts yang sudah ada', () => {
    const event = makeVoiceEvent({ id: 'hahaha', from: 'pemain-1', ts: 1700000000000 });
    // Rules taunts hanya menerima type taunt|throw.
    expect(event.type).toBe('taunt');
    expect(event.kind).toBe('voice');
    expect(event.reactionId).toBe('hahaha');
    expect(event.from).toBe('pemain-1');
    expect(event.ts).toBe(1700000000000);
    // id unik per event (bukan id reaksi) agar dedupe klien lain tidak tabrakan.
    expect(event.id).not.toBe('hahaha');
    expect(event.id).toContain('hahaha');
  });

  it('TIDAK membawa tauntId/throwableId supaya TauntThrowSystem tidak merender balon', () => {
    const event = makeVoiceEvent({ id: 'mantap', from: 'p1', ts: 1 });
    expect(event.tauntId).toBeUndefined();
    expect(event.throwableId).toBeUndefined();
  });

  it('menolak id reaksi asing', () => {
    expect(makeVoiceEvent({ id: 'ngawur', from: 'p1', ts: 1 })).toBeNull();
  });

  it('menolak pengirim kosong', () => {
    expect(makeVoiceEvent({ id: 'mantap', from: '', ts: 1 })).toBeNull();
    expect(makeVoiceEvent({ id: 'mantap', ts: 1 })).toBeNull();
  });

  it('memakai eventId yang diberikan bila ada', () => {
    const event = makeVoiceEvent({ id: 'waduh', from: 'p1', ts: 5, eventId: 'evt-9' });
    expect(event.id).toBe('evt-9');
  });
});

describe('isVoiceEvent', () => {
  it('mengenali event reaksi suara', () => {
    expect(isVoiceEvent(makeVoiceEvent({ id: 'mantap', from: 'p1', ts: 1 }))).toBe(true);
  });

  it('menolak ejekan/lemparan biasa (tidak punya kind)', () => {
    expect(isVoiceEvent({ type: 'taunt', tauntId: 'lamun', ts: 1 })).toBe(false);
    expect(isVoiceEvent({ type: 'throw', throwableId: 'bom', ts: 1 })).toBe(false);
  });

  it('menolak payload rusak atau reaksi tak dikenal', () => {
    expect(isVoiceEvent(null)).toBe(false);
    expect(isVoiceEvent(undefined)).toBe(false);
    expect(isVoiceEvent('teks')).toBe(false);
    expect(isVoiceEvent({ kind: 'voice', reactionId: 'ngawur' })).toBe(false);
  });
});

describe('cooldownLeft — rate limit 1 per 3 detik', () => {
  it('0 saat belum pernah mengirim', () => {
    expect(cooldownLeft(0, 1000)).toBe(0);
    expect(cooldownLeft(null, 1000)).toBe(0);
  });

  it('menghitung sisa waktu selama cooldown', () => {
    expect(cooldownLeft(1000, 1000)).toBe(VOICE_COOLDOWN_MS);
    expect(cooldownLeft(1000, 2500)).toBe(1500);
    expect(cooldownLeft(1000, 4000)).toBe(0);
  });

  it('0 setelah cooldown lewat', () => {
    expect(cooldownLeft(1000, 10000)).toBe(0);
  });

  it('bisa memakai cooldown khusus', () => {
    expect(cooldownLeft(1000, 1200, 500)).toBe(300);
    expect(cooldownLeft(1000, 1600, 500)).toBe(0);
  });
});
