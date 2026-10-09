//! # histamation-core
//!
//! A faithful Rust port of the Histamation reference engine (`packages/engine/src/*.ts`),
//! the runtime behind plug-and-play spatio-temporal storytelling maps.
//!
//! The TypeScript reference is the executable spec: it generated `test-vectors/`, and
//! `tests/vectors.rs` replays those vectors against this crate — diagnostics compared
//! position by position, every frame field to 1e-6.
//!
//! ## The three layers
//!
//! | Module | Contract | What it does |
//! |---|---|---|
//! | [`time`] | §3 | EDTF-subset `When` → `i64` ticks (seconds since 1970-01-01, proleptic Gregorian) |
//! | [`campaign`] | §8 | semantic validation (diagnostic codes + JSON Pointer paths) and normalisation |
//! | [`resolve`] | §4–§6 | `resolve_frame(campaign, t)`: what is on the map at tick `t` |
//!
//! [`model`] holds the serde shapes for both the file and the normalised form.
//!
//! ```no_run
//! use histamation_core::{load_campaign_str, resolve_frame, chapter_time, ResolveOptions};
//!
//! let json = std::fs::read_to_string("campaign.json").unwrap();
//! let result = load_campaign_str(&json);
//! for d in &result.diagnostics {
//!     println!("{} {} {}  {}", d.level.as_str(), d.code, d.path, d.message);
//! }
//! // Any `error` rejects the file (contract §7.1).
//! if let Some(campaign) = result.campaign {
//!     let t = chapter_time(&campaign.chapters[0], 0.5);
//!     let frame = resolve_frame(&campaign, t, &ResolveOptions::default());
//!     println!("{} — {} entities", frame.iso, frame.entities.len());
//! }
//! ```
//!
//! ## Things the port keeps that are easy to get wrong
//!
//! * **Ticks are signed.** Every campaign in the corpus predates 1970.
//! * **Year zero exists.** Years are astronomical (`0000` = 1 BCE), `-0000` is rejected,
//!   and the calendar math is integer days-from-civil, never a `Date`.
//! * **Ranges are half-open.** A `When` covers `[start, end)`, and a chapter maps scroll
//!   progress with `t = start + floor(p × (end − start − 1))` so `p = 1` stays inside.
//! * **Diagnostic order is part of the contract**, not an implementation detail.
//!
//! ## Cargo features
//!
//! * `spatial` — an [`rstar`](https://docs.rs/rstar) index over the static point layers
//!   for viewport queries.
//! * `wasm` — a `wasm-bindgen` surface mirroring the worker protocol.
//!
//! Neither is on by default, so `cargo test` needs no extra toolchain.

pub mod campaign;
pub mod model;
pub mod resolve;
pub mod time;

#[cfg(feature = "spatial")]
pub mod spatial;

#[cfg(feature = "wasm")]
pub mod wasm;

pub use campaign::{default_radius, haversine, load_campaign, load_campaign_str, CONTRACT_MAJOR};
pub use model::{
    quantity_value, Camera, CampaignEvent, CampaignFile, CampaignMeta, Certainty, Chapter, Coord,
    Diagnostic, DiagnosticLevel, Entity, Faction, FrameEntity, FrameEvent, FrameState, LoadResult,
    LocalizedText, Location, Media, NormChapter, NormEntity, NormEvent, NormPlace, NormState,
    NormWaypoint, NormalizedCampaign, Part, Participant, Place, PolygonGeometry, Quantity, Source,
    Span, StateEntry, Style, Waypoint,
};
pub use resolve::{
    along_path, chapter_at, chapter_time, initial_bearing, resolve_frame, state_at, PathPoint,
    ResolveOptions,
};
pub use time::{
    civil_from_days, days_from_civil, days_in_month, is_leap_year, parse_date, parse_when,
    resolve_when, resolve_when_str, ticks_to_iso, ParsedDate, ParsedWhen, Precision, Qualifier,
    ResolvedWhen, Ticks, WhenError,
};
