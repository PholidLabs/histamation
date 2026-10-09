/**
 * Landing page: bilingual copy, theme and language switches shared with the app, and the
 * hero plate — a real campaign resolved by @pholidlabs/histamation-engine every frame and drawn as SVG.
 * No map library here on purpose: the plate shows the engine on its own.
 */
import './landing.css';
import {
  DEFAULT_RADIUS, chapterAt, formatTicks, loadCampaign, pickText, resolveFrame,
  type CampaignFile, type FrameState, type NormalizedCampaign, type Ticks,
} from '@pholidlabs/histamation-engine';
import { LANDING, type LandingStrings } from './landing-copy.js';
import { UI } from './i18n.js';
import { svgEl } from './dom.js';
import { pauseIcon, playIcon } from './icons.js';
import {
  applyThemeMode, buildLangSeg, buildThemeSeg, savedLang, savedThemeMode, storeLang, storeThemeMode,
  type ThemeMode,
} from './prefs.js';

const LANGS = Object.keys(LANDING);
const state = { lang: savedLang('en'), theme: savedThemeMode() };
if (!LANGS.includes(state.lang)) state.lang = 'en';
applyThemeMode(state.theme);

const copy = (): LandingStrings => LANDING[state.lang];
const $ = <T extends Element = HTMLElement>(id: string) => document.getElementById(id) as unknown as T;

/* ---------- copy, language and theme ---------- */

/** `data-i18n` holds a dotted path into LandingStrings, e.g. `steps.1.body`. */
function lookup(path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o == null ? o : (o as Record<string, unknown>)[k]), copy());
}

function applyCopy(): void {
  const c = copy();
  document.documentElement.lang = state.lang;
  document.title = c.docTitle;
  document.querySelector('meta[name="description"]')?.setAttribute('content', c.docDesc);
  for (const node of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const v = lookup(node.dataset.i18n!);
    if (typeof v === 'string') node.textContent = v;
  }
  $('plate-scrub').setAttribute('aria-label', c.scrub);
  buildLangSeg($('lang-seg'), LANGS, state.lang, (l) => {
    state.lang = l;
    storeLang(l);
    applyCopy();
  });
  const ui = UI[state.lang];
  buildThemeSeg($('theme-seg'), ui, state.theme, (m: ThemeMode) => {
    state.theme = m;
    storeThemeMode(m);
    applyThemeMode(m);
    applyCopy();
  });
  plate?.relabel();
}

/* ---------- the plate ---------- */

const W = 400, H = 500, PAD = 30;
const DAY = 86400;
/** Campaign seconds per wall-clock second: brisk between battles, slow while a same-day battle is on. */
const SLOW_RATE = 45 * 60;
const LOOP_SECONDS = 18;
const HOLD_MS = 2200;
const HEX = /^#[0-9a-f]{3,8}$/i;

interface UnitNodes { g: SVGGElement; trail: SVGPolylineElement; ring: SVGCircleElement; dot: SVGCircleElement; label: SVGTextElement }
/** Label bounding box in plate units: [left, top, right, bottom]. */
type Box = [number, number, number, number];
const overlaps = (a: Box, b: Box): boolean => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

class Plate {
  private readonly svg = $<SVGSVGElement>('plate-svg');
  private readonly scrub = $<HTMLInputElement>('plate-scrub');
  private readonly play = $<HTMLButtonElement>('plate-play');
  private readonly units = new Map<string, UnitNodes>();
  private readonly forts = new Map<string, SVGRectElement>();
  private readonly labels: SVGGElement;
  private readonly events: SVGGElement;
  private readonly kx: number;
  private readonly scale: number;
  private readonly ox: number;
  private readonly oy: number;
  private readonly start: Ticks;
  private readonly end: Ticks;
  private readonly fast: number;
  private t: Ticks;
  private rate: number;
  private playing: boolean;
  private visible = true;
  private holdUntil = 0;
  private last = 0;
  private drawn: Ticks | null = null;

