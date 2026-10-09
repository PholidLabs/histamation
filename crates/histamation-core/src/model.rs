//! Serde shapes for the campaign file and for everything the loader produces —
//! a port of `packages/engine/src/types.ts`.
//!
//! Two deliberate choices run through this module:
//!
//! * **Nothing here refuses to deserialize.** The reference loader is duck-typed: a
//!   malformed coordinate becomes diagnostic `E011`, not a parse failure. Fields that
//!   are genuinely union-typed in the contract ([`Coord`], [`Location`], [`Quantity`],
//!   [`LocalizedText`]) are therefore newtypes over raw JSON with typed accessors,
//!   and every other field is `Option` + `#[serde(default)]`.
//! * **Unknown keys are kept**, not dropped: `x-` extensions (and `$schema`) land in
//!   each struct's `extra` map so a round-trip through this crate is lossless.

use serde::{Deserialize, Deserializer, Serialize};
use serde_json::{Map, Value};
use std::collections::BTreeMap;

pub use crate::time::Ticks;

/// Leftover (`x-…`, `$schema`, forward-compatible) keys on any object.
pub type Extensions = Map<String, Value>;

/// `exact` | `approximate` | `conjectural`. Kept as a string: the reference
/// implementation never validates the enum and passes unknown values straight through
/// to the frame, so widening it to an enum here would change observable output.
pub type Certainty = String;

/// `#[serde(default, deserialize_with = "some")]` keeps the difference between an
/// absent key and an explicit `null`, which `event.at` depends on (absent → `I201`,
/// `null` → `E011`).
fn some<'de, D, T>(d: D) -> Result<Option<T>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    T::deserialize(d).map(Some)
}

/* -------------------------------------------------------------------------- */
/* union-typed leaves                                                          */
/* -------------------------------------------------------------------------- */

/// `[lng, lat]` or `[lng, lat, alt]` exactly as written in the file.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Coord(pub Value);

impl Coord {
    /// `[lng, lat]` when the value is an array of at least two numbers.
    pub fn lng_lat(&self) -> Option<[f64; 2]> {
        let a = self.0.as_array()?;
        if a.len() < 2 {
            return None;
        }
        Some([a[0].as_f64()?, a[1].as_f64()?])
    }

