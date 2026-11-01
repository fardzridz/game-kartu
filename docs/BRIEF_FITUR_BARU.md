# BRIEF FITUR BARU — Chat Ruang Tunggu, Push-to-Talk, Wake Lock, Hemat Data, Voice Reaction

> Dokumen ini adalah spesifikasi kerja untuk agent yang mengerjakan.
> Baseline project: **176 test / 11 file lulus** (`npm run test`).
> Jumlah test tidak boleh turun. Jangan pernah melemahkan test agar lulus.

---

## 0. Aturan Wajib Sebelum Mulai

### Yang TIDAK BOLEH disentuh

1. **`src/engine/`** — `gameRules.js`, `roomEngine.js`, `botAI.js`. Ada 176 test yang mengunci perilakunya. Kalau menurut Anda perlu perubahan di sana, **laporkan dulu, jangan ubah sendiri.**
2. **`src/components/TauntThrowSystem.jsx`** — 99 referensi + 2 file test. Jangan diubah. Kalau ingin memakai polanya, **salin polanya ke modul baru**, jangan refactor file ini.
3. Test yang sudah ada. Jangan dihapus, jangan dilemahkan.

### Yang WAJIB dilakukan

1. Jalankan `npm run test` sebelum dan sesudah setiap task. Laporkan angka nyata.
2. Jalankan `npm run lint` dan `npm run build`.
3. Setiap kali `public/sw.js` berubah → **naikkan `CACHE_VERSION`** (sekarang `'v1'`). Kalau lupa, service worker lama tetap dipakai dan perubahan tidak akan pernah muncul di browser. Ini penyebab nomor satu "sudah diubah tapi tidak berubah".
4. Ikuti gaya kode yang sudah ada: komentar bahasa Indonesia, JSDoc pada fungsi publik, tanpa `any` (project ini JS, tapi jaga tipe tetap jelas).
5. Fungsi murni dipisah dari efek samping supaya bisa dites tanpa DOM.

### Urutan pengerjaan (jangan dilompati)

| # | Task | Risiko | Sentuh engine? |
|---|---|---|---|
| 0 | Perbaiki bypass font di `sw.js` | Nol | Tidak |
| 1 | Wake Lock | Nol | Tidak |
| 2 | Hemat data | Nol | Tidak |
| 3 | Chat ruang tunggu | Rendah | Tidak |
| 4 | **Push-to-Talk** | Sedang–tinggi | Tidak |
| 5 | Voice reaction | Rendah | Tidak |

**Chat dikerjakan sebelum PTT, bukan karena lebih penting.** Keduanya butuh hal yang sama: node RTDB baru, rules baru, modul channel, UI di dua halaman. Bedanya chat ~100 byte, PTT ~40 KB + audio. Kalau PTT dikerjakan duluan dan arsitekturnya salah, Anda akan mendebug Firebase rules, MediaRecorder, dan autoplay sekaligus. Chat dulu = gladi bersih.

---

## 1. Pola Arsitektur Wajib: Channel Ephemeral

**Baca `src/components/TauntThrowSystem.jsx` baris 177–235 sebelum menulis apa pun.** Di sana sudah ada pola yang terbukti dan harus ditiru.

```js
function openTauntChannel({ roomCode, selfClientId, onEvent }) {
  if (roomCode && firebaseActive()) {
    // Firebase RTDB: rooms/{code}/taunts
    // + filter riwayat lama: if ((value.ts || 0) < bootTs - 2000) return;
    // + self-cleanup: setTimeout(() => remove(node), 20000)
  }
  // Fallback: BroadcastChannel('remi-taunts') untuk mode lokal
}
```

Sifat yang harus ditiru:

1. **Mandiri** — tidak menyentuh transaksi state room utama. Tidak ada risiko konflik `rev`.
2. **Dual-mode** — Firebase RTDB saat online, BroadcastChannel saat mode simulasi lokal.
3. **Filter riwayat lama** — mencegah event lama meledak ulang saat klien baru join / reconnect.
4. **Self-cleanup** — pengirim menghapus jejaknya sendiri setelah beberapa detik.

### File baru: `src/services/ephemeralChannel.js`

