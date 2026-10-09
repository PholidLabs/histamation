/**
 * Docs site builder. Runs in Node, inside vite.config.ts (the docsSite plugin): it reads the Markdown
 * in docs/content/<lang>/, the data contract, and docs/diagnostics.json, renders every page to static
 * HTML and checks every internal link. Nothing here ships to the browser.
 *
 * Link conventions (enforced; a broken one fails the build):
 *   page.md, page.md#id   another docs page in the same language
 *   gh:path/in/repo       a repository file, linked on GitHub
 *   /app/, /              the map app, the landing page
 *   https://…             external
 * Relative links inside the contract files resolve against the file, as they do on GitHub.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, posix, relative, resolve } from 'node:path';
import MarkdownIt, { type MarkdownIt as Md, type StateCore, type Token } from 'markdown-it';
import { createHighlighter, type Highlighter, type ThemeRegistration } from 'shiki';
import { DOCS_COPY, DOC_LANGS, GROUP_ORDER, type DocGroup, type DocLang } from '../src/docs/copy.js';

export const DOCS_DIR = import.meta.dirname;
export const REPO_ROOT = resolve(DOCS_DIR, '../../..');
export const CONTENT_DIR = join(DOCS_DIR, 'content');
export const DIAGNOSTICS_FILE = join(DOCS_DIR, 'diagnostics.json');
export const CONTRACT_SOURCE: Record<DocLang, string> = { en: 'docs/DATA-CONTRACT.md', id: 'docs/id/DATA-CONTRACT.md' };
export const REPO_URL = 'https://github.com/PholidLabs/histamation';
const FENCE_LANGS: Record<string, true> = { json: true, jsonc: true, ts: true, js: true, bash: true, rust: true, text: true };
const TOOLS: Record<string, true> = { validator: true, 'when-tester': true };
const CALLOUTS: Record<string, 'note' | 'tip' | 'warning'> = { NOTE: 'note', TIP: 'tip', WARNING: 'warning' };

export interface TocItem { level: 2 | 3; id: string; text: string }
export interface SearchEntry { t: string; h: string; u: string; x: string }
export interface DocPage {
  lang: DocLang; slug: string; title: string; description: string; group: DocGroup; order: number;
  /** Repository path of the Markdown source, for the edit link. */
  source: string;
  html: string; toc: TocItem[]; ids: Set<string>; search: SearchEntry[]; tool: string | null;
}
export interface DocsSite { pages: DocPage[]; errors: string[] }
export interface Diagnostic {
  code: string; level: 'error' | 'warning' | 'info';
  title: Record<DocLang, string>; trigger: Record<DocLang, string>; fix: Record<DocLang, string>;
  example?: { bad?: string; good?: string };
}

interface LinkRef { from: string; lang: DocLang; slug: string; hash: string }
/** A type alias, not an interface, so it satisfies markdown-it's open `Env` record. */
type RenderEnv = {
  lang: DocLang; slug: string; source: string; allowH1: boolean;
  h1: string | null; ids: Set<string>; toc: TocItem[]; links: LinkRef[]; errors: string[];
};

export const pageUrl = (lang: string, slug: string): string => `/docs/${lang}/${slug}/`;
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ------------------------------------------------------------------ code highlighting */
// Built from the site palette rather than a stock theme: the stock dark themes are blue-black and
// clash with the parchment. Colours hold 4.5:1 against the code background in both themes.
const codeTheme = (name: string, type: 'light' | 'dark', c: Record<string, string>): ThemeRegistration => ({
  name, type,
  colors: { 'editor.background': c.bg, 'editor.foreground': c.fg },
  tokenColors: [
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: c.comment, fontStyle: 'italic' } },
    { scope: ['string', 'string.quoted', 'punctuation.definition.string'], settings: { foreground: c.string } },
    { scope: ['support.type.property-name', 'support.type.property-name.json', 'meta.object-literal.key'], settings: { foreground: c.key } },
    { scope: ['constant.numeric', 'constant.language', 'constant.character', 'constant.other'], settings: { foreground: c.number } },
    { scope: ['keyword', 'storage', 'storage.type', 'storage.modifier', 'keyword.control', 'keyword.operator.new'], settings: { foreground: c.keyword } },
    { scope: ['entity.name.function', 'support.function', 'meta.function-call'], settings: { foreground: c.fn } },
    { scope: ['entity.name.type', 'support.type', 'support.class', 'entity.name.class', 'entity.other.inherited-class'], settings: { foreground: c.type } },
    { scope: ['punctuation', 'meta.brace', 'keyword.operator'], settings: { foreground: c.punct } },
  ],
});
const LIGHT = codeTheme('histamation-light', 'light', {
  bg: '#EBE3D0', fg: '#211C15', comment: '#6E604A', string: '#2C625D', key: '#6E5119', number: '#8B3A2B',
  keyword: '#7A5A24', fn: '#5C3A1C', type: '#3E5F5A', punct: '#5C503E',
});
const DARK = codeTheme('histamation-dark', 'dark', {
  bg: '#1C1815', fg: '#EDE4D8', comment: '#9A8E7F', string: '#A8C8B4', key: '#E3C68A', number: '#E09A7A',
  keyword: '#C9A25A', fn: '#EBC49A', type: '#9FC1BA', punct: '#B8AC9D',
});

