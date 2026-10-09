import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadCampaign } from '../dist/index.js';

const base = JSON.parse(readFileSync(new URL('../../../data/campaigns/fixtures/null-island.json', import.meta.url), 'utf8'));
const mutate = (fn) => { const c = structuredClone(base); fn(c); return loadCampaign(c).diagnostics.map((d) => d.code); };

test('the loader catches contract violations', () => {
  assert.ok(loadCampaign('not an object').diagnostics.some((d) => d.code === 'E000'), 'not a JSON object');
  assert.ok(mutate((c) => { c.places[1].id = 'harbor'; }).includes('E001'), 'duplicate id');
  assert.ok(mutate((c) => { c.chapters[0].focus.push('nowhere'); }).includes('E002'), 'dangling reference');
  assert.ok(mutate((c) => { c.entities[0].faction = 'harbor'; }).includes('E003'), 'wrong reference type');
  assert.ok(mutate((c) => { c.events[0].when = '1825-7-20'; }).includes('E004'), 'bad when');
  assert.ok(mutate((c) => { c.events[0].when = '1825-07-20'; }).includes('E005'), 'outside extent');
  assert.ok(mutate((c) => { c.entities[0].track[1].when = '-0010-04-01'; }).includes('E006'), 'track out of order');
  assert.ok(mutate((c) => { c.entities[1].states.reverse(); }).includes('E007'), 'states out of order');
  assert.ok(mutate((c) => { c.chapters[0].title = { id: 'Berkumpul' }; }).includes('E008'), 'missing default language');
  assert.ok(mutate((c) => { c.chapters[0].title.fr = 'Rassemblement'; }).includes('E009'), 'undeclared language');
  assert.ok(mutate((c) => { c.entities[2].geometry.coordinates[0].pop(); }).includes('E010'), 'open polygon ring');
  assert.ok(mutate((c) => { c.places[0].coordinates = [0, 91]; }).includes('E011'), 'latitude out of range');
  assert.ok(mutate((c) => { c.places[0].coordinates = ['0.5', '0.5']; }).includes('E011'), 'numeric strings are not coordinates');
  assert.ok(mutate((c) => { c.places[0].coordinates = [null, null]; }).includes('E011'), 'null is not a coordinate');
  assert.ok(mutate((c) => { c.meta.defaultLanguage = 'fr'; }).includes('E014'), 'default language not declared');
  assert.ok(mutate((c) => { c.events[0].participants[0].losses = { min: 9, max: 1 }; }).includes('E012'), 'min > max');
  assert.ok(mutate((c) => { c.histamation = '2.0'; }).includes('E013'), 'unsupported version');
  assert.ok(mutate((c) => { c.chapters[1].body.en = 'Click [here](javascript:alert(1))'; }).includes('E015'), 'unsafe url');
  assert.ok(mutate((c) => { c.chapters[1].body.en = '<img src=x onerror=alert(1)>'; }).includes('E017'), 'raw html');
  assert.ok(mutate((c) => { delete c.entities[4].at; }).includes('E016'), 'custom kind without geometry');
  assert.ok(mutate((c) => { c.chapters = []; }).includes('E018'), 'no chapters');
  assert.ok(mutate((c) => { delete c.chapters; }).includes('E018'), 'chapters missing');
  assert.ok(mutate((c) => { c.places[2].coordinates = [50, 0.4]; }).includes('W102'), 'outside map bounds');
});

test('the loader warns about suspicious data without rejecting it', () => {
  const cases = [
    ['W101', 'missing translation', (c) => { delete c.chapters[0].title.id; }],
    ['W103', 'chapter moves no camera', (c) => { c.chapters[1].focus = []; }],
    ['W104', 'chapter starts before the previous one', (c) => { c.chapters[3].when = '-0010-04'; }],
    ['W105', 'unreferenced place', (c) => { c.places.push({ ...c.places[0], id: 'orphan' }); }],
    ['W107', 'zero-duration leg', (c) => { c.entities[0].track[1].when = '-0010-05-25'; }],
    ['W109', 'leg across the antimeridian', (c) => { c.entities[0].track[1].via = [[170, 0], [-170, 0]]; }],
    ['W112', 'focus on an event that has not happened', (c) => { c.chapters[0].focus.push('new-era'); }],
    ['W113', 'track outlives the entity', (c) => { c.entities[0].when = '-0010-03/-0009-06'; }],
    ['W114', 'event without sources', (c) => { delete c.events[0].sources; }],
  ];
  const baseline = loadCampaign(structuredClone(base)).diagnostics.map((d) => d.code);
  for (const [code, why, fn] of cases) {
    assert.ok(!baseline.includes(code), `${code} already fires on the unmodified fixture`);
    const c = structuredClone(base);
    fn(c);
    const { campaign, diagnostics } = loadCampaign(c);
    assert.ok(diagnostics.some((d) => d.code === code), `${code}: ${why}`);
    assert.ok(campaign, `${code}: a warning must not reject the file`);
  }
});

test('the shipped campaigns load without errors', () => {
  for (const p of ['austro-prussian-1866.json', 'java-war-1825.json', 'napoleon-russia-1812.json', 'waterloo-1815.json']) {
    const raw = JSON.parse(readFileSync(new URL(`../../../data/campaigns/${p}`, import.meta.url), 'utf8'));
    const { campaign, diagnostics } = loadCampaign(raw);
    assert.ok(campaign, p);
    assert.equal(diagnostics.filter((d) => d.level === 'error').length, 0, p);
  }
});