  constructor(private readonly c: NormalizedCampaign) {
    this.start = c.focus.start;
    this.end = c.focus.end;
    this.fast = (this.end - this.start) / LOOP_SECONDS;
    this.rate = this.fast;

    // Fit every place and every route into the plate, keeping ground distances true at mid-latitude.
    const pts: [number, number][] = [...[...c.places.values()].map((p) => p.coord), ...c.entities.flatMap((e) => routeOf(e.track) ?? (e.coord ? [e.coord] : []))];
    const lons = pts.map((p) => p[0]), lats = pts.map((p) => p[1]);
    const [w, e, s, n] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
    this.kx = Math.cos((((s + n) / 2) * Math.PI) / 180);
    this.scale = Math.min((W - 2 * PAD) / ((e - w) * this.kx), (H - 2 * PAD) / (n - s));
    this.ox = W / 2 - (((w + e) / 2) * this.kx) * this.scale;
    this.oy = H / 2 + ((s + n) / 2) * this.scale;

    this.svg.append(this.graticule());
    const routes = svgEl('g') as SVGGElement;
    const trails = svgEl('g') as SVGGElement;
    const places = svgEl('g') as SVGGElement;
    for (const p of c.places.values()) {
      if (p.raw.kind === 'fort') continue; // forts are drawn by their fortification entities
      const [x, y] = this.xy(p.coord);
      places.append(svgEl('circle', { class: 'pl-place', cx: x, cy: y, r: p.raw.rank === 1 ? 2.2 : 1.6 }));
    }
    this.labels = svgEl('g') as SVGGElement;
    this.events = svgEl('g') as SVGGElement;
    const markers = svgEl('g') as SVGGElement;

    for (const ent of c.entities) {
      const style = `--c:${colorOf(c, ent.faction)}`;
      if (ent.track) {
        routes.append(svgEl('polyline', { class: 'pl-route', style, points: this.points(routeOf(ent.track)!) }));
        const nodes: UnitNodes = {
          trail: svgEl('polyline', { class: 'pl-trail', style }) as SVGPolylineElement,
          g: svgEl('g', { class: 'pl-unit', style }) as SVGGElement,
          ring: svgEl('circle', { fill: 'none', stroke: 'currentColor', 'stroke-dasharray': '2 3', opacity: '.55' }) as SVGCircleElement,
          dot: svgEl('circle', { r: 5.5 }) as SVGCircleElement,
          label: svgEl('text') as SVGTextElement,
        };
        nodes.g.append(nodes.ring, nodes.dot, nodes.label);
        trails.append(nodes.trail);
        markers.append(nodes.g);
        this.units.set(ent.id, nodes);
      } else if (ent.coord) {
        const [x, y] = this.xy(ent.coord);
        const r = svgEl('rect', { class: 'pl-fort', x: x - 3.5, y: y - 3.5, width: 7, height: 7, transform: `rotate(45 ${x} ${y})` }) as SVGRectElement;
        markers.append(r);
        this.forts.set(ent.id, r);
      }
    }
    this.svg.append(routes, places, trails, this.labels, this.events, markers);

    // Reduced motion: no autoplay; open on the last same-day battle, when the armies have met.
    const climax = c.events.filter((ev) => ev.importance === 1 && ev.end - ev.start < DAY && ev.start >= this.start && ev.start < this.end).at(-1);
    this.playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.t = this.playing || !climax ? this.start : climax.start;

    this.play.addEventListener('click', () => this.toggle(!this.playing));
    this.scrub.addEventListener('input', () => {
      this.toggle(false);
      this.t = this.start + (Number(this.scrub.value) / 1000) * (this.end - this.start - 1);
      this.draw();
    });
    new IntersectionObserver(([entry]) => { this.visible = entry.isIntersecting; }).observe(this.svg);

    this.relabel();
    this.toggle(this.playing);
    requestAnimationFrame((now) => this.tick(now));
  }

  private xy([lon, lat]: [number, number]): [number, number] {
    return [+(this.ox + lon * this.kx * this.scale).toFixed(1), +(this.oy - lat * this.scale).toFixed(1)];
  }
  private points(coords: [number, number][]): string {
    return coords.map((p) => this.xy(p).join(',')).join(' ');
  }

