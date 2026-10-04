---
title: Penguji tanggal
description: Ketik string When dan lihat persis bagaimana mesin membacanya — rentang tick, presisi, kualifikasi, dan cara membacanya dalam tiap bahasa.
group: tools
order: 2
tool: when-tester
---

Setiap tanggal dalam kampanye adalah string `When`, dan setiap `When` diurai menjadi rentang tick setengah terbuka, `[start, end)`. Penguji ini menjalankan pengurai milik mesin, `parseWhen`, selagi Anda mengetik, sehingga hasilnya persis sama dengan yang diterima berkas kampanye. Aturannya dijelaskan di [Waktu dan tanggal](time.md).

Beberapa hal yang dapat dicoba:

- `1825` dan `1825-07-20` sama-sama menandai satu tanggal, tetapi yang pertama mencakup setahun penuh.
- `1825-07/1830-03` berlangsung dari hari pertama Juli 1825 hingga akhir Maret 1830.
- `1827/..` punya ujung terbuka. Dalam kampanye, ujung itu berlanjut hingga akhir `meta.timeline.extent`; di sini ditampilkan sebagai terbuka.
- `-0043-03-15` adalah 44 SM: tahun memakai penomoran astronomis, jadi tahun 0 adalah 1 SM.
- `1825-7-20` ditolak: bulan dan hari selalu dua digit. Dalam kampanye, itu galat [E004](diagnostics.md#e004).
