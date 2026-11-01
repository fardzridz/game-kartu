# PROMPT UNTUK AGENT — Eksekusi BRIEF_FITUR_BARU.md

Salin seluruh isi blok di bawah ini ke agent yang akan mengerjakan.

---

## PROMPT UTAMA (jalankan sekali di awal)

```
Kamu engineer senior yang mengerjakan fitur baru pada project game kartu
"Remi Tongkrongan" di C:\My-berkas\04_Playground\game-kartu.

LANGKAH WAJIB SEBELUM MENULIS KODE APA PUN:

1. Baca docs/BRIEF_FITUR_BARU.md sampai habis. Itu spesifikasi kerjamu.
2. Baca file-file ini untuk memahami konteks (JANGAN diubah):
   - src/components/TauntThrowSystem.jsx  (baris 177-235 — pola channel yang
     harus kamu tiru untuk chat dan PTT)
   - src/sound/soundFX.js                 (baris 36-180 — bus audio, unlock,
     node duck yang sudah disiapkan untuk voice)
   - src/App.jsx                          (baris 130-210 — state room/service/
     viewerId tempat PTT harus di-mount)
   - src/components/GameBoard.jsx         (baris 1780-1880 — pola portal
     fabPortalId / taunt-dock-slot)
   - firebase.rules.json                  (pola node taunts)
   - public/sw.js                         (BYPASS_HOSTS yang bermasalah)
3. Jalankan `npm run test` untuk melihat baseline. Harus 176 test / 11 file
   lulus. Catat angkanya.

ATURAN KERAS:

- JANGAN menyentuh src/engine/ (gameRules.js, roomEngine.js, botAI.js).
  176 test mengunci perilakunya.
- JANGAN menyentuh src/components/TauntThrowSystem.jsx. Kalau perlu polanya,
  SALIN polanya ke modul baru.
- JANGAN membuat AudioContext baru. Pakai audioContext() di soundFX.js.
- JANGAN memakai <audio src> untuk PTT. Wajib Web Audio API
  (decodeAudioData + AudioBufferSourceNode), kalau tidak diblokir autoplay.
- JANGAN memakai dangerouslySetInnerHTML.
- JANGAN menaruh chat/PTT langsung di level room RTDB. Pakai sub-node seperti
  pola "taunts", kalau tidak rules akan menolak.
- JANGAN lupa menaikkan CACHE_VERSION di public/sw.js setiap kali file itu
  berubah.
- JANGAN menghapus atau melemahkan test yang sudah ada.
- JANGAN menambah dependensi baru tanpa alasan kuat. Tidak ada dependensi
  media/WebRTC yang dibutuhkan.

KERJAKAN BERURUTAN, satu task per commit:

  Task 0 — Perbaiki bypass font di sw.js
  Task 1 — Wake Lock
  Task 2 — Hemat data
  Task 3 — Chat ruang tunggu
  Task 4 — Push-to-Talk
  Task 5 — Voice reaction

Setiap task: baca spesifikasinya di brief, kerjakan, jalankan
`npm run test && npm run lint && npm run build`, lalu laporkan dengan format
di bagian 8 brief. Jangan lanjut ke task berikutnya sebelum task sebelumnya
lulus semua test.

Berhenti dan tanya pemilik project kalau:
- Perlu mengubah src/engine/ atau TauntThrowSystem.jsx
- Perlu mengubah firebase.rules.json di level /rooms/$code
- Menemukan bahwa kartu tangan pemain tersimpan di node room yang bisa dibaca
  publik
- Tidak bisa mengunduh file font untuk Task 0

Mulai dari Task 0. Laporkan hasilnya.
```

---

## PROMPT PER TASK (pakai kalau ingin dikerjakan bertahap)

### Task 0

```
Kerjakan Task 0 dari docs/BRIEF_FITUR_BARU.md: perbaiki bypass font di
public/sw.js.

Bug: BYPASS_HOSTS berisi 'googleapis.com', sehingga fonts.googleapis.com
(host CSS Google Fonts di index.html) ikut ter-bypass dan tidak pernah
dicache. Akibatnya saat offline font hilang.

Lakukan perbaikan sesuai brief (utamakan self-host font). Naikkan
CACHE_VERSION. Jalankan npm run test && npm run lint && npm run build.
Laporkan dengan format bagian 8 brief.
```

### Task 1

```
Kerjakan Task 1 dari docs/BRIEF_FITUR_BARU.md: Wake Lock.

Buat src/hooks/useWakeLock.js + test. Integrasikan di GameBoard.jsx, aktif
hanya saat giliran pemain lokal.

Poin yang paling sering salah: lock HARUS diambil ulang saat
visibilitychange menjadi 'visible'. Lock hilang saat pemain pindah app.

Jalankan npm run test && npm run lint && npm run build. Laporkan.
```

