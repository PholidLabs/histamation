//! Golden-vector conformance: replay `test-vectors/*.json` against this crate.
//!
//! The vectors were generated from the TypeScript reference implementation, so they
//! are the acceptance gate for the port. Diagnostics must match position by position
//! (level, code, JSON Pointer path); every frame field must match, floats within an
//! absolute tolerance of 1e-6 and strings exactly.

use std::path::{Path, PathBuf};

use histamation_core::{
    chapter_time, load_campaign, parse_when, resolve_frame, ticks_to_iso, DiagnosticLevel,
    ResolveOptions,
};
use serde_json::Value;

const TOLERANCE: f64 = 1e-6;

/// `test-vectors/` and `data/` live two levels above the crate.
fn repo_path(rel: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .join(rel)
}

fn read_json(rel: &str) -> Value {
    let path = repo_path(rel);
    let text = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("cannot read {}: {e}", path.display()));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("cannot parse {}: {e}", path.display()))
}

/* -------------------------------------------------------------------------- */
/* time.json                                                                   */
/* -------------------------------------------------------------------------- */

#[test]
fn time_vectors() {
    let doc = read_json("test-vectors/time.json");
    let cases = doc["cases"]
        .as_array()
        .expect("time.json has a cases array");
    let mut failures: Vec<String> = Vec::new();

    for (i, case) in cases.iter().enumerate() {
        let input = case["input"].as_str().unwrap_or_default();
        let expect_ok = case["ok"].as_bool().unwrap_or(false);
        let at = format!("time.json case {i} ({input:?})");

        match (parse_when(input), expect_ok) {
            (Err(e), true) => failures.push(format!("{at}: expected success, got {}", e.message())),
            (Ok(_), false) => failures.push(format!(
                "{at}: expected error {:?}, but parsing succeeded",
                case["error"].as_str().unwrap_or("")
            )),
            (Err(e), false) => {
                let want = case["error"].as_str().unwrap_or_default();
                if e.message() != want {
                    failures.push(format!(
                        "{at}: error text\n    got  {:?}\n    want {:?}",
                        e.message(),
                        want
                    ));
                }
            }
            (Ok(w), true) => {
                let mut cmp = |field: &str, got: Value| {
                    let want = case.get(field).cloned().unwrap_or(Value::Null);
                    if got != want {
                        failures.push(format!("{at}: {field}\n    got  {got}\n    want {want}"));
                    }
                };
                cmp("isInterval", Value::Bool(w.is_interval));
                cmp("start", w.start.map_or(Value::Null, Value::from));
                cmp("end", w.end.map_or(Value::Null, Value::from));
                cmp(
                    "startIso",
                    w.start
                        .map_or(Value::Null, |t| Value::String(ticks_to_iso(t))),
                );
                cmp(
                    "endIso",
                    w.end
                        .map_or(Value::Null, |t| Value::String(ticks_to_iso(t))),
                );
                cmp(
                    "fromPrecision",
                    w.from.as_ref().map_or(Value::Null, |d| {
                        Value::String(d.precision.as_str().to_string())
                    }),
                );
                cmp(
                    "toPrecision",
                    w.to.as_ref().map_or(Value::Null, |d| {
                        Value::String(d.precision.as_str().to_string())
                    }),
                );
                cmp(
                    "fromQualifier",
                    w.from
                        .as_ref()
                        .and_then(|d| d.qualifier)
                        .map_or(Value::Null, |q| Value::String(q.as_str().to_string())),
                );
                cmp(
                    "toQualifier",
                    w.to.as_ref()
                        .and_then(|d| d.qualifier)
                        .map_or(Value::Null, |q| Value::String(q.as_str().to_string())),
                );
            }
        }
    }

    assert!(
        failures.is_empty(),
        "{} of {} time vectors diverged:\n{}",
        failures.len(),
        cases.len(),
        failures.join("\n")
    );
}

/* -------------------------------------------------------------------------- */
/* *.frames.json                                                               */
/* -------------------------------------------------------------------------- */

const FRAME_VECTORS: [(&str, &str); 6] = [
    (
        "test-vectors/austro-prussian-1866.frames.json",
        "data/campaigns/austro-prussian-1866.json",
    ),
    (
        "test-vectors/giyanti-1755.frames.json",
        "data/campaigns/giyanti-1755.json",
    ),
    (
        "test-vectors/java-war-1825.frames.json",
        "data/campaigns/java-war-1825.json",
    ),
    (
        "test-vectors/napoleon-russia-1812.frames.json",
        "data/campaigns/napoleon-russia-1812.json",
    ),
    (
        "test-vectors/waterloo-1815.frames.json",
        "data/campaigns/waterloo-1815.json",
    ),
    (
        "test-vectors/null-island.frames.json",
        "data/campaigns/fixtures/null-island.json",
    ),
];