Buat modul generik ini karena akan dipakai **dua kali nyata** (chat + PTT). Ini bukan over-engineering — abstraksi baru sah dibuat setelah ada dua pemakaian.

```js
/**
 * Kanal pesan singkat antar pemain dalam satu meja.
 * Firebase RTDB saat online, BroadcastChannel saat mode lokal.
 * Tidak pernah menyentuh transaksi state room utama.
 *
 * @param {object} options
 * @param {string|null} options.roomCode
 * @param {string} options.nodeName   - nama node di bawah rooms/{code}, mis. 'chats'
 * @param {string} options.channelName - nama BroadcastChannel, mis. 'remi-chats'
 * @param {string} options.selfClientId
 * @param {number} [options.staleMs]  - abaikan pesan lebih tua dari ini
 * @param {number} [options.retainMs] - hapus pesan sendiri setelah ini
 * @param {(payload: object) => void} options.onEvent
 * @returns {{ send: (payload: object) => void, close: () => void }}
 */
export function openEphemeralChannel({ ... }) { ... }
```

**Penting:** untuk `ts`, gunakan `serverNow()` dari `src/services/realtimeService.js` (baris 77), **bukan `Date.now()` mentah**. HP pemain punya jam yang berbeda-beda; tanpa koreksi ini filter pesan basi akan salah.

**Jangan migrasikan `TauntThrowSystem` ke modul ini.** Biarkan apa adanya. Catat sebagai utang teknis di komentar kalau perlu.

---

## 2. Task 0 — Perbaiki Bypass Font di Service Worker

### Bug

`public/sw.js`:

```js
const BYPASS_HOSTS = ['firebaseio.com', 'firebasedatabase.app', 'googleapis.com'];
```

`index.html` memuat font dari `fonts.googleapis.com`. Karena `fonts.googleapis.com` berakhiran `.googleapis.com`, host itu **ikut ter-bypass** → CSS font tidak pernah dicache. Akibatnya saat offline, font hilang dan tampilan jatuh ke font sistem. Ironisnya `fonts.gstatic.com` (file font aslinya) **tidak** ter-bypass, jadi file-nya ada di cache tapi CSS-nya tidak.

### Perbaikan yang diminta

**Self-host font.** Ini sekaligus menyelesaikan masalah cache, hemat data, dan privasi (tidak ada request ke Google).

Langkah:

1. Unduh `Rubik` (400,500,600,700,800) dan `Oswald` (600,700) dalam format `.woff2`.
2. Simpan di `public/fonts/`.
3. Buat `public/fonts/fonts.css` dengan `@font-face` + `font-display: swap`.
4. Di `index.html`: hapus tiga baris `<link>` Google Fonts (`preconnect` ×2 + `stylesheet`), ganti dengan satu `<link rel="stylesheet" href="/fonts/fonts.css">`.
5. Naikkan `CACHE_VERSION` di `sw.js` ke `'v2'`.
6. Tambahkan `/fonts/fonts.css` ke `PRECACHE_URLS`.

**Kalau tidak memungkinkan mengunduh file font** (tidak ada akses jaringan): perbaiki `BYPASS_HOSTS` agar spesifik ke Firebase saja, dan tambahkan `fonts.googleapis.com` + `fonts.gstatic.com` ke `PRECACHE_URLS`. Laporkan pilihan mana yang diambil dan alasannya.

### Acceptance

- [ ] Offline (DevTools → Network → Offline) → font tetap tampil, tidak jatuh ke font sistem
- [ ] Tidak ada request ke `fonts.googleapis.com` di tab Network
- [ ] `npm run build` lulus
- [ ] `CACHE_VERSION` sudah naik

---

## 3. Task 1 — Wake Lock

### Tujuan

Layar HP tidak mati saat pemain sedang berpikir di gilirannya.

### File

- **Baru:** `src/hooks/useWakeLock.js`
- **Baru:** `src/__tests__/useWakeLock.test.js`
- **Disentuh:** `src/components/GameBoard.jsx`

### API

```js
useWakeLock(active: boolean): void
```

### Langkah

