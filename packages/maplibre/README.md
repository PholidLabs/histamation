# @pholidlabs/chronomap-maplibre

[MapLibre GL](https://maplibre.org/) renderer for [ChronoMap](https://github.com/PholidLabs/chronomaps) campaigns: a parchment-style offline basemap, campaign layers driven by [`@pholidlabs/chronomap-engine`](https://github.com/PholidLabs/chronomaps/tree/main/packages/engine) frames, and chapter cameras.

Requires `maplibre-gl` 6 as a peer dependency.

## Usage

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

- `setCampaign` installs the static geometry once; `setFrame(frame, focusIds?)` only updates the small dynamic sources, so call it every frame.
- `CameraController.apply(chapter.camera)` moves to a chapter's camera; `fitFocus(campaign, chapter, frame)` frames the chapter's focus when it has no camera.
- Construct the renderer right after the map (or right after `map.setStyle()` on a theme change); it waits for the style itself.
- `destroy()` removes every marker and listener the renderer added.

Both the renderer and the camera honour `prefers-reduced-motion`; pass `reduceMotion` to override.

## The basemap is yours to serve

`createBasemapStyle` reads Natural Earth GeoJSON (land, lakes, rivers, peaks, places, forests, embellishments) from `basemapPath` (default `/basemap`). The files are not in this package: copy `data/basemap/` from the [repository](https://github.com/PholidLabs/chronomaps/tree/main/data/basemap) to your static root. No tile server or API key is involved.

`terrain` is optional and off by default; set it to a raster-DEM source (for example the public AWS Terrain Tiles) to enable 3D terrain, which does use the network.

## Bundling MapLibre 6

MapLibre 6 starts its worker with `new URL('./maplibre-gl-worker.mjs', import.meta.url)`, which bundlers do not follow. If the map renders blank with a 404 in the network tab, emit `maplibre-gl-worker.mjs` and `maplibre-gl-shared.mjs` next to your bundle and exclude `maplibre-gl` from dependency pre-bundling. `apps/demo/vite.config.ts` in the repository shows one way to do it with Vite.

## License

MIT. Basemap data derives from Natural Earth (public domain).
