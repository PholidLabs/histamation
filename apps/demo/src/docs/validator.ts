/**
 * In-browser campaign validator: the same checks chronomap-check runs — the JSON Schema (S001) and the
 * engine's semantic loader — plus its --frames playback dry run. Campaign text is untrusted: every string
 * from the file reaches the page through textContent (el()), never innerHTML.
 */
import { chapterTime, loadCampaign, pickText, resolveFrame, ticksToIso, type CampaignFile, type Diagnostic, type NormalizedCampaign } from '@pholidlabs/chronomap-engine';
import { el } from '../dom.js';
import catalogue from '../../docs/diagnostics.json';
import { DOCS_COPY, type DocLang } from './copy.js';

type Validate = ((data: unknown) => boolean) & { errors?: { keyword: string; instancePath: string; message?: string; params: Record<string, unknown> }[] | null };

const EXAMPLES: [string, string][] = [
  ['Java War 1825', '/campaigns/java-war-1825.json'],
  ['Napoleon 1812', '/campaigns/napoleon-russia-1812.json'],
  ['Waterloo 1815', '/campaigns/waterloo-1815.json'],
  ['Null Island (fixture)', '/campaigns/fixtures/null-island.json'],
];
const FIX: Record<string, Record<DocLang, string>> = Object.fromEntries(catalogue.map((d) => [d.code, d.fix]));

let schema: Promise<Validate | null> | null = null;
/** Compiled on first use: ajv and the schema are this page's heaviest code, so they load only when needed. */
function schemaValidator(): Promise<Validate | null> {
  return (schema ??= Promise.all([import('ajv/dist/2020.js'), import('ajv-formats'), import('../../../../schema/campaign.schema.json')])
    .then(([{ default: Ajv }, { default: addFormats }, { default: json }]) => {
      const ajv = new Ajv({ allErrors: true, strict: false });
      addFormats(ajv);
      return ajv.compile(json) as Validate;
    })
    .catch(() => null));
}

/** Same grouping and wording as schemaErrors() in packages/engine/src/cli.ts. */
function schemaErrors(validate: Validate, raw: unknown): Diagnostic[] {
  if (validate(raw)) return [];
  const byPath = new Map<string, string[]>();
  for (const e of validate.errors ?? []) {
    if (['oneOf', 'anyOf', 'if', 'allOf'].includes(e.keyword)) continue;
    const msg = e.keyword === 'additionalProperties'
      ? `unknown property "${String(e.params.additionalProperty)}" (custom fields must start with "x-")`
      : e.keyword === 'enum' ? `must be one of ${(e.params.allowedValues as string[]).join(', ')}` : e.message ?? `fails "${e.keyword}"`;
    const list = byPath.get(e.instancePath) ?? [];
    if (!list.includes(msg)) list.push(msg);
    byPath.set(e.instancePath, list);
  }
  return [...byPath].map(([path, msgs]) => ({ level: 'error', code: 'S001', path: path || '/', message: msgs.join('; ') }));
}

/** The catalogue's fix text is inline Markdown; show code spans as code and links as their text. */
function inlineText(md: string): Node[] {
  return md.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').split(/`([^`]+)`/).map((part, i) => (i % 2 ? el('code', {}, part) : document.createTextNode(part)));
}

export function mountValidator(root: HTMLElement, lang: DocLang): void {
  const copy = DOCS_COPY[lang].validator;
  const textarea = el('textarea', { id: 'campaign-json', spellcheck: 'false', autocomplete: 'off', placeholder: copy.placeholder, 'aria-describedby': 'validator-help' });
  const drop = el('div', { class: 'drop' }, textarea);
  const fileInput = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
  const output = el('div', { class: 'validator-output', 'aria-live': 'polite' });
  const status = el('p', { class: 'tool-status', role: 'status' });

  const run = async (): Promise<void> => {
    output.replaceChildren();
    const text = textarea.value.trim();
    if (!text) return;
    let raw: CampaignFile;
    try {
      raw = JSON.parse(text) as CampaignFile;
    } catch (e) {
      output.append(el('p', { class: 'error-text' }, `${copy.notJson}: ${(e as Error).message}`));
      return;
    }
    const validate = await schemaValidator();
    const { campaign, diagnostics } = loadCampaign(raw);
    const all = [...(validate ? schemaErrors(validate, raw) : []), ...diagnostics];
    const count = (level: string) => all.filter((d) => d.level === level).length;
    output.append(
      el('div', { class: 'verdict', 'data-state': campaign ? 'ok' : 'rejected' },
        el('strong', {}, campaign ? copy.ok : copy.rejected),
        el('p', {}, copy.counts(count('error'), count('warning'), count('info')))),
    );
    if (!validate) output.append(el('p', { class: 'tool-status' }, copy.schemaSkipped));
    if (campaign) output.append(summary(campaign, copy));
    output.append(el('h2', { class: 'tool-heading' }, copy.diagnostics), diagnosticList(all, lang));
    if (campaign) output.append(playback(campaign, copy));
  };

  const load = (text: string): void => {
    textarea.value = text;
    void run();
  };
  const readFile = (file: File): void => { void file.text().then(load); };

  const examples = el('div', { class: 'tool-row' }, el('span', { class: 'tool-hint' }, copy.examples),
    ...EXAMPLES.map(([label, url]) => el('button', {
      class: 'chip', type: 'button',
      onclick: async () => {
        status.textContent = copy.loading;
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(String(res.status));
          load(await res.text());
          status.textContent = '';
        } catch {
          status.textContent = copy.loadFailed;
        }
      },
    }, label)));

  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.setAttribute('data-over', ''); });
  drop.addEventListener('dragleave', () => drop.removeAttribute('data-over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.removeAttribute('data-over');
    const file = e.dataTransfer?.files[0];
    if (file) readFile(file);
  });
  fileInput.addEventListener('change', () => { const f = fileInput.files?.[0]; if (f) readFile(f); fileInput.value = ''; });

  root.append(
    el('label', { class: 'tool-label', for: 'campaign-json' }, copy.input),
    examples,
    drop,
    el('div', { class: 'tool-row tool-actions' },
      el('button', { class: 'btn btn-primary', type: 'button', onclick: () => { void run(); } }, copy.validate),
      el('button', { class: 'btn', type: 'button', onclick: () => fileInput.click() }, copy.chooseFile),
      el('button', { class: 'btn', type: 'button', onclick: () => { textarea.value = ''; output.replaceChildren(); textarea.focus(); } }, copy.clear),
      fileInput),
    el('p', { id: 'validator-help', class: 'tool-status' }, copy.dropHere),
    status,
    output,
  );
}

