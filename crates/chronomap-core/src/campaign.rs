//! Semantic validation + normalisation (contract §8) — a port of
//! `packages/engine/src/campaign.ts`.
//!
//! Diagnostic **codes, JSON Pointer paths and emission order** are normative: the
//! golden vectors compare the whole list position by position, so every rule below
//! runs in exactly the order the reference implementation runs it in. Structural
//! (JSON Schema) validation is an authoring/CI concern and deliberately absent here.

use std::collections::{BTreeMap, BTreeSet};

use serde_json::Value;

use crate::model::*;
use crate::time::{parse_when, resolve_when, ParsedWhen, ResolvedWhen, Ticks};

pub const CONTRACT_MAJOR: i64 = 1;

const COLLECTIONS: [&str; 8] = [
    "factions", "parts", "places", "entities", "events", "chapters", "sources", "media",
];

const TEXT_KEYS: [&str; 15] = [
    "name",
    "shortName",
    "title",
    "subtitle",
    "description",
    "contentWarning",
    "modernName",
    "summary",
    "notes",
    "label",
    "dateLabel",
    "body",
    "caption",
    "alt",
    "note",
];

fn type_of_collection(coll: &str) -> &'static str {
    match coll {
        "factions" => "faction",
        "parts" => "part",
        "places" => "place",
        "entities" => "entity",
        "events" => "event",
        "chapters" => "chapter",
        "sources" => "source",
        "media" => "media",
        _ => "",
    }
}

/// Halo radius when a place does not give one (contract §7.4).
pub fn default_radius(certainty: Option<&str>) -> f64 {
    match certainty {
        Some("exact") => 100.0,
        Some("conjectural") => 15_000.0,
        // `DEFAULT_RADIUS[c] ?? DEFAULT_RADIUS.approximate`: an unknown or missing
        // certainty falls back to the approximate radius rather than to zero.
        _ => 3_000.0,
    }
}

/// Great-circle distance in metres on a sphere of the IUGG mean Earth radius.
pub fn haversine(a: [f64; 2], b: [f64; 2]) -> f64 {
    const R: f64 = 6_371_008.8;
    let to_rad = std::f64::consts::PI / 180.0;
    let d_lat = (b[1] - a[1]) * to_rad;
    let d_lng = (b[0] - a[0]) * to_rad;
    let h = (d_lat / 2.0).sin().powi(2)
        + (a[1] * to_rad).cos() * (b[1] * to_rad).cos() * (d_lng / 2.0).sin().powi(2);
    2.0 * R * js_min(1.0, h.sqrt()).asin()
}

/// `Math.min`, which propagates NaN. Rust's `f64::min` returns the *other* operand
/// instead, which would silently repair malformed coordinates.
#[inline]
pub(crate) fn js_min(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else if a < b {
        a
    } else {
        b
    }
}

/// `Math.max`, NaN-propagating for the same reason as [`js_min`].
#[inline]
pub(crate) fn js_max(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else if a > b {
        a
    } else {
        b
    }
}

/// `Math.round`: halfway cases go towards +∞, not away from zero as `f64::round` does.
#[inline]
pub(crate) fn js_round(x: f64) -> f64 {
    if !x.is_finite() {
        return x;
    }
    let f = x.floor();
    if x - f >= 0.5 {
        f + 1.0
    } else {
        f
    }
}

/// JSON Pointer escaping (RFC 6901).
fn esc(s: &str) -> String {
    s.replace('~', "~0").replace('/', "~1")
}

/// JS `String(value)` for the values that reach a diagnostic message.
fn js_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Null => "null".to_string(),
        other => other.to_string(),
    }
}

/// JS truthiness.
fn js_truthy(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().is_some_and(|f| f != 0.0 && !f.is_nan()),
        Value::String(s) => !s.is_empty(),
        _ => true,
    }
}

/// `^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$`
fn is_lang_tag(s: &str) -> bool {
    let mut parts = s.split('-');
    match parts.next() {
        Some(first)
            if (2..=3).contains(&first.len()) && first.bytes().all(|c| c.is_ascii_lowercase()) => {}
        _ => return false,
    }
    parts.all(|p| (2..=8).contains(&p.len()) && p.bytes().all(|c| c.is_ascii_alphanumeric()))
}

/// `/^\s*(javascript|data|vbscript|file):/i`
fn has_unsafe_scheme(u: &str) -> bool {
    let t = u.trim_start();
    ["javascript:", "data:", "vbscript:", "file:"]
        .iter()
        .any(|s| t.len() >= s.len() && t[..s.len()].eq_ignore_ascii_case(s))
}

/// `/<\s*[a-z!\/]/i`
fn has_raw_html(s: &str) -> bool {
    let chars: Vec<char> = s.chars().collect();
    for (i, c) in chars.iter().enumerate() {
        if *c != '<' {
            continue;
        }
        let mut j = i + 1;
        while j < chars.len() && chars[j].is_whitespace() {
            j += 1;
        }
        if let Some(&n) = chars.get(j) {
            if n.is_ascii_alphabetic() || n == '!' || n == '/' {
                return true;
            }
        }
    }
    false
}

