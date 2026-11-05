# Multi Game Pemagangan BAWASLU

Satu aplikasi, banyak permainan kartu. Halaman utama menampilkan pemilih game
("Selamat datang di Multi Game Pemagangan BAWASLU"), lalu setiap game punya
ruang tunggu, kode undangan 6 karakter, dan mejanya sendiri.

| Game | Status | Keterangan |
| --- | --- | --- |
| **Jengges** (Remi Urut 6) | Siap | Remi tongkrongan 2–8 pemain: tiga kasta sah, gali buangan, mati sampah, bot, PTT. |
| **Poker Banting** (Capsa) | Siap | Buang kartu pakai kombinasi poker: kartu dibagi habis, timpa kombinasi lebih tinggi, habis duluan menang. Tanpa taruhan. |
| Domino QQ | Segera hadir | Slot tampil di halaman utama. |
| Domino Gaple | Segera hadir | Slot tampil di halaman utama. |
| Cangkulan | Segera hadir | Slot tampil di halaman utama. |

Tiga mode sinkronisasi, dipilih otomatis:

| Mode | Kapan aktif | Cakupan |
| --- | --- | --- |
| **Firebase** | `.env` berisi kredensial | Lintas perangkat, lintas jaringan (produksi) |
| **Relay lokal** | `npm run dev` / `npm run preview` tanpa kredensial | Lintas perangkat lewat LAN atau tunnel — **tanpa akun Firebase** |
| **Simulasi lokal** | build statis tanpa server relay | Multi-tab di satu browser (`localStorage` + `BroadcastChannel`) |

Relay (`server/relay.mjs`) adalah plugin Vite: state meja disimpan di memori
proses, ditulis dengan CAS (`baseRev`) dan dibaca dengan polling `?since=rev`.
Server **tidak** tahu aturan permainan — semua aturan tetap di engine klien.
Meja hilang saat dev server di-restart, dan tidak ikut ke build produksi
(`vite build`) — di sana pakai Firebase.

### Main bareng lewat tunnel (tanpa Firebase)

```sh
npm run dev
cloudflared tunnel --url http://localhost:5173     # atau: npx localtunnel --port 5173
```

Bagikan URL `https://….trycloudflare.com` ke teman, lalu:

1. Semua orang membuka URL itu (HP/laptop, jaringan apa pun).
2. Satu orang **Buka Meja** → dapat kode 6 karakter.
3. Yang lain membuka **Gabung** → masukkan kode (atau klik tautan
   `?game=banting&room=KODE` / `?room=KODE` untuk Jengges).
4. Host menekan **BAGIKAN KARTU** / **MULAI PERMAINAN**.

Catatan: tab yang disembunyikan (pindah aplikasi) dianggap AFK setelah ±45 detik
tanpa heartbeat — ini perilaku lama yang juga berlaku di mode Firebase.

## Menjalankan

```sh
npm install
npm run dev      # buka URL yang tercetak (mis. http://localhost:5173)
npm run test     # 520 test: aturan remi, aturan banting, ruang tunggu, bot, transport, chat meja
npm run build
```

