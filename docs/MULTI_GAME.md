# Multi Game — Arsitektur

Dokumen ini menjelaskan bagaimana satu aplikasi Vite + React menjalankan dua
permainan kartu (**Jengges** dan **Poker Banting/Capsa**) tanpa menduplikasi
lapisan realtime, presence, atau PWA.

## Peta file

```
src/
  App.jsx                       # router sederhana: hub | jengges | banting
  hub/GameHub.jsx               # halaman "Selamat datang di Multi Game Pemagangan BAWASLU"
  hub/hub.css
  components/Lobby.jsx          # lobi Jengges
  engine/roomEngine.js          # mesin Jengges (tidak diubah)
  banting/hands.js              # kombinasi & perbandingan kartu (Capsa)
  banting/bantingEngine.js      # mesin Poker Banting: bagi kartu, giliran, skip, hasil
  banting/bantingBots.js        # bot: pembangkit kombinasi + pemilihan termurah
  banting/BantingApp.jsx        # orkestrasi: sesi, transaksi, driver bot, presence
  banting/BantingHome.jsx       # buka/gabung meja
  banting/BantingRoomLobby.jsx  # ruang tunggu + aturan meja
  banting/BantingTable.jsx      # meja: kursi, kartu di tangan, panel MAIN/SKIP
  banting/BantingDrawer.jsx     # obrolan, papan skor, riwayat, aturan, peringkat
  banting/useBantingChat.js     # obrolan meja (kanal ephemeral)
  banting/ranking.js            # contekan peringkat kombinasi
  banting/banting.css
  services/realtimeService.js   # satu adapter untuk semua game (opsi root/prefix)
  services/relayService.js      # adapter relay lokal (CAS + polling)
server/relay.mjs                # relay meja untuk dev/preview (plugin Vite)
```

## Routing

`App.jsx` menyimpan `activeGame` yang diturunkan dari URL:

| URL | Halaman |
| --- | --- |
| `/` | Hub |
| `?game=jengges` | Lobi Jengges |
| `?game=banting` | Lobi/meja Poker Banting |
| `?room=KODE` | Jengges (kompatibilitas tautan undangan lama) |
| `?game=banting&room=KODE` | Poker Banting (tautan undangan) |

Pemilihan game memakai `history.replaceState`, jadi refresh dan tombol back
browser tetap konsisten. Koneksi meja Jengges **baru** dibuka ketika game itu
dipilih (`resumedRef`), supaya halaman hub tidak membuka socket yang tidak
dipakai.

## Satu adapter realtime, dua namespace

`createRealtimeService(code, clientId, { root, prefix })`:

| Game | `root` (Firebase/relay) | `prefix` (localStorage) |
| --- | --- | --- |
| Jengges | `rooms/` | `remi` → `remi-room-KODE`, `remi-session` |
| Poker Banting | `bantingRooms/` | `banting` → `banting-room-KODE`, `banting-session` |

Kode meja 6 karakter bisa sama di dua game tanpa saling menimpa, dan aturan
Firebase punya validasi status sendiri per root (lihat `firebase.rules.json`;
status banting: `lobby | playing | round-end`).

## Model state Poker Banting

```js
{
  v: 1, game: 'banting', code, hostId,
  status: 'lobby' | 'playing' | 'round-end',
  settings: { turnSeconds, decks: 'auto'|'1'|'2', fiveAnyCategory: true },
  seats: [{ id, name, avatar, ready, bot, online, sitOut, wins, losses }],
  handNo, hand, lastResult, history, log, rev, createdAt, lastActionAt
}
```

`hand`:

```js
{
  no, seed, sets, phase: 'play' | 'ended',
  turnSeat, deadline,
  lastPlay: null | { seat, playerId, name, cards, combo, at },
  passed: [playerId],            // yang sudah skip sejak kartu terakhir
  players: [{ id, seat, name, hand: [], finished, order }],
  finishOrder: [playerId],       // urutan pemain yang kartunya habis
  loserId, log
}
```

`combo` hasil `describeCombo()`: `{ type, size, key, top, label }`.

## Kombinasi & perbandingan

`hands.js`:

