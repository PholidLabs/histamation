/** Chapter cameras → MapLibre. flyTo/easeTo/jumpTo is all the contract needs (no free-camera API). */
import type { LngLatBoundsLike, Map as MapLibreMap } from 'maplibre-gl';
import type { Camera, NormChapter, NormalizedCampaign, FrameState } from '@pholidlabs/chronomap-engine';

export interface CameraOptions { reduceMotion?: boolean; padding?: number }

export class CameraController {
  constructor(private map: MapLibreMap, private opts: CameraOptions = {}) {}

  get reduceMotion(): boolean {
    return this.opts.reduceMotion ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  apply(camera: Camera): void {
    const target = {
      center: [camera.center[0], camera.center[1]] as [number, number],
      zoom: camera.zoom,
      pitch: camera.pitch ?? 0,
      bearing: camera.bearing ?? 0,
    };
    const duration = camera.durationMs ?? 2200;
    if (this.reduceMotion || camera.transition === 'jump' || duration <= 0) { this.map.jumpTo(target); return; }
    if (camera.transition === 'ease') this.map.easeTo({ ...target, duration });
    else this.map.flyTo({ ...target, duration, essential: true, curve: 1.42 });
  }

  /** No camera on the chapter: frame whatever it focuses on (contract §6.2). */
  fitFocus(campaign: NormalizedCampaign, chapter: NormChapter, frame: FrameState | null): void {
    const coords: [number, number][] = [];
    for (const id of chapter.focus) {
      const place = campaign.places.get(id);
      if (place) { coords.push(place.coord); continue; }
      const event = campaign.events.find((e) => e.id === id);
      if (event?.coord) { coords.push(event.coord); continue; }
      const entity = campaign.entities.find((e) => e.id === id);
      if (!entity) continue;
      if (entity.coord) coords.push(entity.coord);
      if (entity.track) {
        const live = frame?.entities.find((e) => e.id === id);
        if (live?.position) coords.push(live.position);
        else coords.push(...entity.track.map((w) => w.coord));
      }
    }
    if (!coords.length) return;
    let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [lng, lat] of coords) { w = Math.min(w, lng); e = Math.max(e, lng); s = Math.min(s, lat); n = Math.max(n, lat); }
    const bounds: LngLatBoundsLike = [[w, s], [e, n]];
    const padding = this.opts.padding ?? 90;
    if (w === e && s === n) {
      this.map.flyTo({ center: [w, s], zoom: Math.max(this.map.getZoom(), 11), duration: this.reduceMotion ? 0 : 1800 });
      return;
    }
    this.map.fitBounds(bounds, { padding, duration: this.reduceMotion ? 0 : 1800, maxZoom: 13, pitch: this.map.getPitch() });
  }
}