let highlighter: Promise<Highlighter> | null = null;
const getHighlighter = (): Promise<Highlighter> =>
  (highlighter ??= createHighlighter({ themes: [LIGHT, DARK], langs: ['json', 'jsonc', 'ts', 'js', 'bash', 'rust'] }));

/* ------------------------------------------------------------------ Markdown */
function plainText(inline: Token): string {
  // Soft and hard breaks are word boundaries: dropping them glues the last word of a line to the next.
  return (inline.children ?? []).map((c) => (c.type === 'text' || c.type === 'code_inline' ? c.content : c.type.endsWith('break') ? ' ' : '')).join('').trim();
}
export function slugify(text: string): string {
  return text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '').trim().replace(/[\s-]+/g, '-').replace(/^-|-$/g, '') || 'section';
}

/** Where a link in `env.source` points: rewritten href, plus the page it must resolve to, if internal. */
function resolveHref(href: string, env: RenderEnv): string {
  const [path, hash = ''] = href.split('#') as [string, string?];
  if (/^(https?:|mailto:)/i.test(href)) return href;
  if (href === '/' || href === '/app/') return href;
  if (path === '') {
    env.links.push({ from: env.source, lang: env.lang, slug: env.slug, hash });
    return href;
  }
  let repoPath: string;
  if (path.startsWith('gh:')) repoPath = posix.normalize(path.slice(3)).replace(/^\/+/, '');
  else if (!/^[a-z]+:/i.test(path) && !path.startsWith('/')) repoPath = posix.normalize(posix.join(posix.dirname(env.source), path));
  else { env.errors.push(`${env.source}: unsupported link "${href}" (use page.md, gh:path, /app/, / or https://)`); return href; }

  const content = /^apps\/demo\/docs\/content\/(en|id)\/([a-z0-9-]+)\.md$/.exec(repoPath);
  const contract = (Object.entries(CONTRACT_SOURCE) as [DocLang, string][]).find(([, p]) => p === repoPath);
  if (content || contract) {
    const lang = (content ? content[1] : contract![0]) as DocLang;
    const slug = content ? content[2] : 'contract';
    env.links.push({ from: env.source, lang, slug, hash });
    return pageUrl(lang, slug) + (hash ? `#${hash}` : '');
  }
  const abs = join(REPO_ROOT, repoPath);
  if (repoPath.startsWith('..') || !existsSync(abs)) {
    env.errors.push(`${env.source}: link "${href}" points at ${repoPath}, which does not exist in the repository`);
    return href;
  }
  return `${REPO_URL}/${statSync(abs).isDirectory() ? 'tree' : 'blob'}/main/${repoPath}${hash ? `#${hash}` : ''}`;
}

