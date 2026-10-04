---
title: Anatomi berkas kampanye
description: Bentuk tingkat atas berkas kampanye, empat primitif penyusunnya, dan satu namespace ID datar yang menyatukan semuanya.
group: authoring
order: 1
---

Sebuah kampanye adalah satu berkas JSON. Ia menyatakan apa yang ada, di mana, dan kapan — tidak
pernah bagaimana menggambarnya. Ikon sebuah `fortification` saat `besieged` adalah keputusan
tema, bukan bidang data; berkas hanya membawa hint `style` kecil yang netral terhadap perender.
Pemisahan itulah yang membuat berkas yang sama bisa diputar di engine referensi JS maupun di
core Rust/WASM dengan keluaran yang identik.

## Anatomi berkas {#anatomy}

| Kunci | Wajib | Tujuan |
|---|---|---|
| `chronomap` | ya | Versi kontrak yang ditarget berkas ini, misalnya `"1.0"`. |
| `meta` | ya | ID, judul, bahasa, extent linimasa, tampilan peta awal. |
| `factions` | ya, ≥1 | Pihak-pihak, dengan warna. |
| `parts` | tidak | Pengelompokan bab opsional untuk daftar isi. |
| `places` | tidak | Gazetir statis: titik bernama dengan kepastian. |
| `entities` | tidak | Hal yang ada sepanjang waktu: `unit`, `fortification`, `territory`, `route`. |
| `events` | tidak | Hal yang terjadi: pertempuran, pengepungan, perjanjian, penangkapan… |
| `chapters` | ya, ≥1 | Ceritanya: jendela waktu, kamera dan teks. |
| `sources` | tidak | Sitasi. |
| `media` | tidak | Gambar dengan teks alt, kredit dan lisensi. |