1. Feature-detect: `if (!('wakeLock' in navigator)) return;` — **diam saja**, jangan tampilkan apa pun ke pengguna.
2. Saat `active === true` → `navigator.wakeLock.request('screen')`.
3. Saat `active === false` atau unmount → `sentinel.release()`.
4. **WAJIB: ambil ulang lock saat `visibilitychange` menjadi `visible`.** Lock otomatis hilang saat pemain pindah app. Kalau tidak ditangani, fitur ini hanya bekerja sekali. Ini bug klasik.
5. Bungkus `request()` dengan `try/catch` — browser menolak kalau tab tidak aktif atau baterai lemah. Jangan crash.
6. Tangani `sentinel.onrelease` supaya state internal konsisten.

### Integrasi di GameBoard

Aktifkan hanya saat **giliran pemain lokal**. Cari sumber kebenaran giliran yang sudah ada di `GameBoard.jsx` (state turn / fase). Jangan buat deteksi baru.

### Yang DILARANG

Jangan pakai trik "putar video kosong" untuk iOS < 16.4. Itu menghabiskan lebih banyak baterai daripada masalah yang diselesaikan. Kalau tidak didukung, biarkan.

### Acceptance

- [ ] Giliran pemain → layar tidak mati
- [ ] Pindah app lalu kembali → lock diambil ulang
- [ ] Giliran lawan → lock dilepas (hemat baterai)
- [ ] Browser tanpa dukungan → tidak error, tidak ada UI aneh
- [ ] Test: mock `navigator.wakeLock`, verifikasi `request`/`release` dipanggil benar + re-acquire saat visible

---

## 4. Task 2 — Hemat Data

### Tujuan

Hormati preferensi penghematan data pengguna.

### File

- **Baru:** `src/utils/dataSaver.js`
- **Baru:** `src/__tests__/dataSaver.test.js`
- **Disentuh:** `src/sound/music.js`, `src/utils/preloadAssets.js`, `src/components/GameBoard.jsx`

### API

```js
isDataSaverActive(): boolean
connectionQuality(): 'offline' | 'slow' | 'ok' | 'unknown'
subscribeConnectionChange(cb): () => void
```

### Langkah

1. Deteksi `navigator.connection?.saveData === true` dan `effectiveType` (`slow-2g` | `2g` | `3g`).
2. Saat aktif:
   - **Jangan** mulai musik latar (`startMusic` di `music.js` baris 297)
   - Lewati preload aset berat di `preloadAssets.js`
   - Kurangi animasi berat
3. **JANGAN matikan SFX.** Itu bagian dari permainan dan ukurannya kecil.
4. Tampilkan indikator kecil "Mode hemat data" supaya pemain tahu kenapa musiknya hilang. Jangan diam-diam.

### Jebakan

`navigator.connection` **tidak ada di Firefox dan Safari**. Wajib optional chaining + fallback aman. Jangan sampai crash di browser yang tidak mendukung.

### Acceptance

- [ ] Simulasikan `saveData: true` → musik tidak diputar, preload dilewati, indikator muncul
- [ ] Browser tanpa `navigator.connection` → jalan normal, tidak error
- [ ] SFX tetap berbunyi
- [ ] Test: mock `navigator.connection` untuk tiga kasus (tidak ada, saveData true, saveData false)

---

## 5. Task 3 — Chat Ruang Tunggu

### Tujuan

Komunikasi teks **di ruang tunggu saja**.

### ⚠️ Batasan Produk yang Tidak Boleh Dilanggar

**Chat teks TIDAK dipasang di meja main (`GameBoard`).**

Alasannya konkret: layar HP 360×640, keyboard muncul menutupi 40–50% layar, timer 45 detik tetap jalan, pemain kehilangan pandangan ke meja lalu kehabisan waktu dan bot mengambil alih. Di meja main sudah ada **TauntThrowSystem** (10 kalimat kontekstual + 4 barang lemparan + saran otomatis) yang menyelesaikan kebutuhan komunikasi dengan lebih baik karena tidak perlu mengetik.

Kalau agent merasa perlu menambahkan chat di meja main, **laporkan sebagai usulan, jangan implementasikan sendiri.**

### File

