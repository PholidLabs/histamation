# Histamation Data Contract v1.0

Ini adalah terjemahan yang bersifat informatif. Versi bahasa Inggris [`docs/DATA-CONTRACT.md`](../DATA-CONTRACT.md) adalah normatif.

**Status:** draf untuk implementasi · **Berlaku untuk:** berkas kampanye `histamation: "1.x"`
**Artefak normatif:** [`schema/campaign.schema.json`](../../schema/campaign.schema.json) (struktur), [`packages/engine/src/`](../../packages/engine/src) (semantik), [`test-vectors/`](../../test-vectors) (keluaran yang diharapkan)

Dokumen ini mendefinisikan bagaimana berkas kampanye (data plug-in) ditulis, dan bagaimana mesin Histamation memuatnya, memeriksanya, dan memutarnya. Berkas apa pun yang lolos validasi harus dapat diputar di mesin mana pun yang sesuai tanpa perubahan kode. Contoh Perang Jawa dan Napoleon 1812 memakai format yang persis sama.

---

## 1. Prinsip desain

1. **Data menggambarkan sejarah, bukan render.** Berkas menyatakan *apa* yang ada, *di mana* dan *kapan*. Berkas tidak pernah berisi properti paint Mapbox atau MapLibre. Tema mesin yang menentukan bagaimana `fortification` dalam status `besieged` tampak. Objek petunjuk `style` kecil yang netral terhadap renderer diperbolehkan.
2. **Waktu itu jujur.** "1827" dan "1827-01-01T00:00:00Z" berarti hal yang berbeda. Setiap tanggal membawa presisinya, dan tanggal dapat ditandai tidak pasti atau perkiraan.
3. **Lokasi itu jujur.** Setiap tempat membawa `certainty` (`exact` / `approximate` / `conjectural`), dan renderer harus mampu menampilkan perbedaannya.
4. **Pemutaran deterministik.** Berkas yang sama pada tick yang sama menghasilkan frame yang sama di referensi JS maupun di core Rust/WASM, dan vektor uji menegakkan hal ini.
5. **Satu berkas mandiri.** Sumber, kredit media, terjemahan, dan narasi semuanya menyertai data.
6. **Dapat diperluas tanpa merusak.** Setiap objek menerima kolom berawalan `x-`, dan nilai `kind` menerima jenis kustom `x-`. Mesin mengabaikan apa yang tidak dipahaminya.

---

## 2. Anatomi berkas

```jsonc
{
  "$schema": "../schema/campaign.schema.json",   // editor autocomplete; ignored by engines
  "histamation": "1.0",                           // contract version (required)
  "meta":      { … },  // id, title, languages, timeline extent, initial map view
  "factions":  [ … ],  // sides, with colors (required, ≥1)
  "parts":     [ … ],  // optional chapter grouping for a table of contents
  "places":    [ … ],  // static gazetteer: named points with certainty
  "entities":  [ … ],  // things that exist over time: unit | fortification | territory | route
  "events":    [ … ],  // things that happen: battle, siege, treaty, arrest…
  "chapters":  [ … ],  // the story: time window + camera + text (required, ≥1)
  "sources":   [ … ],  // citations
  "media":     [ … ]   // images with alt text, credit and license
}
```

**ID.** Semua ID berbentuk kebab-case (`^[a-z0-9]+(-[a-z0-9]+)*$`) dan berbagi **satu namespace di seluruh berkas**, sehingga sebuah tempat dan sebuah peristiwa tidak boleh sama-sama bernama `gawok`. Satu namespace memungkinkan `chapter.focus` mencampur tempat, entitas, dan peristiwa tanpa tag jenis, dan membuat pesan galat tidak ambigu.

**Teks.** Setiap kolom yang dapat dibaca manusia berupa string biasa (dalam `meta.defaultLanguage`) atau peta bahasa:

```json
"title": { "en": "Arrest at Magelang", "id": "Penangkapan di Magelang" }
```

Peta bahasa harus menyertakan bahasa default. Terjemahan yang hilang untuk bahasa lain yang dideklarasikan menghasilkan peringatan, bukan galat.

### 2.1 Empat konsep inti

| Konsep | Punya waktu? | Punya geometri? | Berubah seiring waktu? | Dirender sebagai |
|---|---|---|---|---|
| **Place** (tempat) | tidak | titik | tidak | label dan penanda, dengan halo ketidakpastian |
| **Entity** (entitas) | interval keberadaan | track, titik, poligon, atau garis | ya: posisi, status, pemilik, kekuatan | pasukan bergerak, ikon benteng, wilayah terarsir, garis rute |
| **Event** (peristiwa) | titik atau interval | titik opsional | fase: akan datang, aktif, lampau | berdenyut saat aktif, penanda pudar setelahnya |
| **Chapter** (bab) | jendela waktu | kamera dan fokus | menggerakkan jam | langkah gulir, dengan narasi dan media |

