# ChronoMap Data Contract v1.0

**Status:** draft for implementation · **Applies to:** `chronomap: "1.x"` campaign files
**Normative artifacts:** [`schema/campaign.schema.json`](../schema/campaign.schema.json) (structure), [`packages/engine/src/`](../packages/engine/src) (semantics), [`test-vectors/`](../test-vectors) (expected outputs)

This document defines how a campaign file (the plug-in data) is written, and how the ChronoMap engine loads it, checks it and plays it. Any file that passes validation must play in any conforming engine with no code changes. The Java War and Napoleon 1812 examples use exactly the same format.

---

## 1. Design principles

1. **Data describes history, not rendering.** Files say *what* existed, *where* and *when*. They never contain Mapbox or MapLibre paint properties. The engine's theme decides how a `fortification` in state `besieged` looks. A small, renderer-neutral `style` hint object is allowed.
2. **Time is honest.** "1827" and "1827-01-01T00:00:00Z" mean different things. Every date carries its precision, and dates can be marked uncertain or approximate.
3. **Location is honest.** Every place carries `certainty` (`exact` / `approximate` / `conjectural`), and renderers must be able to show the difference.
4. **Deterministic playback.** The same file at the same tick produces the same frame in the JS reference and in the Rust/WASM core, and test vectors enforce this.
5. **One self-contained file.** Sources, media credits, translations and narrative all travel with the data.
6. **Extensible without breaking.** Any object accepts `x-`-prefixed fields, and `kind` values accept `x-` custom kinds. Engines ignore what they don't understand.

---

## 2. File anatomy

```jsonc
{
  "$schema": "../schema/campaign.schema.json",   // editor autocomplete; ignored by engines
  "chronomap": "1.0",                             // contract version (required)
  "meta":      { … },  // id, title, languages, timeline extent, initial map view
  "factions":  [ … ],  // sides, with colors (required, ≥1)
  "parts":     [ … ],  // optional chapter grouping for a table of contents
  "places":    [ … ],  // static gazetteer: named points with certainty
  "entities":  [ … ],  // things that exist over time: unit | fortification | territory | route
  "events":    [ … ],  // things that happen: battle, siege, treaty, arrest…
  "chapters":  [ … ],  // the story: time window + camera + text (required, ≥1)
  "sources":   [ … ],  // citations
  "media":     [ … ]   // images with alt text, credit and license
}
```

**IDs.** All IDs are kebab-case (`^[a-z0-9]+(-[a-z0-9]+)*$`) and share **one namespace across the whole file**, so a place and an event can't both be called `gawok`. A single namespace lets `chapter.focus` mix places, entities and events without type tags, and makes error messages unambiguous.

**Text.** Any human-readable field is either a plain string (in `meta.defaultLanguage`) or a language map:

```json
"title": { "en": "Arrest at Magelang", "id": "Penangkapan di Magelang" }
```

A language map must include the default language. Missing translations for other declared languages produce warnings, not errors.

### 2.1 The four core concepts

| Concept | Has time? | Has geometry? | Changes over time? | Rendered as |
|---|---|---|---|---|
| **Place** | no | point | no | label and marker, with an uncertainty halo |
| **Entity** | existence interval | track, point, polygon or line | yes: position, status, owner, strength | moving unit, fort icon, shaded territory, route line |
| **Event** | point or interval | optional point | phase: upcoming, active, past | pulse while active, faded marker after |
| **Chapter** | window | camera and focus | drives the clock | scroll step, with narrative and media |

Rule of thumb: if it **moves or changes hands**, it's an entity. If it **happens**, it's an event. If it's **just somewhere**, it's a place. Entities and events usually reference places by ID (`"at": "goa-selarong"`) instead of repeating coordinates.

---

## 3. Time model

### 3.1 `When` syntax (an EDTF / ISO 8601-2 subset)

```
When      = Date | Interval
Interval  = (Date | "..") "/" (Date | "..")          ; not both ".."
Date      = Year [ "-" MM [ "-" DD [ "T" hh ":" mm [ ":" ss ] ] ] ] [ Qualifier ]
Year      = [ "-" ] 4DIGIT                            ; astronomical: 0000 = 1 BCE, -0043 = 44 BCE
Qualifier = "?" (uncertain) | "~" (approximate) | "%" (both)
```

