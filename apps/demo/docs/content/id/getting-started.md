---
title: Memulai
description: Pasang Histamation, jalankan demonya, dan validasi berkas kampanye pertama Anda dalam lima menit.
group: start
order: 1
---

Histamation memutar "kampanye" — satu berkas JSON yang menjelaskan tempat, pasukan dan peristiwa
di atas peta sejarah — sebagai cerita bergulir (scrollytelling) atau peta jelajah bebas. Halaman
ini menjalankan engine secara lokal dan menuntun sebuah kampanye minimal dari kertas kosong,
tervalidasi, hingga tampil di layar.

## Prasyarat {#prerequisites}

- **Node.js >= 20** (bidang `engines` pada workspace mewajibkan ini).
- **git**, untuk meng-clone repositori.
- Tidak perlu akun atau token API Mapbox: perender dibangun di atas MapLibre GL JS, yang tidak
  memerlukan keduanya.

## Clone dan pasang {#install}

```bash
git clone https://github.com/PholidLabs/histamation.git
cd histamation
npm install
```

Repositori ini adalah npm workspace: `packages/*` berisi engine dan perender MapLibre,
`apps/demo` adalah situs Vite yang menampung keduanya. Satu kali `npm install` di root
menyambungkan ketiganya.

## Build engine {#build}

```bash
npm run build
```

Perintah ini mengompilasi `packages/engine` dan `packages/maplibre` menjadi JS biasa di folder
`dist/` masing-masing. Langkah ini wajib sebelum CLI bisa dipakai (`packages/engine/dist/cli.js`
belum ada sebelum di-build) dan sebelum `npm run check`, yang memvalidasi terhadap engine hasil
build. Demo itu sendiri tidak perlu di-build saat pengembangan — dev server Vite membaca
langsung sumber TypeScript dari packages.

## Jalankan demo {#run}

```bash
npm run dev
```

Perintah ini menjalankan dev server Vite untuk `apps/demo`. Alamat lokal akan dicetak di
terminal — secara default `http://localhost:5173/` — buka di peramban.

## Dua halaman {#pages}

Demo ini adalah situs dua halaman:

- **`/`** — halaman landing: penjelasan tentang Histamation, dalam bahasa Inggris dan Indonesia.
- **`/app/`** — aplikasi peta itu sendiri: cerita bergulir, penggeser jelajah bebas, dan tempat
  Anda memuat berkas kampanye.

## Kampanye minimal {#minimal-campaign}