### Task 2

```
Kerjakan Task 2 dari docs/BRIEF_FITUR_BARU.md: Hemat data.

Buat src/utils/dataSaver.js + test. Hormati navigator.connection.saveData.
Matikan musik latar dan preload aset berat, TAPI jangan matikan SFX.
Tampilkan indikator kecil ke pengguna.

Peringatan: navigator.connection tidak ada di Firefox/Safari. Wajib
optional chaining, jangan crash.

Jalankan npm run test && npm run lint && npm run build. Laporkan.
```

### Task 3

```
Kerjakan Task 3 dari docs/BRIEF_FITUR_BARU.md: Chat ruang tunggu.

Sebelum menulis kode, baca src/components/TauntThrowSystem.jsx baris 177-235.
Tiru pola openTauntChannel itu ke modul generik
src/services/ephemeralChannel.js (akan dipakai dua kali: chat + PTT).

Buat: ephemeralChannel.js, chatFilter.js, RoomChat.jsx, plus test.
Tambah node "chats" di firebase.rules.json mengikuti pola "taunts".
Mount RoomChat di RoomLobby.jsx.

BATASAN PENTING: chat teks HANYA di ruang tunggu. JANGAN pasang di
GameBoard — di sana sudah ada TauntThrowSystem, dan keyboard akan menutupi
meja sementara timer 45 detik tetap jalan.

Jalankan npm run test && npm run lint && npm run build. Laporkan.
```

### Task 4 (paling berat — beri konteks penuh)

```
Kerjakan Task 4 dari docs/BRIEF_FITUR_BARU.md: Push-to-Talk.

Ini fitur terbesar. Baca bagian 6 brief sampai habis, plus:
- src/sound/soundFX.js baris 36-180 (unlocked, bindUnlock, audioContext,
  sfxBus, musicBus, node duck — semua sudah ada, JANGAN bangun ulang)
- src/App.jsx baris 130-210 (state room/service/viewerId)
- src/components/TauntThrowSystem.jsx baris 177-235 (pola channel)
- src/components/GameBoard.jsx baris 1780-1880 (pola portal fabPortalId)

Konsep: tahan tombol mic → bicara → lepas → otomatis terkirim → semua
pemain langsung dengar tanpa klik. Ini BUKAN voice call, TIDAK butuh WebRTC
atau TURN. Rekam → kirim via RTDB → putar.

Tiga keputusan arsitektur yang tidak boleh salah:
1. Mount di App.jsx, BUKAN di RoomLobby/GameBoard. Kalau di halaman,
   MediaRecorder mati saat pindah layar.
2. Tambah pttBus → duck → master di soundFX.js. Pakai audioContext() yang
   sudah ada, jangan buat baru.
3. Dua node RTDB terpisah: pttLive (kecil, untuk indikator + mutex via
   runTransaction) dan ptt (besar, untuk audio base64).

Tujuh jebakan di tabel bagian 6 WAJIB ditangani semua, terutama:
- Filter ts < 5 detik (pakai serverNow(), bukan Date.now()) supaya audio
  lama tidak diputar ulang saat reconnect
- touchcancel/blur/visibilitychange supaya mic tidak nyangkut merekam
- MediaRecorder.isTypeSupported() untuk beda format Safari vs Chrome,
  JANGAN user-agent. Kalau tidak didukung, sembunyikan tombol.
- pttLive kedaluwarsa kalau ts + dur + 3000 < now (mutex bocor)

Jalankan npm run test && npm run lint && npm run build. Uji dengan 2 tab.
Laporkan termasuk hasil uji dua device/tab.
```

### Task 5

```
Kerjakan Task 5 dari docs/BRIEF_FITUR_BARU.md: Voice reaction.

Klip audio siap pakai ("Mantap!", "Waduh!", "Hahaha", "Mati Sampah!").
Putar lewat pttBus yang sudah dibuat di Task 4 (supaya musik mengecil).
Kirim event lewat node "taunts" yang SUDAH ADA — tidak perlu rules baru.
Rate limit 1 per 3 detik.

Aset harus direkam sendiri atau berlisensi jelas. JANGAN ambil dari game
lain. Catat sumber lisensi di komentar file.

Jalankan npm run test && npm run lint && npm run build. Laporkan.
```

---

## PROMPT REVIEW (pakai setelah agent melapor selesai)

