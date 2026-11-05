1|# Multi Game Pemagangan BAWASLU
2|
3|Satu aplikasi, banyak permainan kartu. Halaman utama menampilkan pemilih game
4|("Selamat datang di Multi Game Pemagangan BAWASLU"), lalu setiap game punya
5|ruang tunggu, kode undangan 6 karakter, dan mejanya sendiri.
6|
7|| Game | Status | Keterangan |
8|| --- | --- | --- |
9|| **Jengges** (Remi Urut 6) | Siap | Remi tongkrongan 2–8 pemain: tiga kasta sah, gali buangan, mati sampah, bot, PTT. |
10|| **Poker Banting** (Capsa) | Siap | Buang kartu pakai kombinasi poker: kartu dibagi habis, timpa kombinasi lebih tinggi, habis duluan menang. Tanpa taruhan. |
11|| Domino QQ | Segera hadir | Slot tampil di halaman utama. |
12|| Domino Gaple | Segera hadir | Slot tampil di halaman utama. |
13|| Cangkulan | Segera hadir | Slot tampil di halaman utama. |
14|
15|Tiga mode sinkronisasi, dipilih otomatis:
16|
17|| Mode | Kapan aktif | Cakupan |
18|| --- | --- | --- |
19|| **Firebase** | `.env` berisi kredensial | Lintas perangkat, lintas jaringan (produksi) |
20|| **Relay lokal** | `npm run dev` / `npm run preview` tanpa kredensial | Lintas perangkat lewat LAN atau tunnel — **tanpa akun Firebase** |
21|| **Simulasi lokal** | build statis tanpa server relay | Multi-tab di satu browser (`localStorage` + `BroadcastChannel`) |
22|
23|Relay (`server/relay.mjs`) adalah plugin Vite: state meja disimpan di memori
24|proses, ditulis dengan CAS (`baseRev`) dan dibaca dengan polling `?since=rev`.
25|Server **tidak** tahu aturan permainan — semua aturan tetap di engine klien.
26|Meja hilang saat dev server di-restart, dan tidak ikut ke build produksi
27|(`vite build`) — di sana pakai Firebase.
28|
29|### Main bareng lewat tunnel (tanpa Firebase)
30|
31|```sh
32|npm run dev
33|cloudflared tunnel --url http://localhost:5173     # atau: npx localtunnel --port 5173
34|```
35|
36|Bagikan URL `https://….trycloudflare.com` ke teman, lalu:
37|
38|1. Semua orang membuka URL itu (HP/laptop, jaringan apa pun).
39|2. Satu orang **Buka Meja** → dapat kode 6 karakter.
40|3. Yang lain membuka **Gabung** → masukkan kode (atau klik tautan
41|   `?game=banting&room=KODE` / `?room=KODE` untuk Jengges).
42|4. Host menekan **BAGIKAN KARTU** / **MULAI PERMAINAN**.
43|
44|Catatan: tab yang disembunyikan (pindah aplikasi) dianggap AFK setelah ±45 detik
45|tanpa heartbeat — ini perilaku lama yang juga berlaku di mode Firebase.
46|
47|## Menjalankan
48|
49|```sh
50|npm install
51|npm run dev      # buka URL yang tercetak (mis. http://localhost:5173)
52|npm run test     # 520 test: aturan remi, aturan banting, ruang tunggu, bot, transport, chat meja
53|npm run build
54|```
55|
56|Salin `.env.example` menjadi `.env` lalu isi `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_DATABASE_URL`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_AUTH_DOMAIN`, dan `VITE_FIREBASE_APP_ID`. Realtime Database harus sudah dibuat di project Firebase (jika URL salah/belum dibuat, muncul Modal Diagnostik berbahasa Indonesia dengan tombol "Beralih ke Mode Simulasi Lokal").
57|
58|## Alur halaman
59|
60|1. **Hub** (`/`) — daftar game berbentuk grid tile: **2 kolom di HP**, 3 kolom mulai 620px (6 tile → 3+3, tidak ada kartu sendirian di baris terakhir). Tiap tile punya thumbnail "mini meja": kipas kartu di atas felt berwarna (hijau Jengges, emas Poker Banting, ungu domino) + lambang kembang sebagai watermark, dengan ilustrasi berbeda per game (kartu kipas / domino / tanda usul). URL ikut berubah (`?game=jengges` atau
61|   `?game=banting`) sehingga refresh dan tombol back browser mendarat di game
62|   yang sama.
63|2. **Jengges** (`?game=jengges`) — ruang tunggu 8 kursi, lalu meja remi. Tautan
64|   undangan lama `?room=KODE` tetap membuka Jengges.
65|3. **Poker Banting** (`?game=banting`) — ruang tunggu 8 kursi, lalu meja Capsa.
66|   Tautan undangan: `?game=banting&room=KODE`.
67|
68|## Alur permainan Jengges
69|
70|1. **Ruang tunggu** — buka meja (kamu Host) atau gabung lewat kode 6 karakter / link `?room=KODE`. Pilih kursi di meja melingkar 8 slot, pilih avatar, tekan SIAP. Tombol MULAI PERMAINAN milik Host menyala saat minimal 2 pemain siap.
71|2. **Upacara** — hitung mundur 3-2-1-MULAI, animasi kocok, kartu dibagikan satu per satu melingkar 6 putaran dengan suara sintesis Web Audio (tanpa file MP3).
72|3. **Ronde** — Host (Pengocok) jalan pertama: minum 1 kartu lalu buang 1. Pemenang ronde menjadi Pengocok dan jalan pertama di ronde berikutnya. Tumpukan minum habis = ronde berakhir setelah buangan terakhir.
73|
74|## Aturan penting Jengges
75|
76|- Tiga kasta sah: deret angka 2–10 satu kembang (boleh Joker), J-Q-K sejenis (tanpa Joker), 3–4 As beda kembang (tanpa Joker). Angka kembar dalam satu deret ditolak.
77|- Joker hanya menyamar jadi angka 2–10; **maksimal satu Joker per kombinasi**; deret penuh 2..10 + Joker tidak sah.
78|- Joker di tangan bernilai **-150 poin** (boleh dibuang, tapi mahal) — lebih baik dipakai di kombinasi.
79|- **Mati Sampah**: menang saat tangan habis setelah membuang 1 kartu terakhir. Sistem menolak kombinasi yang menghabiskan tangan tanpa menyisakan kartu buangan.
80|- **Gali buangan**: pilih kartu incaran dalam batas kedalaman, tentukan sendiri minimal 2 kartu tangan pendamping di modal konfirmasi; semua kartu di atasnya ikut masuk tangan.
81|- Membuang Joker/As memunculkan popup konfirmasi keamanan.
82|- **Obrolan**: ruang tunggu punya panel chat sendiri. Di meja main, obrolan ada di **tab Obrolan** pada tombol **Ejek** (Ejekan / Lempar / Obrolan) — pesan ephemeral **5 menit**, maks 200 karakter, 1 pesan / 2 detik, plus 6 frasa cepat. **Tanpa filter kata**: obrolan tongkrongan dibiarkan bebas, termasuk bahasa daerah.
83|
84|## Poker Banting (Capsa)
85|
86|Tanpa chip, tanpa taruhan. Tujuannya **menghabiskan kartu**, bukan mengadu nilai
87|paling tinggi sekali jalan.
88|
89|1. **Bagi kartu** — dikocok lalu dibagi rata satu-satu **sampai dek habis**.
90|   2–4 pemain = 1 set (4 orang → 13 kartu), 5–8 pemain = 2 set. Pemegang **3♦**
91|   mulai duluan.
92|2. **Nilai kartu** — **2 paling tinggi**, lalu A, K, Q, J, 10 … 3 paling rendah.
93|   Kembang ♠ > ♥ > ♣ > ♦ (menentukan kalau nilainya sama pada kartu tunggal).
94|3. **Kombinasi** — 1 kartu, pair (2), tiga sejenis (3), dua pasang (4), dan lima
95|   kartu (straight, flush, full house, empat sejenis, straight flush/royal flush).
96|4. **Giliran** — pilih kartu lalu **MAIN**, atau **SKIP**. Menimpa harus jumlah
97|   kartu sama dan nilainya lebih tinggi (pair 9 → minimal pair 10).
98|5. **Boleh nyusul** — kalau kamu skip lalu ada pemain lain menaruh kartu,
99|   giliranmu balik dan kamu masih boleh ikut.
100|6. **Ronde baru** — kalau semua pemain lain skip, yang terakhir menaruh kartu
101|   mulai lagi dengan kombinasi bebas.
102|7. **Selesai** — kartu habis duluan = **menang** dan keluar. Permainan lanjut
103|   sampai tinggal satu orang masih pegang kartu — **dia yang kalah**.
104|8. **Timer** — 20–60 detik per giliran; lewat waktu otomatis SKIP (atau buang
105|   kartu terendah kalau sedang membuka ronde).
106|
107|Aturan meja: waktu giliran, set kartu (otomatis/1/2), dan pilihan **lima kartu
108|bebas jenis** (aturan Capsa: flush menimpa straight) atau **wajib jenis sama**.
109|
110|### Tampilan di HP (mobile-first)

Meja dirancang untuk layar 390×844 (mayoritas pemain pakai HP):

- **Kartu di tangan tidak ditumpuk.** Tangan berupa grid rapi (7 kartu per
  baris di HP, 13–21 kartu jadi 2–3 baris) — tiap kartu tampil utuh dengan area
  sentuh ±46×67 px, jadi tidak ada kartu yang tertutup atau salah pencet.
- **Pilih = ketuk.** Kartu terpilih diberi cincin hijau + centang di sudut,
  kartu lain sedikit meredup (tetap terbaca saat menyusun kombinasi).
- **Baris aksi besar di bawah layar**: `✕` (hapus pilihan) · **SKIP** ·
  **MAIN** dengan sub-label nama kombinasi; tombol ikut mengecil sendiri
  sehingga tidak pernah terpotong di layar sempit.
- **Semua lawan terlihat**: 1–3 lawan tampil sebagai baris mendatar; 4–7 lawan
  dibagi rata (maks 4 per baris, avatar di atas nama) sehingga tidak ada kursi
  yang tersembunyi.
- **Ikon obrolan & papan skor** pindah ke baris info pemain di HP supaya tidak
  menutupi kursi lawan (di desktop tetap mengapung di pojok meja).
- Teks bantu dan label kombinasi dinaikkan ukurannya, dan petunjuk giliran
  hanya muncul sekali (tidak mengulang info yang sama).

Detail teknis (model state, pembagian, urutan giliran, bot) ada di
111|[`docs/MULTI_GAME.md`](docs/MULTI_GAME.md).
112|
113|## Ketahanan jaringan
114|
115|- **Turn Lock**: semua aksi melewati transaksi atomik; hanya pemain pada gilirannya yang bisa mengubah state — berlaku untuk Jengges dan Poker Banting.
116|- **AFK / putus koneksi**: heartbeat 5 detik + `onDisconnect()`; kursi yang ditinggal diambil alih Bot dengan badge 💤, pemain bisa menekan "Ambil Alih Kembali Kursi".
117|- **Timer giliran** (30/45/60/90 detik, diatur Host) — lewat waktu di Jengges diambil alih bot **dua tahap**: bot minum dulu (giliran tetap milikmu, timer direset penuh), dan baru menyelesaikan buangan kalau waktu habis lagi. Di Poker Banting, lewat waktu otomatis SKIP.
118|- **Reconnect**: sesi (kode meja + id pemain) disimpan di localStorage — `remi-session` untuk Jengges, `banting-session` untuk Poker Banting; refresh browser mengembalikan kamu ke kursi dengan kartu utuh.
119|- **Alt + A**: System Health & Audit Monitor (Jengges) — latency, audit total kartu wajib pas 56/112 (alarm bila selisih), status giliran, dan presence pemain.
120|
121|## Arah visual
122|
123|Lihat `DESIGN.md` untuk pilihan palet, tipografi, komposisi, motif SVG, dan tingkat gerak. Poker Banting memakai palet yang sama (kanvas `#131109`, emerald `#2CC597`, emas `#F5A623`) dengan permukaan meja hijau tua agar kedua game terasa satu keluarga.