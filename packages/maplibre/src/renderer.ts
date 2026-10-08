/**
 * Campaign renderer for MapLibre.
 *
 * Static geometry (places, uncertainty halos, territories, routes) is set once at load.
 * Per frame only small things change: trail lines, event circles, unit and fort markers.
 * That is the rule from contract §7.2 — never stream the whole map on every frame.
 */
import { Marker, Popup, type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';
import type { Feature, FeatureCollection, Position } from 'geojson';
import type { FrameState, NormEntity, NormEvent, NormalizedCampaign, Ticks } from '@pholidlabs/chronomap-engine';
import { alongPath, pickText } from '@pholidlabs/chronomap-engine';
import { factionColor, parchmentLight, withAlpha, type ChronoTheme } from './theme.js';
import { DEFAULT_BASEMAP_PATH, graticuleFor } from './style.js';
import { renderMountainSvg, renderForestSvg, renderFortressSvg, renderEmbellishmentSvg } from './pictorial.js';

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };
const DAY = 86400;
const BATTLE_KINDS = new Set(['battle', 'siege', 'skirmish', 'raid', 'massacre']);
const HOLLOW_STATUSES: Record<string, true> = { captive: true, exiled: true, surrendered: true, disbanded: true, dead: true };

type PictorialKind = 'volcano' | 'range' | 'peak' | 'forest' | 'ornament';
/** Kind line of a pictorial basemap popup; languages without an entry read English. */
const PICTORIAL_KIND: Record<string, Record<PictorialKind, string>> = {
  en: { volcano: 'Volcano', range: 'Mountain range', peak: 'Mountain', forest: 'Historic forest', ornament: 'Sea ornament' },
  id: { volcano: 'Gunung Api', range: 'Pegunungan', peak: 'Gunung', forest: 'Hutan Sejarah', ornament: 'Hiasan Samudra' },
};

export interface RendererOptions {
  theme?: ChronoTheme; language?: string; maxStrengthBandMeters?: number;
  /** Elements labels must not sit under — the legend, the cartouche, the timeline. */
  avoidSelector?: string;
  basemapPath?: string;
  reduceMotion?: boolean;
}

interface LabelMarker { marker: Marker; el: HTMLElement }
interface UnitMarkerEntry {
  marker: Marker;
  el: HTMLElement;
  icon: HTMLElement;
  text: HTMLElement;
  nameEl: HTMLElement;
  strengthEl: HTMLElement;
}
interface FortMarkerEntry {
  marker: Marker;
  el: HTMLElement;
  art: HTMLElement;
  label: HTMLElement;
}
interface PeakMarkerEntry {
  marker: Marker;
  el: HTMLElement;
  caption: HTMLElement;
}
interface ForestMarkerEntry {
  marker: Marker;
  el: HTMLElement;
  caption: HTMLElement;
}
interface Box { left: number; right: number; top: number; bottom: number }
interface Blocker { box: Box; owner: Element | null; symbol: boolean }
function pushBox(into: Blocker[], el: Element | null, owner: Element | null, symbol: boolean): void {
  if (!(el instanceof HTMLElement) && !(el instanceof SVGElement)) return;
  const r = el.getBoundingClientRect();
  if (r.width > 0 && r.height > 0) into.push({ box: r, owner, symbol });
}

/** Basemap feature properties are data: they only ever reach the DOM as text. */
function textEl(tag: string, className: string, text: unknown): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = String(text ?? '');
  return node;
}

export class ChronoMapRenderer {
  private campaign: NormalizedCampaign | null = null;
  /** Entities by id, built once per campaign: setFrame looks every frame entity up. */
  private entities = new Map<string, NormEntity>();
  private events = new Map<string, NormEvent>();
  private factionColors = new Map<string, string>();
  private numberFormat: Intl.NumberFormat;
  private theme: ChronoTheme;
  private language: string;
  private bandMeters: number;
  private avoidSelector: string;
  private avoidEls: Element[] | null = null;
  private basemapPath: string;
  private reduceMotion: boolean;
  private maxStrength = 0;
  private unitMarkers = new Map<string, UnitMarkerEntry>();
  private fortMarkers = new Map<string, FortMarkerEntry>();
  private placeLabels = new Map<string, LabelMarker>();
  private eventLabels = new Map<string, LabelMarker>();
  private peakLabels = new Map<string, PeakMarkerEntry>();
  private forestLabels = new Map<string, ForestMarkerEntry>();
  private embellishmentMarkers = new Map<string, LabelMarker>();
  private basemapPlaceLabels = new Map<string, LabelMarker>();
  private basemapPopup: Popup | null = null;
  private focus = new Set<string>();
  private lastTerritoryKey = '';
  private ready = false;
  private hasActiveMarch = false;
  private animFrameId: number | null = null;
  private dashPhase = 0;
  private lastAnimTime = 0;
  private onZoom = () => this.applyLabelVisibility();
  private onMove = () => this.scheduleDeclutter();
  private onResize = () => { this.avoidEls = null; };
  private installHandler = () => this.install();
  private lastFrame: { frame: FrameState; focus: string[] } | null = null;
  constructor(private map: MapLibreMap, opts: RendererOptions = {}) {
    this.theme = opts.theme ?? parchmentLight;
    this.language = opts.language ?? 'en';
    this.numberFormat = new Intl.NumberFormat(this.language);
    this.bandMeters = opts.maxStrengthBandMeters ?? 18000;
    this.avoidSelector = opts.avoidSelector ?? '[data-cm-avoid]';
    this.basemapPath = opts.basemapPath ?? DEFAULT_BASEMAP_PATH;
    this.reduceMotion = opts.reduceMotion ?? false;

    /* setStyle() can fire 'style.load' before it returns, while isStyleLoaded() is still false
       because sources are loading. A renderer built right after setStyle() would then wait on
       an event that has already fired; 'idle' always follows, so it is the backstop. */
    if (this.map.isStyleLoaded()) {
      this.install();
    } else {
      this.map.once('style.load', this.installHandler);
      this.map.once('idle', this.installHandler);
    }
    this.map.on('zoom', this.onZoom);
    this.map.on('move', this.onMove);
    this.map.on('resize', this.onResize);
  }

