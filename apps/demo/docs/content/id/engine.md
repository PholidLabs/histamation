---
title: "@pholidlabs/histamation-engine"
description: API engine tanpa antarmuka — tick, pemuatan, resolusi frame, pemutaran, klien worker, serta pemformatan waktu dan teks.
group: api
order: 1
---

`@pholidlabs/histamation-engine` mem-parsing, memvalidasi, dan me-resolve berkas kampanye Histamation menjadi
frame per-instan. Paket ini tidak menyentuh DOM maupun pustaka peta; [`@pholidlabs/histamation-maplibre`](renderer.md)
membaca keluarannya. Paket ini adalah referensi eksekutabel untuk [kontrak data](contract.md) —
port Rust di `crates/histamation-core` diuji terhadap vektor yang dihasilkan paket ini (lihat
[histamation-core](rust-wasm.md)).

```bash
npm install @pholidlabs/histamation-engine
```

## Ticks {#ticks}

Setiap instan dalam kampanye adalah **tick**: hitungan detik bulat sejak `1970-01-01T00:00:00`
dalam kalender Gregorian proleptik, tanpa zona waktu. Tick bernilai negatif untuk apa pun
sebelum 1970 — yang merupakan sebagian besar data di repo ini; lihat [§3.2](contract.md#sec-3-2).
Jangan pernah membangun tick dengan `Date` bawaan JS: `Date.parse('-0044-03-15')` membaca
tahunnya sebagai 2044, bukan 44 SM. Parsing string `When` milik kampanye dengan
[helper waktu](#time-helpers) sebagai gantinya.

```ts
type Ticks = number;
```

## Memuat kampanye {#load-campaign}

### loadCampaign {#load-campaign-fn}

```ts
function loadCampaign(raw: CampaignFile): LoadResult;
```

Memvalidasi dan menormalisasi berkas kampanye yang sudah di-parsing (kontrak [§8](contract.md#sec-8)).
Fungsi ini tidak pernah throw: input yang cacat kembali sebagai diagnostik, bukan exception.
Setiap diagnostik membawa `code` yang stabil dan `path` berupa JSON Pointer ke dalam berkas;
lihat daftar lengkapnya di [halaman diagnostik](diagnostics.md). `campaign` bernilai `null` setiap
kali ada diagnostik dengan `level: 'error'` — berkas yang hanya berisi peringatan atau info tetap
termuat.

[`NormalizedCampaign`](#normalized-campaign) yang dikembalikan bersifat immutable: `resolveFrame`
meng-cache geometri per-track berdasarkan array-nya, sehingga mengubah kampanye yang sudah
termuat menghasilkan posisi basi. Bangun kampanye baru (panggil `loadCampaign` lagi) alih-alih
mengubah kampanye yang ada di tempat.

```ts
import { loadCampaign } from '@pholidlabs/histamation-engine';

const { campaign, diagnostics } = loadCampaign(json);
if (!campaign) {
  throw new Error(diagnostics.filter((d) => d.level === 'error').map((d) => d.message).join('\n'));
}
console.log(campaign.chapters.length, 'bab');
```

### LoadResult {#load-result}

```ts
interface LoadResult {
  campaign: NormalizedCampaign | null;
  diagnostics: Diagnostic[];
}
```

## Me-resolve frame {#resolve-frame}

### resolveFrame {#resolve-frame-fn}

```ts
function resolveFrame(campaign: NormalizedCampaign, t: Ticks, opts?: ResolveOptions): FrameState;
```

Menghitung segala sesuatu di peta pada tick `t`: entitas mana yang ada, di mana posisi pasukan
di sepanjang jalurnya, peristiwa mana yang aktif atau sudah lewat. Ini adalah fungsi yang harus
direproduksi persis (dalam [toleransi 1e-6](rust-wasm.md#parity)) oleh inti Rust/WASM — inilah
oracle uji di balik `test-vectors/*.frames.json`.

**Throws** `RangeError` (`"tick must be a finite number"`) jika `t` bernilai `NaN` atau
`±Infinity`; frame sampah lebih buruk daripada exception. `resolveFrame` sendiri hanya butuh
mikrodetik untuk data seukuran kampanye, jadi pemakaian pada thread yang sama adalah default —
lihat [di luar thread utama](#off-main-thread) untuk kapan memindahkannya ke worker.

```ts
import { resolveFrame } from '@pholidlabs/histamation-engine';

const frame = resolveFrame(campaign, -4558464000);
// { t: -4558464000, iso: '1825-07-20T00:00:00', entities: [...], events: [...] }
```

### ResolveOptions {#resolve-options}

```ts
interface ResolveOptions {
  bbox?: [number, number, number, number] | null;
  includeTrail?: boolean;
}
```

`bbox` (`[west, south, east, north]`) membuang entitas dan peristiwa bertitik yang sepenuhnya di
luar kotaknya; pasukan yang bergerak tetap disertakan jika posisi saat ini *atau* titik mana pun
di jejak-sejauh-ini bersinggungan dengan kotak tersebut. `includeTrail` (default `true`)
mengatur payload untuk pasukan: `true` mengembalikan seluruh polyline yang sudah dilalui sebagai
`FrameEntity.trail`, `false` hanya mengembalikan `FrameEntity.trailLength` (jumlah titiknya) —
lebih murah dikirim lintas batas worker saat renderer tidak menggambar jejak.

## Pemutaran bab {#chapter-playback}

### chapterTime {#chapter-time}

```ts
function chapterTime(chapter: NormChapter, p: number): Ticks;
```

Memetakan progres scroll `p ∈ [0, 1]` melalui jendela bab `[start, end)` menjadi sebuah tick
(kontrak [§6.1](contract.md#sec-6-1)):

```text
t = start + floor(p × (end − start − 1))
```

`p` di-clamp ke `[0, 1]` lebih dulu, dan `NaN` dibaca sebagai `0` — konversi float-ke-int tidak
pernah dibiarkan menentukan sendiri. Pengurangan `− 1` menjaga `p = 1` tetap di dalam jendela
setengah-terbuka, tepat di tick terakhir bab tersebut, bukan tick pertama bab berikutnya.

```ts
import { chapterTime } from '@pholidlabs/histamation-engine';

const chapter = campaign.chapters.find((c) => c.id === 'ch-01-birth')!; // when: "1785-11-11"
chapterTime(chapter, 0);   // -5810832000  → 1785-11-11T00:00:00
chapterTime(chapter, 0.5); // -5810788801  → 1785-11-11T11:59:59
chapterTime(chapter, 1);   // -5810745601  → 1785-11-11T23:59:59
chapterTime(chapter, NaN); // -5810832000  → sama seperti p = 0
```

### chapterAt {#chapter-at}

```ts
function chapterAt(campaign: NormalizedCampaign, t: Ticks): NormChapter | null;
```

Bab tempat sebuah tick berada dalam mode cerita: bab terakhir menurut urutan berkas yang
`start`-nya `≤ t`, atau `null` jika `t` berada sebelum start bab mana pun. Bab bisa saling
tumpang tindih ([`W115`](diagnostics.md#w115)), sehingga ini adalah aturan "yang paling baru
dimulai", bukan uji keterisian ketat.

## Helper posisi dan geometri {#geometry-helpers}

Ini adalah komponen dasar yang dipakai `resolveFrame` secara internal; diekspor karena renderer
atau alat kustom mungkin butuh geometri yang sama tanpa harus me-resolve seluruh frame.

### stateAt {#state-at}

```ts
function stateAt(states: NormState[], t: Ticks): NormState | null;
```

Entri [`states`](#normalized-campaign) yang berlaku pada tick `t`: di antara state dengan
`start ≤ t` yang intervalnya (jika ada) belum berakhir, yang `start`-nya paling akhir yang
menang (kontrak [§4.2](contract.md#sec-4-2)). Mengembalikan `null` jika belum ada state yang
berlaku, artinya `faction` milik entitas sendiri dan status `'active'` yang berlaku.

### alongPath {#along-path}

```ts
function alongPath(
  path: [number, number][],
  f: number,
): { position: [number, number]; segment: number; travelled: [number, number][] };
```

Titik pada fraksi `f` dari panjang haversine sebuah polyline, linear dalam lng/lat di dalam
segmen tempat ia jatuh. `f ≤ 0` mengembalikan titik pertama, `f ≥ 1` titik terakhir. `segment`
adalah indeks leg tempat posisi tersebut berada; `travelled` adalah polyline sampai dengan
`position` — begitulah cara `resolveFrame` membangun jejak sebuah pasukan.

```ts
import { alongPath } from '@pholidlabs/histamation-engine';

const leg: [number, number][] = [[110.364, -7.801], [110.358, -7.796], [110.35, -7.79]];
alongPath(leg, 0.5);
// { position: [110.35712552379519, -7.7953441428463925], segment: 1,
//   travelled: [[110.364, -7.801], [110.358, -7.796], [110.35712552379519, -7.7953441428463925]] }
```

### initialBearing {#initial-bearing}

```ts
function initialBearing(a: [number, number], b: [number, number]): number;
```

Azimut awal dari `a` ke `b` dalam derajat searah jarum jam dari utara, dalam rentang `[0, 360)`.
`FrameEntity.bearing` milik pasukan yang bergerak adalah bearing awal dari segmen yang sedang
dilaluinya (atau segmen terakhir tempat ia tiba, saat menunggu di sebuah waypoint).

```ts
initialBearing([110.364, -7.801], [110.358, -7.796]); // 310.06720200227045
```

### haversine {#haversine}

```ts
function haversine(a: [number, number], b: [number, number]): number;
```

Jarak great-circle dalam meter antara dua titik `[lng, lat]`, pada bola dengan radius Bumi
rata-rata IUGG (6.371.008,8 m). Dipakai di seluruh engine untuk panjang leg, jarak jejak, dan
pemeriksaan leg berdurasi-nol ([`W107`](diagnostics.md#w107)).

```ts
haversine([110.364, -7.801], [110.358, -7.796]); // 863.7301415070422 (meter)
```

## HistamationEngine {#chrono-map-engine}

`HistamationEngine` adalah fasad stateful di atas `loadCampaign` dan `resolveFrame`: ia melacak
kampanye, tick, dan bab yang aktif saat ini, serta memancarkan event saat berubah (kontrak
[§7.3](contract.md#sec-7-3)).

```ts
class HistamationEngine {
  constructor(opts?: EngineOptions);
  campaign: NormalizedCampaign | null;
  diagnostics: Diagnostic[];
  language: string;
  load(source: CampaignFile | string | URL): Promise<LoadResult>;
  readonly time: Ticks;
  readonly frame: FrameState | null;
  setTime(t: Ticks): void;
  setStoryProgress(chapterId: string, p: number): void;
  setLanguage(lang: string): void;
  on<K extends keyof EngineEvents>(event: K, handler: (payload: EngineEvents[K]) => void): () => void;
  dispose(): void;
}
```

### Opsi {#engine-options}

```ts
interface EngineOptions {
  language?: string;    // default 'en'
  includeTrail?: boolean; // default false; diteruskan sebagai ResolveOptions.includeTrail
}
```

### load {#engine-load}

```ts
load(source: CampaignFile | string | URL): Promise<LoadResult>;
```

Memuat objek kampanye yang sudah di-parsing, atau mengambil dan mem-parsing dari URL. Kegagalan
fetch (respons non-OK) akan throw; kampanye yang gagal validasi tidak — `diagnostics`
melaporkan alasannya, dan kampanye **sebelumnya**, jika ada, tetap dipertahankan. Saat berhasil,
`time` direset ke `start` bab pertama, bab aktif dikosongkan, lalu `'frame'` dan `'diagnostics'`
dipancarkan (bukan `'chapter'`: mode cerita belum dimulai). Jika `languages` milik kampanye
tidak memuat `language` engine saat ini, engine jatuh kembali ke `defaultLanguage` kampanye.

```ts
import { HistamationEngine } from '@pholidlabs/histamation-engine';

const engine = new HistamationEngine({ language: 'en' });
await engine.load('/campaigns/java-war-1825.json'); // atau objek CampaignFile yang sudah di-parsing
```

### time dan frame {#engine-time-frame}

```ts
readonly time: Ticks;
readonly frame: FrameState | null;
```

Tick saat ini dan [`FrameState`](#frame-state) terakhir yang di-resolve (`null` sebelum ada
kampanye yang termuat).

### setTime {#engine-set-time}

```ts
setTime(t: Ticks): void;
```

Mode jelajah bebas. Membulatkan `t` ke tick terdekat, me-resolve frame baru, lalu memancarkan
`'frame'`. **Throws** `RangeError` untuk `t` yang tidak finite, membiarkan `time` dan `frame`
tidak berubah. Tidak melakukan apa-apa sebelum ada kampanye yang termuat.

```ts
engine.setTime(-4545036000);
```

### setStoryProgress {#engine-set-story-progress}

```ts
setStoryProgress(chapterId: string, p: number): void;
```

Mode cerita: progres scroll `p ∈ [0, 1]` melalui bab bernama tersebut menggerakkan jam, lewat
[`chapterTime`](#chapter-time). Memancarkan `'chapter'` tepat saat `chapterId` berubah dari bab
aktif sebelumnya (sebelum `'frame'`), lalu selalu memancarkan `'frame'`. Tidak melakukan apa-apa
jika `chapterId` tidak cocok dengan bab yang termuat.

```ts
engine.on('chapter', ({ id, previous }) => console.log(previous, '→', id));
engine.setStoryProgress('ch-01-birth', 0.5);
```

### setLanguage {#engine-set-language}

```ts
setLanguage(lang: string): void;
```

Mengubah bahasa tampilan. Tidak melakukan apa-apa jika kampanye sudah termuat dan `lang` tidak
ada di `languages`-nya — engine tidak throw, hanya mempertahankan bahasa sebelumnya.

### on dan events {#engine-events}

```ts
interface EngineEvents {
  frame: FrameState;
  chapter: { id: string; index: number; previous?: string };
  diagnostics: Diagnostic[];
}
on<K extends keyof EngineEvents>(event: K, handler: (payload: EngineEvents[K]) => void): () => void;
```

Mendaftarkan `handler` untuk `event` dan mengembalikan fungsi unsubscribe. `'frame'` terpicu
setiap `setTime`/`setStoryProgress` dan setelah `load` berhasil; `'chapter'` terpicu hanya saat
mode cerita berpindah ke bab lain; `'diagnostics'` terpicu sekali per panggilan `load`, berhasil
atau gagal, dengan daftar diagnostik lengkap dari panggilan tersebut.

### dispose {#engine-dispose}

```ts
dispose(): void;
```

Menghapus semua handler yang terdaftar. Tidak menghapus `campaign`, `diagnostics`, `time`,
maupun `frame` — nilai-nilai itu tetap bisa dibaca, engine hanya berhenti memancarkan event.

### createEngine {#create-engine}

```ts
function createEngine(opts?: EngineOptions): HistamationEngine;
```

Setara dengan `new HistamationEngine(opts)`.

## Di luar thread utama {#off-main-thread}

`resolveFrame` hanya butuh mikrodetik untuk data seukuran kampanye, jadi `HistamationEngine`
berjalan pada thread yang sama secara default. Untuk kampanye yang cukup besar sehingga memuat
atau me-resolve layak dipindahkan dari thread utama, jalankan entry worker dan berkomunikasi
dengannya lewat `HistamationWorkerClient` (kontrak [§7.1](contract.md#sec-7-1)).

### Entry worker {#worker-entry}

```ts
import '@pholidlabs/histamation-engine/worker';
```

Meng-import `@pholidlabs/histamation-engine/worker` memasang listener `message` saat berjalan di dalam Worker
sungguhan (dideteksi dengan memeriksa keberadaan `postMessage` dan ketiadaan `document`;
meng-import-nya di thread utama tidak berbahaya dan tidak memasang apa pun). Buat modul worker
sendiri yang isinya cuma import ini:

```ts
// my-worker.ts
import '@pholidlabs/histamation-engine/worker';
```

Modul ini juga mengekspor `handleRequest`, penangan request murni yang dibungkus listener di
atas, untuk menguji protokol tanpa Worker sungguhan:

```ts
function handleRequest(msg: WorkerRequest): Exclude<WorkerResponse, { type: 'error' }>;
```

Fungsi ini throw untuk request yang tidak valid (misalnya `query` sebelum `load`); listener yang
terpasang menangkapnya dan membalas dengan `{ type: 'error', id, message }`.

### HistamationWorkerClient {#worker-client}

```ts
class HistamationWorkerClient {
  constructor(worker: Worker);
  load(campaign: CampaignFile): Promise<Omit<Loaded, 'type' | 'id'>>;
  query(t: Ticks, opts?: { bbox?: Bbox | null; includeTrail?: boolean }): Promise<FrameState | null>;
  dispose(): void;
}
```

Klien sisi thread utama untuk protokol worker. Satu worker menjawab request secara berurutan;
**query digabung (coalesced)**: paling banyak satu yang sedang berjalan sekaligus, dan meminta
lagi saat satu masih berjalan akan menggantikan query yang masih menunggu — promise dari
panggilan yang tergantikan itu resolve ke `null` tanpa pernah sampai ke worker. Scrubbing cepat
karenanya tidak pernah menumpuk antrean, dan setiap frame yang kamu terima adalah yang terbaru
yang bisa dijawab worker.

- `load` menolak berkas jika ada diagnostik `error` mana pun (kontrak §7.1): `ok` bernilai
  `false` dan worker tidak menyimpan kampanye apa pun, sama seperti `handleRequest` yang
  menetapkan `null` ke slot modul-levelnya.
- `query` resolve ke frame, atau `null` jika query yang lebih baru menggantikannya sebelum
  sempat dikirim.
- `dispose()` menghentikan worker; setiap promise `load`/`query` yang masih menggantung reject
  dengan `Error('HistamationWorkerClient disposed')`, dan panggilan berikutnya langsung reject.

```ts
import { HistamationWorkerClient } from '@pholidlabs/histamation-engine';

const worker = new Worker(new URL('./my-worker.ts', import.meta.url), { type: 'module' });
const client = new HistamationWorkerClient(worker);

const { ok, diagnostics } = await client.load(json);
const frame = await client.query(t); // null jika query yang lebih baru menggantikannya duluan
```

Inti Rust/WASM (`HistamationCore` di `crates/histamation-core`, fitur `wasm` — lihat
[histamation-core](rust-wasm.md#chrono-map-core)) menjawab bentuk pesan yang sama, sehingga worker
bisa menukarnya tanpa `HistamationWorkerClient` perlu berubah.

### Protokol pesan {#worker-protocol}

```ts
type WorkerRequest =
  | { type: 'load'; id: number; campaign: CampaignFile }
  | { type: 'query'; id: number; t: Ticks; bbox?: [number, number, number, number] | null; includeTrail?: boolean };

type WorkerResponse =
  | { type: 'loaded'; id: number; ok: boolean; diagnostics: Diagnostic[];
      summary?: { chapters: number; entities: number; events: number; places: number } }
  | { type: 'frame'; id: number; frame: FrameState }
  | { type: 'error'; id: number; message: string };
```

`id` mengaitkan request dengan balasannya; `HistamationWorkerClient` menetapkannya, jadi pemanggil
buatan sendiri juga harus melakukannya. `t` dibulatkan menjadi tick bulat di sisi worker, sama
seperti `HistamationEngine.setTime`; `t` yang tidak finite menghasilkan balasan `error`, tidak
pernah `frame`.

## Helper waktu {#time-helpers}

Parsing `When` tingkat rendah dan matematika kalender (kontrak [§3](contract.md#sec-3)).
`HistamationEngine` dan `loadCampaign` memakainya secara internal; gunakan langsung untuk
mem-parsing string `When` di luar kampanye, atau untuk aritmetika kalender pada tick.

### parseWhen {#parse-when}

```ts
function parseWhen(text: string): ParsedWhen;

interface ParsedWhen {
  text: string; isInterval: boolean;
  from: ParsedDate | null; to: ParsedDate | null;
  start: Ticks | null; end: Ticks | null;
}
```

Mem-parsing string `When` (kontrak [§3.1](contract.md#sec-3-1)): sebuah tanggal, atau `A/B` di
mana salah satu ujungnya boleh `..` (terbuka). `start`/`end` bernilai `null` hanya jika ujung
tersebut terbuka; resolve keduanya terhadap extent kampanye dengan [`resolveWhen`](#resolve-when).
**Throws** `WhenError` untuk apa pun di luar tata bahasanya — jumlah pemisah yang salah, kedua
ujung terbuka, ujung kosong, interval yang berakhir sebelum mulai, atau tanggal yang ditolak
`parseDate` sendiri.

```ts
import { parseWhen } from '@pholidlabs/histamation-engine';

parseWhen('1825-07-20');
// { text: '1825-07-20', isInterval: false, from: {…}, to: {…}, start: -4558464000, end: -4558377600 }
parseWhen('1827/..');
// { isInterval: true, from: {…}, to: null, start: -4512672000, end: null }
```

### parseDate {#parse-date}

```ts
function parseDate(text: string): ParsedDate;

interface ParsedDate {
  text: string; precision: Precision; qualifier: Qualifier | null;
  year: number; month: number | null; day: number | null;
  hour: number | null; minute: number | null; second: number | null;
  start: Ticks; end: Ticks;
}
type Precision = 'year' | 'month' | 'day' | 'minute' | 'second';
type Qualifier = 'uncertain' | 'approximate' | 'uncertain-approximate';
```

Mem-parsing satu sisi `When` (`YYYY`, `YYYY-MM`, `YYYY-MM-DD`, atau `YYYY-MM-DDTHH:MM[:SS]`,
dengan sufiks opsional `?`/`~`/`%`) menjadi presisi dan `[start, end)` setengah-terbuka. Tahun
memakai penomoran astronomis (`0000` = 1 SM); `-0000` ditolak. **Throws** `WhenError` untuk
string yang cacat, bulan/hari/jam/menit/detik di luar jangkauan, hari yang tidak ada pada
tahun/bulan tersebut (termasuk tahun kabisat), atau `-0000`.

```ts
import { parseDate, WhenError } from '@pholidlabs/histamation-engine';

parseDate('1825-07-20').precision; // 'day'
try { parseDate('1825-13'); } catch (e) { (e as WhenError).message; } // '"1825-13": month 13 out of range'
```

### resolveWhen {#resolve-when}

```ts
function resolveWhen(when: string | ParsedWhen, extent: Span): ParsedWhen & { start: Ticks; end: Ticks };
```

Mengganti ujung interval yang terbuka (`start === null` atau `end === null`) dengan `extent`
sebuah timeline, sehingga hasilnya selalu punya tick konkret. Menerima string `When` mentah
maupun `ParsedWhen` yang sudah di-parsing.

```ts
import { resolveWhen } from '@pholidlabs/histamation-engine';

resolveWhen('1827/..', campaign.extent); // { …, start: -4512672000, end: campaign.extent.end }
```

### ticksToIso {#ticks-to-iso}

```ts
function ticksToIso(ticks: Ticks): string;
```

Tick menjadi string ala-ISO. Tahun dalam rentang `0000`–`9999` dirender sebagai empat digit;
tahun di luar rentang itu mendapat tanda dan enam digit (`ticks_to_iso` di port Rust cocok
persis dengan ini — `test-vectors/time.json` mencakup keduanya). Inilah asal `FrameState.iso`
dibangun.

```ts
ticksToIso(-4558464000); // '1825-07-20T00:00:00'
ticksToIso(-63517824000); // '-000043-03-15T00:00:00' (15 Maret 44 SM)
```

### Matematika kalender {#calendar-math}

```ts
function daysFromCivil(year: number, month: number, day: number): number;
function civilFromDays(z: number): { year: number; month: number; day: number };
const isLeapYear: (y: number) => boolean;
const daysInMonth: (y: number, m: number) => number;
```

`daysFromCivil`/`civilFromDays` mengonversi antara tanggal sipil Gregorian-proleptik dan
jumlah hari sejak 1970-01-01, memakai algoritme bilangan bulat Howard Hinnant — tidak pernah
matematika tanggal floating-point, dan tidak pernah `Date` bawaan JS. `isLeapYear` mengikuti
aturan Gregorian biasa (habis dibagi 4, tidak habis dibagi 100 kecuali juga habis dibagi 400);
`daysInMonth` memakainya untuk Februari.

```ts
import { daysFromCivil, civilFromDays, isLeapYear, daysInMonth } from '@pholidlabs/histamation-engine';

daysFromCivil(1825, 7, 20) * 86400; // -4558464000, tick awal dari 1825-07-20
civilFromDays(-52760); // { year: 1825, month: 7, day: 20 }
isLeapYear(1900); // false — habis dibagi 100, tidak habis dibagi 400
isLeapYear(2000); // true
daysInMonth(1900, 2); // 28
daysInMonth(1600, 2); // 29
```

### WhenError {#when-error}

```ts
class WhenError extends Error {}
```

Dilempar oleh `parseDate`/`parseWhen` untuk apa pun di luar tata bahasa `When`. `loadCampaign`
menangkapnya dan mengubahnya menjadi diagnostik [`E004`](diagnostics.md#e004) alih-alih
membiarkannya menyebar; tangkap sendiri saat memanggil helper waktu secara langsung.

## Pemformatan untuk tampilan {#formatting}

Teks terlokalisasi dan pemformatan tanggal yang sadar-presisi (tanggal mempertahankan presisi
apa pun yang dideklarasikan berkas — `When` bertahun-saja tidak pernah tumbuh menjadi "1 Januari"
palsu).

### pickText {#pick-text}

```ts
function pickText(text: LocalizedText | undefined | null, lang: string, fallback?: string): string;
```

Me-resolve [`LocalizedText`](#key-types) (string biasa, atau map `{ [lang]: string }`) menjadi
satu string untuk `lang`: jatuh kembali ke `fallback` (biasanya `defaultLanguage` kampanye),
lalu ke bahasa mana pun yang kebetulan pertama di objek tersebut, lalu `''` untuk
`null`/`undefined`.

```ts
import { pickText } from '@pholidlabs/histamation-engine';

const title = { en: 'A prince of Yogyakarta', id: 'Seorang pangeran Yogyakarta' };
pickText(title, 'id'); // 'Seorang pangeran Yogyakarta'
pickText(title, 'fr', 'en'); // 'A prince of Yogyakarta'
pickText('Just text', 'id'); // 'Just text'
```

### formatWhen {#format-when}

```ts
function formatWhen(when: string, lang: string): string;
```

Bentuk yang mudah dibaca dari string `When`: satu tanggal, atau sebuah rentang, meringkas
bagian yang berulang (rentang hari yang sama di dalam satu bulan, tahun yang sama di kedua
ujung) dan menambahkan awalan/akhiran kualifier (`~` → "sekitar …", `?` → "… (?)"). Jatuh
kembali ke string mentah jika `when` gagal di-parsing.

```ts
formatWhen('1827~', 'en');                          // 'c. 1827'
formatWhen('1827~', 'id');                           // 'sekitar 1827'
formatWhen('1828-11-12?', 'en');                     // '12 November 1828 (?)'
formatWhen('1825-07-28/1825-09-25', 'en');           // '28 July – 25 September 1825'
formatWhen('1825-07-28/1825-07-30', 'en');           // '28–30 July 1825'
formatWhen('1827/..', 'en');                         // '1827 – …'
```

### formatDateParts dan tickParts {#format-date-parts}

```ts
function formatDateParts(
  d: { precision: Precision; year: number; month?: number | null; day?: number | null; hour?: number | null; minute?: number | null },
  lang: string, withYear?: boolean,
): string;

function tickParts(t: Ticks): { year: number; month: number; day: number; hour: number; minute: number };
```

`formatDateParts` merender bagian-bagian sebuah tanggal sesuai presisinya — tahun polos,
"Bulan Tahun", atau "H Bulan[, JJ:MM]" — memakai `Intl.DateTimeFormat` untuk nama bulan,
sehingga mengikuti konvensi `lang` itu sendiri. `tickParts` adalah separuh tick-ke-field-kalender
dari `ticksToIso`, diekspos tersendiri untuk pemanggil yang menginginkan bagian-bagiannya, bukan
string-nya.

```ts
formatDateParts({ precision: 'day', year: 1825, month: 7, day: 20 }, 'id'); // '20 Juli 1825'
tickParts(-4558464000); // { year: 1825, month: 7, day: 20, hour: 0, minute: 0 }
```

### formatTicks {#format-ticks}

```ts
function formatTicks(t: Ticks, lang: string, precision?: Precision): string;
```

`tickParts` + `formatDateParts` dalam satu panggilan; `precision` default ke `'day'`.

```ts
import { formatTicks } from '@pholidlabs/histamation-engine';

formatTicks(-4558464000, 'id'); // '20 Juli 1825'
formatTicks(-4558464000, 'en'); // '20 July 1825'
```

### yearText {#year-text}

```ts
const yearText: (year: number, lang: string) => string;
```

Tahun berdiri sendiri: angkanya untuk `year > 0`, selain itu `${1 - year} BCE`/`SM` (tahun
astronomis `0` adalah 1 SM, jadi konversinya adalah `1 - year`).

```ts
yearText(1825, 'en'); // '1825'
yearText(-43, 'en');  // '44 BCE'
yearText(-43, 'id');  // '44 SM'
```

## Tipe kunci {#key-types}

Tipe bentuk-berkas lengkap dan model ternormalisasi ada di [`types.ts`](gh:packages/engine/src/types.ts)
dan diekspor ulang dari root paket; berikut yang paling sering dibaca renderer atau UI.

### FrameState {#frame-state}

```ts
interface FrameState { t: Ticks; iso: string; entities: FrameEntity[]; events: FrameEvent[] }
```

Segala sesuatu di peta pada tick `t`, seperti yang dikembalikan [`resolveFrame`](#resolve-frame-fn).
`iso` adalah `t` yang diformat dengan [`ticksToIso`](#ticks-to-iso).

### FrameEntity {#frame-entity}

```ts
interface FrameEntity {
  id: string; kind: string; faction: string; status: string;
  position?: [number, number]; bearing?: number | null; moving?: boolean;
  waypoint?: number | null; leg?: number | null; legProgress?: number | null;
  strength?: number | null; certainty?: Certainty | null;
  trail?: [number, number][]; trailLength?: number;
}
```

Entitas yang ada pada tick frame tersebut. `faction` dan `status` berasal dari entri
[`states`](#state-at) yang berlaku, dengan default faction milik entitas sendiri dan `'active'`.
Pasukan menambahkan field pose: `moving` bernilai `true` saat menempuh sebuah leg, dan dalam hal
itu `leg` adalah indeks waypoint tujuan sedangkan `legProgress` adalah fraksi (0..1) yang sudah
ditempuh di sepanjangnya; saat diam, `waypoint` adalah indeks waypoint tempat ia berhenti.
`bearing` adalah derajat searah jarum jam dari utara. `trail` adalah polyline yang sudah dilalui
sejauh ini (hadir ketika [`ResolveOptions.includeTrail`](#resolve-options) bernilai `true`),
selain itu `trailLength` memberi jumlah titiknya. Teritori dan rute tidak membawa `position`
maupun field pose — geometrinya statis, dicari lewat `id` dari kampanye.

### FrameEvent {#frame-event}

```ts
interface FrameEvent {
  id: string; kind: string; phase: 'active' | 'past'; progress: number; sinceEnd: number;
  position: [number, number] | null; importance: number;
}
```

Peristiwa yang sudah mulai pada tick frame tersebut; peristiwa yang belum terjadi (upcoming)
sekadar absen dari `FrameState.events`. Selama `phase` bernilai `'active'`, `progress` berjalan
`0..1` sepanjang peristiwa; setelah `'past'`, `progress` bernilai `1` dan `sinceEnd` menghitung
tick sejak peristiwa berakhir. `position` bernilai `null` untuk peristiwa tanpa lokasi
([`I201`](diagnostics.md#i201)).

### NormalizedCampaign {#normalized-campaign}

```ts
interface NormalizedCampaign {
  raw: CampaignFile; meta: CampaignMeta; extent: Span; focus: Span;
  languages: string[]; defaultLanguage: string;
  factions: Map<string, Faction>; places: Map<string, NormPlace>;
  entities: NormEntity[]; events: NormEvent[]; chapters: NormChapter[];
}
```

Kampanye seperti yang dikembalikan [`loadCampaign`](#load-campaign-fn). `extent` adalah rentang
penuh timeline; `focus` adalah `meta.timeline.focus` jika berkas menetapkannya, selain itu
extent lagi — [mode jelajah bebas](contract.md#sec-6-3) memulai scrubber di `focus` dan bisa
diperlebar ke `extent`. `chapters` tidak pernah kosong ([`E018`](diagnostics.md#e018) menolak
berkas tanpa bab). Kampanye ini immutable — lihat [`loadCampaign`](#load-campaign-fn).

### Diagnostic {#diagnostic}

```ts
type DiagnosticLevel = 'error' | 'warning' | 'info';
interface Diagnostic { level: DiagnosticLevel; code: string; path: string; message: string }
```

Satu temuan loader. `level: 'error'` menolak berkas (`campaign` kembali `null`); `warning` dan
`info` tidak pernah menolak. `code` konsisten di antara engine TypeScript dan Rust — lihat
tabel lengkapnya di [halaman diagnostik](diagnostics.md). `path` adalah JSON Pointer ke dalam
berkas, misalnya `/chapters/0/when`.