| Example | Meaning |
|---|---|
| `1825` | sometime in 1825 (year precision) |
| `1825-07` | July 1825 |
| `1825-07-20` | 20 July 1825 |
| `1830-03-08T12:00` | minute precision (use sparingly; see §3.4) |
| `1827~` | approximately 1827 |
| `1828-11-12?` | 12 November 1828, date uncertain |
| `1825-07-28/1825-09-25` | from 28 July through 25 September 1825 |
| `1827/..` | from 1827 until the end of the timeline |
| `-0043-03-15` | 15 March 44 BCE (proleptic Gregorian) |

Reserved for a later minor version, and currently rejected: `Y`-prefixed years, seasons (`2001-21`), unspecified digits (`18XX`), and empty interval ends (`1825/`).

### 3.2 Resolution to ticks (normative)

The engine works in **ticks**: integer **seconds since 1970-01-01T00:00:00 in the proleptic Gregorian calendar, with no time zone**. Ticks are negative before 1970. That is `i64` in Rust and a plain `number` in JS (exact to ±2⁵³).

Every date covers a **half-open range `[start, end)`** set by its precision:

| Precision | `start` | `end` (exclusive) |
|---|---|---|
| year `1825` | 1825-01-01T00:00:00 | 1826-01-01T00:00:00 |
| month `1825-07` | 1825-07-01T00:00:00 | 1825-08-01T00:00:00 |
| day `1825-07-20` | 1825-07-20T00:00:00 | 1825-07-21T00:00:00 |
| minute `…T14:30` | 14:30:00 | 14:31:00 |
| second `…T14:30:05` | 14:30:05 | 14:30:06 |

- **Interval `A/B`** → `[start(A), end(B))`. So `1825-07-28/1825-09-25` includes all of 25 September, and `1830-03-28/1830-03-28` means "that whole day".
- **Open ends** (`..`) resolve to `meta.timeline.extent`.
- **Qualifiers never change the range.** They are display and styling hints (for example "c. 1827", or dashed outlines).
- `meta.timeline.extent` must be closed, and every *timeline* date in the file must fall inside it (error `E005`). Metadata dates (`media.date`, `source.accessed`, `meta.updated`) are validated but not bounded.

Implementations must convert with integer calendar math: days-from-civil (Hinnant) × 86400 + time of day. See `packages/engine/src/time.ts` and `test-vectors/time.json`.

### 3.3 Calendars

All `When` values are **proleptic Gregorian**. Dates recorded in other calendars are converted when the file is written, and the original can be shown with `chapter.dateLabel`:

```json
"when": "1812-09-07",
"dateLabel": { "en": "7 September 1812 (26 August Old Style)", "id": "7 September 1812 (26 Agustus kalender Julian)" }
```

The same mechanism works for Javanese (Anno Javanico) or Hijri dates.

### 3.4 Pitfalls this model avoids (and one it creates)

- **The PRD's `timestamp: u64` cannot represent 1825.** Unix time before 1970 is negative. Use `i64` ticks.
- **`Date.parse("-0044-03-15")` returns the year 2044 in V8**, not NaN. Never feed raw `When` strings to `Date`.
- **Coarse interval ends eat travel time.** Suppose a waypoint says `"1826-11~/1827-08~"` (depart = 1827-09-01T00:00) and the next says `"1827-09"` (arrive = 1827-09-01T00:00). The unit then teleports. The validator warns about this (`W107`) when the jump exceeds 1 km. Fix it by ending the stay earlier or arriving later.

---

## 4. Entities

```jsonc
{
  "id": "diponegoro-hq", "kind": "unit", "faction": "diponegoro",
  "name": { "en": "…", "id": "…" },
  "when": "1825-07-20/1855-01-08",   // existence; optional (defaults below)
  "track":  [ … ],                   // unit only
  "at":     "pleret",                // fortification only (place id or [lng, lat])
  "geometry": { "type": "Polygon", … }, // territory only
  "path":   ["harbor", "hill", [0.4, 0]], // route only
  "states": [ … ],                   // status / owner / strength over time
  "certainty": "approximate",
  "style": { "trail": "full", "widthBy": "strength" },
  "sources": [ … ], "media": [ … ], "notes": { … }
}
```

| `kind` | Required geometry | Forbidden | Existence default |
|---|---|---|---|
| `unit` | `track` | `at`, `geometry`, `path` | `[arrive(first waypoint), end(last waypoint.when))` |
| `fortification` | `at` | `track`, `geometry`, `path` | timeline extent |
| `territory` | `geometry` (Polygon or MultiPolygon) | `track`, `at`, `path` | timeline extent |
| `route` | `path` (≥2 locations) | `track`, `at`, `geometry` | timeline extent |
| `x-…` | any one of the above | none | as for that geometry |

