//! Optional R-tree index over a loaded campaign (contract §7.1, step 4).
//!
//! Deliberately small: the contract asks for "an R-tree over (lng, lat[, t])
//! envelopes" so the worker can answer viewport queries without touching every
//! feature. That is all this is. It does not change frame semantics — a viewport
//! filter applied here must agree with [`crate::resolve::ResolveOptions::bbox`].
//!
//! Enable with the `spatial` feature.

use rstar::{PointDistance, RTree, RTreeObject, AABB};

use crate::model::{NormalizedCampaign, Ticks};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SpatialKind {
    Place,
    Entity,
    Event,
}

/// One indexed feature: its geographic envelope and its existence window.
///
/// A moving unit is indexed by the envelope of its **whole** track, so a viewport
/// query returns every unit that could be visible at some tick; the caller still
/// resolves the frame to find out where it actually is.
#[derive(Clone, Debug)]
pub struct SpatialItem {
    pub id: String,
    pub kind: SpatialKind,
    /// `[west, south, east, north]`; a point layer has `west == east`.
    pub bbox: [f64; 4],
    pub start: Ticks,
    /// Exclusive, like every other range in the contract.
    pub end: Ticks,
}

impl SpatialItem {
    fn intersects(&self, [w, s, e, n]: [f64; 4]) -> bool {
        self.bbox[0] <= e && self.bbox[2] >= w && self.bbox[1] <= n && self.bbox[3] >= s
    }
    fn alive_at(&self, t: Ticks) -> bool {
        self.start <= t && t < self.end
    }
}

impl RTreeObject for SpatialItem {
    type Envelope = AABB<[f64; 2]>;
    fn envelope(&self) -> Self::Envelope {
        AABB::from_corners([self.bbox[0], self.bbox[1]], [self.bbox[2], self.bbox[3]])
    }
}

impl PointDistance for SpatialItem {
    fn distance_2(&self, point: &[f64; 2]) -> f64 {
        // Squared degrees, not metres: good enough to order candidates, and the
        // caller re-ranks with `haversine` if it needs a real distance.
        let dx = (self.bbox[0] - point[0])
            .max(point[0] - self.bbox[2])
            .max(0.0);
        let dy = (self.bbox[1] - point[1])
            .max(point[1] - self.bbox[3])
            .max(0.0);
        dx * dx + dy * dy
    }
}

pub struct SpatialIndex {
    tree: RTree<SpatialItem>,
}

/// Grows a `[w, s, e, n]` accumulator, ignoring non-finite coordinates — rstar has
/// no sensible answer for a NaN envelope, and a malformed coordinate already
/// produced `E011` at load time.
fn extend(acc: &mut Option<[f64; 4]>, c: [f64; 2]) {
    if !c[0].is_finite() || !c[1].is_finite() {
        return;
    }
    match acc {
        None => *acc = Some([c[0], c[1], c[0], c[1]]),
        Some(b) => {
            b[0] = b[0].min(c[0]);
            b[1] = b[1].min(c[1]);
            b[2] = b[2].max(c[0]);
            b[3] = b[3].max(c[1]);
        }
    }
}

impl SpatialIndex {
    pub fn build(campaign: &NormalizedCampaign) -> Self {
        let mut items: Vec<SpatialItem> = Vec::new();
        let ext = campaign.extent;

        for place in campaign.places.values() {
            let mut b = None;
            extend(&mut b, place.coord);
            if let Some(bbox) = b {
                items.push(SpatialItem {
                    id: place.id.clone(),
                    kind: SpatialKind::Place,
                    bbox,
                    // Places are timeless in v1 (`places[].when` is a 1.1 candidate).
                    start: ext.start,
                    end: ext.end,
                });
            }
        }

        for e in &campaign.entities {
            let mut b = None;
            if let Some(track) = &e.track {
                for w in track {
                    extend(&mut b, w.coord);
                    for c in w.leg.iter().flatten() {
                        extend(&mut b, *c);
                    }
                }
            }
            if let Some(c) = e.coord {
                extend(&mut b, c);
            }
            for c in e.path.iter().flatten() {
                extend(&mut b, *c);
            }
            for ring in e.polygons.iter().flatten().flatten() {
                for c in ring {
                    if let Some(c) = c.lng_lat() {
                        extend(&mut b, c);
                    }
                }
            }
            if let Some(bbox) = b {
                items.push(SpatialItem {
                    id: e.id.clone(),
                    kind: SpatialKind::Entity,
                    bbox,
                    start: e.start,
                    end: e.end,
                });
            }
        }

        for ev in &campaign.events {
            let mut b = None;
            if let Some(c) = ev.coord {
                extend(&mut b, c);
            }
            if let Some(bbox) = b {
                items.push(SpatialItem {
                    id: ev.id.clone(),
                    kind: SpatialKind::Event,
                    bbox,
                    start: ev.start,
                    // A past event stays on the map (faded), so index it to the end.
                    end: ext.end.max(ev.end),
                });
            }
        }

        SpatialIndex {
            tree: RTree::bulk_load(items),
        }
    }

