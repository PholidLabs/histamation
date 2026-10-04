---
title: Diagnostics
description: What the engine's error, warning and info codes mean, how to read their paths, and where they show up.
group: reference
order: 2
---

## What a diagnostic is {#overview}

Loading a campaign file runs two layers of checks: structural validation against the JSON Schema (code `S001`, emitted only when `ajv` is installed) and semantic validation in the engine's loader, which the [contract](contract.md) treats as normative ([§8](contract.md#sec-8)). Each finding is a small, stable record:

```ts
interface Diagnostic { level: 'error' | 'warning' | 'info'; code: string; path: string; message: string }
```

`code` identifies the rule — look it up on this page. `path` says exactly where in the file it fired.

## Three levels {#levels}

- **error** rejects the file. The loader returns a `null` campaign, and nothing plays until every error is fixed.
- **warning** flags something that's probably wrong — a swapped coordinate, a chapter with no camera — without rejecting the file.
- **info** notes an intentional choice, such as an event with no map location.

Only `error` blocks playback: any error rejects the file and shows the diagnostics, while warnings and info load normally and stay available to authoring tools.

## Reading a path {#paths}

`path` is a JSON Pointer into the campaign file: segments joined by `/`, with a literal `~` or `/` inside an ID escaped as `~0` and `~1`. Arrays are indexed from `0`. A bad `when` on the third waypoint of the fourth entity's track, for example, is reported at:

```text
/entities/3/track/2/when
```

Open the file, count from zero, and you're at the exact field the message is about.

## Where diagnostics show up {#where}

- `chronomap-check` prints every diagnostic for each file you pass it. See [CLI](cli.md) for the flags.
- The map app at [`/app/`](/app/) shows a dismissible notice listing the error-level diagnostics when a dropped file fails to load. A file that loads with warnings or info still plays; its "About" panel lists every diagnostic (level, code, path, message) alongside a count per level.
- The [validator](validator.md) surfaces every level while you edit, without needing to drop the file into the map app first.

## `--strict` {#strict-mode}

By default, `chronomap-check` exits non-zero only when a file has an error. Add `--strict` and it also exits non-zero when a file has any warning — useful once a campaign is warning-clean and you want CI to hold the line. `--strict` doesn't change what the loader accepts: a file with only warnings still loads and plays either way; it only changes the command's exit code.