Sebuah berkas kampanye butuh empat hal: `histamation` (versi kontrak), `meta` (dengan `extent`
linimasa tertutup dan tampilan peta awal), minimal satu faksi, dan minimal satu bab
([`E018`](diagnostics.md#e018) — kampanye tanpa bab tidak punya titik mulai pemutaran).
Selebihnya — `places`, `entities`, `events`, `sources`, `media` — bersifat opsional. Berikut
kampanye terkecil yang lolos validasi:

```json
{
  "$schema": "../../schema/campaign.schema.json",
  "histamation": "1.0",
  "meta": {
    "id": "hello-histamation",
    "title": "Hello, Histamation",
    "description": "A five-minute example: one faction, one place, one chapter.",
    "languages": ["en"],
    "defaultLanguage": "en",
    "timeline": { "extent": "1825" },
    "map": { "center": [110.364, -7.806], "zoom": 12 }
  },
  "factions": [
    { "id": "sultanate", "name": "Sultanate of Yogyakarta", "color": "#8B1E1E" }
  ],
  "places": [
    { "id": "kraton", "name": "Kraton Yogyakarta", "coordinates": [110.364, -7.806], "certainty": "exact" }
  ],
  "chapters": [
    {
      "id": "start",
      "title": "The kraton",
      "when": "1825-07-20",
      "body": "The story begins at the sultan's palace.",
      "focus": ["kraton"]
    }
  ]
}
```

Beberapa hal yang perlu diperhatikan:

- `meta.timeline.extent` adalah `When` tertutup (lihat [Waktu](time.md#syntax)) yang wajib
  memuat setiap tanggal linimasa dalam berkas — di sini, tahun tunggal `1825`, yang mencakup
  seluruh tahun.
- `factions` butuh minimal satu entri dengan `id`, `name`, dan `color` berformat `#rrggbb`
  (atau `#rrggbbaa`).
- `id`, `name`, `coordinates` dan `certainty` pada tempat semuanya wajib diisi — lihat
  [Tempat](places.md).
- `focus` pada bab menyebut tempat lewat ID-nya; tanpa `camera`, engine akan menyesuaikan
  tampilan ke tempat itu (lihat [§6.2](contract.md#sec-6-2)).
- `$schema` tidak dibaca oleh engine — ia hanya mengarahkan editor Anda ke
  [`schema/campaign.schema.json`](gh:schema/campaign.schema.json) untuk autolengkap dan galat
  langsung di editor. Lihat [Anatomi berkas kampanye](campaign-file.md#schema-autocomplete).

## Validasi {#validate}

Simpan berkasnya di suatu tempat (misalnya `data/campaigns/hello-histamation.json`, agar
`npm run check` otomatis memeriksanya), lalu jalankan lewat CLI engine:

```bash
node packages/engine/dist/cli.js data/campaigns/hello-histamation.json
```

Perintah ini melaporkan diagnostik struktural dan semantik terhadap berkas (lihat
[Diagnostik](diagnostics.md) untuk daftar lengkap kodenya), lalu ringkasan satu baris tentang
apa yang ditemukan:

```text
data/campaigns/hello-histamation.json
  0 error(s), 0 warning(s), 0 info
  1 factions · 1 places · 0 entities · 0 events · 1 chapters
```

Tambahkan `--frames` untuk uji-coba pemutaran (dry run) — posisi setiap bab pada progres gulir
`p = 0, 0.5, 1` ([§6.1](contract.md#sec-6-1)), yang menangkap sebagian besar kesalahan tanggal
tanpa perlu membuka peramban:

```bash
node packages/engine/dist/cli.js data/campaigns/hello-histamation.json --frames
```

```text
  Playback dry-run (p = scroll progress through the chapter):

  ▸ start — The kraton  [1825-07-20]
    p=0.0 1825-07-20T00:00  active: —
    p=0.5 1825-07-20T11:59  active: —
    p=1.0 1825-07-20T23:59  active: —
```

`--strict` juga membuat validasi gagal pada peringatan, `--quiet` hanya menampilkan galat, dan
`--json` mengeluarkan laporan sebagai JSON alih-alih teks. `npm run check` menjalankan CLI yang
sama atas setiap berkas di `data/campaigns/` dan `data/campaigns/fixtures/`, sehingga ini adalah
satu perintah yang menjaga seluruh kampanye yang sudah di-commit.

> [!TIP]
> Anda tidak perlu peramban untuk langkah ini. `--frames` biasanya lebih cepat daripada memuat
> ulang `/app/` untuk menangkap salah ketik tanggal dan ID fokus yang tidak ditemukan. Untuk
> mencoba-coba string `When` secara interaktif dan melihat rentang hasilnya, pakai
> [when-tester](when-tester.md); untuk laporan diagnostik lengkap sambil mengetik, pakai
> [validator](validator.md).

## Lihat di aplikasi {#see-it}

Dengan `npm run dev` berjalan, buka `/app/`. Klik **Load JSON…** untuk memilih berkasnya, atau
seret langsung ke jendela peramban — keduanya memanggil pemuat yang sama. Berkas di atas 20 MB
ditolak di sisi klien sebelum parsing dimulai. Berkas yang hanya memuat peringatan tetap dimuat
dan diputar; berkas dengan galat apa pun ditolak dan diagnostiknya ditampilkan sebagai gantinya
([§7.1](contract.md#sec-7-1)).

## Langkah selanjutnya {#next-steps}

- [Anatomi berkas kampanye](campaign-file.md) — bentuk tingkat atas, empat primitif, dan satu
  namespace ID yang datar.
- [Waktu](time.md) — sintaks `When`, presisi, kualifier, dan cara tanggal diresolusi menjadi
  tick.
- [Tempat](places.md) — koordinat, kepastian dan provenans.
- [Entitas](entities.md), [Peristiwa](events.md) dan [Bab](chapters.md) — bagian yang bergerak,
  hal yang terjadi, dan cerita yang merangkainya.
- [Kontrak data](contract.md) adalah spesifikasi normatif di balik setiap halaman di bagian ini.
- [Diagnostik](diagnostics.md) memuat setiap kode galat, peringatan dan info yang bisa
  dikeluarkan validator.
