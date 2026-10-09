# Histamation Engine — notes for Claude Code

## Ground rules

- `docs/DATA-CONTRACT.md` is normative. Where the PRD and the contract disagree about
  data, time or engine interaction, the contract wins (see its §11–12).
- `packages/engine/src` is the executable spec. `crates/histamation-core` is a port of it,
  not a second opinion. If you change semantics, change the TypeScript first, regenerate
  the vectors (`npm run vectors` — it rebuilds the engine and rewrites every file in
  `test-vectors/`), then make Rust match. CI fails if the committed vectors are stale.
- Time is `i64` seconds since 1970-01-01 in proleptic Gregorian, and is negative for every
  campaign in the repo. Never `u64`. Never pass a raw `When` string to `Date`.
- Chapter bodies are untrusted Markdown. Render with the allow-list renderer in
  `apps/demo/src/dom.ts`; never assign a raw string to `innerHTML`.

## Before you commit

```
npm run build && npm test          # engine tests, golden vectors, docs invariants included
npm run check                      # every campaign: 0 errors
npx tsc --noEmit -p apps/demo/tsconfig.json   # Vite strips types; nothing else checks the demo
cd crates/histamation-core && cargo test --all-features   # without the flag, wasm.rs and spatial.rs never compile
```

`.github/workflows/ci.yml` runs this list plus `cargo fmt --check`, `cargo clippy -D warnings`,
`npm run build:demo` and a stale-vectors check on every push and pull request.

The only expected warning is `W115` on `data/campaigns/fixtures/null-island.json` — that
fixture deliberately overlaps two chapters to exercise the check.

## Layout

```
packages/engine      time.ts · campaign.ts (loader + diagnostics) · resolve.ts · engine.ts (façade)
                     cli.ts (histamation-check) · vectors.ts (writes test-vectors/ for --vectors)
                     worker.ts + worker-client.ts — the seam the Rust/WASM core slots into;
                     the client coalesces queries (a replaced one resolves null, never sent)
packages/maplibre    style.ts (basemap) · camera.ts · renderer.ts · theme.ts · histamation.css
apps/demo            index.html (landing) + app/index.html (the map app, served at /app/)
                     + docs/index.html (template for the docs at /docs/<lang>/<slug>/)
                     icons/ — favicon.svg, apple-touch, PWA icons, og.png, manifest
                     main.ts (app wiring) · landing.ts + landing-copy.ts (bilingual prose)
                     prefs.ts (theme + language, shared by all pages) · icons.ts · tokens.css (palette)
                     dom.ts (safe Markdown, popups, svgEl) · i18n.ts
                     docs/site.ts (Node: Markdown → HTML, link check) · docs/content/{en,id}/*.md
                     docs/diagnostics.json · src/docs/ (docs client, validator, date tester)
crates/histamation-core  time.rs · campaign.rs · resolve.rs · model.rs · wasm.rs · spatial.rs
```

Vite aliases `@pholidlabs/histamation-engine` and `@pholidlabs/histamation-maplibre` to the packages' **source**, so
the demo picks up edits without a package rebuild. `npm run check` uses the built
`packages/engine/dist`, so run `npm run build` after touching the engine.

## Things that will bite you

- **MapLibre worker.** v6 spawns its worker via `new URL('./maplibre-gl-worker.mjs',
  import.meta.url)`, which the bundler cannot see. `apps/demo/vite.config.ts` emits that
  file and `maplibre-gl-shared.mjs` into `dist/assets/` by hand, with
  `optimizeDeps.exclude: ['maplibre-gl']`. Remove either and the map renders blank with a
  404 in the network tab and no error in the console.
- **Zoom in paint expressions.** `['zoom']` is only legal as the direct input of a
  top-level `step`/`interpolate`. The Minard strength band therefore uses one clamped stop
  per integer zoom instead of wrapping the interpolation in `min`/`max`.
- **The graticule is static.** It is generated once per campaign over padded campaign
  bounds and banded by layer `minzoom`. Regenerating it on `moveend` left a rectangle of
  stale grid on screen during camera flights.