function createMarkdown(hl: Highlighter): Md {
  // html: false — the Markdown is ours, but escaping raw HTML keeps it that way.
  const md = new MarkdownIt({ html: false, linkify: false, typographer: false });

  md.core.ruler.push('docs_structure', (state: StateCore) => {
    const env = state.env as unknown as RenderEnv;
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.type === 'heading_open') {
        const inline = tokens[i + 1];
        if (t.tag === 'h1') {
          if (!env.allowH1 || env.h1 !== null) env.errors.push(`${env.source}: no "#" headings — the title comes from front matter`);
          env.h1 = plainText(inline);
          t.meta = tokens[i + 1].meta = tokens[i + 2].meta = { drop: true };
          continue;
        }
        const children = inline.children ?? [];
        const last = children[children.length - 1];
        let id: string | null = null;
        const m = last?.type === 'text' ? /\s*\{#([a-z0-9-]+)\}\s*$/.exec(last.content) : null;
        if (m && last) { id = m[1]; last.content = last.content.slice(0, m.index); }
        const text = plainText(inline);
        if (!id) {
          const numbered = /^(\d+(?:\.\d+)*)\.?\s/.exec(text);
          id = numbered ? `sec-${numbered[1].split('.').join('-')}` : slugify(text);
        }
        let unique = id;
        for (let k = 2; env.ids.has(unique); k++) unique = `${id}-${k}`;
        env.ids.add(unique);
        t.attrSet('id', unique);
        if (t.tag === 'h2' || t.tag === 'h3') env.toc.push({ level: t.tag === 'h2' ? 2 : 3, id: unique, text });
      } else if (t.type === 'blockquote_open' && tokens[i + 1]?.type === 'paragraph_open') {
        const inline = tokens[i + 2];
        const first = inline.children?.[0];
        const m = first?.type === 'text' ? /^\[!([A-Z]+)\]\s*/.exec(first.content) : null;
        if (!m || !first) continue;
        const kind = CALLOUTS[m[1]];
        if (!kind) { env.errors.push(`${env.source}: unknown callout [!${m[1]}] (use NOTE, TIP or WARNING)`); continue; }
        first.content = first.content.slice(m[0].length);
        if (!first.content && inline.children![1]?.type === 'softbreak') inline.children!.splice(0, 2);
        t.meta = { callout: kind };
        for (let j = i + 1; j < tokens.length; j++) {
          if (tokens[j].type === 'blockquote_close' && tokens[j].level === t.level) { tokens[j].meta = { callout: kind }; break; }
        }
      }
    }
    state.tokens = tokens.filter((t) => !t.meta?.drop);
  });

  const rules = md.renderer.rules;
  // markdown-it types env as its own open record; ours is always the RenderEnv passed to parse().
  rules.heading_close = (tokens, idx, _opts, e) => {
    const env = e as unknown as RenderEnv;
    const open = tokens[idx - 2];
    const id = open.attrGet('id');
    const anchor = id && (open.tag === 'h2' || open.tag === 'h3')
      ? `<a class="h-anchor" href="#${id}" aria-label="${esc(DOCS_COPY[env.lang].sectionLink)}">#</a>` : '';
    return `${anchor}</${tokens[idx].tag}>\n`;
  };
  rules.blockquote_open = (tokens, idx, _opts, e) => {
    const env = e as unknown as RenderEnv;
    const kind = tokens[idx].meta?.callout as 'note' | 'tip' | 'warning' | undefined;
    if (!kind) return '<blockquote>\n';
    return `<aside class="callout callout-${kind}"><p class="callout-title">${esc(DOCS_COPY[env.lang][kind])}</p>\n`;
  };
  rules.blockquote_close = (tokens, idx) => (tokens[idx].meta?.callout ? '</aside>\n' : '</blockquote>\n');
  rules.table_open = () => '<div class="table-wrap"><table>\n';
  rules.table_close = () => '</table></div>\n';
  rules.link_open = (tokens, idx, opts, e, self) => {
    const t = tokens[idx];
    const href = resolveHref(String(t.attrGet('href') ?? ''), e as unknown as RenderEnv);
    t.attrSet('href', href);
    if (/^https?:/.test(href) && !href.startsWith(REPO_URL)) t.attrSet('rel', 'noopener');
    return self.renderToken(tokens, idx, opts);
  };
  rules.fence = (tokens, idx, _opts, e) => {
    const env = e as unknown as RenderEnv;
    const t = tokens[idx];
    const lang = t.info.trim().split(/\s+/)[0] || 'text';
    if (!FENCE_LANGS[lang]) env.errors.push(`${env.source}: code fence language "${lang}" is not one of ${Object.keys(FENCE_LANGS).join(', ')}`);
    const html = hl.codeToHtml(t.content.replace(/\n$/, ''), {
      lang: FENCE_LANGS[lang] ? lang : 'text',
      themes: { light: LIGHT.name!, dark: DARK.name! }, defaultColor: false,
    });
    return `<div class="code" data-lang="${esc(lang)}">${html}</div>\n`;
  };
  return md;
}