  private graticule(): SVGGElement {
    const g = svgEl('g') as SVGGElement;
    const lon = (x: number) => (x - this.ox) / (this.kx * this.scale);
    const lat = (y: number) => (this.oy - y) / this.scale;
    const step = 0.1;
    for (let v = Math.ceil(lon(0) / step) * step; v < lon(W); v += step) {
      const x = this.xy([v, 0])[0];
      g.append(svgEl('line', { class: 'pl-grat', x1: x, x2: x, y1: 0, y2: H }));
      g.append(svgEl('text', { class: 'pl-grat-label', x: x + 3, y: H - 6 }, document.createTextNode(`${v.toFixed(1)}°E`)));
    }
    for (let v = Math.ceil(lat(H) / step) * step; v < lat(0); v += step) {
      const y = this.xy([0, v])[1];
      g.append(svgEl('line', { class: 'pl-grat', x1: 0, x2: W, y1: y, y2: y }));
      g.append(svgEl('text', { class: 'pl-grat-label', x: 6, y: y - 3 }, document.createTextNode(`${v.toFixed(1)}°N`)));
    }
    return g;
  }

  /** Place names and the legend, in the current language. Labels are placed greedily, settlements first. */
  relabel(): void {
    const lang = state.lang, fallback = this.c.defaultLanguage;
    this.labels.replaceChildren();
    // Regional anchor towns with an explicit anchor side so they don't fight unit labels.
    const SIDES: Record<string, 'start' | 'end'> = {
      brussels: 'start', waterloo: 'end', wavre: 'end',
      'quatre-bras': 'start', ligny: 'start', charleroi: 'start',
    };
    const candidates = [...this.c.places.values()].filter((p) => SIDES[p.id]);
    for (const p of candidates) {
      const name = pickText(p.raw.name, lang, fallback);
      const side = SIDES[p.id];
      const [x, y] = this.xy(p.coord);
      const bx = side === 'start' ? x + 6 : x - 6;
      this.labels.append(svgEl('text', { class: 'pl-place-label major', x: bx, y: y + 4, 'text-anchor': side }, document.createTextNode(name)));
    }

    const legend = $('plate-legend');
    legend.replaceChildren();
    for (const f of this.c.factions.values()) {
      const dot = document.createElement('i');
      dot.style.setProperty('--c', colorOf(this.c, f.id));
      const li = document.createElement('li');
      li.append(dot, pickText(f.shortName ?? f.name, lang, fallback));
      legend.append(li);
    }
    for (const ent of this.c.entities) {
      const nodes = this.units.get(ent.id);
      if (nodes) nodes.label.textContent = shortName(pickText(ent.raw.name, lang, fallback));
    }
    this.toggle(this.playing);
    this.drawn = null;
    this.draw();
  }

  private toggle(on: boolean): void {
    this.playing = on;
    this.holdUntil = 0;
    this.play.replaceChildren(on ? pauseIcon() : playIcon());
    this.play.setAttribute('aria-label', on ? copy().pause : copy().play);
  }

  private tick(now: number): void {
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;
    if (this.playing && this.visible && now >= this.holdUntil) {
      if (this.holdUntil) { this.holdUntil = 0; this.t = this.start; }
      const battle = this.c.events.some((ev) => ev.importance === 1 && ev.end - ev.start < DAY && this.t >= ev.start && this.t < ev.end);
      const target = battle ? SLOW_RATE : this.fast;
      this.rate += (target - this.rate) * Math.min(1, dt * 3);
      this.t += this.rate * dt;
      if (this.t >= this.end - 1) { this.t = this.end - 1; this.holdUntil = now + HOLD_MS; }
      this.draw();
    }
    requestAnimationFrame((n) => this.tick(n));
  }