Salin `.env.example` menjadi `.env` lalu isi `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_DATABASE_URL`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_AUTH_DOMAIN`, dan `VITE_FIREBASE_APP_ID`. Realtime Database harus sudah dibuat di project Firebase (jika URL salah/belum dibuat, muncul Modal Diagnostik berbahasa Indonesia dengan tombol "Beralih ke Mode Simulasi Lokal").

## Alur halaman

1. **Hub** (`/`) — daftar game berbentuk grid tile: **2 kolom di HP**, 3 kolom mulai 620px (6 tile → 3+3, tidak ada kartu sendirian di baris terakhir). Tiap tile punya thumbnail "mini meja": kipas kartu di atas felt berwarna (hijau Jengges, emas Poker Banting, ungu domino) + lambang kembang sebagai watermark, dengan ilustrasi berbeda per game (kartu kipas / domino / tanda usul). URL ikut berubah (`?game=jengges` atau
   `?game=banting`) sehingga refresh dan tombol back browser mendarat di game
   yang sama.
2. **Jengges** (`?game=jengges`) — ruang tunggu 8 kursi, lalu meja remi. Tautan
   undangan lama `?room=KODE` tetap membuka Jengges.
3. **Poker Banting** (`?game=banting`) — ruang tunggu 8 kursi, lalu meja Capsa.
   Tautan undangan: `?game=banting&room=KODE`.

## Alur permainan Jengges

1. **Ruang tunggu** — buka meja (kamu Host) atau gabung lewat kode 6 karakter / link `?room=KODE`. Pilih kursi di meja melingkar 8 slot, pilih avatar, tekan SIAP. Tombol MULAI PERMAINAN milik Host menyala saat minimal 2 pemain siap.
2. **Upacara** — hitung mundur 3-2-1-MULAI, animasi kocok, kartu dibagikan satu per satu melingkar 6 putaran dengan suara sintesis Web Audio (tanpa file MP3).
3. **Ronde** — Host (Pengocok) jalan pertama: minum 1 kartu lalu buang 1. Pemenang ronde menjadi Pengocok dan jalan pertama di ronde berikutnya. Tumpukan minum habis = ronde berakhir setelah buangan terakhir.

## Aturan penting Jengges

- Tiga kasta sah: deret angka 2–10 satu kembang (boleh Joker), J-Q-K sejenis (tanpa Joker), 3–4 As beda kembang (tanpa Joker). Angka kembar dalam satu deret ditolak.
- Joker hanya menyamar jadi angka 2–10; **maksimal satu Joker per kombinasi**; deret penuh 2..10 + Joker tidak sah.
- Joker di tangan bernilai **-150 poin** (boleh dibuang, tapi mahal) — lebih baik dipakai di kombinasi.
- **Mati Sampah**: menang saat tangan habis setelah membuang 1 kartu terakhir. Sistem menolak kombinasi yang menghabiskan tangan tanpa menyisakan kartu buangan.
- **Gali buangan**: pilih kartu incaran dalam batas kedalaman, tentukan sendiri minimal 2 kartu tangan pendamping di modal konfirmasi; semua kartu di atasnya ikut masuk tangan.
- Membuang Joker/As memunculkan popup konfirmasi keamanan.
- **Obrolan**: ruang tunggu punya panel chat sendiri. Di meja main, obrolan ada di **tab Obrolan** pada tombol **Ejek** (Ejekan / Lempar / Obrolan) — pesan ephemeral **5 menit**, maks 200 karakter, 1 pesan / 2 detik, plus 6 frasa cepat. **Tanpa filter kata**: obrolan tongkrongan dibiarkan bebas, termasuk bahasa daerah.

## Cheat Jengges (dimatikan — main sehat)

Perintah rahasia di kolom obrolan meja (`/pleeer`, `/nyocot`, `/pelumas/plir`)
**mati secara bawaan**. Selama mati:

- ketikan berawalan `/` **ditelan diam-diam** — tidak dikirim sebagai obrolan,
  tidak ada balasan, jadi lawan tidak tahu fitur itu ada;
- engine menolak intent `command` walau dikirim langsung (bukan cuma UI);
- penanda lama (`pendingAces`, `pendingJoker`) diabaikan saat bagi kartu.

Menghidupkan lagi kapan-kapan **tanpa ubah kode**:

| Cara | Perintah |
| --- | --- |
| Sekali lewat URL (tersimpan di perangkat itu) | buka `…/?cheat=1` |
| Mematikan lagi | buka `…/?cheat=0` |
| Lewat konsol browser | `localStorage.setItem('remi-cheats','1')` lalu refresh |
| Nyalakan permanen untuk semua orang | ubah `CHEATS_DEFAULT` → `true` di `src/utils/cheats.js` |

Saklarnya ada di `src/utils/cheats.js`; daftar perintahnya tetap di
`src/utils/slashCommands.js`.

## Poker Banting (Capsa)

Tanpa chip, tanpa taruhan. Tujuannya **menghabiskan kartu**, bukan mengadu nilai
paling tinggi sekali jalan.

1. **Bagi kartu** — dikocok lalu dibagi rata satu-satu **sampai dek habis**.
   2–4 pemain = 1 set (4 orang → 13 kartu), 5–8 pemain = 2 set.
2. **Nilai kartu** — **2 paling tinggi**, lalu A, K, Q, J, 10 … 3 paling rendah.
3. **Siapa yang mulai** —
   - **Game pertama**: pemain yang pegang kartu 3 **mengeluarkannya sendiri**
     (tombol "KELUARKAN n KARTU 3", kartunya tampil di meja), lalu pemain
     dengan 3 terbanyak yang membuka. Kalau jumlahnya sama, kembang tertinggi
     (♠ > ♥ > ♣ > ♦). Fase ini berjatah 20 detik — kalau lewat, kartu 3
     dikeluarkan otomatis supaya permainan tidak macet.
   - **Game berikutnya**: **pemenang game sebelumnya** yang membuka, bebas
     kombinasi apa saja.
4. **Kombinasi** (kekuatan dari terendah ke tertinggi):

   | Kombinasi | Kartu | Catatan |
   | --- | --- | --- |
   | Kartu tunggal | 1 | nilai harus benar-benar lebih tinggi |
   | Satu pasang | 2 | |
   | Tiga sejenis | 3 | kembang bebas |
   | Dua pasang | 4 | hanya bisa dilawan **dua pasang** lain |
   | Straight | 5 | 3-4-5-6-7 terendah … J-Q-K-A-2 tertinggi |
   | Flush | 5 | satu kembang, tidak berurutan |
   | Full house | 5 | tiga sejenis + sepasang |
   | **Empat sejenis** | **4** | boleh menimpa straight, flush, full house |
   | Straight flush | 5 | berurutan satu kembang |
   | Royal flush | 5 | 10-J-Q-K-A satu kembang |

5. **Kartu 2 langsung lanjut** — kartu tunggal 2, pasang 2, tiga sejenis 2,
   atau dua pasang yang pasangan tertingginya 2 tidak bisa ditimpa siapa pun.
   Pemain yang menaruhnya **langsung melanjutkan** (ronde baru, dia buka lagi)
   tanpa menunggu lawan lewat.
6. **Menimpa** — jumlah kartu harus sama dan nilainya harus lebih tinggi
   (pair 9 → minimal pair 10). **Nilai sama tidak bisa menimpa**, kembang tidak
   menolong. Pengecualian: **empat sejenis (4 kartu)** boleh menimpa kombinasi
   5 kartu, dan hanya bisa dikalahkan empat sejenis lebih tinggi, straight
   flush, atau royal flush. Lima kartu berisi 4 kartu sama + 1 bebas **tidak sah**.
7. **Skip = keluar ronde** — sekali tekan SKIP kamu tidak ikut lagi sampai
   ronde itu selesai (walau ada pemain lain menimpa). Kamu masuk lagi di
   ronde berikutnya.
8. **Ronde baru** — kalau semua pemain lain sudah lewat, ronde baru dibuka
   pemain yang terakhir menaruh kartu; kalau dia sudah habis kartunya, pemain
   berikutnya menurut urutan kursi yang membuka.
9. **Kartu habis = menang** — pemain yang kartunya habis langsung menang dan
   keluar, **tapi kartu terakhirnya tetap jadi acuan**: pemain lain masih harus
   menimpanya atau lewat. Permainan lanjut sampai tinggal satu orang masih
   pegang kartu — **dia yang kalah**.
10. **Timer** — 20–60 detik per giliran; lewat waktu otomatis SKIP (atau buang
   kartu terendah kalau sedang membuka ronde).

Aturan meja: waktu giliran, set kartu (otomatis/1/2), dan pilihan **lima kartu
bebas jenis** (aturan Capsa: flush menimpa straight) atau **wajib jenis sama**.

### Tampilan di HP (mobile-first)

Meja dirancang untuk layar 390×844 (mayoritas pemain pakai HP):

- **Kartu di tangan tidak ditumpuk.** Tangan berupa grid rapi (7 kartu per
  baris di HP, 13–21 kartu jadi 2–3 baris) — tiap kartu tampil utuh dengan area
  sentuh ±46×67 px, jadi tidak ada kartu yang tertutup atau salah pencet.
- **Pilih = ketuk.** Kartu terpilih diberi cincin hijau + centang di sudut,
  kartu lain sedikit meredup (tetap terbaca saat menyusun kombinasi).
- **Geser kartu (drag & drop)** untuk mengubah urutan di tangan — jalan di HP
  maupun desktop (pointer events, bukan HTML5 drag). Geseran > 8 px dianggap
  drag, jadi ketukan biasa tetap berfungsi sebagai pilih/batalkan. Urutan
  hanya mengubah tampilan, bukan nilai kartu; kartu baru menyesuaikan sendiri.
- **Lepas kartu di atas meja = langsung main.** Saat digeser, kartu ikut jari
  sebagai "kartu hantu" (bisa dibawa ke mana saja). Kalau dilepas di area meja
  dan kombinasinya sah, kartu langsung turun; kalau belum bisa menimpa, kartu
  tetap terpilih dan alasannya muncul di bawah. Tahan lama di kartu tidak
  memunculkan menu browser (context menu & callout dimatikan).
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
- **Animasi halus** (gaya Jengges): kartu dibagikan satu per satu, kartu yang
  ditaruh "turun" ke meja bertahap, kursi pemain yang baru menaruh kartu
  berdenyut cincin, meja berkilau singkat, dan label kombinasi naik halus.
  Semua animasi **tidak memakai opacity 0** di awal — kalau animasi tidak jalan
  (tab background, HP lemah, mode hemat data, `prefers-reduced-motion`), kartu
  tetap terlihat penuh.
- **Kartu di meja selalu terlihat utuh**: ukuran kartu mengikuti lebar *dan*
  tinggi meja (`clamp(30px, min(8vw, 7.2vh), 58px)`) dan barisnya boleh turun,
  jadi kombinasi 5 kartu tidak pernah terpotong tepi meja.

Detail teknis (model state, pembagian, urutan giliran, bot) ada di
[`docs/MULTI_GAME.md`](docs/MULTI_GAME.md).

## Ketahanan jaringan

- **Turn Lock**: semua aksi melewati transaksi atomik; hanya pemain pada gilirannya yang bisa mengubah state — berlaku untuk Jengges dan Poker Banting.
- **AFK / putus koneksi**: heartbeat 5 detik + `onDisconnect()`; kursi yang ditinggal diambil alih Bot dengan badge 💤, pemain bisa menekan "Ambil Alih Kembali Kursi".
- **Timer giliran** (30/45/60/90 detik, diatur Host) — lewat waktu di Jengges diambil alih bot **dua tahap**: bot minum dulu (giliran tetap milikmu, timer direset penuh), dan baru menyelesaikan buangan kalau waktu habis lagi. Di Poker Banting, lewat waktu otomatis SKIP.
- **Reconnect**: sesi (kode meja + id pemain) disimpan di localStorage — `remi-session` untuk Jengges, `banting-session` untuk Poker Banting; refresh browser mengembalikan kamu ke kursi dengan kartu utuh.
- **Alt + A**: System Health & Audit Monitor (Jengges) — latency, audit total kartu wajib pas 56/112 (alarm bila selisih), status giliran, dan presence pemain.

## Arah visual

Lihat `DESIGN.md` untuk pilihan palet, tipografi, komposisi, motif SVG, dan tingkat gerak. Poker Banting memakai palet yang sama (kanvas `#131109`, emerald `#2CC597`, emas `#F5A623`) dan **tanpa permukaan meja** — kartu, pod lawan, dan zona tengah mengapung langsung di atas kanvas gelap, persis seperti meja Jengges, supaya kedua game terasa satu keluarga.