An entity is **visible** at tick `t` iff `start ≤ t < end`.

### 4.1 Unit tracks: movement semantics (normative)

A waypoint is `{ when, at, via?, mode?, strength?, certainty?, label?, notes? }`.

- `arrive = start(when)`
- `depart = end(when)` if `when` is an interval; otherwise `depart = arrive` (the unit passes through)
- Waypoints must satisfy `arrive[i] ≥ depart[i-1]` (`E006`).

Position at tick `t`:

```
t < arrive[0]                     → hold at waypoint 0
arrive[i] ≤ t < depart[i]         → hold at waypoint i            (moving = false)
depart[i] ≤ t < arrive[i+1]       → on leg i+1                    (moving = true)
                                      f = (t − depart[i]) / (arrive[i+1] − depart[i])
                                      leg = [coord[i], ...via[i+1], coord[i+1]]
                                      position = point at fraction f of the leg's haversine length,
                                                 linear in lng/lat within a segment
t ≥ depart[last]                  → hold at the last waypoint
```

- `via` belongs to the **arriving** leg. Use it for roads, rivers and sea lanes. Legs must not cross the antimeridian (`W109`); split them with `via`.
- `mode` (`land` | `river` | `sea`) describes the arriving leg. Renderers may skip terrain draping for `sea` and draw it dashed.
- **Strength** comes from the waypoints' `strength` values. It is constant during a stay, linear between knots, and clamped outside them. A range `{min, max}` interpolates its midpoint. `style.widthBy: "strength"` asks for Minard-style width.
- **Trail** is the path travelled so far, up to the current position. `style.trail` (`full` | `leg` | `none`) says how much of it to draw.
- **Certainty** of a leg is the arriving waypoint's certainty, which falls back to the place's certainty and then the entity's. Renderers should draw conjectural legs dashed or faded.

### 4.2 States (normative)

`states` is a list sorted by `start(when)` (`E007`). Each state is `{ when, status?, faction?, strength?, label? }`.

At tick `t`, consider the states with `start ≤ t` whose interval (if they have one) has not ended (`t < end`). **The one with the latest start wins.** A point state lasts until something replaces it. An interval state (for example `"1825-07-28/1825-09-25"`, `besieged`) lasts to its end, after which the earlier state applies again. With no applicable state, the status is `active` and the faction is the entity's own.

`status` values: `planned, active, besieged, captured, destroyed, abandoned, encamped, captive, surrendered, disbanded, exiled, dead`, or `x-…`. A `faction` in a state changes the controlling side, which is how a fort gets captured.

---

## 5. Events

`{ id, kind, name, when, at?, certainty?, participants?, outcome?, summary?, importance?, sources?, media?, notes? }`

- **Phase** at tick `t`: `upcoming` if `t < start`, `active` if `start ≤ t < end`, `past` if `t ≥ end`. Frames include active and past events, plus `progress` (0 to 1 while active) and `sinceEnd` (seconds), so renderers can pulse and fade.
- An event **without `at`**, such as a decree, appears in the timeline and context panel but not on the map (`I201`).
- `participants[]`: `{ faction, role, commanders[], strength, losses }`. Strength and losses are an integer or `{min, max, note}` when sources disagree.
- `importance` runs from 1 (major) to 5. Renderers may hide low-importance markers when zoomed out.
- `kind`: `battle, siege, skirmish, raid, massacre, capture, surrender, negotiation, treaty, proclamation, decree, uprising, appointment, arrest, exile, birth, death, political, other`, or `x-…` (for example `x-fire`).

---

## 6. Chapters and story mode

`{ id, part?, title, when, dateLabel?, body, camera?, focus?, media?, sources?, notes? }`

### 6.1 Scroll drives the clock (normative)

A chapter's window is the resolved range of its `when`. Scroll progress `p ∈ [0, 1]` through the chapter's step element maps to:

```
t = start + floor(p × (end − start − 1))
```

`p` is clamped to `[0, 1]`, and `NaN` reads as `0`, so the result always lies in `[start, end)`.

One rule covers every case:

- A **day** chapter barely moves the clock.
- A **month or interval** chapter scrubs through it, so units march as the reader scrolls.
- A **year** chapter scrubs the whole year.

