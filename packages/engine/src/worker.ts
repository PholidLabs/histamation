/**
 * Worker entry point (contract §7.1). The Rust/WASM core replaces the body of `load`/`query`
 * without changing this protocol: static payload once at load, small frames per query.
 */
import { loadCampaign } from './campaign.js';
import { resolveFrame } from './resolve.js';
import type { CampaignFile, Diagnostic, FrameState, NormalizedCampaign, Ticks } from './types.js';

export type WorkerRequest =
  | { type: 'load'; id: number; campaign: CampaignFile }
  | { type: 'query'; id: number; t: Ticks; bbox?: [number, number, number, number] | null; includeTrail?: boolean };
export type WorkerResponse =
  | { type: 'loaded'; id: number; ok: boolean; diagnostics: Diagnostic[]; summary?: { chapters: number; entities: number; events: number; places: number } }
  | { type: 'frame'; id: number; frame: FrameState }
  | { type: 'error'; id: number; message: string };

let campaign: NormalizedCampaign | null = null;

/** Throws on a bad request, as the Rust core does; the message listener below turns that into an `error` reply. */
export function handleRequest(msg: WorkerRequest): Exclude<WorkerResponse, { type: 'error' }> {
  if (msg.type === 'load') {
    const { campaign: c, diagnostics } = loadCampaign(msg.campaign);
    campaign = c;
    return {
      type: 'loaded', id: msg.id, ok: !!c, diagnostics,
      summary: c ? { chapters: c.chapters.length, entities: c.entities.length, events: c.events.length, places: c.places.size } : undefined,
    };
  }
  if (!campaign) throw new Error('query before load');
  // Ticks are integral by contract; round like the Rust core does at its boundary. Non-finite t throws.
  return { type: 'frame', id: msg.id, frame: resolveFrame(campaign, Math.round(msg.t), { bbox: msg.bbox ?? null, includeTrail: msg.includeTrail ?? false }) };
}

// Runs only inside a real worker; importing this module elsewhere is harmless.
if (typeof self !== 'undefined' && typeof (self as unknown as { postMessage?: unknown }).postMessage === 'function' && typeof document === 'undefined') {
  self.addEventListener('message', (ev: MessageEvent<WorkerRequest>) => {
    let reply: WorkerResponse;
    try {
      reply = handleRequest(ev.data);
    } catch (e) {
      reply = { type: 'error', id: ev.data.id, message: String((e as Error).message) };
    }
    (self as unknown as Worker).postMessage(reply);
  });
}
