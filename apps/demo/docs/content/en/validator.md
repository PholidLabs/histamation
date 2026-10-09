---
title: Campaign validator
description: Check a campaign file in the browser with the same schema and semantic checks as histamation-check, and preview its playback.
group: tools
order: 1
tool: validator
---

Paste a campaign file below, drop one onto the box, or load one of the shipped examples. The check runs entirely in your browser. Nothing is uploaded.

It runs the same two layers as the [command-line checker](cli.md):

- **Structure**: the JSON Schema in [campaign.schema.json](gh:schema/campaign.schema.json). Failures are reported as [S001](diagnostics.md#s001).
- **Semantics**: the engine's own loader, `loadCampaign`, which checks references, dates, coordinates and everything else the schema cannot express. Each finding has a code you can look up in [Diagnostics](diagnostics.md).

A file with any error is rejected: the map app would refuse to play it. Warnings and info never reject a file.

When the file passes, the playback dry run shows each chapter at the start, middle and end of its scroll range: the date the clock reads, the events happening and the units on the move. It is the quickest way to catch a date that puts a march in the wrong chapter.

> [!TIP]
> Validate from a terminal or in CI with `node packages/engine/dist/cli.js your-campaign.json --strict`. See [CLI](cli.md).
