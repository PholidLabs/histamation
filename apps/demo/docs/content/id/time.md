---
title: Waktu
description: Sintaks tanggal `When`, presisi dan kualifiernya, serta cara setiap tanggal diresolusi menjadi rentang tick setengah terbuka.
group: authoring
order: 2
---

Setiap tanggal dalam kampanye — `when` pada bab, keberadaan entitas, waypoint, state, peristiwa
— ditulis sebagai string `When`: subset EDTF (ISO 8601-2). `"1827"` dan
`"1827-01-01T00:00:00Z"` berarti berbeda, sehingga formatnya membawa presisinya sendiri, dan
tanggal bisa ditandai tidak pasti atau perkiraan alih-alih dipaksa menjadi pasti secara palsu.

## Sintaks `When` {#syntax}

```
When      = Date | Interval
Interval  = (Date | "..") "/" (Date | "..")          ; not both ".."
Date      = Year [ "-" MM [ "-" DD [ "T" hh ":" mm [ ":" ss ] ] ] ] [ Qualifier ]
Year      = [ "-" ] 4DIGIT                            ; astronomical: 0000 = 1 BCE, -0043 = 44 BCE
Qualifier = "?" (uncertain) | "~" (approximate) | "%" (both)
```

Sebuah `Date` selalu berupa **tahun**, **tahun-bulan**, **tahun-bulan-tanggal**, atau salah satu
dari itu ditambah **jam** hingga menit atau detik — daftar itu juga merupakan lima presisi yang
dilacak engine (lihat [Meresolusi tanggal menjadi tick](#resolution)). Tahun selalu empat digit,
memakai penomoran astronomis, dengan tanda opsional.

Dicadangkan untuk versi minor mendatang, dan saat ini ditolak sebagai tidak valid: tahun
berawalan `Y` (tahun deep-time lebih dari empat digit), musim (`2001-21`), digit tak tentu
(`18XX`), dan akhir interval kosong (`1825/`). Setiap string yang tidak cocok dengan tata bahasa
ini — termasuk semua contoh di atas — gagal dengan [`E004`](diagnostics.md#e004).

## Kualifier: tidak pasti dan perkiraan {#qualifiers}

Sebuah `Date` boleh diakhiri satu kualifier:

| Kualifier | Arti | Contoh |
|---|---|---|
| `?` | tidak pasti — tanggal adalah dugaan terbaik | `1828-11-12?` |
| `~` | perkiraan — "sekitar" | `1827~` |
| `%` | tidak pasti sekaligus perkiraan | `1830%` |

Kualifier hanya **hint tampilan dan gaya** — "sek. 1827", atau garis putus-putus pada leg yang
dugaan (conjectural). Kualifier tidak pernah mengubah rentang `[start, end)` hasil resolusi:
`1827~` tetap mencakup seluruh tahun 1827, persis seperti `1827`. Ketidakpastian lokasi adalah
konsep terpisah — lihat [Tempat § Kepastian](places.md#certainty) — karena sebuah tanggal bisa
jujur soal *kapan* sementara tempatnya tetap jujur soal *di mana*.

## Meresolusi tanggal menjadi tick {#resolution}

Engine bekerja dalam **tick**: detik bulat sejak `1970-01-01T00:00:00`, Gregorian proleptik,
tanpa zona waktu. Tick bernilai negatif sebelum 1970 — `i64` di Rust, `number` biasa di JS
(presisi hingga ±2⁵³). Konversi memakai matematika kalender bilangan bulat (days-from-civil,
algoritma Howard Hinnant), bukan pustaka kalender floating-point, sehingga tahun kabisat
diresolusi dengan tepat.

Setiap `Date` mencakup **rentang setengah terbuka `[start, end)`**, besarnya sesuai presisinya:

| Presisi | Contoh | `start` | `end` (eksklusif) |
|---|---|---|---|
| tahun | `1825` | 1825-01-01T00:00:00 | 1826-01-01T00:00:00 |
| bulan | `1825-07` | 1825-07-01T00:00:00 | 1825-08-01T00:00:00 |
| hari | `1825-07-20` | 1825-07-20T00:00:00 | 1825-07-21T00:00:00 |
| menit | `…T14:30` | 14:30:00 | 14:31:00 |
| detik | `…T14:30:05` | 14:30:05 | 14:30:06 |

Sebuah `Interval A/B` diresolusi menjadi `[start(A), end(B))` — start dari presisi di `A`,
hingga end dari apa pun yang dicakup `B`. Contoh hasil hitung, semuanya sebagai pasangan
`[start, end)` bergaya ISO:

| `When` | Diresolusi menjadi |
|---|---|
| `1825` | `[1825-01-01T00:00:00, 1826-01-01T00:00:00)` |
| `1825-07` | `[1825-07-01T00:00:00, 1825-08-01T00:00:00)` |
| `1825-07-20` | `[1825-07-20T00:00:00, 1825-07-21T00:00:00)` |
| `1830-03-08T12:00` | `[1830-03-08T12:00:00, 1830-03-08T12:01:00)` |
| `1827~` | `[1827-01-01T00:00:00, 1828-01-01T00:00:00)` — kualifier tidak mempersempitnya |
| `1828-11-12?` | `[1828-11-12T00:00:00, 1828-11-13T00:00:00)` |
| `1825-07-28/1825-09-25` | `[1825-07-28T00:00:00, 1825-09-26T00:00:00)` — mencakup seluruh 25 September |
| `1830-03-28/1830-03-28` | `[1830-03-28T00:00:00, 1830-03-29T00:00:00)` — "sehari penuh itu" |
| `1827/..` | `[1827-01-01T00:00:00, extent.end)` |
| `../1826` | `[extent.start, 1827-01-01T00:00:00)` — tanggal akhir mencakup seluruh tahunnya |
| `-0043-03-15` | `[-0043-03-15T00:00:00, -0043-03-16T00:00:00)` — 15 Maret 44 SM |

## Interval dan akhir terbuka {#intervals}

`A/B` adalah interval; salah satu akhirnya (tidak pernah keduanya) boleh berupa `..` alih-alih
`Date`, artinya "terbuka, diresolusi dari linimasa kampanye" — lihat
[Extent dan focus](#extent-focus). `1825/` (akhir kosong, "tidak diketahui") bukan hal yang sama
dan ditolak: `..` harus ditulis eksplisit. Interval presisi-sama dan nilai-sama seperti
`1830-03-28/1830-03-28` adalah cara sah untuk mengatakan "sehari penuh itu", karena diresolusi
melalui *end* dari tanggal keduanya.

Interval yang akhirnya dimulai sebelum awalnya adalah [`E004`](diagnostics.md#e004) —
`1825-09-25/1825-07-28` tidak valid, bukan otomatis dibalik.

## Extent dan focus {#extent-focus}

`meta.timeline.extent` adalah `When` yang wajib **tertutup** — tanpa `..` di kedua ujungnya —
dan setiap tanggal *linimasa* dalam berkas wajib diresolusi di dalamnya: jendela bab, `when`
entitas dan state, `when` waypoint, `when` peristiwa. Tanggal di luar `extent` adalah
[`E005`](diagnostics.md#e005). `extent` yang hilang atau terbuka adalah
[`E004`](diagnostics.md#e004). Tanggal metadata — `media.date`, `source.accessed`,
`meta.updated` — divalidasi sebagai string `When` tetapi tidak dibatasi oleh `extent`.

Setiap `..` dalam berkas, di mana pun ia muncul, diresolusi ke start atau end milik `extent`
sendiri. Itulah satu-satunya arti dari akhir terbuka.

`meta.timeline.focus` adalah `When` kedua, opsional: jendela bawaan tempat penggeser jelajah
bebas dibuka, yang bisa dilebarkan hingga seluruh `extent` (lihat [§6.3](contract.md#sec-6-3)).
Ia diperiksa terhadap `extent` dengan cara yang sama seperti tanggal linimasa lainnya — di
luarnya, itu juga `E005` — tetapi ia tidak harus menyentuh salah satu ujung `extent`, dan tidak
ada hal lain yang dibatasi olehnya.

## Tahun nol, tahun negatif dan SM {#bce}

Tahun memakai **penomoran astronomis**: `0000` adalah 1 SM, dan setiap tahun yang makin negatif
mundur satu lagi — `-0043` adalah 44 SM (tahun SM = `1 − tahun astronomis`, untuk tahun ≤ 0).
Tidak ada jalan pintas relatif-1970 di sini: sebuah tahun tetaplah tahun, dikonversi dengan cara
yang sama baik positif maupun negatif. `-0000` ditolak langsung — tahun nol ditulis `0000`,
tanpa tanda.

Gregorian proleptik berarti kalender diproyeksikan mundur melewati pengenalannya pada 1582 tanpa
penyesuaian, sehingga `When` bertahun SM atau awal Masehi bukan tanggal yang sama dengan yang
akan ditulis sumber sezaman berkalender Julian — lihat [Kalender](#calendars) untuk cara
menyimpan keduanya.

## Presisi sub-hari {#sub-day}

Presisi menit dan detik ada untuk kasus langka peristiwa yang benar-benar terjadi pada jam
tertentu, tetapi saran kontrak sendiri adalah memakainya **seperlunya saja**: kebanyakan tanggal
sejarah tidak mendukung presisi sejujur itu, dan bab berpresisi menit terasa beku alih-alih
bergulir (lihat [§6.1](contract.md#sec-6-1) — gulir bab memetakan `p ∈ [0,1]` ke
`[start, end)`, sehingga jendela 60 detik nyaris tidak bergerak berapa pun jauhnya pembaca
menggulir). Itu juga cara yang dimaksud untuk **membekukan jam pada satu instan**: beri bab itu
`when` berpresisi menit alih-alih hari atau interval.

## Kalender {#calendars}

Setiap `When` dalam berkas adalah Gregorian proleptik — titik. Tanggal yang tercatat dalam
kalender lain dikonversi sekali, saat berkas ditulis; tanggal aslinya disimpan untuk tampilan
lewat `dateLabel` pada bab, bukan dikodekan dalam `when` itu sendiri:

```json
{
  "when": "1812-09-07",
  "dateLabel": { "en": "7 September 1812 (26 August Old Style)", "id": "7 September 1812 (26 Agustus kalender Julian)" }
}
```

Mekanisme yang sama membawa tanggal Jawa (Anno Javanico) atau Hijriah berdampingan dengan
tanggal Gregorian hasil konversi. `dateLabel` adalah teks tampilan; ia tidak berpengaruh pada
resolusi atau validasi.

## Jebakan {#pitfalls}

- **Jangan pernah memberikan string `When` mentah ke `Date` JS.** `Date.parse("-0044-03-15")`
  mengembalikan tahun `2044` di V8, bukan `NaN` — tidak ada exception untuk ditangkap. Selalu
  parse dengan parser `When` milik engine sendiri (lihat
  [`time.ts`](gh:packages/engine/src/time.ts)).
- **Timestamp milidetik `u64` tidak bisa merepresentasikan data ini.** Unix time sebelum 1970
  bernilai negatif, dan setiap kampanye dalam repositori ini memiliki tanggal sebelum 1970; tick
  selalu `i64` di Rust dan `number` (bertanda) biasa di JS.
- **Akhir interval yang kasar memakan waktu tempuh.** Jika waypoint sebuah unit menyebut
  `"1826-11~/1827-08~"` (sehingga berangkat pada `end(1827-08)` = 1827-09-01T00:00) dan waypoint
  berikutnya menyebut `"1827-09"` (sehingga tiba pada `start(1827-09)` = 1827-09-01T00:00), unit
  itu berteleportasi — waktu tempuh nol antara dua tempat berbeda.
  [`W107`](diagnostics.md#w107) memperingatkan ini ketika lompatannya lebih dari 1 km; perbaiki
  dengan mengakhiri masa tinggal lebih awal atau memundurkan kedatangan. Lihat
  [Entitas](entities.md) untuk model waypoint lengkap.

## Galat: E004 dan E005 {#errors}

- [`E004`](diagnostics.md#e004) — string `When` gagal di-parse, akhir intervalnya dimulai
  sebelum awalnya, atau `meta.timeline.extent` terbuka atau hilang. Ini adalah tangkapan-umum
  untuk apa pun yang salah secara sintaksis atau struktural pada sebuah tanggal.
- [`E005`](diagnostics.md#e005) — `When`-nya berhasil di-parse, tetapi sebuah tanggal *linimasa*
  diresolusi di luar `meta.timeline.extent`. Lebarkan `extent`, atau perbaiki tanggalnya — mana
  pun yang sebenarnya salah.
