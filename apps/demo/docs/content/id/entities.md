---
title: Entitas
description: Unit, benteng, wilayah, dan rute — hal-hal yang bergerak, berpindah tangan, atau berubah seiring waktu.
group: authoring
order: 4
---

## Apa yang membuat sesuatu menjadi entitas {#what-is-an-entity}

Jika sesuatu **bergerak atau berpindah tangan**, itu adalah entitas. Jika sesuatu **terjadi**, itu adalah [peristiwa](events.md). Jika sesuatu **hanya berada di suatu tempat**, itu adalah [tempat](places.md) — entitas dan peristiwa biasanya merujuk ke tempat lewat id, bukan mengulang koordinat ([§2.1](contract.md#sec-2-1)).

Entitas memiliki interval keberadaan, satu geometri yang bergantung pada `kind`-nya, dan dapat berubah seiring waktu: posisi, status, pemilik (`faction`), dan kekuatan.

## Empat jenis {#kinds}

| `kind` | Kolom geometri | Kolom terlarang | Bawaan interval keberadaan |
|---|---|---|---|
| `unit` | `track` | `at`, `geometry`, `path` | dari kedatangan di titik singgah pertama hingga keberangkatan dari titik singgah terakhir |
| `fortification` | `at` | `track`, `geometry`, `path` | rentang penuh linimasa |
| `territory` | `geometry` (`Polygon` atau `MultiPolygon`) | `track`, `at`, `path` | rentang penuh linimasa |
| `route` | `path` (≥2 lokasi) | `track`, `at`, `geometry` | rentang penuh linimasa |
| `x-…` | salah satu di atas | — | mengikuti geometri yang dipakai |

Entitas terlihat pada tick `t` jika dan hanya jika `start ≤ t < end` ([§4](contract.md#sec-4)).

## Bidang yang dimiliki setiap entitas {#common-fields}

`id`, `kind`, `name`, dan `faction` wajib diisi — setiap entitas berpihak pada satu faksi. Selebihnya opsional:

```jsonc
{
  "id": "diponegoro-hq", "kind": "unit", "faction": "diponegoro",
  "name": { "en": "…", "id": "…" },
  "when": "1825-07-20/1855-01-08",
  "commanders": ["Pangeran Diponegoro"],
  "description": { "en": "…", "id": "…" },
  "certainty": "approximate",
  "style": { "trail": "full", "icon": "leader" },
  "sources": ["carey-2007", "carey-2014"], "media": ["bik-portrait"],
  "notes": { "en": "…", "id": "…" }, "tags": ["headquarters"]
}
```

`commanders` adalah daftar nama, dan setiap nama adalah [teks terlokalisasi](languages.md), sehingga gelar bisa diterjemahkan meski nama orangnya biasanya tidak. `tags` adalah larik string biasa untuk penyaringan di alat penyusunan; mesin itu sendiri tidak pernah membacanya.

## Keberadaan: interval `when` {#existence}

`when` menentukan berapa lama sebuah entitas ada. Jika tidak diisi, mesin memakai bawaan dari tabel di atas: `unit` ada sejak kedatangan di titik singgah pertamanya hingga keberangkatan dari titik singgah terakhirnya; jenis lain memakai rentang penuh linimasa (lihat [Waktu](time.md)).

Ujung terbuka juga berlaku di sini — `"1825-08~/.."` berarti "sekitar Agustus 1825 hingga akhir linimasa":

```json
{ "id": "fort-vredeburg-garrison", "kind": "fortification", "faction": "dutch-colonial",
  "at": "benteng-vredeburg", "when": "1825-07/.." }
```

Jika sebuah `unit` juga menetapkan `when` secara eksplisit, dan kedatangan pertama atau keberangkatan terakhir pada jalurnya jatuh di luar interval itu, pemvalidasi memberi peringatan ([W113](diagnostics.md#w113)) alih-alih menolak berkas — tetapi hanya bagian jalur yang berada dalam `[start, end)` yang pernah terlihat, karena itulah aturan untuk setiap entitas.

## Pasukan: track dan titik singgah {#units}

`track` pada `unit` adalah daftar titik singgah berurutan. Setiap titik singgah berisi:

| Kolom | Arti |
|---|---|
| `when` (wajib) | Titik (lewat saja) atau interval (singgah) — lihat [Waktu](time.md). |
| `at` (wajib) | Id tempat atau `[lng, lat]` langsung. |
| `via` | Koordinat perantara untuk kaki perjalanan yang **tiba** di titik singgah ini. |
| `mode` | `land`, `river`, atau `sea`, untuk kaki perjalanan yang tiba. Bawaan `land`. |
| `strength` | Bilangan bulat, atau `{min, max, note?}` bila sumber tidak sepakat. |
| `certainty` | Menimpa kepastian kaki perjalanan — lihat [di bawah](#leg-certainty). |
| `label`, `notes`, `sources` | Narasi dan sitasi khusus titik singgah ini. |

```json
{ "when": "1825-07-21/1825-09~", "at": "goa-selarong",
  "label": { "en": "Headquarters at Selarong", "id": "Markas di Selarong" },
  "notes": { "en": "Dutch columns found Selarong empty in early October 1825.", "id": "…" } }
```

### Tiba, berangkat, dan berhenti {#arrival-departure}

Untuk setiap titik singgah, `arrive = start(when)`. Jika `when` berupa interval, `depart = end(when)`; jika tidak, pasukan hanya lewat saja dan `depart = arrive`. Titik-titik singgah harus berurutan secara waktu — `arrive[i] ≥ depart[i-1]` — atau berkas gagal dimuat ([E006](diagnostics.md#e006)).

### Bergerak di antara titik singgah {#movement}

Pada tick `t`:

```text
t < arrive[0]                → hold at waypoint 0
arrive[i] ≤ t < depart[i]    → hold at waypoint i         (moving = false)
depart[i] ≤ t < arrive[i+1]  → on leg i+1                 (moving = true)
t ≥ depart[last]             → hold at the last waypoint
```

Pada satu kaki perjalanan, fraksi yang telah ditempuh adalah `f = (t − depart[i]) / (arrive[i+1] − depart[i])`, dan posisinya adalah titik pada fraksi `f` dari panjang haversine kaki tersebut — linier dalam bujur/lintang di setiap segmen, bukan interpolasi lingkaran besar ([§4.1](contract.md#sec-4-1)). Perenderan juga mendapat arah hadap (bearing): arah lingkaran besar awal dari segmen yang sedang dilintasi, atau, saat berhenti, dari segmen terakhir kaki perjalanan yang baru tiba — kecuali sebelum titik singgah pertama pasukan, saat arah hadap belum ada.

### Via, mode, dan antimeridian {#via-mode}

`via` menjadi milik kaki perjalanan yang **tiba** di titik singgah itu — kakinya adalah `[koordinat sebelumnya, ...via, koordinat ini]`. Gunakan ini untuk melengkungkan pergerakan mengikuti jalan, sungai, atau jalur laut, bukan garis lurus. `mode` menjelaskan kaki perjalanan yang sama; perenderan boleh melewatkan pelapisan medan (terrain draping) untuk `sea` dan menggambarnya putus-putus. Pelayaran pengasingan Diponegoro melengkung mengikuti jalur laut skematis seperti ini:

```json
{ "when": "1830-06-12/1833-06-20", "at": "manado-fort", "mode": "sea", "certainty": "approximate",
  "via": [[106.85, -5.9], [108.5, -5.4], [111, -5.2], [114, -5], "…", [124.55, 1.62]] }
```

Kaki perjalanan tidak boleh melintasi antimeridian — pecah dengan titik `via` ([W109](diagnostics.md#w109)).

### Kekuatan di sepanjang track {#strength}

Kekuatan hanya berasal dari titik singgah yang menetapkannya: tetap selama pasukan berhenti, linier di antara dua simpul (knot) terdekat selama bergerak, dan dijepit (clamped) ke nilai simpul terdekat di luar simpul pertama dan terakhir. Rentang `{min, max}` diinterpolasi pada titik tengahnya. Minta lebar bergaya Minard dengan `style.widthBy: "strength"`:

```json
{ "id": "blue-legion", "kind": "unit", "faction": "blue",
  "track": [
    { "when": "-0010-03/-0010-05-24", "at": "harbor", "strength": 5000 },
    { "when": "-0010-06-01", "at": "hill", "strength": 4000 },
    { "when": "-0010-07-01/-0009", "at": "ruins",
      "strength": { "min": 2000, "max": 3000, "note": { "en": "Sources disagree", "id": "Sumber berbeda" } } }
  ],
  "style": { "trail": "full", "widthBy": "strength" }
}
```

`style.trail` (`full` | `leg` | `none`, bawaan `full`) menentukan seberapa banyak jalur yang sudah ditempuh digambar.

Ujung interval yang kasar bisa memakan waktu tempuh: jika dua titik singgah resolve ke tick yang sama (kaki perjalanan berdurasi nol) tetapi berjarak lebih dari 1 km, pasukan itu berpindah seketika (teleport), dan pemvalidasi memberi peringatan ([W107](diagnostics.md#w107)) — lihat [Waktu](time.md) untuk cara menghindarinya.

### Kepastian sebuah kaki perjalanan {#leg-certainty}

Kepastian sebuah kaki perjalanan mengikuti urutan jatuh: `certainty` milik titik singgah itu sendiri, lalu — jika `at` berupa id tempat — kepastian tempat itu, lalu `certainty` milik entitas itu sendiri. Perenderan sebaiknya menggambar kaki perjalanan yang dugaan atau tidak pasti dengan garis putus-putus atau pudar:

```json
{ "when": "1826-08-09", "at": "kejiwan", "certainty": "conjectural" }
```

## Benteng {#fortifications}

`fortification` adalah satu `at` — id tempat atau koordinat langsung — ditambah, biasanya, `states` untuk membawanya melewati sebuah pengepungan:

```json
{ "id": "fort-vredeburg-garrison", "kind": "fortification", "faction": "dutch-colonial",
  "at": "benteng-vredeburg", "when": "1825-07/..",
  "states": [
    { "when": "1825-07", "status": "active" },
    { "when": "1825-07-28/1825-09-25", "status": "besieged" }
  ] }
```

## Wilayah {#territories}

`territory` adalah `Polygon` atau `MultiPolygon` — hanya `type` dan `coordinates`, bukan GeoJSON penuh: tidak ada `properties`, tidak ada `bbox`. Setiap cincin (ring) harus tertutup, posisi pertama dan terakhirnya sama, atau berkas gagal dimuat ([E010](diagnostics.md#e010)). Kepemilikan biasanya berasal dari `states`, sama seperti cara sebuah benteng berpindah tangan:

```json
{ "id": "red-land", "kind": "territory", "faction": "red",
  "geometry": { "type": "Polygon",
    "coordinates": [[[0.3, -0.3], [0.6, -0.3], [0.6, 0.1], [0.3, 0.1], [0.3, -0.3]]] },
  "states": [{ "when": "-0010-07-01", "faction": "blue" }] }
```

## Rute {#routes}

`route` adalah garis statis — jalan, perbatasan, jalur laut yang ditampilkan sebagai latar, bukan pergerakan pasukan — diberikan sebagai `path`, daftar minimal dua lokasi (id tempat atau koordinat langsung). Ia tidak pernah bergerak; gunakan `style.dash` untuk garis putus-putus:

```json
{ "id": "coast-road", "kind": "route", "faction": "red",
  "path": ["harbor", "hill", [0.4, 0]],
  "style": { "dash": [2, 1] } }
```

## Jenis kustom `x-` {#custom-kinds}

`kind` yang cocok dengan pola `x-…` diterima di mana pun kind bawaan diterima. Ia tetap membutuhkan tepat satu dari `at`, `track`, `geometry`, atau `path` — kind kustom tanpa satu pun dari itu gagal dimuat ([E016](diagnostics.md#e016)). Kind `x-` yang tidak dikenali dirender dengan gaya generik sesuai geometrinya: titik, garis, atau poligon ([§7.4](contract.md#sec-7-4)).

```json
{ "id": "lighthouse", "kind": "x-lighthouse", "faction": "blue",
  "at": "harbor", "x-beamRangeKm": 20 }
```

Bidang `x-` adalah data, tidak pernah dieksekusi — kind kustom atau bidang kustom sama amannya dengan yang bawaan ([§7.5](contract.md#sec-7-5)).

## States: status, faksi, dan kekuatan dari waktu ke waktu {#states}

`states` adalah daftar `{ when, status?, faction?, strength?, label? }`, diurutkan berdasarkan `start(when)` — daftar yang tidak berurutan gagal dimuat ([E007](diagnostics.md#e007)).

Pada tick `t`, kandidat statusnya adalah yang `start ≤ t` dan intervalnya (jika ada) belum berakhir. **Yang mulainya paling akhir yang menang.** Status berbentuk titik (tanpa interval) berlaku sampai digantikan status lain. Status berbentuk interval berlaku sampai akhirnya sendiri, setelah itu status sebelumnya berlaku lagi ([§4.2](contract.md#sec-4-2)):

```json
"states": [
  { "when": "1825-07", "status": "active" },
  { "when": "1825-07-28/1825-09-25", "status": "besieged" }
]
```

Benteng Vredeburg hanya `besieged` (dikepung) selama interval pengepungan; sebelum dan sesudahnya, `active` berlaku lagi. `faction` pada sebuah status mengubah pihak yang menguasai — begitulah cara sebuah benteng direbut:

```json
"states": [
  { "when": "1825-08~", "status": "active" },
  { "when": "1826-06-09", "status": "captured", "faction": "dutch-colonial" }
]
```

Tanpa status yang berlaku, statusnya adalah `active` dan faksinya adalah faksi milik entitas itu sendiri. `status` adalah salah satu dari `planned, active, besieged, captured, destroyed, abandoned, encamped, captive, surrendered, disbanded, exiled, dead`, atau `x-…` kustom.

## Petunjuk gaya {#style}

`style` netral terhadap perenderan — ia tidak pernah membawa properti cat (paint property) Mapbox atau MapLibre, hanya petunjuk yang bebas ditafsirkan tema ([§1](contract.md#sec-1)): `color`, `width`, `dash`, `icon`, `opacity`, `trail` (`full` | `leg` | `none`), `widthBy` (`"strength"` satu-satunya nilai saat ini). Cara setiap kind memakainya ditentukan tema, bukan data ([§7.4](contract.md#sec-7-4)):

| `kind` | Lapisan bawaan | Resolusi gaya |
|---|---|---|
| `unit` | garis jejak + simbol kepala | `entity.style` › `faction.color` › tema; lebar mengikuti kekuatan bila `widthBy`; kaki perjalanan putus-putus bila dugaan atau `mode: sea` |
| `fortification` | simbol | ikon mengikuti `status`, warna mengikuti pemilik saat ini |
| `territory` | isian + garis tepi | isian mengikuti pemilik saat ini |
| `route` | garis | `style.dash` › tema |

```json
"style": { "trail": "full", "icon": "leader" }
```
