# @chronomap/engine

Headless engine for [ChronoMap](https://github.com/PholidLabs/chronomaps) campaign files: parse, validate and resolve historical campaigns into per-instant frames. No DOM, no map library, no dependencies.

This package is the executable reference for the [data contract](https://github.com/PholidLabs/chronomaps/blob/main/docs/DATA-CONTRACT.md). The Rust core in `crates/chronomap-core` is a port of it and is tested against the golden vectors it produces.

## Time

Time is a **tick**: an integer count of seconds since 1970-01-01T00:00:00 in the proleptic Gregorian calendar, with no time zone. Every historical date is negative. Parse `When` strings with the engine's own helpers, never with `Date`:

```ts
import { parseWhen, ticksToIso, formatTicks } from '@chronomap/engine';

const w = parseWhen('1825-07-20');   // { start, end, from, to, isInterval, … }; the day is [start, end)
ticksToIso(w.start!);                // '1825-07-20T00:00:00'
formatTicks(w.start!, 'id');         // '20 Juli 1825'
```

## Load and resolve

```ts
import { loadCampaign, resolveFrame, chapterTime } from '@chronomap/engine';

const { campaign, diagnostics } = loadCampaign(json);
if (!campaign) throw new Error(diagnostics.filter((d) => d.level === 'error').map((d) => d.message).join('\n'));

const chapter = campaign.chapters[0];
const t = chapterTime(chapter, 0.5);        // scroll progress p ∈ [0, 1] → tick inside [start, end)
const frame = resolveFrame(campaign, t);    // { t, iso, entities, events }
```

`loadCampaign` never throws on bad data. It returns `campaign: null` if any diagnostic is an `error`. Every diagnostic has a stable `code` (see contract §8) and a JSON Pointer `path`. A loaded campaign is immutable: build a new one instead of editing it.

`resolveFrame` throws a `RangeError` for a non-finite tick (`NaN`, `±Infinity`).

## Stateful playback

```ts
import { ChronoMapEngine } from '@chronomap/engine';

const engine = new ChronoMapEngine({ language: 'en' });
engine.on('frame', (f) => render(f));
engine.on('chapter', ({ id, previous }) => announce(id, previous));

await engine.load('/campaigns/java-war-1825.json'); // a URL or a parsed object; errors keep the previous campaign
engine.setStoryProgress('ch-01', 0.5);               // story mode
engine.setTime(-4545036000);                          // free exploration
```

`setTime` rounds to a whole tick and throws a `RangeError` for a non-finite one, leaving the current time and frame untouched.

## Off the main thread

`resolveFrame` takes microseconds for campaign-sized data, so the same-thread engine is the default. For large campaigns, run the worker entry and talk to it with `ChronoMapWorkerClient`:

```ts
// my-worker.ts
import '@chronomap/engine/worker';

// main.ts
import { ChronoMapWorkerClient } from '@chronomap/engine';

const client = new ChronoMapWorkerClient(new Worker(new URL('./my-worker.ts', import.meta.url), { type: 'module' }));
const { ok, diagnostics } = await client.load(json);
const frame = await client.query(t);   // null if a newer query replaced this one before it was sent
```

Queries are coalesced: at most one is in flight, and a newer query replaces a waiting one. The Rust/WASM core (`ChronoMapCore` in `crates/chronomap-core`, feature `wasm`) answers with the same message shapes, so a worker can swap it in.

## CLI

```bash
npx chronomap-check campaign.json [...more.json] [--frames] [--strict] [--quiet] [--json]
```

| Flag | Effect |
|---|---|
| `--frames` | Dry-run playback: where each unit is at p = 0, 0.5 and 1 of each chapter. |
| `--strict` | Warnings fail the run. |
| `--quiet` | Only print errors. |
| `--json` | Machine-readable report. |
| `--vectors <dir>` | Write golden vectors (for engine development). |

Semantic checks always run. JSON Schema checks (`S001`) also run when `ajv` and `ajv-formats` are installed next to the package: `npm i -D ajv ajv-formats`.

## License

MIT
