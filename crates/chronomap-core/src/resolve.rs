//! Frame resolution (contract §4–§6): what is on the map at tick `t`.
//!
//! A port of `packages/engine/src/resolve.ts`, which is the oracle the golden
//! vectors were generated from (`test-vectors/*.frames.json`).

use crate::campaign::{haversine, js_max, js_min, js_round};
use crate::model::*;
use crate::time::{ticks_to_iso, Ticks};

const TO_RAD: f64 = std::f64::consts::PI / 180.0;

/// Forward azimuth from `a` to `b`, in degrees clockwise from north, `[0, 360)`.
pub fn initial_bearing(a: [f64; 2], b: [f64; 2]) -> f64 {
    let y = ((b[0] - a[0]) * TO_RAD).sin() * (b[1] * TO_RAD).cos();
    let x = (a[1] * TO_RAD).cos() * (b[1] * TO_RAD).sin()
        - (a[1] * TO_RAD).sin() * (b[1] * TO_RAD).cos() * ((b[0] - a[0]) * TO_RAD).cos();
    (y.atan2(x) / TO_RAD + 360.0) % 360.0
}

/// Where [`along_path`] landed.
#[derive(Clone, Debug, PartialEq)]
pub struct PathPoint {
    pub position: [f64; 2],
    /// Index of the segment the position sits on.
    pub segment: usize,
    /// The polyline up to and including `position`.
    pub travelled: Vec<[f64; 2]>,
}

/// Point at fraction `f` of a polyline's haversine length; linear in lng/lat within
/// a segment.
pub fn along_path(path: &[[f64; 2]], f: f64) -> PathPoint {
    if path.is_empty() {
        // Unreachable for campaign data: a leg always has at least two points.
        return PathPoint {
            position: [f64::NAN, f64::NAN],
            segment: 0,
            travelled: Vec::new(),
        };
    }
    if path.len() == 1 || f <= 0.0 {
        return PathPoint {
            position: path[0],
            segment: 0,
            travelled: vec![path[0]],
        };
    }
    let lengths: Vec<f64> = path.windows(2).map(|p| haversine(p[0], p[1])).collect();
    let total: f64 = lengths.iter().fold(0.0, |a, b| a + b);
    let last = path[path.len() - 1];
    if total == 0.0 || f >= 1.0 {
        return PathPoint {
            position: last,
            segment: path.len() - 2,
            travelled: path.to_vec(),
        };
    }

    let mut target = f * total;
    for i in 0..lengths.len() {
        if target <= lengths[i] || i == lengths.len() - 1 {
            let local = if lengths[i] == 0.0 {
                0.0
            } else {
                js_min(1.0, target / lengths[i])
            };
            let (a, b) = (path[i], path[i + 1]);
            let position = [a[0] + (b[0] - a[0]) * local, a[1] + (b[1] - a[1]) * local];
            let mut travelled = path[..=i].to_vec();
            travelled.push(position);
            return PathPoint {
                position,
                segment: i,
                travelled,
            };
        }
        target -= lengths[i];
    }
    PathPoint {
        position: last,
        segment: path.len() - 2,
        travelled: path.to_vec(),
    }
}

/// Status/owner/strength at `t`: of the states that apply, the one with the latest
/// start wins. An interval state stops applying at its end, at which point the
/// earlier state takes over again.
pub fn state_at(states: &[NormState], t: Ticks) -> Option<&NormState> {
    let mut best: Option<&NormState> = None;
    for s in states {
        if s.start > t {
            continue;
        }
        if s.end.is_some_and(|e| t >= e) {
            continue;
        }
        // `>=` and not `>`: with equal starts the later entry in the file wins.
        match best {
            None => best = Some(s),
            Some(b) if s.start >= b.start => best = Some(s),
            _ => {}
        }
    }
    best
}

/// Constant during a stay, linear between knots, clamped outside them (§4.1).
fn strength_at(track: &[NormWaypoint], t: Ticks) -> Option<f64> {
    let mut knots: Vec<(Ticks, f64)> = Vec::new();
    for w in track {
        if let Some(s) = w.strength {
            knots.push((w.arrive, s));
            knots.push((w.depart, s));
        }
    }
    let first = *knots.first()?;
    if t <= first.0 {
        return Some(first.1);
    }
    for i in 1..knots.len() {
        let (t1, v1) = knots[i];
        if t <= t1 {
            let (t0, v0) = knots[i - 1];
            return Some(if t1 == t0 {
                v1
            } else {
                js_round(v0 + ((v1 - v0) * (t - t0) as f64) / (t1 - t0) as f64)
            });
        }
    }
    knots.last().map(|k| k.1)
}

struct UnitPose {
    position: [f64; 2],
    bearing: Option<f64>,
    moving: bool,
    waypoint: Option<usize>,
    leg: Option<usize>,
    leg_progress: Option<f64>,
    certainty: Option<Certainty>,
    trail: Vec<[f64; 2]>,
}