function summary(c: NormalizedCampaign, copy: (typeof DOCS_COPY)['en']['validator']): HTMLElement {
  const title = pickText(c.meta.title, c.defaultLanguage);
  return el('dl', { class: 'facts' },
    el('dt', {}, copy.contents),
    el('dd', {}, el('strong', {}, title), el('br'), [
      `${c.factions.size} ${copy.factions}`, `${c.places.size} ${copy.places}`, `${c.entities.length} ${copy.entities}`,
      `${c.events.length} ${copy.events}`, `${c.chapters.length} ${copy.chapters}`,
    ].join(', ')));
}

function diagnosticList(list: Diagnostic[], lang: DocLang): HTMLElement {
  const copy = DOCS_COPY[lang].validator;
  if (!list.length) return el('p', {}, copy.none);
  const order: Record<string, number> = { error: 0, warning: 1, info: 2 };
  // The fix is per code, not per finding: show it on the first row of each code only.
  const hinted = new Set<string>();
  return el('ul', { class: 'diag-rows' }, ...[...list].sort((a, b) => order[a.level] - order[b.level]).map((d) => {
    const fix = hinted.has(d.code) ? undefined : FIX[d.code]?.[lang];
    hinted.add(d.code);
    return el('li', { class: `row-${d.level}` },
      el('a', { class: 'diag-code', href: `/docs/${lang}/diagnostics/#${d.code.toLowerCase()}`, title: DOCS_COPY[lang].levelName[d.level] }, d.code),
      el('div', {},
        el('span', {}, d.message),
        el('span', { class: 'row-path' }, `${copy.path}: ${d.path || '/'}`),
        fix ? el('span', { class: 'row-fix' }, `${copy.howToFix}: `, ...inlineText(fix)) : null));
  }));
}

function playback(c: NormalizedCampaign, copy: (typeof DOCS_COPY)['en']['validator']): HTMLElement {
  const lang = c.defaultLanguage;
  const names = new Map<string, string>([
    ...c.events.map((e) => [e.id, pickText(e.raw.name, lang)] as [string, string]),
    ...c.entities.map((e) => [e.id, pickText(e.raw.name, lang)] as [string, string]),
  ]);
  const section = el('section', { class: 'playback' }, el('h2', { class: 'tool-heading' }, copy.playback), el('p', { class: 'tool-status' }, copy.playbackNote));
  for (const ch of c.chapters) {
    const rows = [0, 0.5, 1].map((p) => {
      const t = chapterTime(ch, p);
      const f = resolveFrame(c, t, { includeTrail: false });
      const active = f.events.filter((e) => e.phase === 'active').map((e) => names.get(e.id) ?? e.id);
      const moving = f.entities.filter((e) => e.kind === 'unit' && e.moving)
        .map((u) => `${names.get(u.id) ?? u.id} ${Math.round((u.legProgress ?? 0) * 100)}%`);
      return el('tr', {},
        el('th', { scope: 'row' }, `p = ${p.toFixed(1)}`),
        el('td', {}, el('code', {}, ticksToIso(t).slice(0, 16))),
        el('td', {}, `${copy.activeEvents}: ${active.join(', ') || copy.nothing}`),
        el('td', {}, `${copy.movingUnits}: ${moving.join(', ') || copy.nothing}`));
    });
    section.append(el('details', {},
      el('summary', {}, pickText(ch.raw.title, lang), el('span', {}, ch.raw.when ?? '')),
      el('table', {}, el('tbody', {}, ...rows))));
  }
  return section;
}
