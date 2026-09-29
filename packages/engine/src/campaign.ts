/**
 * Semantic validation + normalization (contract §8).
 * Codes and JSON Pointer paths here are normative: the Rust core must emit the same ones.
 * Structural validation (JSON Schema) happens in authoring tools and CI, not at runtime.
 */
import { parseWhen, resolveWhen, WhenError } from './time.js';
import type {
  CampaignFile, Diagnostic, LoadResult, LocalizedText, NormEntity, NormEvent, NormChapter,
  NormPlace, NormState, NormWaypoint, NormalizedCampaign, Quantity, Span, Certainty, Coord, Faction,
} from './types.js';

export const CONTRACT_MAJOR = 1;
export const DEFAULT_RADIUS: Record<Certainty, number> = { exact: 100, approximate: 3000, conjectural: 15000 };
const LANG_RE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const TEXT_KEYS = new Set(['name', 'shortName', 'title', 'subtitle', 'description', 'contentWarning', 'modernName', 'summary', 'notes', 'label', 'dateLabel', 'body', 'caption', 'alt', 'note']);
const COLLECTIONS = ['factions', 'parts', 'places', 'entities', 'events', 'chapters', 'sources', 'media'] as const;
const TYPE_OF_COLLECTION: Record<string, string> = {
  factions: 'faction', parts: 'part', places: 'place', entities: 'entity',
  events: 'event', chapters: 'chapter', sources: 'source', media: 'media',
};
const ptr = (...segs: (string | number)[]): string =>
  '/' + segs.map((s) => String(s).replace(/~/g, '~0').replace(/\//g, '~1')).join('/');

export function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371008.8, toRad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toRad, dLng = (b[0] - a[0]) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * toRad) * Math.cos(b[1] * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
export const quantityValue = (q: Quantity | undefined | null): number | null =>
  q == null ? null : typeof q === 'number' ? q : (q.min + q.max) / 2;

export function loadCampaign(raw: CampaignFile): LoadResult {
  const diags: Diagnostic[] = [];
  const err = (code: string, path: string, message: string) => diags.push({ level: 'error', code, path, message });
  const warn = (code: string, path: string, message: string) => diags.push({ level: 'warning', code, path, message });
  const info = (code: string, path: string, message: string) => diags.push({ level: 'info', code, path, message });

  if (!raw || typeof raw !== 'object') {
    err('E000', '', 'Campaign must be a JSON object');
    return { campaign: null, diagnostics: diags };
  }

  const major = Number(String(raw.chronomap ?? '').split('.')[0]);
  if (major !== CONTRACT_MAJOR) err('E013', '/chronomap', `Unsupported contract version "${raw.chronomap}" (this engine reads ${CONTRACT_MAJOR}.x)`);

  const meta = raw.meta ?? ({} as CampaignFile['meta']);
  const languages = meta.languages ?? [];
  const defaultLanguage = meta.defaultLanguage;
  if (defaultLanguage && !languages.includes(defaultLanguage)) err('E014', '/meta/defaultLanguage', `defaultLanguage "${defaultLanguage}" is not listed in meta.languages`);

  /* ids share one namespace */
  const byId = new Map<string, { type: string; obj: any; path: string }>();
  for (const coll of COLLECTIONS) {
    const list = (raw as any)[coll] as any[] | undefined;
    (list ?? []).forEach((obj, i) => {
      if (!obj?.id) return;
      const path = ptr(coll, i);
      if (byId.has(obj.id)) err('E001', ptr(coll, i, 'id'), `Duplicate id "${obj.id}" (first defined at ${byId.get(obj.id)!.path})`);
      else byId.set(obj.id, { type: TYPE_OF_COLLECTION[coll], obj, path });
    });
  }
  const used = new Set<string>();
  const ref = (id: string, expected: string | string[] | null, path: string) => {
    const hit = byId.get(id);
    const want = expected == null ? [] : ([] as string[]).concat(expected);
    if (!hit) { err('E002', path, `Unknown id "${id}"${want.length ? ` (expected a ${want.join(' or ')})` : ''}`); return null; }
    if (want.length && !want.includes(hit.type)) { err('E003', path, `"${id}" is a ${hit.type}, expected a ${want.join(' or ')}`); return null; }
    used.add(id);
    return hit;
  };

  /* localized text */
  const checkText = (t: LocalizedText, path: string) => {
    if (typeof t === 'string') return;
    if (!t || typeof t !== 'object') return;
    const keys = Object.keys(t);
    if (defaultLanguage && !keys.includes(defaultLanguage)) err('E008', path, `Localized text is missing the default language "${defaultLanguage}"`);
    for (const k of keys) if (!languages.includes(k)) err('E009', `${path}/${k}`, `Language "${k}" is not declared in meta.languages`);
    const missing = languages.filter((l) => !keys.includes(l));
    if (missing.length) warn('W101', path, `Missing translation: ${missing.join(', ')}`);
  };
  const walkText = (node: unknown, path: string): void => {
    if (Array.isArray(node)) { node.forEach((v, i) => walkText(v, `${path}/${i}`)); return; }
    if (!node || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const p = `${path}/${k.replace(/~/g, '~0').replace(/\//g, '~1')}`;
      if (k === 'commanders' && Array.isArray(v)) { v.forEach((t, i) => checkText(t as LocalizedText, `${p}/${i}`)); continue; }
      const isText = TEXT_KEYS.has(k);
      if (isText && (typeof v === 'string' || (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).every((kk) => LANG_RE.test(kk))))) {
        checkText(v as LocalizedText, p); continue;
      }
      walkText(v, p);
    }
  };
  walkText(raw, '');

  /* timeline */
  const safeWhen = (text: string, path: string) => {
    try { return parseWhen(text); } catch (e) {
      if (e instanceof WhenError) { err('E004', path, e.message); return null; }
      throw e;
    }
  };
  let extent: Span | null = null;
  const extentW = meta.timeline?.extent ? safeWhen(meta.timeline.extent, '/meta/timeline/extent') : null;
  if (extentW) {
    if (extentW.start === null || extentW.end === null) err('E004', '/meta/timeline/extent', 'timeline.extent must not have open ends');
    else extent = { start: extentW.start, end: extentW.end };
  }
  if (!extent) {
    err('E004', '/meta/timeline/extent', 'A closed timeline.extent is required');
    return { campaign: null, diagnostics: diags };
  }
  const ext: Span = extent;
  const when = (text: string, path: string) => {
    const w = safeWhen(text, path);
    if (!w) return null;
    const r = resolveWhen(w, ext);
    if (r.start < ext.start || r.end > ext.end) err('E005', path, `"${text}" falls outside timeline.extent "${meta.timeline.extent}"`);
    return r;
  };
  let focus: Span | null = null;
  if (meta.timeline?.focus) {
    const f = when(meta.timeline.focus, '/meta/timeline/focus');
    if (f) focus = { start: f.start, end: f.end };
  }
  if (!focus) focus = { ...ext };

  /* coordinates */
  const bounds = meta.map?.bounds;
  const checkCoord = (c: Coord | undefined, path: string): [number, number] | null => {
    // Number.isFinite does not coerce: "0.5", null and {} are rejected, not read as numbers.
    if (!Array.isArray(c) || c.length < 2 || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) { err('E011', path, 'Coordinate must be [lng, lat]'); return null; }
    const [lng, lat] = c;
    if (Math.abs(lng) > 180 || Math.abs(lat) > 90) { err('E011', path, `Coordinate [${lng}, ${lat}] out of range`); return null; }
    if (bounds) {
      const [w, s, e, n] = bounds;
      if (lng < w || lng > e || lat < s || lat > n) {
        const swapped = lat >= w && lat <= e && lng >= s && lng <= n;
        warn('W102', path, `Coordinate [${lng}, ${lat}] is outside meta.map.bounds${swapped ? ' — it looks like longitude and latitude are swapped' : ''}`);
      }
    }
    return [lng, lat];
  };
  const places = new Map<string, NormPlace>();
  (raw.places ?? []).forEach((p, i) => {
    const coord = checkCoord(p.coordinates, ptr('places', i, 'coordinates'));
    if (coord) places.set(p.id, { id: p.id, coord, certainty: p.certainty, radiusMeters: p.radiusMeters ?? DEFAULT_RADIUS[p.certainty] ?? DEFAULT_RADIUS.approximate, raw: p });
  });
  const location = (loc: any, path: string): [number, number] | null => {
    if (typeof loc === 'string') {
      const hit = ref(loc, 'place', path);
      return hit ? places.get(loc)?.coord ?? null : null;
    }
    return checkCoord(loc, path);
  };
  const refList = (list: string[] | undefined, expected: string | string[], path: string) =>
    (list ?? []).forEach((id, i) => ref(id, expected, `${path}/${i}`));
  const checkUrl = (u: string | undefined, path: string) => {
    if (typeof u !== 'string') return;
    if (/^\s*(javascript|data|vbscript|file):/i.test(u)) err('E015', path, `Unsafe URL scheme in "${u.slice(0, 40)}"`);
  };
  const checkQuantity = (q: Quantity | undefined, path: string) => {
    if (q && typeof q === 'object' && q.min > q.max) err('E012', path, `Quantity min (${q.min}) is greater than max (${q.max})`);
  };

  const factions = new Map<string, Faction>((raw.factions ?? []).map((f) => [f.id, f]));
  (raw.factions ?? []).forEach((f, i) => { refList(f.sources, 'source', ptr('factions', i, 'sources')); used.add(f.id); });
  (raw.sources ?? []).forEach((s, i) => checkUrl(s.url, ptr('sources', i, 'url')));
  (raw.media ?? []).forEach((m, i) => {
    checkUrl(m.url, ptr('media', i, 'url'));
    checkUrl(m.thumbnailUrl, ptr('media', i, 'thumbnailUrl'));
    if (m.date) safeWhen(m.date, ptr('media', i, 'date')); // metadata date: validated, not bound to the timeline
  });
  (raw.places ?? []).forEach((p, i) => { refList(p.sources, 'source', ptr('places', i, 'sources')); refList(p.media, 'media', ptr('places', i, 'media')); });

  /* entities */
  const entities: NormEntity[] = [];
  (raw.entities ?? []).forEach((e, i) => {
    const base = ptr('entities', i);
    ref(e.faction, 'faction', `${base}/faction`);
    refList(e.sources, 'source', `${base}/sources`);
    refList(e.media, 'media', `${base}/media`);
    const ne: Partial<NormEntity> & { states: NormState[] } = {
      id: e.id, kind: e.kind, faction: e.faction, certainty: e.certainty ?? null, style: e.style ?? {}, raw: e, states: [],
    };

    let prevStart = -Infinity;
    (e.states ?? []).forEach((s, j) => {
      const sp = `${base}/states/${j}`;
      const w = when(s.when, `${sp}/when`);
      if (s.faction) ref(s.faction, 'faction', `${sp}/faction`);
      refList(s.sources, 'source', `${sp}/sources`);
      checkQuantity(s.strength, `${sp}/strength`);
      if (!w) return;
      if (w.start < prevStart) err('E007', `${sp}/when`, 'states must be sorted by start time');
      prevStart = w.start;
      ne.states.push({ index: j, start: w.start, end: w.isInterval ? w.end : null, status: s.status ?? null, faction: s.faction ?? null, strength: quantityValue(s.strength) });
    });

    if (e.kind === 'unit') {
      const track: NormWaypoint[] = [];
      (e.track ?? []).forEach((wp, j) => {
        const wpp = `${base}/track/${j}`;
        const w = when(wp.when, `${wpp}/when`);
        const coord = location(wp.at, `${wpp}/at`);
        (wp.via ?? []).forEach((c, k) => checkCoord(c, `${wpp}/via/${k}`));
        refList(wp.sources, 'source', `${wpp}/sources`);
        checkQuantity(wp.strength, `${wpp}/strength`);
        if (!w || !coord) return;
        const node: NormWaypoint = {
          index: j, arrive: w.start, depart: w.isInterval ? w.end : w.start, end: w.end, coord,
          mode: wp.mode ?? 'land',
          certainty: wp.certainty ?? (typeof wp.at === 'string' ? places.get(wp.at)?.certainty ?? null : null) ?? e.certainty ?? null,
          strength: quantityValue(wp.strength),
        };
        const prev = track[track.length - 1];
        if (prev) {
          node.leg = [prev.coord, ...(wp.via ?? []).map((c) => [c[0], c[1]] as [number, number]), coord];
          if (node.arrive < prev.depart) err('E006', `${wpp}/when`, `Waypoint arrives (${wp.when}) before the previous waypoint is left (${e.track![prev.index].when})`);
          const dist = node.leg.slice(1).reduce((d, c, k) => d + haversine(node.leg![k], c), 0);
          if (node.arrive === prev.depart && dist > 1000) warn('W107', `${wpp}/when`, `Zero-duration leg of ${(dist / 1000).toFixed(1)} km: the unit will jump`);
          node.leg.slice(1).forEach((c, k) => { if (Math.abs(c[0] - node.leg![k][0]) > 180) warn('W109', `${wpp}`, 'Leg crosses the antimeridian; split it with via points'); });
          node.legLength = dist;
        }
        track.push(node);
      });
      if (track.length === 0) { err('E006', `${base}/track`, 'Unit has no usable waypoints'); return; }
      ne.track = track;
    } else if (e.kind === 'fortification' || (e.kind?.startsWith('x-') && e.at)) {
      ne.coord = location(e.at, `${base}/at`);
    } else if (e.kind === 'territory' || (e.kind?.startsWith('x-') && e.geometry)) {
      const polys = (e.geometry?.type === 'Polygon' ? [e.geometry.coordinates] : e.geometry?.coordinates ?? []) as Coord[][][];
      polys.forEach((poly, pi) => poly.forEach((ring, ri) => {
        const rp = e.geometry!.type === 'Polygon' ? `${base}/geometry/coordinates/${ri}` : `${base}/geometry/coordinates/${pi}/${ri}`;
        ring.forEach((c, k) => checkCoord(c, `${rp}/${k}`));
        const a = ring[0], b = ring[ring.length - 1];
        if (!a || !b || a[0] !== b[0] || a[1] !== b[1]) err('E010', rp, 'Polygon ring is not closed (first and last positions must be equal)');
      }));
      ne.polygons = polys;
    } else if (e.kind === 'route' || (e.kind?.startsWith('x-') && e.path)) {
      ne.path = (e.path ?? []).map((l, k) => location(l, `${base}/path/${k}`)).filter(Boolean) as [number, number][];
    } else if (e.kind?.startsWith('x-')) {
      err('E016', base, `Custom kind "${e.kind}" needs one of at, track, geometry or path`);
    }

    if (e.when) {
      const w = when(e.when, `${base}/when`);
      if (w) { ne.start = w.start; ne.end = w.end; }
    } else if (ne.track) {
      ne.start = ne.track[0].arrive; ne.end = ne.track[ne.track.length - 1].end;
    } else { ne.start = ext.start; ne.end = ext.end; }
    if (ne.track && e.when && ne.start !== undefined) {
      const t0 = ne.track[0].arrive, t1 = ne.track[ne.track.length - 1].depart;
      if (t0 < ne.start || t1 > (ne.end as number)) warn('W113', `${base}/when`, "Track extends outside the entity's existence interval");
    }
    if (ne.start === undefined) return;
    entities.push(ne as NormEntity);
  });

  /* events */
  const events: NormEvent[] = [];
  (raw.events ?? []).forEach((ev, i) => {
    const base = ptr('events', i);
    const w = when(ev.when, `${base}/when`);
    const coord = ev.at !== undefined ? location(ev.at, `${base}/at`) : null;
    if (ev.at === undefined) info('I201', base, `Event "${ev.id}" has no location; it will appear on the timeline but not on the map`);
    (ev.participants ?? []).forEach((p, j) => {
      ref(p.faction, 'faction', `${base}/participants/${j}/faction`);
      checkQuantity(p.strength, `${base}/participants/${j}/strength`);
      checkQuantity(p.losses, `${base}/participants/${j}/losses`);
    });
    if (ev.outcome?.victor) ref(ev.outcome.victor, 'faction', `${base}/outcome/victor`);
    refList(ev.sources, 'source', `${base}/sources`);
    refList(ev.media, 'media', `${base}/media`);
    if (!ev.sources?.length) warn('W114', base, `Event "${ev.id}" cites no sources`);
    if (w) events.push({
      id: ev.id, kind: ev.kind, start: w.start, end: w.end, coord,
      certainty: ev.certainty ?? (typeof ev.at === 'string' ? places.get(ev.at)?.certainty ?? null : null),
      importance: ev.importance ?? 3, raw: ev,
    });
  });

  /* chapters */
  const chapters: NormChapter[] = [];
  let lastStart = -Infinity;
  (raw.chapters ?? []).forEach((ch, i) => {
    const base = ptr('chapters', i);
    const w = when(ch.when, `${base}/when`);
    if (ch.part) ref(ch.part, 'part', `${base}/part`);
    refList(ch.focus, ['place', 'entity', 'event'], `${base}/focus`);
    refList(ch.media, 'media', `${base}/media`);
    refList(ch.sources, 'source', `${base}/sources`);
    if (ch.camera) checkCoord(ch.camera.center, `${base}/camera/center`);
    if (!ch.camera && !ch.focus?.length) warn('W103', base, `Chapter "${ch.id}" has neither camera nor focus; the camera will not move`);
    const bodyText = typeof ch.body === 'string' ? ch.body : Object.values(ch.body ?? {}).join('\n');
    for (const m of String(bodyText).matchAll(/\]\(([^)\s]+)/g)) checkUrl(m[1], `${base}/body`);
    if (/<\s*[a-z!/]/i.test(bodyText)) err('E017', `${base}/body`, 'Raw HTML is not allowed in chapter bodies');
    if (!w) return;
    if (w.start < lastStart) warn('W104', `${base}/when`, `Chapter "${ch.id}" starts before the previous chapter (flashback?)`);
    lastStart = w.start;
    chapters.push({ id: ch.id, index: i, start: w.start, end: w.end, camera: ch.camera ?? null, focus: ch.focus ?? [], raw: ch });
  });
  // The schema says minItems 1, but runtime validation is the core's job (contract §8): playback starts at chapter 0.
  if (!raw.chapters?.length) err('E018', '/chapters', 'A campaign needs at least one chapter');

  for (let k = 1; k < chapters.length; k++) {
    const prev = chapters[k - 1], cur = chapters[k];
    if (cur.start >= prev.start && prev.end > cur.start) {
      const days = Math.round((prev.end - cur.start) / 86400);
      warn('W115', `/chapters/${cur.index}/when`, `Chapter "${cur.id}" starts ${days} day(s) before "${prev.id}" ends; time jumps backwards when scrolling between them`);
    }
  }

  const evById = new Map(events.map((e) => [e.id, e]));
  const enById = new Map(entities.map((e) => [e.id, e]));
  chapters.forEach((ch) => {
    ch.focus.forEach((id, k) => {
      const ev = evById.get(id), en = enById.get(id);
      const path = `/chapters/${ch.index}/focus/${k}`;
      if (ev && ev.start >= ch.end) warn('W112', path, `Focused event "${id}" has not happened yet during this chapter`);
      if (en && (en.start >= ch.end || en.end <= ch.start)) warn('W112', path, `Focused entity "${id}" does not exist during this chapter`);
    });
  });

  for (const coll of ['sources', 'media', 'places', 'parts'] as const) {
    ((raw as any)[coll] as any[] ?? []).forEach((o, i) => {
      if (o.id && !used.has(o.id)) warn('W105', ptr(coll, i), `${TYPE_OF_COLLECTION[coll]} "${o.id}" is never referenced`);
    });
  }

  const hasErrors = diags.some((d) => d.level === 'error');
  const campaign: NormalizedCampaign | null = hasErrors ? null : {
    raw, meta, extent: ext, focus, languages, defaultLanguage,
    factions, places, entities, events, chapters,
  };
  return { campaign, diagnostics: diags };
}
