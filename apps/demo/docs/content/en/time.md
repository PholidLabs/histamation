---
title: Time
description: The `When` date syntax, its precision and qualifiers, and how every date resolves to a half-open range of ticks.
group: authoring
order: 2
---

Every date in a campaign — a chapter's `when`, an entity's existence, a waypoint, a state, an
event — is written as a `When` string: an EDTF (ISO 8601-2) subset. `"1827"` and
`"1827-01-01T00:00:00Z"` mean different things, so the format carries its own precision, and
dates can be marked uncertain or approximate instead of forcing a false exact one.

## `When` syntax {#syntax}

```
When      = Date | Interval
Interval  = (Date | "..") "/" (Date | "..")          ; not both ".."
Date      = Year [ "-" MM [ "-" DD [ "T" hh ":" mm [ ":" ss ] ] ] ] [ Qualifier ]
Year      = [ "-" ] 4DIGIT                            ; astronomical: 0000 = 1 BCE, -0043 = 44 BCE
Qualifier = "?" (uncertain) | "~" (approximate) | "%" (both)
```

A `Date` is always exactly a **year**, a **year-month**, a **year-month-day**, or one of those
plus a **time of day** to the minute or the second — that list is also the five precisions the
engine tracks (see [Resolving a date to ticks](#resolution)). The year is always four digits,
using astronomical numbering, and an optional sign.

Reserved for a later minor version, and currently rejected as invalid: `Y`-prefixed years
(deep-time years beyond four digits), seasons (`2001-21`), unspecified digits (`18XX`), and
empty interval ends (`1825/`). Any string that doesn't match the grammar — including all of
those — fails with [`E004`](diagnostics.md#e004).

## Qualifiers: uncertain and approximate {#qualifiers}

A `Date` may end in one qualifier:

| Qualifier | Meaning | Example |
|---|---|---|
| `?` | uncertain — the date is a best guess | `1828-11-12?` |
| `~` | approximate — "circa" | `1827~` |
| `%` | both uncertain and approximate | `1830%` |

Qualifiers are **display and styling hints only** — "c. 1827", or a dashed outline on a
conjectural leg. They never change the resolved `[start, end)` range: `1827~` still spans the
whole of 1827, exactly like `1827`. Location uncertainty is a separate concept — see
[Places § Certainty](places.md#certainty) — because a date can be honest about *when* while a
place is still honest about *where*.

## Resolving a date to ticks {#resolution}

The engine works in **ticks**: integer seconds since `1970-01-01T00:00:00`, proleptic
Gregorian, no time zone. Ticks are negative before 1970 — `i64` in Rust, a plain `number` in JS
(exact to ±2⁵³). Conversion uses integer calendar math (days-from-civil, Howard Hinnant's
algorithm), never a floating-point calendar library, so leap years resolve exactly.

Every `Date` covers a **half-open range `[start, end)`**, sized by its precision:

| Precision | Example | `start` | `end` (exclusive) |
|---|---|---|---|
| year | `1825` | 1825-01-01T00:00:00 | 1826-01-01T00:00:00 |
| month | `1825-07` | 1825-07-01T00:00:00 | 1825-08-01T00:00:00 |
| day | `1825-07-20` | 1825-07-20T00:00:00 | 1825-07-21T00:00:00 |
| minute | `…T14:30` | 14:30:00 | 14:31:00 |
| second | `…T14:30:05` | 14:30:05 | 14:30:06 |

An `Interval A/B` resolves to `[start(A), end(B))` — the start of the coarser or finer precision
at `A`, through the end of whatever `B` covers. Worked examples, all as ISO-like
`[start, end)` pairs:

| `When` | Resolves to |
|---|---|
| `1825` | `[1825-01-01T00:00:00, 1826-01-01T00:00:00)` |
| `1825-07` | `[1825-07-01T00:00:00, 1825-08-01T00:00:00)` |
| `1825-07-20` | `[1825-07-20T00:00:00, 1825-07-21T00:00:00)` |
| `1830-03-08T12:00` | `[1830-03-08T12:00:00, 1830-03-08T12:01:00)` |
| `1827~` | `[1827-01-01T00:00:00, 1828-01-01T00:00:00)` — qualifier doesn't narrow it |
| `1828-11-12?` | `[1828-11-12T00:00:00, 1828-11-13T00:00:00)` |
| `1825-07-28/1825-09-25` | `[1825-07-28T00:00:00, 1825-09-26T00:00:00)` — includes all of 25 September |
| `1830-03-28/1830-03-28` | `[1830-03-28T00:00:00, 1830-03-29T00:00:00)` — "that whole day" |
| `1827/..` | `[1827-01-01T00:00:00, extent.end)` |
| `../1826` | `[extent.start, 1827-01-01T00:00:00)` — an end date covers its whole year |
| `-0043-03-15` | `[-0043-03-15T00:00:00, -0043-03-16T00:00:00)` — 15 March 44 BCE |

## Intervals and open ends {#intervals}

`A/B` is an interval; either end (never both) may be `..` instead of a `Date`, meaning "open,
resolve from the campaign's timeline" — see [Extent and focus](#extent-focus). `1825/` (an
empty, "unknown" end) is not the same thing and is rejected: `..` must be written out. A
same-precision, same-value interval like `1830-03-28/1830-03-28` is a legitimate way to say
"all of that day", since it resolves through the *end* of the second date.

An interval where the end starts before the start begins is [`E004`](diagnostics.md#e004) —
`1825-09-25/1825-07-28` is invalid, not reversed automatically.

## Extent and focus {#extent-focus}

`meta.timeline.extent` is a `When` that must itself be **closed** — no `..` on either end — and
every *timeline* date in the file must resolve inside it: chapter windows, entity and state
`when`s, waypoint `when`s, event `when`s. A date outside `extent` is
[`E005`](diagnostics.md#e005). A missing or open `extent` is [`E004`](diagnostics.md#e004).
Metadata dates — `media.date`, `source.accessed`, `meta.updated` — are validated as `When`
strings but are not bounded by `extent`.

Every `..` in the file, wherever it appears, resolves to `extent`'s own start or end. That's the
one and only meaning of an open end.

`meta.timeline.focus` is a second, optional `When`: the default window the free-explore scrubber
opens to, which can be widened to the full `extent` (see [§6.3](contract.md#sec-6-3)). It's
checked against `extent` the same way any other timeline date is — outside it, that's
`E005` too — but it doesn't have to touch either end of `extent`, and nothing else is bounded
by it.

## Year zero, negative years and BCE {#bce}

Years use **astronomical numbering**: `0000` is 1 BCE, and each more-negative year is one
further back — `-0043` is 44 BCE (BCE year = `1 − astronomical year`, for year ≤ 0). There is no
`1970`-relative shortcut here: a year is a year, converted the same way whether it's positive or
negative. `-0000` is rejected outright — year zero is written `0000`, with no sign.

Proleptic Gregorian means the calendar is projected backwards past its 1582 introduction with no
adjustment, so a BCE or early-CE `When` is not the same date a contemporary Julian-calendar
source would have written down — see [Calendars](#calendars) for how to keep both.

## Sub-day precision {#sub-day}

Minute and second precision exist for the rare event that genuinely happened at a specific time
of day, but the contract's own advice is to use them **sparingly**: most historical dates don't
support that precision honestly, and a minute-precision chapter reads as frozen rather than
scrubbing (see [§6.1](contract.md#sec-6-1) — chapter scroll maps `p ∈ [0,1]` onto
`[start, end)`, so a 60-second window barely moves regardless of how far the reader scrolls).
That's also the intended way to **freeze the clock at an instant**: give the chapter a
minute-precision `when` instead of a day or interval one.

## Calendars {#calendars}

Every `When` in the file is proleptic Gregorian — full stop. Dates recorded in another calendar
are converted once, when the file is written; the original is preserved for display with a
chapter's `dateLabel`, not encoded in `when` itself:

```json
{
  "when": "1812-09-07",
  "dateLabel": { "en": "7 September 1812 (26 August Old Style)", "id": "7 September 1812 (26 Agustus kalender Julian)" }
}
```

The same mechanism carries a Javanese (Anno Javanico) or Hijri date alongside the converted
Gregorian one. `dateLabel` is display text; it has no effect on resolution or validation.

## Pitfalls {#pitfalls}

- **Never pass a raw `When` string to JS `Date`.** `Date.parse("-0044-03-15")` returns the year
  `2044` in V8, not `NaN` — there is no exception to catch. Always parse with the engine's own
  `When` parser (see [`time.ts`](gh:packages/engine/src/time.ts)).
- **A `u64` millisecond timestamp cannot represent this data.** Unix time before 1970 is
  negative, and every campaign in this repository has dates before 1970; ticks are always `i64`
  in Rust and a plain (signed) `number` in JS.
- **A coarse interval end eats travel time.** If a unit's waypoint says
  `"1826-11~/1827-08~"` (so it departs at `end(1827-08)` = 1827-09-01T00:00) and the next
  waypoint says `"1827-09"` (so it arrives at `start(1827-09)` = 1827-09-01T00:00), the unit
  teleports — zero travel time between two different places.
  [`W107`](diagnostics.md#w107) warns about this when the jump is over 1 km; fix it by ending
  the stay earlier or moving the arrival later. See [Entities](entities.md) for the full
  waypoint model.

## Errors: E004 and E005 {#errors}

- [`E004`](diagnostics.md#e004) — the `When` string doesn't parse, its interval ends before it
  starts, or `meta.timeline.extent` is open or missing. This is the catch-all for anything
  syntactically or structurally wrong with a date.
- [`E005`](diagnostics.md#e005) — the `When` parses fine, but a *timeline* date resolves outside
  `meta.timeline.extent`. Widen `extent`, or fix the date — whichever is actually wrong.
