/**
 * Histamation campaign contract v1 — TypeScript shapes. See docs/DATA-CONTRACT.md.
 * The file-shape interfaces (Faction … CampaignFile) mirror schema/campaign.schema.json one to one.
 */

/** Seconds since 1970-01-01T00:00:00 in the proleptic Gregorian calendar, no time zone; negative before 1970. Integral. */
export type Ticks = number;
export type LocalizedText = string | Record<string, string>;
export type Coord = [number, number] | [number, number, number];
export type Location = string | Coord;
export type Certainty = 'exact' | 'approximate' | 'conjectural';
export type Quantity = number | { min: number; max: number; note?: LocalizedText };

export interface Faction {
  id: string; name: LocalizedText; shortName?: LocalizedText; color: string;
  description?: LocalizedText; sources?: string[]; notes?: LocalizedText;
}
export interface Part { id: string; title: LocalizedText; description?: LocalizedText }
export interface Place {
  id: string; name: LocalizedText; modernName?: LocalizedText; kind?: string;
  coordinates: Coord; certainty: Certainty; radiusMeters?: number; rank?: number;
  description?: LocalizedText; sources?: string[]; media?: string[]; notes?: LocalizedText;
}
export interface StateEntry {
  when: string; status?: string; faction?: string; strength?: Quantity;
  label?: LocalizedText; sources?: string[]; notes?: LocalizedText;
}
export interface Waypoint {
  when: string; at: Location; via?: Coord[]; mode?: 'land' | 'river' | 'sea';
  strength?: Quantity; certainty?: Certainty; label?: LocalizedText; sources?: string[]; notes?: LocalizedText;
}
export interface Style {
  color?: string; width?: number; dash?: number[]; icon?: string; opacity?: number;
  trail?: 'full' | 'leg' | 'none'; widthBy?: 'strength';
}
export interface PolygonGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: Coord[][] | Coord[][][];
}
export interface Entity {
  id: string; kind: string; name: LocalizedText; faction: string; when?: string;
  description?: LocalizedText; commanders?: LocalizedText[];
  at?: Location; track?: Waypoint[]; geometry?: PolygonGeometry; path?: Location[];
  states?: StateEntry[]; certainty?: Certainty; style?: Style;
  sources?: string[]; media?: string[]; notes?: LocalizedText; tags?: string[];
}
export interface Participant {
  faction: string; role?: string; commanders?: LocalizedText[]; strength?: Quantity; losses?: Quantity;
}
export interface CampaignEvent {
  id: string; kind: string; name: LocalizedText; when: string; at?: Location; certainty?: Certainty;
  participants?: Participant[]; outcome?: { victor?: string; summary?: LocalizedText };
  summary?: LocalizedText; importance?: number; sources?: string[]; media?: string[];
  notes?: LocalizedText; tags?: string[];
}
export interface Camera {
  center: Coord; zoom: number; pitch?: number; bearing?: number;
  durationMs?: number; transition?: 'fly' | 'ease' | 'jump';
}
export interface Chapter {
  id: string; part?: string; title: LocalizedText; when: string; dateLabel?: LocalizedText;
  body: LocalizedText; camera?: Camera; focus?: string[]; media?: string[]; sources?: string[]; notes?: LocalizedText;
}
export interface Source { id: string; type: string; citation: string; url?: string; accessed?: string; notes?: LocalizedText }
export interface Media {
  id: string; type: 'image'; url: string; thumbnailUrl?: string; alt: LocalizedText; caption?: LocalizedText;
  creator?: string; date?: string; license: string; holder?: string; sourceUrl?: string; notes?: LocalizedText;
}
export interface CampaignMeta {
  id: string; version?: string; title: LocalizedText; subtitle?: LocalizedText; description: LocalizedText;
  contentWarning?: LocalizedText; languages: string[]; defaultLanguage: string; license?: string;
  authors?: { name: string; url?: string }[]; updated?: string;
  timeline: { extent: string; focus?: string };
  map: {
    center: Coord; zoom: number; pitch?: number; bearing?: number;
    bounds?: [number, number, number, number]; terrain?: { exaggeration?: number }; theme?: string;
  };
}
export interface CampaignFile {
  histamation: string; meta: CampaignMeta; factions: Faction[]; parts?: Part[]; places?: Place[];
  entities?: Entity[]; events?: CampaignEvent[]; chapters: Chapter[]; sources?: Source[]; media?: Media[];
  [key: string]: unknown; // x- extensions
}

/* ---- diagnostics ---- */
/** `error` rejects the file; `warning` and `info` never do. */
export type DiagnosticLevel = 'error' | 'warning' | 'info';
/** One loader finding. `code` is stable across engines (contract §8); `path` is a JSON Pointer into the file. */
export interface Diagnostic { level: DiagnosticLevel; code: string; path: string; message: string }