- **Baru:** `src/utils/chatFilter.js` — fungsi murni
- **Baru:** `src/components/RoomChat.jsx`
- **Baru:** `src/__tests__/chatFilter.test.js`
- **Baru:** `src/__tests__/ephemeralChannel.test.js`
- **Disentuh:** `firebase.rules.json`, `src/components/RoomLobby.jsx`

### Rules Firebase

Ikuti pola node `taunts` yang sudah ada. **Jangan taruh chat di level room** — validasi room-level akan menolaknya karena node chat tidak punya `code/hostId/seats/status/rev`.

```json
"chats": {
  ".read": true,
  "$eventId": {
    ".write": "newData.exists()",
    ".validate": "newData.hasChildren(['from','name','text','ts']) && newData.child('text').isString() && newData.child('text').val().length <= 200 && newData.child('ts').isNumber() && newData.child('name').isString() && newData.child('name').val().length <= 18"
  }
}
```

**Batas 200 karakter di rules itu wajib**, bukan formalitas. Tanpa itu siapa pun bisa menulis teks sepanjang apa pun dan menghabiskan kuota.

### Transport

Gunakan `openEphemeralChannel` dari Task 1 (pola arsitektur):

- `nodeName: 'chats'`, `channelName: 'remi-chats'`
- `staleMs: 30000`, `retainMs: 30000`
- Kirim: `{ from, name, text, ts }`

### `chatFilter.js` — fungsi murni, tanpa I/O

```js
export function normalizeForFilter(text: string): string
export function containsProfanity(text: string): boolean
export function sanitizeChatText(text: string): { text: string, blocked: boolean }
```

Normalisasi: lowercase → ubah `4→a, 0→o, 1→i, 3→e, 5→s, 7→t` → hapus simbol berulang → hapus spasi berlebih.

Daftar kata: buat sendiri, kecil dan jujur (~30–50 kata kasar Indonesia + singkatan umum). **Jangan mengklaim akurasi sempurna** — beri komentar di file bahwa ini filter sederhana berbasis daftar, bukan AI, dan bisa dilewati.

### Retensi

- Simpan 30 detik. Host membersihkan entri lebih tua dari 30 detik tiap 10 detik.
- **Satu klien saja (host)** yang membersihkan, jangan semua — supaya tidak ada tabrakan hapus.
- **Jangan simpan chat ke localStorage.** Itu data orang lain di device pengguna.

### UI

- Panel chat di `RoomLobby.jsx`. Bisa collapsible.
- Tampilkan ~20 pesan terakhir, auto-scroll ke bawah.
- Rate limit klien: **1 pesan / 2 detik**. Tampilkan sisa waktu cooldown.
- Batas panjang di klien juga: 200 karakter, dengan counter.
- **Render sebagai teks murni.** JANGAN PERNAH `dangerouslySetInnerHTML`. React sudah escape default — jangan diakali.
- Tampilkan nama + avatar pengirim.
- Empty state: "Belum ada obrolan. Sapa temanmu!"
- Error state: kalau kirim gagal, tampilkan pesan ramah, jangan hilangkan teks yang sudah diketik.

### Acceptance

- [ ] Dua tab/browser bisa saling kirim chat
- [ ] Pesan > 200 karakter ditolak (klien + rules)
- [ ] Reconnect / buka app baru → **tidak** menampilkan chat lama beruntun
- [ ] Rate limit bekerja: kirim cepat 3× → hanya 1 yang lolos
- [ ] Input `<script>alert(1)</script>` tampil sebagai teks, bukan dieksekusi
- [ ] Chat tidak muncul di `GameBoard`
- [ ] Test: `chatFilter` (normalisasi, bypass ejaan `b4ngs4t`, teks bersih) + `ephemeralChannel` (filter stale, cleanup)

---

## 6. Task 4 — Push-to-Talk (Tahan → Bicara → Lepas → Semua Dengar)

### Konsep

Bukan voice note, bukan voice call. Ini **walkie-talkie**: tahan tombol mikrofon → bicara → lepas → **otomatis terkirim** → **semua pemain langsung mendengar tanpa menekan apa pun**.

### Yang WAJIB dipahami lebih dulu

**Ini bukan realtime streaming.** Rekam dulu (~2 detik) → kirim → putar. Yang membuatnya terasa realtime hanya jeda yang kecil. Estimasi total latensi **300–800 ms** — cukup untuk "Waduh!" dan tidak terasa lambat.