Aturan praktis: jika sesuatu **bergerak atau berpindah tangan**, itu entitas. Jika sesuatu **terjadi**, itu peristiwa. Jika sesuatu **hanya berada di suatu tempat**, itu tempat. Entitas dan peristiwa biasanya merujuk tempat lewat ID (`"at": "goa-selarong"`) alih-alih mengulang koordinat.

---

## 3. Model waktu

### 3.1 Sintaks `When` (subset EDTF / ISO 8601-2)

```
When      = Date | Interval
Interval  = (Date | "..") "/" (Date | "..")          ; not both ".."
Date      = Year [ "-" MM [ "-" DD [ "T" hh ":" mm [ ":" ss ] ] ] ] [ Qualifier ]
Year      = [ "-" ] 4DIGIT                            ; astronomical: 0000 = 1 BCE, -0043 = 44 BCE
Qualifier = "?" (uncertain) | "~" (approximate) | "%" (both)
```

| Contoh | Makna |
|---|---|
| `1825` | suatu waktu di tahun 1825 (presisi tahun) |
| `1825-07` | Juli 1825 |
| `1825-07-20` | 20 Juli 1825 |
| `1830-03-08T12:00` | presisi menit (gunakan seperlunya; lihat §3.4) |
| `1827~` | sekitar tahun 1827 |
| `1828-11-12?` | 12 November 1828, tanggal tidak pasti |
| `1825-07-28/1825-09-25` | dari 28 Juli hingga 25 September 1825 |
| `1827/..` | dari 1827 hingga akhir linimasa |
| `-0043-03-15` | 15 Maret 44 SM (Gregorian proleptik) |

Dicadangkan untuk versi minor berikutnya, dan saat ini ditolak: tahun berawalan `Y`, musim (`2001-21`), digit yang tidak ditentukan (`18XX`), dan akhir interval kosong (`1825/`).

### 3.2 Resolusi menjadi tick (normatif)

Mesin bekerja dalam **tick**: bilangan bulat **detik sejak 1970-01-01T00:00:00 dalam kalender Gregorian proleptik, tanpa zona waktu**. Tick bernilai negatif sebelum 1970. Ini adalah `i64` di Rust dan `number` biasa di JS (eksak hingga ±2⁵³).

Setiap tanggal mencakup **rentang setengah-terbuka `[start, end)`** yang ditentukan oleh presisinya:

| Presisi | `start` | `end` (eksklusif) |
|---|---|---|
| tahun `1825` | 1825-01-01T00:00:00 | 1826-01-01T00:00:00 |
| bulan `1825-07` | 1825-07-01T00:00:00 | 1825-08-01T00:00:00 |
| hari `1825-07-20` | 1825-07-20T00:00:00 | 1825-07-21T00:00:00 |
| menit `…T14:30` | 14:30:00 | 14:31:00 |
| detik `…T14:30:05` | 14:30:05 | 14:30:06 |

- **Interval `A/B`** → `[start(A), end(B))`. Jadi `1825-07-28/1825-09-25` mencakup seluruh tanggal 25 September, dan `1830-03-28/1830-03-28` berarti "sepanjang hari itu".
- **Akhir terbuka** (`..`) mengambil nilai dari `meta.timeline.extent`.
- **Qualifier tidak pernah mengubah rentang.** Qualifier hanyalah petunjuk tampilan dan gaya (misalnya "c. 1827", atau garis putus-putus).
- `meta.timeline.extent` harus tertutup, dan setiap tanggal *linimasa* dalam berkas harus berada di dalamnya (galat `E005`). Tanggal metadata (`media.date`, `source.accessed`, `meta.updated`) divalidasi tetapi tidak dibatasi rentang itu.

Implementasi harus melakukan konversi dengan aritmetika kalender bilangan bulat: days-from-civil (Hinnant) × 86400 + waktu dalam hari. Lihat `packages/engine/src/time.ts` dan `test-vectors/time.json`.

### 3.3 Kalender

Semua nilai `When` adalah **Gregorian proleptik**. Tanggal yang dicatat dalam kalender lain dikonversi saat berkas ditulis, dan bentuk aslinya dapat ditampilkan dengan `chapter.dateLabel`:

```json
"when": "1812-09-07",
"dateLabel": { "en": "7 September 1812 (26 August Old Style)", "id": "7 September 1812 (26 Agustus kalender Julian)" }
```

Mekanisme yang sama berlaku untuk tanggal Jawa (Anno Javanico) atau Hijriah.

### 3.4 Jebakan yang dihindari model ini (dan satu yang diciptakannya)