/* ---- normalized model (what the engine works on) ---- */
/** Half-open tick interval `[start, end)`. */
export interface Span { start: Ticks; end: Ticks }
/** A place with its coordinate resolved; `radiusMeters` is the drawn uncertainty (explicit, or the certainty default). */
export interface NormPlace { id: string; coord: [number, number]; certainty: Certainty; radiusMeters: number; raw: Place }
/** One `states` entry. `end` is null for a point `when`: the state holds until a later one starts. `index` is its position in the file. */
export interface NormState { index: number; start: Ticks; end: Ticks | null; status: string | null; faction: string | null; strength: number | null }
/**
 * One usable track waypoint. The unit stays put over `[arrive, depart)`; `end` is the end of the `when`, which
 * differs from `depart` only for a point `when` (then `depart === arrive`). `leg` is the path from the previous
 * waypoint, via points included, and `legLength` its haversine length in metres; both are absent on the first.
 * `certainty` falls back to the place's, then the entity's. `index` is the position in the file's `track`.
 */
export interface NormWaypoint {
  index: number; arrive: Ticks; depart: Ticks; end: Ticks; coord: [number, number];
  mode: 'land' | 'river' | 'sea'; certainty: Certainty | null; strength: number | null;
  leg?: [number, number][]; legLength?: number;
}
/**
 * An entity over its existence interval `[start, end)`. Its geometry field follows the kind: `track` (unit),
 * `coord` (fortification), `polygons` (territory) or `path` (route); a custom `x-` kind uses whichever it declared.
 * `faction` is the default owner; `states` can override it over time.
 */
export interface NormEntity {
  id: string; kind: string; faction: string; certainty: Certainty | null; style: Style;
  start: Ticks; end: Ticks; states: NormState[];
  track?: NormWaypoint[]; coord?: [number, number] | null; polygons?: Coord[][][]; path?: [number, number][];
  raw: Entity;
}
/** An event over `[start, end)`. `coord` is null for timeline-only events (I201). `importance` defaults to 3. */
export interface NormEvent {
  id: string; kind: string; start: Ticks; end: Ticks; coord: [number, number] | null;
  certainty: Certainty | null; importance: number; raw: CampaignEvent;
}
/** A chapter's window `[start, end)`; scroll progress maps into it with `chapterTime`. `index` is its position in the file. */
export interface NormChapter {
  id: string; index: number; start: Ticks; end: Ticks; camera: Camera | null; focus: string[]; raw: Chapter;
}
/**
 * A validated campaign, as returned by `loadCampaign`. Immutable: the resolver caches per-track data keyed by
 * these arrays, so build a new campaign instead of editing one. `focus` is `meta.timeline.focus`, or the extent.
 * `chapters` is never empty.
 */
export interface NormalizedCampaign {
  raw: CampaignFile; meta: CampaignMeta; extent: Span; focus: Span;
  languages: string[]; defaultLanguage: string;
  factions: Map<string, Faction>; places: Map<string, NormPlace>;
  entities: NormEntity[]; events: NormEvent[]; chapters: NormChapter[];
}

/* ---- frame ---- */
/**
 * An entity that exists at the frame's tick. `faction` and `status` come from the state in force; so does
 * `strength`, which for units otherwise interpolates along the track. Units carry the pose fields: `moving` is
 * true between waypoints, where `leg` is the arriving waypoint's index and `legProgress` the time fraction of the
 * leg (0..1); at rest, `waypoint` is the waypoint's index. `bearing` is degrees clockwise from north. `trail` is
 * the path walked so far when trails are requested, otherwise `trailLength` gives its vertex count.
 * Point entities carry `position` and `strength`; territories and routes carry no geometry (look it up by id).
 */
export interface FrameEntity {
  id: string; kind: string; faction: string; status: string;
  position?: [number, number]; bearing?: number | null; moving?: boolean;
  waypoint?: number | null; leg?: number | null; legProgress?: number | null;
  strength?: number | null; certainty?: Certainty | null;
  trail?: [number, number][]; trailLength?: number;
}
/**
 * An event that has started by the frame's tick; upcoming events are omitted. While `active`, `progress` runs
 * 0..1 through the event; once `past`, `progress` is 1 and `sinceEnd` counts ticks since it ended.
 */
export interface FrameEvent {
  id: string; kind: string; phase: 'active' | 'past'; progress: number; sinceEnd: number;
  position: [number, number] | null; importance: number;
}
/** Everything on the map at tick `t`. `iso` is `t` as an ISO-like string (expanded years outside 0000–9999). */
export interface FrameState { t: Ticks; iso: string; entities: FrameEntity[]; events: FrameEvent[] }
/** `campaign` is null when any diagnostic is an error. */
export interface LoadResult { campaign: NormalizedCampaign | null; diagnostics: Diagnostic[] }