Konsekuensi: **tidak butuh WebRTC, tidak butuh TURN server, tidak butuh SFU.** Jangan menambahkan dependensi media apa pun.

### Fondasi audio SUDAH ADA — jangan bangun ulang

`src/sound/soundFX.js` sudah menyiapkan semua yang dibutuhkan:

| Yang sudah ada | Baris |
|---|---|
| `unlocked` flag | 43 |
| `bindUnlock()` — unlock AudioContext untuk iOS/Safari | 109–113 |
| `audioContext()` — singleton AudioContext | 128 |
| `sfxBus` | 36, 146 |
| `musicBus` | 37, 156 |
| **`duck`** — gain node penurun volume musik | 38, 162 |
| `getMusicOutput()` | 171 |
| `musicAudioContext` | 176 |

**JANGAN membuat `AudioContext` baru.** Pakai `audioContext()` yang sudah ada. Ini bukan preferensi — `AudioContext` ganda menyebabkan masalah autoplay dan pemborosan.

**Tambahkan `pttBus` yang masuk ke node `duck` yang sudah ada:**

```
pttBus → duck → master
```

Efeknya: musik otomatis mengecil saat ada yang bicara, lalu naik lagi. Tanpa ini, suara pemain bertabrakan dengan musik latar.

### File

- **Baru:** `src/hooks/usePTT.js` — perekam + state
- **Baru:** `src/components/PTTButton.jsx` — tombol tahan + waveform
- **Baru:** `src/components/PTTIndicator.jsx` — indikator "🔴 {nama} sedang bicara"
- **Baru:** `src/__tests__/pttService.test.js`
- **Disentuh:** `src/App.jsx`, `src/sound/soundFX.js`, `src/components/RoomLobby.jsx`, `src/components/GameBoard.jsx`, `firebase.rules.json`

### ⚠️ Mount di `App.jsx`, BUKAN di halaman

Ini keputusan arsitektur yang mahal kalau diubah belakangan.

Saat host menekan MULAI, `RoomLobby` **unmount** dan `GameBoard` mount. Kalau PTT di-mount di dalam salah satunya:

- `MediaRecorder` mati di tengah rekaman → audio hilang
- Listener Firebase terputus → ada suara yang tidak terdengar
- Status mute ter-reset setiap pindah halaman

`App.jsx` sudah punya semua yang dibutuhkan: `service`, `room`, `viewerId` (state di sekitar baris 134–141).

Render ke dua halaman lewat **React Portal** — pola `fabPortalId` yang sudah dipakai `TauntThrowSystem` (`GameBoard.jsx` baris 1868 + slot `id="taunt-dock-slot"` di baris 1790). Tiru pola itu, jangan bikin mekanisme baru.

### Rules Firebase — DUA node, sengaja dipisah

```json
"pttLive": {
  ".read": true,
  ".write": true,
  ".validate": "!newData.exists() || (newData.hasChildren(['from','ts','dur']) && newData.child('ts').isNumber() && newData.child('dur').isNumber())"
},
"ptt": {
  ".read": true,
  "$eventId": {
    ".write": "newData.exists()",
    ".validate": "newData.hasChildren(['from','ts','dur','mime','data']) && newData.child('data').isString() && newData.child('data').val().length <= 60000 && newData.child('dur').val() <= 15000 && newData.child('ts').isNumber()"
  }
}
```

**Batas `data` ≤ 60000 karakter WAJIB.** Tanpa itu siapa pun bisa menulis 10 MB dan menghabiskan kuota semua orang di meja.

`pttLive` kecil (beberapa byte) → untuk indikator "sedang bicara" + mutex.
`ptt` besar (~40 KB base64) → untuk audionya.

### Alur