/// `/\]\(([^)\s]+)/g` — the URL part of a Markdown link.
fn markdown_link_targets(s: &str) -> Vec<String> {
    let chars: Vec<char> = s.chars().collect();
    let mut out = Vec::new();
    let mut i = 0usize;
    while i + 1 < chars.len() {
        if chars[i] == ']' && chars[i + 1] == '(' {
            let mut j = i + 2;
            while j < chars.len() && chars[j] != ')' && !chars[j].is_whitespace() {
                j += 1;
            }
            if j > i + 2 {
                out.push(chars[i + 2..j].iter().collect());
                i = j;
                continue;
            }
        }
        i += 1;
    }
    out
}

/// JS `Number(x).toFixed(1)` for the W107 message. Ties round up in ECMAScript but
/// half-to-even in Rust's formatter, so round explicitly first.
fn to_fixed_1(x: f64) -> String {
    format!("{:.1}", js_round(x * 10.0) / 10.0)
}

struct Ctx {
    diags: Vec<Diagnostic>,
    by_id: BTreeMap<String, (&'static str, String)>,
    used: BTreeSet<String>,
    languages: Vec<String>,
    default_language: Option<String>,
    bounds: Option<[f64; 4]>,
    places: BTreeMap<String, NormPlace>,
    extent: Span,
    extent_text: String,
}

impl Ctx {
    fn err(&mut self, code: &str, path: &str, message: String) {
        self.push(DiagnosticLevel::Error, code, path, message);
    }
    fn warn(&mut self, code: &str, path: &str, message: String) {
        self.push(DiagnosticLevel::Warning, code, path, message);
    }
    fn info(&mut self, code: &str, path: &str, message: String) {
        self.push(DiagnosticLevel::Info, code, path, message);
    }
    fn push(&mut self, level: DiagnosticLevel, code: &str, path: &str, message: String) {
        self.diags.push(Diagnostic {
            level,
            code: code.to_string(),
            path: path.to_string(),
            message,
        });
    }

    /* ---- localized text ---------------------------------------------------- */

    fn check_text(&mut self, t: &Value, path: &str) {
        if t.is_string() {
            return;
        }
        let keys: Vec<String> = match t {
            Value::Object(m) => m.keys().cloned().collect(),
            // `typeof [] === 'object'`, so an array reaches Object.keys() as indices.
            Value::Array(a) => (0..a.len()).map(|i| i.to_string()).collect(),
            _ => return,
        };
        if let Some(dl) = self.default_language.clone() {
            if !dl.is_empty() && !keys.contains(&dl) {
                self.err(
                    "E008",
                    path,
                    format!("Localized text is missing the default language \"{dl}\""),
                );
            }
        }
        for k in &keys {
            if !self.languages.contains(k) {
                self.err(
                    "E009",
                    &format!("{path}/{k}"),
                    format!("Language \"{k}\" is not declared in meta.languages"),
                );
            }
        }
        let missing: Vec<String> = self
            .languages
            .iter()
            .filter(|l| !keys.contains(l))
            .cloned()
            .collect();
        if !missing.is_empty() {
            self.warn(
                "W101",
                path,
                format!("Missing translation: {}", missing.join(", ")),
            );
        }
    }

    fn walk_text(&mut self, node: &Value, path: &str) {
        match node {
            Value::Array(a) => {
                for (i, v) in a.iter().enumerate() {
                    self.walk_text(v, &format!("{path}/{i}"));
                }
            }
            Value::Object(o) => {
                for (k, v) in o {
                    let p = format!("{}/{}", path, esc(k));
                    if k == "commanders" {
                        if let Value::Array(a) = v {
                            for (i, t) in a.iter().enumerate() {
                                self.check_text(t, &format!("{p}/{i}"));
                            }
                            continue;
                        }
                    }
                    let looks_localized = match v {
                        Value::String(_) => true,
                        Value::Object(m) => m.keys().all(|kk| is_lang_tag(kk)),
                        _ => false,
                    };
                    if TEXT_KEYS.contains(&k.as_str()) && looks_localized {
                        self.check_text(v, &p);
                        continue;
                    }
                    self.walk_text(v, &p);
                }
            }
            _ => {}
        }
    }

    /* ---- references -------------------------------------------------------- */

    fn ref_id(&mut self, id: Option<&str>, expected: &[&str], path: &str) -> Option<&'static str> {
        // `byId.get(undefined)` simply misses, and the message interpolates "undefined".
        let key = id.unwrap_or("undefined");
        let hit = self.by_id.get(key).map(|(t, _)| *t);
        match hit {
            None => {
                let want = if expected.is_empty() {
                    String::new()
                } else {
                    format!(" (expected a {})", expected.join(" or "))
                };
                self.err("E002", path, format!("Unknown id \"{key}\"{want}"));
                None
            }
            Some(ty) => {
                if !expected.is_empty() && !expected.contains(&ty) {
                    self.err(
                        "E003",
                        path,
                        format!("\"{key}\" is a {ty}, expected a {}", expected.join(" or ")),
                    );
                    return None;
                }
                self.used.insert(key.to_string());
                Some(ty)
            }
        }
    }

    fn ref_list(&mut self, list: Option<&Vec<String>>, expected: &[&str], path: &str) {
        if let Some(list) = list {
            for (i, id) in list.iter().enumerate() {
                self.ref_id(Some(id), expected, &format!("{path}/{i}"));
            }
        }
    }

