import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AiJob } from '@hmo/bindings';
import type { Deps } from './jobs/deps';
import { startRunner } from './runner';
import { handlers } from './jobs/handlers';
vi.mock('./jobs/handlers', () => ({ handlers: { scout: vi.fn() }, SkipJob: class extends Error {} }));
afterEach(() => vi.restoreAllMocks());

it('finishes claimed work but never accepts new subscription work after stopping', async () => {
  let inserted: (_ctx: unknown, job: AiJob) => void = () => {};
  let updated: (_ctx: unknown, before: AiJob, after: AiJob) => void = () => {};
  let finish!: () => void;
  const work = new Promise<void>(resolve => { finish = resolve; });
  vi.mocked(handlers.scout).mockReturnValue(work);
  const claimJob = vi.fn().mockResolvedValue(undefined);
  const d = { cfg: { concurrency: 6 }, conn: { reducers: { claimJob }, db: { adminJobs: {
    iter: () => [], onInsert: (cb: typeof inserted) => { inserted = cb; }, onUpdate: (cb: typeof updated) => { updated = cb; },
  } } } } as unknown as Deps;
  const runner = startRunner(d);
  const job = { id: 1n, status: 'queued', kind: 'scout' } as AiJob;
  inserted(null, job);
  await Promise.resolve();
  expect(runner.inFlight()).toBe(1);
  runner.stop();
  inserted(null, { ...job, id: 2n });
  updated(null, job, { ...job, id: 3n });
  expect(claimJob).toHaveBeenCalledTimes(1);
  finish();
  await new Promise(resolve => setImmediate(resolve));
  expect(runner.inFlight()).toBe(0);
  expect(handlers.scout).toHaveBeenCalledTimes(1);
});