  private install(): void {
    if (this.ready) return;
    this.installLayers();
    this.ready = true;
    this.refreshGraticule();
    this.loadBasemapLabels();
    if (this.campaign) {
      this.buildStatic();
    }
    if (this.lastFrame) {
      this.setFrame(this.lastFrame.frame, this.lastFrame.focus);
    }
  }

  private async loadBasemapLabels(): Promise<void> {
    if (typeof fetch === 'undefined') return;
    try {
      const [peaks, places, forests, embellishments] = await Promise.all(['peaks', 'places', 'forests', 'embellishments'].map((name) =>
        fetch(`${this.basemapPath}/${name}.geojson`).then((res) => (res.ok ? res.json() as Promise<FeatureCollection> : null)).catch(() => null)));
      if (!this.ready) return; // destroyed while the files were in flight: their markers would never be removed
      if (peaks) this.initPeakLabels(peaks);
      if (places) this.initBasemapPlaceLabels(places);
      if (forests) this.initForestLabels(forests);
      if (embellishments) this.initEmbellishments(embellishments);
    } catch {
      // Graceful offline fallback
    }
  }

  private initPeakLabels(fc: FeatureCollection): void {
    for (const f of fc.features) {
      const p = f.properties as Record<string, any>;
      if (!p || !p.id || f.geometry.type !== 'Point') continue;
      const coord = f.geometry.coordinates as [number, number];
      const el = document.createElement('div');
      el.className = `cm-peak-marker rank-${p.rank ?? 2}`;
      // The art is generated SVG with no feature text in it; the caption is built as text.
      el.innerHTML = `<div class="cm-peak-art">${renderMountainSvg(p)}</div>`;
      const caption = textEl('div', 'cm-peak-caption', '');
      caption.append(textEl('span', 'cm-peak-name', p.name));
      if (p.elevation) caption.append(textEl('span', 'cm-peak-elev', `${p.elevation} m`));
      el.append(caption);
      this.bindPictorialPopup(el, coord, p.type === 'volcano' ? 'volcano' : p.type === 'range' ? 'range' : 'peak', p);
      const marker = new Marker({ element: el, anchor: 'bottom', offset: [0, 4] }).setLngLat(coord).addTo(this.map);
      this.peakLabels.set(p.id, { marker, el, caption });
    }
    this.applyLabelVisibility();
  }

  private initForestLabels(fc: FeatureCollection): void {
    for (const f of fc.features) {
      const p = f.properties as Record<string, any>;
      if (!p || !p.id || f.geometry.type !== 'Point') continue;
      const coord = f.geometry.coordinates as [number, number];
      const el = document.createElement('div');
      el.className = `cm-forest-marker rank-${p.rank ?? 2}`;
      el.innerHTML = `<div class="cm-forest-art">${renderForestSvg(p)}</div>`;
      const caption = textEl('div', 'cm-forest-caption', '');
      caption.append(textEl('span', 'cm-forest-name', p.name));
      el.append(caption);
      this.bindPictorialPopup(el, coord, 'forest', p);
      const marker = new Marker({ element: el, anchor: 'bottom', offset: [0, 2] }).setLngLat(coord).addTo(this.map);
      this.forestLabels.set(p.id, { marker, el, caption });
    }
    this.applyLabelVisibility();
  }

  private initEmbellishments(fc: FeatureCollection): void {
    for (const f of fc.features) {
      const p = f.properties as Record<string, any>;
      if (!p || !p.id || f.geometry.type !== 'Point') continue;
      const coord = f.geometry.coordinates as [number, number];
      const el = document.createElement('div');
      el.className = `cm-embellishment-marker kind-${p.kind ?? 'cartouche'}`;
      el.innerHTML = renderEmbellishmentSvg(p.kind ?? 'compass-rose');
      this.bindPictorialPopup(el, coord, 'ornament', p);
      const marker = new Marker({ element: el, anchor: 'center' }).setLngLat(coord).addTo(this.map);
      this.embellishmentMarkers.set(p.id, { marker, el });
    }
    this.applyLabelVisibility();
  }

