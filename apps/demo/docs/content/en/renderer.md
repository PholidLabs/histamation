---
title: "@pholidlabs/chronomap-maplibre"
description: The MapLibre GL renderer — ChronoMapRenderer, CameraController, the parchment basemap, and themes.
group: api
order: 2
---

`@pholidlabs/chronomap-maplibre` draws [`@pholidlabs/chronomap-engine`](engine.md) frames on a [MapLibre GL](https://maplibre.org/)
map: a self-hosted parchment-style basemap, campaign layers driven by `FrameState`, and chapter
cameras. It requires `maplibre-gl` **6** as a peer dependency.

```bash
npm install @pholidlabs/chronomap-maplibre maplibre-gl
```

## Quick start {#quick-start}

```ts
import { Map } from 'maplibre-gl';
import { ChronoMapEngine } from '@pholidlabs/chronomap-engine';
import { createBasemapStyle, ChronoMapRenderer, CameraController, parchmentLight } from '@pholidlabs/chronomap-maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@pholidlabs/chronomap-maplibre/style.css';

const map = new Map({
  container: 'map',
  style: createBasemapStyle({ theme: parchmentLight, basemapPath: '/basemap' }),
  center: [110.3, -7.65],
  zoom: 7,
});
const renderer = new ChronoMapRenderer(map, { theme: parchmentLight, basemapPath: '/basemap', language: 'en' });
const camera = new CameraController(map);

const engine = new ChronoMapEngine();
engine.on('frame', (frame) => renderer.setFrame(frame));
await engine.load('/campaigns/java-war-1825.json');
renderer.setCampaign(engine.campaign!);
```

Both the renderer and `CameraController` honour `prefers-reduced-motion`; pass `reduceMotion` to
either one's options to override the media query.

## ChronoMapRenderer {#chrono-map-renderer}

```ts
class ChronoMapRenderer {
  constructor(map: MapLibreMap, opts?: RendererOptions);
  setCampaign(campaign: NormalizedCampaign): void;
  setFrame(frame: FrameState, focus?: string[]): void;
  setLanguage(lang: string): void;
  destroy(): void;
}
```

### RendererOptions {#renderer-options}

```ts
interface RendererOptions {
  theme?: ChronoTheme;              // default parchmentLight
  language?: string;                // default 'en'
  maxStrengthBandMeters?: number;   // default 18000 — the widest a Minard-style strength band draws
  avoidSelector?: string;           // default '[data-cm-avoid]' — hard obstacles for label declutter
  basemapPath?: string;             // default DEFAULT_BASEMAP_PATH, '/basemap'
  reduceMotion?: boolean;           // default false; otherwise follows prefers-reduced-motion
}
```

`avoidSelector` names the elements labels must not sit under — legend, cartouche, timeline —
matched against the DOM with `document.querySelectorAll`. Labels are DOM elements, not map
glyphs, so MapLibre's own collision engine never sees them; the renderer runs its own
declutter pass on zoom and move, with priority by kind (unit → event → fort → place) and these
`avoidSelector` elements as hard obstacles.

### Style readiness {#style-readiness}

`map.setStyle()` can fire `'style.load'` *before it returns*, while `map.isStyleLoaded()` is
still `false` because the new style's sources are still loading. Waiting on `'style.load'` after
that point waits forever, so `ChronoMapRenderer`'s constructor checks `isStyleLoaded()` first and
installs immediately if it is already true; otherwise it listens for **both** `'style.load'` and
`'idle'`, since `'idle'` always follows and is the backstop. Construct the renderer right after
the map, or right after a `map.setStyle()` call on a theme change — it does the waiting for you.

### setCampaign {#set-campaign}

```ts
setCampaign(campaign: NormalizedCampaign): void;
```

Installs the campaign's **static** geometry: places, uncertainty halos, territories and routes
(contract [§7.2](contract.md#sec-7-2)). Call it once per loaded campaign. If the renderer has
not finished installing its layers yet (the map's style was still loading), the campaign is
stored and built as soon as the style becomes ready. Calling it again with a new campaign
clears every marker the previous one added first.

### setFrame {#set-frame}

```ts
setFrame(frame: FrameState, focus?: string[]): void;
```

Updates only the small **dynamic** sources — unit positions, bearings and trails, event circles,
territory/route ownership tint — for the given `FrameState`. Call this on **every** frame; it
never touches the static geometry `setCampaign` built, so it stays cheap regardless of campaign
size. `focus` is the current chapter's `focus` list (entity/event/place IDs), used to draw those
features emphasized; omit it (or pass `[]`) outside story mode.

> [!WARNING]
> Never call `setCampaign` on a per-frame cadence, and never re-fetch or re-set a whole GeoJSON
> source per frame — that forces MapLibre to re-tile and is exactly what drops frames. Static
> geometry goes through `setCampaign` once; only `setFrame`'s small per-frame values change
> after that.

### setLanguage {#renderer-set-language}

```ts
setLanguage(lang: string): void;
```

Changes the display language and rebuilds the static layers so place, unit and territory labels
re-render in the new language (a no-op if no campaign has been set yet).

### destroy {#renderer-destroy}

```ts
destroy(): void;
```

Removes every marker and listener the renderer added to the map — pictorial markers (peaks,
forests, embellishments), place labels, unit and event markers, the zoom/move listeners, and any
pending style-readiness listeners. The renderer becomes inert; construct a new one for a new map
or a full teardown.

## CameraController {#camera-controller}

```ts
class CameraController {
  constructor(map: MapLibreMap, opts?: CameraOptions);
  readonly reduceMotion: boolean;
  apply(camera: Camera): void;
  fitFocus(campaign: NormalizedCampaign, chapter: NormChapter, frame: FrameState | null): void;
}
```

### CameraOptions {#camera-options}

```ts
interface CameraOptions {
  reduceMotion?: boolean; // default: reads `matchMedia('(prefers-reduced-motion: reduce)')`
  padding?: number;       // default 90 — px padding for fitFocus's fitBounds
}
```

### apply {#camera-apply}

```ts
apply(camera: Camera): void;
```

Moves the map to a chapter's `camera` (`{ center, zoom, pitch?, bearing?, durationMs?, transition? }`,
contract [§6.2](contract.md#sec-6-2)). `transition` selects `flyTo` (default, `'fly'`, curve
`1.42`), `easeTo` (`'ease'`), or an instant `jumpTo` (`'jump'`); `durationMs` defaults to `2200`.
`reduceMotion` — either the constructor option or a live `prefers-reduced-motion` match — forces
`jumpTo` regardless of `transition`, as does a `durationMs` of `0` or less.

```ts
const camera = new CameraController(map);
camera.apply(chapter.camera!);
```

### fitFocus {#camera-fit-focus}

```ts
fitFocus(campaign: NormalizedCampaign, chapter: NormChapter, frame: FrameState | null): void;
```

Frames a chapter's `focus` IDs when it has no `camera` of its own (contract
[§6.2](contract.md#sec-6-2)): collects each focused place's coordinate, event's coordinate, or
entity's position (a moving unit contributes its **current** position from `frame`, falling back
to every track waypoint if `frame` has no live entry for it), then `fitBounds` to their bounding
box with `padding`, keeping the map's current pitch. A single-point focus flies to that point at
zoom `max(current zoom, 11)` instead of fitting a degenerate box. A `focus` list that resolves
to no coordinates at all is a no-op — the camera stays where it is.

```ts
if (chapter.camera) camera.apply(chapter.camera);
else camera.fitFocus(engine.campaign!, chapter, engine.frame);
```

## The basemap {#basemap}

### createBasemapStyle and BasemapOptions {#create-basemap-style}

```ts
function createBasemapStyle(opts: BasemapOptions): StyleSpecification;

interface BasemapOptions {
  basemapPath?: string;   // default DEFAULT_BASEMAP_PATH, '/basemap'
  theme: ChronoTheme;
  terrain?: {
    tiles: string[]; encoding?: 'terrarium' | 'mapbox';
    tileSize?: number; exaggeration?: number; attribution?: string;
  };
}
```

Builds a full MapLibre `StyleSpecification`: sea, land, coastal ink ripples, lakes, rivers,
mountain peaks, place dots and a zoom-banded degree graticule, all painted from `theme`. It
declares no glyphs or sprite — every label in this renderer is a DOM element, not a map symbol
layer, so the style needs no binary font or icon assets to load.

```ts
import { createBasemapStyle, parchmentDark } from '@pholidlabs/chronomap-maplibre';

const style = createBasemapStyle({ theme: parchmentDark, basemapPath: '/basemap' });
```

### DEFAULT_BASEMAP_PATH {#default-basemap-path}

```ts
const DEFAULT_BASEMAP_PATH = '/basemap';
```

The folder both `createBasemapStyle` and `ChronoMapRenderer` read basemap GeoJSON from unless
told otherwise — they share this default so one `basemapPath` option covers both.

### Terrain {#terrain}

`terrain` is `undefined` by default: no terrain source, no network access. Pass a `raster-dem`
descriptor (for example public [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/))
to add a `hillshade` layer and 3D terrain exaggeration; this is the only part of the basemap that
touches the network.

```ts
createBasemapStyle({
  theme: parchmentLight,
  terrain: { tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], encoding: 'terrarium' },
});
```

### Hosting the basemap data {#hosting-basemap}

`createBasemapStyle` and the renderer's pictorial-label loader both fetch `land.geojson`,
`lakes.geojson`, `rivers.geojson`, `peaks.geojson`, `places.geojson`, `forests.geojson` and
`embellishments.geojson` from `basemapPath`. These files ship in the repository at
[`data/basemap/`](gh:data/basemap) but not inside the npm package — copy that folder to your own
static root (`apps/demo/vite.config.ts` serves the repo's `data/` folder as its `publicDir`, so
`/basemap/*.geojson` resolves for free in this repo's own demo). No tile server or API key is
involved.

### graticuleFor {#graticule-for}

```ts
function graticuleFor(
  bounds: { west: number; south: number; east: number; north: number },
  opts?: { padFraction?: number; minPadDeg?: number; budget?: number },
): FeatureCollection;
```

Builds the static degree-grid `FeatureCollection` for a campaign's bounds, generated **once**
(never on `moveend` — a regenerate-on-camera-move graticule leaves a stale rectangle of grid on
screen during a fly). `bounds` is padded by `padFraction` of its size (default `0.75`, at least
`minPadDeg` degrees, default `8`) so panning out never reveals the grid's edge, then the finest
step from a fixed coarse-to-fine list is chosen that keeps the line count under `budget` (default
`3000`). `ChronoMapRenderer` calls this itself from the campaign's extent; call it directly only
to build a custom basemap style around the same grid.

## Themes {#themes}

Campaign files carry no paint properties (contract [§1](contract.md#sec-1)) — themes are what
turn `kind`, `status` and faction color into an actual look.

### ChronoTheme {#chrono-theme}

```ts
interface ChronoTheme {
  name: string; dark: boolean;
  sea: string; land: string; coast: string; coastOuter: string;
  coastRipple1: string; coastRipple2: string; coastRipple3: string;
  river: string; lake: string;
  ink: string; inkSoft: string; inkFaint: string; grid: string; halo: string;
  event: string; eventPast: string;
  peak: string; mountainStroke: string; mountainHatch: string; mountainFill: string;
  treeStroke: string; treeCanopy: string;
  watermark: string;
  hillshadeShadow: string; hillshadeHighlight: string;
  cityDot: string; cityRing: string;
}
```

### parchmentLight and parchmentDark {#parchment-themes}

```ts
const parchmentLight: ChronoTheme; // name 'parchment-sepia', dark: false
const parchmentDark: ChronoTheme;  // name 'parchment-sepia-dark', dark: true
```

The two built-in themes: a sepia parchment look for light mode, and its dark-ground counterpart.
Both ship every `ChronoTheme` field above; write a third theme object with the same shape to add
another look.

### factionColor and withAlpha {#faction-color}

```ts
function factionColor(hex: string, theme: ChronoTheme): string; // rgb(r, g, b)
function withAlpha(rgb: string, a: number): string;              // rgba(r, g, b, a)
```

`factionColor` reads a faction's `color` from the data and, on a `dark` theme, lifts colors that
are too dim (relative luminance under `0.55`) toward white so both sides stay readable against a
dark ground; on a light theme the color passes through unchanged. `withAlpha` turns that `rgb(…)`
string into `rgba(…, a)` for halos, fills and faded "past" styling.

```ts
import { factionColor, withAlpha, parchmentDark } from '@pholidlabs/chronomap-maplibre';

const color = factionColor(faction.color, parchmentDark); // e.g. 'rgb(198, 168, 122)'
const faded = withAlpha(color, 0.35);                       // 'rgba(198, 168, 122, 0.35)'
```

## Stylesheet {#stylesheet}

```ts
import '@pholidlabs/chronomap-maplibre/style.css';
```

CSS for the renderer's DOM markers and labels (`packages/maplibre/src/chronomap.css`, exported
as `./style.css`). Import it once alongside `maplibre-gl/dist/maplibre-gl.css`; without it the
DOM-based labels and pictorial markers render unstyled.

## Bundling MapLibre 6 {#bundling-maplibre}

MapLibre 6 starts its worker with `new URL('./maplibre-gl-worker.mjs', import.meta.url)`, a
pattern most bundlers cannot statically follow. If the map renders blank with a 404 in the
network tab and no console error, that worker chunk (and its shared chunk,
`maplibre-gl-shared.mjs`) never made it into the build. Fix it by emitting both files next to
your bundle by hand and excluding `maplibre-gl` from dependency pre-bundling in dev. This
repository's own [`apps/demo/vite.config.ts`](gh:apps/demo/vite.config.ts) does exactly that:
a `generateBundle` hook copies `maplibre-gl/dist/maplibre-gl-worker.mjs` and
`maplibre-gl-shared.mjs` into `assets/`, and `optimizeDeps.exclude: ['maplibre-gl']` keeps the
package unbundled in dev so the worker's relative URL still resolves.

## The per-frame rule {#per-frame-rule}

Static geometry — places, halos, territories, routes, the graticule, pictorial markers — is
installed **once** in [`setCampaign`](#set-campaign). [`setFrame`](#set-frame) touches only the
small dynamic sources: unit position/bearing/strength, trail progress, status and owner tint,
event phase and progress. Never stream a whole GeoJSON payload every frame; calling `setData()`
on a large source forces MapLibre to re-tile it, which is what drops frames at scroll or
playback speed (contract [§7.2](contract.md#sec-7-2)).