    /// Array length, or 0 when the value is not an array.
    pub fn len(&self) -> usize {
        self.0.as_array().map_or(0, Vec::len)
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub fn is_array(&self) -> bool {
        self.0.is_array()
    }

    /// `c[i]` with JS semantics: a missing or non-numeric slot reads as `NaN`.
    /// `check_coord` rejects such coordinates, so no NaN reaches loaded geometry.
    pub fn nth(&self, i: usize) -> f64 {
        self.0
            .as_array()
            .and_then(|a| a.get(i))
            .and_then(Value::as_f64)
            .unwrap_or(f64::NAN)
    }
}

/// A place id, or an inline coordinate.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Location(pub Value);

impl Location {
    /// `Some(id)` when the location is a place reference rather than a coordinate.
    pub fn place_id(&self) -> Option<&str> {
        self.0.as_str()
    }
    pub fn as_coord(&self) -> Coord {
        Coord(self.0.clone())
    }
}

/// An integer, or `{ min, max, note? }` when sources disagree.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Quantity(pub Value);

impl Quantity {
    pub fn min_max(&self) -> Option<(f64, f64)> {
        let o = self.0.as_object()?;
        Some((o.get("min")?.as_f64()?, o.get("max")?.as_f64()?))
    }
    /// `quantityValue` from campaign.ts: a number is itself, a range is its midpoint.
    pub fn value(&self) -> f64 {
        if let Some(n) = self.0.as_f64() {
            return n;
        }
        match self.min_max() {
            Some((lo, hi)) => (lo + hi) / 2.0,
            // JS computes `(undefined + undefined) / 2` here, i.e. NaN. Keep it:
            // NaN serialises back to JSON `null`, same as the reference.
            None => f64::NAN,
        }
    }
}

/// `quantityValue(q)` for an optional quantity.
pub fn quantity_value(q: Option<&Quantity>) -> Option<f64> {
    q.filter(|q| !q.0.is_null()).map(Quantity::value)
}

/// A plain string (in `meta.defaultLanguage`) or a `{ lang: text }` map.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct LocalizedText(pub Value);

impl LocalizedText {
    /// requested language → `defaultLanguage` → first available (contract §7.4).
    pub fn pick(&self, language: &str, default_language: &str) -> Option<&str> {
        match &self.0 {
            Value::String(s) => Some(s),
            Value::Object(m) => m
                .get(language)
                .or_else(|| m.get(default_language))
                .or_else(|| m.values().next())
                .and_then(Value::as_str),
            _ => None,
        }
    }
}

/// `[west, south, east, north]`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Bbox(pub Value);

impl Bbox {
    pub fn wsen(&self) -> Option<[f64; 4]> {
        let a = self.0.as_array()?;
        if a.len() < 4 {
            return None;
        }
        Some([
            a[0].as_f64()?,
            a[1].as_f64()?,
            a[2].as_f64()?,
            a[3].as_f64()?,
        ])
    }
}

/* -------------------------------------------------------------------------- */
/* file shapes                                                                 */
/* -------------------------------------------------------------------------- */

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Faction {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<LocalizedText>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub short_name: Option<LocalizedText>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<LocalizedText>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sources: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<LocalizedText>,
    #[serde(flatten)]
    pub extra: Extensions,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Part {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<LocalizedText>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<LocalizedText>,
    #[serde(flatten)]
    pub extra: Extensions,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Place {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<LocalizedText>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub modern_name: Option<LocalizedText>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(
        default,
        deserialize_with = "some",
        skip_serializing_if = "Option::is_none"
    )]
    pub coordinates: Option<Coord>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub certainty: Option<Certainty>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub radius_meters: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rank: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<LocalizedText>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sources: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub media: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<LocalizedText>,
    #[serde(flatten)]
    pub extra: Extensions,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StateEntry {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub when: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub faction: Option<String>,
    #[serde(
        default,
        deserialize_with = "some",
        skip_serializing_if = "Option::is_none"
    )]
    pub strength: Option<Quantity>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<LocalizedText>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sources: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<LocalizedText>,
    #[serde(flatten)]
    pub extra: Extensions,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Waypoint {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub when: Option<String>,
    #[serde(
        default,
        deserialize_with = "some",
        skip_serializing_if = "Option::is_none"
    )]
    pub at: Option<Location>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub via: Option<Vec<Coord>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<String>,
    #[serde(
        default,
        deserialize_with = "some",
        skip_serializing_if = "Option::is_none"
    )]
    pub strength: Option<Quantity>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub certainty: Option<Certainty>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<LocalizedText>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sources: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<LocalizedText>,
    #[serde(flatten)]
    pub extra: Extensions,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Style {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dash: Option<Vec<f64>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opacity: Option<f64>,
    /// `full` | `leg` | `none`
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail: Option<String>,
    /// `strength`
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width_by: Option<String>,
    #[serde(flatten)]
    pub extra: Extensions,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PolygonGeometry {
    /// `Polygon` | `MultiPolygon`
    #[serde(rename = "type", default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    /// `Coord[][]` for a Polygon, `Coord[][][]` for a MultiPolygon. Held raw so a
    /// wrongly nested array becomes `E011`/`E010` rather than a parse error.
    #[serde(
        default,
        deserialize_with = "some",
        skip_serializing_if = "Option::is_none"
    )]
    pub coordinates: Option<Value>,
    #[serde(flatten)]
    pub extra: Extensions,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entity {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<LocalizedText>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub faction: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub when: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<LocalizedText>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub commanders: Option<Vec<LocalizedText>>,
    #[serde(
        default,
        deserialize_with = "some",
        skip_serializing_if = "Option::is_none"
    )]
    pub at: Option<Location>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub track: Option<Vec<Waypoint>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub geometry: Option<PolygonGeometry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<Vec<Location>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub states: Option<Vec<StateEntry>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub certainty: Option<Certainty>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style: Option<Style>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sources: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub media: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<LocalizedText>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(flatten)]
    pub extra: Extensions,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Participant {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub faction: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub commanders: Option<Vec<LocalizedText>>,
    #[serde(
        default,
        deserialize_with = "some",
        skip_serializing_if = "Option::is_none"
    )]
    pub strength: Option<Quantity>,
    #[serde(
        default,
        deserialize_with = "some",
        skip_serializing_if = "Option::is_none"
    )]
    pub losses: Option<Quantity>,
    #[serde(flatten)]
    pub extra: Extensions,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Outcome {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub victor: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<LocalizedText>,
    #[serde(flatten)]
    pub extra: Extensions,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CampaignEvent {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<LocalizedText>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub when: Option<String>,
    /// `Some(Location(Value::Null))` when the key is present but null — that is not
    /// the same as absent (`I201`) to the reference loader.
    #[serde(
        default,
        deserialize_with = "some",
        skip_serializing_if = "Option::is_none"
    )]
    pub at: Option<Location>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub certainty: Option<Certainty>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub participants: Option<Vec<Participant>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub outcome: Option<Outcome>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<LocalizedText>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub importance: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sources: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub media: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<LocalizedText>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(flatten)]
    pub extra: Extensions,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Camera {
    #[serde(
        default,
        deserialize_with = "some",
        skip_serializing_if = "Option::is_none"
    )]
    pub center: Option<Coord>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub zoom: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pitch: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bearing: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<f64>,
    /// `fly` | `ease` | `jump`
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transition: Option<String>,
    #[serde(flatten)]
    pub extra: Extensions,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Chapter {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub part: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<LocalizedText>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub when: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub date_label: Option<LocalizedText>,
    #[serde(
        default,
        deserialize_with = "some",
        skip_serializing_if = "Option::is_none"
    )]
    pub body: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub camera: Option<Camera>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub focus: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub media: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sources: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<LocalizedText>,
    #[serde(flatten)]
    pub extra: Extensions,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(rename = "type", default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub citation: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub accessed: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<LocalizedText>,
    #[serde(flatten)]
    pub extra: Extensions,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Media {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(rename = "type", default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thumbnail_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub alt: Option<LocalizedText>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub caption: Option<LocalizedText>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub creator: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub date: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub license: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub holder: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<LocalizedText>,
    #[serde(flatten)]
    pub extra: Extensions,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Timeline {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub extent: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub focus: Option<String>,
    #[serde(flatten)]
    pub extra: Extensions,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapView {
    #[serde(
        default,
        deserialize_with = "some",
        skip_serializing_if = "Option::is_none"
    )]
    pub center: Option<Coord>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub zoom: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pitch: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bearing: Option<f64>,
    #[serde(
        default,
        deserialize_with = "some",
        skip_serializing_if = "Option::is_none"
    )]
    pub bounds: Option<Bbox>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub terrain: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub theme: Option<String>,
    #[serde(flatten)]
    pub extra: Extensions,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Author {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(flatten)]
    pub extra: Extensions,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CampaignMeta {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<LocalizedText>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subtitle: Option<LocalizedText>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<LocalizedText>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content_warning: Option<LocalizedText>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub languages: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_language: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub license: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub authors: Option<Vec<Author>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timeline: Option<Timeline>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub map: Option<MapView>,
    #[serde(flatten)]
    pub extra: Extensions,
}

/// The whole campaign file. `extra` keeps `$schema` and any top-level `x-` block
/// (the Napoleon file carries Minard's temperature table there).
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CampaignFile {
    #[serde(
        default,
        deserialize_with = "some",
        skip_serializing_if = "Option::is_none"
    )]
    pub histamation: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<CampaignMeta>,
    #[serde(default)]
    pub factions: Vec<Faction>,
    #[serde(default)]
    pub parts: Vec<Part>,
    #[serde(default)]
    pub places: Vec<Place>,
    #[serde(default)]
    pub entities: Vec<Entity>,
    #[serde(default)]
    pub events: Vec<CampaignEvent>,
    #[serde(default)]
    pub chapters: Vec<Chapter>,
    #[serde(default)]
    pub sources: Vec<Source>,
    #[serde(default)]
    pub media: Vec<Media>,
    #[serde(flatten)]
    pub extra: Extensions,
}