  /** Pictorial art is DOM, not a map layer, so it opens its own popup rather than the host's. */
  private bindPictorialPopup(el: HTMLElement, coord: [number, number], kind: PictorialKind, p: Record<string, any>): void {
    el.addEventListener('click', (ev) => {
      ev.stopPropagation(); // the map's click would close the popup as it opens
      const box = document.createElement('div');
      box.className = 'cm-pictorial-popup';
      box.append(textEl('div', 'kind', (PICTORIAL_KIND[this.language] ?? PICTORIAL_KIND.en)[kind]), textEl('h4', '', p.name));
      if (p.elevation) box.append(textEl('div', 'muted', `${p.elevation} m`));
      if (p.note) box.append(textEl('div', 'note', p.note));
      this.basemapPopup ??= new Popup({ closeButton: true, maxWidth: '280px', offset: 12 });
      this.basemapPopup.setLngLat(coord).setDOMContent(box).addTo(this.map);
    });
  }

  private initBasemapPlaceLabels(fc: FeatureCollection): void {
    for (const f of fc.features) {
      const p = f.properties as Record<string, any>;
      if (!p || !p.id || f.geometry.type !== 'Point') continue;
      const coord = f.geometry.coordinates as [number, number];
      const el = document.createElement('div');
      el.className = `cm-basemap-place-label rank-${p.rank ?? 3} kind-${p.kind ?? 'town'}`;
      el.textContent = p.label ?? p.name;
      const marker = new Marker({ element: el, anchor: 'left', offset: [7, 0] }).setLngLat(coord).addTo(this.map);
      this.basemapPlaceLabels.set(p.id, { marker, el });
    }
    this.applyLabelVisibility();
  }

  /* ---------------------------------------------------------------- layers */
  private installLayers(): void {
    const m = this.map, t = this.theme;
    const add = (id: string, data: FeatureCollection = EMPTY) => {
      if (!m.getSource(id)) m.addSource(id, { type: 'geojson', data });
    };
    for (const id of ['cm-halos', 'cm-territories', 'cm-routes', 'cm-trails', 'cm-active-march', 'cm-places', 'cm-events']) add(id);

    const addLayerSafe = (layer: Parameters<typeof m.addLayer>[0], before?: string) => {
      if (!m.getLayer(layer.id)) m.addLayer(layer, before);
    };

    addLayerSafe({ id: 'cm-territory-fill', type: 'fill', source: 'cm-territories', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.14 } });
    addLayerSafe({ id: 'cm-territory-line', type: 'line', source: 'cm-territories', paint: { 'line-color': ['get', 'color'], 'line-opacity': 0.5, 'line-width': 1.2, 'line-dasharray': [4, 3] } });
    addLayerSafe({ id: 'cm-route', type: 'line', source: 'cm-routes', paint: { 'line-color': ['get', 'color'], 'line-opacity': 0.5, 'line-width': 1.6, 'line-dasharray': [3, 3] } });
    addLayerSafe({ id: 'cm-halo-fill', type: 'fill', source: 'cm-halos', paint: { 'fill-color': t.ink, 'fill-opacity': ['case', ['get', 'focus'], 0.09, 0.04] } });
    addLayerSafe({
      id: 'cm-halo-line', type: 'line', source: 'cm-halos',
      filter: ['==', ['get', 'certainty'], 'conjectural'],
      paint: { 'line-color': t.ink, 'line-opacity': ['case', ['get', 'focus'], 0.45, 0.18], 'line-width': 1, 'line-dasharray': [2, 3] },
    });

