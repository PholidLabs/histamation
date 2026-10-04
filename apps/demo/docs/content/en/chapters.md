---
title: Chapters
description: The narrative steps that drive the map's clock as the reader scrolls, with a camera, a focus and a restricted body format.
group: authoring
order: 6
---

## Chapters drive the story {#overview}

A campaign needs at least one chapter — a file with none fails to load ([E018](diagnostics.md#e018)), and playback starts at the first one. A chapter is a time window plus a camera, a focus and narrative text: the unit of scrollytelling ([§2.1](contract.md#sec-2-1)).

## Fields {#fields}

`id`, `title`, `when` and `body` are required:

```jsonc
{ id, part?, title, when, dateLabel?, body, camera?, focus?, media?, sources?, notes? }
```

`part` groups chapters into a table of contents; see [Parts](#parts). `dateLabel` overrides the auto-formatted date — use it to show an Old Style or Javanese calendar date alongside the proleptic Gregorian `when` (see [Time](time.md)).

## Scroll drives the clock {#scroll-and-clock}

A chapter's window is the resolved range of its `when`. Scroll progress `p ∈ [0, 1]` through the chapter's step element maps to a tick:

```text
t = start + floor(p × (end − start − 1))
```

`p` is clamped to `[0, 1]`, and `NaN` reads as `0`, so the result always lands inside `[start, end)` ([§6.1](contract.md#sec-6-1)).

### What a day, month and year chapter feel like {#chapter-feel}

One formula covers every case, because it scales with the size of the window:

- A **day** chapter barely moves the clock — the whole scroll step covers 86,400 seconds.
- A **month or interval** chapter scrubs through it, so units march and forts change status as the reader scrolls.
- A **year** chapter scrubs the whole year.
- To freeze the clock at one instant, give the chapter minute precision.

A day chapter barely moves at all:

```json
{ "id": "ch-02-geger-sepehi", "when": "1812-06-20" }
```

while an interval chapter scrubs through the months it spans:

```json
{ "id": "ch-20-forts", "when": "1827-01/1827-08-28" }
```

## Ordering chapters {#ordering}

Chapters should be ordered by start. If one starts before the *previous* chapter's own start, it is a flashback ([W104](diagnostics.md#w104)). Even without a flashback, if one chapter's window overlaps the *next* chapter's start, the clock jumps backwards at the boundary between them ([W115](diagnostics.md#w115)). `data/campaigns/fixtures/null-island.json` deliberately does this to exercise the check: `ch-muster` runs `-0010-03/-0010-05` (ending 1 June), and the next chapter, `ch-march`, starts `-0010-05-25` — five days before `ch-muster` ends.

## Camera {#camera}

`camera` is `{ center, zoom, pitch?, bearing?, durationMs?, transition? }`, mapping directly to MapLibre's or Mapbox's `flyTo`, `easeTo` or `jumpTo` — `transition` picks which one (`fly`, `ease` or `jump`). Only `center` and `zoom` are required:

```json
{ "center": [110.3641, -7.8057], "zoom": 14.5, "pitch": 55, "bearing": 10, "durationMs": 2500 }
```

## Focus {#focus}

`focus` is a list of place, entity or event ids to highlight. **With no camera, the engine fits the view to the focus coordinates** instead — a unit contributes its current position and trail — keeping `meta.map.pitch`. With neither a camera nor a focus, the camera does not move ([W103](diagnostics.md#w103)) ([§6.2](contract.md#sec-6-2)):

```json
"focus": ["geger-sepehi", "kraton-yogyakarta"]
```

A focused event that has not happened yet during the chapter, or a focused entity that does not exist during it, is usually a typo in a date — the validator warns ([W112](diagnostics.md#w112)).

## Parts {#parts}

`parts` is an optional top-level list of `{ id, title, description? }` that groups chapters for a table of contents. A chapter joins a part through its own `part` field, referencing the part's id:

```json
{ "id": "prologue", "title": { "en": "Prologue", "id": "…" } }
```

## Body: the Markdown subset {#body}

`body` is [localized text](languages.md) in a **restricted** Markdown: paragraphs separated by a blank line, `*em*`, `**strong**`, and `[text](https://…)` — an absolute `http(s)` link only; anything else written in link syntax still parses, but renders as plain text instead of a link. There is no heading, list, image or raw HTML syntax, and raw HTML in a body fails to load ([E017](diagnostics.md#e017)):

```json
"body": { "en": "From about the age of eight he was raised by his great-grandmother, Ratu Ageng, on her estate at **Tegalrejo**, north-west of the kraton.\n\nHe grew up away from court life and close to the religious teachers and farmers of the countryside.", "id": "…" }
```

The renderer builds real DOM nodes from this subset instead of ever assigning a raw string to `innerHTML` ([§7.5](contract.md#sec-7-5)); a link with an unsafe URL scheme — `javascript:`, `data:`, `vbscript:` or `file:` — also fails to load ([E015](diagnostics.md#e015)), the same rule [Sources and media](sources-media.md#url-safety) covers for every other URL in the file.

`media` and `sources` on a chapter reference [media](sources-media.md#media) and [sources](sources-media.md#sources) the same way an entity or an event does.