- **`timestamp: u64` pada PRD tidak dapat merepresentasikan 1825.** Waktu Unix sebelum 1970 bernilai negatif. Gunakan tick `i64`.
- **`Date.parse("-0044-03-15")` mengembalikan tahun 2044 di V8**, bukan NaN. Jangan pernah memberikan string `When` mentah ke `Date`.
- **Akhir interval yang kasar memakan waktu perjalanan.** Misalkan sebuah waypoint bertuliskan `"1826-11~/1827-08~"` (depart = 1827-09-01T00:00) dan waypoint berikutnya `"1827-09"` (arrive = 1827-09-01T00:00). Pasukan pun berteleportasi. Validator memberi peringatan untuk ini (`W107`) ketika lompatannya melebihi 1 km. Perbaiki dengan mengakhiri persinggahan lebih awal atau tiba lebih lambat.

---

## 4. Entities (entitas)

```jsonc
{
  "id": "diponegoro-hq", "kind": "unit", "faction": "diponegoro",
  "name": { "en": "…", "id": "…" },
  "when": "1825-07-20/1855-01-08",   // existence; optional (defaults below)
  "track":  [ … ],                   // unit only
  "at":     "pleret",                // fortification only (place id or [lng, lat])
  "geometry": { "type": "Polygon", … }, // territory only
  "path":   ["harbor", "hill", [0.4, 0]], // route only
  "states": [ … ],                   // status / owner / strength over time
  "certainty": "approximate",
  "style": { "trail": "full", "widthBy": "strength" },
  "sources": [ … ], "media": [ … ], "notes": { … }
}
```

| `kind` | Geometri wajib | Dilarang | Default keberadaan |
|---|---|---|---|
| `unit` | `track` | `at`, `geometry`, `path` | `[arrive(first waypoint), end(last waypoint.when))` |
| `fortification` | `at` | `track`, `geometry`, `path` | rentang linimasa |
| `territory` | `geometry` (Polygon atau MultiPolygon) | `track`, `at`, `path` | rentang linimasa |
| `route` | `path` (≥2 lokasi) | `track`, `at`, `geometry` | rentang linimasa |
| `x-…` | salah satu dari di atas | tidak ada | sesuai geometri itu |

Sebuah entitas **terlihat** pada tick `t` jika dan hanya jika `start ≤ t < end`.

### 4.1 Track unit: semantik pergerakan (normatif)

Sebuah waypoint adalah `{ when, at, via?, mode?, strength?, certainty?, label?, notes? }`.

- `arrive = start(when)`
- `depart = end(when)` jika `when` adalah interval; jika tidak, `depart = arrive` (pasukan hanya lewat)
- Waypoint harus memenuhi `arrive[i] ≥ depart[i-1]` (`E006`).

Posisi pada tick `t`:

```
t < arrive[0]                     → hold at waypoint 0
arrive[i] ≤ t < depart[i]         → hold at waypoint i            (moving = false)
depart[i] ≤ t < arrive[i+1]       → on leg i+1                    (moving = true)
                                      f = (t − depart[i]) / (arrive[i+1] − depart[i])
                                      leg = [coord[i], ...via[i+1], coord[i+1]]
                                      position = point at fraction f of the leg's haversine length,
                                                 linear in lng/lat within a segment
t ≥ depart[last]                  → hold at the last waypoint
```

- `via` termasuk ke leg yang **tiba** (arriving). Gunakan untuk jalan darat, sungai, dan jalur laut. Leg tidak boleh melintasi antimeridian (`W109`); pecah dengan `via`.
- `mode` (`land` | `river` | `sea`) mendeskripsikan leg yang tiba. Renderer boleh melewati draping medan untuk `sea` dan menggambarnya putus-putus.
- **Strength** (kekuatan) berasal dari nilai `strength` pada waypoint. Nilainya konstan selama persinggahan, linear di antara knot, dan diklem di luar knot tersebut. Rentang `{min, max}` menginterpolasi titik tengahnya. `style.widthBy: "strength"` meminta lebar bergaya Minard.
- **Trail** (jejak) adalah lintasan yang sudah ditempuh, hingga posisi saat ini. `style.trail` (`full` | `leg` | `none`) menyatakan seberapa banyak yang digambar.
- **Certainty** (kepastian) sebuah leg mengikuti kepastian waypoint yang dituju, yang jatuh kembali ke kepastian tempat lalu kepastian entitas. Renderer sebaiknya menggambar leg dugaan (conjectural) putus-putus atau pudar.

### 4.2 States (normatif)

`states` adalah daftar yang diurutkan berdasarkan `start(when)` (`E007`). Setiap state adalah `{ when, status?, faction?, strength?, label? }`.

Pada tick `t`, pertimbangkan state dengan `start ≤ t` yang intervalnya (jika ada) belum berakhir (`t < end`). **State dengan start terakhir yang menang.** State titik berlaku hingga digantikan sesuatu yang lain. State interval (misalnya `"1825-07-28/1825-09-25"`, `besieged`) berlaku hingga akhirnya, setelah itu state sebelumnya berlaku kembali. Tanpa state yang berlaku, status adalah `active` dan faction adalah milik entitas itu sendiri.

