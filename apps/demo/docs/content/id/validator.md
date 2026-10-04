---
title: Pemeriksa kampanye
description: Periksa berkas kampanye di peramban dengan pemeriksaan skema dan semantik yang sama seperti chronomap-check, lalu pratinjau pemutarannya.
group: tools
order: 1
tool: validator
---

Tempel berkas kampanye di bawah, jatuhkan berkas ke kotak, atau muat salah satu contoh bawaan. Pemeriksaan berjalan sepenuhnya di peramban Anda. Tidak ada yang diunggah.

Pemeriksaan ini menjalankan dua lapisan yang sama dengan [pemeriksa baris perintah](cli.md):

- **Struktur**: JSON Schema di [campaign.schema.json](gh:schema/campaign.schema.json). Kegagalan dilaporkan sebagai [S001](diagnostics.md#s001).
- **Semantik**: pemuat milik mesin, `loadCampaign`, yang memeriksa rujukan, tanggal, koordinat, dan semua hal lain yang tidak dapat diungkapkan skema. Setiap temuan punya kode yang dapat Anda cari di [Diagnostik](diagnostics.md).

Berkas dengan satu galat saja akan ditolak: aplikasi peta tidak akan memainkannya. Peringatan dan info tidak pernah menolak berkas.

Jika berkas lolos, uji putar menampilkan setiap bab di awal, tengah, dan akhir rentang gulirnya: tanggal yang ditunjukkan jam, peristiwa yang sedang terjadi, dan pasukan yang sedang bergerak. Ini cara tercepat untuk menangkap tanggal yang membuat sebuah gerak pasukan jatuh di bab yang salah.

> [!TIP]
> Untuk memeriksa dari terminal atau di CI, jalankan `node packages/engine/dist/cli.js kampanye-anda.json --strict`. Lihat [CLI](cli.md).
