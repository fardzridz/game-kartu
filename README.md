# Remi Tongkrongan: Urut 6 Kartu

Permainan kartu Remi Urut 6 untuk 2 sampai 8 pemain dengan ruang tunggu realtime, upacara bagi kartu, dan monitor kesehatan meja. Tanpa kredensial Firebase, aplikasi jalan di Mode Simulasi Lokal (multi-tab browser lewat localStorage + BroadcastChannel); dengan kredensial, seluruh meja tersinkron lewat Firebase Realtime Database.

## Menjalankan

```sh
npm install
npm run dev      # buka URL yang tercetak (mis. http://localhost:5173)
npm run test     # 43 test: aturan remi, ruang tunggu, bot, transport
npm run build
```

Salin `.env.example` menjadi `.env` lalu isi `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_DATABASE_URL`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_AUTH_DOMAIN`, dan `VITE_FIREBASE_APP_ID`. Realtime Database harus sudah dibuat di project Firebase (jika URL salah/belum dibuat, muncul Modal Diagnostik berbahasa Indonesia dengan tombol "Beralih ke Mode Simulasi Lokal").

## Alur permainan

1. **Ruang tunggu** — buka meja (kamu Host) atau gabung lewat kode 6 karakter / link `?room=KODE`. Pilih kursi di meja melingkar 8 slot, pilih avatar, tekan SIAP. Tombol MULAI PERMAINAN milik Host menyala saat minimal 2 pemain siap.
2. **Upacara** — hitung mundur 3-2-1-MULAI, animasi kocok, kartu dibagikan satu per satu melingkar 6 putaran dengan suara sintesis Web Audio (tanpa file MP3).
3. **Ronde** — Host (Pengocok) jalan pertama: minum 1 kartu lalu buang 1. Pemenang ronde menjadi Pengocok dan jalan pertama di ronde berikutnya. Tumpukan minum habis = ronde berakhir setelah buangan terakhir.

## Aturan penting

- Tiga kasta sah: deret angka 2–10 satu kembang (boleh Joker), J-Q-K sejenis (tanpa Joker), 3–4 As beda kembang (tanpa Joker). Angka kembar dalam satu deret ditolak.
- Joker hanya menyamar jadi angka 2–10; **maksimal satu Joker per kombinasi**; deret penuh 2..10 + Joker tidak sah.
- Joker di tangan bernilai **-150 poin** (boleh dibuang, tapi mahal) — lebih baik dipakai di kombinasi.
- **Mati Sampah**: menang saat tangan habis setelah membuang 1 kartu terakhir. Sistem menolak kombinasi yang menghabiskan tangan tanpa menyisakan kartu buangan.
- **Gali buangan**: pilih kartu incaran dalam batas kedalaman, tentukan sendiri minimal 2 kartu tangan pendamping di modal konfirmasi; semua kartu di atasnya ikut masuk tangan.
- Membuang Joker/As memunculkan popup konfirmasi keamanan.

## Ketahanan jaringan

- **Turn Lock**: semua aksi melewati transaksi atomik; hanya pemain pada gilirannya yang bisa mengubah state.
- **AFK / putus koneksi**: heartbeat 5 detik + `onDisconnect()`; kursi yang ditinggal diambil alih Bot dengan badge 💤, pemain bisa menekan "Ambil Alih Kembali Kursi".
- **Timer giliran** (30/45/60/90 detik, diatur Host) — lewat waktu otomatis digantikan bot.
- **Reconnect**: sesi (kode meja + id pemain) disimpan di localStorage; refresh browser mengembalikan kamu ke kursi dengan kartu utuh.
- **Alt + A**: System Health & Audit Monitor — latency, audit total kartu wajib pas 56/112 (alarm bila selisih), status giliran, dan presence pemain.

## Arah visual

Lihat `DESIGN.md` untuk pilihan palet, tipografi, komposisi, motif SVG, dan tingkat gerak. Status pengujian lengkap ada di `AUDIT_CHECKLIST.md`.