```
[Tahan tombol]
  → runTransaction pada pttLive:
       kosong, ATAU sudah kedaluwarsa (ts + dur + 3000 < now)?
         YA    → kunci untuk saya, MediaRecorder.start()
         TIDAK → batalkan transaksi, toast "Tunggu, {nama} sedang bicara"
  → UI: waveform berjalan + timer durasi + "🔴 kamu bicara"

[Bicara...]

[Lepas]
  → MediaRecorder.stop() → Blob
  → base64 → tulis ke /ptt/{eventId}
  → hapus pttLive
  → TIDAK diputar ke pengirim sendiri

[Pendengar]
  → onChildAdded pada /ptt
  → ts masih < 5000 ms? kalau lebih tua → ABAIKAN
  → atob → decodeAudioData → putar lewat pttBus
  → avatar pembicara berdenyut
```

### Tujuh jebakan yang WAJIB ditangani

| # | Jebakan | Penanganan |
|---|---|---|
| 1 | `child_added` memutar audio lama saat reconnect / join baru | **Filter `ts` < 5 detik.** Pakai `serverNow()`, **bukan `Date.now()`** — HP pemain beda jam |
| 2 | Balapan hapus: pendengar lambat tidak pernah dengar | Simpan 30 detik, host bersihkan tiap 10 detik. **Jangan hapus segera setelah diputar** |
| 3 | `touchcancel` / jari geser sedikit → mic nyangkut merekam terus | Handle `touchend`, `touchcancel`, `blur`, `visibilitychange` |
| 4 | Format audio beda per browser | Safari `audio/mp4`, Chrome `audio/webm`. Cek `MediaRecorder.isTypeSupported()`. **JANGAN user-agent.** Kalau dua-duanya tidak didukung → **sembunyikan tombol** |
| 5 | Mutex bocor kalau pemain crash saat menahan | `pttLive` dianggap kedaluwarsa kalau `ts + dur + 3000 < now` |
| 6 | Autoplay diblokir browser | Wajib lewat Web Audio API (`decodeAudioData` + `AudioBufferSourceNode`). **JANGAN `<audio src>`** |
| 7 | Audio tumpang tindih | Mutex sudah mencegah, tapi tetap antrekan pemutaran. Play baru → pause yang lain |

### Aturan produk

| Aturan | Nilai |
|---|---|
| Durasi maks | **10 detik** di meja main, **15 detik** di ruang tunggu |
| Cara | Tahan → bicara → lepas. **Geser ke atas = batal kirim** |
| Pembicara | **Satu saja** (mutex server-side via transaction) |
| Disimpan | Tidak. Hapus setelah 30 detik |
| Diputar ke pengirim | **Tidak** — bikin bingung |
| Mute | Per pemain + global |
| Bisa dimatikan total | Ya, dari pengaturan → tombolnya hilang sama sekali |
| Timer giliran | **JANGAN di-pause** saat bicara. Itu celah curang |
| Izin mikrofon | Minta sekali di awal, simpan hasilnya. Jangan minta tiap kali tahan |

### UI

**Ruang Tunggu:** tombol di tengah bawah, santai, tidak ada yang menghalangi.

**Meja Main:** **JAUH dari kartu tangan** dan **jauh dari tombol Turunkan/Buang**. Kalau kena saat orang mau buang kartu → malah merekam suara. Saran: sudut kanan bawah, di atas baris tombol aksi, area tekan terpisah jelas.

**Umum:**
- Zona sentuh minimal 44px (sudah standar project).
- `touch-action: none` pada tombol tahan supaya tidak memicu scroll/zoom.
- Umpan balik haptic saat mulai dan berhenti merekam (`src/utils/haptics.js` sudah ada).
- Indikator "🔴 {nama} sedang bicara" di kedua halaman.
- Toast jelas kalau ditolak: "Tunggu, {nama} sedang bicara".

### Acceptance

- [ ] Dua device: A tahan → B mendengar **otomatis tanpa klik**
- [ ] A dan B tahan bersamaan → hanya satu yang dapat, yang lain dapat toast
- [ ] Reconnect saat ada audio baru → **tidak** memutar audio lama
- [ ] Geser jari ke atas lalu lepas → tidak ada yang terkirim, mic berhenti
- [ ] Timer giliran tetap jalan selama bicara
- [ ] Musik latar mengecil saat ada yang bicara (node `duck`)
- [ ] Browser tanpa `MediaRecorder` → tombol tidak muncul, tidak error
- [ ] Mode lokal (tanpa Firebase) → PTT tetap jalan via BroadcastChannel
- [ ] Test: `pttService` — encode/decode base64, filter `ts`, kedaluwarsa mutex, tolak payload > 60000

