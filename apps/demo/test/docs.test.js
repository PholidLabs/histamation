import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const headings = (md) => md.split('\n').filter((l) => /^#{2,3} /.test(l)).map((l) => l.match(/^(#{2,3}) (\d+(?:\.\d+)*)/)?.slice(1, 3).join(' ') ?? l);
const tableCodes = (md) => [...md.matchAll(/^\| ([ESWI]\d{3}) \|/gm)].map((m) => m[1]);

test('the Indonesian contract has the same numbered sections and diagnostic table as the normative English', () => {
  const en = read('docs/DATA-CONTRACT.md'), id = read('docs/id/DATA-CONTRACT.md');
  assert.deepEqual(headings(id), headings(en), 'section headings drifted: translate the new or renamed sections');
  assert.deepEqual(tableCodes(id), tableCodes(en), '§8 diagnostic table drifted');
});

test('every diagnostic the loader can emit is documented, in both languages', () => {
  const emitted = new Set([...read('packages/engine/src/campaign.ts').matchAll(/\b(?:err|warn|info)\('([EWI]\d{3})'/g)].map((m) => m[1]));
  emitted.add('S001'); // cli.ts, from the JSON Schema
  const catalogue = JSON.parse(read('apps/demo/docs/diagnostics.json'));
  const documented = catalogue.map((d) => d.code);
  assert.deepEqual([...emitted].filter((c) => !documented.includes(c)), [], 'codes with no entry in apps/demo/docs/diagnostics.json');
  assert.deepEqual(documented.filter((c) => !emitted.has(c)), [], 'entries for codes the loader never emits');
  assert.equal(new Set(documented).size, documented.length, 'duplicate entries');
  for (const d of catalogue) {
    for (const field of ['title', 'trigger', 'fix']) {
      for (const lang of ['en', 'id']) assert.ok(d[field]?.[lang]?.trim(), `${d.code}.${field}.${lang} is empty`);
    }
  }
});
