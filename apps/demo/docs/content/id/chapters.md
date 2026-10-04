---
title: Bab
description: Langkah naratif yang menggerakkan jam peta saat pembaca menggulir, lengkap dengan kamera, fokus, dan format body yang dibatasi.
group: authoring
order: 6
---

## Bab menggerakkan cerita {#overview}

Sebuah kampanye membutuhkan minimal satu bab — berkas tanpa bab gagal dimuat ([E018](diagnostics.md#e018)), dan pemutaran dimulai dari bab pertama. Bab adalah jendela waktu ditambah kamera, fokus, dan teks naratif: satuan dari scrollytelling ([§2.1](contract.md#sec-2-1)).

## Bidang {#fields}

`id`, `title`, `when`, dan `body` wajib diisi:

```jsonc
{ id, part?, title, when, dateLabel?, body, camera?, focus?, media?, sources?, notes? }
```

`part` mengelompokkan bab ke dalam daftar isi; lihat [Bagian](#parts). `dateLabel` menimpa tanggal yang diformat otomatis — gunakan untuk menampilkan tanggal kalender Julian (Old Style) atau Jawa berdampingan dengan `when` berkalender Gregorian proleptik (lihat [Waktu dan tanggal](time.md)).

## Guliran menggerakkan jam {#scroll-and-clock}

Jendela sebuah bab adalah rentang hasil resolusi dari `when`-nya. Progres gulir `p ∈ [0, 1]` melalui elemen langkah (step) bab dipetakan ke sebuah tick:

```text
t = start + floor(p × (end − start − 1))
```

`p` dijepit ke `[0, 1]`, dan `NaN` dibaca sebagai `0`, sehingga hasilnya selalu berada dalam `[start, end)` ([§6.1](contract.md#sec-6-1)).

### Rasanya bab berpresisi hari, bulan, dan tahun {#chapter-feel}

Satu rumus berlaku untuk semua kasus, karena skalanya mengikuti ukuran jendelanya:

- Bab berskala **hari** hampir tidak menggerakkan jam — seluruh langkah gulir mencakup 86.400 detik.
- Bab berskala **bulan atau interval** menelusurinya, sehingga pasukan bergerak dan benteng berganti status seiring pembaca menggulir.
- Bab berskala **tahun** menelusuri seluruh tahun itu.
- Untuk membekukan jam pada satu momen, beri bab presisi menit.

Bab berskala hari hampir tidak bergerak sama sekali:

```json
{ "id": "ch-02-geger-sepehi", "when": "1812-06-20" }
```

sedangkan bab berinterval menelusuri bulan-bulan yang dicakupnya:

```json
{ "id": "ch-20-forts", "when": "1827-01/1827-08-28" }
```

## Mengurutkan bab {#ordering}

Bab sebaiknya diurutkan berdasarkan mulainya. Jika satu bab mulai sebelum mulainya bab *sebelumnya*, itu adalah kilas balik (flashback) ([W104](diagnostics.md#w104)). Bahkan tanpa kilas balik, jika jendela satu bab tumpang tindih dengan mulainya bab *berikutnya*, jam melompat mundur tepat di batas antara keduanya ([W115](diagnostics.md#w115)). `data/campaigns/fixtures/null-island.json` sengaja melakukan ini untuk menguji pemeriksaan itu: `ch-muster` berjalan `-0010-03/-0010-05` (berakhir 1 Juni), dan bab berikutnya, `ch-march`, mulai `-0010-05-25` — lima hari sebelum `ch-muster` berakhir.

## Kamera {#camera}

`camera` adalah `{ center, zoom, pitch?, bearing?, durationMs?, transition? }`, yang dipetakan langsung ke `flyTo`, `easeTo`, atau `jumpTo` milik MapLibre atau Mapbox — `transition` memilih yang mana (`fly`, `ease`, atau `jump`). Hanya `center` dan `zoom` yang wajib:

```json
{ "center": [110.3641, -7.8057], "zoom": 14.5, "pitch": 55, "bearing": 10, "durationMs": 2500 }
```

## Fokus {#focus}

`focus` adalah daftar id tempat, entitas, atau peristiwa untuk disorot. **Tanpa kamera, mesin menyesuaikan tampilan ke koordinat fokus** — sebuah unit menyumbangkan posisinya saat ini beserta jejaknya — sambil mempertahankan `meta.map.pitch`. Tanpa kamera maupun fokus, kamera tidak bergerak ([W103](diagnostics.md#w103)) ([§6.2](contract.md#sec-6-2)):

```json
"focus": ["geger-sepehi", "kraton-yogyakarta"]
```

Peristiwa fokus yang belum terjadi selama bab itu, atau entitas fokus yang tidak ada selama bab itu, biasanya menandakan salah ketik tanggal — pemvalidasi memberi peringatan ([W112](diagnostics.md#w112)).

## Bagian {#parts}

`parts` adalah daftar opsional di tingkat atas berisi `{ id, title, description? }` yang mengelompokkan bab untuk daftar isi. Sebuah bab bergabung ke sebuah part lewat bidang `part`-nya sendiri, merujuk ke id part itu:

```json
{ "id": "prologue", "title": { "en": "Prologue", "id": "…" } }
```

## Body: Markdown yang dibatasi {#body}

`body` adalah [teks terlokalisasi](languages.md) dalam Markdown yang **dibatasi**: paragraf dipisah baris kosong, `*em*`, `**strong**`, dan `[teks](https://…)` — hanya tautan `http(s)` mutlak; apa pun selain itu yang ditulis dalam sintaks tautan tetap terurai, tetapi dirender sebagai teks biasa, bukan tautan. Tidak ada sintaks judul (heading), daftar (list), gambar, atau HTML mentah, dan HTML mentah dalam body membuat berkas gagal dimuat ([E017](diagnostics.md#e017)):

```json
"body": { "en": "From about the age of eight he was raised by his great-grandmother, Ratu Ageng, on her estate at **Tegalrejo**, north-west of the kraton.\n\nHe grew up away from court life and close to the religious teachers and farmers of the countryside.", "id": "…" }
```

Perenderan membangun node DOM sungguhan dari subset ini, tidak pernah menetapkan string mentah ke `innerHTML` ([§7.5](contract.md#sec-7-5)); tautan dengan skema URL yang tidak aman — `javascript:`, `data:`, `vbscript:`, atau `file:` — juga membuat berkas gagal dimuat ([E015](diagnostics.md#e015)), aturan yang sama dibahas [Sumber dan media](sources-media.md#url-safety) untuk setiap URL lain dalam berkas.

`media` dan `sources` pada sebuah bab merujuk ke [media](sources-media.md#media) dan [sumber](sources-media.md#sources) dengan cara yang sama seperti pada entitas atau peristiwa.