- Nilai: `2` = 15 (tertinggi), `A` = 14, … `3` = 3.
- Kembang ♠4 ♥3 ♣2 ♦1 **hanya** dipakai untuk menentukan pembuka game pertama
  (pemegang kartu 3 terbanyak); kembang tidak dipakai untuk menimpa.
- Ukuran sah: 1 (single), 2 (pair), 3 (trips), 4 (dua pasang **atau** empat
  sejenis), 5 (straight, flush, full house, straight flush, royal). Lima kartu
  berisi 4 kartu sama + kicker ditolak.
- Kekuatan (`COMBO_POWER`): single 100 < pair 200 < trips 300 < two-pair 400 <
  straight 500 < flush 600 < full-house 700 < **quads 800 (4 kartu)** <
  straight-flush 900 < royal 1000.
- Straight memakai urutan Capsa: `3-4-5-6-7` terendah sampai `J-Q-K-A-2`
  tertinggi (tidak ada putaran A-2-3-4-5).
- `canBeat(candidate, last, { fiveAnyCategory })`:
  - jumlah kartu harus sama, **kecuali** empat sejenis (4) vs kombinasi 5 kartu,
  - dua pasang hanya bisa dilawan dua pasang,
  - untuk 5 kartu: kategori lebih tinggi menang (aturan Capsa) — bisa dimatikan
    lewat setelan meja sehingga wajib jenis sama,
  - selain itu `power` lebih tinggi menang; kalau `power` sama, `key` harus
    lebih besar (nilai sama ditolak — kembang tidak menolong).

## Alur satu aksi

```
UI (BantingTable) → onIntent({ type: 'play', cards: [uid] } | { type: 'skip' })
  → BantingApp.sendIntent
  → service.transact(current => applyBantingIntent(current, intent, viewerId, serverNow()))
  → validasi kombinasi + giliran → update lastPlay/passed → pindah giliran
  → { room } | { error }  → error ditampilkan sebagai toast 6 detik
```

Aturan giliran:

- `play`: kartu dibuang dari tangan; `lastPlay` diperbarui. Kalau tangan habis
  → pemain ditandai `finished` dan masuk `finishOrder`, **tapi `lastPlay`
  tetap** — pemain lain masih harus menimpanya. `passed` tidak direset di sini.
- `skip`: pemain masuk `passed` dan **keluar dari ronde itu** — giliran
  mencari pemain lain yang belum lewat (`nextPlayableSeat` melewati pemain
  `passed`). Kalau tidak ada lawan yang masih bisa menimpa, `lastPlay = null`
  (ronde baru) dan `passed` dikosongkan; pembukanya `newRoundLeader()`:
  pemain yang terakhir menaruh kartu kalau dia masih bermain, kalau sudah habis
  (menang) pemain berikutnya menurut urutan kursi.
- `play`: `passed` **tidak** direset, jadi pemain yang sudah lewat tetap di
  luar sampai ronde baru.
- `startRound`: game ke-1 masuk **fase `opening`** — kartu 3 tidak lagi
  dibuang otomatis. Tiap pemegang kartu 3 memanggil intent `showThrees`
  (tombol "KELUARKAN n KARTU 3"); kartunya dicatat di `hand.opening[]` supaya
  tampil di meja. Setelah semua keluar, `finishOpening()` menentukan pembuka =
  3 terbanyak (seri → kembang tertinggi). Fase ini berjatah
  `BANTING_OPENING_MS` (20 detik); `tick` mengeluarkan sisanya otomatis.
  Game ke-2 dan seterusnya langsung `phase: 'play'` dengan pembuka pemenang
  sebelumnya (`lastResult.winnerId`).
- `isUnbeatable(combo)`: kartu tunggal/pasang/tiga sejenis bernilai 2, atau
  dua pasang dengan pasangan tertinggi 2 → tidak bisa ditimpa, jadi
  `applyPlay` langsung memanggil `startNewRound()` untuk pemain itu.
- `ensurePlayableTurn()`: pengaman — kalau `turnSeat` menunjuk pemain yang
  sudah lewat/habis (state lama), giliran dipindahkan ke pemain berikutnya
  yang masih boleh ikut, bukan dibiarkan macet.
- Pemain yang sudah `finished` dilewati; permainan berakhir saat tersisa satu
  pemain — dia `loserId`.

## Determinisme kocokan

