//! `wasm-bindgen` surface mirroring the worker protocol in
//! `packages/engine/src/worker.ts` (contract §7.1): the campaign is parsed and
//! normalised **once** on `load`, and each `query` returns one small frame.
//!
//! The message shapes are the reference ones, so a JS worker can swap
//! `handleRequest` for this core without the main thread noticing:
//!
//! ```js
//! const core = new ChronoMapCore();
//! const loaded = core.load(1, campaignJsonText);   // { type:"loaded", id, ok, diagnostics, summary? }
//! const frame  = core.query(2, tick, null, false); // { type:"frame",  id, frame }
//! ```
//!
//! Enable with the `wasm` feature. It also compiles for the host target, which is
//! what CI checks; the wasm32 build needs no extra code.

use serde::Serialize;
use wasm_bindgen::prelude::*;

use crate::campaign::{js_round, load_campaign_str};
use crate::model::{Diagnostic, FrameState, NormalizedCampaign};
use crate::resolve::{resolve_frame, ResolveOptions};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Summary {
    chapters: usize,
    entities: usize,
    events: usize,
    places: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Loaded<'a> {
    #[serde(rename = "type")]
    kind: &'static str,
    id: u32,
    ok: bool,
    diagnostics: &'a [Diagnostic],
    #[serde(skip_serializing_if = "Option::is_none")]
    summary: Option<Summary>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Frame<'a> {
    #[serde(rename = "type")]
    kind: &'static str,
    id: u32,
    frame: &'a FrameState,
}

fn to_js<T: Serialize>(value: &T) -> Result<JsValue, JsValue> {
    serde_wasm_bindgen::to_value(value).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// One loaded campaign, queried frame by frame.
#[wasm_bindgen]
pub struct ChronoMapCore {
    campaign: Option<NormalizedCampaign>,
}

impl Default for ChronoMapCore {
    fn default() -> Self {
        Self::new()
    }
}

#[wasm_bindgen]
impl ChronoMapCore {
    #[wasm_bindgen(constructor)]
    pub fn new() -> ChronoMapCore {
        ChronoMapCore { campaign: None }
    }

    /// `{ type: "load", id, campaign }` → `{ type: "loaded", id, ok, diagnostics, summary? }`.
    ///
    /// A file with any `error` diagnostic is rejected (contract §7.1) and the
    /// previously loaded campaign, if any, is dropped — same as the JS worker, which
    /// assigns the `null` result straight to its module-level slot.
    pub fn load(&mut self, id: u32, campaign_json: &str) -> Result<JsValue, JsValue> {
        let result = load_campaign_str(campaign_json);
        self.campaign = result.campaign;
        let summary = self.campaign.as_ref().map(|c| Summary {
            chapters: c.chapters.len(),
            entities: c.entities.len(),
            events: c.events.len(),
            places: c.places.len(),
        });
        to_js(&Loaded {
            kind: "loaded",
            id,
            ok: self.campaign.is_some(),
            diagnostics: &result.diagnostics,
            summary,
        })
    }

    /// `{ type: "query", id, t, bbox?, includeTrail? }` → `{ type: "frame", id, frame }`.
    ///
    /// `t` crosses the boundary as a JS number; ticks are integral by contract, so
    /// round rather than truncate and keep the sign behaviour of `Math.round`.
    /// NaN and ±Infinity are rejected, as the reference `resolveFrame` does.
    /// `bbox` is `[west, south, east, north]` or `null`.
    pub fn query(
        &self,
        id: u32,
        t: f64,
        bbox: Option<Box<[f64]>>,
        include_trail: Option<bool>,
    ) -> Result<JsValue, JsValue> {
        let Some(campaign) = self.campaign.as_ref() else {
            return Err(JsValue::from_str("query before load"));
        };
        if !t.is_finite() {
            return Err(JsValue::from_str("tick must be a finite number"));
        }
        let bbox = match bbox.as_deref() {
            Some([w, s, e, n]) => Some([*w, *s, *e, *n]),
            Some(other) => {
                return Err(JsValue::from_str(&format!(
                    "bbox must be [west, south, east, north], got {} value(s)",
                    other.len()
                )))
            }
            None => None,
        };
        let frame = resolve_frame(
            campaign,
            js_round(t) as i64,
            &ResolveOptions {
                bbox,
                // The worker's default is the cheap payload: trail length only.
                include_trail: include_trail.unwrap_or(false),
            },
        );
        to_js(&Frame {
            kind: "frame",
            id,
            frame: &frame,
        })
    }

    /// Whether a campaign is currently loaded.
    #[wasm_bindgen(getter)]
    pub fn loaded(&self) -> bool {
        self.campaign.is_some()
    }

    /// The campaign's tick extent as `[start, end)`, or `null` before a successful load.
    #[wasm_bindgen(js_name = "extent")]
    pub fn extent(&self) -> Option<Box<[f64]>> {
        self.campaign
            .as_ref()
            .map(|c| vec![c.extent.start as f64, c.extent.end as f64].into_boxed_slice())
    }

    /// Tick for scroll progress `p` (0..1) through a chapter, or `null` if unknown.
    #[wasm_bindgen(js_name = "chapterTime")]
    pub fn chapter_time(&self, chapter_id: &str, p: f64) -> Option<f64> {
        let campaign = self.campaign.as_ref()?;
        let chapter = campaign.chapters.iter().find(|c| c.id == chapter_id)?;
        Some(crate::resolve::chapter_time(chapter, p) as f64)
    }
}
