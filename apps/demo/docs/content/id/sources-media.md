---
title: Sumber dan media
description: Sitasi untuk setiap klaim, dan gambar dengan teks alt, kredit, serta lisensi — provenans yang menyertai data.
group: authoring
order: 7
---

## Asal-usul ikut bersama data {#overview}

Sebuah kampanye bersifat mandiri (self-contained): sitasi, kredit gambar, dan lisensi hidup dalam berkas yang sama dengan sejarahnya, bukan di daftar pustaka terpisah ([§1](contract.md#sec-1)). `sources[]` dan `media[]` adalah daftar datar di tingkat atas; apa pun lain dalam berkas — tempat, entitas, peristiwa, bab, bahkan faksi — merujuk ke keduanya lewat id melalui larik `sources` dan `media` miliknya sendiri.

## Sumber {#sources}

| Bidang | Wajib | Arti |
|---|---|---|
| `id` | ya | Dirujuk dari larik `sources: [...]` di tempat lain dalam berkas. |
| `type` | ya | `book`, `article`, `primary`, `archive`, `web`, `dataset`, `map`, atau `encyclopedia`. |
| `citation` | ya | String biasa — teks sitasi lengkap. |
| `url` | tidak | Tempat menemukannya daring. |
| `accessed` | tidak | Tanggal [`When`](time.md); divalidasi tetapi, seperti `media.date` dan `meta.updated`, tidak terikat linimasa. |
| `notes` | tidak | [Teks terlokalisasi](languages.md) untuk catatan tentang sumber itu. |

Sebuah sumber tidak butuh `url` — banyak literatur cetak tidak memilikinya:

```json
{ "id": "carey-1982", "type": "article",
  "citation": "Carey, Peter. \"Raden Saleh, Dipanagara and the Painting of the Capture of Dipanagara at Magelang (28 March 1830).\" Journal of the Malaysian Branch of the Royal Asiatic Society 55, no. 1 (1982): 1–25." }
```

Bila ada, `accessed` mencatat kapan sumber daring itu terakhir diperiksa:

```json
{ "id": "jogjacagar", "type": "web",
  "citation": "Dinas Kebudayaan DIY. Jogjacagar cultural heritage register.",
  "url": "https://jogjacagar.jogjaprov.go.id/", "accessed": "2026-09" }
```

Sitasi setiap peristiwa: satu tanpa entri `sources[]` tetap dapat dimuat, tetapi memberi peringatan ([W114](diagnostics.md#w114)) — daftar periksa penyusunan mengatakan beri setiap peristiwa minimal satu sumber ([§10](contract.md#sec-10)).

## Media {#media}

| Bidang | Wajib | Arti |
|---|---|---|
| `id` | ya | Dirujuk dari larik `media: [...]` di tempat lain dalam berkas. |
| `type` | ya | `image` — satu-satunya nilai saat ini. |
| `url` | ya | Tempat memuat gambar penuh; path relatif atau URL mutlak. |
| `alt` | ya | [Teks terlokalisasi](#alt-text) — lihat di bawah. |
| `license` | ya | Id SPDX, atau `public-domain`. |
| `thumbnailUrl` | tidak | Versi lebih kecil, aturan sama dengan `url`. |
| `caption` | tidak | Teks terlokalisasi yang ditampilkan bersama gambar. |
| `creator` | tidak | String biasa — senimannya atau fotografernya. |
| `date` | tidak | Tanggal [`When`](time.md); divalidasi, tidak terikat linimasa. |
| `holder` | tidak | String biasa — pemegang hak atau objek fisiknya. |
| `sourceUrl` | tidak | URL mutlak ke daftar aslinya, misalnya halaman museum atau Commons. |
| `notes` | tidak | Teks terlokalisasi, misalnya "tautan belum diperiksa". |

```json
{ "id": "saleh-arrest", "type": "image",
  "url": "https://commons.wikimedia.org/wiki/Special:FilePath/Raden_Saleh_-_Diponegoro_arrest.jpg",
  "alt": { "en": "Painting: Diponegoro, head raised, stands among his followers on the steps of the Magelang residency as Dutch officers look on.", "id": "…" },
  "caption": { "en": "Raden Saleh, The Arrest of Prince Diponegoro (1857).", "id": "…" },
  "creator": "Raden Saleh", "date": "1857", "license": "public-domain",
  "holder": "Istana Kepresidenan Yogyakarta",
  "sourceUrl": "https://commons.wikimedia.org/wiki/File:Raden_Saleh_-_Diponegoro_arrest.jpg" }
```

Gambar lokal yang dihosting sendiri bisa memakai `url` relatif, seperti pada fixture null island:

```json
{ "id": "fixture-image", "type": "image", "url": "media/fixture.png",
  "alt": { "en": "Placeholder image", "id": "Gambar placeholder" }, "license": "CC0-1.0" }
```

Media selalu dimuat sebagai gambar — tidak ada apa pun dalam berkas kampanye yang menjalankan kode ([§7.5](contract.md#sec-7-5)).

## Teks alt {#alt-text}

`alt` wajib pada setiap gambar, dan ia adalah [teks terlokalisasi](languages.md) seperti bidang naratif lainnya: jelaskan apa yang sungguh ada dalam gambar, bukan sekadar judulnya. Daftar periksa penyusunan mengatakannya dengan jelas — tulis teks `alt` untuk setiap gambar, dan periksa lisensinya sebelum di-commit ([§10](contract.md#sec-10)).

## Lisensi {#licensing}

Dua lisensi bisa muncul dalam sebuah kampanye, pada dua cakupan berbeda. `meta.license` adalah satu id SPDX (misalnya `CC-BY-4.0`) untuk teks dan data milik dataset itu sendiri — prosa yang Anda tulis. `media[].license` adalah id SPDX terpisah, atau string literal `public-domain`, per gambar — mencakup lisensi gambar sejarah itu sendiri, yang hampir tidak pernah sama dengan lisensi dataset:

```json
"license": "public-domain"
```

## Keamanan URL {#url-safety}

Skema URL `javascript:`, `data:`, `vbscript:`, atau `file:` gagal validasi di mana pun ia muncul — `source.url`, `media.url`, `media.thumbnailUrl`, atau tautan di dalam [body bab](chapters.md#body) — karena berkas kampanye bisa berasal dari mana saja dan diperlakukan sebagai masukan yang tidak tepercaya ([E015](diagnostics.md#e015), [§7.5](contract.md#sec-7-5)). Tautan eksternal dibuka dengan `rel="noopener noreferrer"`.

## Sumber dan media yang tidak dirujuk {#unreferenced}

Entri `sources[]` atau `media[]` yang tidak dirujuk oleh apa pun dalam berkas lewat id adalah beban mati — pemvalidasi memberi peringatan ([W105](diagnostics.md#w105)), peringatan yang sama diberikan untuk `place` atau `part` yang tidak dipakai.