#[test]
fn frame_vectors() {
    let mut failures: Vec<String> = Vec::new();
    let mut frames_checked = 0usize;

    for (vector_path, campaign_path) in FRAME_VECTORS {
        let vector = read_json(vector_path);
        let raw = read_json(campaign_path);
        let result = load_campaign(&raw);

        // 1. diagnostics: level, code, path, in order.
        let want_diags = vector["diagnostics"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        for (i, want) in want_diags.iter().enumerate() {
            match result.diagnostics.get(i) {
                None => failures.push(format!(
                    "{vector_path}: diagnostic {i} missing, want {} {} {}",
                    want["level"], want["code"], want["path"]
                )),
                Some(got) => {
                    let got_v = serde_json::json!({
                        "level": got.level.as_str(),
                        "code": got.code,
                        "path": got.path,
                    });
                    let want_v = serde_json::json!({
                        "level": want["level"],
                        "code": want["code"],
                        "path": want["path"],
                    });
                    if got_v != want_v {
                        failures.push(format!(
                            "{vector_path}: diagnostic {i}\n    got  {got_v}\n    want {want_v}"
                        ));
                    }
                }
            }
        }
        for (i, extra) in result.diagnostics.iter().enumerate().skip(want_diags.len()) {
            failures.push(format!(
                "{vector_path}: unexpected diagnostic {i}: {} {} {}  {}",
                extra.level.as_str(),
                extra.code,
                extra.path,
                extra.message
            ));
        }

        let Some(campaign) = result.campaign else {
            failures.push(format!(
                "{vector_path}: campaign was rejected; errors: {:?}",
                result
                    .diagnostics
                    .iter()
                    .filter(|d| d.level == DiagnosticLevel::Error)
                    .map(|d| format!("{} {} {}", d.code, d.path, d.message))
                    .collect::<Vec<_>>()
            ));
            continue;
        };

        let vector_frames = vector["frames"].as_array().cloned().unwrap_or_default();
        // The reference CLI generates some vectors with the full trail polyline and
        // some with only its length; the vector itself says which.
        let include_trail = vector_frames.iter().any(|f| {
            f["frame"]["entities"]
                .as_array()
                .is_some_and(|es| es.iter().any(|e| e.get("trail").is_some()))
        });
        let opts = ResolveOptions {
            bbox: None,
            include_trail,
        };

        for (i, entry) in vector_frames.iter().enumerate() {
            let at = format!("{vector_path} frame {i}");
            let chapter_id = entry["chapter"].as_str().unwrap_or_default();
            let p = entry["p"].as_f64().unwrap_or(0.0);
            let want_t = entry["t"].as_i64().unwrap_or_default();

            // chapterTime() is part of the port too: check the clock, then the frame.
            match campaign.chapters.iter().find(|c| c.id == chapter_id) {
                None => {
                    failures.push(format!("{at}: no chapter {chapter_id:?} in the campaign"));
                    continue;
                }
                Some(ch) => {
                    let got_t = chapter_time(ch, p);
                    if got_t != want_t {
                        failures.push(format!(
                            "{at}: chapter_time({chapter_id}, {p}) = {got_t}, want {want_t}"
                        ));
                    }
                }
            }

            let frame = resolve_frame(&campaign, want_t, &opts);
            let got = match serde_json::to_value(&frame) {
                Ok(v) => v,
                Err(e) => {
                    failures.push(format!("{at}: frame is not serialisable ({e})"));
                    continue;
                }
            };
            let before = failures.len();
            diff(&got, &entry["frame"], &at, &mut failures);
            frames_checked += 1;
            // Keep the report readable when a whole vector goes wrong.
            if failures.len() > before + 20 {
                failures.truncate(before + 20);
                failures.push(format!("{at}: … further differences suppressed"));
            }
            if failures.len() > 200 {
                failures.push("… too many failures, stopping".to_string());
                break;
            }
        }
    }

    assert!(
        failures.is_empty(),
        "{} divergence(s) across {frames_checked} frames:\n{}",
        failures.len(),
        failures.join("\n")
    );
}

/// Structural comparison of a produced frame (`got`) against a golden one (`want`),
/// reporting the field path of every divergence.
fn diff(got: &Value, want: &Value, path: &str, out: &mut Vec<String>) {
    match (got, want) {
        (Value::Number(a), Value::Number(b)) => match (a.as_f64(), b.as_f64()) {
            (Some(x), Some(y)) if (x - y).abs() <= TOLERANCE => {}
            _ => out.push(format!("{path}: got {got}, want {want}")),
        },
        (Value::Array(a), Value::Array(b)) => {
            if a.len() != b.len() {
                out.push(format!(
                    "{path}: {} element(s), want {} — got {got}",
                    a.len(),
                    b.len()
                ));
                return;
            }
            for i in 0..a.len() {
                diff(&a[i], &b[i], &format!("{path}[{i}]"), out);
            }
        }
        (Value::Object(a), Value::Object(b)) => {
            let mut keys: Vec<&String> = a.keys().chain(b.keys()).collect();
            keys.sort();
            keys.dedup();
            for k in keys {
                match (a.get(k), b.get(k)) {
                    (Some(x), Some(y)) => diff(x, y, &format!("{path}.{k}"), out),
                    (Some(x), None) => out.push(format!("{path}.{k}: unexpected field ({x})")),
                    (None, Some(y)) => out.push(format!("{path}.{k}: missing field (want {y})")),
                    (None, None) => {}
                }
            }
        }
        _ if got == want => {}
        _ => out.push(format!("{path}: got {got}, want {want}")),
    }
}

/* -------------------------------------------------------------------------- */
/* a couple of contract invariants the vectors do not cover directly           */
/* -------------------------------------------------------------------------- */

#[test]
fn load_never_panics_on_junk() {
    for junk in [
        "null",
        "[]",
        "\"a string\"",
        "42",
        "{}",
        r#"{"histamation":"1.0"}"#,
        r#"{"histamation":"2.0","meta":{"timeline":{"extent":"1825"}},"chapters":[]}"#,
        r#"{"histamation":"1.0","meta":{"timeline":{"extent":"../.."}}}"#,
        r#"{"histamation":"1.0","meta":{"timeline":{"extent":"1825/.."}}}"#,
        r#"{"histamation":"1.0","meta":{"timeline":{"extent":"1825"}},"places":[{"id":"p","coordinates":"nope"}]}"#,
        r#"{"histamation":"1.0","meta":{"timeline":{"extent":"1825"}},"entities":[{"id":"u","kind":"unit"}]}"#,
        r#"{"histamation":"1.0","meta":{"timeline":{"extent":"1825"}},"entities":[{"id":"x","kind":"x-thing"}]}"#,
    ] {
        let result = histamation_core::load_campaign_str(junk);
        // Every rejection is reported, never thrown.
        assert!(
            result.campaign.is_none() || result.errors().count() == 0,
            "a campaign was returned alongside errors for {junk}"
        );
    }
}

#[test]
fn non_numeric_coordinates_are_rejected() {
    let base = read_json("data/campaigns/fixtures/null-island.json");
    for bad in [
        serde_json::json!(["0.5", "0.5"]),
        serde_json::json!([null, null]),
    ] {
        let mut raw = base.clone();
        raw["places"][0]["coordinates"] = bad.clone();
        let result = load_campaign(&raw);
        assert!(
            result.campaign.is_none() && result.errors().any(|d| d.code == "E011"),
            "{bad} was accepted as a coordinate"
        );
    }
}

#[test]
fn a_campaign_without_chapters_is_rejected() {
    let base = read_json("data/campaigns/fixtures/null-island.json");
    let mut empty = base.clone();
    empty["chapters"] = serde_json::json!([]);
    let mut missing = base;
    missing.as_object_mut().unwrap().remove("chapters");
    for raw in [empty, missing] {
        let result = load_campaign(&raw);
        assert!(
            result.campaign.is_none()
                && result
                    .errors()
                    .any(|d| d.code == "E018" && d.path == "/chapters"),
            "a campaign with no chapters was accepted"
        );
    }
}

#[test]
fn chapter_progress_stays_inside_the_window() {
    let raw = read_json("data/campaigns/fixtures/null-island.json");
    let campaign = load_campaign(&raw).campaign.expect("fixture loads");
    for ch in &campaign.chapters {
        for p in [0.0, 0.25, 0.5, 0.75, 1.0, -3.0, 7.0, f64::NAN] {
            let t = chapter_time(ch, p);
            assert!(
                t >= ch.start && t < ch.end,
                "chapter {} at p={p} produced {t}, outside [{}, {})",
                ch.id,
                ch.start,
                ch.end
            );
        }
        assert_eq!(
            chapter_time(ch, f64::NAN),
            ch.start,
            "NaN progress reads as the start"
        );
    }
}
