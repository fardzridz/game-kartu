# Aset Audio Reaksi Suara (Task 5)

Status: **berkas belum ada.** Selama `public/voices/` kosong, bar reaksi suara
menyembunyikan dirinya sendiri — tidak ada tombol rusak, tidak ada error di
konsol, tidak ada request 404 berulang. Fitur hidup otomatis begitu berkas
ditaruh.

## Yang perlu ditaruh

Letakkan di `public/voices/`:

| Nama dasar     | Isi ucapan      | Tombol         |
| -------------- | --------------- | -------------- |
| `mantap`       | "Mantap!"       | Mantap!        |
| `waduh`        | "Waduh!"        | Waduh!         |
| `hahaha`       | "Hahaha"        | Hahaha         |
| `mati-sampah`  | "Mati Sampah!"  | Mati Sampah!   |

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

1. Empat tombol muncul di baris dock (sebelah tombol ejek).
2. Tekan satu → klip terdengar, dan **musik latar mengecil** selama klip
   berbunyi (lewat `pttBus`, bukan `sfxBus`).
3. Tekan lagi dalam 3 detik → tombol nonaktif (rate limit).
4. Nyalakan "Hemat data" di Chrome → tidak ada unduhan di latar saat halaman
   dimuat, tapi tombol tetap ada dan tetap bisa diputar saat ditekan.

Kalau tombol tidak muncul padahal berkas sudah ada, periksa:

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
