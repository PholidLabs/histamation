---
title: Peristiwa
description: Pertempuran, pengepungan, perjanjian, dan hal lain yang terjadi, lengkap dengan peserta, hasil, dan fase pada linimasa.
group: authoring
order: 5
---

## Apa yang membuat sesuatu menjadi peristiwa {#what-is-an-event}

Jika sesuatu **terjadi**, itu adalah peristiwa. Jika sesuatu **bergerak atau berpindah tangan**, itu adalah [entitas](entities.md) ([§2.1](contract.md#sec-2-1)). Peristiwa memiliki `when` — titik atau interval — dan, alih-alih status berkelanjutan, sebuah **fase**: upcoming (akan terjadi), active (berlangsung), atau past (telah lewat).

## Bidang {#fields}

`id`, `kind`, `name`, dan `when` wajib diisi:

```jsonc
{ id, kind, name, when, at?, certainty?, participants?, outcome?, summary?, importance?, sources?, media?, notes? }
```

Skema juga mengizinkan larik `tags` berupa string biasa untuk penyaringan di alat penyusunan, sama seperti pada [entitas](entities.md#common-fields); mesin itu sendiri tidak pernah membacanya.

## Jenis {#kinds}

`battle, siege, skirmish, raid, massacre, capture, surrender, negotiation, treaty, proclamation, decree, uprising, appointment, arrest, exile, birth, death, political, other`, atau `x-…` kustom. Berkas Napoleon memakai `x-fire` untuk kebakaran Moskow:

```json
{ "id": "fire-of-moscow", "kind": "x-fire", "when": "1812-09-14/1812-09-18", "at": "moscow", "importance": 2 }
```

## Waktu dan fase {#when-and-phase}

`when` memakai sintaks yang sama seperti di seluruh berkas — lihat [Waktu](time.md). Pada tick `t`, fasenya adalah `upcoming` jika `t < start`, `active` jika `start ≤ t < end`, dan `past` jika `t ≥ end`. Sebuah frame hanya pernah membawa peristiwa `active` dan `past` — peristiwa `upcoming` sama sekali belum sampai ke peta sebelum jendelanya terbuka. Setiap peristiwa membawa `progress` (0 sampai 1 selama aktif) dan `sinceEnd` (detik sejak berakhir), sehingga perenderan bisa membuat penanda berdenyut selagi peristiwa berlangsung dan memudar sesudahnya ([§5](contract.md#sec-5)).

## Lokasi: `at` bersifat opsional {#location}

`at` adalah id tempat atau koordinat langsung, tipe `Location` yang sama dipakai di mana-mana. Boleh dihilangkan untuk peristiwa tanpa satu titik tunggal, seperti dekret atau perubahan kebijakan: peristiwa itu tetap muncul di linimasa dan panel konteks, hanya tidak di peta ([I201](diagnostics.md#i201)):

```json
{ "id": "peace-decree", "kind": "decree", "when": "-0009~" }
```

Ketika `at` diisi, kepastian mengikuti urutan jatuh yang sama seperti pada [fortification](entities.md#fortifications): `certainty` milik peristiwa itu sendiri, atau — jika `at` berupa id tempat — kepastian tempat itu.

```json
{ "id": "new-era", "kind": "political", "when": "0001-01-01",
  "at": [0.05, 0.02], "certainty": "exact" }
```

## Peserta {#participants}

Setiap entri dalam `participants[]` membutuhkan `faction`; selebihnya opsional:

| Kolom | Arti |
|---|---|
| `faction` (wajib) | Harus merujuk ke faksi yang terdaftar. |
| `role` | `attacker`, `defender`, `belligerent`, `negotiator`, `mediator`, `perpetrator`, `victim`, atau `party`. |
| `commanders` | Daftar [nama terlokalisasi](languages.md). |
| `strength`, `losses` | Bilangan bulat, atau `{min, max, note?}` bila sumber tidak sepakat — tipe `quantity` yang sama dengan [kekuatan pada titik singgah atau status](entities.md#strength). |

```json
"participants": [
  { "faction": "blue", "role": "attacker", "commanders": ["General A"],
    "strength": 4500, "losses": { "min": 300, "max": 500 } },
  { "faction": "red", "role": "defender", "strength": 2000 }
]
```

Sebuah `quantity` dengan `min` lebih besar dari `max` gagal dimuat ([E012](diagnostics.md#e012)).

## Hasil dan ringkasan {#outcome}

`outcome` adalah `{ victor?, summary? }` — `victor` adalah id faksi, dan `summary`-nya adalah [teks terlokalisasi](languages.md). Bidang `summary` di tingkat atas pada peristiwa itu sendiri adalah deskripsi terpisah yang lebih singkat, tidak bergantung pada `outcome`:

```json
"outcome": {
  "victor": "british",
  "summary": { "en": "The kraton fell and was plundered; Hamengkubuwono II was deposed and exiled to Penang.", "id": "…" }
}
```

Tidak semua peristiwa punya pemenang — serangan yang disintasi kedua pihak, atau pertempuran tanpa hasil jelas, bisa hanya memberi `summary`:

```json
"outcome": { "summary": { "en": "Tegalrejo was shelled and burned; Diponegoro and his uncle Mangkubumi escaped.", "id": "…" } }
```

## Tingkat kepentingan {#importance}

`importance` berkisar dari 1 (utama) sampai 5; perenderan boleh menyembunyikan penanda berimportansi rendah saat diperkecil (zoom out) ([§5](contract.md#sec-5)). Gunakan ini untuk menjaga peta yang padat tetap terbaca tanpa menghilangkan apa pun dari datanya sendiri:

```json
{ "id": "arrest-at-magelang", "importance": 1 }
```

```json
{ "id": "hb4-death", "importance": 3 }
```
