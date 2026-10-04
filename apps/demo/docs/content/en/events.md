---
title: Events
description: Battles, sieges, treaties and other things that happen, with participants, an outcome and a timeline phase.
group: authoring
order: 5
---

## What makes something an event {#what-is-an-event}

If it **happens**, it is an event. If it **moves or changes hands**, it is an [entity](entities.md) instead ([§2.1](contract.md#sec-2-1)). An event has a `when` — a point or an interval — and, instead of a continuous state, a **phase**: upcoming, active or past.

## Fields {#fields}

`id`, `kind`, `name` and `when` are required:

```jsonc
{ id, kind, name, when, at?, certainty?, participants?, outcome?, summary?, importance?, sources?, media?, notes? }
```

The schema also allows a plain-string `tags` array for authoring-tool filtering, the same as on [entities](entities.md#common-fields); the engine itself never reads it.

## Kinds {#kinds}

`battle, siege, skirmish, raid, massacre, capture, surrender, negotiation, treaty, proclamation, decree, uprising, appointment, arrest, exile, birth, death, political, other`, or a custom `x-…`. The Napoleon file uses `x-fire` for the burning of Moscow:

```json
{ "id": "fire-of-moscow", "kind": "x-fire", "when": "1812-09-14/1812-09-18", "at": "moscow", "importance": 2 }
```

## When and phase {#when-and-phase}

`when` uses the same syntax as everywhere in the file — see [Time](time.md). At tick `t`, the phase is `upcoming` if `t < start`, `active` if `start ≤ t < end`, and `past` if `t ≥ end`. A frame only ever carries `active` and `past` events — an `upcoming` event does not reach the map at all until its window opens. Each carries `progress` (0 to 1 while active) and `sinceEnd` (seconds since it ended), so a renderer can pulse a marker while an event is happening and fade it afterward ([§5](contract.md#sec-5)).

## Location: `at` is optional {#location}

`at` is a place id or an inline coordinate, the same `Location` type used everywhere. Leave it out for an event with no single point, such as a decree or a policy change: it still appears on the timeline and in the context panel, just not on the map ([I201](diagnostics.md#i201)):

```json
{ "id": "peace-decree", "kind": "decree", "when": "-0009~" }
```

When `at` is set, certainty falls back the same way it does for a [fortification](entities.md#fortifications): the event's own `certainty`, or — if `at` is a place id — that place's certainty.

```json
{ "id": "new-era", "kind": "political", "when": "0001-01-01",
  "at": [0.05, 0.02], "certainty": "exact" }
```

## Participants {#participants}

Each entry in `participants[]` needs a `faction`; everything else is optional:

| Field | Meaning |
|---|---|
| `faction` (required) | Must reference a declared faction. |
| `role` | `attacker`, `defender`, `belligerent`, `negotiator`, `mediator`, `perpetrator`, `victim` or `party`. |
| `commanders` | A list of [localized names](languages.md). |
| `strength`, `losses` | An integer, or `{min, max, note?}` when sources disagree — the same `quantity` type as a [waypoint's or state's strength](entities.md#strength). |

```json
"participants": [
  { "faction": "blue", "role": "attacker", "commanders": ["General A"],
    "strength": 4500, "losses": { "min": 300, "max": 500 } },
  { "faction": "red", "role": "defender", "strength": 2000 }
]
```

A quantity whose `min` is greater than its `max` fails to load ([E012](diagnostics.md#e012)).

## Outcome and summary {#outcome}

`outcome` is `{ victor?, summary? }` — `victor` is a faction id, and its `summary` is [localized text](languages.md). A top-level `summary` field on the event itself is a separate, shorter description, independent of the outcome:

```json
"outcome": {
  "victor": "british",
  "summary": { "en": "The kraton fell and was plundered; Hamengkubuwono II was deposed and exiled to Penang.", "id": "…" }
}
```

Not every event has a victor — a raid both sides survive, or a battle with no clear result, can give just a `summary`:

```json
"outcome": { "summary": { "en": "Tegalrejo was shelled and burned; Diponegoro and his uncle Mangkubumi escaped.", "id": "…" } }
```

## Importance {#importance}

`importance` runs from 1 (major) to 5; renderers may hide low-importance markers when zoomed out ([§5](contract.md#sec-5)). Use it to keep a crowded map legible without leaving anything out of the data itself:

```json
{ "id": "arrest-at-magelang", "importance": 1 }
```

```json
{ "id": "hb4-death", "importance": 3 }
```