    pub fn len(&self) -> usize {
        self.tree.size()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Everything whose envelope meets `[west, south, east, north]`.
    pub fn in_bbox(&self, bbox: [f64; 4]) -> Vec<&SpatialItem> {
        let envelope = AABB::from_corners([bbox[0], bbox[1]], [bbox[2], bbox[3]]);
        self.tree
            .locate_in_envelope_intersecting(envelope)
            // rstar's envelope test and `intersects` agree; the filter guards against
            // a degenerate query rectangle given corners in the wrong order.
            .filter(|item| item.intersects(bbox))
            .collect()
    }

    /// [`Self::in_bbox`], restricted to features that exist at tick `t`.
    pub fn in_bbox_at(&self, bbox: [f64; 4], t: Ticks) -> Vec<&SpatialItem> {
        self.in_bbox(bbox)
            .into_iter()
            .filter(|i| i.alive_at(t))
            .collect()
    }

    /// Nearest indexed feature to `[lng, lat]`, by squared degrees.
    pub fn nearest(&self, point: [f64; 2]) -> Option<&SpatialItem> {
        self.tree.nearest_neighbor(point)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::campaign::load_campaign;

    fn fixture() -> NormalizedCampaign {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../data/campaigns/fixtures/null-island.json");
        let raw: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
        load_campaign(&raw).campaign.expect("fixture loads")
    }

    #[test]
    fn indexes_every_located_feature() {
        let campaign = fixture();
        let index = SpatialIndex::build(&campaign);
        // 3 places + 5 entities + 3 located events (peace-decree has no `at`).
        assert_eq!(index.len(), 11);

        let all = index.in_bbox([-1.0, -1.0, 1.0, 1.0]);
        assert_eq!(all.len(), 11);

        let east = index.in_bbox([0.35, -0.35, 0.65, 0.15]);
        let ids: Vec<&str> = east.iter().map(|i| i.id.as_str()).collect();
        assert!(ids.contains(&"ruins"), "got {ids:?}");
        assert!(!ids.contains(&"harbor"), "got {ids:?}");

        // Several envelopes contain Null Island itself (the harbor, the lighthouse
        // there, and the legion's track), so only assert the distance, not which won.
        let nearest = index.nearest([0.0, 0.0]).expect("index is not empty");
        assert_eq!(nearest.distance_2(&[0.0, 0.0]), 0.0);
        // The legion exists only from -0010-03; places and undated entities span the
        // whole extent, so the time filter has to discriminate between them.
        let world = [-1.0, -1.0, 1.0, 1.0];
        let at_dawn: Vec<&str> = index
            .in_bbox_at(world, campaign.extent.start)
            .iter()
            .map(|i| i.id.as_str())
            .collect();
        assert!(!at_dawn.contains(&"blue-legion"), "got {at_dawn:?}");
        assert!(at_dawn.contains(&"harbor"), "got {at_dawn:?}");
        let muster = campaign.chapters[0].start;
        let at_muster: Vec<&str> = index
            .in_bbox_at(world, muster)
            .iter()
            .map(|i| i.id.as_str())
            .collect();
        assert!(at_muster.contains(&"blue-legion"), "got {at_muster:?}");
    }
}