  private draw(): void {
    const t = Math.floor(this.t);
    if (t === this.drawn) return;
    this.drawn = t;
    const frame: FrameState = resolveFrame(this.c, t);
    const lang = state.lang, fallback = this.c.defaultLanguage;
    const metresToPx = this.scale / 111320;

    const seen = new Set<string>();
    const unitLabels: Box[] = [];
    for (const fe of frame.entities) {
      seen.add(fe.id);
      const fort = this.forts.get(fe.id);
      if (fort) { fort.style.setProperty('--c', colorOf(this.c, fe.faction)); continue; }
      const u = this.units.get(fe.id);
      if (!u || !fe.position) continue;
      const [x, y] = this.xy(fe.position);
      u.g.style.display = '';
      u.trail.style.display = '';
      u.trail.setAttribute('points', this.points(fe.trail ?? [fe.position]));
      u.dot.setAttribute('cx', String(x));
      u.dot.setAttribute('cy', String(y));
      const unsure = fe.certainty === 'approximate' || fe.certainty === 'conjectural';
      u.ring.setAttribute('cx', String(x));
      u.ring.setAttribute('cy', String(y));
      u.ring.setAttribute('r', unsure ? (DEFAULT_RADIUS[fe.certainty!] * metresToPx).toFixed(1) : '0');
      const w = (u.label.textContent?.length ?? 0) * 6.3;
      const right: Box = [x + 9, y - 9, x + 9 + w, y + 5];
      const clash = right[2] > W - 4 || unitLabels.some((o) => overlaps(right, o));
      const box: Box = clash ? [x - 9 - w, y - 9, x - 9, y + 5] : right;
      unitLabels.push(box);
      u.label.setAttribute('x', String(clash ? x - 9 : x + 9));
      u.label.setAttribute('y', String(y + 4));
      u.label.setAttribute('text-anchor', clash ? 'end' : 'start');
    }
    for (const [id, u] of this.units) if (!seen.has(id)) { u.g.style.display = 'none'; u.trail.style.display = 'none'; }
    for (const [id, r] of this.forts) r.style.display = seen.has(id) ? '' : 'none';

    this.events.replaceChildren();
    let headline: { importance: number; name: string } | null = null;
    for (const fev of frame.events) {
      if (fev.phase !== 'active' || !fev.position || fev.importance > 2) continue;
      const [x, y] = this.xy(fev.position);
      this.events.append(svgEl('circle', { class: 'pl-event', cx: x, cy: y, r: 14 }), svgEl('circle', { class: 'pl-event-dot', cx: x, cy: y, r: 2.5 }));
      const ev = this.c.events.find((e) => e.id === fev.id)!;
      if (!headline || fev.importance < headline.importance) headline = { importance: fev.importance, name: pickText(ev.raw.name, lang, fallback) };
    }
    const chapter = chapterAt(this.c, t);
    $('plate-date').textContent = formatTicks(t, lang, 'minute');
    $('plate-event').textContent = headline?.name ?? (chapter ? pickText(chapter.raw.title, lang, fallback) : '');

    const p = (t - this.start) / (this.end - this.start - 1);
    this.scrub.value = String(Math.round(p * 1000));
    this.scrub.style.setProperty('--p', `${(p * 100).toFixed(2)}%`);
  }
}

/** The whole planned route of a track: the first waypoint, then every leg after it. */
function routeOf(track: NormalizedCampaign['entities'][number]['track']): [number, number][] | null {
  if (!track?.length) return null;
  return [track[0].coord, ...track.slice(1).flatMap((w) => (w.leg ?? [w.coord]).slice(w.leg ? 1 : 0))];
}
function colorOf(c: NormalizedCampaign, faction: string): string {
  const color = c.factions.get(faction)?.color ?? '';
  return HEX.test(color) ? color : 'var(--ink-2)';
}
/** "Anglo-Allied Army (Wellington)" → "Wellington": the commander reads better at plate scale. */
function shortName(name: string): string {
  return /\(([^)]+)\)\s*$/.exec(name)?.[1] ?? name;
}

let plate: Plate | null = null;

async function initPlate(): Promise<void> {
  const figure = $('plate');
  try {
    const res = await fetch('/campaigns/waterloo-1815.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { campaign } = loadCampaign((await res.json()) as CampaignFile);
    if (!campaign) throw new Error('campaign failed to load');
    plate = new Plate(campaign);
    figure.setAttribute('aria-busy', 'false');
  } catch (e) {
    figure.classList.add('failed');
    figure.setAttribute('aria-busy', 'false');
    $('plate-status').dataset.i18n = 'plateFailed';
    $('plate-status').textContent = copy().plateFailed;
    console.error('Histamation landing preview:', e);
  }
}

applyCopy();
void initPlate();
