import { Map as MapLibreMap, NavigationControl, Popup, ScaleControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@chronomap/maplibre/style.css';
import './style.css';
import {
  ChronoMapEngine, chapterTime, civilFromDays, daysFromCivil, formatTicks, formatWhen, pickText, yearText,
  type CampaignFile, type Diagnostic, type FrameState, type NormChapter, type NormalizedCampaign, type Ticks,
} from '@chronomap/engine';
import { CameraController, ChronoMapRenderer, createBasemapStyle, factionColor, parchmentDark, parchmentLight } from '@chronomap/maplibre';
import { KINDS, ROLES, STATUS, UI, type UIStrings } from './i18n.js';
import { el, renderBody } from './dom.js';
import {
  applyThemeMode, buildLangSeg, buildThemeSeg, savedLang, savedThemeMode, storeLang, storeThemeMode,
  type ThemeMode,
} from './prefs.js';
import { CoachmarkTour } from './coachmark.js';
import { pauseIcon, playIcon } from './icons.js';

const DAY = 86400;
/** Playback speeds: [UI label key, campaign seconds per wall-clock second]. */
const SPEEDS = [['day', DAY], ['week', 7 * DAY], ['month', 30.44 * DAY]] as const;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/** `label` shows in the picker until the campaign loads; its localized meta.title takes over after. */
const CAMPAIGNS: Record<string, { url: string; label: string }> = {
  java: { url: '/campaigns/java-war-1825.json', label: 'The Java War, 1825–1830' },
  waterloo: { url: '/campaigns/waterloo-1815.json', label: 'The Waterloo Campaign' },
};
/** `/app/?campaign=waterloo` opens that campaign first; the landing page links there. */
const requested = new URLSearchParams(location.search).get('campaign') ?? '';

const engine = new ChronoMapEngine({ language: 'id', includeTrail: false });
const state = {
  lang: 'id',
  themeMode: savedThemeMode(),
  mode: 'story' as 'story' | 'explore',
  key: Object.hasOwn(CAMPAIGNS, requested) ? requested : 'java',
  custom: null as CampaignFile | null,
  activeIndex: null as number | null,
  playing: false,
  rate: 30.44 * DAY,
  savedScroll: 0,
  frame: null as FrameState | null,
  titles: {} as Record<string, string>,
  terrain: true,
};
const ui = (): UIStrings => (UI[state.lang as keyof typeof UI] ?? UI.en);
const tour = new CoachmarkTour(() => ui());
const campaign = (): NormalizedCampaign => engine.campaign!;
const tx = (t: unknown): string => pickText(t as never, state.lang, engine.campaign?.defaultLanguage);
let cachedNf: Intl.NumberFormat | null = null;
let cachedNfLang = '';
const nf = (): Intl.NumberFormat => {
  if (!cachedNf || cachedNfLang !== state.lang) {
    cachedNf = new Intl.NumberFormat(state.lang);
    cachedNfLang = state.lang;
  }
  return cachedNf;
};
const qty = (q: unknown): string => (q == null ? '' : typeof q === 'number' ? nf().format(q) : (typeof q === 'object' && 'min' in q && 'max' in q) ? `${nf().format(Number(q.min))}–${nf().format(Number(q.max))}` : '');
const isDark = () => document.documentElement.dataset.theme === 'dark'
  || (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
const theme = () => (isDark() ? parchmentDark : parchmentLight);

/* Applied before the map is constructed below, so the first paint is already the
   right theme and no style reload is needed to correct it. */
applyThemeMode(state.themeMode);

/* ------------------------------------------------------------------ map */
const map = new MapLibreMap({
  container: 'map',
  style: createBasemapStyle({ theme: theme(), basemapPath: '/basemap' }),
  center: [110.3, -7.65], zoom: 7, pitch: 0, bearing: 0,
  attributionControl: { compact: true },
  maxPitch: 75,
  dragRotate: true,
  fadeDuration: 120,
});
map.addControl(new NavigationControl({ visualizePitch: true }), 'bottom-right');
map.addControl(new ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-right');
const camera = new CameraController(map, { reduceMotion });
let renderer = new ChronoMapRenderer(map, { theme: theme(), language: state.lang, basemapPath: '/basemap', reduceMotion });
const popup = new Popup({ closeButton: false, closeOnClick: true, maxWidth: '300px', offset: 12 });

let appliedTheme = theme().name;
function rebuildRenderer(): void {
  /* Auto -> Light on a light machine changes the attribute but not the palette;
     rebuilding there would flash the basemap for no visible gain. */
  if (theme().name === appliedTheme) return;
  appliedTheme = theme().name;
  renderer.destroy();
  map.setStyle(createBasemapStyle({ theme: theme(), basemapPath: '/basemap' }));
  // Built straight away: the renderer installs itself once the new style can take layers.
  renderer = new ChronoMapRenderer(map, { theme: theme(), language: state.lang, basemapPath: '/basemap', reduceMotion });
  if (window.chronomap) window.chronomap.renderer = renderer;
  if (engine.campaign) {
    renderer.setCampaign(engine.campaign);
    if (state.frame) renderer.setFrame(state.frame, focusIds());
  }
  if (state.terrain) setTerrainEnabled(true);
}
const focusIds = (): string[] => (state.activeIndex != null && state.activeIndex >= 0 ? campaign().chapters[state.activeIndex]?.focus ?? [] : []);

/* ------------------------------------------------------------------ engine events */
engine.on('frame', (frame) => {
  state.frame = frame;
  renderer.setFrame(frame, focusIds());
  updateCartouche();
  updateTimeline();
  updateExplorePanel(false);
});

/* ------------------------------------------------------------------ popups */
let mapInteractionsAttached = false;
function attachMapInteractions(): void {
  if (mapInteractionsAttached) return;
  mapInteractionsAttached = true;
  // Peaks, forests and sea ornaments are DOM markers; the renderer opens their popups.
  const layers = ['cm-place-dot', 'cm-event-active', 'cm-event-past', 'basemap-places-dot', 'rivers'];
  for (const layer of layers) {
    map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
    map.on('click', layer, (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const id = String(f.properties?.id ?? '');
      let html: HTMLElement | null = null;
      if (layer === 'cm-place-dot') html = placePopup(id);
      else if (layer === 'cm-event-active' || layer === 'cm-event-past') html = eventPopup(id);
      else if (layer === 'basemap-places-dot') html = basemapPlacePopup(f.properties ?? {});
      else if (layer === 'rivers') html = riverPopup(f.properties ?? {});
      if (html) popup.setLngLat(e.lngLat).setDOMContent(html).addTo(map);
    });
  }
}
function basemapPlacePopup(p: Record<string, any>): HTMLElement {
  const box = el('div');
  const kind = p.kind ? p.kind.replace(/-/g, ' ') : ui().cities;
  box.append(el('span', { class: 'kind', text: kind }));
  box.append(el('h4', { text: p.label ?? p.name }));
  return box;
}
function riverPopup(p: Record<string, any>): HTMLElement {
  const box = el('div');
  box.append(el('span', { class: 'kind', text: ui().rivers }));
  box.append(el('h4', { text: p.name ?? 'Sungai' }));
  return box;
}
function placePopup(id: string): HTMLElement | null {
  const p = campaign().places.get(id);
  if (!p) return null;
  const box = el('div');
  box.append(el('span', { class: 'kind', text: p.raw.kind?.replace(/^x-/, '') ?? ui().places }));
  box.append(el('h4', { text: tx(p.raw.name) }));
  if (p.raw.modernName) box.append(el('div', { class: 'muted', text: tx(p.raw.modernName) }));
  box.append(el('span', { class: 'chip', text: ui()[p.certainty] }));
  if (p.raw.notes) box.append(el('div', { class: 'note', text: tx(p.raw.notes) }));
  return box;
}
function eventPopup(id: string): HTMLElement | null {
  const ev = campaign().events.find((e) => e.id === id);
  if (!ev) return null;
  const raw = ev.raw, box = el('div');
  const kinds = KINDS[state.lang] ?? KINDS.en;
  box.append(el('span', { class: 'kind', text: `${kinds[raw.kind] ?? raw.kind.replace(/^x-/, '')} · ${formatWhen(raw.when, state.lang)}` }));
  box.append(el('h4', { text: tx(raw.name) }));
  if (typeof raw.at === 'string') box.append(el('div', { class: 'muted', text: tx(campaign().places.get(raw.at)?.raw.name ?? raw.at) }));
  for (const part of raw.participants ?? []) {
    const bits = [factionName(part.faction)];
    if (part.role) bits.push((ROLES[state.lang] ?? ROLES.en)[part.role] ?? part.role);
    if (part.strength) bits.push(`${qty(part.strength)} ${ui().men}`);
    box.append(el('div', { class: 'muted', text: bits.join(' · ') }));
  }
  if (raw.summary) box.append(el('div', { text: tx(raw.summary) }));
  if (raw.notes) box.append(el('div', { class: 'note', text: tx(raw.notes) }));
  return box;
}
const factionName = (id: string): string => {
  const f = campaign().factions.get(id);
  return f ? tx(f.shortName ?? f.name) : id;
};

/* ------------------------------------------------------------------ story column */
function mediaFigure(id: string): HTMLElement | null {
  const m = (engine.campaign?.raw.media ?? []).find((x) => x.id === id);
  if (!m) return null;
  const fig = el('figure');
  const img = el('img', { src: m.url, alt: tx(m.alt), loading: 'lazy', referrerpolicy: 'no-referrer' });
  const ph = el('span', { class: 'ph', text: `${ui().imageNote} — ${tx(m.alt)}` });
  ph.hidden = true;
  img.addEventListener('error', () => { img.hidden = true; ph.hidden = false; });
  const cap = el('figcaption');
  if (m.caption) cap.append(tx(m.caption));
  const credit = el('span', { class: 'credit', text: [m.creator, m.holder, m.license].filter(Boolean).join(' · ') });
  if (m.sourceUrl) { credit.append(' — '); credit.append(el('a', { href: m.sourceUrl, target: '_blank', rel: 'noopener noreferrer', text: ui().viewSource })); }
  cap.append(credit);
  fig.append(img, ph, cap);
  return fig;
}
function sourcesDetails(ids?: string[]): HTMLElement | null {
  if (!ids?.length) return null;
  const all = engine.campaign?.raw.sources ?? [];
  const d = el('details');
  d.append(el('summary', { text: `${ui().sources} (${ids.length})` }));
  const ul = el('ul', { class: 'srcs' });
  for (const id of ids) {
    const s = all.find((x) => x.id === id);
    if (!s) continue;
    const li = el('li', { text: s.citation });
    if (s.url) { li.append(' '); li.append(el('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', text: '↗' })); }
    ul.append(li);
  }
  d.append(ul);
  return d;
}
function eventDetails(ch: NormChapter): HTMLElement | null {
  const kinds = KINDS[state.lang] ?? KINDS.en, roles = ROLES[state.lang] ?? ROLES.en;
  const evs = ch.focus.map((id) => campaign().events.find((e) => e.id === id)).filter(Boolean);
  if (!evs.length) return null;
  const d = el('details');
  d.append(el('summary', { text: `${ui().eventsHere} (${evs.length})` }));
  for (const ev of evs) {
    const raw = ev!.raw, item = el('div', { class: 'evt' });
    const where = typeof raw.at === 'string' ? tx(campaign().places.get(raw.at)?.raw.name ?? raw.at) : raw.at ? '' : ui().notMapped;
    item.append(el('div', { class: 'meta', text: [kinds[raw.kind] ?? raw.kind.replace(/^x-/, ''), formatWhen(raw.when, state.lang), where].filter(Boolean).join(' · ') }));
    item.append(el('h4', { text: tx(raw.name) }));
    if (raw.summary) item.append(el('div', { text: tx(raw.summary) }));
    for (const p of raw.participants ?? []) {
      const bits = [factionName(p.faction)];
      if (p.role) bits.push(roles[p.role] ?? p.role);
      if (p.commanders?.length) bits.push(p.commanders.map((c) => tx(c)).join(', '));
      if (p.strength) bits.push(`${qty(p.strength)} ${ui().men}`);
      if (p.losses) bits.push(`−${qty(p.losses)}`);
      item.append(el('div', { class: 'side', text: bits.filter(Boolean).join(' · ') }));
    }
    if (raw.outcome?.summary) item.append(el('div', { class: 'side', text: tx(raw.outcome.summary) }));
    if (raw.notes) item.append(el('div', { class: 'callout' }, el('b', { text: ui().note }), tx(raw.notes)));
    d.append(item);
  }
  return d;
}
let storySteps: HTMLElement[] = [];
function buildStory(): void {
  const c = campaign(), meta = c.meta, host = $('story');
  host.replaceChildren();
  storySteps = [];
  const diag = engine.diagnostics;
  const count = (level: Diagnostic['level']) => diag.filter((d) => d.level === level).length;

  const intro = el('div', { class: 'intro' });
  intro.append(el('div', { class: 'eyebrow', text: ui().campaign }));
  intro.append(el('h1', { text: tx(meta.title) }));
  if (meta.subtitle) intro.append(el('p', { class: 'sub', text: tx(meta.subtitle) }));
  intro.append(renderBody(tx(meta.description)));
  if (meta.contentWarning) intro.append(el('div', { class: 'warn' }, el('b', { text: ui().contentNote }), tx(meta.contentWarning)));
  const facts = el('dl', { class: 'facts' });
  const fact = (k: string, v: string) => facts.append(el('div', {}, el('dt', { text: k }), el('dd', { text: v })));
  fact(ui().period, formatWhen(meta.timeline.focus ?? meta.timeline.extent, state.lang));
  fact(ui().inThisFile, `${c.chapters.length} ${ui().chapters} · ${c.events.length} ${ui().events} · ${c.places.size} ${ui().places}`);
  fact(ui().languages, (meta.languages ?? []).join(' · '));
  if (meta.license) fact(ui().licence, meta.license);
  fact(ui().checked, `${count('error')} ${ui().errors} · ${count('warning')} ${ui().warnings} · ${count('info')} ${ui().notes}`);
  intro.append(facts);
  const about = el('details');
  about.append(el('summary', { text: ui().aboutPreview }), el('p', { text: ui().aboutText }));
  if (diag.length) {
    const ul = el('ul', { class: 'srcs' });
    for (const d of diag.slice(0, 30)) ul.append(el('li', { text: `${d.level} ${d.code} ${d.path} — ${d.message}` }));
    about.append(ul);
  }
  intro.append(about, el('div', { class: 'scrollcue', text: ui().scrollCue }));
  host.append(intro);

  c.chapters.forEach((ch, i) => {
    const days = (ch.end - ch.start) / DAY;
    const dwell = days <= 1.01 ? 72 : clamp(72 + Math.log10(days) * 34, 80, 175);
    const step = el('article', { class: 'step', 'data-index': i });
    step.style.setProperty('--dwell', `${dwell}vh`);
    const inner = el('div', { class: 'step-inner' });
    const part = ch.raw.part ? (c.raw.parts ?? []).find((p) => p.id === ch.raw.part) : null;
    inner.append(el('div', { class: 'step-head' },
      el('span', { class: 'part', text: part ? tx(part.title) : '' }),
      el('span', { text: `${ui().chapter} ${i + 1} ${ui().of} ${c.chapters.length}` })));
    inner.append(el('h2', { text: tx(ch.raw.title) }));
    inner.append(el('p', { class: 'when', text: ch.raw.dateLabel ? tx(ch.raw.dateLabel) : formatWhen(ch.raw.when, state.lang) }));
    const body = el('div', { class: 'body' });
    body.append(renderBody(tx(ch.raw.body)));
    inner.append(body);
    if (ch.raw.notes) inner.append(el('div', { class: 'callout' }, el('b', { text: ui().note }), tx(ch.raw.notes)));
    for (const mid of ch.raw.media ?? []) { const f = mediaFigure(mid); if (f) inner.append(f); }
    const ev = eventDetails(ch); if (ev) inner.append(ev);
    const src = sourcesDetails(ch.raw.sources); if (src) inner.append(src);
    step.append(inner);
    storySteps.push(step);
    host.append(step);
  });

  const outro = el('div', { class: 'outro' });
  outro.append(el('div', { class: 'eyebrow', text: tx(meta.title) }));
  outro.append(el('h2', { text: ui().end }));
  outro.append(el('button', { class: 'btn', onclick: () => setMode('explore') }, ui().exploreFreely));
  const allSrc = sourcesDetails((c.raw.sources ?? []).map((s) => s.id));
  if (allSrc) outro.append(allSrc);
  host.append(outro);
}

function updatePlayButtons(): void {
  const isP = state.playing;
  const label = isP ? ui().pause : ui().play;
  const iconFn = isP ? pauseIcon : playIcon;

  const tlPlay = document.getElementById('tl-play');
  const tlIcon = document.getElementById('tl-play-icon');
  const tlLabel = document.getElementById('tl-play-label');
  if (tlPlay && tlIcon && tlLabel) {
    tlIcon.replaceChildren(iconFn());
    tlLabel.textContent = label;
    tlPlay.classList.toggle('is-playing', isP);
    tlPlay.setAttribute('aria-label', label);
    tlPlay.setAttribute('title', label);
  }

  const playBtn = document.getElementById('play');
  if (playBtn) {
    playBtn.replaceChildren(iconFn(), el('span', { text: label }));
    playBtn.classList.toggle('is-playing', isP);
    playBtn.setAttribute('aria-label', label);
  }
}

function togglePlay(): void {
  if (state.mode === 'story') {
    setMode('explore');
  }
  state.playing = !state.playing;
  updatePlayButtons();
}

/* ------------------------------------------------------------------ explore column */
function buildExplore(): void {
  if (!engine.campaign) return;
  const host = $('explore');
  host.replaceChildren();
  host.append(el('h2', { text: ui().explore }), el('p', { class: 'lede', text: ui().exploreLede }));

  const row = el('div', { class: 'row-ctl' });
  const playBtn = el('button', {
    class: `btn${state.playing ? ' is-playing' : ''}`,
    id: 'play',
    onclick: togglePlay,
  }, state.playing ? pauseIcon() : playIcon(), el('span', { text: state.playing ? ui().pause : ui().play }));
  const speed = el('select', { id: 'speed', onchange: (e: Event) => { state.rate = Number((e.target as HTMLSelectElement).value); } });
  for (const [key, secs] of SPEEDS) {
    speed.append(el('option', { value: secs, selected: Math.abs(secs - state.rate) < 1 }, ui()[key]));
  }
  const jump = el('select', {
    id: 'jump',
    onchange: (e: Event) => {
      const idx = Number((e.target as HTMLSelectElement).value);
      if (!Number.isNaN(idx) && campaign().chapters[idx]) goToChapter(campaign().chapters[idx]);
    },
  });
  jump.append(el('option', { value: '' }, ui().jump));
  campaign().chapters.forEach((ch, i) => jump.append(el('option', { value: i, selected: i === state.activeIndex }, `${i + 1}. ${tx(ch.raw.title)}`)));
  const terrain = el('button', {
    class: 'btn',
    id: 'terrain',
    'aria-pressed': String(Boolean(map.getTerrain())),
    onclick: () => {
      toggleTerrain();
      terrain.setAttribute('aria-pressed', String(Boolean(map.getTerrain())));
    },
  }, ui().terrain);
  row.append(playBtn, speed, jump, terrain);
  host.append(row);

  const now = el('div', { class: 'panel' });
  now.append(el('h3', { text: ui().now }), el('div', { id: 'now-lists' }));
  host.append(now);

  const load = el('div', { class: 'panel' });
  load.append(el('h3', { text: ui().loadYours }), el('p', { class: 'lede', text: ui().loadHelp }),
    el('button', { class: 'btn', onclick: () => $('file').click() }, ui().load));
  host.append(load);
}
let lastPanel = 0;
function updateExplorePanel(force: boolean): void {
  if (state.mode !== 'explore' || !state.frame) return;
  const now = performance.now();
  if (!force && now - lastPanel < 240) return;
  lastPanel = now;
  const host = document.getElementById('now-lists');
  if (!host) return;
  const c = campaign(), kinds = KINDS[state.lang] ?? KINDS.en, statuses = STATUS[state.lang] ?? STATUS.en;
  const list = el('div');
  const section = (title: string, items: [string, string][]) => {
    list.append(el('h3', { text: title, style: 'margin-top:10px' }));
    const ul = el('ul');
    if (!items.length) ul.append(el('li', { class: 'empty', text: ui().nothing }));
    for (const [a, b] of items) ul.append(el('li', {}, el('span', { text: a }), el('span', { text: b })));
    list.append(ul);
  };
  const byId = new Map(c.entities.map((e) => [e.id, e]));
  section(ui().happening, state.frame.events.filter((e) => e.phase === 'active')
    .map((e) => [tx(c.events.find((x) => x.id === e.id)?.raw.name), kinds[e.kind] ?? e.kind.replace(/^x-/, '')] as [string, string]));
  section(ui().forces, state.frame.entities.filter((e) => byId.get(e.id)?.track).map((e) => {
    const ne = byId.get(e.id)!;
    const wp = e.waypoint != null ? ne.raw.track?.[e.waypoint]?.label : null;
    const bits = [wp ? tx(wp) : e.moving ? ui().moving : statuses[e.status] ?? e.status];
    if (e.strength) bits.push(nf().format(Math.round(e.strength)));
    return [tx(ne.raw.name), bits.join(' · ')] as [string, string];
  }));
  section(ui().strongholds, state.frame.entities.filter((e) => byId.get(e.id)?.coord).map((e) => {
    const ne = byId.get(e.id)!;
    return [tx(ne.raw.name), `${statuses[e.status] ?? e.status} · ${factionName(e.faction)}`] as [string, string];
  }));
  host.replaceChildren(list);
}
function setTerrainEnabled(enable: boolean): void {
  state.terrain = enable;
  if (!map.isStyleLoaded()) {
    // Not 'style.load': setStyle() may already have fired it. Re-read state: it may have been toggled meanwhile.
    map.once('idle', () => setTerrainEnabled(state.terrain));
    return;
  }
  if (!enable) {
    map.setTerrain(null);
    if (map.getLayer('hillshade')) map.setLayoutProperty('hillshade', 'visibility', 'none');
    return;
  }
  if (!map.getSource('terrain')) {
    map.addSource('terrain', {
      type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      encoding: 'terrarium', tileSize: 256, maxzoom: 14,
      attribution: 'Terrain: AWS Terrain Tiles (Mapzen/Tilezen)',
    });
  }
  const beforeLayer = map.getLayer('lakes') ? 'lakes' : undefined;
  if (!map.getLayer('hillshade')) {
    map.addLayer({
      id: 'hillshade', type: 'hillshade', source: 'terrain',
      paint: {
        'hillshade-illumination-direction': 315,
        'hillshade-exaggeration': 0.45,
        'hillshade-shadow-color': theme().hillshadeShadow,
        'hillshade-highlight-color': theme().hillshadeHighlight,
        'hillshade-accent-color': theme().inkFaint,
      },
    }, beforeLayer);
  } else {
    map.setLayoutProperty('hillshade', 'visibility', 'visible');
    map.setPaintProperty('hillshade', 'hillshade-shadow-color', theme().hillshadeShadow);
    map.setPaintProperty('hillshade', 'hillshade-highlight-color', theme().hillshadeHighlight);
    map.setPaintProperty('hillshade', 'hillshade-accent-color', theme().inkFaint);
  }
  const exag = engine.campaign?.meta.map.terrain?.exaggeration ?? 1.4;
  map.setTerrain({ source: 'terrain', exaggeration: exag });
}
function toggleTerrain(): void {
  setTerrainEnabled(!map.getTerrain());
}

/* ------------------------------------------------------------------ legend */
function buildLegend(): void {
  if (!engine.campaign) return;
  const c = campaign(), host = $('legend') as HTMLDetailsElement;
  host.replaceChildren();
  host.open = matchMedia('(min-width: 901px)').matches;
  host.append(el('summary', { text: ui().legend }));
  const used = new Set<string>();
  for (const e of c.entities) used.add(e.faction);
  for (const ev of c.events) for (const p of ev.raw.participants ?? []) used.add(p.faction);
  host.append(el('div', { class: 'eyebrow', style: 'margin:2px 0 4px', text: ui().sides }));
  for (const id of used) {
    host.append(el('div', { class: 'row' },
      el('span', { class: 'sw', style: `background:${factionColor(c.factions.get(id)?.color ?? '#7a6a58', theme())}` }),
      factionName(id)));
  }
  host.append(el('div', { class: 'eyebrow', style: 'margin:8px 0 4px', text: ui().lines }));
  host.append(el('div', { class: 'row' }, el('span', { class: 'ln solid' }), ui().routeDoc));
  host.append(el('div', { class: 'row' }, el('span', { class: 'ln dash' }), ui().routeConj));
  host.append(el('div', { class: 'row' }, el('span', { class: 'ln dot' }), ui().routeSea));
  host.append(el('div', { class: 'row' }, el('span', { class: 'ln flow' }), ui().marchActive));
  host.append(el('div', { class: 'row' }, el('span', { class: 'halo' }), ui().uncertainty));
  host.append(el('div', { class: 'eyebrow', style: 'margin:8px 0 4px', text: ui().places }));
  host.append(el('div', { class: 'row' }, el('span', { class: 'pt peak' }, '▲'), ui().mountains));
  host.append(el('div', { class: 'row' }, el('span', { class: 'pt forest' }, '♣'), ui().forests));
  host.append(el('div', { class: 'row' }, el('span', { class: 'pt city' }), ui().cities));
  host.append(el('div', { class: 'row' }, el('span', { class: 'ln river' }), ui().rivers));
  host.append(el('div', { class: 'foot', text: ui().basemap }));
}

/* ------------------------------------------------------------------ timeline */
let scale = { toX: (_t: Ticks) => 0, toT: (_x: number) => 0 };
function buildTimeline(): void {
  if (!engine.campaign) return;
  const c = campaign(), ext = c.extent, foc = c.focus;
  const a = foc.start > ext.start ? 0.08 : 0;
  const b = foc.end < ext.end ? 0.08 : 0;
  const spanF = Math.max(1, foc.end - foc.start);
  scale = {
    toX(t) {
      if (t <= ext.start) return 0;
      if (t >= ext.end) return 1;
      if (t < foc.start) return (a * (t - ext.start)) / Math.max(1, foc.start - ext.start);
      if (t > foc.end) return 1 - b + (b * (t - foc.end)) / Math.max(1, ext.end - foc.end);
      return a + ((1 - a - b) * (t - foc.start)) / spanF;
    },
    toT(x) {
      x = clamp(x, 0, 1);
      if (x < a) return ext.start + (x / a) * (foc.start - ext.start);
      if (x > 1 - b) return foc.end + ((x - (1 - b)) / b) * (ext.end - foc.end);
      return foc.start + ((x - a) / (1 - a - b)) * spanF;
    },
  };
  const axis = $('tl-axis');
  axis.replaceChildren();
  const width = $('timeline').clientWidth || 600;
  const y0 = civilFromDays(Math.floor(foc.start / DAY)).year, y1 = civilFromDays(Math.floor(foc.end / DAY)).year;
  const years = Math.max(1, y1 - y0);
  const stepY = [1, 2, 5, 10, 25, 50, 100].find((s) => (s / years) * width * (1 - a - b) >= 46) ?? 200;
  if (years <= 2) {
    for (let y = y0; y <= y1; y++) for (let m = 0; m < 12; m++) {
      const t = daysFromCivil(y, m + 1, 1) * DAY;
      if (t < foc.start || t > foc.end) continue;
      const x = scale.toX(t) * 100;
      axis.append(el('div', { class: 'tk', style: `left:${x}%` }));
      if ((width * (1 - a - b)) / (years * 12) > 34) {
        axis.append(el('div', { class: 'yr', style: `left:${x}%`, text: new Intl.DateTimeFormat(state.lang, { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2001, m, 15))) }));
      }
    }
  } else {
    for (let y = Math.ceil(y0 / stepY) * stepY; y <= y1; y += stepY) {
      const t = daysFromCivil(y, 1, 1) * DAY;
      if (t < foc.start || t > foc.end) continue;
      const x = scale.toX(t) * 100;
      axis.append(el('div', { class: 'tk', style: `left:${x}%` }), el('div', { class: 'yr', style: `left:${x}%`, text: yearText(y, state.lang) }));
    }
  }
  if (a) axis.append(el('div', { class: 'brk', style: `left:${a * 100}%` }), el('div', { class: 'yr', style: 'left:0; transform:none', text: yearText(civilFromDays(Math.floor(ext.start / DAY)).year, state.lang) }));
  if (b) axis.append(el('div', { class: 'brk', style: `left:${(1 - b) * 100}%` }), el('div', { class: 'yr', style: 'right:0; left:auto; transform:none', text: yearText(civilFromDays(Math.floor(ext.end / DAY)).year, state.lang) }));
  for (const ev of c.events) if (ev.importance <= 2) axis.append(el('div', { class: 'tl-ev', style: `left:${scale.toX(ev.start) * 100}%` }));
  c.chapters.forEach((ch, i) => {
    axis.append(el('button', {
      class: 'tl-ch', style: `left:${scale.toX(ch.start) * 100}%`, title: `${i + 1}. ${tx(ch.raw.title)}`,
      'aria-label': `${ui().chapter} ${i + 1}: ${tx(ch.raw.title)}`, onclick: () => goToChapter(ch),
    }));
  });
  $('tl-top').replaceChildren(
    el('span', { text: state.mode === 'story' ? ui().story : ui().explore }),
    el('span', { class: 'spacer' }),
    el('span', { text: formatWhen(c.meta.timeline.focus ?? c.meta.timeline.extent, state.lang) }),
  );
}
function updateTimeline(): void {
  const c = engine.campaign;
  if (!c) return;
  const scrub = $<HTMLInputElement>('scrub');
  if (document.activeElement !== scrub || state.mode === 'story') scrub.value = String(Math.round(scale.toX(engine.time) * 10000));
  const band = $('tl-band');
  const ch = state.activeIndex != null && state.activeIndex >= 0 ? c.chapters[state.activeIndex] : null;
  if (ch) {
    const x0 = scale.toX(ch.start) * 100, x1 = scale.toX(ch.end) * 100;
    band.hidden = false;
    band.style.left = `${x0}%`;
    band.style.width = `${Math.max(0.6, x1 - x0)}%`;
  } else band.hidden = true;
  $('tl-axis').querySelectorAll('.tl-ch').forEach((m, i) => m.classList.toggle('on', i === state.activeIndex));
}

/* ------------------------------------------------------------------ cartouche */
let lastCartouche = '';
function updateCartouche(): void {
  const c = engine.campaign;
  if (!c) return;
  const ch = state.activeIndex != null && state.activeIndex >= 0 ? c.chapters[state.activeIndex] : null;
  let big: string, sub: string;
  if (state.mode === 'story' && ch) {
    const isPoint = !ch.raw.when.includes('/');
    big = isPoint ? formatWhen(ch.raw.when, state.lang) : formatTicks(engine.time, state.lang);
    const part = ch.raw.part ? (c.raw.parts ?? []).find((p) => p.id === ch.raw.part) : null;
    sub = `${ui().chapter} ${ch.index + 1} ${ui().of} ${c.chapters.length}${part ? ' · ' + tx(part.title) : ''}`;
  } else if (state.mode === 'story') {
    big = formatWhen(c.meta.timeline.focus ?? c.meta.timeline.extent, state.lang);
    sub = tx(c.meta.title);
  } else {
    big = formatTicks(engine.time, state.lang);
    sub = `${tx(c.meta.title)} · ${ui().explore}`;
  }
  if (big + sub === lastCartouche) return;
  lastCartouche = big + sub;
  $('now-date').textContent = big;
  $('now-sub').textContent = sub;
}

/* ------------------------------------------------------------------ scroll controller */
const anchorY = (): number => {
  const stage = $('stage').getBoundingClientRect();
  return matchMedia('(max-width: 900px)').matches ? stage.bottom + (innerHeight - stage.bottom) * 0.42 : innerHeight * 0.55;
};
let scrollDirty = true;
function updateScroll(): void {
  if (state.mode !== 'story' || !engine.campaign) return;
  const steps = storySteps.length ? storySteps : [...document.querySelectorAll<HTMLElement>('.step')];
  if (!steps.length) return;
  const anchor = anchorY();
  let index = -1, p = 0;
  if (anchor >= steps[0].getBoundingClientRect().top) {
    index = steps.length - 1; p = 1;
    for (let i = 0; i < steps.length; i++) {
      const r = steps[i].getBoundingClientRect();
      if (anchor >= r.top && anchor < r.bottom) { index = i; p = clamp((anchor - r.top) / r.height, 0, 1); break; }
    }
  }
  if (index !== state.activeIndex) {
    steps.forEach((s, i) => s.classList.toggle('is-active', i === index));
    state.activeIndex = index;
    moveCameraForChapter(index);
    updateTimeline();
  }
  const c = campaign();
  if (index < 0) engine.setTime(c.chapters[0].start);
  else engine.setStoryProgress(c.chapters[index].id, p);
}
function moveCameraForChapter(index: number): void {
  const c = campaign();
  if (index < 0) {
    const m = c.meta.map;
    camera.apply({ center: m.center, zoom: m.zoom, pitch: m.pitch ?? 0, bearing: m.bearing ?? 0, durationMs: 1800 });
    return;
  }
  const ch = c.chapters[index];
  if (ch.camera) camera.apply(ch.camera);
  else camera.fitFocus(c, ch, state.frame);
}
function goToChapter(ch: NormChapter): void {
  if (state.mode === 'story') {
    const step = document.querySelector<HTMLElement>(`.step[data-index="${ch.index}"]`);
    if (step) scrollTo({ top: scrollY + step.getBoundingClientRect().top - anchorY() + 8, behavior: reduceMotion ? 'auto' : 'smooth' });
  } else {
    state.activeIndex = ch.index;
    engine.setTime(chapterTime(ch, 0.02));
    moveCameraForChapter(ch.index);
    updateTimeline();
  }
}

/* ------------------------------------------------------------------ modes, language, loading */
function setMode(mode: 'story' | 'explore'): void {
  state.mode = mode;
  $('mode-story').setAttribute('aria-pressed', String(mode === 'story'));
  $('mode-explore').setAttribute('aria-pressed', String(mode === 'explore'));
  $('story').hidden = mode !== 'story';
  $('explore').hidden = mode !== 'explore';
  $('stage').classList.toggle('is-explore', mode === 'explore');
  $<HTMLInputElement>('scrub').disabled = mode === 'story';
  popup.remove();
  if (mode === 'explore') {
    state.savedScroll = scrollY;
    const c = engine.campaign;
    if (c && engine.time < c.focus.start) {
      engine.setTime(c.focus.start);
      const ch = c.chapters.find((x) => x.end >= c.focus.start);
      if (ch) {
        state.activeIndex = ch.index;
        moveCameraForChapter(ch.index);
      }
    }
    buildExplore();
    scrollTo({ top: 0, behavior: 'auto' });
    updateExplorePanel(true);
    map.dragPan.enable(); map.scrollZoom.enable(); map.dragRotate.enable(); map.keyboard.enable(); map.touchZoomRotate.enable();
  } else {
    state.playing = false;
    updatePlayButtons();
    state.activeIndex = null;
    map.dragPan.disable(); map.scrollZoom.disable(); map.dragRotate.disable(); map.keyboard.disable(); map.touchZoomRotate.disable();
    requestAnimationFrame(() => { scrollTo({ top: state.savedScroll || 0, behavior: 'auto' }); scrollDirty = true; });
  }
  buildTimeline();
  updateTimeline();
  updateCartouche();
}
function buildLangButtons(): void {
  buildLangSeg($('seg-lang'), engine.campaign?.languages ?? ['en'], state.lang, setLang);
}
function buildThemeButtons(): void {
  buildThemeSeg($('seg-theme'), ui(), state.themeMode, setThemeMode);
}
function setThemeMode(mode: ThemeMode): void {
  if (mode === state.themeMode) return;
  state.themeMode = mode;
  storeThemeMode(mode);
  applyThemeMode(mode);   // the data-theme observer repaints the map if the palette actually changed
  buildThemeButtons();
}
function setLang(lang: string): void {
  if (lang === state.lang) return;
  const steps = storySteps.length ? storySteps : [...document.querySelectorAll<HTMLElement>('.step')];
  const i = state.activeIndex ?? -1;
  const r = i >= 0 && steps[i] ? steps[i].getBoundingClientRect() : null;
  const p = r ? clamp((anchorY() - r.top) / r.height, 0, 1) : 0;
  state.lang = lang;
  engine.setLanguage(lang);
  document.documentElement.lang = lang;
  storeLang(lang);
  renderer.setLanguage(lang);
  buildLangButtons(); buildStory(); buildLegend(); buildTimeline(); refreshChrome();
  if (state.mode === 'explore') { buildExplore(); updateExplorePanel(true); }
  lastCartouche = '';
  updateCartouche();
  if (r) {
    const step = document.querySelector<HTMLElement>(`.step[data-index="${i}"]`);
    if (step) scrollTo({ top: scrollY + step.getBoundingClientRect().top - anchorY() + p * step.getBoundingClientRect().height, behavior: 'auto' });
  }
  scrollDirty = true;
}
function refreshChrome(): void {
  buildThemeButtons();
  $('lbl-campaign').textContent = ui().campaign;
  $('load-btn').textContent = ui().load;
  $('mode-story').textContent = ui().story;
  $('mode-explore').textContent = ui().explore;
  $('dropzone').textContent = ui().dropHere;
  const helpBtn = document.getElementById('help-btn');
  if (helpBtn) {
    helpBtn.setAttribute('aria-label', ui().helpGuide);
    helpBtn.setAttribute('title', ui().helpGuide);
  }
  updatePlayButtons();
  tour.updateText();
  const sel = $<HTMLSelectElement>('dataset');
  for (const o of sel.options) if (state.titles[o.value]) o.textContent = state.titles[o.value];
}
function showNotice(title: string, lines: string[]): void {
  const n = $('notice');
  n.replaceChildren(el('h3', { text: title }));
  const ul = el('ul');
  for (const l of lines.slice(0, 20)) ul.append(el('li', { text: l }));
  n.append(ul, el('button', { class: 'btn', onclick: () => { n.hidden = true; } }, ui().dismiss));
  n.hidden = false;
}
async function useCampaign(source: CampaignFile | string, label?: string): Promise<boolean> {
  let result;
  try {
    result = await engine.load(source);
  } catch (e) {
    showNotice(`${ui().loadFailed}${label ? ` — ${label}` : ''}`, [String((e as Error).message)]);
    return false;
  }
  if (!result.campaign) {
    showNotice(`${ui().loadFailed}${label ? ` — ${label}` : ''}`,
      result.diagnostics.filter((d) => d.level === 'error').map((d) => `${d.code} ${d.path} — ${d.message}`));
    return false;
  }
  $('notice').hidden = true;
  const c = result.campaign;
  state.lang = engine.language;
  state.activeIndex = null;
  state.playing = false;
  if (typeof source === 'string') state.titles[state.key] = tx(c.meta.title);
  const span = c.focus.end - c.focus.start;
  state.rate = SPEEDS.map(([, r]) => r as number)
    .reduce((best, r) => (Math.abs(span / r - 45) < Math.abs(span / best - 45) ? r : best));
  renderer.setCampaign(c);
  renderer.setLanguage(state.lang);
  buildLangButtons(); buildStory(); buildLegend(); buildTimeline(); refreshChrome();
  if (state.mode === 'explore') buildExplore();
  const m = c.meta.map;
  map.jumpTo({ center: [m.center[0], m.center[1]], zoom: m.zoom, pitch: m.pitch ?? 0, bearing: m.bearing ?? 0 });
  if (m.bounds) map.setMaxBounds([[m.bounds[0] - 2, m.bounds[1] - 2], [m.bounds[2] + 2, m.bounds[3] + 2]]);
  engine.setTime(c.chapters[0].start);
  scrollTo({ top: 0, behavior: 'auto' });
  scrollDirty = true;
  lastCartouche = '';
  updateCartouche();
  if (state.terrain) setTerrainEnabled(true);
  return true;
}
function readFile(file: File): void {
  if (file.size > 20 * 1024 * 1024) { showNotice(ui().loadFailed, ['File larger than 20 MB']); return; }
  file.text().then(async (text) => {
    let raw: CampaignFile;
    try { raw = JSON.parse(text); } catch (e) { showNotice(ui().loadFailed, [String((e as Error).message)]); return; }
    if (await useCampaign(raw, file.name)) {
      state.custom = raw;
      const sel = $<HTMLSelectElement>('dataset');
      if (![...sel.options].some((o) => o.value === 'custom')) sel.append(el('option', { value: 'custom' }, file.name));
      sel.value = 'custom';
      state.key = 'custom';
      state.titles.custom = file.name;
    }
  });
}

/* ------------------------------------------------------------------ chrome wiring */
function setupChrome(): void {
  const sel = $<HTMLSelectElement>('dataset');
  for (const [key, { label }] of Object.entries(CAMPAIGNS)) sel.append(el('option', { value: key }, label));
  sel.value = state.key;
  sel.addEventListener('change', async () => {
    state.key = sel.value;
    if (sel.value === 'custom' && state.custom) await useCampaign(state.custom, 'custom');
    else await useCampaign(CAMPAIGNS[sel.value].url, sel.value);
  });
  buildThemeButtons();
  $('mode-story').addEventListener('click', () => setMode('story'));
  $('mode-explore').addEventListener('click', () => setMode('explore'));
  $('load-btn').addEventListener('click', () => $('file').click());
  $('help-btn')?.addEventListener('click', () => tour.start(true));
  $('tl-play')?.addEventListener('click', togglePlay);
  $<HTMLInputElement>('file').addEventListener('change', (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) readFile(f);
    (e.target as HTMLInputElement).value = '';
  });
  $<HTMLInputElement>('scrub').addEventListener('input', (e) => {
    if (state.mode !== 'explore') return;
    state.playing = false;
    updatePlayButtons();
    engine.setTime(Math.round(scale.toT(Number((e.target as HTMLInputElement).value) / 10000)));
  });
  window.addEventListener('scroll', () => { scrollDirty = true; }, { passive: true });
  window.addEventListener('resize', () => { scrollDirty = true; buildTimeline(); });
  const dz = $('dropzone');
  window.addEventListener('dragover', (e) => { e.preventDefault(); dz.hidden = false; });
  window.addEventListener('dragleave', (e) => { if (e.relatedTarget === null) dz.hidden = true; });
  window.addEventListener('drop', (e) => {
    e.preventDefault(); dz.hidden = true;
    const f = e.dataTransfer?.files?.[0];
    if (f) readFile(f);
  });
  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--bar-h', `${document.querySelector<HTMLElement>('.bar')!.offsetHeight}px`);
    map.resize();
  }).observe(document.querySelector('.bar')!);
  new ResizeObserver(() => map.resize()).observe($('stage'));
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', rebuildRenderer);
  new MutationObserver(rebuildRenderer).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  updatePlayButtons();
}

