---
title: "@pholidlabs/histamation-maplibre"
description: Renderer MapLibre GL — HistamationRenderer, CameraController, peta dasar parchment, dan tema.
group: api
order: 2
---

`@pholidlabs/histamation-maplibre` menggambar frame [`@pholidlabs/histamation-engine`](engine.md) di atas peta
[MapLibre GL](https://maplibre.org/): peta dasar bergaya parchment yang di-host sendiri, layer
kampanye yang digerakkan oleh `FrameState`, dan kamera bab. Paket ini membutuhkan `maplibre-gl`
**6** sebagai peer dependency.

```bash
npm install @pholidlabs/histamation-maplibre maplibre-gl
```

## Mulai cepat {#quick-start}

```ts
import { Map } from 'maplibre-gl';
import { HistamationEngine } from '@pholidlabs/histamation-engine';
import { createBasemapStyle, HistamationRenderer, CameraController, parchmentLight } from '@pholidlabs/histamation-maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@pholidlabs/histamation-maplibre/style.css';

const map = new Map({
  container: 'map',
  style: createBasemapStyle({ theme: parchmentLight, basemapPath: '/basemap' }),
  center: [110.3, -7.65],
  zoom: 7,
});
const renderer = new HistamationRenderer(map, { theme: parchmentLight, basemapPath: '/basemap', language: 'en' });
const camera = new CameraController(map);

const engine = new HistamationEngine();
engine.on('frame', (frame) => renderer.setFrame(frame));
await engine.load('/campaigns/java-war-1825.json');
renderer.setCampaign(engine.campaign!);
```

Baik renderer maupun `CameraController` menghormati `prefers-reduced-motion`; kirim
`reduceMotion` pada opsi salah satunya untuk menimpa media query tersebut.

## HistamationRenderer {#chrono-map-renderer}

```ts
class HistamationRenderer {
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
  maxStrengthBandMeters?: number;   // default 18000 — lebar maksimum band kekuatan gaya Minard
  avoidSelector?: string;           // default '[data-hm-avoid]' — obstacle keras untuk declutter label
  basemapPath?: string;             // default DEFAULT_BASEMAP_PATH, '/basemap'
  reduceMotion?: boolean;           // default false; selain itu mengikuti prefers-reduced-motion
}
```

`avoidSelector` menamai elemen-elemen yang tidak boleh ditimpa label — legenda, kartus, linimasa —
dicocokkan ke DOM dengan `document.querySelectorAll`. Label adalah elemen DOM, bukan glyph peta,
sehingga mesin collision milik MapLibre sendiri tidak pernah melihatnya; renderer menjalankan
pass declutter sendiri saat zoom dan move, dengan prioritas menurut kind (unit → peristiwa →
benteng → tempat) dan elemen `avoidSelector` ini sebagai obstacle keras.

### Kesiapan style {#style-readiness}

`map.setStyle()` bisa memicu `'style.load'` *sebelum ia return*, sementara
`map.isStyleLoaded()` masih `false` karena source milik style baru masih dimuat. Menunggu
`'style.load'` setelah titik itu akan menunggu selamanya, sehingga konstruktor
`HistamationRenderer` memeriksa `isStyleLoaded()` lebih dulu dan langsung install jika sudah
`true`; jika belum, ia mendengarkan **kedua** `'style.load'` dan `'idle'`, karena `'idle'`
selalu menyusul dan menjadi jaring pengaman. Bangun renderer tepat setelah peta, atau tepat
setelah pemanggilan `map.setStyle()` saat berganti tema — ia yang menunggu untuk kamu.

### setCampaign {#set-campaign}

```ts
setCampaign(campaign: NormalizedCampaign): void;
```

Memasang geometri **statis** kampanye: tempat, halo ketidakpastian, teritori, dan rute (kontrak
[§7.2](contract.md#sec-7-2)). Panggil sekali per kampanye yang termuat. Jika renderer belum
selesai memasang layernya (style peta masih dimuat), kampanye disimpan dan dibangun begitu
style siap. Memanggilnya lagi dengan kampanye baru lebih dulu menghapus semua marker yang
ditambahkan kampanye sebelumnya.

### setFrame {#set-frame}

```ts
setFrame(frame: FrameState, focus?: string[]): void;
```

Memperbarui hanya source **dinamis** yang kecil — posisi dan bearing pasukan serta jejaknya,
lingkaran peristiwa, warna kepemilikan teritori/rute — untuk `FrameState` yang diberikan.
Panggil ini pada **setiap** frame; ia tidak pernah menyentuh geometri statis yang dibangun
`setCampaign`, sehingga tetap murah berapa pun besar kampanyenya. `focus` adalah daftar `focus`
milik bab saat ini (ID entitas/peristiwa/tempat), dipakai untuk menggambar fitur-fitur itu
secara ditekankan; abaikan (atau kirim `[]`) di luar mode cerita.

> [!WARNING]
> Jangan pernah memanggil `setCampaign` dengan kadensi per-frame, dan jangan pernah mengambil
> ulang atau menetapkan ulang seluruh source GeoJSON per frame — itu memaksa MapLibre
> me-retile dan justru itulah yang menjatuhkan frame. Geometri statis lewat `setCampaign`
> sekali saja; hanya nilai kecil per-frame milik `setFrame` yang berubah setelah itu.

### setLanguage {#renderer-set-language}

```ts
setLanguage(lang: string): void;
```

Mengubah bahasa tampilan dan membangun ulang layer statis sehingga label tempat, pasukan, dan
teritori dirender ulang dalam bahasa baru (tidak melakukan apa-apa jika belum ada kampanye yang
ditetapkan).

### destroy {#renderer-destroy}

```ts
destroy(): void;
```

Menghapus setiap marker dan listener yang ditambahkan renderer ke peta — marker piktorial
(puncak gunung, hutan, hiasan), label tempat, marker pasukan dan peristiwa, listener zoom/move,
dan listener kesiapan-style yang masih menunggu. Renderer menjadi inert; bangun yang baru untuk
peta baru atau pembongkaran penuh.

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
  reduceMotion?: boolean; // default: membaca `matchMedia('(prefers-reduced-motion: reduce)')`
  padding?: number;       // default 90 — padding px untuk fitBounds milik fitFocus
}
```

### apply {#camera-apply}

```ts
apply(camera: Camera): void;
```

Menggerakkan peta ke `camera` milik sebuah bab (`{ center, zoom, pitch?, bearing?, durationMs?, transition? }`,
kontrak [§6.2](contract.md#sec-6-2)). `transition` memilih `flyTo` (default, `'fly'`, curve
`1.42`), `easeTo` (`'ease'`), atau `jumpTo` instan (`'jump'`); `durationMs` default `2200`.
`reduceMotion` — baik opsi konstruktor maupun kecocokan `prefers-reduced-motion` langsung —
memaksa `jumpTo` apa pun `transition`-nya, begitu pula `durationMs` bernilai `0` atau kurang.

```ts
const camera = new CameraController(map);
camera.apply(chapter.camera!);
```

### fitFocus {#camera-fit-focus}

```ts
fitFocus(campaign: NormalizedCampaign, chapter: NormChapter, frame: FrameState | null): void;
```

Membingkai ID `focus` milik sebuah bab saat bab itu tidak punya `camera` sendiri (kontrak
[§6.2](contract.md#sec-6-2)): mengumpulkan koordinat setiap tempat yang difokuskan, koordinat
peristiwa, atau posisi entitas (pasukan yang bergerak menyumbangkan posisi **saat ini** dari
`frame`, jatuh kembali ke setiap waypoint track jika `frame` tidak punya entri hidup untuknya),
lalu `fitBounds` ke kotak pembatas gabungannya dengan `padding`, mempertahankan pitch peta saat
ini. Fokus satu-titik terbang ke titik itu pada zoom `max(zoom saat ini, 11)` alih-alih
menyesuaikan kotak yang degenerate. Daftar `focus` yang tidak me-resolve ke koordinat apa pun
tidak melakukan apa-apa — kamera tetap di tempatnya.

```ts
if (chapter.camera) camera.apply(chapter.camera);
else camera.fitFocus(engine.campaign!, chapter, engine.frame);
```

## Peta dasar {#basemap}

### createBasemapStyle dan BasemapOptions {#create-basemap-style}

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

Membangun `StyleSpecification` MapLibre yang utuh: laut, daratan, riak tinta pesisir, danau,
sungai, puncak gunung, titik tempat, dan graticule derajat berpita-zoom, semuanya diwarnai dari
`theme`. Style ini tidak mendeklarasikan glyph atau sprite — setiap label di renderer ini adalah
elemen DOM, bukan layer simbol peta, sehingga style tidak perlu memuat aset font atau ikon biner
apa pun.

```ts
import { createBasemapStyle, parchmentDark } from '@pholidlabs/histamation-maplibre';

const style = createBasemapStyle({ theme: parchmentDark, basemapPath: '/basemap' });
```

### DEFAULT_BASEMAP_PATH {#default-basemap-path}

```ts
const DEFAULT_BASEMAP_PATH = '/basemap';
```

Folder tempat `createBasemapStyle` dan `HistamationRenderer` sama-sama membaca GeoJSON peta dasar
kecuali diberi tahu sebaliknya — keduanya berbagi default ini sehingga satu opsi `basemapPath`
mencakup keduanya.

### Terrain {#terrain}

`terrain` bernilai `undefined` secara default: tanpa source terrain, tanpa akses jaringan. Kirim
deskriptor `raster-dem` (misalnya [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/)
yang publik) untuk menambahkan layer `hillshade` dan eksagerasi terrain 3D; inilah satu-satunya
bagian dari peta dasar yang menyentuh jaringan.

```ts
createBasemapStyle({
  theme: parchmentLight,
  terrain: { tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], encoding: 'terrarium' },
});
```

### Meng-host data peta dasar {#hosting-basemap}

Baik `createBasemapStyle` maupun pemuat label piktorial renderer sama-sama mengambil
`land.geojson`, `lakes.geojson`, `rivers.geojson`, `peaks.geojson`, `places.geojson`,
`forests.geojson`, dan `embellishments.geojson` dari `basemapPath`. Berkas-berkas ini tersedia
di repo pada [`data/basemap/`](gh:data/basemap) tetapi tidak ikut di dalam paket npm — salin
folder itu ke static root milikmu sendiri (`apps/demo/vite.config.ts` menyajikan folder `data/`
milik repo sebagai `publicDir`-nya, sehingga `/basemap/*.geojson` langsung ter-resolve gratis di
demo repo ini). Tidak ada tile server atau API key yang terlibat.

### graticuleFor {#graticule-for}

```ts
function graticuleFor(
  bounds: { west: number; south: number; east: number; north: number },
  opts?: { padFraction?: number; minPadDeg?: number; budget?: number },
): FeatureCollection;
```

Membangun `FeatureCollection` grid derajat statis untuk bounds sebuah kampanye, dihasilkan
**sekali** (tidak pernah saat `moveend` — graticule yang dibuat ulang setiap gerakan kamera
meninggalkan sisa persegi grid basi di layar selama penerbangan kamera). `bounds` diberi
padding sebesar `padFraction` dari ukurannya (default `0.75`, minimal `minPadDeg` derajat,
default `8`) sehingga menjauh (pan out) tidak pernah menampakkan tepi grid, lalu step terhalus
dari daftar kasar-ke-halus tetap dipilih selama jumlah garisnya di bawah `budget` (default
`3000`). `HistamationRenderer` memanggil ini sendiri dari extent kampanye; panggil langsung hanya
untuk membangun style peta dasar kustom di sekitar grid yang sama.

## Tema {#themes}

Berkas kampanye tidak membawa properti pewarnaan (kontrak [§1](contract.md#sec-1)) — tema-lah
yang mengubah `kind`, `status`, dan warna faksi menjadi tampilan sesungguhnya.

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

### parchmentLight dan parchmentDark {#parchment-themes}

```ts
const parchmentLight: ChronoTheme; // name 'parchment-sepia', dark: false
const parchmentDark: ChronoTheme;  // name 'parchment-sepia-dark', dark: true
```

Dua tema bawaan: tampilan parchment sepia untuk mode terang, dan padanannya untuk dasar gelap.
Keduanya menyediakan setiap field `ChronoTheme` di atas; tulis objek tema ketiga dengan bentuk
yang sama untuk menambah tampilan lain.

### factionColor dan withAlpha {#faction-color}

```ts
function factionColor(hex: string, theme: ChronoTheme): string; // rgb(r, g, b)
function withAlpha(rgb: string, a: number): string;              // rgba(r, g, b, a)
```

`factionColor` membaca `color` milik faksi dari data dan, pada tema `dark`, mengangkat warna
yang terlalu redup (luminansi relatif di bawah `0.55`) ke arah putih supaya kedua belah pihak
tetap terbaca di atas dasar gelap; pada tema terang, warna diteruskan tanpa perubahan.
`withAlpha` mengubah string `rgb(…)` itu menjadi `rgba(…, a)` untuk halo, fill, dan gaya
"past" yang memudar.

```ts
import { factionColor, withAlpha, parchmentDark } from '@pholidlabs/histamation-maplibre';

const color = factionColor(faction.color, parchmentDark); // mis. 'rgb(198, 168, 122)'
const faded = withAlpha(color, 0.35);                       // 'rgba(198, 168, 122, 0.35)'
```

## Stylesheet {#stylesheet}

```ts
import '@pholidlabs/histamation-maplibre/style.css';
```

CSS untuk marker dan label DOM milik renderer (`packages/maplibre/src/histamation.css`, diekspor
sebagai `./style.css`). Import sekali berdampingan dengan `maplibre-gl/dist/maplibre-gl.css`;
tanpanya, label berbasis DOM dan marker piktorial dirender tanpa gaya.

## Bundling MapLibre 6 {#bundling-maplibre}

MapLibre 6 menjalankan worker-nya dengan `new URL('./maplibre-gl-worker.mjs', import.meta.url)`,
pola yang tidak bisa diikuti secara statis oleh kebanyakan bundler. Jika peta tampil kosong
dengan 404 di tab network dan tanpa galat di console, berarti chunk worker itu (beserta chunk
bersamanya, `maplibre-gl-shared.mjs`) tidak ikut masuk ke build. Perbaiki dengan memancarkan
kedua berkas itu di samping bundle-mu secara manual dan mengecualikan `maplibre-gl` dari
pre-bundling dependency saat dev. [`apps/demo/vite.config.ts`](gh:apps/demo/vite.config.ts)
milik repo ini melakukan persis itu: hook `generateBundle` menyalin
`maplibre-gl/dist/maplibre-gl-worker.mjs` dan `maplibre-gl-shared.mjs` ke `assets/`, dan
`optimizeDeps.exclude: ['maplibre-gl']` menjaga paket ini tetap unbundled saat dev sehingga URL
relatif worker-nya tetap ter-resolve.

## Aturan per-frame {#per-frame-rule}

Geometri statis — tempat, halo, teritori, rute, graticule, marker piktorial — dipasang
**sekali** di [`setCampaign`](#set-campaign). [`setFrame`](#set-frame) hanya menyentuh source
dinamis yang kecil: posisi/bearing/kekuatan pasukan, progres jejak, warna status dan
kepemilikan, fase dan progres peristiwa. Jangan pernah men-stream seluruh payload GeoJSON
setiap frame; memanggil `setData()` pada source besar memaksa MapLibre me-retile-nya, dan
itulah yang menjatuhkan frame saat scroll atau kecepatan pemutaran (kontrak
[§7.2](contract.md#sec-7-2)).