    fn check_url(&mut self, u: Option<&String>, path: &str) {
        if let Some(u) = u {
            if has_unsafe_scheme(u) {
                let head: String = u.chars().take(40).collect();
                self.err("E015", path, format!("Unsafe URL scheme in \"{head}\""));
            }
        }
    }

    fn check_quantity(&mut self, q: Option<&Quantity>, path: &str) {
        if let Some(q) = q {
            if let Some((min, max)) = q.min_max() {
                if min > max {
                    self.err(
                        "E012",
                        path,
                        format!("Quantity min ({min}) is greater than max ({max})"),
                    );
                }
            }
        }
    }

    /* ---- coordinates ------------------------------------------------------- */

    fn check_coord(&mut self, c: Option<&Coord>, path: &str) -> Option<[f64; 2]> {
        let c = match c {
            // `nth` reads a non-numeric slot as NaN, so this is `Number.isFinite` in the reference.
            Some(c)
                if c.is_array() && c.len() >= 2 && c.nth(0).is_finite() && c.nth(1).is_finite() =>
            {
                c
            }
            _ => {
                self.err("E011", path, "Coordinate must be [lng, lat]".to_string());
                return None;
            }
        };
        let (lng, lat) = (c.nth(0), c.nth(1));
        if lng.abs() > 180.0 || lat.abs() > 90.0 {
            let raw = c.0.as_array();
            let (ls, as_) = match raw {
                Some(a) => (js_string(&a[0]), js_string(&a[1])),
                None => (lng.to_string(), lat.to_string()),
            };
            self.err(
                "E011",
                path,
                format!("Coordinate [{ls}, {as_}] out of range"),
            );
            return None;
        }
        if let Some([w, s, e, n]) = self.bounds {
            if lng < w || lng > e || lat < s || lat > n {
                let swapped = lat >= w && lat <= e && lng >= s && lng <= n;
                let hint = if swapped {
                    " — it looks like longitude and latitude are swapped"
                } else {
                    ""
                };
                let raw = c.0.as_array();
                let (ls, as_) = match raw {
                    Some(a) => (js_string(&a[0]), js_string(&a[1])),
                    None => (lng.to_string(), lat.to_string()),
                };
                self.warn(
                    "W102",
                    path,
                    format!("Coordinate [{ls}, {as_}] is outside meta.map.bounds{hint}"),
                );
            }
        }
        Some([lng, lat])
    }

    /// A place id resolves through the gazetteer; anything else is an inline coordinate.
    fn location(&mut self, loc: Option<&Location>, path: &str) -> Option<[f64; 2]> {
        if let Some(l) = loc {
            if let Some(id) = l.place_id() {
                return match self.ref_id(Some(id), &["place"], path) {
                    Some(_) => self.places.get(id).map(|p| p.coord),
                    None => None,
                };
            }
        }
        let coord = loc.map(Location::as_coord);
        self.check_coord(coord.as_ref(), path)
    }

    /* ---- time -------------------------------------------------------------- */

    fn safe_when(&mut self, text: Option<&str>, path: &str) -> Option<ParsedWhen> {
        let Some(text) = text else {
            // `parseWhen(undefined)` throws the same "non-empty string" WhenError.
            self.err("E004", path, "when must be a non-empty string".to_string());
            return None;
        };
        match parse_when(text) {
            Ok(w) => Some(w),
            Err(e) => {
                self.err("E004", path, e.into_message());
                None
            }
        }
    }

    /// `safe_when` + open-end resolution + the E005 extent check.
    fn when(&mut self, text: Option<&str>, path: &str) -> Option<ResolvedWhen> {
        let w = self.safe_when(text, path)?;
        let r = resolve_when(&w, self.extent.start, self.extent.end);
        if r.start < self.extent.start || r.end > self.extent.end {
            let extent_text = self.extent_text.clone();
            self.err(
                "E005",
                path,
                format!(
                    "\"{}\" falls outside timeline.extent \"{extent_text}\"",
                    r.text
                ),
            );
        }
        Some(r)
    }
}

/// Parse and load a campaign from JSON text.
pub fn load_campaign_str(json: &str) -> LoadResult {
    match serde_json::from_str::<Value>(json) {
        Ok(v) => load_campaign(&v),
        Err(e) => LoadResult {
            campaign: None,
            diagnostics: vec![Diagnostic {
                level: DiagnosticLevel::Error,
                code: "E000".to_string(),
                path: String::new(),
                message: format!("Cannot read JSON: {e}"),
            }],
        },
    }
}

