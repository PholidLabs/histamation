---
title: "@pholidlabs/chronomap-engine"
description: The headless engine API — ticks, loading, frame resolution, playback, the worker client, and time and text formatting.
group: api
order: 1
---

`@pholidlabs/chronomap-engine` parses, validates and resolves ChronoMap campaign files into per-instant
frames. It has no DOM and no map library dependency; [`@pholidlabs/chronomap-maplibre`](renderer.md) reads
its output. The package is the executable reference for the [data contract](contract.md) — the
Rust port in `crates/chronomap-core` is tested against vectors this package generates (see
[chronomap-core](rust-wasm.md)).

```bash
npm install @pholidlabs/chronomap-engine
```

## Ticks {#ticks}

Every instant in a campaign is a **tick**: an integer count of seconds since
`1970-01-01T00:00:00` in the proleptic Gregorian calendar, with no time zone. Ticks are
negative for anything before 1970, which is most of this repository's data — see
[§3.2](contract.md#sec-3-2). Never construct a tick with JS `Date`: `Date.parse('-0044-03-15')`
reads the year as 2044, not 44 BCE. Parse a campaign's own `When` strings with
[the time helpers](#time-helpers) instead.

```ts
type Ticks = number;
```

## Loading a campaign {#load-campaign}

### loadCampaign {#load-campaign-fn}

```ts
function loadCampaign(raw: CampaignFile): LoadResult;
```

Validates and normalizes a parsed campaign file (contract [§8](contract.md#sec-8)). It never
throws: malformed input comes back as diagnostics, never an exception. Every diagnostic carries
a stable `code` and a JSON Pointer `path` into the file; see [diagnostics](diagnostics.md) for
the full list. `campaign` is `null` whenever any diagnostic has `level: 'error'` — a file with
only warnings or info still loads.

The returned [`NormalizedCampaign`](#normalized-campaign) is immutable: `resolveFrame` caches
per-track geometry keyed by its arrays, so mutating a loaded campaign produces stale positions.
Build a new campaign (call `loadCampaign` again) instead of editing one in place.

```ts
import { loadCampaign } from '@pholidlabs/chronomap-engine';

const { campaign, diagnostics } = loadCampaign(json);
if (!campaign) {
  throw new Error(diagnostics.filter((d) => d.level === 'error').map((d) => d.message).join('\n'));
}
console.log(campaign.chapters.length, 'chapters');
```

### LoadResult {#load-result}

```ts
interface LoadResult {
  campaign: NormalizedCampaign | null;
  diagnostics: Diagnostic[];
}
```

## Resolving a frame {#resolve-frame}

### resolveFrame {#resolve-frame-fn}

```ts
function resolveFrame(campaign: NormalizedCampaign, t: Ticks, opts?: ResolveOptions): FrameState;
```

Computes everything on the map at tick `t`: which entities exist, where units are along their
tracks, which events are active or past. This is the function the Rust/WASM core must reproduce
bit-for-bit (within the [1e-6 tolerance](rust-wasm.md#parity)) — it is the test oracle behind
`test-vectors/*.frames.json`.

**Throws** a `RangeError` (`"tick must be a finite number"`) if `t` is `NaN` or `±Infinity`;
a garbage frame is worse than an exception. `resolveFrame` itself takes microseconds for
campaign-sized data, so same-thread use is the default — see [off the main thread](#off-main-thread)
for when to move it to a worker.

```ts
import { resolveFrame } from '@pholidlabs/chronomap-engine';

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

`bbox` (`[west, south, east, north]`) drops entities and point events entirely outside it; a
moving unit is kept if its current position *or* any point of its trail-so-far intersects the
box. `includeTrail` (default `true`) controls the payload for units: `true` returns the full
walked polyline as `FrameEntity.trail`, `false` returns only `FrameEntity.trailLength` (its
vertex count) — cheaper to send across a worker boundary when a renderer does not draw trails.

## Chapter playback {#chapter-playback}

### chapterTime {#chapter-time}

```ts
function chapterTime(chapter: NormChapter, p: number): Ticks;
```

Maps scroll progress `p ∈ [0, 1]` through a chapter's window `[start, end)` to a tick
(contract [§6.1](contract.md#sec-6-1)):

```text
t = start + floor(p × (end − start − 1))
```

`p` is clamped to `[0, 1]` first, and `NaN` reads as `0` — the float-to-int cast never gets to
decide. The `− 1` keeps `p = 1` inside the half-open window, on the chapter's last tick rather
than the first tick of the next one.

```ts
import { chapterTime } from '@pholidlabs/chronomap-engine';

const chapter = campaign.chapters.find((c) => c.id === 'ch-01-birth')!; // when: "1785-11-11"
chapterTime(chapter, 0);   // -5810832000  → 1785-11-11T00:00:00
chapterTime(chapter, 0.5); // -5810788801  → 1785-11-11T11:59:59
chapterTime(chapter, 1);   // -5810745601  → 1785-11-11T23:59:59
chapterTime(chapter, NaN); // -5810832000  → same as p = 0
```

### chapterAt {#chapter-at}

```ts
function chapterAt(campaign: NormalizedCampaign, t: Ticks): NormChapter | null;
```

The chapter a tick belongs to in story mode: the last chapter in file order whose `start` is
`≤ t`, or `null` if `t` is before every chapter's start. Chapters can overlap ([`W115`](diagnostics.md#w115)),
so this is a "most recently started" rule, not a strict containment test.

## Position and geometry helpers {#geometry-helpers}

These are the building blocks `resolveFrame` uses internally; they are exported because a
custom renderer or tool may need the same geometry without resolving a whole frame.

### stateAt {#state-at}

```ts
function stateAt(states: NormState[], t: Ticks): NormState | null;
```

The applicable [`states`](#normalized-campaign) entry at tick `t`: among states with
`start ≤ t` whose interval (if any) has not ended, the one with the latest `start` wins
(contract [§4.2](contract.md#sec-4-2)). Returns `null` if no state applies yet, meaning the
entity's own `faction` and status `'active'` apply.

### alongPath {#along-path}

```ts
function alongPath(
  path: [number, number][],
  f: number,
): { position: [number, number]; segment: number; travelled: [number, number][] };
```

The point at fraction `f` of a polyline's haversine length, linear in lng/lat within whichever
segment it lands on. `f ≤ 0` returns the first point, `f ≥ 1` the last. `segment` is the index
of the leg the position sits on; `travelled` is the polyline up to and including `position` —
this is how `resolveFrame` builds a unit's trail.

```ts
import { alongPath } from '@pholidlabs/chronomap-engine';

const leg: [number, number][] = [[110.364, -7.801], [110.358, -7.796], [110.35, -7.79]];
alongPath(leg, 0.5);
// { position: [110.35712552379519, -7.7953441428463925], segment: 1,
//   travelled: [[110.364, -7.801], [110.358, -7.796], [110.35712552379519, -7.7953441428463925]] }
```

### initialBearing {#initial-bearing}

```ts
function initialBearing(a: [number, number], b: [number, number]): number;
```

Forward azimuth from `a` to `b` in degrees clockwise from north, in `[0, 360)`. A moving unit's
`FrameEntity.bearing` is the initial bearing of the segment it is currently traversing (or the
last segment it arrived on, while holding at a waypoint).

```ts
initialBearing([110.364, -7.801], [110.358, -7.796]); // 310.06720200227045
```

### haversine {#haversine}

```ts
function haversine(a: [number, number], b: [number, number]): number;
```

Great-circle distance in metres between two `[lng, lat]` points, on a sphere of the IUGG mean
Earth radius (6 371 008.8 m). Used throughout the engine for leg lengths, trail distance and
the zero-duration-leg check ([`W107`](diagnostics.md#w107)).

```ts
haversine([110.364, -7.801], [110.358, -7.796]); // 863.7301415070422 (metres)
```

## ChronoMapEngine {#chrono-map-engine}

`ChronoMapEngine` is the stateful façade over `loadCampaign` and `resolveFrame`: it tracks the
current campaign, tick and chapter, and emits events on change (contract
[§7.3](contract.md#sec-7-3)).

```ts
class ChronoMapEngine {
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

### Options {#engine-options}

```ts
interface EngineOptions {
  language?: string;    // default 'en'
  includeTrail?: boolean; // default false; forwarded as ResolveOptions.includeTrail
}
```

### load {#engine-load}

```ts
load(source: CampaignFile | string | URL): Promise<LoadResult>;
```

Loads a parsed campaign object, or fetches and parses one from a URL. A fetch failure (non-OK
response) throws; a campaign that fails validation does not — `diagnostics` reports why, and
the **previous** campaign, if any, is kept. On success it resets `time` to the first chapter's
`start`, clears the active chapter, and emits `'frame'` and `'diagnostics'` (not `'chapter'`:
story mode has not started yet). If the campaign's `languages` does not include the engine's
current `language`, the engine falls back to the campaign's `defaultLanguage`.

```ts
import { ChronoMapEngine } from '@pholidlabs/chronomap-engine';

const engine = new ChronoMapEngine({ language: 'en' });
await engine.load('/campaigns/java-war-1825.json'); // or a parsed CampaignFile object
```

### time and frame {#engine-time-frame}

```ts
readonly time: Ticks;
readonly frame: FrameState | null;
```

The current tick and the last resolved [`FrameState`](#frame-state) (`null` before any campaign
has loaded).

### setTime {#engine-set-time}

```ts
setTime(t: Ticks): void;
```

Free-exploration mode. Rounds `t` to the nearest whole tick, resolves a new frame and emits
`'frame'`. **Throws** a `RangeError` for a non-finite `t`, leaving `time` and `frame` untouched.
A no-op before any campaign is loaded.

```ts
engine.setTime(-4545036000);
```

### setStoryProgress {#engine-set-story-progress}

```ts
setStoryProgress(chapterId: string, p: number): void;
```

Story mode: scroll progress `p ∈ [0, 1]` through the named chapter drives the clock, via
[`chapterTime`](#chapter-time). Emits `'chapter'` the moment `chapterId` changes from the
previously active one (before `'frame'`), then always emits `'frame'`. A no-op if `chapterId`
does not match a loaded chapter.

```ts
engine.on('chapter', ({ id, previous }) => console.log(previous, '→', id));
engine.setStoryProgress('ch-01-birth', 0.5);
```

### setLanguage {#engine-set-language}

```ts
setLanguage(lang: string): void;
```

Changes the display language. A no-op if a campaign is loaded and `lang` is not in its
`languages` — the engine does not throw, it just keeps the previous language.

### on and events {#engine-events}

```ts
interface EngineEvents {
  frame: FrameState;
  chapter: { id: string; index: number; previous?: string };
  diagnostics: Diagnostic[];
}
on<K extends keyof EngineEvents>(event: K, handler: (payload: EngineEvents[K]) => void): () => void;
```

Subscribes `handler` to `event` and returns an unsubscribe function. `'frame'` fires on every
`setTime`/`setStoryProgress` and after a successful `load`; `'chapter'` fires only when story
mode moves to a different chapter; `'diagnostics'` fires once per `load` call, success or
failure, with that call's full diagnostic list.

### dispose {#engine-dispose}

```ts
dispose(): void;
```

Clears every registered handler. It does not clear `campaign`, `diagnostics`, `time` or
`frame` — those stay readable, the engine just stops emitting.

### createEngine {#create-engine}

```ts
function createEngine(opts?: EngineOptions): ChronoMapEngine;
```

Equivalent to `new ChronoMapEngine(opts)`.

## Off the main thread {#off-main-thread}

`resolveFrame` costs microseconds for campaign-sized data, so `ChronoMapEngine` runs
same-thread by default. For a campaign large enough that loading or resolving is worth moving
off the main thread, run the worker entry and talk to it with `ChronoMapWorkerClient` (contract
[§7.1](contract.md#sec-7-1)).

### The worker entry {#worker-entry}

```ts
import '@pholidlabs/chronomap-engine/worker';
```

Importing `@pholidlabs/chronomap-engine/worker` installs a `message` listener when it runs inside an
actual Worker (it detects this by checking for `postMessage` and the absence of `document`;
importing it on the main thread is harmless and installs nothing). Build your own worker module
that does nothing but this import:

```ts
// my-worker.ts
import '@pholidlabs/chronomap-engine/worker';
```

The module also exports `handleRequest`, the pure request handler the listener wraps, for
testing the protocol without a real Worker:

```ts
function handleRequest(msg: WorkerRequest): Exclude<WorkerResponse, { type: 'error' }>;
```

It throws on a bad request (for example a `query` before a `load`); the installed listener
catches that and replies with `{ type: 'error', id, message }`.

### ChronoMapWorkerClient {#worker-client}

```ts
class ChronoMapWorkerClient {
  constructor(worker: Worker);
  load(campaign: CampaignFile): Promise<Omit<Loaded, 'type' | 'id'>>;
  query(t: Ticks, opts?: { bbox?: Bbox | null; includeTrail?: boolean }): Promise<FrameState | null>;
  dispose(): void;
}
```

Main-thread client for the worker protocol. One worker answers requests in order; **queries are
coalesced**: at most one is ever in flight, and asking again while one is in flight replaces the
still-queued one — the replaced call's promise resolves to `null` without ever reaching the
worker. Fast scrubbing therefore never builds a backlog, and every frame you get back is the
newest the worker could answer.

- `load` rejects the file on any `error` diagnostic (contract §7.1): `ok` is `false` and the
  worker keeps no campaign, same as `handleRequest` assigning `null` to its module-level slot.
- `query` resolves to the frame, or `null` if a newer query replaced it before it was sent.
- `dispose()` terminates the worker; every outstanding `load`/`query` promise rejects with
  `Error('ChronoMapWorkerClient disposed')`, and further calls reject immediately.

```ts
import { ChronoMapWorkerClient } from '@pholidlabs/chronomap-engine';

const worker = new Worker(new URL('./my-worker.ts', import.meta.url), { type: 'module' });
const client = new ChronoMapWorkerClient(worker);

const { ok, diagnostics } = await client.load(json);
const frame = await client.query(t); // null if a newer query replaced this one first
```

The Rust/WASM core (`ChronoMapCore` in `crates/chronomap-core`, feature `wasm` — see
[chronomap-core](rust-wasm.md#chrono-map-core)) answers the same message shapes, so a worker can
swap it in without `ChronoMapWorkerClient` changing.

### Message protocol {#worker-protocol}

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

`id` correlates a request with its reply; `ChronoMapWorkerClient` assigns it, so hand-rolled
callers must too. `t` is rounded to an integer tick on the worker side, the same as
`ChronoMapEngine.setTime`; a non-finite `t` produces an `error` reply, never a `frame`.

## Time helpers {#time-helpers}

Low-level `When` parsing and calendar math (contract [§3](contract.md#sec-3)). `ChronoMapEngine`
and `loadCampaign` use these internally; reach for them directly to parse a `When` string
outside a campaign, or to do calendar arithmetic on ticks.

### parseWhen {#parse-when}

```ts
function parseWhen(text: string): ParsedWhen;

interface ParsedWhen {
  text: string; isInterval: boolean;
  from: ParsedDate | null; to: ParsedDate | null;
  start: Ticks | null; end: Ticks | null;
}
```

Parses a `When` string (contract [§3.1](contract.md#sec-3-1)): a date, or `A/B` where either
end may be `..` (open). `start`/`end` are `null` only when that end is open; resolve them
against a campaign's extent with [`resolveWhen`](#resolve-when). **Throws** a `WhenError` for
anything outside the grammar — a bad separator count, both ends open, an empty end, an
interval that ends before it starts, or a date `parseDate` itself rejects.

```ts
import { parseWhen } from '@pholidlabs/chronomap-engine';

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

Parses one side of a `When` (`YYYY`, `YYYY-MM`, `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM[:SS]`, with an
optional trailing `?`/`~`/`%`) into its precision and half-open `[start, end)`. Years are
astronomical (`0000` = 1 BCE); `-0000` is rejected. **Throws** a `WhenError` for a malformed
string, an out-of-range month/day/hour/minute/second, a day that does not exist in that
year/month (leap years included), or `-0000`.

```ts
import { parseDate, WhenError } from '@pholidlabs/chronomap-engine';

parseDate('1825-07-20').precision; // 'day'
try { parseDate('1825-13'); } catch (e) { (e as WhenError).message; } // '"1825-13": month 13 out of range'
```

### resolveWhen {#resolve-when}

```ts
function resolveWhen(when: string | ParsedWhen, extent: Span): ParsedWhen & { start: Ticks; end: Ticks };
```

Replaces open interval ends (`start === null` or `end === null`) with a timeline's `extent`, so
the result always has concrete ticks. Accepts either a raw `When` string or an already-parsed
`ParsedWhen`.

```ts
import { resolveWhen } from '@pholidlabs/chronomap-engine';

resolveWhen('1827/..', campaign.extent); // { …, start: -4512672000, end: campaign.extent.end }
```

### ticksToIso {#ticks-to-iso}

```ts
function ticksToIso(ticks: Ticks): string;
```

Ticks to an ISO-like string. Years inside `0000`–`9999` render as four digits; years outside
that range get a sign and six digits (`ticks_to_iso` in the Rust port matches this exactly —
`test-vectors/time.json` covers both). This is what `FrameState.iso` is built from.

```ts
ticksToIso(-4558464000); // '1825-07-20T00:00:00'
ticksToIso(-63517824000); // '-000043-03-15T00:00:00' (15 March 44 BCE)
```

### Calendar math {#calendar-math}

```ts
function daysFromCivil(year: number, month: number, day: number): number;
function civilFromDays(z: number): { year: number; month: number; day: number };
const isLeapYear: (y: number) => boolean;
const daysInMonth: (y: number, m: number) => number;
```

`daysFromCivil`/`civilFromDays` convert between a proleptic-Gregorian civil date and days since
1970-01-01, using Howard Hinnant's integer algorithm — never floating-point date math, and
never JS `Date`. `isLeapYear` follows the usual Gregorian rule (divisible by 4, not by 100
unless also by 400); `daysInMonth` uses it for February.

```ts
import { daysFromCivil, civilFromDays, isLeapYear, daysInMonth } from '@pholidlabs/chronomap-engine';

daysFromCivil(1825, 7, 20) * 86400; // -4558464000, the start tick of 1825-07-20
civilFromDays(-52760); // { year: 1825, month: 7, day: 20 }
isLeapYear(1900); // false — divisible by 100, not by 400
isLeapYear(2000); // true
daysInMonth(1900, 2); // 28
daysInMonth(1600, 2); // 29
```

### WhenError {#when-error}

```ts
class WhenError extends Error {}
```

Thrown by `parseDate`/`parseWhen` for anything outside the `When` grammar. `loadCampaign`
catches it and turns it into an [`E004`](diagnostics.md#e004) diagnostic instead of letting it
propagate; catch it yourself when calling the time helpers directly.

## Formatting for display {#formatting}

Localized text and precision-aware date formatting (dates keep whatever precision the file
declared — a year-only `When` never grows a fake "1 January").

### pickText {#pick-text}

```ts
function pickText(text: LocalizedText | undefined | null, lang: string, fallback?: string): string;
```

Resolves a [`LocalizedText`](#key-types) (a plain string, or a `{ [lang]: string }` map) to one
string for `lang`: falls back to `fallback` (normally the campaign's `defaultLanguage`), then to
whichever language happens to be first in the object, then `''` for `null`/`undefined`.

```ts
import { pickText } from '@pholidlabs/chronomap-engine';

const title = { en: 'A prince of Yogyakarta', id: 'Seorang pangeran Yogyakarta' };
pickText(title, 'id'); // 'Seorang pangeran Yogyakarta'
pickText(title, 'fr', 'en'); // 'A prince of Yogyakarta'
pickText('Just text', 'id'); // 'Just text'
```

### formatWhen {#format-when}

```ts
function formatWhen(when: string, lang: string): string;
```

Human-readable form of a `When` string: a single date, or a range, collapsing the parts that
repeat (same day range inside one month, same year on both ends) and prefixing/suffixing
qualifiers (`~` → "c. …", `?` → "… (?)"). Falls back to the raw string if `when` fails to parse.

```ts
formatWhen('1827~', 'en');                          // 'c. 1827'
formatWhen('1827~', 'id');                           // 'sekitar 1827'
formatWhen('1828-11-12?', 'en');                     // '12 November 1828 (?)'
formatWhen('1825-07-28/1825-09-25', 'en');           // '28 July – 25 September 1825'
formatWhen('1825-07-28/1825-07-30', 'en');           // '28–30 July 1825'
formatWhen('1827/..', 'en');                         // '1827 – …'
```

### formatDateParts and tickParts {#format-date-parts}

```ts
function formatDateParts(
  d: { precision: Precision; year: number; month?: number | null; day?: number | null; hour?: number | null; minute?: number | null },
  lang: string, withYear?: boolean,
): string;

function tickParts(t: Ticks): { year: number; month: number; day: number; hour: number; minute: number };
```

`formatDateParts` renders one date's precision-appropriate parts — a bare year, "Month Year", or
"D Month[, HH:MM]" — using `Intl.DateTimeFormat` for month names, so it follows `lang`'s own
convention. `tickParts` is the tick-to-calendar-fields half of `ticksToIso`, exposed on its own
for callers that want the parts rather than the string.

```ts
formatDateParts({ precision: 'day', year: 1825, month: 7, day: 20 }, 'id'); // '20 Juli 1825'
tickParts(-4558464000); // { year: 1825, month: 7, day: 20, hour: 0, minute: 0 }
```

### formatTicks {#format-ticks}

```ts
function formatTicks(t: Ticks, lang: string, precision?: Precision): string;
```

`tickParts` + `formatDateParts` in one call; `precision` defaults to `'day'`.

```ts
import { formatTicks } from '@pholidlabs/chronomap-engine';

formatTicks(-4558464000, 'id'); // '20 Juli 1825'
formatTicks(-4558464000, 'en'); // '20 July 1825'
```

### yearText {#year-text}

```ts
const yearText: (year: number, lang: string) => string;
```

A year on its own: the number for `year > 0`, otherwise `${1 - year} BCE`/`SM` (astronomical
year `0` is 1 BCE, so the conversion is `1 - year`).

```ts
yearText(1825, 'en'); // '1825'
yearText(-43, 'en');  // '44 BCE'
yearText(-43, 'id');  // '44 SM'
```

## Key types {#key-types}

The full file-shape and normalized-model types live in [`types.ts`](gh:packages/engine/src/types.ts)
and are re-exported from the package root; these are the ones a renderer or UI reads most.

### FrameState {#frame-state}

```ts
interface FrameState { t: Ticks; iso: string; entities: FrameEntity[]; events: FrameEvent[] }
```

Everything on the map at tick `t`, as returned by [`resolveFrame`](#resolve-frame-fn). `iso` is
`t` formatted with [`ticksToIso`](#ticks-to-iso).

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

An entity that exists at the frame's tick. `faction` and `status` come from the
[`states`](#state-at) entry in force, defaulting to the entity's own faction and `'active'`.
Units add the pose fields: `moving` is `true` while travelling a leg, in which case `leg` is the
arriving waypoint's index and `legProgress` the fraction (0..1) travelled along it; at rest,
`waypoint` is the index of the waypoint being held at. `bearing` is degrees clockwise from
north. `trail` is the polyline walked so far (present when [`ResolveOptions.includeTrail`](#resolve-options)
is `true`), otherwise `trailLength` gives its vertex count. Territories and routes carry
neither `position` nor pose fields — their geometry is static, looked up by `id` from the
campaign.

### FrameEvent {#frame-event}

```ts
interface FrameEvent {
  id: string; kind: string; phase: 'active' | 'past'; progress: number; sinceEnd: number;
  position: [number, number] | null; importance: number;
}
```

An event that has started by the frame's tick; upcoming events are simply absent from
`FrameState.events`. While `phase` is `'active'`, `progress` runs `0..1` through the event; once
`'past'`, `progress` is `1` and `sinceEnd` counts ticks since it ended. `position` is `null` for
a location-less event ([`I201`](diagnostics.md#i201)).

### NormalizedCampaign {#normalized-campaign}

```ts
interface NormalizedCampaign {
  raw: CampaignFile; meta: CampaignMeta; extent: Span; focus: Span;
  languages: string[]; defaultLanguage: string;
  factions: Map<string, Faction>; places: Map<string, NormPlace>;
  entities: NormEntity[]; events: NormEvent[]; chapters: NormChapter[];
}
```

A campaign as returned by [`loadCampaign`](#load-campaign-fn). `extent` is the timeline's full
range; `focus` is `meta.timeline.focus` if the file set one, otherwise the extent again —
[free-explore mode](contract.md#sec-6-3) starts the scrubber at `focus` and can widen it to
`extent`. `chapters` is never empty ([`E018`](diagnostics.md#e018) rejects a file without one).
The campaign is immutable — see [`loadCampaign`](#load-campaign-fn).

### Diagnostic {#diagnostic}

```ts
type DiagnosticLevel = 'error' | 'warning' | 'info';
interface Diagnostic { level: DiagnosticLevel; code: string; path: string; message: string }
```

One loader finding. `level: 'error'` rejects the file (`campaign` comes back `null`); `warning`
and `info` never do. `code` is stable across the TypeScript and Rust engines — see the full
table on the [diagnostics page](diagnostics.md). `path` is a JSON Pointer into the file, for
example `/chapters/0/when`.