/// Bearing of the final segment of a leg. Legs always have ≥ 2 points (they are built
/// as `[previous coord, ...via, coord]`), so the indices below cannot underflow.
fn leg_end_bearing(leg: &[[f64; 2]]) -> Option<f64> {
    if leg.len() < 2 {
        return None;
    }
    Some(initial_bearing(leg[leg.len() - 2], leg[leg.len() - 1]))
}

fn unit_at(ne: &NormEntity, t: Ticks) -> UnitPose {
    // Only called for entities that normalisation gave a non-empty track.
    let tr = ne.track.as_deref().unwrap_or_default();
    if tr.is_empty() {
        return UnitPose {
            position: [f64::NAN, f64::NAN],
            bearing: None,
            moving: false,
            waypoint: None,
            leg: None,
            leg_progress: None,
            certainty: ne.certainty.clone(),
            trail: Vec::new(),
        };
    }

    let mut trail = vec![tr[0].coord];
    if t < tr[0].arrive {
        return UnitPose {
            position: tr[0].coord,
            bearing: None,
            moving: false,
            waypoint: Some(tr[0].index),
            leg: None,
            leg_progress: None,
            certainty: tr[0].certainty.clone(),
            trail,
        };
    }

    for i in 0..tr.len() {
        let w = &tr[i];
        if t >= w.arrive && t < w.depart {
            return UnitPose {
                position: w.coord,
                bearing: w.leg.as_deref().and_then(leg_end_bearing),
                moving: false,
                waypoint: Some(w.index),
                leg: None,
                leg_progress: None,
                certainty: w.certainty.clone(),
                trail,
            };
        }
        let Some(next) = tr.get(i + 1) else { break };
        let next_leg = next.leg.as_deref().unwrap_or_default();
        if t >= w.depart && t < next.arrive {
            let f = (t - w.depart) as f64 / (next.arrive - w.depart) as f64;
            let hit = along_path(next_leg, f);
            let bearing = if hit.segment + 1 < next_leg.len() {
                Some(initial_bearing(
                    next_leg[hit.segment],
                    next_leg[hit.segment + 1],
                ))
            } else {
                None
            };
            trail.extend_from_slice(&hit.travelled[1.min(hit.travelled.len())..]);
            return UnitPose {
                position: hit.position,
                bearing,
                moving: true,
                waypoint: None,
                leg: Some(next.index),
                leg_progress: Some(f),
                certainty: next.certainty.clone(),
                trail,
            };
        }
        trail.extend_from_slice(&next_leg[1.min(next_leg.len())..]);
    }

    let last = &tr[tr.len() - 1];
    UnitPose {
        position: last.coord,
        bearing: last.leg.as_deref().and_then(leg_end_bearing),
        moving: false,
        waypoint: Some(last.index),
        leg: None,
        leg_progress: None,
        certainty: last.certainty.clone(),
        trail,
    }
}

fn in_bbox(coord: Option<[f64; 2]>, bbox: Option<[f64; 4]>) -> bool {
    match (bbox, coord) {
        (Some([w, s, e, n]), Some(c)) => c[0] >= w && c[0] <= e && c[1] >= s && c[1] <= n,
        _ => true,
    }
}

/// Viewport and payload options for [`resolve_frame`].
#[derive(Clone, Copy, Debug)]
pub struct ResolveOptions {
    pub bbox: Option<[f64; 4]>,
    /// `true` sends the full trail polyline, `false` only its vertex count.
    pub include_trail: bool,
}

impl Default for ResolveOptions {
    fn default() -> Self {
        // Matches the reference default (`includeTrail = true`).
        ResolveOptions {
            bbox: None,
            include_trail: true,
        }
    }
}

pub fn resolve_frame(campaign: &NormalizedCampaign, t: Ticks, opts: &ResolveOptions) -> FrameState {
    let bbox = opts.bbox;
    let mut frame = FrameState {
        t,
        iso: ticks_to_iso(t),
        entities: Vec::new(),
        events: Vec::new(),
    };

    for ne in &campaign.entities {
        if t < ne.start || t >= ne.end {
            continue;
        }
        let st = state_at(&ne.states, t);
        let faction = st
            .and_then(|s| s.faction.clone())
            .unwrap_or_else(|| ne.faction.clone());
        let status = st
            .and_then(|s| s.status.clone())
            .unwrap_or_else(|| "active".to_string());
        let mut base = FrameEntity {
            id: ne.id.clone(),
            kind: ne.kind.clone(),
            faction,
            status,
            position: None,
            bearing: None,
            moving: None,
            waypoint: None,
            leg: None,
            leg_progress: None,
            strength: None,
            certainty: None,
            trail: None,
            trail_length: None,
        };

        if let Some(track) = &ne.track {
            let u = unit_at(ne, t);
            if !in_bbox(Some(u.position), bbox) && !u.trail.iter().any(|c| in_bbox(Some(*c), bbox))
            {
                continue;
            }
            let strength = st
                .and_then(|s| s.strength)
                .or_else(|| strength_at(track, t));
            base.position = Some(u.position);
            base.bearing = Some(u.bearing);
            base.moving = Some(u.moving);
            base.waypoint = Some(u.waypoint);
            base.leg = Some(u.leg);
            base.leg_progress = Some(u.leg_progress);
            base.strength = Some(strength);
            base.certainty = Some(u.certainty.or_else(|| ne.certainty.clone()));
            if opts.include_trail {
                base.trail = Some(u.trail);
            } else {
                base.trail_length = Some(u.trail.len());
            }
            frame.entities.push(base);
        } else if let Some(coord) = ne.coord {
            if !in_bbox(Some(coord), bbox) {
                continue;
            }
            base.position = Some(coord);
            base.strength = Some(st.and_then(|s| s.strength));
            frame.entities.push(base);
        } else {
            // Territories and routes: static geometry, looked up by id.
            frame.entities.push(base);
        }
    }

    for ev in &campaign.events {
        if t < ev.start {
            continue;
        }
        if ev.coord.is_some() && !in_bbox(ev.coord, bbox) {
            continue;
        }
        let active = t < ev.end;
        frame.events.push(FrameEvent {
            id: ev.id.clone(),
            kind: ev.kind.clone(),
            phase: if active { "active" } else { "past" }.to_string(),
            progress: if active {
                (t - ev.start) as f64 / (ev.end - ev.start) as f64
            } else {
                1.0
            },
            since_end: if active { 0 } else { t - ev.end },
            position: ev.coord,
            importance: ev.importance,
        });
    }

    frame
}

