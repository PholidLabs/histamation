---
title: Getting started
description: Install ChronoMap, run the demo, and validate your first campaign file in five minutes.
group: start
order: 1
---

ChronoMap plays a "campaign" — a single JSON file describing places, forces and events on a
historical map — as a scrollytelling story or a free-explore map. This page gets the engine
running locally and walks a minimal campaign file from blank page to validated to on screen.

## Prerequisites {#prerequisites}

- **Node.js >= 20** (the workspace's `engines` field enforces this).
- **git**, to clone the repository.
- No Mapbox account or API token: the renderer is built on MapLibre GL JS, which needs neither.

## Clone and install {#install}

```bash
git clone https://github.com/PholidLabs/chronomaps.git
cd chronomaps
npm install
```

The repository is an npm workspace: `packages/*` holds the engine and the MapLibre renderer,
`apps/demo` is the Vite site that hosts them. One `npm install` at the root wires up all three.

## Build the engine {#build}

```bash
npm run build
```

This compiles `packages/engine` and `packages/maplibre` to plain JS in their `dist/` folders.
You need this step before the CLI works (`packages/engine/dist/cli.js` doesn't exist until you
build) and before `npm run check`, which validates against the compiled engine. The demo itself
doesn't need a build during development — Vite's dev server reads the packages' TypeScript
source directly.

## Run the demo {#run}

```bash
npm run dev
```

This starts Vite's dev server for `apps/demo`. It prints a local URL — by default
`http://localhost:5173/` — open it in a browser.

## The two pages {#pages}

The demo is a two-page site:

- **`/`** — the landing page: what ChronoMap is, in English and Indonesian.
- **`/app/`** — the map app itself: the scrollytelling story, the free-explore scrubber, and
  where you load a campaign file.

## A minimal campaign {#minimal-campaign}

A campaign file needs four things: `chronomap` (the contract version), `meta` (with a closed
timeline `extent` and an initial map view), at least one faction, and at least one chapter
([`E018`](diagnostics.md#e018) — a campaign with no chapters has nowhere to start playback).
Everything else — `places`, `entities`, `events`, `sources`, `media` — is optional. Here is the
smallest campaign that validates:

```json
{
  "$schema": "../../schema/campaign.schema.json",
  "chronomap": "1.0",
  "meta": {
    "id": "hello-chronomap",
    "title": "Hello, ChronoMap",
    "description": "A five-minute example: one faction, one place, one chapter.",
    "languages": ["en"],
    "defaultLanguage": "en",
    "timeline": { "extent": "1825" },
    "map": { "center": [110.364, -7.806], "zoom": 12 }
  },
  "factions": [
    { "id": "sultanate", "name": "Sultanate of Yogyakarta", "color": "#8B1E1E" }
  ],
  "places": [
    { "id": "kraton", "name": "Kraton Yogyakarta", "coordinates": [110.364, -7.806], "certainty": "exact" }
  ],
  "chapters": [
    {
      "id": "start",
      "title": "The kraton",
      "when": "1825-07-20",
      "body": "The story begins at the sultan's palace.",
      "focus": ["kraton"]
    }
  ]
}
```

A few things to notice:

- `meta.timeline.extent` is a closed `When` (see [Time](time.md#syntax)) that every timeline
  date in the file must fall inside — here, the single year `1825`, which covers the whole
  year.
- `factions` needs at least one entry with `id`, `name` and a `#rrggbb` (or `#rrggbbaa`) `color`.
- The place's `id`, `name`, `coordinates` and `certainty` are all required — see
  [Places](places.md).
- The chapter's `focus` names the place by ID; with no `camera`, the engine fits the view to it
  (see [§6.2](contract.md#sec-6-2)).
- `$schema` isn't read by the engine — it just points your editor at
  [`schema/campaign.schema.json`](gh:schema/campaign.schema.json) for autocomplete and inline
  errors. See [Campaign file anatomy](campaign-file.md#schema-autocomplete).

## Validate it {#validate}

Save the file somewhere (for example `data/campaigns/hello-chronomap.json`, so `npm run check`
picks it up automatically), then run it through the engine's CLI:

```bash
node packages/engine/dist/cli.js data/campaigns/hello-chronomap.json
```

It reports structural and semantic diagnostics against the file (see
[Diagnostics](diagnostics.md) for the full code list), then a one-line summary of what it found:

```text
data/campaigns/hello-chronomap.json
  0 error(s), 0 warning(s), 0 info
  1 factions · 1 places · 0 entities · 0 events · 1 chapters
```

Add `--frames` for a playback dry run — the position of every chapter at scroll progress
`p = 0, 0.5, 1` ([§6.1](contract.md#sec-6-1)), which catches most date mistakes without opening
a browser:

```bash
node packages/engine/dist/cli.js data/campaigns/hello-chronomap.json --frames
```

```text
  Playback dry-run (p = scroll progress through the chapter):

  ▸ start — The kraton  [1825-07-20]
    p=0.0 1825-07-20T00:00  active: —
    p=0.5 1825-07-20T11:59  active: —
    p=1.0 1825-07-20T23:59  active: —
```

`--strict` also fails on warnings, `--quiet` prints errors only, and `--json` emits the report
as JSON instead of text. `npm run check` runs the same CLI over every file in
`data/campaigns/` and `data/campaigns/fixtures/`, so it's the one command that guards every
committed campaign.

> [!TIP]
> You don't need a browser for this step. `--frames` is usually faster than reloading `/app/`
> for catching typo'd dates and unreachable focus IDs. For interactively poking at `When`
> strings and seeing the resolved span, use the [when-tester](when-tester.md); for the full
> diagnostic report as you type, use the [validator](validator.md).

## See it in the app {#see-it}

With `npm run dev` running, open `/app/`. Either click **Load JSON…** to pick
the file, or drag it straight onto the browser window — both call the same loader. Files over
20 MB are rejected client-side before parsing even starts. A file with only warnings loads and
plays; a file with any error is rejected and the diagnostics are shown instead
([§7.1](contract.md#sec-7-1)).

## Next steps {#next-steps}

- [Campaign file anatomy](campaign-file.md) — the top-level shape, the four primitives, and the
  one flat ID namespace.
- [Time](time.md) — `When` syntax, precision, qualifiers, and how dates resolve to ticks.
- [Places](places.md) — coordinates, certainty and provenance.
- [Entities](entities.md), [Events](events.md) and [Chapters](chapters.md) — the moving parts,
  the things that happen, and the story that ties them together.
- The [data contract](contract.md) is the normative spec behind every page in this section.
- [Diagnostics](diagnostics.md) lists every error, warning and info code the validator can
  raise.
