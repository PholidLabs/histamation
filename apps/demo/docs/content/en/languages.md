---
title: Languages
description: Plain strings or language maps, declaring languages, missing translations, and how the app picks one to show.
group: authoring
order: 8
---

## One file, many languages {#overview}

A campaign carries its own translations — there is no separate locale file. Every human-readable field in the file is [localized text](#localized-text), and `meta.languages` plus `meta.defaultLanguage` say which languages exist and which one is the fallback ([§2](contract.md#sec-2)).

## Plain string or language map {#localized-text}

Any localized field is either a plain string, in the default language, or a map from a BCP-47 language tag to a string:

```json
"title": { "en": "Arrest at Magelang", "id": "Penangkapan di Magelang" }
```

A plain string is shorthand for "this is already in `meta.defaultLanguage`" — use it freely in a one-language campaign, or for a field you have not translated yet in a multi-language one. A language map must include the default language, or the file fails to load ([E008](diagnostics.md#e008)); every key in it must be one of the languages declared in `meta.languages`, or the file fails to load too ([E009](diagnostics.md#e009)).

## Which fields are localized {#which-fields}

Names, titles, descriptions and narrative text are localized: `name`, `title`, `subtitle`, `description`, `contentWarning`, `modernName`, `summary`, `label`, `dateLabel`, `body`, `caption`, `alt`, and any `notes` or `note` field, wherever they appear — on a place, an entity, a waypoint, an event, a chapter, a source or a piece of media. An entity's or a participant's `commanders` is a list where each name is itself localized text, so a title can be translated even when the name underneath it is not. IDs, `kind` values, `status` values and every other machine-readable field are never localized — they stay the same string in every language.

## Declaring languages {#declaring-languages}

```json
"meta": {
  "languages": ["en", "id"],
  "defaultLanguage": "en"
}
```

`languages` must list at least one language, and `defaultLanguage` must be one of them, or the file fails to load ([E014](diagnostics.md#e014)). Adding a language here does not require translating everything immediately — it is simply the checklist the validator holds every language map against.

## Missing and unexpected translations {#missing-translations}

A language map missing one of the *other* declared languages still loads — it just warns ([W101](diagnostics.md#w101)), because a campaign is allowed to grow its translations over time:

```json
"name": { "en": "Blue Legion" }
```

with `"languages": ["en", "id"]` warns that the Indonesian translation is missing, but still plays. A key that is not in `meta.languages` at all — a typo, or a language never declared — is an error rather than a warning ([E009](diagnostics.md#e009)), because a language the engine does not know about can never be selected.

## How the app picks a language {#language-selection}

Resolving a piece of text picks, in order: the requested language, then `meta.defaultLanguage`, then whichever translation happens to come first in the map ([§7.4](contract.md#sec-7-4)). The demo app remembers the reader's UI language across the landing page and the map at [`/app/`](/app/), and its language switcher only ever offers the languages the loaded campaign actually declares in `meta.languages` — asking to switch to one it does not declare does nothing.
