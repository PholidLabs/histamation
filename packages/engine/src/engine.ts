/**
 * Engine façade (contract §7.3). Same-thread by default: resolveFrame costs microseconds
 * for campaign-sized data, so the worker/WASM path is opt-in (see worker.ts) rather than assumed.
 */
import { loadCampaign } from './campaign.js';
import { chapterTime, resolveFrame } from './resolve.js';
import type { CampaignFile, Diagnostic, FrameState, LoadResult, NormChapter, NormalizedCampaign, Ticks } from './types.js';

export interface EngineEvents {
  frame: FrameState;
  chapter: { id: string; index: number; previous?: string };
  diagnostics: Diagnostic[];
}
type Handler<K extends keyof EngineEvents> = (payload: EngineEvents[K]) => void;

export interface EngineOptions { language?: string; includeTrail?: boolean }

export class ChronoMapEngine {
  campaign: NormalizedCampaign | null = null;
  diagnostics: Diagnostic[] = [];
  language: string;
  private includeTrail: boolean;
  private handlers: { [K in keyof EngineEvents]: Set<Handler<K>> } = { frame: new Set(), chapter: new Set(), diagnostics: new Set() };
  private t: Ticks = 0;
  private activeChapter: NormChapter | null = null;
  private lastFrame: FrameState | null = null;

  constructor(opts: EngineOptions = {}) {
    this.language = opts.language ?? 'en';
    this.includeTrail = opts.includeTrail ?? false;
  }

  /** Load a campaign object, or fetch one from a URL. Errors reject the file and keep the previous one. */
  async load(source: CampaignFile | string | URL): Promise<LoadResult> {
    let raw: CampaignFile;
    if (typeof source === 'string' || source instanceof URL) {
      const res = await fetch(String(source));
      if (!res.ok) throw new Error(`Cannot fetch campaign: ${res.status} ${res.statusText}`);
      raw = (await res.json()) as CampaignFile;
    } else raw = source;
    const result = loadCampaign(raw);
    this.diagnostics = result.diagnostics;
    this.emit('diagnostics', result.diagnostics);
    if (result.campaign) {
      this.campaign = result.campaign;
      if (!this.campaign.languages.includes(this.language)) this.language = this.campaign.defaultLanguage;
      this.activeChapter = null;
      this.setTime(this.campaign.chapters[0].start);
    }
    return result;
  }

  get time(): Ticks { return this.t; }
  get frame(): FrameState | null { return this.lastFrame; }

  /** Throws a RangeError for a non-finite tick and keeps the current time and frame. */
  setTime(t: Ticks): void {
    if (!this.campaign) return;
    const tick = Math.round(t);
    this.lastFrame = resolveFrame(this.campaign, tick, { includeTrail: this.includeTrail });
    this.t = tick;
    this.emit('frame', this.lastFrame);
  }

  /** Story mode: scroll progress p (0..1) inside a chapter drives the clock. */
  setStoryProgress(chapterId: string, p: number): void {
    const ch = this.campaign?.chapters.find((c) => c.id === chapterId);
    if (!ch) return;
    if (this.activeChapter?.id !== ch.id) {
      const previous = this.activeChapter?.id;
      this.activeChapter = ch;
      this.emit('chapter', { id: ch.id, index: ch.index, previous });
    }
    this.setTime(chapterTime(ch, p));
  }

  setLanguage(lang: string): void {
    if (this.campaign && !this.campaign.languages.includes(lang)) return;
    this.language = lang;
  }

  on<K extends keyof EngineEvents>(event: K, handler: Handler<K>): () => void {
    this.handlers[event].add(handler as never);
    return () => { this.handlers[event].delete(handler as never); };
  }
  private emit<K extends keyof EngineEvents>(event: K, payload: EngineEvents[K]): void {
    for (const h of this.handlers[event]) (h as Handler<K>)(payload);
  }
  dispose(): void { for (const set of Object.values(this.handlers)) (set as Set<unknown>).clear(); }
}

export const createEngine = (opts?: EngineOptions): ChronoMapEngine => new ChronoMapEngine(opts);
