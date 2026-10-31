---
name: REBAM SLU (Remi Bareng Anak Magang)
description: Design system untuk game kartu multiplayer realtime Remi Urut 6 (2-8 pemain) dengan gaya Dark Warm Tongkrongan & Spatial Card Fanning.
dial: ENERGY 2 / RHYTHM 2 / MOTION 2
colors:
  canvas: "#1F1C16"
  canvas-deep: "#131109"
  canvas-dark: "#100E0A"
  canvas-light: "#2B2720"
  panel-glass: "rgba(36, 33, 26, 0.9)"
  hud-glass: "rgba(42, 38, 31, 0.72)"
  btn-surface: "#3B362C"
  btn-surface-hover: "#474033"
  primary: "#2CC597"
  accent-gold: "#F5A623"
  badge-blue: "#2B5CE6"
  card-red: "#DC2626"
  danger: "#D32F2F"
  surface-elevated: "#FFFFFF"
  text-primary: "#F2EFE9"
  text-secondary: "#A39B8B"
  border: "rgba(255, 255, 255, 0.16)"
typography:
  h1:
    fontFamily: "'Rubik', sans-serif"
    fontSize: 3.5rem
    fontWeight: 600
    lineHeight: 1.12
    letterSpacing: -0.03em
  h2:
    fontFamily: "'Rubik', sans-serif"
    fontSize: 2rem
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.02em
  body-md:
    fontFamily: "'Rubik', sans-serif"
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.5
  label-sm:
    fontFamily: "'Rubik', sans-serif"
    fontSize: 0.8125rem
    fontWeight: 500
    letterSpacing: -0.01em
  card-index:
    fontFamily: "'Oswald', sans-serif"
    fontSize: 1.75rem
    fontWeight: 700
    lineHeight: 1.0
    letterSpacing: -0.02em
rounded:
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
  3xl: 64px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.canvas-deep}"
    rounded: "{rounded.lg}"
    minHeight: "{spacing.md}*3"
  button-secondary:
    backgroundColor: "{colors.btn-surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
  playing-card:
    backgroundColor: "{colors.surface-elevated}"
    rounded: "{rounded.lg}"
    boxShadow: "0 20px 30px -10px rgba(0, 0, 0, 0.22)"
  panel-card:
    backgroundColor: "{colors.panel-glass}"
    border: "1px solid {colors.border}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  input:
    backgroundColor: "{colors.canvas-dark}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
---

## Overview
REBAM SLU menggabungkan suasana **Dark Warm Tongkrongan** (kanvas cokelat gelap `#131109` → `#1F1C16`, seperti lampu jendela warung kopi malam hari) dengan **Spatial Card Fanning** yang taktil. Kartu Remi putih berelevasi tinggi jadi satu-satunya permukaan terang, sehingga fokus pemain langsung tertuju pada kartu dan status meja. Aksen emerald `#2CC597` memimpin CTA dan status aktif; amber `#F5A623` disematkan khusus untuk fitur ejekan ("Bumbu Tongkrogen") dan medali juara.

Dokumen ini disinkronkan dengan implementasi terpasang (token di `src/App.css` `:root` + tema Tailwind). Font anotasi `Montserrat` pada file storyboard `design/taunt-ux.figcraft` adalah tulisan kanvas alat desain, bukan bagian dari UI game.

## Colors
- **Primary / CTA (`#2CC597`)**: Emerald dipakai untuk tombol aksi utama ("Buka Meja", "Mulai Kocok Kartu"), tab aktif, indikator giliran, dan status sukses. Teks di atasnya selalu gelap `#131109`.
- **Accent Gold (`#F5A623`)**: Khusus fitur ejekan: tombol Ejek di dock, banner saran kontekstual (`tkfx-suggest`), cincin cooldown, teks onomatope dampak, plus medali juara 1. Satu aksen untuk satu domain fitur agar tetap jadi sorotan.
- **Simbol kartu**: Hitam (`#171717`) untuk ♠/♣ dan `card-red` (`#DC2626`) untuk ♥/♦; merah yang sama dipakai semantik bahaya/keluar meja.
- **Permukaan**: kanvas `#1F1C16` dengan depth radial ke `#131109`; panel kaca gelap `rgba(42, 38, 31, 0.72)` / `rgba(36, 33, 26, 0.9)`; tombol sekunder `#3B362C` (hover `#474033`).
- **Teks**: primer `#F2EFE9`, sekunder/muted `#A39B8B` (kontras AA di atas kanvas gelap).
- **Status**: `badge-blue` (`#2B5CE6`) untuk penanda Pengocok, sage untuk kesiapan, `danger` (`#D32F2F`) untuk error/koneksi.

