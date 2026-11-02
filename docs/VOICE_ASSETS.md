# Aset Audio Reaksi Suara (Task 5)

Status: **4 dari 4 berkas tersedia.** Panel reaksi tampil lengkap.

| Berkas | Ukuran | Durasi | Sumber |
| --- | --- | --- | --- |
| `mantap.ogg` | 8,2 KB | 1,88 s | TTS (Microsoft Edge `edge-tts`), dibuat 2 Nov |
| `waduh.ogg` | 8,0 KB | 1,88 s | TTS (Microsoft Edge `edge-tts`), dibuat 2 Nov |
| `hahaha.webm` | 22 KB | 6,9 s | aset pemilik project (sudah ada sebelumnya) |
| `mati-sampah.ogg` | 9,5 KB | 2,02 s | TTS (Microsoft Edge `edge-tts`), dibuat 2 Nov |

Tiga klip baru dibuat dengan suara sintesis (TTS), bukan diambil dari game lain
— jadi tidak ada masalah lisensi. Kalau nanti pemilik project merekam suara
sendiri, cukup timpa berkasnya dengan nama sama.

Catatan: `hahaha.webm` (6,9 detik) jauh lebih panjang daripada tiga klip lain
(~2 detik). Bisa diganti klip TTS 2 detik kalau ingin seragam.

Selama klip belum lengkap, perilakunya aman:

- Kalau **belum ada satu pun** klip yang berhasil dimuat, panel reaksi
  menyembunyikan dirinya dan tombol mic kembali murni tombol rekam — ketukan
  tidak "ditelan" tanpa hasil, tidak ada request 404 berulang, tidak ada error
  di konsol.
- Fitur hidup otomatis begitu berkas ditaruh. Tidak perlu mengubah kode.

## Cara memunculkan panel

Panel reaksi **menempel pada tombol mic**, bukan baris terpisah di dock:

- **Ketuk mic** → bubble vertikal berisi 4 reaksi muncul di atas tombol mic
- **Tahan mic** → merekam suara (lepas = kirim)
- Ketuk di luar bubble → panel tertutup

Kenapa digabung: versi pertama adalah deretan tombol horizontal di baris dock.
Pada layar 360px deretan itu **meluber keluar tepi kanan layar** sehingga
"Mantap!" dan "Waduh!" terpotong. Bubble vertikal dengan lebar tetap tidak bisa
meluber.

## Yang perlu ditaruh

Letakkan di `public/voices/`:

| Nama dasar     | Isi ucapan      | Tombol         | Status      |
| -------------- | --------------- | -------------- | ----------- |
| `mantap`       | "Mantap!"       | Mantap!        | **ADA** (`mantap.ogg`) |
| `waduh`        | "Waduh!"        | Waduh!         | **ADA** (`waduh.ogg`) |
| `hahaha`       | "Hahaha"        | Hahaha         | **ADA** (`hahaha.webm`) |
| `mati-sampah`  | "Mati Sampah!"  | Mati Sampah!   | **ADA** (`mati-sampah.ogg`) |

Nama berkas = nama dasar + ekstensi. Contoh: `public/voices/mantap.webm`.

## Format

- **Disarankan:** Opus di dalam WebM, mono, 1–2 detik, ±15 KB per klip.
  Ini target ukuran terkecil dan paling cepat diunduh.
- **Boleh:** `.webm`, `.ogg`, `.mp3`, `.m4a`, `.wav`.
  Loader mencoba kelima ekstensi itu secara berurutan, jadi **Anda tidak perlu
  mengubah kode** kalau berkas yang didapat ternyata MP3.
  Urutan percobaan didefinisikan di `VOICE_AUDIO_EXTENSIONS`
  (`src/utils/voiceReactions.js`).
- Kalau satu reaksi punya beberapa ekstensi sekaligus, yang dipakai adalah yang
  lebih dulu berhasil — jadi sebaiknya hanya taruh satu berkas per reaksi.

## Lisensi — wajib dibaca

Aset **harus** direkam sendiri atau berlisensi jelas (CC0 / public domain /
lisensi komersial yang dibeli). **Jangan** mengambil klip dari game lain: itu
pelanggaran hak cipta dan bisa membuat aplikasi diturunkan dari store.

Setelah memilih sumber, catat di komentar kepala
`src/utils/voiceReactions.js`:

- sumber URL atau "rekaman sendiri"
- nama lisensi
- tanggal diambil

## Cara memverifikasi setelah berkas ditaruh

```bash
npm run test && npm run lint && npm run build
npm run dev
```

Lalu buka meja, main sampai masuk `GameBoard`, dan pastikan:

1. **Ketuk** tombol mic → bubble reaksi muncul di ATAS tombol mic (4 tombol,
   tersusun vertikal, tidak terpotong di layar 360px).
2. **Tahan** tombol mic → merekam; lepas → terkirim. Mengetuk tidak boleh
   menyalakan mikrofon atau memunculkan dialog izin.
3. Tekan satu reaksi → klip terdengar, **musik latar mengecil** selama klip
   berbunyi (lewat `pttBus`, bukan `sfxBus`), dan bubble menutup sendiri.
4. Tekan lagi dalam 3 detik → tombol nonaktif (rate limit), panel tetap terbuka.
5. Nyalakan "Hemat data" di Chrome → tidak ada unduhan di latar saat halaman
   dimuat, tapi tombol tetap ada dan tetap bisa diputar saat ditekan.

Kalau panel tidak muncul padahal berkas sudah ada, periksa:

- Nama berkas persis `mantap`, `waduh`, `hahaha`, `mati-sampah` (huruf kecil,
  tanda hubung, bukan spasi).
- Berkas ada di `public/voices/`, bukan `src/voices/`.
- Berkas benar-benar audio yang bisa di-decode browser (buka langsung di tab
  browser untuk memastikan).
- Setelah `npm run build`, berkas ikut tersalin ke `dist/voices/`.

## Catatan teknis

- Pemutaran memakai `pttBus` sehingga `duckForVoice()` otomatis mengecilkan
  musik. Tidak ada `AudioContext` baru — memakai singleton `audioContext()`.
- Preload dijadwalkan saat idle dan **dilewati** kalau mode hemat data aktif.
- Klip yang sudah di-decode ditahan di memori modul (kunci = path klip), dan
  klip yang terbukti tidak ada diingat supaya tidak di-probe berulang kali.
- Service worker ikut meng-cache `.webm/.ogg/.mp3/.m4a/.wav` dan mem-precache
  keempat klip, jadi pemain offline tetap mendengar reaksinya.
- Berkas dengan **video track** (mis. hasil perekaman layar) tetap berfungsi,
  tapi memboroskan kuota. Rekam audio saja bila memungkinkan.
