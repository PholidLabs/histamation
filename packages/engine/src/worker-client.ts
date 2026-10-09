/** Main-thread client for the worker protocol (contract §7.1, §7.3). Use when a campaign is big enough to matter. */
import type { CampaignFile, FrameState, Ticks } from './types.js';
import type { WorkerRequest, WorkerResponse } from './worker.js';

type Bbox = [number, number, number, number];
type RequestBody = WorkerRequest extends infer R ? (R extends WorkerRequest ? Omit<R, 'id'> : never) : never;
type Loaded = Extract<WorkerResponse, { type: 'loaded' }>;
interface Settle<T> { resolve: (value: T) => void; reject: (reason: Error) => void }
interface QueuedQuery extends Settle<FrameState | null> { t: Ticks; bbox: Bbox | null; includeTrail: boolean }

/**
 * One worker answers requests in order. Queries are coalesced (contract §7.3): at most one is
 * in flight, a query asked for meanwhile waits, and a newer one replaces it — the replaced
 * promise resolves to `null` without ever reaching the worker. Fast scrubbing therefore never
 * builds a backlog, and every frame delivered is the newest the worker could have answered.
 */
export class HistamationWorkerClient {
  private seq = 0;
  private pending = new Map<number, Settle<WorkerResponse>>();
  private queryInFlight = false;
  private queued: QueuedQuery | null = null;
  private disposed = false;

  constructor(private worker: Worker) {
    worker.addEventListener('message', this.onMessage);
    worker.addEventListener('error', this.onError);
  }

  /** Errors reject the file (contract §7.1): `ok` is false and the worker keeps no campaign. */
  async load(campaign: CampaignFile): Promise<Omit<Loaded, 'type' | 'id'>> {
    const { ok, diagnostics, summary } = (await this.send({ type: 'load', campaign })) as Loaded;
    return { ok, diagnostics, summary };
  }

  /** The frame at tick `t`, or `null` if a newer query replaced this one before it was sent. */
  query(t: Ticks, opts: { bbox?: Bbox | null; includeTrail?: boolean } = {}): Promise<FrameState | null> {
    return new Promise((resolve, reject) => {
      this.queued?.resolve(null);
      this.queued = { t, bbox: opts.bbox ?? null, includeTrail: opts.includeTrail ?? false, resolve, reject };
      this.pump();
    });
  }

  /** Terminates the worker; everything still outstanding rejects. */
  dispose(): void {
    this.disposed = true;
    this.worker.removeEventListener('message', this.onMessage);
    this.worker.removeEventListener('error', this.onError);
    this.worker.terminate();
    this.failAll(new Error('HistamationWorkerClient disposed'));
  }

  private pump(): void {
    if (this.queryInFlight || !this.queued) return;
    const { t, bbox, includeTrail, resolve, reject } = this.queued;
    this.queued = null;
    this.queryInFlight = true;
    this.send({ type: 'query', t, bbox, includeTrail }).then(
      (res) => { this.queryInFlight = false; resolve((res as Extract<WorkerResponse, { type: 'frame' }>).frame); this.pump(); },
      (err: Error) => { this.queryInFlight = false; reject(err); this.pump(); },
    );
  }

  private send(body: RequestBody): Promise<WorkerResponse> {
    if (this.disposed) return Promise.reject(new Error('HistamationWorkerClient disposed'));
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...body, id } as WorkerRequest);
    });
  }

  private onMessage = (ev: MessageEvent<WorkerResponse>): void => {
    const res = ev.data;
    const settle = this.pending.get(res.id);
    if (!settle) return;
    this.pending.delete(res.id);
    if (res.type === 'error') settle.reject(new Error(res.message));
    else settle.resolve(res);
  };

  /** An error outside any request (e.g. the script failed to load): nothing outstanding will be answered. */
  private onError = (ev: ErrorEvent): void => {
    this.failAll(new Error(ev.message || 'worker error'));
  };

  private failAll(err: Error): void {
    for (const settle of this.pending.values()) settle.reject(err);
    this.pending.clear();
    this.queued?.reject(err);
    this.queued = null;
  }
}
