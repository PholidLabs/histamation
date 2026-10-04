---
title: Tempat
description: Gazetir statis — koordinat, kepastian, radius ketidakpastian, dan cara mencatat asal sebuah koordinat.
group: authoring
order: 3
---

Tempat adalah yang paling sederhana dari empat primitif
([Anatomi berkas kampanye § Empat primitif](campaign-file.md#primitives)): ia tidak punya waktu
dan tidak pernah berubah. Jika sesuatu **hanya berada di suatu tempat** — sebuah istana, gua,
atau medan pertempuran yang lokasinya diperdebatkan — itu adalah tempat. Jika ia bergerak atau
berpindah tangan, itu [entitas](entities.md), bukan tempat.

## Apa itu tempat {#what-is-a-place}

Tempat membentuk gazetir statis: titik bernama yang dirujuk [entitas](entities.md) dan
[peristiwa](events.md) lewat ID alih-alih mengulang koordinat di mana-mana. Sebuah tempat
dirender sebagai label dan penanda, ditambah halo ketidakpastian yang besarnya mengikuti
[kepastiannya](#certainty) — tidak pernah berupa sesuatu yang berubah sepanjang cerita.

## Bidang wajib {#fields}

```json
{
  "id": "goa-selarong",
  "name": { "en": "Selarong cave", "id": "Goa Selarong" },
  "modernName": { "en": "Kembangputihan, Guwosari, Pajangan, Bantul", "id": "Kembangputihan, Guwosari, Pajangan, Bantul" },
  "kind": "cave",
  "coordinates": [110.31476, -7.86187],
  "certainty": "exact",
  "rank": 1,
  "notes": "Jogjacagar record 3994 (UTM cross-checked). The western 'kakung' cave was Diponegoro's.",
  "sources": ["jogjacagar"]
}
```

`id`, `name`, `coordinates` dan `certainty` wajib diisi. Selebihnya opsional:

| Bidang | Fungsi |
|---|---|
| `modernName` | Nama masa kini atau lokasi administratif, saat berbeda dari nama periode. |
| `kind` | `settlement`, `palace`, `fort`, `battlefield`, `cave`, `mountain`, `river`, `port`, `residence`, `grave`, `landmark`, `region`, atau nilai kustom `x-…`. Menentukan ikon penanda pada tema. |
| `radiusMeters` | Radius ketidakpastian dalam meter — lihat [Radius ketidakpastian](#radius). |
| `rank` | Prioritas label, `1`–`5`. `1` selalu dilabeli; angka lebih besar lebih dulu disembunyikan saat peta makin padat. |
| `description` | Prosa lebih panjang daripada `name`, ditampilkan di popup atau panel. |
| `sources` | ID ke dalam `sources[]`. |
| `media` | ID ke dalam `media[]`. |
| `notes` | Teks bebas — di sinilah provenans dicatat, lihat [Provenans](#provenance). |

## Koordinat: `[lng, lat]` {#coordinates}

```json
"coordinates": [110.36406, -7.80569]
```

Longitude (bujur) lebih dulu, baru latitude (lintang) — konvensi GeoJSON dan WGS84, kebalikan
dari urutan yang sering diucapkan untuk koordinat peta ("7,8°LS, 110,4°BT"). Elemen ketiga
diterima sebagai ketinggian dalam meter; jika dihilangkan, perender melapiskan titiknya di atas
DEM medan sebagai gantinya.

`coordinates` diperiksa secara struktural (larik berisi dua atau tiga angka berhingga) lalu
berdasarkan rentang: bujur dalam ±180, lintang dalam ±90. Kegagalan pada salah satunya adalah
[`E011`](diagnostics.md#e011). Pasangan yang tertukar biasanya tetap ter-parse sebagai *suatu*
koordinat, sehingga pemeriksaan ini saja tidak selalu menangkapnya — lihat
[Koordinat di luar batas peta](#bounds) untuk peringatan yang menangkapnya.

## Kepastian {#certainty}

| `certainty` | Arti |
|---|---|
| `exact` | Situs sesungguhnya yang teridentifikasi. |
| `approximate` | Diketahui hingga level kota atau desa, tidak lebih presisi. |
| `conjectural` | Lokasi historisnya tidak diketahui; ini adalah dugaan yang ditempatkan. |

Kepastian membahas **lokasi**, bukan waktu — kejujuran sebuah tanggal diungkapkan terpisah lewat
kualifier `?`/`~`/`%` di [Waktu](time.md#qualifiers). Perender harus bisa menunjukkan
bedanya: ia menggambar halo di sekitar penanda dengan ukuran mengikuti
[`radiusMeters`](#radius), sehingga penempatan `conjectural` terlihat sebagai lingkaran lebar
dan lembut, bukan pin presisi ([§7.4](contract.md#sec-7-4)).

`certainty` milik sebuah [entitas](entities.md) atau [peristiwa](events.md) tidak wajib diisi
— jika hilang, sebuah leg atau `at` peristiwa yang menunjuk ID tempat akan jatuh balik ke
`certainty` tempat itu, dan baru kemudian ke `certainty` entitas itu sendiri (lihat
[§4.1](contract.md#sec-4-1)). Jangan biarkan lokasi yang sebenarnya dugaan tetap tidak ditandai
hanya karena entitas di atasnya kebetulan `exact`.

## Radius ketidakpastian {#radius}

`radiusMeters` adalah radius halo dalam meter. Jika dihilangkan, nilainya bawaan sesuai
`certainty`:

| `certainty` | `radiusMeters` bawaan |
|---|---|
| `exact` | 100 m |
| `approximate` | 3.000 m (3 km) |
| `conjectural` | 15.000 m (15 km) |

Timpa nilainya saat bawaannya keliru ke arah mana pun. `kejiwan` pada berkas Perang Jawa
berstatus `conjectural` tanpa `radiusMeters` diset, sehingga memakai bawaan 15 km — situsnya
hanya diketahui berada di suatu tempat di antara dua candi. `siluk` juga `conjectural` tetapi
menetapkan `"radiusMeters": 20000`, karena bahkan 15 km pun meremehkan betapa tidak pastinya
identifikasi itu:

```json
{ "id": "siluk", "certainty": "conjectural", "radiusMeters": 20000,
  "notes": "Sources place the battle 'near the Selarong hills' or 'in the Progo valley'; identification with this hamlet is unverified." }
```

## Koordinat di luar batas peta {#bounds}

`meta.map.bounds` adalah `[west, south, east, north]` — ia menentukan `maxBounds` peta dan juga
menjadi acuan pemeriksaan koordinat sebuah tempat. Di luar batas itu, muncul
[`W102`](diagnostics.md#w102). Jika koordinatnya akan jatuh di dalam batas seandainya bujur dan
lintangnya ditukar, peringatannya langsung menyebut itu, karena itulah cara paling umum hal ini
terjadi — mengetik `[lat, lng]` karena kebiasaan. Contohnya, dengan `"bounds": [104, -9.5, 126.5, 3]`
milik berkas Perang Jawa, menulis koordinat asli `kraton-yogyakarta` `[110.364, -7.806]` secara
terbalik menjadi `[-7.806, 110.364]` persis memicu kasus ini: dibaca sebagai `[lng, lat]`,
`-7.806` sama sekali tidak dekat dengan rentang 104–126,5°BT milik batasnya, jadi ia dianggap di
luar — tetapi tukar keduanya dan `110.364` (di slot lintang) jatuh di dalam 104–126,5, sementara
`-7.806` (di slot bujur) jatuh di dalam −9,5°..3°LU, sehingga hint-nya muncul.

## Provenans: bidang notes {#provenance}

Setiap koordinat sebaiknya menyebut asalnya, di `notes` ([§10](contract.md#sec-10)): register
museum, catatan basis data situs cagar budaya, node OpenStreetMap, survei GPS, atau penempatan
terduga di antara dua titik yang diketahui. Contoh nyata dari berkas Perang Jawa:

- `"Jogjacagar record 3994 (UTM cross-checked). The western 'kakung' cave was Diponegoro's."`
- `"DIY museum register. The 'Tembok Jebol' (broken wall) he escaped through is 24 m away."`
- `"Village point from a tourism listing. Local tradition also names Ngipikrejo and Goa Sriti (Samigaluh) as bases."`
- `"Placed at the midpoint of Candi Kalasan and Candi Prambanan."`
- `"Town centre; coordinate not independently verified."`

Saat sumber-sumber berbeda pendapat, katakan begitu alih-alih diam-diam memilih satu — `notes`
milik `mlangi` mencantumkan tiga situs kandidat berbeda dari tiga sumber berbeda alih-alih
memilih di antaranya secara diam-diam. Penempatan yang kabur atau disintesis (placeholder,
titik tengah) justru itulah gunanya `certainty: "conjectural"` dan `radiusMeters` yang longgar.

## Merujuk tempat {#referencing}

`at` pada entitas (untuk `fortification`), `at` pada waypoint, `at` pada peristiwa, atau `focus`
pada bab bisa menyebut tempat lewat ID alih-alih mengulang koordinat — itulah tipe `location`
yang dipakai di seluruh kontrak, berupa ID tempat atau koordinat `[lng, lat]` langsung. Menyebut
ID dari jenis yang salah adalah [`E003`](diagnostics.md#e003); menyebut ID yang tidak ada di
mana pun dalam berkas adalah [`E002`](diagnostics.md#e002). Tempat yang tidak pernah dirujuk
apa pun adalah [`W105`](diagnostics.md#w105) — layak diperiksa sebelum sebuah berkas dirilis,
karena biasanya berarti ID salah ketik atau tempat yang sebenarnya ingin Anda hapus.