Nilai `status`: `planned, active, besieged, captured, destroyed, abandoned, encamped, captive, surrendered, disbanded, exiled, dead`, atau `x-…`. `faction` dalam sebuah state mengubah pihak yang menguasai, itulah caranya sebuah benteng direbut.

---

## 5. Events (peristiwa)

`{ id, kind, name, when, at?, certainty?, participants?, outcome?, summary?, importance?, sources?, media?, notes? }`

- **Phase** (fase) pada tick `t`: `upcoming` jika `t < start`, `active` jika `start ≤ t < end`, `past` jika `t ≥ end`. Frame menyertakan peristiwa aktif dan lampau, ditambah `progress` (0 hingga 1 selama aktif) dan `sinceEnd` (detik), sehingga renderer dapat berdenyut dan memudar.
- Peristiwa **tanpa `at`**, seperti sebuah dekret, muncul di linimasa dan panel konteks tetapi tidak di peta (`I201`).
- `participants[]`: `{ faction, role, commanders[], strength, losses }`. Strength dan losses berupa bilangan bulat atau `{min, max, note}` ketika sumber-sumber tidak sepakat.
- `importance` berkisar dari 1 (besar) hingga 5. Renderer boleh menyembunyikan penanda dengan importance rendah saat zoom dijauhkan.
- `kind`: `battle, siege, skirmish, raid, massacre, capture, surrender, negotiation, treaty, proclamation, decree, uprising, appointment, arrest, exile, birth, death, political, other`, atau `x-…` (misalnya `x-fire`).

---

## 6. Chapters (bab) dan mode cerita

`{ id, part?, title, when, dateLabel?, body, camera?, focus?, media?, sources?, notes? }`

### 6.1 Gulir menggerakkan jam (normatif)

Jendela sebuah bab adalah rentang hasil resolusi dari `when`-nya. Progres gulir `p ∈ [0, 1]` melalui elemen langkah bab dipetakan ke:

```
t = start + floor(p × (end − start − 1))
```

`p` diklem ke `[0, 1]`, dan `NaN` dibaca sebagai `0`, sehingga hasilnya selalu berada dalam `[start, end)`.

Satu aturan berlaku untuk semua kasus:

- Bab berdurasi **satu hari** nyaris tidak menggerakkan jam.
- Bab berdurasi **satu bulan atau sebuah interval** menggulir melewatinya, sehingga pasukan bergerak maju seiring pembaca menggulir.
- Bab berdurasi **satu tahun** menggulir seluruh tahun itu.

Untuk membekukan jam pada satu momen, gunakan presisi menit.

Bab sebaiknya diurutkan berdasarkan start. `W104` menandai kilas balik (flashback), dan `W115` menandai bab yang mulai sebelum bab sebelumnya berakhir, karena waktu akan melompat mundur di batasnya.

### 6.2 Kamera dan fokus

- `camera` = `{ center, zoom, pitch?, bearing?, durationMs?, transition: "fly" | "ease" | "jump" }`. Ini dipetakan langsung ke `flyTo`, `easeTo`, dan `jumpTo` milik MapLibre atau Mapbox; tidak diperlukan API free-camera.
- `focus` = ID tempat, entitas, atau peristiwa yang disorot. **Jika tidak ada kamera, mesin menyesuaikan tampilan ke koordinat fokus** (sebuah unit menyumbang posisi terkininya dan jejaknya), sambil mempertahankan `meta.map.pitch`. Jika keduanya tidak ada, kamera tetap di tempatnya (`W103`).
- `W112` memperingatkan ketika peristiwa yang difokuskan belum terjadi atau entitas yang difokuskan belum ada dalam jendela bab. Itu biasanya berarti salah ketik pada tanggal.

### 6.3 Mode jelajah bebas

Rentang default penggeser (scrubber) adalah `meta.timeline.focus` (jika tidak ada, `extent`), dan dapat diperlebar ke `extent`. Mesin cukup memanggil `setTime(t)`; sisanya adalah resolusi frame yang sama.

---

## 7. Bagaimana mesin berinteraksi dengan sebuah kampanye

### 7.1 Pipeline

