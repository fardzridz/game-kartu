import { useCallback, useEffect, useRef, useState } from 'react';
import { audioContext, playVoiceBuffer, stopVoicePlayback } from '../sound/soundFX.js';
import { serverNow } from '../services/realtimeService.js';
import { vibrate } from '../utils/haptics.js';
import {
  AUDIO_BITS_PER_SECOND,
  MAX_DURATION_GAME_MS,
  MAX_DURATION_LOBBY_MS,
  base64ToBuffer,
  bufferToBase64,
  canRecordAudio,
  isAudioFresh,
  pickAudioMimeType,
} from '../services/pttService.js';
import {
  acquireTalkLock,
  publishAudio,
  releaseTalkLock,
  subscribeAudio,
  subscribeLiveState,
} from '../services/pttTransport.js';

/**
 * Push-to-Talk: tahan → bicara → lepas → otomatis terkirim → semua dengar.
 *
 * BUKAN voice call. Rekam dulu (~2 detik) lalu kirim lewat RTDB; latensi total
 * 300–800 ms. Tidak ada WebRTC, tidak ada TURN, tidak ada dependensi media.
 *
 * Hook ini harus di-mount di App.jsx — BUKAN di RoomLobby atau GameBoard.
 * Saat host menekan MULAI, RoomLobby unmount dan GameBoard mount; kalau PTT
 * ada di dalam salah satunya, MediaRecorder mati di tengah rekaman, listener
 * Firebase terputus, dan status mute ter-reset setiap pindah halaman.
 *
 * @param {object} options
 * @param {string|null} options.roomCode
 * @param {string|null} options.viewerId
 * @param {string} [options.name] - nama tampilan untuk indikator.
 * @param {boolean} [options.inGame] - true di meja main (batas 10 dtk), false di ruang tunggu (15 dtk).
 * @param {boolean} [options.enabled] - saklar global dari pengaturan.
 * @returns {object} state + aksi untuk PTTButton.
 */
