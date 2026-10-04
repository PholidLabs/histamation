---
title: chronomap-core (Rust / WASM)
description: Port Rust — API native, fitur Cargo, indeks spasial, permukaan wasm-bindgen ChronoMapCore, dan paritas vektor.
group: api
order: 4
---

`crates/chronomap-core` adalah port Rust dari [`@chronomap/engine`](engine.md): parsing `When`
subset-EDTF yang sama, validasi semantik yang sama, dan resolusi frame yang sama, sebagai crate
native atau, dengan fitur `wasm`, sebagai permukaan `wasm-bindgen` yang bisa dimuat worker
menggantikan engine JS.

> [!NOTE]
> **TypeScript di `packages/engine/src` adalah spesifikasi eksekutabel.** Saat perilaku
> berubah, TypeScript berubah lebih dulu, [vektor emas](#parity) dihasilkan ulang darinya
> (`npm run vectors`), dan baru setelah itu crate ini diubah agar cocok. CI gagal jika vektor
> yang di-commit basi — lihat [CLAUDE.md](gh:CLAUDE.md).

## Fitur Cargo {#features}

```text
# Cargo.toml — crate ini tidak dipublikasikan ke crates.io; depend padanya lewat path (atau git)
# dari crate lain di workspace, atau bangun langsung (lihat di bawah).
[dependencies]
chronomap-core = { path = "../chronomap-core", features = ["spatial", "wasm"] }
```

| Fitur | Menambahkan | Default |
|---|---|---|
| `spatial` | `pub mod spatial` — indeks [`rstar`](https://docs.rs/rstar) di atas tempat, entitas, dan peristiwa untuk query viewport. | off |
| `wasm` | `pub mod wasm` — permukaan `wasm-bindgen` `ChronoMapCore` (butuh `wasm-bindgen`, `serde-wasm-bindgen`). | off |

Tidak ada fitur yang aktif secara default, jadi `cargo build`/`cargo test` tidak butuh toolchain
tambahan; CI menjalankan `cargo test --all-features` sehingga keduanya dikompilasi dan diuji
(modul `wasm` juga dikompilasi untuk target host — target wasm32 tidak butuh kode tambahan apa
pun dari dirinya sendiri).

## API native {#native-api}

```rust
use chronomap_core::{load_campaign_str, resolve_frame, chapter_time, ResolveOptions};

let json = std::fs::read_to_string("campaign.json").unwrap();
let result = load_campaign_str(&json);
for d in &result.diagnostics {
    println!("{} {} {}  {}", d.level.as_str(), d.code, d.path, d.message);
}
// Setiap `error` menolak berkas (kontrak §7.1).
if let Some(campaign) = result.campaign {
    let t = chapter_time(&campaign.chapters[0], 0.5);
    let frame = resolve_frame(&campaign, t, &ResolveOptions::default());
    println!("{} — {} entities", frame.iso, frame.entities.len());
}
```

### load_campaign dan load_campaign_str {#load-campaign}

```rust
pub fn load_campaign(raw: &serde_json::Value) -> LoadResult;
pub fn load_campaign_str(json: &str) -> LoadResult;

pub struct LoadResult {
    pub campaign: Option<NormalizedCampaign>,
    pub diagnostics: Vec<Diagnostic>,
}
```

Memvalidasi dan menormalisasi kampanye — `load_campaign_str` mem-parsing teks JSON lebih dulu
dan mengubah kegagalan parsing menjadi diagnostik [`E000`](diagnostics.md) alih-alih `Err`;
`load_campaign` menerima `serde_json::Value` yang sudah di-parsing. Keduanya tidak pernah panic:
bentuk yang tidak bisa ditampung model bertipe (misalnya `places` yang bukan array) menjadi
diagnostik `E000`, bukan panic deserialisasi, karena port bertipe tidak bisa diam-diam
duck-typing melewati field yang cacat seperti yang dilakukan implementasi referensi. `campaign`
bernilai `None` setiap kali ada diagnostik `DiagnosticLevel::Error` — kebijakan muat yang sama
dengan [`loadCampaign`](engine.md#load-campaign-fn), kode yang sama, path JSON Pointer yang
sama.

### resolve_frame dan ResolveOptions {#resolve-frame}

```rust
pub struct ResolveOptions {
    pub bbox: Option<[f64; 4]>,
    pub include_trail: bool,
}
impl Default for ResolveOptions {
    fn default() -> Self { ResolveOptions { bbox: None, include_trail: true } } // cocok dengan default referensi
}

pub fn resolve_frame(campaign: &NormalizedCampaign, t: Ticks, opts: &ResolveOptions) -> FrameState;
```

Kembaran Rust dari [`resolveFrame`](engine.md#resolve-frame-fn): `bbox` adalah `[west, south,
east, north]`, `include_trail` mengatur apakah `FrameEntity` sebuah pasukan membawa seluruh
polyline yang sudah dilalui atau hanya jumlah titiknya. `Ticks` adalah `i64` — tidak pernah
`u64`; setiap kampanye di repo ini berada sebelum 1970 dan butuh tick bertanda.

### chapter_time dan chapter_at {#chapter-time}

```rust
pub fn chapter_time(chapter: &NormChapter, p: f64) -> Ticks;
pub fn chapter_at(campaign: &NormalizedCampaign, t: Ticks) -> Option<&NormChapter>;
```

`chapter_time` adalah `t = start + floor(p × (end − start − 1))` (kontrak
[§6.1](contract.md#sec-6-1)), dengan perilaku tepi yang sama seperti
[`chapterTime`](engine.md#chapter-time) TypeScript: `p` di-clamp ke `[0.0, 1.0]`, dan
`p.is_nan()` dibaca sebagai `0.0` — cast float-ke-`i64` tidak pernah dibiarkan menentukan itu
sendiri. `chapter_at` mengembalikan bab terakhir menurut urutan berkas yang `start <= t`, atau
`None` sebelum start bab mana pun.

### Helper lain yang di-port {#other-helpers}

Sisa permukaan publik mencerminkan versi TypeScript-nya satu-lawan-satu — nama sama dalam
`snake_case`, perilaku sama, di-port dengan alasan yang sama seperti didokumentasikan di
[halaman engine](engine.md):

```rust
pub fn haversine(a: [f64; 2], b: [f64; 2]) -> f64;
pub fn initial_bearing(a: [f64; 2], b: [f64; 2]) -> f64;
pub fn along_path(path: &[[f64; 2]], f: f64) -> PathPoint;
pub fn state_at(states: &[NormState], t: Ticks) -> Option<&NormState>;
pub fn default_radius(certainty: Option<&str>) -> f64;
pub fn quantity_value(q: Option<&Quantity>) -> Option<f64>;

pub fn parse_when(text: &str) -> Result<ParsedWhen, WhenError>;
pub fn parse_date(text: &str) -> Result<ParsedDate, WhenError>;
pub fn resolve_when(w: &ParsedWhen, extent_start: Ticks, extent_end: Ticks) -> ResolvedWhen;
pub fn resolve_when_str(text: &str, extent_start: Ticks, extent_end: Ticks) -> Result<ResolvedWhen, WhenError>;
pub fn ticks_to_iso(ticks: Ticks) -> String;
pub fn days_from_civil(year: i64, month: i64, day: i64) -> i64;
pub fn civil_from_days(z: i64) -> (i64, i64, i64);
pub fn is_leap_year(y: i64) -> bool;
pub fn days_in_month(y: i64, m: i64) -> i64;
```

`along_path` mengembalikan `PathPoint { position: [f64; 2], segment: usize, travelled: Vec<[f64; 2]> }`
— field yang sama dengan hasil [`alongPath`](engine.md#along-path) TypeScript, dalam
`snake_case`. `resolve_when_str` adalah kemudahan khas Rust: parsing dan resolve dalam satu
panggilan, karena Rust tidak punya padanan overload untuk `resolveWhen(when: string |
ParsedWhen, …)` milik TypeScript. `WhenError` adalah tuple struct polos di sekitar pesannya
(`WhenError(String)`), cocok dengan class [`WhenError`](engine.md#when-error) TypeScript secara
semangat, bukan bentuk — tangkap sebagai `Result::Err`, bukan dengan men-downcast exception.

## Indeks spasial {#spatial-index}

Di balik fitur `spatial`: R-tree [`rstar`](https://docs.rs/rstar) di atas setiap tempat,
entitas, dan peristiwa dengan envelope yang bisa di-resolve, untuk query viewport yang tidak
perlu menyentuh setiap fitur (kontrak [§7.1](contract.md#sec-7-1) langkah 4). Sengaja dibuat
kecil — ia menjawab "apa yang ada di dekat sini", bukan apa-apa tentang semantik frame; filter
viewport yang dibangun darinya tetap harus sejalan dengan
[`ResolveOptions::bbox`](#resolve-frame).

### SpatialIndex {#spatial-index-type}

```rust
pub struct SpatialIndex { /* … */ }

impl SpatialIndex {
    pub fn build(campaign: &NormalizedCampaign) -> Self;
    pub fn len(&self) -> usize;
    pub fn is_empty(&self) -> bool;
    pub fn in_bbox(&self, bbox: [f64; 4]) -> Vec<&SpatialItem>;
    pub fn in_bbox_at(&self, bbox: [f64; 4], t: Ticks) -> Vec<&SpatialItem>;
    pub fn nearest(&self, point: [f64; 2]) -> Option<&SpatialItem>;
}
```

`build` mengindeks setiap tempat (tanpa waktu — `places[].when` adalah kandidat 1.1 menurut
[§9](contract.md#sec-9)), setiap entitas lewat kotak pembatas dari **seluruh** track/coord/path/
polygons-nya (sehingga query viewport mengembalikan setiap pasukan yang *mungkin* muncul,
membiarkan pemanggil me-resolve frame untuk tahu di mana ia sesungguhnya berada pada `t`), dan
setiap peristiwa berkoordinat (diindeks sampai `max(akhir extent kampanye, akhir peristiwa)`,
karena peristiwa yang sudah lewat tetap di peta, memudar). `in_bbox` mengembalikan segala
sesuatu yang envelope-nya bertemu persegi query; `in_bbox_at` menambahkan syarat `start <= t <
end`; `nearest` menemukan item terdekat berdasarkan jarak kuadrat-derajat (urutkan kandidat
dengan ini, lalu re-rank dengan [`haversine`](#other-helpers) untuk jarak sesungguhnya).

### SpatialItem dan SpatialKind {#spatial-item}

```rust
pub enum SpatialKind { Place, Entity, Event }

pub struct SpatialItem {
    pub id: String,
    pub kind: SpatialKind,
    pub bbox: [f64; 4], // [west, south, east, north]; layer titik punya west == east
    pub start: Ticks,
    pub end: Ticks,     // eksklusif, seperti rentang lain mana pun di kontrak
}
```

## ChronoMapCore (wasm) {#chrono-map-core}

Di balik fitur `wasm`: sebuah class `wasm-bindgen` yang mencerminkan protokol worker di
[`worker.ts`](engine.md#worker-protocol) (kontrak [§7.1](contract.md#sec-7-1)) — kampanye
di-parsing dan dinormalisasi **sekali** saat `load`, dan setiap `query` mengembalikan satu frame
kecil. Bentuk pesannya adalah bentuk referensi, sehingga worker JS bisa menukar `handleRequest`
dengan inti ini tanpa thread utama menyadarinya:

```js
const core = new ChronoMapCore();
const loaded = core.load(1, campaignJsonText);   // { type:"loaded", id, ok, diagnostics, summary? }
const frame  = core.query(2, tick, null, false); // { type:"frame",  id, frame }
```

```rust
#[wasm_bindgen]
pub struct ChronoMapCore { /* … */ }

impl ChronoMapCore {
    #[wasm_bindgen(constructor)]
    pub fn new() -> ChronoMapCore;
    pub fn load(&mut self, id: u32, campaign_json: &str) -> Result<JsValue, JsValue>;
    pub fn query(&self, id: u32, t: f64, bbox: Option<Box<[f64]>>, include_trail: Option<bool>) -> Result<JsValue, JsValue>;
    #[wasm_bindgen(getter)]
    pub fn loaded(&self) -> bool;
    pub fn extent(&self) -> Option<Box<[f64]>>;
    pub fn chapter_time(&self, chapter_id: &str, p: f64) -> Option<f64>;
}
```

### new dan load {#core-load}

`ChronoMapCore::new()` mulai tanpa kampanye. `load(id, campaign_json)` mem-parsing dan
memvalidasi teks JSON dan menggantikan apa pun yang termuat sebelumnya — berkas yang ditolak
oleh diagnostik `error` mana pun juga menjatuhkan kampanye sebelumnya, sama seperti worker JS
yang menetapkan `null` ke slot modul-levelnya. Fungsi ini mengembalikan `{ type: "loaded", id,
ok, diagnostics, summary? }`, di mana `summary` (`{ chapters, entities, events, places }`) hadir
hanya saat `ok` bernilai `true`.

### query {#core-query}

`query(id, t, bbox, includeTrail)` me-resolve frame pada tick `t`. `t` melintasi batas JS/Rust
sebagai `f64`; karena tick bersifat bilangan bulat menurut kontrak, ia **dibulatkan**, bukan
dipotong (semantik `Math.round`, tanda termasuk) — pembulatan yang sama dengan
[`ChronoMapEngine.setTime`](engine.md#engine-set-time) dan worker JS. `t` yang tidak finite
(`NaN`, `±Infinity`) ditolak dengan galat, seperti yang dilakukan
[`resolveFrame`](engine.md#resolve-frame-fn); memanggil `query` sebelum ada `load` juga ditolak,
dengan pesan `"query before load"`. `bbox` adalah `[west, south, east, north]` atau `null`;
`includeTrail` default ke `false` di sini — payload yang murah — berbeda dari default
[`ResolveOptions`](#resolve-frame) sendiri yang `true`, karena ini adalah default per-query milik
worker, bukan default library secara keseluruhan.

### loaded, extent, chapterTime {#core-getters}

`loaded` (sebuah getter) melaporkan apakah kampanye sedang dipegang. `extent()` mengembalikan
`[start, end)` sebagai array dua elemen, atau `null` sebelum ada load yang berhasil.
`chapterTime(chapterId, p)` mencari bab berdasarkan id dan mengembalikan tick `chapter_time`-nya,
atau `null` jika tidak ada kampanye yang termuat atau id-nya tidak cocok dengan bab mana pun —
berguna untuk host yang ingin tick-nya tanpa perlu bolak-balik `query` penuh.

## Membangun untuk browser {#building}

Crate ini mendeklarasikan `crate-type = ["cdylib", "rlib"]`, sehingga ia dibangun sebagai
pustaka Rust biasa (`rlib`, untuk `cargo test` dan pemakaian native) dan sebagai `cdylib` untuk
dibungkus `wasm-bindgen`. Bangun target `wasm` dengan
[`wasm-pack`](https://rustwasm.github.io/wasm-pack/):

```bash
wasm-pack build crates/chronomap-core --target web -- --features wasm
```

Itu menghasilkan direktori `pkg/` berisi binary `.wasm` dan binding JS `ChronoMapCore` yang
dihasilkan — bentuk yang sama seperti [di atas](#chrono-map-core) — siap dimuat dari sebuah
Worker menggantikan `handleRequest` JS murni milik `packages/engine/src/worker.ts`. Aktifkan
`spatial` bersama `wasm` jika worker juga butuh query viewport:
`-- --features wasm,spatial`.

## Paritas dengan vektor emas {#parity}

```text
crates/chronomap-core/tests/vectors.rs
```

memutar ulang `test-vectors/*.json` — dihasilkan dari referensi TypeScript oleh
[`chronomap-check --vectors`](cli.md#vectors) — terhadap crate ini. `time.json` harus cocok
persis (setiap input `When` yang dianggap menarik oleh referensi, termasuk yang seharusnya
gagal di-parsing); setiap field `*.frames.json` harus cocok **dalam toleransi absolut `1e-6`**
untuk float, dan persis untuk string serta diagnostik (`level`, `code`, `path`, berurutan —
kontrak [§13](contract.md#sec-13)). `cargo test --all-features` menjalankan ini bersama unit
test milik indeks `spatial` sendiri dan beberapa invarian struktural (memuat tidak pernah panic
pada input sampah, koordinat non-numerik ditolak, kampanye tanpa bab ditolak, progres bab tetap
di dalam jendelanya).

Saat semantik kontrak berubah: ubah TypeScript di `packages/engine/src` lebih dulu, hasilkan
ulang vektor dengan `npm run vectors`, baru port perubahannya ke sini — tidak pernah arah
sebaliknya. CI gagal jika vektor yang di-commit basi (lihat [CLAUDE.md](gh:CLAUDE.md)), dan
`cargo test --all-features` gagal jika crate ini melenceng darinya.
