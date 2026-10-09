---
title: histamation-check
description: The validation CLI — flags, exit codes, the --frames dry-run, --json output, and JSON Schema (S001) checks.
group: api
order: 3
---

`histamation-check` is the campaign validator: it runs [`loadCampaign`](engine.md#load-campaign-fn)
against one or more files, optionally checks them against the JSON Schema, and can dry-run
playback or write [conformance vectors](rust-wasm.md#parity). It ships as the `bin` of
[`@pholidlabs/histamation-engine`](engine.md), built to `packages/engine/dist/cli.js`.

```bash
npx histamation-check campaign.json [...more.json] [--frames] [--strict] [--quiet] [--json] [--vectors <dir>]
```

Inside this repository, after `npm run build`, run it directly:

```bash
node packages/engine/dist/cli.js data/campaigns/java-war-1825.json
```

## Flags {#flags}

| Flag | Effect |
|---|---|
| `--frames` | Dry-run playback: prints where each unit is at scroll progress p = 0, 0.5 and 1 of every chapter, and shows `info`-level diagnostics (hidden otherwise). |
| `--strict` | A `warning` fails the run (exit code 1), not just an `error`. |
| `--quiet` | Print only `error`-level diagnostics. |
| `--json` | Machine-readable report on stdout instead of the human-readable listing (see [`--json` shape](#json-shape)). |
| `--vectors <dir>` | Write [golden vectors](rust-wasm.md#parity) to `<dir>` for every file checked (see [`--vectors`](#vectors)). |

Any other `--`-prefixed argument is unknown and fails the run before any file is read
([exit code 2](#exit-codes)); every non-`--` argument is a campaign file path. `--vectors`
consumes the argument right after it as its directory, so `--vectors` must not be the last
argument on the line.

## Exit codes {#exit-codes}

| Code | Meaning |
|---|---|
| `0` | Every file checked; no `error`-level diagnostic, and no `warning` under `--strict`. |
| `1` | At least one file produced an `error`-level diagnostic, or (`--strict`) a `warning`. |
| `2` | Usage error: no files given, an unrecognized `--` flag, or `--vectors` with no directory argument (missing, or itself another flag). Nothing is checked; `usage: histamation-check …` prints to stderr first. |

## Validation layers {#validation-layers}

Two layers run, both reporting [diagnostics](diagnostics.md) with a stable `code` and a JSON
Pointer `path` (contract [§8](contract.md#sec-8)):

1. **Semantic** — [`loadCampaign`](engine.md#load-campaign-fn). Always runs; this is the same
   check `HistamationEngine.load` and the Rust core perform.
2. **Structural** — the JSON Schema at `schema/campaign.schema.json`, reported as code `S001`.
   Runs only when `ajv` and `ajv-formats` are installed next to the CLI; if they are not, the
   CLI prints a note to stderr and skips schema checking, but semantic checks still run:

   ```text
   note: ajv is not installed, so JSON Schema (S001) checks are skipped; semantic checks still run
   ```

   Enable it with:

   ```bash
   npm i -D ajv ajv-formats
   ```

   Each distinct schema failure at a JSON Pointer becomes one `S001` diagnostic; an
   `additionalProperties` failure is reworded to name the offending property and remind you
   that custom fields must start with `x-`, and an `enum` failure lists the allowed values.

## Human-readable output {#human-output}

Without `--json`, each file prints its path, a one-line count, then one line per diagnostic
(`info` only with `--frames`; only `error` under `--quiet`), then — if the file loaded to a
campaign at all — a summary line:

```text
data/campaigns/java-war-1825.json
  0 error(s), 0 warning(s), 0 info
  5 factions · 34 places · 9 entities · 43 events · 38 chapters
```

A file with findings lists one line per diagnostic before the summary,
`  ${level.padEnd(7)} ${code} ${path}  ${message}`:

```text
data/campaigns/fixtures/null-island.json
  0 error(s), 1 warning(s), 0 info
  warning W115 /chapters/1/when  Chapter "ch-march" starts 7 day(s) before "ch-muster" ends; time jumps backwards when scrolling between them
  2 factions · 3 places · 5 entities · 4 events · 4 chapters
```

That fixture's `W115` is deliberate — it exists to exercise the check (see [`W115`](diagnostics.md#w115)).

### --frames {#frames-output}

With `--frames`, each chapter gets its own block, one line per sampled scroll progress
(`p = 0, 0.5, 1`) showing the ISO instant, which events are active, and every moving or holding
unit's position and status. From `java-war-1825.json`, the single-day chapter `ch-06-tegalrejo`
(`when: "1825-07-20"`) and the following interval chapter `ch-07-selarong`
(`when: "1825-07-21/1825-07-27"`) — `diponegoro-hq`'s first track waypoint is a point `when`,
so it passes through Tegalrejo rather than holding there, and is already in transit for the
whole of the first chapter:

```text
  Playback dry-run (p = scroll progress through the chapter):

  ▸ ch-06-tegalrejo — Tegalrejo burns  [1825-07-20]
    p=0.0 1825-07-20T00:0  active: tegalrejo-attack
           units: diponegoro-hq@[110.351, -7.787]→0%
    p=0.5 1825-07-20T11:5  active: tegalrejo-attack
           units: diponegoro-hq@[110.333, -7.824]→50%
    p=1.0 1825-07-20T23:5  active: tegalrejo-attack
           units: diponegoro-hq@[110.315, -7.862]→100%

  ▸ ch-07-selarong — The standard raised at Selarong  [1825-07-21/1825-07-27]
    p=0.0 1825-07-21T00:0  active: selarong-base
           units: diponegoro-hq@[110.315, -7.862]
    p=0.5 1825-07-24T11:5  active: —
           units: diponegoro-hq@[110.315, -7.862]
    p=1.0 1825-07-27T23:5  active: —
           units: diponegoro-hq@[110.315, -7.862]
```

A unit's line is `id@[lng, lat]`, then `→NN%` while moving (`legProgress` as a percentage), then
`(status)` if the state in force is anything other than `'active'`, then `n=N` if it has a
resolved strength. A full run lists every unit that exists at that tick, not just one. This is
the same `resolveFrame`/`chapterTime` pipeline documented on the [engine page](engine.md#chapter-time)
— the dry-run exists to catch date mistakes by inspection: run it and read where every unit
lands at the start, middle and end of each chapter (contract [§10](contract.md#sec-10)).

## --json shape {#json-shape}

With `--json`, nothing but the JSON report goes to stdout — one array entry per file, printed
once after every file has been checked:

```ts
type Report = Array<{
  file: string;
  counts: { error: number; warning: number; info: number };
  diagnostics: Array<{ level: 'error' | 'warning' | 'info'; code: string; path: string; message: string }>;
}>;
```

`diagnostics` interleaves `S001` structural findings (first) with the semantic ones from
`loadCampaign`, in that order:

```json
[
  {
    "file": "data/campaigns/java-war-1825.json",
    "counts": { "error": 0, "warning": 0, "info": 0 },
    "diagnostics": []
  },
  {
    "file": "data/campaigns/fixtures/null-island.json",
    "counts": { "error": 0, "warning": 1, "info": 1 },
    "diagnostics": [
      { "level": "info", "code": "I201", "path": "/events/2", "message": "Event \"peace-decree\" has no location; it will appear on the timeline but not on the map" },
      { "level": "warning", "code": "W115", "path": "/chapters/1/when", "message": "Chapter \"ch-march\" starts 7 day(s) before \"ch-muster\" ends; time jumps backwards when scrolling between them" }
    ]
  }
]
```

`--json`'s `diagnostics` array always holds every diagnostic, `info` included, whether or not
`--frames` is passed — only the human-readable listing hides `info` without `--frames`.

## --vectors {#vectors}

```bash
histamation-check --vectors test-vectors data/campaigns/*.json data/campaigns/fixtures/*.json
```

Writes `<dir>/time.json` once (every `When` string [`vectors.ts`](gh:packages/engine/src/vectors.ts)
knows to be interesting — every precision and qualifier, leap days, year zero, BCE, open ends,
and the inputs that should fail to parse), then one `<dir>/<name>.frames.json` per campaign file
that loaded successfully — `resolveFrame` at scroll progress `p` through every chapter, plus the
loader's diagnostics. Campaigns under a `fixtures/` directory (like `null-island.json`) get the
"detailed" form: quarter-step sampling (`p = 0, .25, .5, .75, 1`) with full trail polylines;
other campaigns get `p = 0, .5, 1` with trail vertex counts only, one frame per line so a
semantics change shows up as a readable diff. Floats round to `1e-6` in both forms — the exact
tolerance [`crates/histamation-core/tests/vectors.rs`](rust-wasm.md#parity) checks against.

These are the [golden vectors](rust-wasm.md#parity) the Rust port is tested against — run this
after any change to `packages/engine/src/`, before touching the Rust port to match.

## npm run check {#npm-run-check}

This repository's own `npm run check` script runs the CLI over every campaign in the repo:

```bash
npm run check
# node packages/engine/dist/cli.js data/campaigns/*.json data/campaigns/fixtures/*.json
```

Per [CLAUDE.md](gh:CLAUDE.md), this must report zero errors before a commit. The only expected
warning across the whole corpus is [`W115`](diagnostics.md#w115) on
`data/campaigns/fixtures/null-island.json` — that fixture deliberately overlaps two chapters to
exercise the check.