    // Minard-style band: the width is a real width on the ground, so it doubles
    // with every zoom level. MapLibre only accepts ['zoom'] as the input of a
    // top-level interpolate, so the clamp cannot wrap the interpolation; instead
    // each integer zoom gets its own clamped stop. Between two stops an
    // exponential-base-2 curve is exactly the ground-width curve, so this
    // reproduces `clamp(w0 * 2^zoom)` while staying a legal expression.
    const strengthStops: unknown[] = ['interpolate', ['exponential', 2], ['zoom']];
    for (let z = 0; z <= 22; z += 1) {
      strengthStops.push(z, ['max', 1.2, ['min', 64, ['*', ['get', 'w0'], 2 ** z]]]);
    }
    const strengthWidth: unknown = strengthStops;
    addLayerSafe({ id: 'cm-trail-band', type: 'line', source: 'cm-trails', filter: ['all', ['==', ['get', 'dash'], 'none'], ['has', 'w0']],
      layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': strengthWidth as never } });
    addLayerSafe({ id: 'cm-trail-solid', type: 'line', source: 'cm-trails', filter: ['all', ['==', ['get', 'dash'], 'none'], ['!', ['has', 'w0']]],
      layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 2.6 } });
    addLayerSafe({ id: 'cm-trail-conjectural', type: 'line', source: 'cm-trails', filter: ['==', ['get', 'dash'], 'conjectural'],
      layout: { 'line-cap': 'butt', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 2.4, 'line-dasharray': [3, 2] } });
    addLayerSafe({ id: 'cm-trail-sea', type: 'line', source: 'cm-trails', filter: ['==', ['get', 'dash'], 'sea'],
      layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 2.2, 'line-dasharray': [0.6, 2.4] } });
    addLayerSafe({
      id: 'cm-march-flow', type: 'line', source: 'cm-active-march',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 3.2,
        'line-dasharray': [0.5, 1.5, 2.5, 1.5],
        'line-opacity': 0.88,
      },
    });

    addLayerSafe({
      id: 'cm-place-dot', type: 'circle', source: 'cm-places',
      paint: {
        'circle-radius': ['case', ['get', 'focus'], 4, 2.6],
        'circle-color': ['case', ['get', 'focus'], t.ink, t.inkSoft],
        'circle-stroke-width': 1.2, 'circle-stroke-color': t.land,
      },
    });
    addLayerSafe({
      id: 'cm-event-past', type: 'circle', source: 'cm-events', filter: ['==', ['get', 'phase'], 'past'],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'importance'], 1, 5, 5, 2.5],
        'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': t.eventPast,
        'circle-stroke-width': 1.4, 'circle-opacity': 0, 'circle-stroke-opacity': ['get', 'fade'],
      },
    });
    addLayerSafe({
      id: 'cm-event-active', type: 'circle', source: 'cm-events', filter: ['==', ['get', 'phase'], 'active'],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'importance'], 1, 8, 5, 4],
        'circle-color': t.halo, 'circle-opacity': 0.85,
        'circle-stroke-color': t.event, 'circle-stroke-width': 2,
      },
    });
    addLayerSafe({
      id: 'cm-event-pulse', type: 'circle', source: 'cm-events', filter: ['==', ['get', 'phase'], 'active'],
      paint: { 'circle-radius': 10, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': t.event, 'circle-stroke-width': 1.5, 'circle-stroke-opacity': 0.5 },
    });
  }

  /**
   * The grid is built once per campaign, over the campaign's own extent padded
   * out, and banded by layer zoom in the style. Nothing is regenerated while
   * the camera moves, so a flight never leaves a rectangle of stale grid behind.
   */
  private refreshGraticule(): void {
    if (!this.ready) return;
    const src = this.map.getSource('graticule') as GeoJSONSource | undefined;
    if (!src) return;
    src.setData(graticuleFor(this.dataBounds()));
  }

  /** Bounding box of everything the campaign places on the map. */
  private dataBounds(): { west: number; south: number; east: number; north: number } {
    let w = 180, e = -180, s = 85, n = -85, seen = false;
    const add = (lng: number, lat: number): void => {
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
      seen = true;
      if (lng < w) w = lng; if (lng > e) e = lng;
      if (lat < s) s = lat; if (lat > n) n = lat;
    };
    const walk = (coords: unknown): void => {
      if (!Array.isArray(coords)) return;
      if (typeof coords[0] === 'number' && typeof coords[1] === 'number') { add(coords[0], coords[1]); return; }
      for (const c of coords) walk(c);
    };
    const c = this.campaign;
    if (c) {
      for (const place of c.places.values()) add(place.coord[0], place.coord[1]);
      for (const entity of c.entities) {
        if (entity.coord) add(entity.coord[0], entity.coord[1]);
        walk(entity.polygons);
        walk(entity.path);
        for (const wp of entity.track ?? []) { add(wp.coord[0], wp.coord[1]); walk(wp.leg); }
      }
      for (const ev of c.events) if (ev.coord) add(ev.coord[0], ev.coord[1]);
      const declared = c.meta.map?.bounds;
      if (declared) { add(declared[0], declared[1]); add(declared[2], declared[3]); }
    }
    if (!seen) {
      const b = this.map.getBounds();
      return { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
    }
    return { west: w, south: s, east: e, north: n };
  }

  /* ---------------------------------------------------------------- campaign (static) */
  setCampaign(campaign: NormalizedCampaign): void {
    this.campaign = campaign;
    this.entities = new Map(campaign.entities.map((e) => [e.id, e]));
    this.events = new Map(campaign.events.map((e) => [e.id, e]));
    this.factionColors.clear();
    for (const [id, f] of campaign.factions) {
      this.factionColors.set(id, factionColor(f.color ?? '#7a6a58', this.theme));
    }
    this.maxStrength = 0;
    for (const e of campaign.entities) for (const w of e.track ?? []) if (w.strength) this.maxStrength = Math.max(this.maxStrength, w.strength);
    this.clearCampaignMarkers();
    this.lastTerritoryKey = '';
    // Not ready yet: install() builds from this.campaign once the style can take layers.
    if (this.ready) {
      this.buildStatic();
      this.refreshGraticule();
    }
  }

  private buildStatic(): void {
    const c = this.campaign;
    if (!c) return;
    const places: Feature[] = [], halos: Feature[] = [], routes: Feature[] = [];
    for (const p of c.places.values()) {
      places.push({
        type: 'Feature', id: p.id,
        properties: { id: p.id, rank: p.raw.rank ?? 4, certainty: p.certainty, focus: false, name: pickText(p.raw.name, this.language, c.defaultLanguage) },
        geometry: { type: 'Point', coordinates: p.coord },
      });
      if (p.certainty !== 'exact') {
        halos.push({
          type: 'Feature', properties: { certainty: p.certainty, focus: false },
          geometry: { type: 'Polygon', coordinates: [circleRing(p.coord, p.radiusMeters)] },
        });
      }
      this.ensurePlaceLabel(p.id, p.coord, pickText(p.raw.name, this.language, c.defaultLanguage));
    }
    for (const e of c.entities) {
      if (!e.path) continue;
      routes.push({
        type: 'Feature', properties: { color: factionColor(c.factions.get(e.faction)?.color ?? '#7a6a58', this.theme) },
        geometry: { type: 'LineString', coordinates: e.path },
      });
    }
    this.setSource('cm-places', { type: 'FeatureCollection', features: places });
    this.setSource('cm-halos', { type: 'FeatureCollection', features: halos });
    this.setSource('cm-routes', { type: 'FeatureCollection', features: routes });
    this.applyLabelVisibility();
  }

  /* ---------------------------------------------------------------- frame (dynamic) */
  setFrame(frame: FrameState, focus: string[] = []): void {
    this.lastFrame = { frame, focus };
    const c = this.campaign;
    if (!c || !this.ready) return;
    this.focus = new Set(focus);
    const t = frame.t;

    const trails: Feature[] = [];
    const activeMarches: Feature[] = [];
    const territories: Feature[] = [];
    const liveUnits = new Set<string>(), liveForts = new Set<string>();

    for (const fe of frame.entities) {
      const ne = this.entities.get(fe.id);
      if (!ne) continue;
      const color = this.factionColors.get(fe.faction) ?? factionColor(c.factions.get(fe.faction)?.color ?? '#7a6a58', this.theme);
      if (ne.polygons) {
        for (const poly of ne.polygons) {
          territories.push({ type: 'Feature', properties: { color, id: fe.id }, geometry: { type: 'Polygon', coordinates: poly as Position[][] } });
        }
      }
      if (ne.track) {
        const { features, activeMarch } = this.trailFeatures(ne, fe.strength ?? null, t, color);
        trails.push(...features);
        if (activeMarch && fe.moving) activeMarches.push(activeMarch);
        liveUnits.add(fe.id);
        this.updateUnitMarker(ne, fe, color);
      } else if (ne.coord) {
        liveForts.add(fe.id);
        this.updateFortMarker(ne, fe, color);
      }
    }
    for (const [id, m] of this.unitMarkers) if (!liveUnits.has(id)) { m.marker.remove(); this.unitMarkers.delete(id); }
    for (const [id, m] of this.fortMarkers) if (!liveForts.has(id)) { m.marker.remove(); this.fortMarkers.delete(id); }

    const territoryKey = territories.map((f) => `${f.properties!.id}:${f.properties!.color}`).join('|');
    if (territoryKey !== this.lastTerritoryKey) { this.setSource('cm-territories', { type: 'FeatureCollection', features: territories }); this.lastTerritoryKey = territoryKey; }
    this.setSource('cm-trails', { type: 'FeatureCollection', features: trails });
    this.setSource('cm-active-march', { type: 'FeatureCollection', features: activeMarches });
    this.hasActiveMarch = activeMarches.length > 0;
    if (this.hasActiveMarch && !this.animFrameId && !this.reduceMotion) {
      this.startMarchAnimation();
    }

    const events: Feature[] = [];
    const liveEventLabels = new Set<string>();
    for (const ev of frame.events) {
      if (!ev.position) continue;
      const fade = ev.phase === 'active' ? 1 : Math.max(0.22, 0.6 - (ev.sinceEnd / (420 * DAY)) * 0.34);
      events.push({
        type: 'Feature', id: ev.id,
        properties: { id: ev.id, kind: ev.kind, phase: ev.phase, importance: ev.importance, fade, battle: BATTLE_KINDS.has(ev.kind) },
        geometry: { type: 'Point', coordinates: ev.position },
      });
      if (ev.phase === 'active') {
        liveEventLabels.add(ev.id);
        const raw = this.events.get(ev.id)?.raw;
        if (raw) this.ensureEventLabel(ev.id, ev.position, pickText(raw.name, this.language, c.defaultLanguage));
      }
    }
    for (const [id, m] of this.eventLabels) if (!liveEventLabels.has(id)) { m.marker.remove(); this.eventLabels.delete(id); }
    this.setSource('cm-events', { type: 'FeatureCollection', features: events });

    this.applyLabelVisibility();
  }

  /** Legs travelled so far, with Minard-style width where the data asks for it. */
  private trailFeatures(
    ne: NormEntity, strength: number | null, t: Ticks, color: string
  ): { features: Feature[]; activeMarch: Feature | null } {
    const mode = ne.style?.trail ?? 'full';
    if (mode === 'none') return { features: [], activeMarch: null };
    const track = ne.track!;
    const segs: { coords: [number, number][]; dash: string; strength: number | null; lat: number }[] = [];
    let activeMarchCoords: [number, number][] | null = null;
    for (let k = 1; k < track.length; k++) {
      const node = track[k], prev = track[k - 1];
      if (t < prev.depart) break;
      let coords = node.leg!;
      let partial = false;
      if (t < node.arrive) {
        const f = Math.min(1, Math.max(0, (t - prev.depart) / Math.max(1, node.arrive - prev.depart)));
        coords = alongPath(node.leg!, f).travelled;
        partial = true;
        if (coords.length >= 2) activeMarchCoords = coords;
      }
      segs.push({
        coords,
        dash: node.mode === 'sea' ? 'sea' : node.certainty === 'conjectural' ? 'conjectural' : 'none',
        strength: partial ? strength ?? node.strength : node.strength ?? prev.strength,
        lat: node.coord[1],
      });
      if (partial) break;
    }
    const drawn = mode === 'leg' ? segs.slice(-1) : segs;
    const useWidth = ne.style?.widthBy === 'strength' && this.maxStrength > 0;
    const features = drawn.map((seg, i) => {
      const age = drawn.length > 1 ? 0.45 + 0.55 * ((i + 1) / drawn.length) : 1;
      const props: Record<string, unknown> = { color: withAlpha(color, age), dash: seg.dash };
      if (useWidth && seg.strength) {
        const meters = this.bandMeters * (seg.strength / this.maxStrength);
        props.w0 = meters / (156543.03 * Math.cos((seg.lat * Math.PI) / 180));
      }
      return { type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: seg.coords } } as Feature;
    });
    const activeMarch = activeMarchCoords ? ({
      type: 'Feature',
      properties: { color },
      geometry: { type: 'LineString', coordinates: activeMarchCoords }
    } as Feature) : null;

    return { features, activeMarch };
  }

  private startMarchAnimation(): void {
    if (this.animFrameId || this.reduceMotion) return;
    const tick = (now: number) => {
      if (!this.hasActiveMarch || !this.ready) {
        this.animFrameId = null;
        return;
      }
      if (now - this.lastAnimTime > 50) {
        this.lastAnimTime = now;
        this.dashPhase = (this.dashPhase + 0.3) % 3;
        if (this.map.getLayer('cm-march-flow')) {
          const p = Number(this.dashPhase.toFixed(2));
          this.map.setPaintProperty('cm-march-flow', 'line-dasharray', [0.1 + p, 1.4, 3 - p, 1.4]);
        }
      }
      this.animFrameId = requestAnimationFrame(tick);
    };
    this.animFrameId = requestAnimationFrame(tick);
  }

  /* ---------------------------------------------------------------- markers */
  private updateUnitMarker(ne: NormEntity, fe: FrameState['entities'][number], color: string): void {
    if (!fe.position) return;
    let entry = this.unitMarkers.get(ne.id);
    if (!entry) {
      const el = document.createElement('div');
      el.className = 'cm-unit';
      const icon = document.createElement('span');
      icon.className = 'cm-unit-icon';
      const text = document.createElement('span');
      text.className = 'cm-unit-text';
      const nameEl = document.createElement('span');
      nameEl.className = 'cm-unit-name';
      const strengthEl = document.createElement('span');
      strengthEl.className = 'cm-unit-strength';
      text.append(nameEl, strengthEl);
      el.append(icon, text);
      // Anchored on the icon, not the row: hiding the name must not move the dot.
      entry = {
        marker: new Marker({ element: el, anchor: 'left', offset: [-6.5, 0] }).setLngLat(fe.position).addTo(this.map),
        el, icon, text, nameEl, strengthEl,
      };
      this.unitMarkers.set(ne.id, entry);
    }
    entry.marker.setLngLat(fe.position);
    const hollow = Boolean(HOLLOW_STATUSES[fe.status]);
    entry.icon.style.setProperty('--cm-colour', color);
    entry.icon.className = `cm-unit-icon${hollow ? ' is-hollow' : ''}${fe.moving ? ' is-moving' : ''}`;
    entry.icon.style.setProperty('--cm-rotate', `${(fe.bearing ?? 0) - this.map.getBearing()}deg`);
    const raw = ne.raw;
    const wpLabel = fe.waypoint != null ? raw.track?.[fe.waypoint]?.label : null;
    const lang = this.language, fallback = this.campaign?.defaultLanguage;
    entry.nameEl.textContent = wpLabel ? pickText(wpLabel, lang, fallback) : pickText(raw.name, lang, fallback);
    entry.strengthEl.textContent = fe.strength ? this.numberFormat.format(Math.round(fe.strength)) : '';
    entry.el.classList.toggle('is-focus', this.focus.has(ne.id));
  }

  private updateFortMarker(ne: NormEntity, fe: FrameState['entities'][number], color: string): void {
    if (!ne.coord) return;
    let entry = this.fortMarkers.get(ne.id);
    if (!entry) {
      const el = document.createElement('div');
      el.className = 'cm-fort';
      const art = document.createElement('span');
      art.className = 'cm-fort-art';
      art.innerHTML = renderFortressSvg(color);
      const label = document.createElement('span');
      label.className = 'cm-fort-label';
      label.textContent = pickText(ne.raw.name, this.language, this.campaign?.defaultLanguage);
      el.append(art, label);
      entry = { marker: new Marker({ element: el, anchor: 'center' }).setLngLat(ne.coord).addTo(this.map), el, art, label };
      this.fortMarkers.set(ne.id, entry);
    }
    entry.el.style.setProperty('--cm-colour', color);
    entry.el.classList.toggle('is-besieged', fe.status === 'besieged');
    entry.el.classList.toggle('is-lost', fe.status === 'destroyed' || fe.status === 'abandoned');
    entry.el.classList.toggle('is-focus', this.focus.has(ne.id));
  }

  private ensurePlaceLabel(id: string, coord: [number, number], text: string): void {
    let entry = this.placeLabels.get(id);
    if (!entry) {
      const el = document.createElement('div');
      el.className = 'cm-place-label';
      entry = { marker: new Marker({ element: el, anchor: 'left', offset: [7, 0] }).setLngLat(coord).addTo(this.map), el };
      this.placeLabels.set(id, entry);
    }
    entry.el.textContent = text;
  }
  private ensureEventLabel(id: string, coord: [number, number], text: string): void {
    let entry = this.eventLabels.get(id);
    if (!entry) {
      const el = document.createElement('div');
      el.className = 'cm-event-label';
      entry = { marker: new Marker({ element: el, anchor: 'bottom', offset: [0, -14] }).setLngLat(coord).addTo(this.map), el };
      this.eventLabels.set(id, entry);
    }
    entry.el.textContent = text;
  }

  /** Label density by zoom and rank; focused items always show (contract §7.4). */
  private applyLabelVisibility(): void {
    const c = this.campaign;
    const z = this.map.getZoom();
    if (c) {
      for (const [id, entry] of this.placeLabels) {
        const rank = c.places.get(id)?.raw.rank ?? 4;
        const show = this.focus.has(id) || (rank <= 1 ? z >= 3.6 : rank === 2 ? z >= 7.2 : rank === 3 ? z >= 8.6 : z >= 10.2);
        entry.el.classList.toggle('is-hidden', !show);
        entry.el.classList.toggle('is-focus', this.focus.has(id));
      }
      for (const [id, entry] of this.fortMarkers) entry.el.classList.toggle('show-label', this.focus.has(id) || z >= 9.5);
    }

    // Basemap places: show based on rank, hide if superseded by campaign place
    for (const [id, entry] of this.basemapPlaceLabels) {
      const isOverridden = !!c?.places.has(id);
      const cls = entry.el.className;
      const isRank1 = cls.includes('rank-1');
      const isRank2 = cls.includes('rank-2');
      const show = !isOverridden && (isRank1 ? z >= 5.5 : isRank2 ? z >= 7.5 : z >= 9.0);
      entry.el.classList.toggle('is-hidden', !show);
    }

    // Mountain peaks: show based on rank
    for (const [, entry] of this.peakLabels) {
      const isRank1 = entry.el.className.includes('rank-1');
      const show = isRank1 ? z >= 6.5 : z >= 8.0;
      entry.el.classList.toggle('is-hidden', !show);
    }

    // Historical forests: show based on rank
    for (const [, entry] of this.forestLabels) {
      const isRank1 = entry.el.className.includes('rank-1');
      const show = isRank1 ? z >= 6.5 : z >= 8.0;
      entry.el.classList.toggle('is-hidden', !show);
    }

    // Nautical ocean embellishments: overview and regional zoom
    for (const [, entry] of this.embellishmentMarkers) {
      const show = z >= 4.0 && z <= 10.5;
      entry.el.classList.toggle('is-hidden', !show);
    }

    this.scheduleDeclutter();
  }

  /**
   * Greedy label declutter. Labels are DOM, not glyphs, so MapLibre's own
   * collision engine never sees them; without this, a dense chapter stacks
   * four names on one town. Text is dropped, never symbols: a unit keeps its
   * counter and a fort its star even when the name goes.
   */
  private scheduleDeclutter(): void {
    if (this.declutterQueued) return;
    this.declutterQueued = true;
    const run = () => { this.declutterQueued = false; this.declutter(); };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run); else run();
  }

  private declutter(): void {
    const c = this.campaign;
    type Cand = { el: HTMLElement; pri: number; owner: Element | null };
    const cands: Cand[] = [];
    const FOCUS_BONUS = 5;
    const clear = (el: HTMLElement | null): void => {
      if (el && el.classList.contains('is-crowded')) el.classList.remove('is-crowded');
    };
    const push = (el: HTMLElement | null, pri: number, focused: boolean, owner: Element | null): void => {
      if (!el) return;
      if (el.classList.contains('is-crowded')) el.classList.remove('is-crowded');
      cands.push({ el, pri: focused ? pri - FOCUS_BONUS : pri, owner });
    };
    for (const [id, e] of this.unitMarkers) push(e.text, 10, this.focus.has(id), e.el);
    for (const [id, e] of this.eventLabels) push(e.el, 20, this.focus.has(id), e.el);
    for (const [id, e] of this.fortMarkers) {
      if (!e.el.classList.contains('show-label')) { clear(e.label); continue; }
      push(e.label, 30, this.focus.has(id), e.el);
    }
    for (const [id, e] of this.placeLabels) {
      if (e.el.classList.contains('is-hidden')) { clear(e.el); continue; }
      push(e.el, 40 + (c?.places.get(id)?.raw.rank ?? 4), this.focus.has(id), e.el);
    }
    for (const [, e] of this.basemapPlaceLabels) {
      if (e.el.classList.contains('is-hidden')) { clear(e.el); continue; }
      push(e.el, 50, false, e.el);
    }
    for (const [, e] of this.peakLabels) {
      if (e.el.classList.contains('is-hidden')) { clear(e.caption); continue; }
      push(e.caption, 60, false, e.el);
    }
    for (const [, e] of this.forestLabels) {
      if (e.el.classList.contains('is-hidden')) { clear(e.caption); continue; }
      push(e.caption, 65, false, e.el);
    }
    if (cands.length === 0) return;
    // One read pass after the one write pass above, so the browser lays out once.
    const boxes = cands.map((cand) => cand.el.getBoundingClientRect());

    // Symbols and page chrome are reserved first: a name gives way to them, never
    // the reverse. A marker's own symbol does not block its own label.
    const blockers: Blocker[] = [];
    for (const [, e] of this.unitMarkers) pushBox(blockers, e.icon, e.el, true);
    for (const [, e] of this.fortMarkers) pushBox(blockers, e.art, e.el, true);
    if (!this.avoidEls || this.avoidEls.length === 0) {
      this.avoidEls = Array.from(document.querySelectorAll(this.avoidSelector));
    }
    for (const el of this.avoidEls) pushBox(blockers, el, null, false);

    const view = this.map.getContainer().getBoundingClientRect();
    const order = cands.map((_, i) => i).sort((a, b) => cands[a].pri - cands[b].pri || boxes[a].top - boxes[b].top);
    const pad = 2;
    const hits = (r: DOMRect, k: Box) => r.left < k.right + pad && r.right + pad > k.left && r.top < k.bottom + pad && r.bottom + pad > k.top;
    for (const i of order) {
      const r = boxes[i];
      if (r.width === 0 || r.height === 0) continue;
      // A label whose text runs off the map reads as a fragment; drop it whole.
      const outside = r.left < view.left + 2 || r.right > view.right - 2 || r.top < view.top + 2 || r.bottom > view.bottom - 2;
      // A symbol only displaces a place name, the cheapest label on the map;
      // a unit's own name is worth more than the star it happens to cross.
      const minor = cands[i].pri >= 40;
      const clash = outside || blockers.some((b) => b.owner !== cands[i].owner && (minor || !b.symbol) && hits(r, b.box));
      if (clash) {
        if (!cands[i].el.classList.contains('is-crowded')) cands[i].el.classList.add('is-crowded');
      } else {
        blockers.push({ box: r, owner: cands[i].owner, symbol: false });
      }
    }
  }
  private declutterQueued = false;

  /* ---------------------------------------------------------------- misc */
  setLanguage(lang: string): void {
    this.language = lang;
    this.numberFormat = new Intl.NumberFormat(lang);
    if (this.campaign) {
      this.buildStatic();
      const defaultLang = this.campaign.defaultLanguage;
      for (const [id, entry] of this.fortMarkers) {
        const ne = this.entities.get(id);
        if (ne) entry.label.textContent = pickText(ne.raw.name, lang, defaultLang);
      }
    }
  }
  private setSource(id: string, data: FeatureCollection): void {
    const src = this.map.getSource(id) as GeoJSONSource | undefined;
    if (src) src.setData(data);
  }
  /** The campaign's own markers. The basemap's pictorial ones don't depend on it and stay. */
  private clearCampaignMarkers(): void {
    for (const map of [this.unitMarkers, this.fortMarkers, this.placeLabels, this.eventLabels]) {
      for (const entry of map.values()) entry.marker.remove();
      map.clear();
    }
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }
  destroy(): void {
    this.ready = false;
    this.clearCampaignMarkers();
    for (const map of [this.peakLabels, this.basemapPlaceLabels, this.forestLabels, this.embellishmentMarkers]) {
      for (const entry of map.values()) entry.marker.remove();
      map.clear();
    }
    this.basemapPopup?.remove();
    this.basemapPopup = null;
    this.map.off('zoom', this.onZoom);
    this.map.off('move', this.onMove);
    this.map.off('style.load', this.installHandler);
    this.map.off('idle', this.installHandler);
  }
}

/** Uncertainty halo as a real circle on the ground, so it scales with the map. */
function circleRing([lng, lat]: [number, number], radiusMeters: number, steps = 48): Position[] {
  const ring: Position[] = [];
  const dLat = (radiusMeters / 111320) ;
  const dLng = radiusMeters / (111320 * Math.cos((lat * Math.PI) / 180) || 1);
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ring.push([lng + Math.cos(a) * dLng, lat + Math.sin(a) * dLat]);
  }
  return ring;
}
const starPoints = (r: number): string =>
  Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.52 : r;
    return `${(Math.cos(a) * rr).toFixed(2)},${(Math.sin(a) * rr).toFixed(2)}`;
  }).join(' ');