/* ------------------------------------------------------------------ loop */
let lastNow = performance.now();
function loop(now: number): void {
  const dt = Math.min(0.1, (now - lastNow) / 1000);
  lastNow = now;
  if (scrollDirty) { scrollDirty = false; updateScroll(); }
  if (state.playing && engine.campaign) {
    const next = engine.time + state.rate * dt;
    if (next >= engine.campaign.extent.end) {
      engine.setTime(engine.campaign.extent.end - 1);
      state.playing = false;
      updatePlayButtons();
    } else engine.setTime(next);
  }
  requestAnimationFrame(loop);
}

/* Handy for debugging and for anyone poking at the engine from the console. */
declare global { interface Window { chronomap?: { map: MapLibreMap; engine: ChronoMapEngine; renderer: ChronoMapRenderer } } }
map.on('error', (e) => console.error('[maplibre]', (e as unknown as { error?: Error }).error?.message ?? e));

/* ------------------------------------------------------------------ boot */
state.lang = savedLang(state.lang);
engine.setLanguage(state.lang);
setupChrome();
window.chronomap = { map, engine, renderer };
map.on('load', () => {
  attachMapInteractions();
  if (state.terrain) setTerrainEnabled(true);
});
await useCampaign(CAMPAIGNS[state.key].url, state.key);
setMode('story');
requestAnimationFrame(loop);
setTimeout(() => { tour.start(false); }, 700);