/* -------------------------------------------------------------------------- */
/* diagnostics                                                                 */
/* -------------------------------------------------------------------------- */

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DiagnosticLevel {
    Error,
    Warning,
    Info,
}

impl DiagnosticLevel {
    pub fn as_str(self) -> &'static str {
        match self {
            DiagnosticLevel::Error => "error",
            DiagnosticLevel::Warning => "warning",
            DiagnosticLevel::Info => "info",
        }
    }
}

/// One validation finding. `path` is a JSON Pointer into the campaign file; `code`
/// and `path` are normative (contract §8) and the golden vectors compare them.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Diagnostic {
    pub level: DiagnosticLevel,
    pub code: String,
    pub path: String,
    pub message: String,
}

/* -------------------------------------------------------------------------- */
/* normalized model                                                            */
/* -------------------------------------------------------------------------- */

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Span {
    pub start: Ticks,
    pub end: Ticks,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NormPlace {
    pub id: String,
    pub coord: [f64; 2],
    pub certainty: Option<Certainty>,
    pub radius_meters: f64,
    pub raw: Place,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NormState {
    /// Index in the source `states` array — states that failed validation are dropped,
    /// so this is not the position in `NormEntity::states`.
    pub index: usize,
    pub start: Ticks,
    /// `None` for a point state: it lasts until something replaces it.
    pub end: Option<Ticks>,
    pub status: Option<String>,
    pub faction: Option<String>,
    pub strength: Option<f64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NormWaypoint {
    /// Index in the source `track` array (see [`NormState::index`]).
    pub index: usize,
    pub arrive: Ticks,
    /// `end(when)` for an interval, otherwise `arrive` — the unit passes through.
    pub depart: Ticks,
    pub end: Ticks,
    pub coord: [f64; 2],
    pub mode: String,
    pub certainty: Option<Certainty>,
    pub strength: Option<f64>,
    /// `[previous coord, ...via, coord]`; `None` on the first waypoint.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub leg: Option<Vec<[f64; 2]>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub leg_length: Option<f64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NormEntity {
    pub id: String,
    pub kind: String,
    pub faction: String,
    pub certainty: Option<Certainty>,
    pub style: Style,
    pub start: Ticks,
    pub end: Ticks,
    pub states: Vec<NormState>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub track: Option<Vec<NormWaypoint>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub coord: Option<[f64; 2]>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub polygons: Option<Vec<Vec<Vec<Coord>>>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<Vec<[f64; 2]>>,
    pub raw: Entity,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NormEvent {
    pub id: String,
    pub kind: String,
    pub start: Ticks,
    pub end: Ticks,
    pub coord: Option<[f64; 2]>,
    pub certainty: Option<Certainty>,
    pub importance: f64,
    pub raw: CampaignEvent,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NormChapter {
    pub id: String,
    pub index: usize,
    pub start: Ticks,
    pub end: Ticks,
    pub camera: Option<Camera>,
    pub focus: Vec<String>,
    pub raw: Chapter,
}

/// Everything `resolve_frame` needs, with every `When` already reduced to ticks.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedCampaign {
    pub raw: Value,
    pub meta: CampaignMeta,
    pub extent: Span,
    pub focus: Span,
    pub languages: Vec<String>,
    pub default_language: Option<String>,
    pub factions: BTreeMap<String, Faction>,
    pub places: BTreeMap<String, NormPlace>,
    pub entities: Vec<NormEntity>,
    pub events: Vec<NormEvent>,
    pub chapters: Vec<NormChapter>,
}

/* -------------------------------------------------------------------------- */
/* frames                                                                      */
/* -------------------------------------------------------------------------- */

/// A field that may be **absent** from the frame (`None`) or **present and null**
/// (`Some(None)`). The reference implementation distinguishes the two — a static
/// fortification carries `strength: null` but no `bearing` key at all — and the
/// golden vectors encode that distinction, so the port has to keep it.
pub type Nullable<T> = Option<Option<T>>;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameEntity {
    pub id: String,
    pub kind: String,
    pub faction: String,
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub position: Option<[f64; 2]>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bearing: Nullable<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub moving: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub waypoint: Nullable<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub leg: Nullable<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub leg_progress: Nullable<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub strength: Nullable<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub certainty: Nullable<Certainty>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail: Option<Vec<[f64; 2]>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trail_length: Option<usize>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameEvent {
    pub id: String,
    pub kind: String,
    /// `active` | `past`. Upcoming events are not in the frame at all.
    pub phase: String,
    pub progress: f64,
    pub since_end: i64,
    pub position: Option<[f64; 2]>,
    pub importance: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameState {
    pub t: Ticks,
    pub iso: String,
    pub entities: Vec<FrameEntity>,
    pub events: Vec<FrameEvent>,
}

/// What [`crate::campaign::load_campaign`] returns: a campaign unless something was
/// an `error`, plus every diagnostic in reference order.
#[derive(Clone, Debug)]
pub struct LoadResult {
    pub campaign: Option<NormalizedCampaign>,
    pub diagnostics: Vec<Diagnostic>,
}

impl LoadResult {
    pub fn ok(&self) -> bool {
        self.campaign.is_some()
    }
    pub fn errors(&self) -> impl Iterator<Item = &Diagnostic> {
        self.diagnostics
            .iter()
            .filter(|d| d.level == DiagnosticLevel::Error)
    }
}