## Typography
- **Rubik**: seluruh elemen antarmuka (headline, tombol, tab, input, aturan main). *Tight tracking* (`-0.03em`) pada H1 menjaga kesan editorial.
- **Oswald**: eksklusif untuk indeks pojok kartu Remi (`K`, `A`, `6`), nomor kursi, dan kode room (`RBM88`) agar mudah dipindai sekilas.
- Keduanya dimuat via Google Fonts di `index.html`; token `--font-ui` dan `--font-card` di `App.css`.

## Spacing & Layout
- Mengikuti **8px base grid system** dengan ruang kosong yang disengaja di sekeliling meja.
- **Landing Page** satu-satunya halaman *long-scroll*. **Lobby** dan **Ruang Tunggu** adalah layar aplikasi *full-viewport* (`100dvh`).

## Shapes
- **16px (`rounded.lg`)**: kartu Remi, panel, CTA utama (`rounded-2xl` di Tailwind), form panel Lobby.
- **12px (`rounded.md`)**: kontrol sekunder, chip, tab, tombol dock aksi.
- **9999px (`rounded.full`)**: khusus badge status melayang, balon ejekan, dan tombol Kirim pada banner saran. Bukan bentuk default semua tombol.

## Elevation & Depth
- **UI Controls & Panels**: kaca gelap (*glass*) dengan *hairline* `rgba(255, 255, 255, 0.16)`; tidak menumpuk blur di lebih dari dua lapis agar hierarki tetap jelas.
- **Playing Cards**: permukaan terang satu-satunya di meja; *multi-layered spatial shadow* (`0 20px 30px -10px rgba(0,0,0,0.22)`) dengan rotasi bertahap yang melebar saat di-*hover*.

## Components
- **3-Card Remi Fan**: K♠ di kiri, punggung kartu geometris di tengah, dan A♥ di kanan. Saat di-*hover*, kartu melakukan *fan-out* dengan transisi pegas (`framer-motion`), wajib nonaktif otomatis jika `prefers-reduced-motion: reduce` aktif.
- **16-Slot Avatar Picker**: memuat gambar statis `/public/avatars/avatar-01.png` s/d `avatar-16.png` dengan `image-rendering: pixelated`. Satu avatar hanya untuk satu pemain; slot terpakai menampilkan *overlay* gembok SVG dan *disabled state*.
- **Bumbu Tongkrogen (ejekan & lemparan)**: panel chip, balon putih `rounded.full` di atas kursi pengirim, proyektil SVG inline, banner saran kontekstual ber-aksen amber. Spesifikasi gerak lengkap ada di `design/taunt-ux.figcraft`.

## Rules to Never Break
- **Zero Emoji & Zero Icon Font**: seluruh ikon dan simbol digambar *inline SVG* murni, termasuk simbol ♠ ♥ ♦ ♣, ikon barang lempar di panel ejekan, dan proyektil yang terbang (`TauntGlyphs.jsx`). Emoji tidak dipakai di UI mana pun, termasuk di dalam fitur Bumbu Tongkrogen.
- **Zero Marketplace Jargon**: dilarang memunculkan harga, keranjang belanja, koleksi karya seni, atau istilah jual-beli.
- **Strict Asset Constraint**: jangan pernah men-generate logo rumit, foto manusia, atau ilustrasi avatar baru di luar path `/public/avatars/*.png`.
- **Touch Accessibility**: seluruh elemen interaktif wajib memiliki *tap target* minimal `44x44px` (token `--ctl-h: 44px`).
- **Motion Hormat**: semua animasi FX (getar, lemparan, pop-in) wajib lenyap saat `prefers-reduced-motion: reduce`, mengikuti pola blok media query `tongkronganFX.css`.