export function usePTT({ roomCode, viewerId, name = '', inGame = false, enabled = true }) {
  const maxDurationMs = inGame ? MAX_DURATION_GAME_MS : MAX_DURATION_LOBBY_MS;

  // Format audio ditentukan sekali per sesi. null = browser tidak mendukung
  // rekaman → tombol mic harus disembunyikan sama sekali (jebakan #4).
  // Dihitung lewat lazy initializer, bukan di dalam effect: kemampuan
  // MediaRecorder tidak berubah selama sesi.
  const [mimeType] = useState(() => {
    const recorder = typeof window !== 'undefined' ? window.MediaRecorder : undefined;
    if (!recorder || typeof recorder.isTypeSupported !== 'function') return null;
    return pickAudioMimeType(type => recorder.isTypeSupported(type));
  });
  const [supported] = useState(() => canRecordAudio());
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [speaking, setSpeaking] = useState(null); // { from, name } pemain lain
  const [notice, setNotice] = useState('');
  const [muted, setMuted] = useState(false);

  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef(null);
  const cancelledRef = useRef(false);
  const recordingRef = useRef(false);
  const stopReasonRef = useRef('release');

  const roomRef = useRef(roomCode);
  const viewerRef = useRef(viewerId);
  const nameRef = useRef(name);
  const mutedRef = useRef(muted);
  const enabledRef = useRef(enabled);
  const maxDurationRef = useRef(maxDurationMs);

  useEffect(() => { roomRef.current = roomCode; }, [roomCode]);
  useEffect(() => { viewerRef.current = viewerId; }, [viewerId]);
  useEffect(() => { nameRef.current = name; }, [name]);
  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { maxDurationRef.current = maxDurationMs; }, [maxDurationMs]);

  // --- Deteksi dukungan ------------------------------------------------
  // (mimeType & supported sudah dihitung di lazy initializer di atas.)

  // --- Dengarkan audio pemain lain -------------------------------------
  useEffect(() => {
    if (!roomCode || !viewerId) return undefined;

    const unsubscribe = subscribeAudio({
      roomCode,
      selfClientId: viewerId,
      onAudio: async payload => {
        if (mutedRef.current) return;
        if (!isAudioFresh(payload.ts, serverNow())) return;
        const ctx = audioContext();
        if (!ctx) return;
        const buffer = base64ToBuffer(payload.data);
        if (!buffer) return;
        try {
          // decodeAudioData butuh callback-based di Safari lama; promise
          // didukung di semua browser modern, tapi kita tangani keduanya.
          const decoded = await new Promise((resolve, reject) => {
            const result = ctx.decodeAudioData(buffer, resolve, reject);
            if (result && typeof result.then === 'function') result.then(resolve).catch(reject);
          });
          playVoiceBuffer(decoded);
        } catch {
          // Format tidak dikenal / audio rusak: diam saja, jangan crash.
        }
      },
    });

    return unsubscribe;
  }, [roomCode, viewerId]);

  // --- Indikator "sedang bicara" ---------------------------------------
  useEffect(() => {
    if (!roomCode || !viewerId) return undefined;
    return subscribeLiveState({
      roomCode,
      selfClientId: viewerId,
      onChange: next => setSpeaking(next),
    });
  }, [roomCode, viewerId]);

  // --- Bersihkan sumber daya -------------------------------------------
  const stopStream = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;
    if (!stream) return;
    try { stream.getTracks().forEach(track => track.stop()); } catch { /* sudah berhenti */ }
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const finishRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    recorderRef.current = null;
    recordingRef.current = false;
    setRecording(false);
    clearTimer();
    setElapsed(0);
    stopStream();
    try {
      if (recorder.state !== 'inactive') recorder.stop();
    } catch {
      // Recorder sudah berhenti sendiri.
    }
  }, [clearTimer, stopStream]);

  // --- Kirim hasil rekaman ---------------------------------------------
  const handleBlob = useCallback(async blob => {
    if (!blob || blob.size === 0) return;
    if (cancelledRef.current) return;
    const dur = Math.round(serverNow() - startedAtRef.current);
    if (dur < 250) {
      // Terlalu pendek untuk didengar; jangan buang kuota.
      setNotice('Rekaman terlalu pendek.');
      return;
    }

    const base64 = bufferToBase64(await blob.arrayBuffer());
    const payload = {
      from: viewerRef.current,
      ts: serverNow(),
      dur,
      mime: blob.type || mimeType || 'audio/webm',
      data: base64,
    };

    const result = await publishAudio({ roomCode: roomRef.current, payload });
    if (!result.ok) {
      // Pesan HARUS membedakan dua kegagalan yang berbeda penyebabnya:
      //   - 'audio terlalu besar' → kuota byte habis (bitrate/ukuran berkas)
      //   - 'rekaman terlalu panjang' → durasi melewati batas
      // Dulu keduanya ditampilkan sebagai "terlalu panjang", sehingga pemain
      // yang merekam 10 detik (masih di bawah batas) diberi tahu durasinya
      // kelebihan — padahal masalahnya ukuran berkas. Membingungkan dan
      // membuat orang mencoba merekam makin pendek tanpa hasil.
      if (result.reason === 'audio terlalu besar') {
        setNotice(`Rekaman terlalu besar (${Math.round(blob.size / 1024)} KB). Coba lebih singkat.`);
      } else if (result.reason === 'rekaman terlalu panjang') {
        setNotice(`Rekaman melebihi ${Math.round(maxDurationRef.current / 1000)} detik.`);
      } else {
        setNotice('Suara gagal terkirim. Periksa koneksi.');
      }
    }
  }, [mimeType]);

  // --- Mulai merekam ---------------------------------------------------
  const start = useCallback(async () => {
    if (!enabledRef.current) return;
    if (recordingRef.current) return;
    if (!roomRef.current || !viewerRef.current) return;
    if (!mimeType) {
      setNotice('Browser ini belum mendukung pesan suara.');
      return;
    }

    cancelledRef.current = false;
    stopReasonRef.current = 'release';

    // Mutex server-side: hanya satu pembicara.
    const lock = await acquireTalkLock({
      roomCode: roomRef.current,
      clientId: viewerRef.current,
      name: nameRef.current,
      maxDurationMs: maxDurationRef.current,
    });
    if (!lock.granted) {
      setNotice(`Tunggu, ${lock.holderName || 'pemain lain'} sedang bicara.`);
      return;
    }

    let stream;
    try {
      // Izin mikrofon diminta di sini; browser mengingat izinnya sehingga
      // permintaan berikutnya tidak menampilkan dialog lagi.
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setNotice('Izin mikrofon ditolak. Aktifkan di pengaturan browser.');
      await releaseTalkLock({ roomCode: roomRef.current, clientId: viewerRef.current });
      return;
    }
    streamRef.current = stream;

    let recorder;
    try {
      // audioBitsPerSecond WAJIB: tanpa ini browser memakai ~128 kbps dan
      // rekaman 10 detik saja sudah melebihi kuota 60.000 karakter base64.
      recorder = new window.MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
      });
    } catch {
      // Sebagian browser menolak opsi bitrate. Coba tanpa opsi itu daripada
      // mematikan fitur; hasilnya lebih besar tapi setidaknya berfungsi.
      try {
        recorder = new window.MediaRecorder(stream, { mimeType });
      } catch {
        setNotice('Browser ini belum mendukung pesan suara.');
        stopStream();
        await releaseTalkLock({ roomCode: roomRef.current, clientId: viewerRef.current });
        return;
      }
    }

    chunksRef.current = [];
    recorder.ondataavailable = event => {
      if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const parts = chunksRef.current;
      chunksRef.current = [];
      const blob = new Blob(parts, { type: mimeType });
      releaseTalkLock({ roomCode: roomRef.current, clientId: viewerRef.current });
      handleBlob(blob);
    };
    recorder.onerror = () => {
      setNotice('Perekaman gagal. Coba lagi.');
      finishRecording();
      releaseTalkLock({ roomCode: roomRef.current, clientId: viewerRef.current });
    };

    recorderRef.current = recorder;
    startedAtRef.current = serverNow();
    recordingRef.current = true;
    setRecording(true);
    setElapsed(0);
    setNotice('');
    vibrate(18);

    try {
      recorder.start();
    } catch {
      setNotice('Perekaman gagal dimulai.');
      finishRecording();
      await releaseTalkLock({ roomCode: roomRef.current, clientId: viewerRef.current });
      return;
    }

    timerRef.current = setInterval(() => {
      const ms = serverNow() - startedAtRef.current;
      setElapsed(ms);
      // Batas durasi keras: berhenti sendiri supaya kuota tidak jebol.
      if (ms >= maxDurationRef.current) {
        stopReasonRef.current = 'limit';
        finishRecording();
      }
    }, 100);
  }, [finishRecording, handleBlob, mimeType, stopStream]);

  // --- Selesai merekam -------------------------------------------------
  const stop = useCallback(({ cancel = false } = {}) => {
    if (!recordingRef.current) return;
    cancelledRef.current = cancel;
    stopReasonRef.current = cancel ? 'cancel' : 'release';
    if (cancel) {
      // Buang chunk supaya tidak ada yang terkirim sama sekali.
      chunksRef.current = [];
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onstop = () => {
          releaseTalkLock({ roomCode: roomRef.current, clientId: viewerRef.current });
        };
      }
    }
    vibrate(cancel ? 10 : 18);
    finishRecording();
  }, [finishRecording]);

  // Jebakan #3: touchcancel / jari geser / pindah app tidak boleh membuat
  // mikrofon merekam terus. Semua jalur "berhenti tak terduga" diarahkan ke
  // stop(), dan jalur pindah app membatalkan pengiriman.
  useEffect(() => {
    const onBlur = () => { if (recordingRef.current) stop({ cancel: true }); };
    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden' && recordingRef.current) {
        stop({ cancel: true });
      }
    };
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [stop]);

  // Unmount (mis. keluar meja): hentikan segalanya tanpa mengirim.
  useEffect(() => () => {
    clearTimer();
    stopStream();
    stopVoicePlayback();
    const recorder = recorderRef.current;
    recorderRef.current = null;
    recordingRef.current = false;
    if (recorder) {
      try {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        if (recorder.state !== 'inactive') recorder.stop();
      } catch { /* sudah berhenti */ }
    }
    if (roomRef.current && viewerRef.current) {
      releaseTalkLock({ roomCode: roomRef.current, clientId: viewerRef.current });
    }
  }, [clearTimer, stopStream]);

  const toggleMute = useCallback(() => {
    setMuted(prev => {
      if (!prev) stopVoicePlayback();
      return !prev;
    });
  }, []);

  return {
    supported: supported && enabled,
    recording,
    elapsed,
    maxDurationMs,
    speaking,
    notice,
    muted,
    mimeType,
    start,
    stop,
    cancel: () => stop({ cancel: true }),
    toggleMute,
    clearNotice: () => setNotice(''),
  };
}

export default usePTT;
