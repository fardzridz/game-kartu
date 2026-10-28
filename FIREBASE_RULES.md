# Aturan keamanan Realtime Database

Saat ini database terbuka (`read/write: true`). Artinya **siapa pun yang tahu kode meja bisa menulis apa saja**, termasuk mengubah status presence orang lain. Ini yang membuat status "online" bisa dipalsukan.

Kamu tidak perlu ini untuk main santai, tapi kalau mau "aman seperti game online", ini langkahnya.

## Cara pasang

1. Buka **Firebase Console → project kamu → Realtime Database → tab Rules**.
2. Buka tab **JSON** (bukan Editor baris-per-baris).
3. Copy isi `firebase.rules.json` di folder ini, tempel menggantikan seluruh isinya.
4. Klik **Publish**.
5. Uji: buat meja, biarkan dua tab terbuka, matikan internet satu tab. Status harus berubah menjadi "terputus" dalam ±45 detik.

Kalau salah dan semuanya jadi terblokir, kembalikan dengan aturan cepat:

```json
{ "rules": { ".read": true, ".write": true } }
```

## Isi aturannya

| Path | Aturan |
|---|---|
| `rooms/$code` | Baca bebas. Tulis hanya jika objek meja tetap utuh (`code`, `hostId`, `seats`, `status`, `rev`) dan `status` hanya `lobby` / `playing` / `round-end`. |
| `rooms/$code/presence/$client` | Baca bebas. Tulis hanya data presence yang bentuknya benar: `online` boolean, `lastSeen` angka, dan tidak ada field asing. |
| `rooms/$code/seats/$index` | Nama kursi wajib string maksimal 18 karakter (sama dengan batas di UI). |

## Batas yang jujur

Tanpa **Firebase Auth**, aturan di atas tidak bisa membedakan pemilik data. Artinya:

- Pemain lain masih bisa menulis presence milik orang **lain** selama bentuk datanya benar.
- Mereka tidak bisa menyisipkan field aneh, mengubah nama jadi kepanjangan, atau merusak struktur meja.

Kalau mau benar-benar mengunci per pemain, perlu **Anonymous Auth**:

1. Firebase Console → **Authentication → Sign-in method → Anonymous → Enable**.
2. Di kode, `signInAnonymously()` sebelum `createRealtimeService()`, lalu presence ditulis dengan kunci `auth.uid`.
3. Aturan presence jadi: `.write": "auth != null && auth.uid === $client"`.

Itu perubahan kode yang cukup besar (identitas kursi harus ikut `uid`), jadi jangan dipasang setengah-setengah. Kabari kalau mau aku kerjakan sekalian.