Seed diturunkan dari state meja: `hash(code + handNo + rev + lastActionAt)` lalu
diacak dengan `mulberry32`. Karena transaksi bisa menjalankan mutator lebih dari
sekali (cache lokal, lalu server), kocokan **tidak** memakai `Math.random()` —
dengan seed ini semua percobaan menghasilkan kartu identik.

## Driver bot & batas waktu

Hanya **satu klien** yang menggerakkan bot dan timeout: host, atau pemain
pertama bila host keluar. Timer disimpan di `Map` ref (bukan cleanup effect),
karena setiap aksi memicu snapshot baru — timer yang di-cleanup per render akan
membatalkan aksi bot sebelum sempat terkirim. Sebelum mengirim, timer memeriksa
`liveRoomRef` (rev masih sama) agar aksi basi tidak dikirim.

- Bot: `botDecision(room, seatIndex)` → `{ type: 'play', cards }` atau
  `{ type: 'skip' }`. Saat membuka ronde memilih kombinasi termurah; saat
  menimpa memilih yang paling murah yang masih menang; kartu `2` dihindari
  selama ada pilihan lain.
- Timeout: intent `tick` — bila `now ≥ deadline`, giliran otomatis **SKIP**
  (atau membuang kartu terendah kalau sedang membuka ronde).

## Mode relay (tanpa Firebase)

`server/relay.mjs` dipasang sebagai plugin Vite (`configureServer` +
`configurePreviewServer`), jadi tidak ada proses kedua dan satu tunnel cukup.

```
POST /relay/room/:root/:code      { baseRev, value }   → 200 { rev, value } | 409 { rev, value }
GET  /relay/room/:root/:code?since=REV                → { rev, value, presence } | { unchanged: true }
GET  /relay/stream/:root/:code                        → SSE (hanya dipakai di localhost)
POST /relay/presence/:root/:code/:clientId            { online }
GET  /relay/health
```

Kenapa **polling**, bukan SSE: Cloudflare Tunnel menahan respons
`text/event-stream` sampai koneksi ditutup, jadi klien tidak menerima satu pun
event lewat tunnel (terbukti saat uji: `curl` lokal menerima `event: state`,
lewat tunnel kosong). Polling `?since=rev` menjawab `{ unchanged: true }`
(hanya puluhan byte) bila tidak ada perubahan, dan latensinya < 1 detik.

Dua detail yang mudah salah:

1. **Mutator menerima `presence`.** `transact` memanggil mutator dengan
   `{ ...value, presence }`, lalu membuang `presence` sebelum menulis. Tanpa
   ini engine Jengges menganggap semua kursi online (karena `room.presence`
   kosong), sehingga host tidak bisa memulai meja walaupun lawannya jelas
   offline.
2. **Presence tidak pernah masuk `value`.** Kalau ikut tersimpan, data
   presence basi bisa "hidup lagi" setiap kali klien lain menulis state.

Pemilihan mode ada di `realtimeMode()` (`src/services/realtimeService.js`):
Firebase → relay (DEV/PREVIEW tanpa kredensial) → simulasi lokal. Tombol
"Beralih ke Mode Simulasi Lokal" tetap menang atas semuanya lewat
`localStorage['remi-force-local']`.

## Chat meja

`src/banting/useBantingChat.js` memakai `openEphemeralChannel` yang sama dengan
Jengges, dengan `root: 'bantingRooms'` dan nama kanal `banting-table-chats`.
Pesan hidup 5 menit, maks 200 karakter, jeda 2 detik — tidak menyentuh state
meja, jadi tidak ada konflik `rev`.

## Pengujian

`src/__tests__/bantingEngine.test.js` menutup: nilai 2 tertinggi, deteksi semua
kombinasi (termasuk royal flush dan urutan straight Capsa), penolakan kombinasi
tidak sah, aturan menimpa (nilai sama ditolak), lima kartu lintas kategori,
pembagian 52/104 kartu, pemula 3♦, alur play/skip/ronde baru, "skip lalu
keluar ronde (tidak bisa nyusul)", tidak boleh skip saat membuka ronde, pemain habis = menang & sisanya
kalah, timeout saat menimpa (skip) dan saat membuka (buang kartu terendah), dan
`bantingActions`.
