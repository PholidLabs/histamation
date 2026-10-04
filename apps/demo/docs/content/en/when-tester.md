---
title: Date tester
description: Type a When string and see exactly how the engine reads it — its span in ticks, precision, qualifier and how it reads in each language.
group: tools
order: 2
tool: when-tester
---

Every date in a campaign is a `When` string, and every `When` resolves to a half-open span of ticks, `[start, end)`. This tester runs the engine's own parser, `parseWhen`, as you type, so what it shows is exactly what a campaign file gets. The rules are explained in [Time and dates](time.md).

A few things to try:

- `1825` and `1825-07-20` both mark a single date, but the first covers the whole year.
- `1825-07/1830-03` runs from the first day of July 1825 to the end of March 1830.
- `1827/..` has an open end. In a campaign it runs to the end of `meta.timeline.extent`; here it shows as open.
- `-0043-03-15` is 44 BCE: years are astronomical, so year 0 is 1 BCE.
- `1825-7-20` is rejected: months and days always take two digits. In a campaign that is error [E004](diagnostics.md#e004).
