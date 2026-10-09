# Histamation Engine

<p align="center">
  <img src="apps/demo/icons/logo.jpeg" alt="Histamation Engine Logo" width="160" />
</p>

<p align="center">
  <strong>An open-source, local-first engine for interactive spatio-temporal maps and historical scrollytelling.</strong>
</p>

<p align="center"><em>Formerly ChronoMap (<code>@pholidlabs/chronomap-*</code> on npm, now deprecated).</em></p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" />
  <img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg" alt="Node >= 20" />
  <img src="https://img.shields.io/badge/basemap-bundled-success.svg" alt="Bundled basemap" />
  <img src="https://img.shields.io/badge/dependencies-0%20API%20keys-orange.svg" alt="0 API Keys" />
  <img src="https://img.shields.io/badge/parity-TS%20%2B%20Rust%2FWASM-purple.svg" alt="Dual Core Parity" />
</p>

---

Write a single declarative JSON file describing a historical campaign — places, forces, routes, events, and narrative chapters — and the engine brings it to life:
- **Units march** along interpolated routes with realistic bearings and speed diagnostics.
- **Fortresses and territories** change hands and track historical lines of control.
- **The camera choreographs** smoothly across geography as you scroll through the narrative.
- **Historical uncertainty is first-class**: conjectural locations display transparent uncertainty halos, and approximate dates are formally qualified.

**The format is the product.** Shipped with the repository are two complete historical campaigns loaded by the exact same engine without changing a single line of code:
1. **The Java War (Perang Diponegoro, 1825–1830)** — our flagship bilingual dataset featuring guerrilla troop maneuvers, shifting frontlines, and the Dutch *Benteng Stelsel* fort network.
2. **Napoleon's 1812 Russian Campaign** — Minard-style visualization tracking troop attrition and movement during the march on and retreat from Moscow.

**Full documentation** (English and Indonesian) ships with the web app at `/docs/`: getting started, a guide to writing campaigns, the data contract, every diagnostic code, the API reference, and an in-browser campaign validator. Run `npm run dev` and open `http://localhost:5173/docs/`.

---

## Table of Contents