/// Validate and normalise a campaign. Never panics: malformed input comes back as
/// diagnostics with `campaign: None`.
pub fn load_campaign(raw: &Value) -> LoadResult {
    let mut cx = Ctx {
        diags: Vec::new(),
        by_id: BTreeMap::new(),
        used: BTreeSet::new(),
        languages: Vec::new(),
        default_language: None,
        bounds: None,
        places: BTreeMap::new(),
        extent: Span { start: 0, end: 0 },
        extent_text: String::new(),
    };

    // `!raw || typeof raw !== 'object'`: null, booleans, numbers and strings are
    // rejected here — but an array is `typeof "object"` in JS and falls through to
    // the ordinary rules, where it simply has none of the keys a campaign needs.
    if !(raw.is_object() || raw.is_array()) {
        cx.err("E000", "", "Campaign must be a JSON object".to_string());
        return LoadResult {
            campaign: None,
            diagnostics: cx.diags,
        };
    }

    // The reference implementation is duck-typed and would throw on a few pathological
    // shapes (a `places` that is not an array, say). A typed port cannot do that, so a
    // shape the model cannot hold becomes an E000 rather than a panic.
    let file: CampaignFile = if raw.is_array() {
        CampaignFile::default()
    } else {
        match serde_json::from_value(raw.clone()) {
            Ok(f) => f,
            Err(e) => {
                cx.err(
                    "E000",
                    "",
                    format!("Campaign does not match the contract shape: {e}"),
                );
                return LoadResult {
                    campaign: None,
                    diagnostics: cx.diags,
                };
            }
        }
    };

    /* contract version */
    let chronomap_display = match &file.chronomap {
        Some(v) => js_string(v),
        None => "undefined".to_string(),
    };
    let version_text = file.chronomap.as_ref().map_or(String::new(), js_string);
    let major: Option<f64> = js_number(version_text.split('.').next().unwrap_or(""));
    if major != Some(CONTRACT_MAJOR as f64) {
        cx.err(
            "E013",
            "/chronomap",
            format!(
                "Unsupported contract version \"{chronomap_display}\" (this engine reads {CONTRACT_MAJOR}.x)"
            ),
        );
    }

    let meta = file.meta.clone().unwrap_or_default();
    cx.languages = meta.languages.clone().unwrap_or_default();
    cx.default_language = meta.default_language.clone();
    if let Some(dl) = &cx.default_language {
        if !dl.is_empty() && !cx.languages.contains(dl) {
            cx.err(
                "E014",
                "/meta/defaultLanguage",
                format!("defaultLanguage \"{dl}\" is not listed in meta.languages"),
            );
        }
    }

    /* ids share one namespace */
    for coll in COLLECTIONS {
        let ids = collection_ids(&file, coll);
        for (i, id) in ids.iter().enumerate() {
            let Some(id) = id else { continue };
            let path = format!("/{coll}/{i}");
            if let Some((_, first)) = cx.by_id.get(id) {
                let first = first.clone();
                cx.err(
                    "E001",
                    &format!("/{coll}/{i}/id"),
                    format!("Duplicate id \"{id}\" (first defined at {first})"),
                );
            } else {
                cx.by_id
                    .insert(id.clone(), (type_of_collection(coll), path));
            }
        }
    }

    /* localized text, over the raw document so `x-` blocks are walked too */
    cx.walk_text(raw, "");

    /* timeline */
    let extent_text_raw = meta.timeline.as_ref().and_then(|t| t.extent.clone());
    cx.extent_text = extent_text_raw
        .clone()
        .unwrap_or_else(|| "undefined".into());
    let extent_w = extent_text_raw
        .as_deref()
        .filter(|s| !s.is_empty())
        .and_then(|s| cx.safe_when(Some(s), "/meta/timeline/extent"));
    let mut extent: Option<Span> = None;
    if let Some(w) = &extent_w {
        match (w.start, w.end) {
            (Some(start), Some(end)) => extent = Some(Span { start, end }),
            _ => cx.err(
                "E004",
                "/meta/timeline/extent",
                "timeline.extent must not have open ends".to_string(),
            ),
        }
    }
    let Some(ext) = extent else {
        cx.err(
            "E004",
            "/meta/timeline/extent",
            "A closed timeline.extent is required".to_string(),
        );
        return LoadResult {
            campaign: None,
            diagnostics: cx.diags,
        };
    };
    cx.extent = ext;

    let mut focus: Option<Span> = None;
    if let Some(f) = meta
        .timeline
        .as_ref()
        .and_then(|t| t.focus.clone())
        .filter(|s| !s.is_empty())
    {
        if let Some(r) = cx.when(Some(&f), "/meta/timeline/focus") {
            focus = Some(Span {
                start: r.start,
                end: r.end,
            });
        }
    }
    let focus = focus.unwrap_or(ext);

    /* coordinates */
    cx.bounds = meta
        .map
        .as_ref()
        .and_then(|m| m.bounds.as_ref())
        .and_then(Bbox::wsen);

    for (i, p) in file.places.iter().enumerate() {
        let coord = cx.check_coord(p.coordinates.as_ref(), &format!("/places/{i}/coordinates"));
        if let (Some(coord), Some(id)) = (coord, p.id.clone()) {
            let radius = p
                .radius_meters
                .unwrap_or_else(|| default_radius(p.certainty.as_deref()));
            cx.places.insert(
                id.clone(),
                NormPlace {
                    id,
                    coord,
                    certainty: p.certainty.clone(),
                    radius_meters: radius,
                    raw: p.clone(),
                },
            );
        }
    }

    let mut factions: BTreeMap<String, Faction> = BTreeMap::new();
    for f in &file.factions {
        if let Some(id) = &f.id {
            factions.insert(id.clone(), f.clone());
        }
    }
    for (i, f) in file.factions.iter().enumerate() {
        cx.ref_list(
            f.sources.as_ref(),
            &["source"],
            &format!("/factions/{i}/sources"),
        );
        cx.used
            .insert(f.id.clone().unwrap_or_else(|| "undefined".into()));
    }
    for (i, s) in file.sources.iter().enumerate() {
        cx.check_url(s.url.as_ref(), &format!("/sources/{i}/url"));
    }
    for (i, m) in file.media.iter().enumerate() {
        cx.check_url(m.url.as_ref(), &format!("/media/{i}/url"));
        cx.check_url(
            m.thumbnail_url.as_ref(),
            &format!("/media/{i}/thumbnailUrl"),
        );
        if let Some(date) = m.date.as_deref().filter(|d| !d.is_empty()) {
            // A metadata date is validated but not bound to the timeline (§3.2).
            cx.safe_when(Some(date), &format!("/media/{i}/date"));
        }
    }
    for (i, p) in file.places.iter().enumerate() {
        cx.ref_list(
            p.sources.as_ref(),
            &["source"],
            &format!("/places/{i}/sources"),
        );
        cx.ref_list(p.media.as_ref(), &["media"], &format!("/places/{i}/media"));
    }

    /* entities */
    let mut entities: Vec<NormEntity> = Vec::new();
    for (i, e) in file.entities.iter().enumerate() {
        let base = format!("/entities/{i}");
        cx.ref_id(
            e.faction.as_deref(),
            &["faction"],
            &format!("{base}/faction"),
        );
        cx.ref_list(e.sources.as_ref(), &["source"], &format!("{base}/sources"));
        cx.ref_list(e.media.as_ref(), &["media"], &format!("{base}/media"));

        let kind = e.kind.clone().unwrap_or_default();
        let is_custom = kind.starts_with("x-");
        let mut states: Vec<NormState> = Vec::new();

        let mut prev_start: Option<Ticks> = None;
        if let Some(list) = &e.states {
            for (j, s) in list.iter().enumerate() {
                let sp = format!("{base}/states/{j}");
                let w = cx.when(s.when.as_deref(), &format!("{sp}/when"));
                if let Some(f) = s.faction.as_deref().filter(|f| !f.is_empty()) {
                    cx.ref_id(Some(f), &["faction"], &format!("{sp}/faction"));
                }
                cx.ref_list(s.sources.as_ref(), &["source"], &format!("{sp}/sources"));
                cx.check_quantity(s.strength.as_ref(), &format!("{sp}/strength"));
                let Some(w) = w else { continue };
                if prev_start.is_some_and(|p| w.start < p) {
                    cx.err(
                        "E007",
                        &format!("{sp}/when"),
                        "states must be sorted by start time".to_string(),
                    );
                }
                prev_start = Some(w.start);
                states.push(NormState {
                    index: j,
                    start: w.start,
                    end: if w.is_interval { Some(w.end) } else { None },
                    status: s.status.clone(),
                    faction: s.faction.clone(),
                    strength: quantity_value(s.strength.as_ref()),
                });
            }
        }

        let mut track: Option<Vec<NormWaypoint>> = None;
        let mut coord: Option<[f64; 2]> = None;
        let mut polygons: Option<Vec<Vec<Vec<Coord>>>> = None;
        let mut path_pts: Option<Vec<[f64; 2]>> = None;
        let mut skip_entity = false;

        if kind == "unit" {
            let mut tr: Vec<NormWaypoint> = Vec::new();
            if let Some(list) = &e.track {
                for (j, wp) in list.iter().enumerate() {
                    let wpp = format!("{base}/track/{j}");
                    let w = cx.when(wp.when.as_deref(), &format!("{wpp}/when"));
                    let at = cx.location(wp.at.as_ref(), &format!("{wpp}/at"));
                    if let Some(via) = &wp.via {
                        for (k, c) in via.iter().enumerate() {
                            cx.check_coord(Some(c), &format!("{wpp}/via/{k}"));
                        }
                    }
                    cx.ref_list(wp.sources.as_ref(), &["source"], &format!("{wpp}/sources"));
                    cx.check_quantity(wp.strength.as_ref(), &format!("{wpp}/strength"));
                    let (Some(w), Some(at)) = (w, at) else {
                        continue;
                    };

                    let place_certainty = wp
                        .at
                        .as_ref()
                        .and_then(Location::place_id)
                        .and_then(|id| cx.places.get(id))
                        .and_then(|p| p.certainty.clone());
                    let certainty = wp
                        .certainty
                        .clone()
                        .or(place_certainty)
                        .or_else(|| e.certainty.clone());

                    let mut node = NormWaypoint {
                        index: j,
                        arrive: w.start,
                        depart: if w.is_interval { w.end } else { w.start },
                        end: w.end,
                        coord: at,
                        mode: wp.mode.clone().unwrap_or_else(|| "land".to_string()),
                        certainty,
                        strength: quantity_value(wp.strength.as_ref()),
                        leg: None,
                        leg_length: None,
                    };

                    if let Some(prev) = tr.last() {
                        let mut leg = vec![prev.coord];
                        if let Some(via) = &wp.via {
                            leg.extend(via.iter().map(|c| [c.nth(0), c.nth(1)]));
                        }
                        leg.push(at);

                        if node.arrive < prev.depart {
                            let arriving = wp.when.clone().unwrap_or_else(|| "undefined".into());
                            let left = list
                                .get(prev.index)
                                .and_then(|p| p.when.clone())
                                .unwrap_or_else(|| "undefined".into());
                            cx.err(
                                "E006",
                                &format!("{wpp}/when"),
                                format!(
                                    "Waypoint arrives ({arriving}) before the previous waypoint is left ({left})"
                                ),
                            );
                        }
                        let dist: f64 = leg
                            .windows(2)
                            .fold(0.0, |d, pair| d + haversine(pair[0], pair[1]));
                        if node.arrive == prev.depart && dist > 1000.0 {
                            cx.warn(
                                "W107",
                                &format!("{wpp}/when"),
                                format!(
                                    "Zero-duration leg of {} km: the unit will jump",
                                    to_fixed_1(dist / 1000.0)
                                ),
                            );
                        }
                        for pair in leg.windows(2) {
                            if (pair[1][0] - pair[0][0]).abs() > 180.0 {
                                cx.warn(
                                    "W109",
                                    &wpp,
                                    "Leg crosses the antimeridian; split it with via points"
                                        .to_string(),
                                );
                            }
                        }
                        node.leg_length = Some(dist);
                        node.leg = Some(leg);
                    }
                    tr.push(node);
                }
            }
            if tr.is_empty() {
                cx.err(
                    "E006",
                    &format!("{base}/track"),
                    "Unit has no usable waypoints".to_string(),
                );
                skip_entity = true;
            } else {
                track = Some(tr);
            }
        } else if kind == "fortification"
            || (is_custom && e.at.as_ref().is_some_and(|a| js_truthy(&a.0)))
        {
            coord = cx.location(e.at.as_ref(), &format!("{base}/at"));
        } else if kind == "territory" || (is_custom && e.geometry.is_some()) {
            let geom = e.geometry.as_ref();
            let is_polygon = geom.and_then(|g| g.kind.as_deref()) == Some("Polygon");
            let coords = geom.and_then(|g| g.coordinates.clone());
            // A Polygon's `coordinates` is one polygon; a MultiPolygon's is a list.
            let polys: Vec<Value> = if is_polygon {
                vec![coords.unwrap_or(Value::Null)]
            } else {
                match coords {
                    Some(Value::Array(a)) => a,
                    _ => Vec::new(),
                }
            };
            let mut out: Vec<Vec<Vec<Coord>>> = Vec::new();
            for (pi, poly) in polys.iter().enumerate() {
                let rings = poly.as_array().cloned().unwrap_or_default();
                let mut out_poly: Vec<Vec<Coord>> = Vec::new();
                for (ri, ring) in rings.iter().enumerate() {
                    let rp = if is_polygon {
                        format!("{base}/geometry/coordinates/{ri}")
                    } else {
                        format!("{base}/geometry/coordinates/{pi}/{ri}")
                    };
                    let pts = ring.as_array().cloned().unwrap_or_default();
                    for (k, c) in pts.iter().enumerate() {
                        cx.check_coord(Some(&Coord(c.clone())), &format!("{rp}/{k}"));
                    }
                    let closed = match (pts.first(), pts.last()) {
                        (Some(a), Some(b)) if js_truthy(a) && js_truthy(b) => {
                            let (ac, bc) = (Coord(a.clone()), Coord(b.clone()));
                            same_ordinate(&ac, &bc, 0) && same_ordinate(&ac, &bc, 1)
                        }
                        _ => false,
                    };
                    if !closed {
                        cx.err(
                            "E010",
                            &rp,
                            "Polygon ring is not closed (first and last positions must be equal)"
                                .to_string(),
                        );
                    }
                    out_poly.push(pts.into_iter().map(Coord).collect());
                }
                out.push(out_poly);
            }
            polygons = Some(out);
        // `e.path` is truthy in JS for any array, including an empty one.
        } else if kind == "route" || (is_custom && e.path.is_some()) {
            let mut pts = Vec::new();
            if let Some(list) = &e.path {
                for (k, l) in list.iter().enumerate() {
                    if let Some(c) = cx.location(Some(l), &format!("{base}/path/{k}")) {
                        pts.push(c);
                    }
                }
            }
            path_pts = Some(pts);
        } else if is_custom {
            cx.err(
                "E016",
                &base,
                format!("Custom kind \"{kind}\" needs one of at, track, geometry or path"),
            );
        }

        if skip_entity {
            continue;
        }

        let has_when = e.when.as_deref().is_some_and(|w| !w.is_empty());
        let span: Option<(Ticks, Ticks)> = if has_when {
            cx.when(e.when.as_deref(), &format!("{base}/when"))
                .map(|w| (w.start, w.end))
        } else if let Some(tr) = &track {
            // Every waypoint list reaching here is non-empty (E006 above).
            Some((tr[0].arrive, tr[tr.len() - 1].end))
        } else {
            Some((ext.start, ext.end))
        };

        if let (Some(tr), true, Some((start, end))) = (&track, has_when, span) {
            let t0 = tr[0].arrive;
            let t1 = tr[tr.len() - 1].depart;
            if t0 < start || t1 > end {
                cx.warn(
                    "W113",
                    &format!("{base}/when"),
                    "Track extends outside the entity's existence interval".to_string(),
                );
            }
        }

        let Some((start, end)) = span else { continue };

        entities.push(NormEntity {
            id: e.id.clone().unwrap_or_default(),
            kind,
            faction: e.faction.clone().unwrap_or_default(),
            certainty: e.certainty.clone(),
            style: e.style.clone().unwrap_or_default(),
            start,
            end,
            states,
            track,
            coord,
            polygons,
            path: path_pts,
            raw: e.clone(),
        });
    }

    /* events */
    let mut events: Vec<NormEvent> = Vec::new();
    for (i, ev) in file.events.iter().enumerate() {
        let base = format!("/events/{i}");
        let w = cx.when(ev.when.as_deref(), &format!("{base}/when"));
        let coord = match &ev.at {
            Some(at) => cx.location(Some(at), &format!("{base}/at")),
            None => None,
        };
        if ev.at.is_none() {
            let id = ev.id.clone().unwrap_or_else(|| "undefined".into());
            cx.info(
                "I201",
                &base,
                format!(
                    "Event \"{id}\" has no location; it will appear on the timeline but not on the map"
                ),
            );
        }
        if let Some(ps) = &ev.participants {
            for (j, p) in ps.iter().enumerate() {
                cx.ref_id(
                    p.faction.as_deref(),
                    &["faction"],
                    &format!("{base}/participants/{j}/faction"),
                );
                cx.check_quantity(
                    p.strength.as_ref(),
                    &format!("{base}/participants/{j}/strength"),
                );
                cx.check_quantity(
                    p.losses.as_ref(),
                    &format!("{base}/participants/{j}/losses"),
                );
            }
        }
        if let Some(v) = ev
            .outcome
            .as_ref()
            .and_then(|o| o.victor.as_deref())
            .filter(|v| !v.is_empty())
        {
            cx.ref_id(Some(v), &["faction"], &format!("{base}/outcome/victor"));
        }
        cx.ref_list(ev.sources.as_ref(), &["source"], &format!("{base}/sources"));
        cx.ref_list(ev.media.as_ref(), &["media"], &format!("{base}/media"));
        if ev.sources.as_ref().is_none_or(|s| s.is_empty()) {
            let id = ev.id.clone().unwrap_or_else(|| "undefined".into());
            cx.warn("W114", &base, format!("Event \"{id}\" cites no sources"));
        }
        if let Some(w) = w {
            let place_certainty = ev
                .at
                .as_ref()
                .and_then(Location::place_id)
                .and_then(|id| cx.places.get(id))
                .and_then(|p| p.certainty.clone());
            events.push(NormEvent {
                id: ev.id.clone().unwrap_or_default(),
                kind: ev.kind.clone().unwrap_or_default(),
                start: w.start,
                end: w.end,
                coord,
                certainty: ev.certainty.clone().or(place_certainty),
                importance: ev.importance.unwrap_or(3.0),
                raw: ev.clone(),
            });
        }
    }

    /* chapters */
    let mut chapters: Vec<NormChapter> = Vec::new();
    let mut last_start: Option<Ticks> = None;
    for (i, ch) in file.chapters.iter().enumerate() {
        let base = format!("/chapters/{i}");
        let w = cx.when(ch.when.as_deref(), &format!("{base}/when"));
        if let Some(p) = ch.part.as_deref().filter(|p| !p.is_empty()) {
            cx.ref_id(Some(p), &["part"], &format!("{base}/part"));
        }
        cx.ref_list(
            ch.focus.as_ref(),
            &["place", "entity", "event"],
            &format!("{base}/focus"),
        );
        cx.ref_list(ch.media.as_ref(), &["media"], &format!("{base}/media"));
        cx.ref_list(ch.sources.as_ref(), &["source"], &format!("{base}/sources"));
        if let Some(cam) = &ch.camera {
            cx.check_coord(cam.center.as_ref(), &format!("{base}/camera/center"));
        }
        if ch.camera.is_none() && ch.focus.as_ref().is_none_or(|f| f.is_empty()) {
            let id = ch.id.clone().unwrap_or_else(|| "undefined".into());
            cx.warn(
                "W103",
                &base,
                format!("Chapter \"{id}\" has neither camera nor focus; the camera will not move"),
            );
        }
        let body_text = body_to_string(ch.body.as_ref());
        for target in markdown_link_targets(&body_text) {
            cx.check_url(Some(&target), &format!("{base}/body"));
        }
        if has_raw_html(&body_text) {
            cx.err(
                "E017",
                &format!("{base}/body"),
                "Raw HTML is not allowed in chapter bodies".to_string(),
            );
        }
        let Some(w) = w else { continue };
        if last_start.is_some_and(|l| w.start < l) {
            let id = ch.id.clone().unwrap_or_else(|| "undefined".into());
            cx.warn(
                "W104",
                &format!("{base}/when"),
                format!("Chapter \"{id}\" starts before the previous chapter (flashback?)"),
            );
        }
        last_start = Some(w.start);
        chapters.push(NormChapter {
            id: ch.id.clone().unwrap_or_default(),
            index: i,
            start: w.start,
            end: w.end,
            camera: ch.camera.clone(),
            focus: ch.focus.clone().unwrap_or_default(),
            raw: ch.clone(),
        });
    }
    // The schema says minItems 1, but runtime validation is the core's job (contract §8): playback starts at chapter 0.
    if file.chapters.is_empty() {
        cx.err(
            "E018",
            "/chapters",
            "A campaign needs at least one chapter".to_string(),
        );
    }

    for k in 1..chapters.len() {
        let (prev_start, prev_end, prev_id) = {
            let p = &chapters[k - 1];
            (p.start, p.end, p.id.clone())
        };
        let cur = &chapters[k];
        if cur.start >= prev_start && prev_end > cur.start {
            let days = js_round((prev_end - cur.start) as f64 / 86_400.0);
            let (id, index) = (cur.id.clone(), cur.index);
            cx.warn(
                "W115",
                &format!("/chapters/{index}/when"),
                format!(
                    "Chapter \"{id}\" starts {days} day(s) before \"{prev_id}\" ends; time jumps backwards when scrolling between them"
                ),
            );
        }
    }

    let ev_by_id: BTreeMap<&str, &NormEvent> = events.iter().map(|e| (e.id.as_str(), e)).collect();
    let en_by_id: BTreeMap<&str, &NormEntity> =
        entities.iter().map(|e| (e.id.as_str(), e)).collect();
    let mut focus_warnings: Vec<(String, String)> = Vec::new();
    for ch in &chapters {
        for (k, id) in ch.focus.iter().enumerate() {
            let path = format!("/chapters/{}/focus/{}", ch.index, k);
            if let Some(ev) = ev_by_id.get(id.as_str()) {
                if ev.start >= ch.end {
                    focus_warnings.push((
                        path.clone(),
                        format!("Focused event \"{id}\" has not happened yet during this chapter"),
                    ));
                }
            }
            if let Some(en) = en_by_id.get(id.as_str()) {
                if en.start >= ch.end || en.end <= ch.start {
                    focus_warnings.push((
                        path.clone(),
                        format!("Focused entity \"{id}\" does not exist during this chapter"),
                    ));
                }
            }
        }
    }
    for (path, message) in focus_warnings {
        cx.warn("W112", &path, message);
    }

    for coll in ["sources", "media", "places", "parts"] {
        for (i, id) in collection_ids(&file, coll).iter().enumerate() {
            let Some(id) = id else { continue };
            if !cx.used.contains(id) {
                let ty = type_of_collection(coll);
                cx.warn(
                    "W105",
                    &format!("/{coll}/{i}"),
                    format!("{ty} \"{id}\" is never referenced"),
                );
            }
        }
    }

    let has_errors = cx.diags.iter().any(|d| d.level == DiagnosticLevel::Error);
    let campaign = if has_errors {
        None
    } else {
        Some(NormalizedCampaign {
            raw: raw.clone(),
            meta,
            extent: ext,
            focus,
            languages: cx.languages.clone(),
            default_language: cx.default_language.clone(),
            factions,
            places: cx.places.clone(),
            entities,
            events,
            chapters,
        })
    };
    LoadResult {
        campaign,
        diagnostics: cx.diags,
    }
}

