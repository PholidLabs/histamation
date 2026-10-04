/**
 * Docs page behaviour. The pages are static HTML rendered at build time (docs/site.ts); this adds the
 * parts that need a browser: theme and language preference (shared with the landing page and the app),
 * the mobile drawer, the current-section marker in the margin, search, copy buttons, and the live tools.
 */
import './docs.css';
import { el } from '../dom.js';
import { applyThemeMode, buildThemeSeg, savedLang, savedThemeMode, storeLang, storeThemeMode, type ThemeMode } from '../prefs.js';
import { DOCS_COPY, DOC_LANGS, type DocLang } from './copy.js';

const body = document.body;
const pageLang = body.dataset.lang as DocLang | undefined;
const lang: DocLang = pageLang ?? (DOC_LANGS.includes(savedLang('') as DocLang) ? (savedLang('') as DocLang) : (navigator.language?.toLowerCase().startsWith('id') ? 'id' : 'en'));
const copy = DOCS_COPY[lang];

/* ---------------------------------------------------------------- /docs/ and /docs/<lang>/: go to the first page */
if (body.hasAttribute('data-docs-index')) {
  location.replace(`/docs/${lang}/getting-started/${location.hash}`);
}
if (pageLang) storeLang(pageLang);

/* ---------------------------------------------------------------- theme */
let themeMode: ThemeMode = savedThemeMode();
const themeHosts = [document.getElementById('theme-seg'), el('div', { class: 'seg theme-seg-mobile', role: 'group' })];
document.getElementById('sidebar')?.append(themeHosts[1]!);
function renderTheme(): void {
  for (const host of themeHosts) {
    if (!host) continue;
    buildThemeSeg(host, copy, themeMode, (m) => {
      themeMode = m;
      storeThemeMode(m);
      applyThemeMode(m);
      renderTheme();
    });
  }
}
renderTheme();
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => { if (themeMode === 'auto') applyThemeMode('auto'); });

/* ---------------------------------------------------------------- language: keep the section when switching */
document.querySelectorAll<HTMLAnchorElement>('.lang-seg a').forEach((a) => {
  a.addEventListener('click', () => {
    storeLang(a.dataset.lang ?? lang);
    if (location.hash) a.href = a.href.split('#')[0] + location.hash;
  });
});

/* ---------------------------------------------------------------- mobile drawer */
const menuBtn = document.querySelector<HTMLButtonElement>('.menu-btn');
const scrim = document.querySelector<HTMLElement>('[data-scrim]');
function setNav(open: boolean): void {
  if (!menuBtn) return;
  body.toggleAttribute('data-nav-open', open);
  if (scrim) scrim.hidden = !open;
  menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.setAttribute('aria-label', (open ? menuBtn.dataset.labelClose : menuBtn.dataset.labelOpen) ?? '');
  if (open) (document.querySelector<HTMLElement>('#sidebar a[aria-current="page"]') ?? document.querySelector<HTMLElement>('#sidebar a'))?.focus();
}
menuBtn?.addEventListener('click', () => setNav(!body.hasAttribute('data-nav-open')));
scrim?.addEventListener('click', () => setNav(false));
document.getElementById('sidebar')?.addEventListener('click', (e) => { if ((e.target as Element).closest('a')) setNav(false); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && body.hasAttribute('data-nav-open')) { setNav(false); menuBtn?.focus(); }
});
window.matchMedia('(min-width: 861px)').addEventListener('change', (e) => { if (e.matches) setNav(false); });

/* ---------------------------------------------------------------- the margin contents follows the reader */
const tocLinks = new Map<string, HTMLAnchorElement>();
document.querySelectorAll<HTMLAnchorElement>('.toc a[href^="#"]').forEach((a) => tocLinks.set(decodeURIComponent(a.hash.slice(1)), a));
if (tocLinks.size) {
  const headings = [...tocLinks.keys()].map((id) => document.getElementById(id)).filter((h): h is HTMLElement => h !== null);
  let current: HTMLAnchorElement | null = null;
  const mark = (): void => {
    // The last heading above the reading line wins; before the first, none is marked.
    const line = window.innerHeight * 0.25;
    let hit: HTMLElement | null = null;
    for (const h of headings) { if (h.getBoundingClientRect().top <= line) hit = h; else break; }
    const next = hit ? tocLinks.get(hit.id) ?? null : null;
    if (next === current) return;
    current?.removeAttribute('aria-current');
    next?.setAttribute('aria-current', 'true');
    current = next;
  };
  let queued = false;
  window.addEventListener('scroll', () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; mark(); });
  }, { passive: true });
  mark();
}

/* ---------------------------------------------------------------- copy buttons */
document.querySelectorAll<HTMLElement>('.code').forEach((block) => {
  const pre = block.querySelector('pre');
  if (!pre) return;
  const btn = el('button', { class: 'code-copy', type: 'button', 'aria-label': copy.copy }, copy.copy);
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(pre.textContent ?? '');
      btn.textContent = copy.copied;
      btn.setAttribute('data-copied', '');
      setTimeout(() => { btn.textContent = copy.copy; btn.removeAttribute('data-copied'); }, 1600);
    } catch { /* clipboard blocked: the text is still selectable */ }
  });
  block.append(btn);
});