/// Tick for scroll progress `p` (0..1) through a chapter. The window is `[start, end)`,
/// hence the `-1`: `p = 1` lands on the last tick inside the chapter, not on the first
/// tick of the next one.
pub fn chapter_time(chapter: &NormChapter, p: f64) -> Ticks {
    // NaN reads as 0, as in the reference; the float-to-int cast must not decide it.
    let clamped = if p.is_nan() {
        0.0
    } else {
        js_min(1.0, js_max(0.0, p))
    };
    chapter.start + (clamped * (chapter.end - chapter.start - 1) as f64).floor() as i64
}

/// The chapter a tick belongs to in story mode (the last chapter whose window started).
pub fn chapter_at(campaign: &NormalizedCampaign, t: Ticks) -> Option<&NormChapter> {
    let mut hit = None;
    for ch in &campaign.chapters {
        if ch.start <= t {
            hit = Some(ch);
        }
    }
    hit
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state(index: usize, start: Ticks, end: Option<Ticks>, status: &str) -> NormState {
        NormState {
            index,
            start,
            end,
            status: Some(status.to_string()),
            faction: None,
            strength: None,
        }
    }

    #[test]
    fn an_interval_state_reverts_to_the_earlier_one() {
        let states = vec![
            state(0, 0, None, "active"),
            state(1, 100, Some(200), "besieged"),
        ];
        let status = |t| state_at(&states, t).and_then(|s| s.status.clone());
        assert_eq!(status(50).as_deref(), Some("active"));
        assert_eq!(status(100).as_deref(), Some("besieged"));
        assert_eq!(status(199).as_deref(), Some("besieged"));
        // The interval ends exclusively, and the point state underneath applies again.
        assert_eq!(status(200).as_deref(), Some("active"));
    }

    #[test]
    fn the_latest_start_wins_and_ties_go_to_the_later_entry() {
        let states = vec![
            state(0, 0, None, "active"),
            state(1, 100, None, "captured"),
            state(2, 100, None, "recaptured"),
            // Starts later but has already ended at t = 300: not applicable.
            state(3, 200, Some(250), "raided"),
        ];
        let status = |t| state_at(&states, t).and_then(|s| s.status.clone());
        assert_eq!(status(100).as_deref(), Some("recaptured"));
        assert_eq!(status(220).as_deref(), Some("raided"));
        assert_eq!(status(300).as_deref(), Some("recaptured"));
        assert!(state_at(&states, -1).is_none());
    }

    #[test]
    fn along_path_is_measured_by_haversine_length() {
        // Two segments, the second roughly three times the first at this latitude.
        let path = [[0.0, 0.0], [1.0, 0.0], [4.0, 0.0]];
        assert_eq!(along_path(&path, 0.0).position, [0.0, 0.0]);
        assert_eq!(along_path(&path, -1.0).segment, 0);
        assert_eq!(along_path(&path, 1.0).position, [4.0, 0.0]);
        let mid = along_path(&path, 0.5);
        assert_eq!(mid.segment, 1);
        assert!((mid.position[0] - 2.0).abs() < 1e-9, "{:?}", mid.position);
        // `travelled` is the polyline up to the position, not the whole path.
        assert_eq!(mid.travelled, vec![[0.0, 0.0], [1.0, 0.0], [2.0, 0.0]]);
    }

    #[test]
    fn bearings_are_clockwise_from_north() {
        assert!((initial_bearing([0.0, 0.0], [0.0, 1.0]) - 0.0).abs() < 1e-9);
        assert!((initial_bearing([0.0, 0.0], [1.0, 0.0]) - 90.0).abs() < 1e-9);
        assert!((initial_bearing([0.0, 0.0], [0.0, -1.0]) - 180.0).abs() < 1e-9);
        assert!((initial_bearing([0.0, 0.0], [-1.0, 0.0]) - 270.0).abs() < 1e-9);
    }
}
