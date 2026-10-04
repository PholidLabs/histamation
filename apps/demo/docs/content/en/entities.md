---
title: Entities
description: Units, fortifications, territories and routes — the things that move, change hands, or otherwise change over time.
group: authoring
order: 4
---

## What makes something an entity {#what-is-an-entity}

If it **moves or changes hands**, it is an entity. If it **happens**, it is an [event](events.md). If it is **just somewhere**, it is a [place](places.md) — entities and events usually reference a place by id instead of repeating coordinates ([§2.1](contract.md#sec-2-1)).

An entity has an existence interval, one geometry that depends on its `kind`, and it can change over time: position, status, owner (`faction`) and strength.

## The four kinds {#kinds}

| `kind` | Geometry field | Forbidden fields | Existence default |
|---|---|---|---|
| `unit` | `track` | `at`, `geometry`, `path` | first waypoint's arrival to the last waypoint's departure |
| `fortification` | `at` | `track`, `geometry`, `path` | the timeline extent |
| `territory` | `geometry` (`Polygon` or `MultiPolygon`) | `track`, `at`, `path` | the timeline extent |
| `route` | `path` (≥2 locations) | `track`, `at`, `geometry` | the timeline extent |
| `x-…` | any one of the above | — | as for whichever geometry it uses |

An entity is visible at tick `t` iff `start ≤ t < end` ([§4](contract.md#sec-4)).

## Fields every entity shares {#common-fields}

`id`, `kind`, `name` and `faction` are required — every entity belongs to a side. Everything else is optional:

```jsonc
{
  "id": "diponegoro-hq", "kind": "unit", "faction": "diponegoro",
  "name": { "en": "…", "id": "…" },
  "when": "1825-07-20/1855-01-08",
  "commanders": ["Pangeran Diponegoro"],
  "description": { "en": "…", "id": "…" },
  "certainty": "approximate",
  "style": { "trail": "full", "icon": "leader" },
  "sources": ["carey-2007", "carey-2014"], "media": ["bik-portrait"],
  "notes": { "en": "…", "id": "…" }, "tags": ["headquarters"]
}
```

`commanders` is a list of names, and each one is [localized text](languages.md), so a title can be translated even though a name usually isn't. `tags` is a plain array of strings for authoring-tool filtering; the engine itself never reads it.

## Existence: the `when` interval {#existence}

`when` sets how long an entity exists. Leave it out and the engine fills in the default from the table above: a `unit` exists from its first waypoint's arrival to its last waypoint's departure; everything else defaults to the whole timeline extent (see [Time](time.md)).

An open end works here too — `"1825-08~/.."` means "from about August 1825 to the end of the timeline":

```json
{ "id": "fort-vredeburg-garrison", "kind": "fortification", "faction": "dutch-colonial",
  "at": "benteng-vredeburg", "when": "1825-07/.." }
```

If a `unit` also sets an explicit `when`, and the track's first arrival or last departure falls outside it, the validator warns ([W113](diagnostics.md#w113)) rather than rejecting the file — but only the part of the track inside `[start, end)` is ever visible, since that is the rule for every entity.

## Units: track and waypoints {#units}

A `unit`'s `track` is an ordered list of waypoints. Each one is:

| Field | Meaning |
|---|---|
| `when` (required) | A point (pass through) or interval (stay) — see [Time](time.md). |
| `at` (required) | A place id or an inline `[lng, lat]`. |
| `via` | Intermediate coordinates for the leg **arriving** at this waypoint. |
| `mode` | `land`, `river` or `sea`, for the arriving leg. Default `land`. |
| `strength` | An integer, or `{min, max, note?}` when sources disagree. |
| `certainty` | Overrides the leg's certainty — see [below](#leg-certainty). |
| `label`, `notes`, `sources` | Per-waypoint narrative and citations. |

```json
{ "when": "1825-07-21/1825-09~", "at": "goa-selarong",
  "label": { "en": "Headquarters at Selarong", "id": "Markas di Selarong" },
  "notes": { "en": "Dutch columns found Selarong empty in early October 1825.", "id": "…" } }
```

### Arrival, departure and holds {#arrival-departure}

For each waypoint, `arrive = start(when)`. If `when` is an interval, `depart = end(when)`; otherwise the unit only passes through and `depart = arrive`. Waypoints must be chronological — `arrive[i] ≥ depart[i-1]` — or the file fails to load ([E006](diagnostics.md#e006)).

### Moving between waypoints {#movement}

At tick `t`:

```text
t < arrive[0]                → hold at waypoint 0
arrive[i] ≤ t < depart[i]    → hold at waypoint i         (moving = false)
depart[i] ≤ t < arrive[i+1]  → on leg i+1                 (moving = true)
t ≥ depart[last]             → hold at the last waypoint
```

On a leg, the fraction travelled is `f = (t − depart[i]) / (arrive[i+1] − depart[i])`, and the position is the point at fraction `f` of the leg's haversine length — linear in longitude/latitude within each segment, not a great-circle interpolation ([§4.1](contract.md#sec-4-1)). The renderer also gets a bearing: the initial great-circle bearing of the segment currently being crossed, or, while holding, of the last segment of the leg that arrived — except before the unit's very first waypoint, where there is no bearing yet.

### Via, mode and the antimeridian {#via-mode}

`via` belongs to the leg **arriving** at that waypoint — the leg is `[previous coord, ...via, this coord]`. Use it to bend a march along a road, a river or a sea lane instead of a straight line. `mode` describes the same arriving leg; renderers may skip terrain draping for `sea` and draw it dashed. Diponegoro's voyage into exile bends along a schematic sea lane this way:

```json
{ "when": "1830-06-12/1833-06-20", "at": "manado-fort", "mode": "sea", "certainty": "approximate",
  "via": [[106.85, -5.9], [108.5, -5.4], [111, -5.2], [114, -5], "…", [124.55, 1.62]] }
```

A leg must not cross the antimeridian — split it with a `via` point instead ([W109](diagnostics.md#w109)).

### Strength along the track {#strength}

Strength comes only from the waypoints that set it: constant while the unit holds, linear between the two nearest knots while it moves, and clamped to the nearest knot's value outside the first and last one. A `{min, max}` range interpolates its midpoint. Ask for a Minard-style width with `style.widthBy: "strength"`:

```json
{ "id": "blue-legion", "kind": "unit", "faction": "blue",
  "track": [
    { "when": "-0010-03/-0010-05-24", "at": "harbor", "strength": 5000 },
    { "when": "-0010-06-01", "at": "hill", "strength": 4000 },
    { "when": "-0010-07-01/-0009", "at": "ruins",
      "strength": { "min": 2000, "max": 3000, "note": { "en": "Sources disagree", "id": "Sumber berbeda" } } }
  ],
  "style": { "trail": "full", "widthBy": "strength" }
}
```

`style.trail` (`full` | `leg` | `none`, default `full`) sets how much of the path travelled so far is drawn.

Coarse interval ends can eat travel time: if two waypoints resolve to the same tick (a zero-duration leg) but are more than 1 km apart, the unit teleports, and the validator warns ([W107](diagnostics.md#w107)) — see [Time](time.md) for how to avoid it.

### Certainty of a leg {#leg-certainty}

A leg's certainty falls back in order: the waypoint's own `certainty`, then — if `at` is a place id — that place's `certainty`, then the entity's own `certainty`. Renderers should draw conjectural or uncertain legs dashed or faded:

```json
{ "when": "1826-08-09", "at": "kejiwan", "certainty": "conjectural" }
```

## Fortifications {#fortifications}

A `fortification` is a single `at` — a place id or an inline coordinate — plus, usually, `states` to carry it through a siege:

```json
{ "id": "fort-vredeburg-garrison", "kind": "fortification", "faction": "dutch-colonial",
  "at": "benteng-vredeburg", "when": "1825-07/..",
  "states": [
    { "when": "1825-07", "status": "active" },
    { "when": "1825-07-28/1825-09-25", "status": "besieged" }
  ] }
```

## Territories {#territories}

A `territory` is a `Polygon` or `MultiPolygon` — just `type` and `coordinates`, not full GeoJSON: no properties, no bbox. Every ring must close, its first and last positions equal, or the file fails to load ([E010](diagnostics.md#e010)). Ownership usually comes from `states`, the same way a fort changes hands:

```json
{ "id": "red-land", "kind": "territory", "faction": "red",
  "geometry": { "type": "Polygon",
    "coordinates": [[[0.3, -0.3], [0.6, -0.3], [0.6, 0.1], [0.3, 0.1], [0.3, -0.3]]] },
  "states": [{ "when": "-0010-07-01", "faction": "blue" }] }
```

## Routes {#routes}

A `route` is a static line — a road, a border, a sea lane shown as scenery rather than a march — given as `path`, a list of at least two locations (place ids or inline coordinates). It never moves; use `style.dash` for a dashed line:

```json
{ "id": "coast-road", "kind": "route", "faction": "red",
  "path": ["harbor", "hill", [0.4, 0]],
  "style": { "dash": [2, 1] } }
```

## Custom `x-` kinds {#custom-kinds}

A `kind` matching `x-…` is accepted anywhere a built-in kind is. It still needs exactly one of `at`, `track`, `geometry` or `path` — a custom kind with none of them fails to load ([E016](diagnostics.md#e016)). An unrecognized `x-` kind renders with the generic style for whichever geometry it used: point, line or polygon ([§7.4](contract.md#sec-7-4)).

```json
{ "id": "lighthouse", "kind": "x-lighthouse", "faction": "blue",
  "at": "harbor", "x-beamRangeKm": 20 }
```

`x-` fields are data, never evaluated — a custom kind or a custom field is exactly as safe as a built-in one ([§7.5](contract.md#sec-7-5)).

## States: status, faction and strength over time {#states}

`states` is a list of `{ when, status?, faction?, strength?, label? }`, sorted by `start(when)` — an out-of-order list fails to load ([E007](diagnostics.md#e007)).

At tick `t`, the candidate states are those with `start ≤ t` whose interval, if they have one, has not yet ended. **The one with the latest start wins.** A point state (no interval) lasts until something replaces it. An interval state lasts to its own end, after which the earlier state applies again ([§4.2](contract.md#sec-4-2)):

```json
"states": [
  { "when": "1825-07", "status": "active" },
  { "when": "1825-07-28/1825-09-25", "status": "besieged" }
]
```

Fort Vredeburg is `besieged` only during the siege interval; before and after it, `active` applies again. A `faction` in a state changes the controlling side — that is how a fort gets captured:

```json
"states": [
  { "when": "1825-08~", "status": "active" },
  { "when": "1826-06-09", "status": "captured", "faction": "dutch-colonial" }
]
```

With no applicable state, the status is `active` and the faction is the entity's own. `status` is one of `planned, active, besieged, captured, destroyed, abandoned, encamped, captive, surrendered, disbanded, exiled, dead`, or a custom `x-…`.

## Style hints {#style}

`style` is renderer-neutral — it never carries a Mapbox or MapLibre paint property, only a hint the theme is free to interpret ([§1](contract.md#sec-1)): `color`, `width`, `dash`, `icon`, `opacity`, `trail` (`full` | `leg` | `none`), `widthBy` (`"strength"` is the only value today). How each kind uses it is theme-defined, not fixed by the data ([§7.4](contract.md#sec-7-4)):

| `kind` | Default layer | Style resolution |
|---|---|---|
| `unit` | trail line + head symbol | `entity.style` › `faction.color` › theme; width by strength if `widthBy`; legs dashed if conjectural or `mode: sea` |
| `fortification` | symbol | icon by `status`, tint by current owner |
| `territory` | fill + outline | fill by current owner |
| `route` | line | `style.dash` › theme |

```json
"style": { "trail": "full", "icon": "leader" }
```
