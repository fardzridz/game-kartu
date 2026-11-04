/**
 * Status BISU SUARA ORANG — satu sumber kebenaran lintas modul.
 *
 * KENAPA MODUL SENDIRI: tombol mute di samping mic dulu hanya menyaring audio
 * PTT yang masuk (`subscribeAudio` di usePTT), padahal ada jalur lain yang
 * sama-sama "suara orang" dan tetap berbunyi:
 *   - klip reaksi suara dari pemain lain (VoiceReactionBar → playVoiceClip)
 *   - klip reaksi suara milik sendiri saat tombolnya ditekan
 * Keduanya berakhir di `playVoiceBuffer()` (soundFX), jadi di situlah gerbang
 * terakhirnya. Hook usePTT tidak bisa dipakai dari situ (bukan React), karena
 * itu statusnya hidup di modul murni ini dan dibaca juga oleh kode non-React.
 *
 * BEDA dengan `isMuted()` di soundFX: itu master (SFX + musik + suara orang).
 * Yang ini HANYA suara orang, jadi musik & efek meja tetap jalan.
 *
 * Status disimpan di localStorage supaya pilihan pemain tidak hilang saat
 * refresh — dulu mute ter-reset setiap pindah halaman dan orang mengira
 * tombolnya rusak.
 */

const STORAGE_KEY = 'remi-voice-muted';

let muted = false;
try {
  muted = localStorage.getItem(STORAGE_KEY) === '1';
} catch {
  // localStorage bisa diblokir (mode privat/iframe); anggap tidak bisu.
}

/** @returns {boolean} true bila suara orang (PTT & reaksi) sedang dibisukan. */
export const isVoiceMuted = () => muted;

/**
 * Set status bisu suara orang.
 * @param {boolean} next
 * @returns {boolean} status setelah diubah.
 */
export function setVoiceMuted(next) {
  muted = Boolean(next);
  try {
    localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
  } catch {
    // Gagal menyimpan bukan alasan untuk membatalkan perubahan.
  }
  return muted;
}

/** Balik status bisu. @returns {boolean} status baru. */
export const toggleVoiceMuted = () => setVoiceMuted(!muted);

/** Kembalikan ke kondisi awal tanpa menyentuh localStorage (dipakai tes). */
export function resetVoiceMuteForTests() {
  muted = false;
}