---

## 7. Task 5 — Voice Reaction

### Tujuan

Klip pendek siap pakai: "Mantap!", "Waduh!", "Hahaha", "Mati Sampah!". Sekali tekan, semua dengar.

Ini **bukan** rekaman pemain — aset tetap. Risiko moderasi nol, biaya nyaris nol.

### Kenapa dikerjakan setelah PTT

Karena Task 4 sudah membangun `pttBus`, jalur `decodeAudioData`, dan integrasi `duck`. Task ini **menumpang** dan jauh lebih kecil dari perkiraan.

### File

- **Baru:** `src/utils/voiceReactions.js` — katalog
- **Baru:** `src/components/VoiceReactionBar.jsx`
- **Disentuh:** `src/components/GameBoard.jsx`, `src/sound/soundFX.js`

### Langkah

1. Klip audio pendek (~1–2 detik, mono, Opus ~15 KB) di `public/voices/`.
2. **Aset harus direkam sendiri atau berlisensi jelas.** JANGAN ambil dari game lain. Catat sumber lisensi di komentar file.
3. Putar lewat `pttBus` (bukan `sfxBus`) supaya musik ikut mengecil.
4. Kirim event lewat node `taunts` yang **sudah ada** — tidak perlu rules baru. Payload: `{ type: 'voice', id, ts, from }`.
5. Rate limit: 1 per 3 detik.
6. Preload klip saat idle, tapi **lewati kalau mode hemat data aktif**.

### Acceptance

- [ ] Tekan tombol → semua pemain dengar, musik mengecil
- [ ] Rate limit bekerja
- [ ] Mode hemat data → tidak preload, tapi tetap bisa diputar saat ditekan
- [ ] Tidak ada request ke domain luar

---

## 8. Format Laporan yang Diminta

Setelah setiap task, laporkan **singkat dan faktual**:

```
TASK: <nomor dan nama>
Status: SELESAI / SEBAGIAN / GAGAL

Yang berubah (file kunci):
- ...

Bukti:
- npm run test → <angka nyata, mis. 184 lulus / 12 file>
- npm run lint → <hasil>
- npm run build → <hasil>

Keputusan & asumsi:
- ...

Risiko / sisa masalah:
- ...

Langkah berikutnya:
- ...
```

**Kalau ada yang belum diuji atau gagal, tulis di baris pertama.** Jangan mengklaim sudah dites padahal belum dijalankan. Jangan memalsukan hasil test.

---

## 9. Pemeriksaan Sebelum Menyatakan Selesai

Jawab jujur. Kalau ada satu "tidak", kerjakan dulu:

- [ ] Semua task yang diminta sudah ada dan berjalan?
- [ ] `npm run test` lulus dan jumlahnya **≥ 176**?
- [ ] `npm run lint` dan `npm run build` bersih?
- [ ] Sudah dicoba sendiri di viewport HP 360×640, bukan hanya desktop?
- [ ] Sudah dicoba dengan 2 tab / 2 device sungguhan?
- [ ] `src/engine/` tidak tersentuh?
- [ ] `TauntThrowSystem.jsx` tidak tersentuh?
- [ ] `CACHE_VERSION` sudah naik kalau `sw.js` berubah?
- [ ] Tidak ada `dangerouslySetInnerHTML`?
- [ ] Tidak ada secret / data pribadi di kode atau log?
- [ ] Chat tidak muncul di `GameBoard`?

---

## 10. Catatan Terbuka (Bukan Tugas Agent)

`firebase.rules.json` punya `".read": true` di level `/rooms/$code`. Artinya siapa pun yang tahu kode meja bisa membaca seluruh isi node room.

Untuk main bareng teman risikonya kecil. Tapi sebelum fitur ini ditambah isinya, **pemilik project perlu memeriksa** apakah kartu tangan pemain tersimpan di node itu (perlu baca `src/engine/roomEngine.js`). Kalau iya, itu celah curang nyata untuk meja publik.

**Jangan ubah rules ini tanpa instruksi pemilik project.**
