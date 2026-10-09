import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HistamationWorkerClient } from '../dist/index.js';

const fixture = JSON.parse(readFileSync(new URL('../../../data/campaigns/fixtures/null-island.json', import.meta.url), 'utf8'));

/** Answers like worker.ts does, asynchronously, from a fresh module so campaign state is per test. */
let instance = 0;
async function fakeWorker() {
  const { handleRequest } = await import(`../dist/worker.js?instance=${++instance}`);
  const worker = new EventTarget();
  worker.queried = [];
  worker.postMessage = (msg) => {
    if (msg.type === 'query') worker.queried.push(msg.t);
    setTimeout(() => {
      let data;
      try { data = handleRequest(msg); } catch (e) { data = { type: 'error', id: msg.id, message: e.message }; }
      worker.dispatchEvent(new MessageEvent('message', { data }));
    }, 0);
  };
  worker.terminate = () => {};
  return worker;
}

test('queries coalesce: a replaced query resolves null and never reaches the worker', async () => {
  const worker = await fakeWorker();
  const client = new HistamationWorkerClient(worker);
  assert.equal((await client.load(fixture)).ok, true);
  const [t1, t2, t3] = [-62477654400, -62477000000, -62476000000];
  const [a, b, c] = await Promise.all([client.query(t1), client.query(t2), client.query(t3)]);
  assert.equal(a.t, t1, 'the query already in flight is still delivered');
  assert.equal(b, null, 'the waiting query was replaced by a newer one');
  assert.equal(c.t, t3, 'the newest query is answered');
  assert.deepEqual(worker.queried, [t1, t3]);
});

test('worker errors reject instead of resolving', async () => {
  const client = new HistamationWorkerClient(await fakeWorker());
  await assert.rejects(client.query(0), /query before load/);
});

test('dispose rejects everything still outstanding', async () => {
  const client = new HistamationWorkerClient(await fakeWorker());
  const loading = client.load(fixture);
  client.dispose();
  await assert.rejects(loading, /disposed/);
  await assert.rejects(client.query(0), /disposed/);
});