To freeze the clock at an instant, use minute precision.

Chapters should be ordered by start. `W104` flags flashbacks, and `W115` flags a chapter that starts before the previous one ends, since time would jump backwards at the boundary.

### 6.2 Camera and focus

- `camera` = `{ center, zoom, pitch?, bearing?, durationMs?, transition: "fly" | "ease" | "jump" }`. This maps directly to MapLibre or Mapbox `flyTo`, `easeTo` and `jumpTo`; no free-camera API is needed.
- `focus` = IDs of places, entities or events to highlight. **If there is no camera, the engine fits the view to the focus coordinates** (a unit contributes its current position and trail), keeping `meta.map.pitch`. With neither, the camera stays where it is (`W103`).
- `W112` warns when a focused event hasn't happened yet or a focused entity doesn't exist in the chapter window. That usually means a typo in a date.

### 6.3 Free-explore mode

The scrubber's default range is `meta.timeline.focus` (else `extent`), and it can be widened to `extent`. The engine just calls `setTime(t)`; everything else is the same frame resolution.

---

## 7. How the engine interacts with a campaign

### 7.1 Pipeline

```
 URL / drag-and-drop / object
          │
          ▼
 ┌──────────────┐   bytes    ┌─────────────────────────── Worker (Rust/WASM or JS reference) ─────────────────────┐
 │ Main thread  │ ─────────► │ 1 parse (serde_json)                                                               │
 │ ingest       │ transfer   │ 2 validate: structure (serde types = schema) + semantics (§8)  → diagnostics      │
 └──────────────┘            │ 3 normalize: resolve place refs, When → ticks, legs + lengths, defaults, i18n     │
          ▲                  │ 4 index: time-sorted arrays + R-tree over (lng, lat[, t]) envelopes               │
          │   loaded         │ 5 static payload: string table, places, full track polylines, polygons, routes    │
          │ ◄─────────────── └────────────────────────────────────────────────────────────────────────────────────┘
          │  (once)                                   ▲ query(t, bbox, seq)          │ frame(seq) — typed arrays
          │                                           │                              ▼
 ┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
 │ Main thread: build map sources ONCE from the static payload → per frame, update only dynamic values:          │
 │ unit positions / bearing / strength, trail progress, status & owner codes, event phase & progress.             │
 │ Story controller (IntersectionObserver + scroll progress) → t;  Scrubber → t;  Camera controller → flyTo/fit.  │
 └─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Load policy:** any `error` rejects the file and shows the diagnostics. Warnings and info load normally and are available to authoring tools.

### 7.2 Static vs dynamic: the rule that keeps 60 FPS

Do **not** stream vector geometry to the main thread every frame. Calling `setData()` on a GeoJSON source forces re-tiling, and that is what drops frames. Instead:

- **Once, at load:** send the string table (IDs, localized names), place points, full track polylines (with per-vertex cumulative distance), territory polygons and route lines. The renderer builds its sources from these.
- **Per frame:** send only small typed arrays indexed by entity or event order:

| Array | Type | Per item |
|---|---|---|
| `unitState` | `Float64Array` | lng, lat, bearing, strength, trailDistance (metres along the polyline) |
| `entityStatus` | `Uint8Array` | status code |
| `entityOwner` | `Uint16Array` | faction index |
| `entityVisible` | `Uint8Array` | 0/1 |
| `eventPhase` | `Uint8Array` | 0 upcoming, 1 active, 2 past |
| `eventProgress` | `Float32Array` | progress or seconds since end |

The renderer applies these through feature state, a tiny per-frame unit source, and a trail expression (a line gradient or trim, where the renderer supports it).

The logical content of a frame is `FrameState` below. Transport is up to the implementation, but it must decode to exactly this.

```ts
type Ticks = number; // seconds since 1970-01-01T00:00:00, proleptic Gregorian, may be negative

interface FrameState {
  t: Ticks;
  entities: Array<{
    id: string; kind: string; faction: string; status: string;
    position?: [number, number]; bearing?: number | null; moving?: boolean;
    waypoint?: number | null; leg?: number | null; legProgress?: number | null;
    strength?: number | null; certainty?: 'exact' | 'approximate' | 'conjectural' | null;
    trail?: [number, number][];           // reference output; engines may send trailDistance instead
  }>;
  events: Array<{
    id: string; kind: string; phase: 'active' | 'past';
    progress: number; sinceEnd: number; position: [number, number] | null; importance: number;
  }>;
}
```

### 7.3 Engine API (TypeScript surface for `chronomap-js`)

```ts
interface ChronoMap {
  load(source: string | URL | File | object, opts?: { language?: string }): Promise<LoadResult>;
  setLanguage(lang: string): void;