/// `obj.id` for every member of a collection, `None` where the reference loader's
/// `if (!obj?.id) return` would skip it.
fn collection_ids(file: &CampaignFile, coll: &str) -> Vec<Option<String>> {
    fn keep(id: &Option<String>) -> Option<String> {
        id.clone().filter(|s| !s.is_empty())
    }
    match coll {
        "factions" => file.factions.iter().map(|o| keep(&o.id)).collect(),
        "parts" => file.parts.iter().map(|o| keep(&o.id)).collect(),
        "places" => file.places.iter().map(|o| keep(&o.id)).collect(),
        "entities" => file.entities.iter().map(|o| keep(&o.id)).collect(),
        "events" => file.events.iter().map(|o| keep(&o.id)).collect(),
        "chapters" => file.chapters.iter().map(|o| keep(&o.id)).collect(),
        "sources" => file.sources.iter().map(|o| keep(&o.id)).collect(),
        "media" => file.media.iter().map(|o| keep(&o.id)).collect(),
        _ => Vec::new(),
    }
}

/// `typeof body === 'string' ? body : Object.values(body ?? {}).join('\n')`
fn body_to_string(body: Option<&Value>) -> String {
    match body {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Object(m)) => m.values().map(js_string).collect::<Vec<_>>().join("\n"),
        Some(Value::Array(a)) => a.iter().map(js_string).collect::<Vec<_>>().join("\n"),
        // Object.values of a primitive is [], so the body reads as the empty string.
        _ => String::new(),
    }
}

/// JS `a[i] === b[i]` for a ring's endpoints.
fn same_ordinate(a: &Coord, b: &Coord, i: usize) -> bool {
    let (av, bv) = (
        a.0.as_array().and_then(|x| x.get(i)),
        b.0.as_array().and_then(|x| x.get(i)),
    );
    match (av, bv) {
        (Some(x), Some(y)) if x.is_number() && y.is_number() => x.as_f64() == y.as_f64(),
        (Some(x), Some(y)) => x == y,
        // `undefined === undefined` is true in JS.
        (None, None) => true,
        _ => false,
    }
}

/// JS `Number(string)`: empty is 0, non-numeric is NaN (represented as `None`).
fn js_number(s: &str) -> Option<f64> {
    let t = s.trim();
    if t.is_empty() {
        return Some(0.0);
    }
    t.parse::<f64>().ok()
}