/** Search entries: one per section, text truncated. Runs over the rendered token stream's inline text. */
function searchEntries(tokens: Token[], title: string, url: string): SearchEntry[] {
  const out: SearchEntry[] = [];
  let cur: SearchEntry = { t: title, h: title, u: url, x: '' };
  const flush = () => { if (cur.x.trim() || cur.h !== title) out.push({ ...cur, x: cur.x.trim().slice(0, 280) }); };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'heading_open' && (t.tag === 'h2' || t.tag === 'h3')) {
      flush();
      cur = { t: title, h: plainText(tokens[i + 1]), u: `${url}#${t.attrGet('id')}`, x: '' };
      i++;
    } else if (t.type === 'inline' && cur.x.length < 400) cur.x += ' ' + plainText(t);
  }
  flush();
  return out;
}

/* ------------------------------------------------------------------ pages */
interface FrontMatter { title: string; description: string; group: DocGroup; order: number; tool: string | null }
function parseFrontMatter(text: string, source: string, errors: string[]): { fm: FrontMatter; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  const fields: Record<string, string> = {};
  if (m) for (const line of m[1].split('\n')) {
    const kv = /^([a-z]+):\s*(.*)$/.exec(line.trim());
    if (kv) fields[kv[1]] = kv[2].replace(/^(["'])(.*)\1$/, '$2');
  }
  const group = fields.group as DocGroup;
  if (!m) errors.push(`${source}: missing front matter`);
  if (!fields.title) errors.push(`${source}: front matter needs a title`);
  if (!fields.description) errors.push(`${source}: front matter needs a description`);
  if (!GROUP_ORDER.includes(group)) errors.push(`${source}: front matter group must be one of ${GROUP_ORDER.join(', ')}`);
  if (fields.tool && !TOOLS[fields.tool]) errors.push(`${source}: unknown tool "${fields.tool}"`);
  return {
    fm: { title: fields.title ?? '', description: fields.description ?? '', group, order: Number(fields.order ?? 99), tool: fields.tool ?? null },
    body: m ? text.slice(m[0].length) : text,
  };
}

export function loadDiagnostics(): Diagnostic[] {
  return JSON.parse(readFileSync(DIAGNOSTICS_FILE, 'utf8')) as Diagnostic[];
}

function renderDiagnostics(md: Md, hl: Highlighter, list: Diagnostic[], env: RenderEnv, url: string, pageTitle: string): { html: string; search: SearchEntry[] } {
  const copy = DOCS_COPY[env.lang];
  const groups: [string, string, Diagnostic[]][] = [
    ['schema', copy.diagnosticsLevels.schema, list.filter((d) => d.code.startsWith('S'))],
    ['errors', copy.diagnosticsLevels.error, list.filter((d) => d.code.startsWith('E'))],
    ['warnings', copy.diagnosticsLevels.warning, list.filter((d) => d.code.startsWith('W'))],
    ['info', copy.diagnosticsLevels.info, list.filter((d) => d.code.startsWith('I'))],
  ];
  const search: SearchEntry[] = [];
  let html = '';
  for (const [gid, label, items] of groups) {
    if (!items.length) continue;
    env.ids.add(gid);
    env.toc.push({ level: 2, id: gid, text: label });
    html += `<h2 id="${gid}">${esc(label)}<a class="h-anchor" href="#${gid}" aria-label="${esc(copy.sectionLink)}">#</a></h2>\n<div class="diag-list">\n`;
    for (const d of items) {
      const id = d.code.toLowerCase();
      const title = d.title[env.lang], trigger = d.trigger[env.lang], fix = d.fix[env.lang];
      if (!title || !trigger || !fix) env.errors.push(`diagnostics.json: ${d.code} is missing ${env.lang} text`);
      env.ids.add(id);
      search.push({ t: pageTitle, h: `${d.code} ${title}`, u: `${url}#${id}`, x: trigger.replace(/[`*[\]]|\([^)]*\.md[^)]*\)/g, '').slice(0, 280) });
      const figures = (['bad', 'good'] as const).filter((k) => d.example?.[k]).map((k) =>
        `<figure class="ex ex-${k}"><figcaption>${esc(copy[k])}</figcaption><div class="code" data-lang="jsonc">${hl.codeToHtml(d.example![k]!, { lang: 'jsonc', themes: { light: LIGHT.name!, dark: DARK.name! }, defaultColor: false })}</div></figure>`);
      const example = figures.length ? `<div class="diag-example">${figures.join('')}</div>` : '';
      html += `<section class="diag diag-${d.level}" aria-labelledby="${id}">
<h3 id="${id}"><code class="diag-code">${d.code}</code> <span class="diag-title">${esc(title)}</span><span class="level level-${d.level}">${esc(copy.levelName[d.level])}</span><a class="h-anchor" href="#${id}" aria-label="${esc(copy.sectionLink)}">#</a></h3>
<dl><dt>${esc(copy.trigger)}</dt><dd>${md.renderInline(trigger, env)}</dd><dt>${esc(copy.fix)}</dt><dd>${md.renderInline(fix, env)}</dd></dl>
${example}</section>\n`;
    }
    html += '</div>\n';
  }
  return { html, search };
}

export async function buildSite(): Promise<DocsSite> {
  const hl = await getHighlighter();
  const md = createMarkdown(hl);
  const errors: string[] = [];
  const pages: DocPage[] = [];
  const links: LinkRef[] = [];
  let diagnostics: Diagnostic[] = [];
  try { diagnostics = loadDiagnostics(); } catch (e) { errors.push(`diagnostics.json: ${(e as Error).message}`); }

  for (const lang of DOC_LANGS) {
    const copy = DOCS_COPY[lang];
    const dir = join(CONTENT_DIR, lang);
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md')).sort() : [];
    const sources: { slug: string; source: string; text: string; fm: FrontMatter | null }[] = files.map((f) => ({
      slug: basename(f, '.md'), source: relative(REPO_ROOT, join(dir, f)).split('\\').join('/'), text: readFileSync(join(dir, f), 'utf8'), fm: null,
    }));
    sources.push({ slug: 'contract', source: CONTRACT_SOURCE[lang], text: readFileSync(join(REPO_ROOT, CONTRACT_SOURCE[lang]), 'utf8'), fm: {
      title: copy.contractTitle, description: copy.contractDesc, group: 'reference', order: 1, tool: null,
    } });
    for (const s of sources) {
      const isContract = s.slug === 'contract';
      let fm: FrontMatter, body: string;
      if (isContract) { fm = s.fm!; body = s.text; }
      else ({ fm, body } = parseFrontMatter(s.text, s.source, errors));
      const env: RenderEnv = { lang, slug: s.slug, source: s.source, allowH1: isContract, h1: null, ids: new Set(), toc: [], links, errors };
      const url = pageUrl(lang, s.slug);
      const tokens = md.parse(isContract ? `> [!NOTE]\n> ${copy.contractNote}\n\n${body}` : body, env);
      let html = md.renderer.render(tokens, md.options, env);
      let search = searchEntries(tokens, fm.title, url);
      if (s.slug === 'diagnostics') {
        const d = renderDiagnostics(md, hl, diagnostics, env, url, fm.title);
        html += d.html;
        search = search.concat(d.search);
      }
      pages.push({ lang, slug: s.slug, title: fm.title, description: fm.description, group: fm.group, order: fm.order, source: s.source, html, toc: env.toc, ids: env.ids, search, tool: fm.tool });
    }
  }

  const key = (lang: string, slug: string) => `${lang}/${slug}`;
  const byKey = new Map(pages.map((p) => [key(p.lang, p.slug), p]));
  for (const l of links) {
    const target = byKey.get(key(l.lang, l.slug));
    if (!target) errors.push(`${l.from}: link to missing page ${l.lang}/${l.slug}`);
    else if (l.hash && !target.ids.has(l.hash)) errors.push(`${l.from}: link to missing heading ${l.lang}/${l.slug}#${l.hash}`);
  }
  for (const p of pages) {
    const twin = DOC_LANGS.filter((l) => l !== p.lang).map((l) => byKey.get(key(l, p.slug)));
    if (twin.some((t) => !t)) errors.push(`${p.source}: no ${DOC_LANGS.filter((l) => l !== p.lang).join('/')} counterpart for "${p.slug}"`);
  }
  pages.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || a.order - b.order || a.slug.localeCompare(b.slug));
  return { pages, errors };
}

/* ------------------------------------------------------------------ HTML shell */
const ICON_MENU = '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M3 5.5h14M3 10h14M3 14.5h14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
const ICON_SEARCH = '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="8.5" cy="8.5" r="5.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m12.5 12.5 4.3 4.3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

/** Front-matter descriptions may hold `code`; meta tags get the plain text. */
function head(title: string, description: string, alternates: string): string {
  const plain = esc(description.replace(/`/g, ''));
  return `<title>${esc(title)}</title>
    <meta name="description" content="${plain}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${plain}" />
    ${alternates}`;
}

function sidebar(site: DocsSite, lang: DocLang, current: string | null): string {
  const copy = DOCS_COPY[lang];
  let html = '';
  for (const g of GROUP_ORDER) {
    const items = site.pages.filter((p) => p.lang === lang && p.group === g);
    if (!items.length) continue;
    html += `<section><h2>${esc(copy.groups[g])}</h2><ul>${items.map((p) =>
      `<li><a href="${pageUrl(lang, p.slug)}"${p.slug === current ? ' aria-current="page"' : ''}>${esc(p.title)}</a></li>`).join('')}</ul></section>`;
  }
  return html;
}

function topbar(lang: DocLang, slug: string | null): string {
  const copy = DOCS_COPY[lang];
  const langLinks = DOC_LANGS.map((l) => `<a href="${slug ? pageUrl(l, slug) : `/docs/${l}/`}" hreflang="${l}" lang="${l}" data-lang="${l}"${l === lang ? ' aria-current="true"' : ''}>${l.toUpperCase()}</a>`).join('');
  return `<header class="topbar">
  <button class="icon-btn menu-btn" type="button" aria-controls="sidebar" aria-expanded="false" aria-label="${esc(copy.menu)}" data-label-open="${esc(copy.menu)}" data-label-close="${esc(copy.closeMenu)}">${ICON_MENU}</button>
  <a class="brand" href="/" aria-label="${esc(copy.home)}"><img src="/favicon.svg" alt="" width="26" height="26" /><span class="brand-name">Histamation</span></a>
  <a class="brand-docs" href="/docs/${lang}/getting-started/">${esc(copy.docs)}</a>
  <button class="search-btn" type="button" data-search-open>${ICON_SEARCH}<span>${esc(copy.search)}</span><kbd data-kbd>Ctrl K</kbd></button>
  <nav class="top-links" aria-label="Histamation"><a href="/app/">${esc(copy.mapApp)}</a><a href="${REPO_URL}" rel="noopener">GitHub</a></nav>
  <div class="seg lang-seg" role="group" aria-label="${esc(copy.language)}">${langLinks}</div>
  <div class="seg theme-seg" id="theme-seg" role="group" aria-label="${esc(copy.theme)}"></div>
</header>`;
}

function searchDialog(lang: DocLang): string {
  const copy = DOCS_COPY[lang];
  return `<dialog class="search" id="search" aria-label="${esc(copy.search)}">
  <form method="dialog" class="search-box" role="search">${ICON_SEARCH}<input type="search" id="search-input" placeholder="${esc(copy.searchPlaceholder)}" aria-label="${esc(copy.searchPlaceholder)}" aria-controls="search-results" autocomplete="off" spellcheck="false" /><kbd>Esc</kbd></form>
  <ul class="search-results" id="search-results" role="listbox" aria-label="${esc(copy.search)}"></ul>
  <p class="search-status" id="search-status" role="status">${esc(copy.searchHint)}</p>
</dialog>`;
}

const fill = (template: string, lang: DocLang, headHtml: string, body: string, bodyAttrs: string): string =>
  template
    .replace(/<html lang="[a-z]+"/, `<html lang="${lang}"`)
    .replace('<!--docs-head-->', headHtml)
    .replace('<body>', `<body ${bodyAttrs}>`)
    .replace('<!--docs-body-->', body);

export function renderPage(site: DocsSite, page: DocPage, template: string): string {
  const copy = DOCS_COPY[page.lang];
  const siblings = site.pages.filter((p) => p.lang === page.lang);
  const i = siblings.indexOf(page);
  const prev = siblings[i - 1], next = siblings[i + 1];
  const alternates = DOC_LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${pageUrl(l, page.slug)}" />`).join('\n    ');
  const toc = page.toc.length
    ? `<aside class="toc" aria-labelledby="toc-title"><h2 id="toc-title">${esc(copy.onThisPage)}</h2><ol>${page.toc.map((t) =>
      `<li class="toc-${t.level}"><a href="#${t.id}">${esc(t.text)}</a></li>`).join('')}</ol></aside>` : '<aside class="toc" aria-hidden="true"></aside>';
  const pager = `<nav class="pager" aria-label="${esc(copy.prev)} / ${esc(copy.next)}">${prev
    ? `<a class="pager-prev" rel="prev" href="${pageUrl(prev.lang, prev.slug)}"><span>${esc(copy.prev)}</span>${esc(prev.title)}</a>` : '<span></span>'}${next
    ? `<a class="pager-next" rel="next" href="${pageUrl(next.lang, next.slug)}"><span>${esc(copy.next)}</span>${esc(next.title)}</a>` : ''}</nav>`;
  const body = `<a class="skip" href="#content">${esc(copy.skip)}</a>
${topbar(page.lang, page.slug)}
<div class="shell">
  <nav class="sidebar" id="sidebar" aria-label="${esc(copy.docs)}">${sidebar(site, page.lang, page.slug)}</nav>
  <div class="scrim" data-scrim hidden></div>
  <main class="doc" id="content" tabindex="-1">
    <p class="crumb">${esc(copy.groups[page.group])}</p>
    <h1>${esc(page.title)}</h1>
    <p class="lede">${esc(page.description).replace(/`([^`]+)`/g, '<code>$1</code>')}</p>
    <div class="prose">${page.html}</div>
    ${page.tool ? `<div class="tool" id="tool-root" data-tool="${page.tool}"></div>` : ''}
    <footer class="doc-foot"><a class="edit-link" href="${REPO_URL}/edit/main/${page.source}" rel="noopener">${esc(copy.edit)}</a>${pager}</footer>
  </main>
  ${toc}
</div>
${searchDialog(page.lang)}`;
  return fill(template, page.lang, head(`${page.title} — ${copy.siteTitle}`, page.description, alternates), body, `data-lang="${page.lang}" data-slug="${page.slug}"`);
}

/** /docs/ and /docs/<lang>/: send the reader to their language's first page; links work without JS. */
export function renderIndex(site: DocsSite, template: string, lang: DocLang | null): string {
  const shown = lang ?? 'en';
  const copy = DOCS_COPY[shown];
  const body = `${topbar(shown, null)}
<main class="doc doc-index" id="content">
  <h1>${esc(copy.siteTitle)}</h1>
  <p class="lede" data-redirect-note>${esc(copy.redirecting)}</p>
  ${(lang ? [lang] : [...DOC_LANGS]).map((l) => `<nav class="index-nav" lang="${l}" aria-label="${esc(DOCS_COPY[l].docs)}">${sidebar(site, l, null)}</nav>`).join('')}
</main>
${searchDialog(shown)}`;
  return fill(template, shown, head(copy.siteTitle, copy.contractDesc, ''), body, `data-docs-index${lang ? ` data-lang="${lang}"` : ''}`);
}

export function searchIndex(site: DocsSite, lang: DocLang): string {
  return JSON.stringify(site.pages.filter((p) => p.lang === lang).flatMap((p) => p.search));
}

/** Files whose change invalidates the site in dev. */
export const WATCHED = [CONTENT_DIR, DIAGNOSTICS_FILE, ...Object.values(CONTRACT_SOURCE).map((p) => join(REPO_ROOT, p))];
export const isWatched = (file: string): boolean => WATCHED.some((w) => file === w || file.startsWith(w + '/'));
