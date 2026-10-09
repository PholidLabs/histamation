/**
 * Golden vectors (contract §13): this reference implementation's output, frozen as JSON.
 * The Rust core replays them in crates/histamation-core/tests/vectors.rs, so they are the
 * acceptance gate for the port. Written by `histamation-check --vectors <dir>`.
 */
import { chapterTime, resolveFrame } from './resolve.js';
import { parseWhen, ticksToIso } from './time.js';
import type { Diagnostic, NormalizedCampaign } from './types.js';

/** Every precision and qualifier, leap days, year zero and BCE, open ends — then the rejects. */
const TIME_INPUTS = [
  '1825', '1825-07', '1825-07-20', '1825-07-20T14:30', '1825-07-20T14:30:05',
  '1827~', '1828-11-12?', '1830-03%', '1600-02-29', '2000-02-29', '1970-01-01', '1969-12-31',
  '0000', '0000-03-01', '-0001-12-31', '-0043-03-15', '-9999-01-01', '9999-12-31',
  '1825-07-28/1825-09-25', '1825-07-21/1825-09~', '1827/..', '../1830-03-28',
  '1830-03-28/1830-03-28', '1830-03-08T12:00/1830-03-27', '-0010-03/-0010-05-24',
  '1900-02-29', '1825-13', '1825-00', '1825-07-32', '1825-7-20', '825', '-0000',
  '1825-07-20T24:00', '../..', '1830/1829', '1825/', '/1825', '1825-07-20Z', '1825~?',
  'Y170000', '2001-21', '201X', '',
];

export function timeVectors(): string {
  const cases = TIME_INPUTS.map((input) => {
    try {
      const w = parseWhen(input);
      return {
        input, ok: true, isInterval: w.isInterval, start: w.start, end: w.end,
        startIso: w.start === null ? null : ticksToIso(w.start),
        endIso: w.end === null ? null : ticksToIso(w.end),
        fromPrecision: w.from?.precision ?? null, toPrecision: w.to?.precision ?? null,
        fromQualifier: w.from?.qualifier ?? null, toQualifier: w.to?.qualifier ?? null,
      };
    } catch (e) {
      return { input, ok: false, error: (e as Error).message };
    }
  });
  const description = 'EDTF-subset parsing. start/end are ticks (seconds since 1970-01-01, proleptic Gregorian); '
    + 'end is exclusive; null = open end before resolution against the timeline extent.';
  return `${JSON.stringify({ description, cases }, null, 2)}\n`;
}

/** Floats to 1e-6, the conformance tolerance, so the files stay small and diffable. Ticks are integers and pass through. */
const round6 = (_key: string, v: unknown): unknown =>
  typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1e6) / 1e6 : v;

/**
 * Frames at scroll progress p through every chapter, plus the loader's diagnostics.
 * A `detailed` vector (synthetic fixtures) samples quarter steps and carries full trail
 * polylines; otherwise p = 0, .5, 1 with trail lengths only, one frame per line so a
 * semantics change shows up as a readable diff.
 */
export function frameVectors(campaign: NormalizedCampaign, diagnostics: Diagnostic[], source: string, detailed: boolean): string {
  const ps = detailed ? [0, 0.25, 0.5, 0.75, 1] : [0, 0.5, 1];
  const frames = campaign.chapters.flatMap((ch) => ps.map((p) => {
    const t = chapterTime(ch, p);
    return { chapter: ch.id, p, t, frame: resolveFrame(campaign, t, { includeTrail: detailed }) };
  }));
  const description = `resolveFrame() at scroll progress p through each chapter of ${source}`;
  const diags = diagnostics.map(({ level, code, path }) => ({ level, code, path }));
  if (detailed) return `${JSON.stringify({ description, diagnostics: diags, frames }, round6, 1)}\n`;
  const lines = frames.map((f) => JSON.stringify(f, round6));
  return `{"description":${JSON.stringify(description)},\n"diagnostics":${JSON.stringify(diags)},\n"frames":[\n${lines.join(',\n')}\n]}\n`;
}