1. [Key Features](#-key-features)
2. [Quickstart in 30 Seconds](#-quickstart-in-30-seconds)
3. [Showcase Campaigns](#-showcase-campaigns)
4. [Repository Architecture](#-repository-architecture)
5. [The Campaign File Format](#-the-campaign-file-format)
6. [Creating Your Own Campaign](#-creating-your-own-campaign)
7. [Programmatic API](#-programmatic-api)
8. [The Rust & WASM Core](#-the-rust--wasm-core)
9. [CLI & Scripts Reference](#-cli--scripts-reference)
10. [License & Attribution](#-license--attribution)

---

## 🌟 Key Features

- 🔒 **Local-First Basemap**: Built on local Natural Earth GeoJSON layers (`data/basemap/`). No Mapbox token, no API keys, no telemetry, and no accounts. The packages only fetch what you point them at on your own host: the basemap path and, if `load()` is given a URL, the campaign file. The demo app adds online extras on top: web fonts from Google Fonts, and hillshade/3D terrain from the public AWS Terrain Tiles bucket (on by default, toggled with the **3D terrain** button). The landing page (`/`) also loads Tailwind from its CDN.
- 📜 **Single Declarative JSON Contract**: One file encapsulates gazetteer data, temporal tracks, narrative chapters, citations, and multilingual copy.
- ⏳ **Honest Historical Time**: Built on an EDTF (ISO 8601-2) subset supporting date qualifiers (`?` uncertain, `~` approximate), date intervals, negative astronomical years (BCE), and sub-day precision.
- 🎯 **Rigorous Spatial Certainty**: Locations carry explicit certainty markers (`exact`, `approximate`, `conjectural`). Conjectural points render with grounded visual uncertainty circles.
- ⚡ **Deterministic Playback**: Identical inputs always produce identical output frames down to $10^{-6}$ float precision across both TypeScript and Rust cores.
- 🌐 **Multilingual Out of the Box**: All human-facing text supports language maps (e.g. English and Indonesian: `{ "en": "...", "id": "..." }`).
- 🎨 **Cartographic Elegance**: Custom parchment light and dark cartography, smooth camera flights, and dynamic DOM label decluttering.

---

## 🚀 Quickstart in 30 Seconds

### Prerequisites
- **Node.js** >= 20.0.0
- **npm** (included with Node)

### Installation & Launch

```bash
# 1. Clone and install dependencies
git clone https://github.com/PholidLabs/histamation.git
cd histamation
npm install

# 2. Build the TypeScript packages
npm run build

# 3. Start the local development server
npm run dev
```

Open the Vite URL printed in your terminal (typically `http://localhost:5173/`):
- **Landing Page (`/`)**: Explains the engine architecture, features, and historical context.
- **Interactive Scrollytelling App (`/app/`)**: Full-screen interactive map with chapter narrative, time slider, explore mode, language toggle (EN/ID), and theme selector.
- **Documentation (`/docs/`)**: Guides, reference and API docs in English and Indonesian, with search, an in-browser campaign validator, and a date tester.

### Run Tests & Validation

```bash
# Run engine unit tests and golden vector assertions
npm test

# Validate all shipped campaign JSON files against the schema and contract
npm run check

# After changing engine semantics: regenerate the golden vectors the Rust port is tested against
npm run vectors
```

CI (`.github/workflows/ci.yml`) runs all of the above plus the Rust suite on every push and pull request, and fails if `test-vectors/` no longer matches what the TypeScript engine produces.

---

## 🗺️ Showcase Campaigns

| Campaign | File | Key Highlights |
|---|---|---|
| **The Java War** *(1825–1830)* | [`data/campaigns/java-war-1825.json`](data/campaigns/java-war-1825.json) | 5 factions, 34 places, 9 dynamic entities, 43 events, 38 chapters. Bilingual Indonesian/English narrative based on Peter Carey's research. Demonstrates guerrilla warfare, ambushes, negotiations, and the colonial Dutch *Benteng Stelsel* fort lines. |
| **Napoleon's Invasion of Russia** *(1812)* | [`data/campaigns/napoleon-russia-1812.json`](data/campaigns/napoleon-russia-1812.json) | Classic campaign showing the Grande Armée's advance to Moscow and grueling winter retreat with Minard-style force strength counters. |
| **The Waterloo Campaign** *(1815)* | [`data/campaigns/waterloo-1815.json`](data/campaigns/waterloo-1815.json) | 3 factions, 16 places, 7 entities, 16 events, 8 chapters. Bilingual English/Indonesian narrative covering the Sambre crossing, Quatre-Bras, Ligny, the retreat in the mud, Hougoumont, Plancenoit, the defeat of the Imperial Guard, and Napoleon's final fall. |
| **The Austro-Prussian War** *(1866)* | [`data/campaigns/austro-prussian-1866.json`](data/campaigns/austro-prussian-1866.json) | 3 factions, 28 places, 8 entities, 16 events, 10 chapters. Bilingual English/Indonesian narrative covering the Seven Weeks' War: Moltke's railway mobilization, Trautenau, Náchod, the decisive clash of 450,000 men at Königgrätz (Sadowa), the race to the Danube, and Bismarck's peace of Nikolsburg. |
| **Null Island Fixture** | [`data/campaigns/fixtures/null-island.json`](data/campaigns/fixtures/null-island.json) | Synthetic test dataset designed to exercise edge cases, track interpolation, and diagnostic warnings (`W115`). |

---

## 📂 Repository Architecture

This repository is organized as an npm workspace with accompanying Rust crates:

```
histamation/
├── packages/
│   ├── engine/              # Headless TypeScript engine (pure logic, 0 DOM/map dependencies)
│   │   ├── src/time.ts      # EDTF parser, civil calendars, Gregorian tick conversions
│   │   ├── src/campaign.ts  # Loader, validator, structural & semantic diagnostics
│   │   ├── src/resolve.ts   # Frame resolution: entity tracks, bearing, event phases
│   │   ├── src/engine.ts    # State machine façade for interactive playback
│   │   └── src/cli.ts       # CLI tool for campaign linting and headless playback
│   └── maplibre/            # MapLibre GL visualization layer
│       ├── src/renderer.ts  # Map layers, SVG unit markers, dynamic label declutter
│       ├── src/camera.ts    # Smooth scroll-driven camera choreography
│       ├── src/style.ts     # Offline vector basemap generator (Natural Earth)
│       └── src/theme.ts     # Parchment Light and Dark historical map themes
├── apps/
│   └── demo/                # Multi-page Vite web application
│       ├── index.html       # Landing page (served at /)
│       ├── app/index.html   # Full scrollytelling application (served at /app/)
│       └── docs/            # Documentation site: Markdown content, rendered at build time (served at /docs/)
├── crates/
│   └── histamation-core/    # Port of the engine in pure Rust (compiled to WASM)
├── data/
│   ├── basemap/             # Simplified Natural Earth GeoJSON (land, lakes, rivers)
│   └── campaigns/           # Sample historical campaign JSON files
├── schema/
│   └── campaign.schema.json # JSON Schema (Draft 2020-12) for validation and IDE autocomplete
├── test-vectors/            # Golden output vectors enforcing TS/Rust parity
└── docs/
    ├── DATA-CONTRACT.md     # Normative specification of the Histamation data contract
    └── id/DATA-CONTRACT.md  # Indonesian translation (informative)
```

---

## 📜 The Campaign File Format

A campaign file is a single JSON document. Every object shares a single flat kebab-case ID namespace.

### Top-Level Anatomy

```jsonc
{
  "$schema": "../schema/campaign.schema.json",
  "histamation": "1.0",
  "meta": {
    "id": "java-war-1825",
    "title": { "en": "The Java War", "id": "Perang Diponegoro" },
    "description": { "en": "…", "id": "…" },
    "languages": ["en", "id"],
    "defaultLanguage": "en",
    "timeline": { "extent": "1785-11-11/1855-01-08", "focus": "1825-05/1830-10" },
    "map": { "center": [110.3, -7.65], "zoom": 8.5, "bounds": [104, -9.5, 126.5, 3] }
  },
  "factions": [
    { "id": "diponegoro", "name": { "en": "Diponegoro Forces" }, "color": "#8B1E1E" }
  ],
  "places": [
    { "id": "tegalrejo", "name": { "en": "Tegalrejo" }, "coordinates": [110.358, -7.784], "certainty": "exact" }
  ],
  "entities": [ ... ],
  "events": [ ... ],
  "chapters": [ ... ],
  "sources": [ ... ],
  "media": [ ... ]
}
```

### The 4 Core Primitives

| Concept | Has Time? | Has Geometry? | Purpose |
|---|---|---|---|
| **Place** | No | Point (`[lng, lat]`) | Named geographic reference. Places carry a `certainty` flag (`exact`, `approximate`, `conjectural`). Entities and events reference places by ID rather than duplicating coordinates. |
| **Entity** | Temporal Track | Track / Point / Polygon | Things that exist and evolve over time: armies (`unit`), forts (`fortification`), control zones (`territory`), or supply lines (`route`). Position, strength, status, and faction change across waypoints. |
| **Event** | Point / Interval | Optional Point | Discrete historical occurrences (e.g. `battle`, `skirmish`, `siege`, `treaty`, `arrest`). Events evaluate to `upcoming`, `active` (pulsing marker), or `past` (faded marker). |
| **Chapter** | Interval / Point | Camera Target & Focus | Story units that drive the user experience. As the user scrolls through a chapter, scroll progress $p \in [0, 1]$ drives the timeline clock and camera transitions. |

### The Time Model

Time is expressed as an EDTF (ISO 8601-2) string:
- `1825` — Year precision.
- `1825-07` — Month precision.
- `1825-07-20` — Day precision.
- `1830-03-28T10:00` — Minute precision.
- `1826-10-12~` — Approximate date.
- `1828-11-12?` — Uncertain date.
- `1825-07/1830-03` — Date interval.
- `1827/..` — Open-ended interval (active until the end of the campaign timeline).
- `-0043-03-15` — BCE astronomical year (44 BCE).

> [!NOTE]
> Internally, the engine operates on **signed 64-bit integer ticks** (seconds since `1970-01-01T00:00:00Z` in the proleptic Gregorian calendar). Historical dates before 1970 evaluate to negative integers.

---

## 🛠️ Creating Your Own Campaign

Creating a new interactive map requires **zero programming** — just a JSON file.

### Step 1: Initialize Your Campaign File

Create `my-campaign.json` and reference the JSON Schema for instant autocomplete in VS Code and other editors:

```json
{
  "$schema": "https://raw.githubusercontent.com/PholidLabs/histamation/main/schema/campaign.schema.json",
  "histamation": "1.0",
  "meta": {
    "id": "my-campaign",
    "title": "My Historical Campaign",
    "description": "A short summary shown on the title card.",
    "languages": ["en"],
    "defaultLanguage": "en",
    "timeline": { "extent": "1860-01/1865-12" },
    "map": { "center": [0.12, 51.5], "zoom": 4 }
  },
  "factions": [
    { "id": "allies", "name": "Allied Forces", "color": "#1F4E79" }
  ],
  "places": [
    { "id": "capital", "name": "Capital City", "coordinates": [0.12, 51.5], "certainty": "exact" }
  ],
  "entities": [],
  "events": [],
  "chapters": [
    {
      "id": "ch-01",
      "when": "1860-05-01",
      "title": "The Outbreak",
      "body": "Hostilities began in the early summer of 1860...",
      "focus": ["capital"],
      "camera": { "center": [0.12, 51.5], "zoom": 6 }
    }
  ]
}
```

### Step 2: Validate with the CLI

Run the campaign validator:

```bash
node packages/engine/dist/cli.js my-campaign.json
```

The validator detects both syntax violations and deep semantic errors:
- **Errors** (e.g. invalid date formats, broken place references, duplicate IDs).
- **Warnings** (e.g. impossible troop movement exceeding realistic speeds, backwards chapter chronology, missing translations).

To preview unit movements and active events across each chapter in your terminal:

```bash
node packages/engine/dist/cli.js my-campaign.json --frames
```

### Step 3: Instant Live Preview

Start the development server (`npm run dev`) and navigate to `http://localhost:5173/app/`.

**Simply drag and drop `my-campaign.json` onto the map.** The engine loads and plays your campaign instantly in your browser — no server restart or rebuild needed!

---

## 💻 Programmatic API

You can embed `@pholidlabs/histamation-engine` and `@pholidlabs/histamation-maplibre` into your own web applications.

### 1. Headless Engine (`@pholidlabs/histamation-engine`)

```typescript
import { loadCampaign, resolveFrame, HistamationEngine } from '@pholidlabs/histamation-engine';

// Load and validate campaign data
const rawData = await fetch('/campaigns/my-campaign.json').then(r => r.json());
const { campaign, diagnostics } = loadCampaign(rawData);

if (!campaign) {
  console.error('Validation errors:', diagnostics);
  return;
}

// Option A: Direct stateless frame resolution at a specific timestamp (ticks)
const tick = -4545036000; // Signed seconds relative to 1970
const frame = resolveFrame(campaign, tick);
console.log('Active units:', frame.entities);
console.log('Active events:', frame.events);

// Option B: stateful playback controller
const engine = new HistamationEngine({ language: 'en' });
engine.on('frame', (f) => {
  console.log(`Current date: ${f.iso}, visible units: ${f.entities.length}`);
});
await engine.load(rawData); // or a URL; a file with errors is rejected and the previous one kept

// Drive the clock by scroll progress through a chapter, or set a tick directly
engine.setStoryProgress('ch-01', 0.5); // 50% of the way through chapter ch-01
engine.setTime(tick);
```

### 2. MapLibre Renderer (`@pholidlabs/histamation-maplibre`)

```typescript
import { Map } from 'maplibre-gl';
import { createBasemapStyle, HistamationRenderer, CameraController, parchmentLight } from '@pholidlabs/histamation-maplibre';
import '@pholidlabs/histamation-maplibre/style.css';

const map = new Map({
  container: 'map-container',
  style: createBasemapStyle({ theme: parchmentLight, basemapPath: '/basemap' }),
  center: [110.3, -7.65],
  zoom: 7,
});

map.on('load', () => {
  const renderer = new HistamationRenderer(map, { theme: parchmentLight });
  const camera = new CameraController(map);

  renderer.setCampaign(campaign);

  // Wire frame updates to the map
  engine.on('frame', (frame) => {
    renderer.setFrame(frame);
  });
});
```

---

## 🦀 The Rust & WASM Core

The repository includes an exact Rust implementation of the engine logic in `crates/histamation-core`.

- **Strict Parity**: Every frame field and diagnostic code matches the TypeScript reference down to $10^{-6}$ float precision, enforced by golden test vectors in `test-vectors/`.
- **WASM Support**: Compiles to WebAssembly via `wasm-bindgen`.

### Rust Commands

```bash
cd crates/histamation-core

# Run native test suite against golden vectors
cargo test

# Also compile and test the optional `spatial` and `wasm` modules (what CI runs)
cargo test --all-features

# Build for WebAssembly
cargo build --features wasm
wasm-pack build --features wasm --target web
```

> [!TIP]
> **Performance Reality**: In our benchmarks, resolving a frame in TypeScript takes approximately **0.02 ms**, while map rendering takes ~**8 ms**. The rendering pipeline is the real performance boundary, not frame resolution. Compile to WASM when integrating with native/Rust runtimes or if scaling to exceptionally large datasets.

---

## ⌨️ CLI & Scripts Reference

### CLI Usage

```bash
node packages/engine/dist/cli.js <campaign.json>... [options]
```

| Flag | Description |
|---|---|
| `--frames` | Performs a dry-run playback through all chapters, printing active events and unit coordinates at scroll points $p \in \{0.0, 0.5, 1.0\}$. |
| `--strict` | Treats validation warnings as errors (exits with code 1). |
| `--quiet` | Suppresses non-error output. |
| `--json` | Outputs machine-readable JSON diagnostic reports. |
| `--vectors <dir>` | Writes golden vectors to `<dir>`: `time.json`, plus `<name>.frames.json` for each campaign given. Campaigns under a `fixtures/` directory get quarter-step sampling and full trails. |

### NPM Scripts

| Command | Action |
|---|---|
| `npm run build` | Builds `packages/engine` and `packages/maplibre`, copying the JSON Schema and CSS into their `dist/`. |
| `npm run build:engine` | Builds `packages/engine` only (used by `test` and `vectors`). |
| `npm run build:demo` | Runs full package build and builds the production web app in `apps/demo/dist`. |
| `npm run dev` | Launches the local Vite dev server with hot module reloading. |
| `npm run deploy` | Builds the demo and deploys `apps/demo/dist` to https://histamation.pholidlabs.com as a Cloudflare static-assets Worker (`wrangler.jsonc`; needs `wrangler login`). |
| `npm test` | Builds the engine and runs its tests, including the golden-vector checks and the docs invariants (every diagnostic documented, translation in step). |
| `npm run check` | Validates all campaigns in `data/campaigns/` using the CLI. |
| `npm run vectors` | Rebuilds the engine and regenerates `test-vectors/` from every campaign and fixture. |

---

## 📄 License & Attribution

- **Code**: Licensed under the [MIT License](LICENSE).
- **The Java War Dataset**: Licensed under [Creative Commons Attribution 4.0 International (CC-BY-4.0)](https://creativecommons.org/licenses/by/4.0/). Historical research based on the work of Peter Carey (*The Power of Prophecy: Prince Diponegoro and the End of an Old Order in Java, 1785–1855*).
- **Basemap Data**: Derived from [Natural Earth](https://www.naturalearthdata.com/) vector datasets (Public Domain).
