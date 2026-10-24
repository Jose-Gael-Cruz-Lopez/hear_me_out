import type { AiJob } from '@hmo/bindings';
import { handlers } from './jobs/handlers';
import type { Deps } from './jobs/deps';
import { log } from './log';

const JOB_TIMEOUT_MS = 120_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      v => {
        clearTimeout(t);
        resolve(v);
      },
      e => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

/**
 * Claim queued jobs from the admin_jobs view, run them, and report results through reducers.
 * claim_job is atomic in the database, so several orchestrators can run side by side safely.
 */
export function startRunner(d: Deps): { stop(): void; inFlight(): number } {
  const running = new Set<string>();

  async function run(job: AiJob): Promise<void> {
    const key = job.id.toString();
    if (running.has(key) || running.size >= d.cfg.concurrency) return;
    running.add(key);
    try {
      await d.conn.reducers.claimJob({ jobId: job.id });
    } catch {
      running.delete(key); // another worker got it first
      return;
    }
    const started = Date.now();
    try {
      const handler = handlers[job.kind];
      if (!handler) throw new Error(`no handler for job kind ${job.kind}`);
      await withTimeout(handler(job, d), JOB_TIMEOUT_MS, job.kind);
      log.info('job done', { kind: job.kind, id: job.id, ms: Date.now() - started });
    } catch (err) {
      log.warn('job failed, the module applies its fallback', { kind: job.kind, id: job.id, err: String(err).slice(0, 200) });
      await d.conn.reducers.failJob({ jobId: job.id, error: String(err).slice(0, 400) }).catch(e => log.error('fail_job failed', { err: String(e) }));
    } finally {
      running.delete(key);
      setImmediate(scan);
    }
  }

  function scan(): void {
    for (const job of d.conn.db.adminJobs.iter()) if (job.status === 'queued') void run(job);
  }

  d.conn.db.adminJobs.onInsert((_ctx, job) => {
    if (job.status === 'queued') void run(job);
  });
  d.conn.db.adminJobs.onUpdate((_ctx, _old, job) => {
    if (job.status === 'queued') void run(job);
  });
  const timer = setInterval(scan, 2000);
  scan();
  return {
    stop: () => clearInterval(timer),
    inFlight: () => running.size,
  };
}