- **Labels are DOM, not glyphs**, so MapLibre's collision engine never sees them.
  `renderer.declutter()` does it: priority by kind (unit → event → fort → place), focus is
  only a tie-break *within* a kind, symbols displace place names only, and elements marked
  `data-hm-avoid` (legend, cartouche, timeline) are hard obstacles.
- **Site icons are not in publicDir.** publicDir is the repo's `data/` folder, so the
  favicon, apple-touch icon, manifest and social card live in `apps/demo/icons/` and are
  put at the site root by the `siteIcons()` plugin — a dev middleware plus `emitFile` on
  build, the same trick as the MapLibre worker assets. Drop a file in that folder and it
  is served at `/<name>`; no other wiring needed.
- **The favicon is hand-drawn, not the logo.** `icons/logo.jpeg` (the only copy; the
  README shows it too) scaled to 16px is a smudge — its 5x5 graticule and terminal dot
  vanish. `icons/favicon.svg` redraws the same idea at tab-legible weights (2x2 grid,
  heavier route). The raster icons *are* the real logo, cropped to drop its dead margin.
  Change one and change the other to match.
- **Three pages, three Vite inputs.** `apps/demo` is a multi-page build: the landing at `/`,
  the map app at `/app/` and the docs template at `/docs/`. All are declared in
  `build.rollupOptions.input` in `apps/demo/vite.config.ts`. Add a page without adding it
  there and it will work in `dev` but silently vanish from `dist`.
- **Docs pages are stamped, not inputs.** `docsSite()` in `vite.config.ts` renders every
  `docs/content/<lang>/<slug>.md` (plus `docs/DATA-CONTRACT.md` and its Indonesian
  translation `docs/id/DATA-CONTRACT.md`) into the processed `docs/index.html` at build
  time, and per request in dev. A new page needs no wiring, but it must exist in both
  languages with the same `{#id}` heading anchors, and a broken internal link, `gh:` repo
  path or heading anchor fails the build (dev shows the list in a red banner). Link
  conventions are in the header of `docs/site.ts`.
- **Docs follow the code.** A new diagnostic code needs an entry in
  `apps/demo/docs/diagnostics.json`, and a contract change needs the same section in
  `docs/id/DATA-CONTRACT.md`; `apps/demo/test/docs.test.js` fails otherwise. English is
  the normative contract; the Indonesian file is an informative translation.
- **Per-frame updates only.** Static geometry is installed once in `setCampaign`;
  `setFrame` touches only the small dynamic sources. Never stream GeoJSON every frame.
- **Style readiness after `setStyle`.** `map.setStyle()` can fire `style.load` *before it
  returns*, while `isStyleLoaded()` is still false because sources are loading. So
  `if (!map.isStyleLoaded()) map.once('style.load', …)` after a `setStyle` waits forever —
  that left the map empty after every theme toggle. Use `idle` as the backstop, as
  `HistamationRenderer`'s constructor and `setTerrainEnabled` do. The renderer installs
  itself; the host just constructs it right after `setStyle`.
- **Pictorial markers are clickable; labels are not.** Peaks, forests and sea ornaments
  are DOM markers that open their own popup (`bindPictorialPopup` in `renderer.ts`), so
  their CSS sets no `pointer-events` and inherits the canvas container's: clickable in
  explore mode, inert in story mode. Add `pointer-events: none` to them and the popups
  silently die. Their feature properties reach the DOM through `textContent` only. They
  belong to the basemap, so `setCampaign` keeps them; only `destroy` removes them.
- **A loaded campaign is immutable.** `resolve.ts` caches leg lengths and strength knots
  in `WeakMap`s keyed by the leg/track arrays, so mutating a `NormalizedCampaign` after
  `loadCampaign` returns stale positions. Build a new campaign instead.

## Data work

Validate before committing any campaign edit:

```
node packages/engine/dist/cli.js data/campaigns/java-war-1825.json
```

IDs are one flat namespace — an entity may not share an ID with a place or an event.
Conjectural positions must say so (`"certainty": "conjectural"`) rather than being quietly
precise; the renderer draws the uncertainty as a real circle on the ground.
