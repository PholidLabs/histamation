---
title: chronomap-core (Rust / WASM)
description: The Rust port — native API, Cargo features, the spatial index, the ChronoMapCore wasm-bindgen surface, and vector parity.
group: api
order: 4
---

`crates/chronomap-core` is a Rust port of [`@pholidlabs/chronomap-engine`](engine.md): the same EDTF-subset
`When` parsing, semantic validation, and frame resolution, as a native crate or, with the `wasm`
feature, a `wasm-bindgen` surface a worker can load instead of the JS engine.

> [!NOTE]
> **The TypeScript in `packages/engine/src` is the executable spec.** When behavior changes,
> the TypeScript changes first, the [golden vectors](#parity) are regenerated from it
> (`npm run vectors`), and only then does this crate change to match. CI fails on stale vectors
> — see [CLAUDE.md](gh:CLAUDE.md).

## Cargo features {#features}

```text
# Cargo.toml — this crate is not published to crates.io; depend on it by path (or git)
# from another crate in the workspace, or build it directly (see below).
[dependencies]
chronomap-core = { path = "../chronomap-core", features = ["spatial", "wasm"] }
```

| Feature | Adds | Default |
|---|---|---|
| `spatial` | `pub mod spatial` — an [`rstar`](https://docs.rs/rstar) index over places, entities and events for viewport queries. | off |
| `wasm` | `pub mod wasm` — the `ChronoMapCore` `wasm-bindgen` surface (needs `wasm-bindgen`, `serde-wasm-bindgen`). | off |

Neither feature is on by default, so `cargo build`/`cargo test` need no extra toolchain; CI runs
`cargo test --all-features` so both compile and are exercised (the `wasm` module compiles for
the host target too — the wasm32 target needs no extra code of its own).

## The native API {#native-api}

```rust
use chronomap_core::{load_campaign_str, resolve_frame, chapter_time, ResolveOptions};

let json = std::fs::read_to_string("campaign.json").unwrap();
let result = load_campaign_str(&json);
for d in &result.diagnostics {
    println!("{} {} {}  {}", d.level.as_str(), d.code, d.path, d.message);
}
// Any `error` rejects the file (contract §7.1).
if let Some(campaign) = result.campaign {
    let t = chapter_time(&campaign.chapters[0], 0.5);
    let frame = resolve_frame(&campaign, t, &ResolveOptions::default());
    println!("{} — {} entities", frame.iso, frame.entities.len());
}
```

### load_campaign and load_campaign_str {#load-campaign}

```rust
pub fn load_campaign(raw: &serde_json::Value) -> LoadResult;
pub fn load_campaign_str(json: &str) -> LoadResult;

pub struct LoadResult {
    pub campaign: Option<NormalizedCampaign>,
    pub diagnostics: Vec<Diagnostic>,
}
```

Validates and normalizes a campaign — `load_campaign_str` parses JSON text first and turns a
parse failure into an [`E000`](diagnostics.md) diagnostic instead of an `Err`; `load_campaign`
takes an already-parsed `serde_json::Value`. Neither ever panics: a shape the typed model
cannot hold (for example a `places` that is not an array) becomes an `E000` diagnostic rather
than a deserialization panic, since a typed port cannot silently duck-type its way past a
malformed field the way the reference implementation does. `campaign` is `None` whenever any
diagnostic is `DiagnosticLevel::Error` — the same load policy as [`loadCampaign`](engine.md#load-campaign-fn),
same codes, same JSON Pointer paths.

### resolve_frame and ResolveOptions {#resolve-frame}

```rust
pub struct ResolveOptions {
    pub bbox: Option<[f64; 4]>,
    pub include_trail: bool,
}
impl Default for ResolveOptions {
    fn default() -> Self { ResolveOptions { bbox: None, include_trail: true } } // matches the reference default
}

pub fn resolve_frame(campaign: &NormalizedCampaign, t: Ticks, opts: &ResolveOptions) -> FrameState;
```

The Rust twin of [`resolveFrame`](engine.md#resolve-frame-fn): `bbox` is `[west, south, east,
north]`, `include_trail` controls whether a unit's `FrameEntity` carries its full walked
polyline or just its vertex count. `Ticks` is `i64` — never `u64`; every campaign in this
repository predates 1970 and needs a signed tick.

### chapter_time and chapter_at {#chapter-time}

```rust
pub fn chapter_time(chapter: &NormChapter, p: f64) -> Ticks;
pub fn chapter_at(campaign: &NormalizedCampaign, t: Ticks) -> Option<&NormChapter>;
```

`chapter_time` is `t = start + floor(p × (end − start − 1))` (contract
[§6.1](contract.md#sec-6-1)), with the same edge behavior as the TypeScript
[`chapterTime`](engine.md#chapter-time): `p` clamps to `[0.0, 1.0]`, and `p.is_nan()` reads as
`0.0` — the float-to-`i64` cast is never allowed to decide that on its own. `chapter_at` returns
the last chapter in file order whose `start <= t`, or `None` before every chapter's start.

### Other ported helpers {#other-helpers}

The rest of the public surface mirrors the TypeScript one-for-one — same names in `snake_case`,
same behavior, ported for the same reasons documented on the [engine page](engine.md):

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

`along_path` returns a `PathPoint { position: [f64; 2], segment: usize, travelled: Vec<[f64; 2]> }`
— the same fields as the TypeScript [`alongPath`](engine.md#along-path) result, in `snake_case`.
`resolve_when_str` is a Rust-only convenience: parse and resolve in one call, since Rust has no
overload equivalent to the TypeScript `resolveWhen(when: string | ParsedWhen, …)`.
`WhenError` is a plain tuple struct around the message (`WhenError(String)`), matching the
TypeScript [`WhenError`](engine.md#when-error) class in spirit, not in shape — catch it as a
`Result::Err`, not by downcasting an exception.

## The spatial index {#spatial-index}

Behind the `spatial` feature: an [`rstar`](https://docs.rs/rstar) R-tree over every place,
entity and event with a resolvable envelope, for viewport queries that skip touching every
feature (contract [§7.1](contract.md#sec-7-1) step 4). Deliberately small — it answers "what's
near here", nothing about frame semantics; a viewport filter built from it must still agree with
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

`build` indexes every place (timeless — `places[].when` is a 1.1 candidate per
[§9](contract.md#sec-9)), every entity by the bounding box of its **whole** track/coord/path/
polygons (so a viewport query returns every unit that *could* appear, leaving the caller to
resolve the frame and find out where it actually is at `t`), and every event with a coordinate
(indexed to `max(campaign extent end, event end)`, since a past event stays on the map, faded).
`in_bbox` returns everything whose envelope meets the query rectangle; `in_bbox_at` additionally
requires `start <= t < end`; `nearest` finds the closest item by squared-degree distance (order
candidates with this, then re-rank with [`haversine`](#other-helpers) for a real distance).

### SpatialItem and SpatialKind {#spatial-item}

```rust
pub enum SpatialKind { Place, Entity, Event }

pub struct SpatialItem {
    pub id: String,
    pub kind: SpatialKind,
    pub bbox: [f64; 4], // [west, south, east, north]; a point layer has west == east
    pub start: Ticks,
    pub end: Ticks,     // exclusive, like every other range in the contract
}
```

## ChronoMapCore (wasm) {#chrono-map-core}

Behind the `wasm` feature: a `wasm-bindgen` class mirroring the worker protocol in
[`worker.ts`](engine.md#worker-protocol) (contract [§7.1](contract.md#sec-7-1)) — a campaign is
parsed and normalized **once** on `load`, and each `query` returns one small frame. The message
shapes are the reference ones, so a JS worker can swap `handleRequest` for this core without the
main thread noticing:

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

### new and load {#core-load}

`ChronoMapCore::new()` starts with no campaign. `load(id, campaign_json)` parses and validates
the JSON text and replaces whatever was loaded before — a file rejected by any `error`
diagnostic drops the previous campaign too, matching the JS worker assigning `null` to its
module-level slot. It returns `{ type: "loaded", id, ok, diagnostics, summary? }`, where
`summary` (`{ chapters, entities, events, places }`) is present only when `ok` is `true`.

### query {#core-query}

`query(id, t, bbox, includeTrail)` resolves the frame at tick `t`. `t` crosses the JS/Rust
boundary as an `f64`; since ticks are integral by contract, it is **rounded**, not truncated
(`Math.round` semantics, sign included) — the same rounding [`ChronoMapEngine.setTime`](engine.md#engine-set-time)
and the JS worker apply. A non-finite `t` (`NaN`, `±Infinity`) rejects with an error, as
[`resolveFrame`](engine.md#resolve-frame-fn) does; calling `query` before any `load` also
rejects, with the message `"query before load"`. `bbox` is `[west, south, east, north]` or
`null`; `includeTrail` defaults to `false` here — the cheap payload — unlike
[`ResolveOptions`](#resolve-frame)'s own default of `true`, because this is the worker's
per-query default, not the library-wide one.

### loaded, extent, chapterTime {#core-getters}

`loaded` (a getter) reports whether a campaign is currently held. `extent()` returns
`[start, end)` as a two-element array, or `null` before any successful load. `chapterTime(chapterId,
p)` looks the chapter up by id and returns its `chapter_time` tick, or `null` if no campaign is
loaded or the id does not match a chapter — convenient for a host that wants the tick without a
whole `query` round trip.

## Building for the browser {#building}

The crate declares `crate-type = ["cdylib", "rlib"]`, so it builds as a normal Rust library
(`rlib`, for `cargo test` and native use) and as a `cdylib` for `wasm-bindgen` to wrap. Build the
`wasm` target with [`wasm-pack`](https://rustwasm.github.io/wasm-pack/):

```bash
wasm-pack build crates/chronomap-core --target web -- --features wasm
```

That produces a `pkg/` directory with the `.wasm` binary and a generated `ChronoMapCore` JS
binding — the same shape shown [above](#chrono-map-core) — ready to load from a Worker in place
of `packages/engine/src/worker.ts`'s pure-JS `handleRequest`. Enable `spatial` alongside `wasm`
if the worker also needs viewport queries: `-- --features wasm,spatial`.

## Parity with the golden vectors {#parity}

```text
crates/chronomap-core/tests/vectors.rs
```

replays `test-vectors/*.json` — generated from the TypeScript reference by
[`chronomap-check --vectors`](cli.md#vectors) — against this crate. `time.json` must match
exactly (every `When` input the reference considers interesting, including the ones that must
fail to parse); every `*.frames.json` field must match **within an absolute tolerance of
`1e-6`** for floats, and exactly for strings and diagnostics (`level`, `code`, `path`, in
order — contract [§13](contract.md#sec-13)). `cargo test --all-features` runs this alongside the
`spatial` index's own unit tests and a few structural invariants (loading never panics on junk
input, non-numeric coordinates are rejected, a campaign without chapters is rejected, chapter
progress stays inside its window).

When the contract's semantics change: change the TypeScript in `packages/engine/src` first,
regenerate the vectors with `npm run vectors`, then port the change here — never the other
direction. CI fails if the committed vectors are stale (see [CLAUDE.md](gh:CLAUDE.md)), and
`cargo test --all-features` fails if this crate drifts from them.
