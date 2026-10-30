---
name: REBAM SLU (Remi Bareng Anak Magang)
description: Design system untuk game kartu multiplayer realtime Remi Urut 6 (2-8 pemain) dengan gaya Minimalist Editorial & Spatial Card Fanning.
colors:
  primary: "#171717"
  secondary: "#2CC597"
  tertiary: "#2B5CE6"
  badge-sage: "#68B392"
  card-red: "#DC2626"
  background: "#F4F4F2"
  surface: "#EBEBE8"
  surface-elevated: "#FFFFFF"
  text-primary: "#111111"
  text-secondary: "#4A4A4A"
  border: "#E2E2DF"
  success: "#2CC597"
  warning: "#D97706"
  error: "#DC2626"
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
    textColor: "{colors.surface-elevated}"
    rounded: "{rounded.full}"
    padding: "12px 24px"
    minHeight: "44px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.full}"
    padding: "12px 24px"
    minHeight: "44px"
  playing-card:
    backgroundColor: "{colors.surface-elevated}"
    rounded: "{rounded.lg}"
    boxShadow: "0 20px 30px -10px rgba(0, 0, 0, 0.22)"
  panel-card:
    backgroundColor: "{colors.surface-elevated}"
    border: "1px solid {colors.border}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
    minHeight: "48px"
---

## Overview
REBAM SLU menggabungkan estetika **Minimalist Editorial** yang bersih dan lapang dengan **Spatial Card Fanning** yang taktil untuk menghadirkan suasana main kartu Remi tongkrongan yang modern. Kontras antara kanvas *warm alabaster* (`#F4F4F2`) yang tenang dengan barisan kartu Remi berelevasi tinggi membuat fokus pemain langsung tertuju pada kartu dan status meja.

## Colors
- **Primary (`#171717`)**: Digunakan khusus untuk CTA utama ("Buka Meja", "Mulai Kocok Kartu"), tab aktif, dan simbol kartu Hitam (♠/♣).
- **Secondary (`#2CC597`)**: Aksen *mint green* untuk indikator aktif, status sukses, dan ornamen geometris punggung kartu.
- **Floating Badges (`#2B5CE6` & `#68B392`)**: Royal blue khusus untuk penanda host ("Pengocok") dan sage green untuk status kesiapan pemain ("SIAP").
- **Card Red (`#DC2626`)**: Warna simbol kartu Merah (♥/♦) sekaligus warna semantik *error* validasi form dan tombol keluar meja.

## Typography
- **Rubik**: Digunakan untuk seluruh elemen antarmuka (headline, tombol, tab, input, dan aturan main). *Tight tracking* (`-0.03em`) pada H1 menjaga kesan *editorial* seperti gambar referensi.
- **Oswald**: Digunakan secara eksklusif untuk indeks pojok kartu Remi (`K`, `A`, `6`), nomor kursi (`1`–`8`), dan kode room (`RBM88`) agar mudah dipindai sekilas.

## Spacing & Layout
- Mengikuti **8px base grid system** dengan ruang kosong (*whitespace*) >55% pada area kanvas.
- Hanya **Landing Page** yang menggunakan *long-scroll*. **Lobby** dan **Ruang Tunggu** adalah layar aplikasi *full-viewport* (`100dvh`).

## Shapes
- **16px (`rounded.lg`)**: Standar sudut untuk kartu Remi, form panel Lobby, dan kartu kursi pemain.
- **9999px (`rounded.full`)**: Wajib digunakan untuk seluruh tombol CTA, *tab switcher*, *feature chips*, dan *floating speech-bubble badges*.

## Elevation & Depth
- **UI Controls & Panels**: *Flat* atau menggunakan *hairline border* `1px solid #E2E2DF` untuk menjaga kebersihan visual.
- **Playing Cards**: Menggunakan *multi-layered spatial shadow* (`0 20px 30px -10px rgba(0,0,0,0.22)`) dengan rotasi bertahap (`-10deg`, `0deg`, `+10deg`) yang melebar saat di-*hover*.

## Components
- **3-Card Remi Fan**: K♠ di kiri, punggung kartu geometris di tengah, dan A♥ di kanan. Saat di-*hover*, kartu melakukan *fan-out* dengan transisi pegas (`framer-motion`), namun wajib nonaktif otomatis jika `prefers-reduced-motion: reduce` aktif.
- **16-Slot Avatar Picker**: Memuat gambar statis `/public/avatars/avatar-01.png` s/d `avatar-16.png` dengan `image-rendering: pixelated`. Satu avatar hanya untuk satu pemain; slot yang sudah dipakai menampilkan *overlay* gembok SVG dan *disabled state*.

## Rules to Never Break
- **Zero Emoji & Zero Icon Font**: Dilarang keras memakai karakter emoji atau library font ikon; wajib *inline SVG* murni (termasuk simbol ♠ ♥ ♦ ♣).
- **Zero Marketplace Jargon**: Dilarang memunculkan harga, keranjang belanja, koleksi karya seni, atau istilah jual-beli.
- **Strict Asset Constraint**: Jangan pernah men-generate logo rumit, foto manusia, atau ilustrasi avatar baru di luar path `/public/avatars/*.png`.
- **Touch Accessibility**: Seluruh elemen interaktif wajib memiliki *tap target* minimal `44x44px`.