```
Review hasil kerja pada branch/commit terakhir terhadap
docs/BRIEF_FITUR_BARU.md.

Periksa dan laporkan jujur, satu per satu:

1. Apakah src/engine/ benar-benar tidak tersentuh? Jalankan git diff.
2. Apakah TauntThrowSystem.jsx tidak tersentuh?
3. Berapa jumlah test sekarang? Jalankan npm run test. Harus >= 176.
4. Apakah ada test lama yang dihapus atau dilemahkan? Bandingkan dengan git.
5. Apakah CACHE_VERSION di public/sw.js sudah naik?
6. Apakah chat HANYA ada di RoomLobby, tidak di GameBoard?
7. Apakah PTT di-mount di App.jsx, bukan di halaman?
8. Apakah ada AudioContext baru dibuat di luar soundFX.js?
9. Apakah ada penggunaan dangerouslySetInnerHTML?
10. Apakah ada <audio src> untuk PTT?
11. Apakah node RTDB baru sudah punya batas panjang di rules?
12. Apakah pttService memakai serverNow() dan bukan Date.now() untuk ts?
13. Apakah ada secret atau data pribadi yang bocor ke kode/log?
14. Jalankan npm run lint && npm run build. Laporkan hasil nyata.

Untuk setiap poin yang GAGAL, sebutkan file dan barisnya. Jangan
menyimpulkan "sudah bagus" tanpa memeriksa satu per satu.
```

---

## PROMPT UJI MANUAL (untuk pemilik project, bukan agent)

```
Setelah agent melapor selesai, uji sendiri:

PERSIAPAN
- npm run dev
- Buka di dua device berbeda (HP + laptop), bukan dua tab di satu device.
  Firebase butuh device nyata untuk menguji sinkronisasi.

CHAT RUANG TUNGGU
- Device A buat meja, device B gabung lewat kode.
- Kirim chat dari A, pastikan muncul di B.
- Kirim 3 pesan cepat berturut-turut → pastikan rate limit menahan.
- Ketik <script>alert(1)</script> → harus tampil sebagai teks.
- Refresh B → pastikan chat lama TIDAK muncul beruntun.
- Masuk ke meja main → pastikan TIDAK ada chat di sana.

PUSH-TO-TALK
- A tahan tombol mic, ucapkan sesuatu, lepas.
- B harus mendengar OTOMATIS tanpa menekan apa pun.
- A dan B tahan bersamaan → hanya satu yang dapat, yang lain dapat toast.
- A tahan lalu geser jari ke atas dan lepas → tidak ada yang terkirim.
- A tahan lalu tekan tombol Home (pindah app) → mic harus berhenti.
- Matikan musik? Nyalakan musik, lalu A bicara → musik harus mengecil.
- B refresh saat A sedang bicara → B TIDAK boleh mendengar audio lama.
- Uji di iPhone kalau ada (format audio beda, autoplay beda).

WAKE LOCK
- Giliran Anda → diamkan HP, layar tidak boleh mati.
- Pindah app lalu kembali → layar tetap tidak mati di giliran Anda.
- Giliran lawan → layar boleh mati (hemat baterai).

HEMAT DATA
- Chrome DevTools → Network → centang "Save data".
- Refresh → musik tidak boleh berbunyi, indikator hemat data muncul.
- SFX kartu harus tetap berbunyi.

UMUM
- npm run test → laporkan jumlahnya.
- Buka DevTools Console di semua device → tidak boleh ada error merah.
- Uji di viewport 360x640 → tidak ada scroll horizontal.
```

---

## CATATAN UNTUK ANDA (pemilik project)

**Yang perlu Anda putuskan sebelum agent mulai:**

1. **Font (Task 0).** Self-host font butuh mengunduh file `.woff2`. Kalau agent tidak punya akses jaringan, dia akan pakai perbaikan minimal (ubah `BYPASS_HOSTS`). Keduanya diterima — minta dia melaporkan mana yang dipilih.

2. **Voice reaction (Task 5) butuh aset audio.** Agent tidak bisa merekam suara Anda. Pilih salah satu:
   - Rekam sendiri 4 klip pendek, taruh di `public/voices/`
   - Pakai TTS, rekam hasilnya
   - Tunda Task 5 sampai aset siap, kerjakan Task 0–4 dulu

3. **Firebase rules.** Kalau project Firebase Anda sudah production, jangan lupa **publish** `firebase.rules.json` yang baru setelah diubah, dan uji dulu di project staging. Rules yang salah bisa mengunci semua pemain.

4. **Kuota Firebase.** PTT mengirim ~40 KB base64 per pesan ke tiap pendengar. 100 pesan dalam satu sesi 6 pemain ≈ 20 MB unduhan. Kuota gratis Firebase ~10 GB/bulan, tapi batas yang lebih cepat kena adalah **100 koneksi simultan** (~15–20 meja). Kalau sudah ramai, pertimbangkan pindah audio ke Firebase Storage (kirim URL, bukan base64) — cukup ganti isi `sendAudio`/`onAudio`, UI tidak perlu berubah.