  // clock
  setTime(t: Ticks): void;                              // free-explore; throws RangeError for NaN/±Infinity
  setStoryProgress(chapterId: string, p: number): void; // story mode, p ∈ [0,1] (§6.1)
  readonly time: Ticks;

  // events
  on(e: 'frame', cb: (f: FrameState) => void): () => void;
  on(e: 'chapter', cb: (c: { id: string; index: number; previous?: string }) => void): () => void;
  on(e: 'diagnostics', cb: (d: Diagnostic[]) => void): () => void;

  dispose(): void;
}

interface LoadResult { ok: boolean; diagnostics: Diagnostic[]; summary?: CampaignSummary }
interface Diagnostic { level: 'error' | 'warning' | 'info'; code: string; path: string; message: string }
```

Worker messages:

- main → worker: `{type:"load", bytes}` (transferred), `{type:"query", t, bbox, seq}`, `{type:"language", lang}`
- worker → main: `{type:"loaded", diagnostics, static}`, `{type:"frame", seq, t, buffers}`

Drop stale `seq` replies. While scrolling fast, keep only the latest query outstanding.

The reference `packages/engine/src/worker.ts` and the Rust `wasm.rs` currently speak a simpler form of this protocol: `{type:"load", id, campaign}` → `{type:"loaded", id, ok, diagnostics, summary?}`, `{type:"query", id, t, bbox?, includeTrail?}` → `{type:"frame", id, frame}`, and `{type:"error", id, message}` for a bad request. `id` plays the role of `seq`, and `worker-client.ts` coalesces queries so only the latest is outstanding. `t` is rounded to an integer tick; a non-finite `t` is an error, never a frame.

### 7.4 Renderer binding

| Data | Default layer | Style resolution |
|---|---|---|
| place | symbol + circle, halo radius = `radiusMeters` (default: exact 100 m, approximate 3 km, conjectural 15 km) | theme by `place.kind`; label priority by `rank` |
| unit | trail line + head symbol | `entity.style` › `faction.color` › theme; width by strength if `widthBy`; legs dashed if conjectural or `mode: sea` |
| fortification | symbol | icon by `status`, tint by current owner |
| territory | fill + outline | fill by current owner |
| route | line | `style.dash` › theme |
| event | circle pulse while active, small marker when past | theme by `kind`; size by `importance` |

**Unknown `x-` kinds** render with the generic style for their geometry (point, line or polygon). **Unknown themes** fall back to the engine default.

**Localization** resolves a text in this order: requested language → `meta.defaultLanguage` → first available.

### 7.5 Untrusted input

Campaign files come from anywhere, so treat them as hostile:

- **Size.** Enforce a size cap before parsing (suggested 20 MB) and a cap on total vertices.
- **Chapter bodies** use a Markdown subset: paragraphs, `*em*`, `**strong**` and `[text](https://…)`. Render them with an allow-list renderer, never `innerHTML` of the raw string. Raw HTML is an error (`E017`).
- **URLs** must be `http(s)` or relative. `javascript:`, `data:`, `vbscript:` and `file:` are errors (`E015`).
- **External links** open with `rel="noopener noreferrer"`.
- **Media** are loaded as images only.
- **No code runs from data.** `x-` fields are data, never evaluated.

---

## 8. Validation

Validation has two layers, and both report **JSON Pointer paths**.

1. **Structural.** The JSON Schema, via `ajv` in authoring and CI. In the Rust core the serde types encode the same rules. Code `S001`.
2. **Semantic.** Rules the schema can't express, implemented in `packages/engine/src/campaign.ts`. The Rust core must emit the same codes and paths.

| Code | Level | Rule |
|---|---|---|
| E001 | error | duplicate ID (single namespace) |
| E002 | error | reference to an unknown ID |
| E003 | error | reference to the wrong type (for example a faction ID in `focus`) |
| E004 | error | invalid `When`, interval ending before it starts, or open or missing timeline extent |
| E005 | error | timeline date outside `meta.timeline.extent` |
| E006 | error | track waypoints not chronological, or no usable waypoints |
| E007 | error | `states` not sorted by start |
| E008 | error | language map missing `defaultLanguage` |
| E009 | error | language not declared in `meta.languages` |
| E010 | error | polygon ring not closed |
| E011 | error | coordinate malformed or out of range |
| E012 | error | quantity `min > max` |
| E013 | error | unsupported contract major version |
| E014 | error | `defaultLanguage` not in `languages` |
| E015 | error | unsafe URL scheme |
| E016 | error | custom `x-` entity kind without geometry |
| E017 | error | raw HTML in a chapter body |
| E018 | error | no chapters (playback starts at the first chapter) |
| W101 | warning | missing translation |
| W102 | warning | coordinate outside `meta.map.bounds` (flags a likely lng/lat swap) |
| W103 | warning | chapter has neither camera nor focus |
| W104 | warning | chapter starts before the previous one (flashback) |
| W105 | warning | source, media, place or part never referenced |
| W107 | warning | zero-duration leg longer than 1 km (the unit teleports) |
| W109 | warning | leg crosses the antimeridian |
| W112 | warning | focused item not present in the chapter window |
| W113 | warning | track extends outside the entity's existence interval |
| W114 | warning | event cites no sources |
| W115 | warning | chapter window overlaps the next chapter's start |
| I201 | info | event without location (timeline only) |

---

## 9. Versioning and extension

- `chronomap: "1.N"`. **Minor** versions only add optional fields, enum values and `When` features. A 1.0 engine reading a 1.3 file ignores what it doesn't know. **Major** versions may break; engines refuse unknown majors (`E013`).
- **`x-` fields** are allowed on every object, including the top level (the Napoleon file carries Minard's temperature table as `x-minard`). Custom kinds are `x-…`.
- **Candidates for 1.1:** `places[].when` (founding and renaming), `Y`-years for deep time, seasons, per-leg `when` on routes, `audio` media.

---

## 10. Authoring checklist

1. Put every coordinate in `places` with an honest `certainty` and a `notes` line saying where the coordinate came from.
2. Convert dates to proleptic Gregorian. Mark doubtful ones `?` or `~`, and record disagreements between sources in `notes`. Don't pick one source silently.
3. Give every event at least one source (`W114`).
4. Use neutral terminology for factions. The Java War file avoids the colonial term "rebels".
5. Write `alt` text for every image and check its license.
6. Run `node packages/engine/dist/cli.js your-campaign.json --frames` (after `npm run build`) and read the playback dry-run. It shows where each unit is at the start, middle and end of each chapter, which catches most date mistakes.

---

## 11. Changes from the PRD's schema v1.0

| PRD v1.0 | This contract | Why |
|---|---|---|
| `entity.type` duplicated `geometry.type` | `kind` (semantic) + kind-specific geometry field | two sources of truth drift; the renderer needs meaning ("fort"), not a GeoJSON type |
| One `LineString` + one `timeRange` for a moving force | `unit.track` of timed waypoints with `via`, `mode`, `strength` | a static line can't animate a march; the engine needs arrival and departure times |
| No state model ("active / under siege / destroyed" in prose only) | `states[]` with interval semantics and owner changes | forts are besieged, then captured; the icon must change on time |
| `lineColor`, `lineWidth`, `dashArray` in data | factions have colors; the theme maps kinds; optional neutral `style` hints | Mapbox paint properties in data lock files to one renderer and one look |
| `faction: "rebel"` free string | `factions[]` registry with ID, name, color | referential integrity and legends; avoids loaded labels |
| `timestamp: "1825-07-20T00:00:00Z"` | EDTF subset with precision and qualifiers | "1827" is not midnight on 1 January; historians need `~` and `?` |
| `query_state_at_time(timestamp: u64, …)` | `i64` ticks | u64 can't represent any date before 1970 |
| Coordinates repeated everywhere, altitude in data | `places` gazetteer + `certainty`; altitude optional (drape on DEM) | one fix corrects every reference; honest uncertainty |
| No citations or media in schema (despite UI-03) | `sources[]`, `media[]` with alt, credit, license | an open-source history dataset lives or dies on provenance |
| English only | language maps + `languages` / `defaultLanguage` | Indonesian audience for the flagship demo |
| No version field | `chronomap: "1.0"` | plug-and-play needs forward compatibility |
| Chapters: timestamp + camera only | `when` window scrubbed by scroll, `focus` auto-fit, `parts`, `dateLabel` | lets units move while reading; cameras optional |

---

## 12. Recommended amendments to the PRD beyond the data format

These came up while designing the contract. They are worth deciding before Phase 1 code.

1. **Mapbox GL JS vs MapLibre GL JS.** Since v2 (December 2020), Mapbox GL JS ships under the proprietary Mapbox Web SDK license. It requires an active Mapbox account and access token, and bills map loads (50,000 free per month at time of writing). That sits awkwardly with an MIT open-source engine that anyone should be able to fork and self-host. **MapLibre GL JS** (BSD-3, v6.x) has 3D terrain (`raster-dem`), globe projection and custom layers. v6 is ESM-only and requires WebGL 2, which matches the PRD's browser targets. Recommendation: target MapLibre by default and keep the renderer behind an adapter so a Mapbox adapter stays possible.
2. **The `FreeCamera` API is Mapbox-only.** Chapter cameras only need `flyTo`, `easeTo` and `jumpTo`, which both libraries have. MapLibre offers `calculateCameraOptionsFromCameraLngLatAltRotation` for altitude-based shots if ever needed.
3. **Offline via service worker (NFR).** Mapbox's product terms allow caching on the end user's device for up to 30 days when filled by normal use, and prohibit bulk or systematic downloading. "Pre-cache the region for offline" therefore conflicts with Mapbox's terms. With MapLibre plus self-hosted PMTiles (vector and terrain), offline is straightforward.
4. **Don't stream geometry every frame** (§7.2). The PRD's "WASM pushes lightweight vector geometries" per frame would force re-tiling. Send static geometry once and per-frame state as typed arrays.
5. **Be honest about where WASM pays off.** The Java War file has 9 entities and 43 events, and `resolveFrame` in plain JS takes microseconds. The worker round-trip adds about one frame of latency. The Rust core earns its place at the NFR scale (50,000 features), in the R-tree, and as a reference architecture. Keep a same-thread JS path (the reference implementation already is one), and let a benchmark decide the default.
6. **Runtime validation belongs in the core, not in `ajv`.** Measured with esbuild, `ajv` + `ajv-formats` + this schema come to about 48 KB gzipped (164 KB minified), half the 100 KB JS budget. The whole reference semantic validator plus resolver is about 7 KB gzipped. The Rust core already has to deserialize the file, and serde plus the semantic rules give the same guarantees. Keep the JSON Schema for editors and CI.
7. **Crates.** The `edtf` crate hasn't had a release since 2021. The `When` subset is small, so hand-write the parser (mirror `packages/engine/src/time.ts`, as `crates/chronomap-core/src/time.rs` does) and test it against `test-vectors/time.json`. `rstar` 0.13 supports `AABB<[f64; 3]>` if you index time as a third axis. Scale ticks to a magnitude comparable to degrees, and use finite sentinels for open intervals.
8. **Scroll progress needs more than IntersectionObserver.** Observers fire at thresholds, which is fine for chapter entry. Continuous `p` (§6.1) needs a `requestAnimationFrame` read of the step element's bounding box.

---

## 13. Reference implementation and test vectors

```
packages/engine/src/time.ts      When parsing, ticks, calendar math
packages/engine/src/campaign.ts  semantic validation + normalization (diagnostic codes, §8)
packages/engine/src/resolve.ts   resolveFrame(campaign, t), chapterTime(chapter, p)
packages/engine/src/engine.ts    stateful playback façade (§7.3)
packages/engine/src/worker.ts    worker protocol (§7.1) the Rust/WASM core plugs into
packages/engine/src/cli.ts       chronomap-check: schema + semantic validation, --frames dry-run, --vectors
packages/engine/src/vectors.ts   builds the golden vectors written by `npm run vectors`
packages/engine/src/format.ts    localized text and precision-aware date formatting for display

crates/chronomap-core/          the Rust port, tested against the vectors below

test-vectors/time.json                        When → ticks, including invalid inputs
test-vectors/null-island.frames.json          synthetic fixture: every feature, BCE dates, p = 0, .25, .5, .75, 1
test-vectors/java-war-1825.frames.json        one frame per line, p = 0, .5, 1 per chapter
test-vectors/napoleon-russia-1812.frames.json
```

A conforming core must reproduce `time.json` exactly, and every frame field within an absolute tolerance of 1e-6. When the contract changes, update `packages/engine/src/` first, regenerate the vectors with `npm run vectors`, then port to `crates/chronomap-core`.