```
 URL / drag-and-drop / object
          │
          ▼
 ┌──────────────┐   bytes    ┌─────────────────────────── Worker (Rust/WASM or JS reference) ─────────────────────┐
 │ Main thread  │ ─────────► │ 1 parse (serde_json)                                                               │
 │ ingest       │ transfer   │ 2 validate: structure (serde types = schema) + semantics (§8)  → diagnostics      │
 └──────────────┘            │ 3 normalize: resolve place refs, When → ticks, legs + lengths, defaults, i18n     │
          ▲                  │ 4 index: time-sorted arrays + R-tree over (lng, lat[, t]) envelopes               │
          │   loaded         │ 5 static payload: string table, places, full track polylines, polygons, routes    │
          │ ◄─────────────── └────────────────────────────────────────────────────────────────────────────────────┘
          │  (once)                                   ▲ query(t, bbox, seq)          │ frame(seq) — typed arrays
          │                                           │                              ▼
 ┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
 │ Main thread: build map sources ONCE from the static payload → per frame, update only dynamic values:          │
 │ unit positions / bearing / strength, trail progress, status & owner codes, event phase & progress.             │
 │ Story controller (IntersectionObserver + scroll progress) → t;  Scrubber → t;  Camera controller → flyTo/fit.  │
 └─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Kebijakan pemuatan:** `error` apa pun menolak berkas dan menampilkan diagnostiknya. Warning dan info dimuat secara normal dan tersedia bagi perangkat authoring.

### 7.2 Statis vs dinamis: aturan yang menjaga 60 FPS

**Jangan** streaming geometri vektor ke main thread setiap frame. Memanggil `setData()` pada sumber GeoJSON memaksa re-tiling, dan itulah yang menjatuhkan frame. Sebagai gantinya:

- **Sekali, saat memuat:** kirim tabel string (ID, nama terlokalkan), titik tempat, polyline track lengkap (dengan jarak kumulatif per-vertex), poligon wilayah, dan garis rute. Renderer membangun sumbernya dari data ini.
- **Per frame:** kirim hanya array bertipe kecil yang diindeks berdasarkan urutan entitas atau peristiwa:

| Array | Tipe | Per item |
|---|---|---|
| `unitState` | `Float64Array` | lng, lat, bearing, strength, trailDistance (meter di sepanjang polyline) |
| `entityStatus` | `Uint8Array` | kode status |
| `entityOwner` | `Uint16Array` | indeks faction |
| `entityVisible` | `Uint8Array` | 0/1 |
| `eventPhase` | `Uint8Array` | 0 upcoming, 1 active, 2 past |
| `eventProgress` | `Float32Array` | progress atau detik sejak berakhir |

Renderer menerapkan ini lewat feature state, sebuah sumber unit kecil per frame, dan sebuah ekspresi trail (gradien garis atau trim, di mana renderer mendukungnya).

Konten logis sebuah frame adalah `FrameState` di bawah ini. Transportnya terserah implementasi, tetapi harus di-decode menjadi persis ini.

```ts
type Ticks = number; // seconds since 1970-01-01T00:00:00, proleptic Gregorian, may be negative

interface FrameState {
  t: Ticks;
  entities: Array<{
    id: string; kind: string; faction: string; status: string;
    position?: [number, number]; bearing?: number | null; moving?: boolean;
    waypoint?: number | null; leg?: number | null; legProgress?: number | null;
    strength?: number | null; certainty?: 'exact' | 'approximate' | 'conjectural' | null;
    trail?: [number, number][];           // reference output; engines may send trailDistance instead
  }>;
  events: Array<{
    id: string; kind: string; phase: 'active' | 'past';
    progress: number; sinceEnd: number; position: [number, number] | null; importance: number;
  }>;
}
```

### 7.3 API mesin (permukaan TypeScript untuk `histamation-js`)

```ts
interface Histamation {
  load(source: string | URL | File | object, opts?: { language?: string }): Promise<LoadResult>;
  setLanguage(lang: string): void;

  // clock
  setTime(t: Ticks): void;                              // free-explore; throws RangeError for NaN/±Infinity
  setStoryProgress(chapterId: string, p: number): void; // story mode, p ∈ [0,1] (§6.1)
  readonly time: Ticks;

  // events
  on(e: 'frame', cb: (f: FrameState) => void): () => void;
  on(e: 'chapter', cb: (c: { id: string; index: number; previous?: string }) => void): () => void;
  on(e: 'diagnostics', cb: (d: Diagnostic[]) => void): () => void;

  dispose(): void;
}

