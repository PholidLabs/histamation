#!/usr/bin/env node
/**
 * chronomap-check — validate campaign files and dry-run playback.
 *   chronomap-check <campaign.json>... [--frames] [--strict] [--quiet] [--json] [--vectors <dir>]
 * Structural (JSON Schema) validation runs when ajv is installed; semantics always run.
 * --vectors writes <dir>/time.json and a <name>.frames.json golden vector per campaign;
 * campaigns under a `fixtures/` directory get the detailed form (see vectors.ts).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCampaign } from './campaign.js';
import { chapterTime, resolveFrame } from './resolve.js';
import { pickText } from './format.js';
import { frameVectors, timeVectors } from './vectors.js';
import type { CampaignFile, Diagnostic, NormalizedCampaign } from './types.js';

const here = dirname(fileURLToPath(import.meta.url));
const USAGE = 'usage: chronomap-check <campaign.json>... [--frames] [--strict] [--quiet] [--json] [--vectors <dir>]';
const KNOWN_FLAGS: Record<string, true> = { '--frames': true, '--strict': true, '--quiet': true, '--json': true };
const args = process.argv.slice(2);
const vi = args.indexOf('--vectors');
const vectorsDir = vi >= 0 ? args[vi + 1] : undefined;
const rest = vi >= 0 ? args.filter((_, i) => i !== vi && i !== vi + 1) : args;
const flags = new Set(rest.filter((a) => a.startsWith('--')));
const files = rest.filter((a) => !a.startsWith('--'));
const unknown = [...flags].filter((f) => !KNOWN_FLAGS[f]);
if (!files.length || unknown.length || (vi >= 0 && (!vectorsDir || vectorsDir.startsWith('--')))) {
  if (unknown.length) console.error(`unknown option: ${unknown.join(', ')}`);
  console.error(USAGE);
  process.exit(2);
}

/** Compiled once for all files. Null when ajv is not installed; the semantic checks still run. */
async function compileSchema() {
  // Dynamic on purpose: ajv is only a devDependency, so it may be absent wherever the CLI runs.
  const mods = await Promise.all([import('ajv/dist/2020.js'), import('ajv-formats')]).catch(() => null);
  if (!mods) {
    console.error('note: ajv is not installed, so JSON Schema (S001) checks are skipped; semantic checks still run');
    return null;
  }
  const [{ default: Ajv }, { default: addFormats }] = mods;
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  // The build copies the schema next to this file (scripts/copy-schema.mjs), so the path holds once published.
  return ajv.compile(JSON.parse(readFileSync(resolvePath(here, 'campaign.schema.json'), 'utf8')));
}
const validateSchema = await compileSchema();

function schemaErrors(raw: unknown): Diagnostic[] {
  if (!validateSchema || validateSchema(raw)) return [];
  const byPath = new Map<string, string[]>();
  for (const e of validateSchema.errors ?? []) {
    if (['oneOf', 'anyOf', 'if', 'allOf'].includes(e.keyword)) continue;
    const msg = e.keyword === 'additionalProperties'
      ? `unknown property "${e.params.additionalProperty}" (custom fields must start with "x-")`
      : e.keyword === 'enum' ? `must be one of ${e.params.allowedValues.join(', ')}` : e.message ?? `fails "${e.keyword}"`;
    const list = byPath.get(e.instancePath) ?? [];
    if (!list.includes(msg)) list.push(msg);
    byPath.set(e.instancePath, list);
  }
  return [...byPath].map(([path, msgs]) => ({ level: 'error' as const, code: 'S001', path: path || '/', message: msgs.join('; ') }));
}

/** Loader diagnostics stay separate from schema ones: only the former belong in vectors. */
async function check(file: string): Promise<{ campaign: NormalizedCampaign | null; schema: Diagnostic[]; diagnostics: Diagnostic[] }> {
  let raw: CampaignFile;
  try { raw = JSON.parse(readFileSync(file, 'utf8')); } catch (e) {
    return { campaign: null, schema: [], diagnostics: [{ level: 'error', code: 'E000', path: '', message: `Cannot read JSON: ${(e as Error).message}` }] };
  }
  const { campaign, diagnostics } = loadCampaign(raw);
  return { campaign, schema: schemaErrors(raw), diagnostics };
}

const fmtCoord = (c?: [number, number] | null) => (c ? `[${c[0].toFixed(3)}, ${c[1].toFixed(3)}]` : '—');
let exitCode = 0;
const report: unknown[] = [];

const written: string[] = [];
const writeVector = (name: string, text: string): void => {
  const path = join(vectorsDir!, name);
  writeFileSync(path, text);
  written.push(path);
};
if (vectorsDir) writeVector('time.json', timeVectors());

for (const file of files) {
  const { campaign, schema, diagnostics: loaded } = await check(file);
  const diagnostics = [...schema, ...loaded];
  const counts = { error: 0, warning: 0, info: 0 } as Record<string, number>;
  diagnostics.forEach((d) => { counts[d.level]++; });
  if (counts.error || (flags.has('--strict') && counts.warning)) exitCode = 1;
  report.push({ file, counts, diagnostics });
  if (vectorsDir && campaign) {
    const parts = file.split(/[\\/]/);
    writeVector(`${basename(file, '.json')}.frames.json`, frameVectors(campaign, loaded, parts.join('/'), parts.includes('fixtures')));
  }
  if (flags.has('--json')) continue;

  console.log(`\n${file}`);
  console.log(`  ${counts.error} error(s), ${counts.warning} warning(s), ${counts.info} info`);
  for (const d of diagnostics) {
    if (flags.has('--quiet') && d.level !== 'error') continue;
    if (d.level === 'info' && !flags.has('--frames')) continue;
    console.log(`  ${d.level.padEnd(7)} ${d.code} ${d.path}  ${d.message}`);
  }
  if (!campaign) continue;
  console.log(`  ${campaign.factions.size} factions · ${campaign.places.size} places · ${campaign.entities.length} entities · ${campaign.events.length} events · ${campaign.chapters.length} chapters`);

  if (flags.has('--frames')) {
    const lang = campaign.defaultLanguage;
    console.log('\n  Playback dry-run (p = scroll progress through the chapter):');
    for (const ch of campaign.chapters) {
      console.log(`\n  ▸ ${ch.id} — ${pickText(ch.raw.title, lang)}  [${ch.raw.when}]`);
      for (const p of [0, 0.5, 1]) {
        const t = chapterTime(ch, p);
        const f = resolveFrame(campaign, t, { includeTrail: false });
        const active = f.events.filter((e) => e.phase === 'active').map((e) => e.id);
        const units = f.entities.filter((e) => e.kind === 'unit')
          .map((u) => `${u.id}@${fmtCoord(u.position)}${u.moving ? `→${((u.legProgress ?? 0) * 100).toFixed(0)}%` : ''}${u.status !== 'active' ? `(${u.status})` : ''}${u.strength ? ` n=${u.strength}` : ''}`);
        console.log(`    p=${p.toFixed(1)} ${f.iso.slice(0, 16)}  active: ${active.join(', ') || '—'}`);
        if (units.length) console.log(`           units: ${units.join('; ')}`);
      }
    }
  }
}
if (flags.has('--json')) console.log(JSON.stringify(report, null, 2));
else if (written.length) console.log(`\nwrote ${written.join(', ')}`);
process.exit(exitCode);
