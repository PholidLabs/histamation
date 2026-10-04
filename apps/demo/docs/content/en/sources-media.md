---
title: Sources and media
description: Citations for every claim, and images with alt text, credit and a license — provenance that travels with the data.
group: authoring
order: 7
---

## Provenance travels with the data {#overview}

A campaign is self-contained: citations, image credits and licenses live in the same file as the history, not in a separate bibliography ([§1](contract.md#sec-1)). `sources[]` and `media[]` are flat, top-level lists; anything else in the file — a place, an entity, an event, a chapter, even a faction — references them by id through its own `sources` and `media` arrays.

## Sources {#sources}

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Referenced from a `sources: [...]` array elsewhere in the file. |
| `type` | yes | `book`, `article`, `primary`, `archive`, `web`, `dataset`, `map` or `encyclopedia`. |
| `citation` | yes | A plain string — the full citation text. |
| `url` | no | Where to find it online. |
| `accessed` | no | A [`When`](time.md) date; validated but, like `media.date` and `meta.updated`, not bound to the timeline. |
| `notes` | no | [Localized text](languages.md) for caveats about the source. |

A source does not need a `url` — plenty of print scholarship does not have one:

```json
{ "id": "carey-1982", "type": "article",
  "citation": "Carey, Peter. \"Raden Saleh, Dipanagara and the Painting of the Capture of Dipanagara at Magelang (28 March 1830).\" Journal of the Malaysian Branch of the Royal Asiatic Society 55, no. 1 (1982): 1–25." }
```

When it does, `accessed` records when a web source was last checked:

```json
{ "id": "jogjacagar", "type": "web",
  "citation": "Dinas Kebudayaan DIY. Jogjacagar cultural heritage register.",
  "url": "https://jogjacagar.jogjaprov.go.id/", "accessed": "2026-09" }
```

Cite every event: one with no `sources[]` entry loads fine, but warns ([W114](diagnostics.md#w114)) — the authoring checklist is to give every event at least one source ([§10](contract.md#sec-10)).

## Media {#media}

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Referenced from a `media: [...]` array elsewhere in the file. |
| `type` | yes | `image` — the only value today. |
| `url` | yes | Where to load the full image; a relative path or an absolute URL. |
| `alt` | yes | [Localized text](#alt-text) — see below. |
| `license` | yes | An SPDX id, or `public-domain`. |
| `thumbnailUrl` | no | A smaller version, same rules as `url`. |
| `caption` | no | Localized text shown alongside the image. |
| `creator` | no | A plain string — the artist or photographer. |
| `date` | no | A [`When`](time.md) date; validated, not bound to the timeline. |
| `holder` | no | A plain string — who holds the rights or the physical object. |
| `sourceUrl` | no | An absolute URL to the original listing, for example a museum or Commons page. |
| `notes` | no | Localized text, for example "link not yet checked". |

```json
{ "id": "saleh-arrest", "type": "image",
  "url": "https://commons.wikimedia.org/wiki/Special:FilePath/Raden_Saleh_-_Diponegoro_arrest.jpg",
  "alt": { "en": "Painting: Diponegoro, head raised, stands among his followers on the steps of the Magelang residency as Dutch officers look on.", "id": "…" },
  "caption": { "en": "Raden Saleh, The Arrest of Prince Diponegoro (1857).", "id": "…" },
  "creator": "Raden Saleh", "date": "1857", "license": "public-domain",
  "holder": "Istana Kepresidenan Yogyakarta",
  "sourceUrl": "https://commons.wikimedia.org/wiki/File:Raden_Saleh_-_Diponegoro_arrest.jpg" }
```

A local, self-hosted image can use a relative `url`, the way the null island fixture does:

```json
{ "id": "fixture-image", "type": "image", "url": "media/fixture.png",
  "alt": { "en": "Placeholder image", "id": "Gambar placeholder" }, "license": "CC0-1.0" }
```

Media are always loaded as images — nothing in a campaign file runs code ([§7.5](contract.md#sec-7-5)).

## Alt text {#alt-text}

`alt` is required on every image, and it is [localized text](languages.md) like any other narrative field: describe what is actually in the frame, not just its title. The authoring checklist says it plainly — write `alt` text for every image, and check its license before you commit it ([§10](contract.md#sec-10)).

## Licensing {#licensing}

Two licenses can appear in a campaign, at two different scopes. `meta.license` is a single SPDX id (for example `CC-BY-4.0`) for the dataset's own text and data — the prose you wrote. `media[].license` is a separate SPDX id, or the literal string `public-domain`, per image — it covers whatever the historical image itself is licensed under, which is almost never the same as the dataset's own license:

```json
"license": "public-domain"
```

## URL safety {#url-safety}

A URL scheme of `javascript:`, `data:`, `vbscript:` or `file:` fails validation wherever it appears — `source.url`, `media.url`, `media.thumbnailUrl`, or a link inside a [chapter body](chapters.md#body) — because campaign files come from anywhere and are treated as hostile input ([E015](diagnostics.md#e015), [§7.5](contract.md#sec-7-5)). External links open with `rel="noopener noreferrer"`.

## Unreferenced sources and media {#unreferenced}

A `sources[]` or `media[]` entry that nothing in the file points to by id is dead weight — the validator warns ([W105](diagnostics.md#w105)), the same warning it gives for an unused `place` or `part`.
