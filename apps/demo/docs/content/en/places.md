---
title: Places
description: The static gazetteer — coordinates, certainty, the uncertainty radius, and how to record where a coordinate came from.
group: authoring
order: 3
---

A place is the simplest of the four primitives ([Campaign file § The four primitives](campaign-file.md#primitives)):
it has no time and never changes. If something is **just somewhere** — a palace, a cave, a
battlefield whose location is disputed — it's a place. If it moves or changes hands, it's an
[entity](entities.md) instead.

## What a place is {#what-is-a-place}

Places form a static gazetteer: named points that [entities](entities.md) and
[events](events.md) refer to by ID instead of repeating coordinates everywhere. A place is
rendered as a label and a marker, plus an uncertainty halo sized by its
[certainty](#certainty) — never anything that changes over the course of the story.

## Required fields {#fields}

```json
{
  "id": "goa-selarong",
  "name": { "en": "Selarong cave", "id": "Goa Selarong" },
  "modernName": { "en": "Kembangputihan, Guwosari, Pajangan, Bantul", "id": "Kembangputihan, Guwosari, Pajangan, Bantul" },
  "kind": "cave",
  "coordinates": [110.31476, -7.86187],
  "certainty": "exact",
  "rank": 1,
  "notes": "Jogjacagar record 3994 (UTM cross-checked). The western 'kakung' cave was Diponegoro's.",
  "sources": ["jogjacagar"]
}
```

`id`, `name`, `coordinates` and `certainty` are required. Everything else is optional:

| Field | Purpose |
|---|---|
| `modernName` | Present-day name or administrative location, when it differs from the period name. |
| `kind` | `settlement`, `palace`, `fort`, `battlefield`, `cave`, `mountain`, `river`, `port`, `residence`, `grave`, `landmark`, `region`, or a custom `x-…` value. Drives the theme's marker icon. |
| `radiusMeters` | Uncertainty radius in metres — see [Radius of uncertainty](#radius). |
| `rank` | Label priority, `1`–`5`. `1` always labels; higher numbers are dropped first as the map gets crowded. |
| `description` | Longer prose than `name`, shown in a popup or panel. |
| `sources` | IDs into `sources[]`. |
| `media` | IDs into `media[]`. |
| `notes` | Free text — this is where provenance goes, see [Provenance](#provenance). |

## Coordinates: `[lng, lat]` {#coordinates}

```json
"coordinates": [110.36406, -7.80569]
```

Longitude first, then latitude — the GeoJSON and WGS84 convention, and the opposite order from
how map coordinates are often spoken aloud ("7.8°S, 110.4°E"). A third element is accepted as
altitude in metres; when it's omitted, the renderer drapes the point on the terrain DEM instead.

`coordinates` is checked structurally (an array of two or three finite numbers) and then by
range: longitude within ±180, latitude within ±90. Either failure is
[`E011`](diagnostics.md#e011). A swapped pair usually still parses as *some* coordinate, so this
check alone won't always catch it — see [Coordinates outside the map bounds](#bounds) for the
warning that does.

## Certainty {#certainty}

| `certainty` | Meaning |
|---|---|
| `exact` | The actual, identified site. |
| `approximate` | Known to town or village level, not more precisely. |
| `conjectural` | The historic location isn't known; this is a placed inference. |

Certainty is about **location**, not time — a date's honesty is expressed separately with the
`?`/`~`/`%` qualifiers in [Time](time.md#qualifiers). The renderer must be able to show the
difference: it draws a halo around the marker sized by [`radiusMeters`](#radius), so a
`conjectural` placement reads as a wide, soft circle rather than a precise pin
([§7.4](contract.md#sec-7-4)).

An [entity](entities.md)'s or [event](events.md)'s own `certainty` isn't required — if it's
missing, a leg or event `at` a place ID falls back to that place's `certainty`, and only then to
the entity's own `certainty` (see [§4.1](contract.md#sec-4-1)). Don't leave a genuinely
conjectural location unmarked just because the entity above it happens to be `exact`.

## Radius of uncertainty {#radius}

`radiusMeters` is the halo radius in metres. Leave it out and it defaults by `certainty`:

| `certainty` | Default `radiusMeters` |
|---|---|
| `exact` | 100 m |
| `approximate` | 3,000 m (3 km) |
| `conjectural` | 15,000 m (15 km) |

Override it when the default is wrong either way. `kejiwan` in the Java War file is
`conjectural` with no `radiusMeters` set, so it gets the 15 km default — the site is only known
to be somewhere between two temples. `siluk` is also `conjectural` but sets
`"radiusMeters": 20000`, because even 15 km understates how uncertain that identification is:

```json
{ "id": "siluk", "certainty": "conjectural", "radiusMeters": 20000,
  "notes": "Sources place the battle 'near the Selarong hills' or 'in the Progo valley'; identification with this hamlet is unverified." }
```

## Coordinates outside the map bounds {#bounds}

`meta.map.bounds` is `[west, south, east, north]` — it sets the map's `maxBounds` and is also
what a place's coordinate is checked against. Outside it, you get
[`W102`](diagnostics.md#w102). If the coordinate would fall inside the bounds with longitude and
latitude swapped, the warning says so directly, because that's by far the most common way this
happens — typing `[lat, lng]` out of habit. For example, with the Java War file's
`"bounds": [104, -9.5, 126.5, 3]`, writing `kraton-yogyakarta`'s real coordinate
`[110.364, -7.806]` backwards as `[-7.806, 110.364]` trips exactly this case: read as `[lng,
lat]`, `-7.806` is nowhere near the bounds' 104–126.5°E span, so it's outside — but swap the
two and `110.364` (in the latitude slot) falls inside 104–126.5, and `-7.806` (in the longitude
slot) falls inside −9.5°..3°N, so the hint fires.

## Provenance: the notes field {#provenance}

Every coordinate should say where it came from, in `notes`
([§10](contract.md#sec-10)): a museum register, a heritage-site database record, an OpenStreetMap
node, a GPS survey, or an educated placement between two known points. Real examples from the
Java War file:

- `"Jogjacagar record 3994 (UTM cross-checked). The western 'kakung' cave was Diponegoro's."`
- `"DIY museum register. The 'Tembok Jebol' (broken wall) he escaped through is 24 m away."`
- `"Village point from a tourism listing. Local tradition also names Ngipikrejo and Goa Sriti (Samigaluh) as bases."`
- `"Placed at the midpoint of Candi Kalasan and Candi Prambanan."`
- `"Town centre; coordinate not independently verified."`

When sources disagree, say so instead of silently picking one — `mlangi`'s `notes` lists three
different candidate sites from three different sources rather than choosing between them
quietly. A vague or synthesized placement (a placeholder, a midpoint) is exactly what
`certainty: "conjectural"` and a generous `radiusMeters` are for.

## Referencing places {#referencing}

An entity's `at` (for a `fortification`), a waypoint's `at`, an event's `at`, or a chapter's
`focus` can name a place by ID instead of repeating coordinates — that's the `location` type
throughout the contract, a place ID or an inline `[lng, lat]` coordinate. Naming the wrong kind
of ID is [`E003`](diagnostics.md#e003); naming one that doesn't exist anywhere in the file is
[`E002`](diagnostics.md#e002). A place that nothing ever references is
[`W105`](diagnostics.md#w105) — worth checking before you ship a file, since it usually means a
typo'd ID or a place you meant to delete.
