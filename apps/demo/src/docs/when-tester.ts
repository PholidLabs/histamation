/** Live When-string tester: runs the engine's own parser, so what it shows is what a campaign file gets. */
import { formatWhen, parseWhen, ticksToIso, WhenError, type ParsedDate } from '@pholidlabs/chronomap-engine';
import { el } from '../dom.js';
import { DOCS_COPY, DOC_LANGS, type DocLang } from './copy.js';

const EXAMPLES = ['1825', '1825-07', '1825-07-20', '1830-03-28T10:00', '1826-10-12~', '1828-11-12?', '1825-07/1830-03', '1827/..', '-0043-03-15'];

export function mountWhenTester(root: HTMLElement, lang: DocLang): void {
  const copy = DOCS_COPY[lang].when;
  const input = el('input', { id: 'when-input', class: 'when-input', type: 'text', value: '1825-07-20', placeholder: copy.placeholder, spellcheck: 'false', autocomplete: 'off' });
  const out = el('div', { 'aria-live': 'polite' });

  const bound = (value: number | null, iso: boolean): Node => (value === null
    ? document.createTextNode(copy.open)
    : el('span', {}, el('code', {}, iso ? ticksToIso(value) : String(value)), iso ? el('span', { class: 'tool-hint' }, `  ${copy.ticks}: ${value}`) : null));
  const dateFacts = (d: ParsedDate | null): string => (d
    ? `${copy.precisions[d.precision] ?? d.precision}${d.qualifier ? `, ${copy.qualifiers[d.qualifier]}` : ''}`
    : copy.open);

  const render = (): void => {
    out.replaceChildren();
    const text = input.value.trim();
    if (!text) return;
    let w;
    try {
      w = parseWhen(text);
    } catch (e) {
      out.append(el('p', { class: 'error-text' }, `${copy.invalid}: ${e instanceof WhenError ? e.message : String(e)}`));
      return;
    }
    const facts = el('dl', { class: 'facts' },
      el('dt', {}, copy.kind), el('dd', {}, w.isInterval ? copy.interval : copy.instant),
      ...DOC_LANGS.flatMap((l) => [el('dt', {}, `${copy.reads} (${l.toUpperCase()})`), el('dd', { lang: l }, formatWhen(text, l))]),
      el('dt', {}, copy.start), el('dd', {}, bound(w.start, true)),
      el('dt', {}, copy.end), el('dd', {}, bound(w.end, true)));
    if (w.isInterval) {
      facts.append(el('dt', {}, copy.from), el('dd', {}, dateFacts(w.from)), el('dt', {}, copy.to), el('dd', {}, dateFacts(w.to)));
    } else {
      facts.append(el('dt', {}, copy.precision), el('dd', {}, copy.precisions[w.from!.precision] ?? w.from!.precision),
        el('dt', {}, copy.qualifier), el('dd', {}, w.from!.qualifier ? copy.qualifiers[w.from!.qualifier] : copy.noQualifier));
    }
    if (w.start !== null && w.end !== null) {
      const seconds = w.end - w.start;
      facts.append(el('dt', {}, copy.duration), el('dd', {}, seconds % 86400 === 0 ? copy.days(seconds / 86400) : copy.seconds(seconds)));
    }
    out.append(facts);
  };

  input.addEventListener('input', render);
  root.append(
    el('label', { class: 'tool-label', for: 'when-input' }, copy.input),
    input,
    el('div', { class: 'tool-row tool-examples' }, el('span', { class: 'tool-hint' }, copy.examples),
      ...EXAMPLES.map((ex) => el('button', { class: 'chip', type: 'button', onclick: () => { input.value = ex; render(); input.focus(); } }, ex))),
    out,
  );
  render();
}
