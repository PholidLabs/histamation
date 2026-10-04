---
title: Bahasa
description: String biasa atau peta bahasa, mendeklarasikan bahasa, terjemahan yang belum lengkap, dan cara aplikasi memilih bahasa.
group: authoring
order: 8
---

## Satu berkas, banyak bahasa {#overview}

Sebuah kampanye membawa terjemahannya sendiri — tidak ada berkas locale terpisah. Setiap bidang yang dapat dibaca manusia dalam berkas adalah [teks terlokalisasi](#localized-text), dan `meta.languages` beserta `meta.defaultLanguage` menyatakan bahasa apa saja yang ada dan mana yang menjadi cadangan (fallback) ([§2](contract.md#sec-2)).

## String biasa atau peta bahasa {#localized-text}

Setiap bidang terlokalisasi berupa string biasa, dalam bahasa bawaan, atau peta dari tag bahasa BCP-47 ke string:

```json
"title": { "en": "Arrest at Magelang", "id": "Penangkapan di Magelang" }
```

String biasa adalah singkatan dari "ini sudah dalam `meta.defaultLanguage`" — pakai bebas untuk kampanye satu bahasa, atau untuk bidang yang belum diterjemahkan dalam kampanye multibahasa. Peta bahasa harus menyertakan bahasa bawaan, atau berkas gagal dimuat ([E008](diagnostics.md#e008)); setiap kunci di dalamnya harus salah satu bahasa yang dideklarasikan di `meta.languages`, atau berkas juga gagal dimuat ([E009](diagnostics.md#e009)).

## Bidang yang dilokalkan {#which-fields}

Nama, judul, deskripsi, dan teks naratif terlokalisasi: `name`, `title`, `subtitle`, `description`, `contentWarning`, `modernName`, `summary`, `label`, `dateLabel`, `body`, `caption`, `alt`, dan bidang `notes` atau `note` mana pun, di mana pun ia muncul — pada tempat, entitas, titik singgah, peristiwa, bab, sumber, atau media. `commanders` milik entitas atau peserta adalah daftar yang setiap namanya sendiri adalah teks terlokalisasi, sehingga gelar bisa diterjemahkan meski nama di baliknya tidak. Id, nilai `kind`, nilai `status`, dan setiap bidang lain yang dibaca mesin tidak pernah dilokalisasi — bidang itu tetap string yang sama di setiap bahasa.

## Mendeklarasikan bahasa {#declaring-languages}

```json
"meta": {
  "languages": ["en", "id"],
  "defaultLanguage": "en"
}
```

`languages` harus memuat minimal satu bahasa, dan `defaultLanguage` harus salah satu di antaranya, atau berkas gagal dimuat ([E014](diagnostics.md#e014)). Menambahkan bahasa di sini tidak mengharuskan semuanya langsung diterjemahkan — ini sekadar daftar periksa yang dipakai pemvalidasi untuk menguji setiap peta bahasa.

## Terjemahan yang hilang dan tak terduga {#missing-translations}

Peta bahasa yang kehilangan salah satu bahasa *lain* yang dideklarasikan tetap dapat dimuat — hanya memberi peringatan ([W101](diagnostics.md#w101)), karena sebuah kampanye boleh menumbuhkan terjemahannya seiring waktu:

```json
"name": { "en": "Blue Legion" }
```

dengan `"languages": ["en", "id"]` memberi peringatan bahwa terjemahan Indonesianya belum ada, tetapi tetap berjalan. Kunci yang sama sekali tidak ada di `meta.languages` — salah ketik, atau bahasa yang tidak pernah dideklarasikan — adalah galat, bukan sekadar peringatan ([E009](diagnostics.md#e009)), karena bahasa yang tidak dikenal mesin tidak akan pernah bisa dipilih.

## Cara aplikasi memilih bahasa {#language-selection}

Meresolusi sebuah teks memilih, secara berurutan: bahasa yang diminta, lalu `meta.defaultLanguage`, lalu terjemahan mana pun yang kebetulan muncul pertama dalam peta ([§7.4](contract.md#sec-7-4)). Aplikasi demo mengingat bahasa antarmuka pembaca di seluruh halaman landing dan peta di [`/app/`](/app/), dan pemilih bahasanya hanya pernah menawarkan bahasa yang benar-benar dideklarasikan kampanye yang dimuat di `meta.languages` — mencoba beralih ke bahasa yang tidak dideklarasikan tidak melakukan apa pun.
