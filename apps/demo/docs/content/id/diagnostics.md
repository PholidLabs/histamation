---
title: Diagnostik
description: Arti kode error, warning, dan info dari engine, cara membaca path-nya, dan di mana kode itu muncul.
group: reference
order: 2
---

## Apa itu diagnostik {#overview}

Memuat sebuah berkas kampanye menjalankan dua lapis pemeriksaan: validasi struktural terhadap JSON Schema (kode `S001`, hanya muncul bila `ajv` terpasang) dan validasi semantik di loader engine, yang diperlakukan sebagai normatif oleh [contract](contract.md) ([§8](contract.md#sec-8)). Setiap temuan adalah catatan kecil yang stabil:

```ts
interface Diagnostic { level: 'error' | 'warning' | 'info'; code: string; path: string; message: string }
```

`code` mengidentifikasi aturan yang dilanggar — cari di halaman ini. `path` menunjukkan persis di mana dalam berkas hal itu terjadi.

## Tiga tingkat {#levels}

- **error** menolak berkas. Loader mengembalikan kampanye `null`, dan tidak ada yang diputar sampai setiap error diperbaiki.
- **warning** menandai sesuatu yang kemungkinan salah — koordinat yang tertukar, bab tanpa camera — tanpa menolak berkasnya.
- **info** mencatat pilihan yang memang disengaja, misalnya peristiwa tanpa lokasi di peta.

Hanya `error` yang menghentikan pemutaran: error menolak berkas dan menampilkan diagnostiknya, sementara warning dan info tetap membuat berkas termuat normal dan datanya tersedia untuk alat authoring.

## Membaca sebuah path {#paths}

`path` adalah JSON Pointer ke dalam berkas kampanye: segmen digabung dengan `/`, dengan karakter `~` atau `/` di dalam sebuah ID di-escape menjadi `~0` dan `~1`. Array diindeks mulai dari `0`. Misalnya, `when` yang salah pada waypoint ketiga dari track entitas keempat dilaporkan pada:

```text
/entities/3/track/2/when
```

Buka berkasnya, hitung dari nol, dan Anda langsung berada di field yang dimaksud pesan itu.

## Di mana diagnostik muncul {#where}

- `histamation-check` mencetak setiap diagnostik untuk tiap berkas yang Anda berikan. Lihat [CLI](cli.md) untuk daftar flag-nya.
- Aplikasi peta di [`/app/`](/app/) menampilkan notifikasi yang bisa ditutup, berisi diagnostik bertingkat error, saat berkas yang dijatuhkan gagal dimuat. Berkas yang termuat dengan warning atau info tetap bisa diputar; panel "About"-nya mendaftar setiap diagnostik (level, code, path, message) beserta jumlah per tingkat.
- [validator](validator.md) menampilkan semua tingkat sambil Anda mengedit, tanpa perlu menjatuhkan berkas ke aplikasi peta lebih dulu.

## `--strict` {#strict-mode}

Secara default, `histamation-check` keluar dengan kode bukan-nol hanya bila sebuah berkas punya error. Tambahkan `--strict` dan ia juga keluar dengan kode bukan-nol bila berkas punya warning apa pun — berguna begitu sebuah kampanye sudah bersih dari warning dan Anda ingin CI menjaganya tetap begitu. `--strict` tidak mengubah apa yang diterima loader: berkas yang hanya punya warning tetap termuat dan bisa diputar baik dengan maupun tanpa flag ini; flag itu hanya mengubah kode keluar perintahnya.