Semua kunci di atas kecuali `meta` berupa larik. `factions` butuh minimal satu entri dan
`chapters` butuh minimal satu — kampanye tanpa bab tidak punya titik mulai pemutaran
([`E018`](diagnostics.md#e018)). Lihat [§2](contract.md#sec-2) untuk bentuk lengkap beranotasi
dan [Memulai](getting-started.md#minimal-campaign) untuk berkas terkecil yang lolos validasi.

## Empat primitif {#primitives}

Semua isi `places`, `entities`, `events` dan `chapters` adalah salah satu dari empat jenis hal
berikut:

| Konsep | Punya waktu? | Punya geometri? | Berubah seiring waktu? | Dirender sebagai |
|---|---|---|---|---|
| **Place (tempat)** | tidak | titik | tidak | label dan penanda, dengan halo ketidakpastian |
| **Entity (entitas)** | interval keberadaan | jalur, titik, poligon atau garis | ya: posisi, status, pemilik, kekuatan | unit bergerak, ikon benteng, wilayah terarsir, garis rute |
| **Event (peristiwa)** | titik atau interval | titik opsional | fase: akan terjadi, aktif, lampau | berdenyut saat aktif, penanda pudar setelahnya |
| **Chapter (bab)** | jendela | kamera dan fokus | menggerakkan jam | langkah gulir, dengan narasi dan media |

Aturan praktis: jika sesuatu **bergerak atau berpindah tangan**, itu entitas
([Entitas](entities.md)). Jika sesuatu **terjadi**, itu peristiwa ([Peristiwa](events.md)). Jika
sesuatu **hanya berada di suatu tempat**, itu tempat ([Tempat](places.md)). Entitas dan peristiwa
biasanya merujuk tempat lewat ID (`"at": "pleret"`) alih-alih mengulang koordinat. Lihat
[§2.1](contract.md#sec-2-1).

## Satu namespace ID yang datar {#ids}

Setiap `id` — pada faksi, part, tempat, entitas, peristiwa atau bab — berformat kebab-case
(`^[a-z0-9]+(-[a-z0-9]+)*$`, maksimum 80 karakter) dan hidup dalam **satu namespace untuk
seluruh berkas**. Sebuah tempat dan sebuah peristiwa tidak boleh sama-sama bernama `gawok`.

Namespace tunggal itulah yang memungkinkan `focus` pada bab, `at`/`path` pada entitas, atau `at`
pada peristiwa mencampur tempat, entitas dan peristiwa lewat ID polos, tanpa penanda jenis:

```json
{ "focus": ["diponegoro-hq", "battle-gawok", "gawok"] }
```

Tiga diagnostik menjaga ini:

- [`E001`](diagnostics.md#e001) — ID duplikat.
- [`E002`](diagnostics.md#e002) — rujukan ke ID yang tidak ada di mana pun dalam berkas.
- [`E003`](diagnostics.md#e003) — rujukan yang ditemukan, tetapi berjenis salah (misalnya ID
  faksi dipakai di tempat yang seharusnya tempat, entitas atau peristiwa).

## `$schema` dan autolengkap editor {#schema-autocomplete}

Letakkan penunjuk `$schema` di awal berkas:

```jsonc
{
  "$schema": "../../schema/campaign.schema.json",   // dua tingkat di atas data/campaigns/
  "chronomap": "1.0"
}
```

Editor dengan language server JSON (misalnya bawaan VS Code) membaca ini untuk melengkapi nama
bidang dan nilai enum secara otomatis, serta menggarisbawahi kesalahan struktural saat Anda
mengetik — bidang wajib yang hilang, `kind` yang tidak ada dalam enum, `color` yang bukan
`#rrggbb`. Engine sendiri tidak pernah membaca `$schema`; ini murni alat bantu penulisan, dan
[`schema/campaign.schema.json`](gh:schema/campaign.schema.json) yang sama juga menjadi dasar
`ajv` di CI ([`S001`](diagnostics.md#s001)).

> [!NOTE]
> Skema hanya mengekspresikan *struktur*. Integritas referensial (`E002`/`E003`), namespace ID
> (`E001`), resolusi waktu (`E004`/`E005`) dan semua yang dibahas di [Waktu](time.md#resolution)
> serta [Tempat](places.md#coordinates) adalah validasi *semantik*, dilakukan oleh engine, bukan
> oleh editor Anda. Selalu jalankan CLI (lihat [Memulai](getting-started.md#validate)) sebelum
> memercayai sebuah berkas.

## Memperluas tanpa merusak {#extending}

Setiap objek — termasuk tingkat teratas — menerima bidang berawalan `x-`, dan di mana pun `kind`
atau `status` berupa enum, nilai `x-…` juga diterima (`place.kind`, `entity.kind`, `event.kind`,
`state.status`). Berkas Napoleon 1812 membawa tabel suhu Minard sebagai `x-minard` dengan cara
ini. Dua aturan menjaga ini tetap aman:

- `kind` entitas kustom `x-…` tetap butuh tepat satu dari empat bentuk geometri (`track`, `at`,
  `geometry` atau `path`) — jika hilang, itu [`E016`](diagnostics.md#e016).
- Bidang `x-` yang tidak dikenal, serta nilai `kind`/`status` yang tidak dikenali engine lama,
  diabaikan alih-alih ditolak. `chronomap: "1.N"` — versi minor hanya pernah *menambah* bidang
  opsional dan nilai enum, sehingga engine 1.0 tetap bisa memutar berkas 1.3. Hanya versi major
  yang tidak didukung yang ditolak ([`E013`](diagnostics.md#e013)). Lihat [§9](contract.md#sec-9).

`kind` `x-` yang tidak dikenal dirender dengan gaya generik sesuai geometrinya (titik, garis
atau poligon), dan tema yang tidak dikenal jatuh kembali ke tema bawaan engine — lihat
[§7.4](contract.md#sec-7-4).

## Alur kerja penulisan {#workflow}

1. Masukkan setiap koordinat ke `places` dengan `certainty` yang jujur dan satu baris `notes`
   yang menyebut asal koordinatnya — lihat [Tempat § Provenans](places.md#provenance).
2. Konversikan setiap tanggal ke kalender Gregorian proleptik. Tandai yang meragukan dengan `?`
   atau `~`, dan catat perbedaan antar sumber di `notes` alih-alih diam-diam memilih satu — lihat
   [Waktu](time.md).
3. Beri setiap peristiwa minimal satu sumber ([`W114`](diagnostics.md#w114)).
4. Pakai istilah yang netral untuk faksi.
5. Tulis teks `alt` untuk setiap gambar dan periksa lisensinya — lihat
   [Sumber dan media](sources-media.md).
6. Jalankan CLI dengan `--frames` dan baca hasil dry run-nya. Perintah ini mencetak posisi
   setiap unit di awal, tengah dan akhir tiap bab, yang menangkap sebagian besar kesalahan
   tanggal dan rujukan sebelum Anda membuka peramban.

Lihat [§10](contract.md#sec-10) untuk versi normatif daftar periksa ini. Untuk penulisan
interaktif alih-alih menyunting berkas dengan tangan, lihat [validator](validator.md) (laporan
diagnostik lengkap sambil mengetik) dan [when-tester](when-tester.md) (tempel string `When`,
lihat rentang hasilnya).