interface LoadResult { ok: boolean; diagnostics: Diagnostic[]; summary?: CampaignSummary }
interface Diagnostic { level: 'error' | 'warning' | 'info'; code: string; path: string; message: string }
```

Pesan worker:

- main → worker: `{type:"load", bytes}` (transferred), `{type:"query", t, bbox, seq}`, `{type:"language", lang}`
- worker → main: `{type:"loaded", diagnostics, static}`, `{type:"frame", seq, t, buffers}`

Buang balasan `seq` yang basi. Saat menggulir cepat, pertahankan hanya kueri terbaru yang masih berjalan.

Referensi `packages/engine/src/worker.ts` dan Rust `wasm.rs` saat ini berbicara dalam bentuk protokol yang lebih sederhana: `{type:"load", id, campaign}` → `{type:"loaded", id, ok, diagnostics, summary?}`, `{type:"query", id, t, bbox?, includeTrail?}` → `{type:"frame", id, frame}`, dan `{type:"error", id, message}` untuk permintaan yang buruk. `id` berperan sebagai `seq`, dan `worker-client.ts` menggabungkan kueri sehingga hanya yang terbaru yang tetap berjalan. `t` dibulatkan menjadi tick bilangan bulat; `t` yang non-finite adalah galat, tidak pernah menghasilkan frame.

### 7.4 Pengikatan renderer

| Data | Layer default | Resolusi gaya |
|---|---|---|
| place | symbol + circle, radius halo = `radiusMeters` (default: exact 100 m, approximate 3 km, conjectural 15 km) | tema berdasarkan `place.kind`; prioritas label berdasarkan `rank` |
| unit | garis trail + simbol kepala | `entity.style` › `faction.color` › tema; lebar berdasarkan strength jika `widthBy`; leg putus-putus jika dugaan atau `mode: sea` |
| fortification | symbol | ikon berdasarkan `status`, tint berdasarkan pemilik saat ini |
| territory | fill + outline | fill berdasarkan pemilik saat ini |
| route | line | `style.dash` › tema |
| event | denyut lingkaran saat aktif, penanda kecil saat lampau | tema berdasarkan `kind`; ukuran berdasarkan `importance` |

**Jenis `x-` yang tidak dikenal** dirender dengan gaya generik untuk geometrinya (titik, garis, atau poligon). **Tema yang tidak dikenal** jatuh kembali ke default mesin.

**Lokalisasi** meresolusi sebuah teks dengan urutan ini: bahasa yang diminta → `meta.defaultLanguage` → yang pertama tersedia.

### 7.5 Input yang tidak tepercaya

Berkas kampanye bisa berasal dari mana saja, jadi perlakukan sebagai berbahaya:

- **Ukuran.** Terapkan batas ukuran sebelum parsing (disarankan 20 MB) dan batas total vertex.
- **Isi bab** memakai subset Markdown: paragraf, `*em*`, `**strong**`, dan `[text](https://…)`. Render dengan renderer allow-list, jangan pernah `innerHTML` dari string mentah. HTML mentah adalah galat (`E017`).
- **URL** harus `http(s)` atau relatif. `javascript:`, `data:`, `vbscript:`, dan `file:` adalah galat (`E015`).
- **Tautan eksternal** dibuka dengan `rel="noopener noreferrer"`.
- **Media** dimuat sebagai gambar saja.
- **Tidak ada kode yang dijalankan dari data.** Kolom `x-` adalah data, tidak pernah dievaluasi.

---

## 8. Validasi

Validasi memiliki dua lapis, dan keduanya melaporkan **JSON Pointer path**.

1. **Struktural.** JSON Schema, lewat `ajv` saat authoring dan CI. Di core Rust, tipe serde mengkodekan aturan yang sama. Kode `S001`.
2. **Semantik.** Aturan yang tidak dapat dinyatakan skema, diimplementasikan di `packages/engine/src/campaign.ts`. Core Rust harus menghasilkan kode dan path yang sama.

| Kode | Level | Aturan |
|---|---|---|
| E001 | error | ID duplikat (namespace tunggal) |
| E002 | error | referensi ke ID yang tidak dikenal |
| E003 | error | referensi ke tipe yang salah (misalnya ID faction di `focus`) |
| E004 | error | `When` tidak valid, interval berakhir sebelum mulai, atau rentang linimasa terbuka atau hilang |
| E005 | error | tanggal linimasa di luar `meta.timeline.extent` |
| E006 | error | waypoint track tidak kronologis, atau tidak ada waypoint yang dapat dipakai |
| E007 | error | `states` tidak diurutkan berdasarkan start |
| E008 | error | peta bahasa tidak memiliki `defaultLanguage` |
| E009 | error | bahasa tidak dideklarasikan di `meta.languages` |
| E010 | error | ring poligon tidak tertutup |
| E011 | error | koordinat salah bentuk atau di luar rentang |
| E012 | error | kuantitas `min > max` |
| E013 | error | versi mayor kontrak tidak didukung |
| E014 | error | `defaultLanguage` tidak ada di `languages` |
| E015 | error | skema URL tidak aman |
| E016 | error | jenis entitas kustom `x-` tanpa geometri |
| E017 | error | HTML mentah dalam isi bab |
| E018 | error | tidak ada bab (pemutaran dimulai dari bab pertama) |
| W101 | warning | terjemahan hilang |
| W102 | warning | koordinat di luar `meta.map.bounds` (menandai kemungkinan tertukarnya lng/lat) |
| W103 | warning | bab tidak memiliki camera maupun focus |
| W104 | warning | bab mulai sebelum bab sebelumnya (kilas balik) |
| W105 | warning | source, media, place, atau part tidak pernah dirujuk |
| W107 | warning | leg berdurasi nol lebih panjang dari 1 km (pasukan berteleportasi) |
| W109 | warning | leg melintasi antimeridian |
| W112 | warning | item yang difokuskan tidak ada dalam jendela bab |
| W113 | warning | track melampaui interval keberadaan entitas |
| W114 | warning | peristiwa tidak mencantumkan sumber |
| W115 | warning | jendela bab tumpang tindih dengan mulainya bab berikutnya |
| I201 | info | peristiwa tanpa lokasi (hanya linimasa) |

---

## 9. Versi dan ekstensi

- `histamation: "1.N"`. Versi **minor** hanya menambah kolom opsional, nilai enum, dan fitur `When`. Mesin 1.0 yang membaca berkas 1.3 mengabaikan apa yang tidak dikenalnya. Versi **mayor** boleh merusak; mesin menolak mayor yang tidak dikenal (`E013`).
- **Kolom `x-`** diperbolehkan pada setiap objek, termasuk level teratas (berkas Napoleon membawa tabel suhu Minard sebagai `x-minard`). Jenis kustom adalah `x-…`.
- **Kandidat untuk 1.1:** `places[].when` (pendirian dan penggantian nama), tahun berawalan `Y` untuk deep time, musim, `when` per-leg pada route, media `audio`.

---

## 10. Checklist authoring

1. Taruh setiap koordinat di `places` dengan `certainty` yang jujur dan satu baris `notes` yang menyatakan dari mana koordinat itu berasal.
2. Konversi tanggal ke Gregorian proleptik. Tandai yang meragukan dengan `?` atau `~`, dan catat ketidaksepakatan antar sumber di `notes`. Jangan diam-diam memilih satu sumber saja.
3. Beri setiap peristiwa setidaknya satu sumber (`W114`).
4. Gunakan terminologi netral untuk faction. Berkas Perang Jawa menghindari istilah kolonial "pemberontak".
5. Tulis teks `alt` untuk setiap gambar dan periksa lisensinya.
6. Jalankan `node packages/engine/dist/cli.js your-campaign.json --frames` (setelah `npm run build`) dan baca dry-run pemutarannya. Ini menunjukkan di mana setiap unit berada pada awal, tengah, dan akhir setiap bab, yang menangkap sebagian besar kesalahan tanggal.

---

## 11. Perubahan dari skema v1.0 PRD

| PRD v1.0 | Kontrak ini | Alasan |
|---|---|---|
| `entity.type` menduplikasi `geometry.type` | `kind` (semantik) + kolom geometri spesifik-jenis | dua sumber kebenaran yang bisa saling menyimpang; renderer butuh makna ("benteng"), bukan tipe GeoJSON |
| Satu `LineString` + satu `timeRange` untuk pasukan yang bergerak | `unit.track` berupa waypoint berwaktu dengan `via`, `mode`, `strength` | garis statis tidak bisa menganimasikan sebuah pawai; mesin butuh waktu tiba dan berangkat |
| Tidak ada model state ("aktif / dikepung / hancur" hanya dalam prosa) | `states[]` dengan semantik interval dan perubahan pemilik | benteng dikepung, lalu direbut; ikonnya harus berubah tepat waktu |
| `lineColor`, `lineWidth`, `dashArray` dalam data | faction punya warna; tema memetakan jenis; petunjuk `style` netral opsional | properti paint Mapbox dalam data mengunci berkas ke satu renderer dan satu tampilan |
| String bebas `faction: "rebel"` | registry `factions[]` dengan ID, nama, warna | integritas referensial dan legenda; menghindari label yang bermuatan opini |
| `timestamp: "1825-07-20T00:00:00Z"` | subset EDTF dengan presisi dan qualifier | "1827" bukan tengah malam tanggal 1 Januari; sejarawan butuh `~` dan `?` |
| `query_state_at_time(timestamp: u64, …)` | tick `i64` | u64 tidak dapat merepresentasikan tanggal mana pun sebelum 1970 |
| Koordinat diulang di mana-mana, ketinggian dalam data | gazetteer `places` + `certainty`; ketinggian opsional (drape pada DEM) | satu perbaikan membetulkan setiap referensi; ketidakpastian yang jujur |
| Tidak ada sitasi atau media dalam skema (meski ada UI-03) | `sources[]`, `media[]` dengan alt, credit, license | dataset sejarah open-source hidup atau mati karena provenansi |
| Hanya bahasa Inggris | peta bahasa + `languages` / `defaultLanguage` | audiens Indonesia untuk demo andalan |
| Tidak ada kolom versi | `histamation: "1.0"` | plug-and-play butuh kompatibilitas maju |
| Bab: hanya timestamp + camera | jendela `when` yang digulir, `focus` auto-fit, `parts`, `dateLabel` | memungkinkan unit bergerak saat dibaca; camera bersifat opsional |

---

## 12. Amendemen yang direkomendasikan untuk PRD di luar format data

Hal-hal berikut muncul selama perancangan kontrak. Layak diputuskan sebelum kode Fase 1.

1. **Mapbox GL JS vs MapLibre GL JS.** Sejak v2 (Desember 2020), Mapbox GL JS dirilis di bawah lisensi Mapbox Web SDK yang proprietari. Ia membutuhkan akun Mapbox aktif dan access token, serta menagih map load (50.000 gratis per bulan saat tulisan ini dibuat). Itu janggal berdampingan dengan mesin open-source MIT yang seharusnya bisa di-fork dan di-self-host oleh siapa saja. **MapLibre GL JS** (BSD-3, v6.x) punya terrain 3D (`raster-dem`), proyeksi globe, dan custom layer. v6 hanya ESM dan membutuhkan WebGL 2, yang sesuai dengan target browser PRD. Rekomendasi: targetkan MapLibre sebagai default dan jaga renderer di belakang sebuah adapter sehingga adapter Mapbox tetap memungkinkan.
2. **API `FreeCamera` khusus Mapbox.** Camera bab hanya butuh `flyTo`, `easeTo`, dan `jumpTo`, yang dimiliki kedua library. MapLibre menyediakan `calculateCameraOptionsFromCameraLngLatAltRotation` untuk pengambilan gambar berbasis ketinggian jika suatu saat diperlukan.
3. **Offline lewat service worker (NFR).** Ketentuan produk Mapbox mengizinkan caching di perangkat pengguna akhir hingga 30 hari ketika diisi oleh penggunaan normal, dan melarang pengunduhan massal atau sistematis. "Pre-cache wilayah untuk offline" karenanya berbenturan dengan ketentuan Mapbox. Dengan MapLibre plus PMTiles self-hosted (vector dan terrain), offline menjadi mudah.
4. **Jangan streaming geometri setiap frame** (§7.2). "WASM mendorong geometri vektor ringan" milik PRD per frame akan memaksa re-tiling. Kirim geometri statis sekali dan state per frame sebagai array bertipe.
5. **Jujurlah soal di mana WASM benar-benar berharga.** Berkas Perang Jawa punya 9 entitas dan 43 peristiwa, dan `resolveFrame` dalam JS biasa memakan waktu mikrodetik. Perjalanan bolak-balik worker menambah kira-kira satu frame latensi. Core Rust membuktikan nilainya pada skala NFR (50.000 fitur), di R-tree, dan sebagai arsitektur referensi. Pertahankan jalur JS same-thread (implementasi referensi memang sudah begitu), dan biarkan benchmark yang menentukan default.
6. **Validasi runtime seharusnya ada di core, bukan di `ajv`.** Diukur dengan esbuild, `ajv` + `ajv-formats` + skema ini mencapai sekitar 48 KB gzip (164 KB minified), separuh dari anggaran JS 100 KB. Seluruh validator semantik referensi ditambah resolver hanya sekitar 7 KB gzip. Core Rust sudah harus men-deserialize berkas tersebut, dan serde plus aturan semantik memberikan jaminan yang sama. Pertahankan JSON Schema untuk editor dan CI.
7. **Crate.** Crate `edtf` belum ada rilis sejak 2021. Subset `When` itu kecil, jadi tulis sendiri parsernya (cerminkan `packages/engine/src/time.ts`, sebagaimana `crates/histamation-core/src/time.rs` melakukannya) dan uji terhadap `test-vectors/time.json`. `rstar` 0.13 mendukung `AABB<[f64; 3]>` jika waktu diindeks sebagai sumbu ketiga. Skalakan tick ke magnitudo yang sebanding dengan derajat, dan gunakan sentinel finite untuk interval terbuka.
8. **Progres gulir butuh lebih dari IntersectionObserver.** Observer memicu pada threshold, yang cukup untuk masuknya sebuah bab. `p` kontinu (§6.1) butuh pembacaan `requestAnimationFrame` atas bounding box elemen langkah.

---

## 13. Implementasi referensi dan vektor uji

```
packages/engine/src/time.ts      When parsing, ticks, calendar math
packages/engine/src/campaign.ts  semantic validation + normalization (diagnostic codes, §8)
packages/engine/src/resolve.ts   resolveFrame(campaign, t), chapterTime(chapter, p)
packages/engine/src/engine.ts    stateful playback façade (§7.3)
packages/engine/src/worker.ts    worker protocol (§7.1) the Rust/WASM core plugs into
packages/engine/src/cli.ts       histamation-check: schema + semantic validation, --frames dry-run, --vectors
packages/engine/src/vectors.ts   builds the golden vectors written by `npm run vectors`
packages/engine/src/format.ts    localized text and precision-aware date formatting for display

crates/histamation-core/        the Rust port, tested against the vectors below

test-vectors/time.json                        When → ticks, including invalid inputs
test-vectors/null-island.frames.json          synthetic fixture: every feature, BCE dates, p = 0, .25, .5, .75, 1
test-vectors/java-war-1825.frames.json        one frame per line, p = 0, .5, 1 per chapter
test-vectors/napoleon-russia-1812.frames.json
```

Sebuah core yang sesuai harus mereproduksi `time.json` persis, dan setiap kolom frame dalam toleransi absolut 1e-6. Ketika kontrak berubah, perbarui `packages/engine/src/` terlebih dahulu, regenerasi vektor dengan `npm run vectors`, lalu port ke `crates/histamation-core`.
