---
title: chronomap-check
description: CLI validasi — flag, kode keluar, dry-run --frames, keluaran --json, dan pemeriksaan JSON Schema (S001).
group: api
order: 3
---

`chronomap-check` adalah validator kampanye: menjalankan [`loadCampaign`](engine.md#load-campaign-fn)
terhadap satu atau lebih berkas, opsional memeriksanya terhadap JSON Schema, dan bisa dry-run
pemutaran atau menulis [vektor konformansi](rust-wasm.md#parity). CLI ini adalah `bin` dari
[`@pholidlabs/chronomap-engine`](engine.md), dibangun ke `packages/engine/dist/cli.js`.

```bash
npx chronomap-check campaign.json [...more.json] [--frames] [--strict] [--quiet] [--json] [--vectors <dir>]
```

Di dalam repo ini, setelah `npm run build`, jalankan langsung:

```bash
node packages/engine/dist/cli.js data/campaigns/java-war-1825.json
```

## Flag {#flags}

| Flag | Efek |
|---|---|
| `--frames` | Dry-run pemutaran: mencetak posisi setiap pasukan pada progres scroll p = 0, 0,5, dan 1 di setiap bab, dan menampilkan diagnostik level `info` (tersembunyi tanpa flag ini). |
| `--strict` | `warning` menggagalkan run (kode keluar 1), tidak hanya `error`. |
| `--quiet` | Hanya mencetak diagnostik level `error`. |
| `--json` | Laporan machine-readable di stdout menggantikan daftar human-readable (lihat [bentuk `--json`](#json-shape)). |
| `--vectors <dir>` | Menulis [vektor emas](rust-wasm.md#parity) ke `<dir>` untuk setiap berkas yang diperiksa (lihat [`--vectors`](#vectors)). |

Argumen berawalan `--` lain yang tidak dikenal menggagalkan run sebelum berkas apa pun dibaca
([kode keluar 2](#exit-codes)); setiap argumen bukan-`--` adalah path berkas kampanye.
`--vectors` mengonsumsi argumen tepat setelahnya sebagai direktorinya, jadi `--vectors` tidak
boleh menjadi argumen terakhir di baris perintah.

## Kode keluar {#exit-codes}

| Kode | Arti |
|---|---|
| `0` | Semua berkas diperiksa; tidak ada diagnostik level `error`, dan tidak ada `warning` di bawah `--strict`. |
| `1` | Setidaknya satu berkas menghasilkan diagnostik level `error`, atau (`--strict`) sebuah `warning`. |
| `2` | Galat penggunaan: tidak ada berkas yang diberikan, flag `--` yang tidak dikenal, atau `--vectors` tanpa argumen direktori (hilang, atau justru flag lain). Tidak ada yang diperiksa; `usage: chronomap-check …` dicetak ke stderr lebih dulu. |

## Lapisan validasi {#validation-layers}

Dua lapisan berjalan, keduanya melaporkan [diagnostik](diagnostics.md) dengan `code` yang stabil
dan `path` berupa JSON Pointer (kontrak [§8](contract.md#sec-8)):

1. **Semantik** — [`loadCampaign`](engine.md#load-campaign-fn). Selalu berjalan; ini pemeriksaan
   yang sama dengan yang dilakukan `ChronoMapEngine.load` dan inti Rust.
2. **Struktural** — JSON Schema di `schema/campaign.schema.json`, dilaporkan sebagai kode
   `S001`. Hanya berjalan ketika `ajv` dan `ajv-formats` terpasang di samping CLI; jika tidak,
   CLI mencetak catatan ke stderr dan melewati pemeriksaan schema, tetapi pemeriksaan semantik
   tetap berjalan:

   ```text
   note: ajv is not installed, so JSON Schema (S001) checks are skipped; semantic checks still run
   ```

   Aktifkan dengan:

   ```bash
   npm i -D ajv ajv-formats
   ```

   Setiap kegagalan schema yang berbeda pada sebuah JSON Pointer menjadi satu diagnostik
   `S001`; kegagalan `additionalProperties` ditulis ulang untuk menyebut properti yang
   bermasalah dan mengingatkan bahwa field kustom harus diawali `x-`, dan kegagalan `enum`
   mendaftar nilai-nilai yang diizinkan.

## Keluaran human-readable {#human-output}

Tanpa `--json`, setiap berkas mencetak path-nya, satu baris hitungan, lalu satu baris per
diagnostik (`info` hanya dengan `--frames`; hanya `error` di bawah `--quiet`), lalu — jika
berkas berhasil termuat menjadi kampanye — satu baris ringkasan:

```text
data/campaigns/java-war-1825.json
  0 error(s), 0 warning(s), 0 info
  5 factions · 34 places · 9 entities · 43 events · 38 chapters
```

Berkas dengan temuan mendaftar satu baris per diagnostik sebelum ringkasan,
`  ${level.padEnd(7)} ${code} ${path}  ${message}`:

```text
data/campaigns/fixtures/null-island.json
  0 error(s), 1 warning(s), 0 info
  warning W115 /chapters/1/when  Chapter "ch-march" starts 7 day(s) before "ch-muster" ends; time jumps backwards when scrolling between them
  2 factions · 3 places · 5 entities · 4 events · 4 chapters
```

`W115` pada fixture itu disengaja — ia ada untuk menguji pemeriksaan tersebut (lihat
[`W115`](diagnostics.md#w115)).

### --frames {#frames-output}

Dengan `--frames`, setiap bab mendapat bloknya sendiri, satu baris per progres scroll yang
di-sampling (`p = 0, 0,5, 1`) menampilkan instan ISO, peristiwa mana yang aktif, dan posisi serta
status setiap pasukan yang bergerak atau menetap. Dari `java-war-1825.json`, bab satu-hari
`ch-06-tegalrejo` (`when: "1825-07-20"`) dan bab interval berikutnya `ch-07-selarong`
(`when: "1825-07-21/1825-07-27"`) — waypoint track pertama `diponegoro-hq` adalah `when` bertitik,
sehingga ia melintas di Tegalrejo alih-alih menetap di sana, dan sudah dalam perjalanan
sepanjang bab pertama:

```text
  Playback dry-run (p = scroll progress through the chapter):

  ▸ ch-06-tegalrejo — Tegalrejo burns  [1825-07-20]
    p=0.0 1825-07-20T00:0  active: tegalrejo-attack
           units: diponegoro-hq@[110.351, -7.787]→0%
    p=0.5 1825-07-20T11:5  active: tegalrejo-attack
           units: diponegoro-hq@[110.333, -7.824]→50%
    p=1.0 1825-07-20T23:5  active: tegalrejo-attack
           units: diponegoro-hq@[110.315, -7.862]→100%

  ▸ ch-07-selarong — The standard raised at Selarong  [1825-07-21/1825-07-27]
    p=0.0 1825-07-21T00:0  active: selarong-base
           units: diponegoro-hq@[110.315, -7.862]
    p=0.5 1825-07-24T11:5  active: —
           units: diponegoro-hq@[110.315, -7.862]
    p=1.0 1825-07-27T23:5  active: —
           units: diponegoro-hq@[110.315, -7.862]
```

Satu baris pasukan berbentuk `id@[lng, lat]`, lalu `→NN%` saat bergerak (`legProgress` sebagai
persentase), lalu `(status)` jika state yang berlaku bukan `'active'`, lalu `n=N` jika ia punya
kekuatan yang ter-resolve. Run yang sesungguhnya mendaftar setiap pasukan yang ada pada tick
tersebut, bukan cuma satu. Ini adalah pipeline `resolveFrame`/`chapterTime` yang sama seperti di
[halaman engine](engine.md#chapter-time) — dry-run ini ada untuk menangkap kesalahan tanggal
lewat inspeksi: jalankan dan baca di mana setiap pasukan berada di awal, tengah, dan akhir
setiap bab (kontrak [§10](contract.md#sec-10)).

## Bentuk --json {#json-shape}

Dengan `--json`, tidak ada apa pun selain laporan JSON yang keluar ke stdout — satu entri array
per berkas, dicetak sekali setelah setiap berkas selesai diperiksa:

```ts
type Report = Array<{
  file: string;
  counts: { error: number; warning: number; info: number };
  diagnostics: Array<{ level: 'error' | 'warning' | 'info'; code: string; path: string; message: string }>;
}>;
```

`diagnostics` menyelipkan temuan struktural `S001` (lebih dulu) dengan temuan semantik dari
`loadCampaign`, dalam urutan itu:

```json
[
  {
    "file": "data/campaigns/java-war-1825.json",
    "counts": { "error": 0, "warning": 0, "info": 0 },
    "diagnostics": []
  },
  {
    "file": "data/campaigns/fixtures/null-island.json",
    "counts": { "error": 0, "warning": 1, "info": 1 },
    "diagnostics": [
      { "level": "info", "code": "I201", "path": "/events/2", "message": "Event \"peace-decree\" has no location; it will appear on the timeline but not on the map" },
      { "level": "warning", "code": "W115", "path": "/chapters/1/when", "message": "Chapter \"ch-march\" starts 7 day(s) before \"ch-muster\" ends; time jumps backwards when scrolling between them" }
    ]
  }
]
```

Array `diagnostics` milik `--json` selalu memuat setiap diagnostik, termasuk `info`, dengan
atau tanpa `--frames` — hanya daftar human-readable yang menyembunyikan `info` tanpa `--frames`.

## --vectors {#vectors}

```bash
chronomap-check --vectors test-vectors data/campaigns/*.json data/campaigns/fixtures/*.json
```

Menulis `<dir>/time.json` sekali (setiap string `When` yang diketahui
[`vectors.ts`](gh:packages/engine/src/vectors.ts) sebagai menarik — setiap presisi dan
kualifier, hari kabisat, tahun nol, SM, ujung terbuka, dan input yang seharusnya gagal
di-parsing), lalu satu `<dir>/<name>.frames.json` per berkas kampanye yang berhasil termuat —
`resolveFrame` pada progres scroll `p` di setiap bab, plus diagnostik loader. Kampanye di bawah
direktori `fixtures/` (seperti `null-island.json`) mendapat bentuk "detailed": sampling per
seperempat langkah (`p = 0, .25, .5, .75, 1`) dengan polyline jejak penuh; kampanye lain
mendapat `p = 0, .5, 1` dengan hanya jumlah titik jejak, satu frame per baris sehingga
perubahan semantik tampak sebagai diff yang bisa dibaca. Float dibulatkan ke `1e-6` di kedua
bentuk — toleransi persis yang diperiksa
[`crates/chronomap-core/tests/vectors.rs`](rust-wasm.md#parity).

Inilah [vektor emas](rust-wasm.md#parity) yang menjadi acuan uji port Rust — jalankan ini
setelah perubahan apa pun di `packages/engine/src/`, sebelum menyentuh port Rust agar cocok.

## npm run check {#npm-run-check}

Skrip `npm run check` milik repo ini sendiri menjalankan CLI atas setiap kampanye di repo:

```bash
npm run check
# node packages/engine/dist/cli.js data/campaigns/*.json data/campaigns/fixtures/*.json
```

Menurut [CLAUDE.md](gh:CLAUDE.md), ini harus melaporkan nol galat sebelum commit. Satu-satunya
peringatan yang diharapkan di seluruh korpus adalah [`W115`](diagnostics.md#w115) pada
`data/campaigns/fixtures/null-island.json` — fixture itu sengaja menumpangtindihkan dua bab
untuk menguji pemeriksaan tersebut.
