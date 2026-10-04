---
title: Campaign file anatomy
description: The top-level shape of a campaign file, the four primitives it's built from, and the one flat ID namespace that ties them together.
group: authoring
order: 1
---

A campaign is one JSON file. It says what existed, where, and when — never how to draw it. A
`fortification`'s icon while `besieged` is a theme decision, not a data field; the file only
carries a small, renderer-neutral `style` hint. That separation is what lets the same file play
in the JS reference engine and the Rust/WASM core with identical output.

## File anatomy {#anatomy}

| Key | Required | Purpose |
|---|---|---|
| `chronomap` | yes | Contract version this file targets, e.g. `"1.0"`. |
| `meta` | yes | ID, title, languages, timeline extent, initial map view. |
| `factions` | yes, ≥1 | Sides, with colors. |
| `parts` | no | Optional chapter grouping for a table of contents. |
| `places` | no | Static gazetteer: named points with certainty. |
| `entities` | no | Things that exist over time: `unit`, `fortification`, `territory`, `route`. |
| `events` | no | Things that happen: battle, siege, treaty, arrest… |
| `chapters` | yes, ≥1 | The story: time window, camera and text. |
| `sources` | no | Citations. |
| `media` | no | Images with alt text, credit and license. |

Every one of these except `meta` is an array. `factions` needs at least one entry and
`chapters` needs at least one — a campaign with no chapters has nowhere to start playback
([`E018`](diagnostics.md#e018)). See [§2](contract.md#sec-2) for the full annotated shape and
[Getting started](getting-started.md#minimal-campaign) for the smallest file that validates.

## The four primitives {#primitives}

Everything in `places`, `entities`, `events` and `chapters` is one of four kinds of thing:

| Concept | Has time? | Has geometry? | Changes over time? | Rendered as |
|---|---|---|---|---|
| **Place** | no | point | no | label and marker, with an uncertainty halo |
| **Entity** | existence interval | track, point, polygon or line | yes: position, status, owner, strength | moving unit, fort icon, shaded territory, route line |
| **Event** | point or interval | optional point | phase: upcoming, active, past | pulse while active, faded marker after |
| **Chapter** | window | camera and focus | drives the clock | scroll step, with narrative and media |

Rule of thumb: if it **moves or changes hands**, it's an entity ([Entities](entities.md)). If it
**happens**, it's an event ([Events](events.md)). If it's **just somewhere**, it's a place
([Places](places.md)). Entities and events usually reference a place by ID (`"at": "pleret"`)
instead of repeating coordinates. See [§2.1](contract.md#sec-2-1).

## One flat ID namespace {#ids}

Every `id` — on a faction, a part, a place, an entity, an event or a chapter — is kebab-case
(`^[a-z0-9]+(-[a-z0-9]+)*$`, 80 characters max) and lives in **one namespace across the whole
file**. A place and an event can't both be called `gawok`.

That single namespace is what lets a chapter's `focus`, an entity's `at`/`path`, or an event's
`at` mix places, entities and events by bare ID, with no type tag to say which:

```json
{ "focus": ["diponegoro-hq", "battle-gawok", "gawok"] }
```

Three diagnostics guard this:

- [`E001`](diagnostics.md#e001) — duplicate ID.
- [`E002`](diagnostics.md#e002) — a reference to an ID that doesn't exist anywhere in the file.
- [`E003`](diagnostics.md#e003) — a reference that resolves, but to the wrong kind of thing (a
  faction ID where a place, entity or event was expected, for example).

## `$schema` and editor autocomplete {#schema-autocomplete}

Put a `$schema` pointer at the top of the file:

```jsonc
{
  "$schema": "../../schema/campaign.schema.json",   // two levels up from data/campaigns/
  "chronomap": "1.0"
}
```

Editors with a JSON language server (VS Code's built-in one, for example) read this to
autocomplete field names and enum values and to underline structural mistakes as you type —
missing required fields, a `kind` that isn't in the enum, a `color` that isn't `#rrggbb`. The
engine itself never reads `$schema`; it's purely an authoring aid, and the same
[`schema/campaign.schema.json`](gh:schema/campaign.schema.json) backs `ajv` in CI
([`S001`](diagnostics.md#s001)).

> [!NOTE]
> The schema only expresses *structure*. Referential integrity (`E002`/`E003`), the ID
> namespace (`E001`), time resolution (`E004`/`E005`) and everything in
> [Time](time.md#resolution) and [Places](places.md#coordinates) is *semantic* validation, done
> by the engine, not by your editor. Always run the CLI (see
> [Getting started](getting-started.md#validate)) before trusting a file.

## Extending without breaking {#extending}

Any object — including the top level — accepts `x-`-prefixed fields, and anywhere a `kind` or
`status` is an enum, an `x-…` value is also accepted (`place.kind`, `entity.kind`, `event.kind`,
`state.status`). The Napoleon 1812 file carries Minard's temperature table as `x-minard` this
way. Two rules keep this safe:

- A custom `x-…` entity kind still needs exactly one of the four geometry shapes (`track`, `at`,
  `geometry` or `path`) — omitting it is [`E016`](diagnostics.md#e016).
- Unknown `x-` fields, and `kind`/`status` values an older engine doesn't recognize, are ignored
  rather than rejected. `chronomap: "1.N"` — minor versions only ever *add* optional fields and
  enum values, so a 1.0 engine can still play a 1.3 file. Only an unsupported major version is
  refused ([`E013`](diagnostics.md#e013)). See [§9](contract.md#sec-9).

Unknown `x-` kinds render with the generic style for their geometry (point, line or polygon),
and an unknown theme falls back to the engine default — see [§7.4](contract.md#sec-7-4).

## Authoring workflow {#workflow}

1. Put every coordinate in `places` with an honest `certainty` and a `notes` line saying where
   it came from — see [Places § Provenance](places.md#provenance).
2. Convert every date to proleptic Gregorian. Mark doubtful ones `?` or `~`, and record
   disagreements between sources in `notes` instead of silently picking one — see
   [Time](time.md).
3. Give every event at least one source ([`W114`](diagnostics.md#w114)).
4. Use neutral terminology for factions.
5. Write `alt` text for every image and check its license — see [Sources and media](sources-media.md).
6. Run the CLI with `--frames` and read the dry run. It prints where every unit is at the start,
   middle and end of each chapter, which catches most date and reference mistakes before you
   open a browser.

See [§10](contract.md#sec-10) for the normative version of this checklist. For interactive
authoring rather than a file you edit by hand, see the [validator](validator.md) (full
diagnostic report as you type) and the [when-tester](when-tester.md) (paste a `When` string, see
its resolved span).