/* ---------------------------------------------------------------- search */
interface Entry { t: string; h: string; u: string; x: string }
const dialog = document.getElementById('search') as HTMLDialogElement | null;
const input = document.getElementById('search-input') as HTMLInputElement | null;
const results = document.getElementById('search-results') as HTMLUListElement | null;
const status = document.getElementById('search-status');
const kbd = document.querySelector<HTMLElement>('[data-kbd]');
if (kbd && /Mac|iPhone|iPad/.test(navigator.platform)) kbd.textContent = '⌘ K';
let index: Promise<Entry[]> | null = null;
let selected = -1;
const fold = (s: string): string => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

function highlight(text: string, terms: string[]): Node[] {
  // Mark matched terms as text nodes: search results never go through innerHTML.
  const folded = fold(text);
  const hits: [number, number][] = [];
  for (const term of terms) {
    for (let i = folded.indexOf(term); i !== -1 && term; i = folded.indexOf(term, i + term.length)) hits.push([i, i + term.length]);
  }
  hits.sort((a, b) => a[0] - b[0]);
  const out: Node[] = [];
  let at = 0;
  for (const [s, e] of hits) {
    if (s < at) continue;
    if (s > at) out.push(document.createTextNode(text.slice(at, s)));
    out.push(el('mark', {}, text.slice(s, e)));
    at = e;
  }
  if (at < text.length) out.push(document.createTextNode(text.slice(at)));
  return out;
}

function select(i: number): void {
  const items = results ? [...results.children] as HTMLElement[] : [];
  if (!items.length) { selected = -1; return; }
  selected = (i + items.length) % items.length;
  items.forEach((li, k) => li.setAttribute('aria-selected', String(k === selected)));
  items[selected].scrollIntoView({ block: 'nearest' });
  input?.setAttribute('aria-activedescendant', items[selected].id);
}

async function runSearch(): Promise<void> {
  if (!input || !results || !status) return;
  const query = fold(input.value.trim());
  const terms = query.split(/\s+/).filter(Boolean);
  results.replaceChildren();
  selected = -1;
  input.removeAttribute('aria-activedescendant');
  if (!terms.length) { status.textContent = copy.searchHint; return; }
  let entries: Entry[];
  try {
    if (!index) status.textContent = copy.searchLoading;
    entries = await (index ??= fetch(`/docs/search-${lang}.json`).then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<Entry[]>;
    }));
  } catch {
    index = null;
    status.textContent = copy.searchFailed;
    return;
  }
  if (fold(input.value.trim()) !== query) return; // a newer keystroke owns the results
  const scored: [number, Entry][] = [];
  for (const e of entries) {
    const h = fold(e.h), t = fold(e.t), x = fold(e.x);
    let score = 0;
    for (const term of terms) {
      if (h.startsWith(term)) score += 12;
      else if (h.includes(term)) score += 8;
      else if (t.includes(term)) score += 4;
      else if (x.includes(term)) score += 1;
      else { score = 0; break; }
    }
    if (score) scored.push([score, e]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  const top = scored.slice(0, 12);
  status.textContent = top.length ? '' : copy.searchEmpty;
  top.forEach(([, e], k) => {
    results.append(el('li', { id: `sr-${k}`, role: 'option', 'aria-selected': 'false' },
      el('a', { href: e.u, tabindex: '-1' },
        el('span', { class: 'sr-title' }, ...highlight(e.h, terms)),
        e.h !== e.t ? el('span', { class: 'sr-page' }, e.t) : null,
        e.x ? el('span', { class: 'sr-text' }, ...highlight(e.x, terms)) : null)));
  });
  if (top.length) select(0);
}

function openSearch(): void {
  if (!dialog || dialog.open) return;
  dialog.showModal();
  input?.select();
}
document.querySelectorAll('[data-search-open]').forEach((b) => b.addEventListener('click', openSearch));
document.addEventListener('keydown', (e) => {
  const typing = (e.target as HTMLElement).closest('input, textarea, [contenteditable]');
  if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
    e.preventDefault();
    openSearch();
  }
});
input?.addEventListener('input', () => { void runSearch(); });
input?.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); select(selected + 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); select(selected - 1); }
  else if (e.key === 'Enter') {
    e.preventDefault();
    const a = results?.children[selected]?.querySelector('a');
    if (a) { dialog?.close(); location.href = a.href; }
  }
});
results?.addEventListener('click', (e) => { if ((e.target as Element).closest('a')) dialog?.close(); });
dialog?.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

/* ---------------------------------------------------------------- live tools, loaded only on their pages */
const toolRoot = document.getElementById('tool-root');
if (toolRoot?.dataset.tool === 'validator') void import('./validator.js').then((m) => m.mountValidator(toolRoot, lang));
else if (toolRoot?.dataset.tool === 'when-tester') void import('./when-tester.js').then((m) => m.mountWhenTester(toolRoot, lang));
