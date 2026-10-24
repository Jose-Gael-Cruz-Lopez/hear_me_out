/**
 * `callActor` backed by `apify-client`: runs a scraper, reads its dataset, then deletes the run's
 * default dataset and key-value store so raw posts do not outlive the run.
 * Used by the actor (with `Actor.apifyClient`), by `local.ts`, and by the orchestrator.
 */
import type { ApifyClient } from 'apify-client';
import type { CallActor, LogFn } from './core.js';

export interface SubRunInfo {
  actorId: string;
  runId: string;
  status: string;
  items: number;
  usageTotalUsd: number | null;
  storageDeleted: boolean;
}

export interface ApifyCallActorOptions {
  /** Delete the called run's default dataset and key-value store after reading. Default true. */
  deleteScrapedData?: boolean;
  /** Sub-run timeout. Default 300 s. */
  timeoutSecs?: number;
  /** Floor for the pay-per-event charge cap. Some scrapers require at least $0.50. */
  minChargeCapUsd?: number;
  log?: LogFn;
  /** Called once per finished sub-run (for cost reporting). */
  onRun?: (info: SubRunInfo) => void;
}

/** Charge cap for pay-per-event scrapers: about 2x the current per-item price, never below the floor. */
export function chargeCapUsd(maxItems: number, floorUsd = 0.5): number {
  return Math.max(floorUsd, Math.ceil(maxItems * 0.01 * 100) / 100 + 0.05);
}

export function createApifyCallActor(client: ApifyClient, opts: ApifyCallActorOptions = {}): CallActor {
  const deleteScrapedData = opts.deleteScrapedData ?? true;
  const timeoutSecs = opts.timeoutSecs ?? 300;
  return async (actorId, input, callOpts) => {
    const maxItems = callOpts?.maxItems;
    const run = await client.actor(actorId).call(input, {
      timeout: timeoutSecs,
      waitSecs: timeoutSecs + 60,
      log: null,
      ...(maxItems ? { maxItems, maxTotalChargeUsd: chargeCapUsd(maxItems, opts.minChargeCapUsd) } : {}),
    });
    let items: unknown[] = [];
    let storageDeleted = false;
    try {
      const page = await client.dataset(run.defaultDatasetId).listItems({ clean: true, ...(maxItems ? { limit: maxItems + 20 } : {}) });
      items = page.items;
      if (run.status !== 'SUCCEEDED') {
        if (items.length === 0) throw new Error(`${actorId} run ${run.id} finished with status ${run.status}`);
        opts.log?.('warn', 'scraper run did not succeed, using partial results', { actorId, runId: run.id, status: run.status, items: items.length });
      }
      return items;
    } finally {
      if (deleteScrapedData) {
        const results = await Promise.allSettled([
          client.dataset(run.defaultDatasetId).delete(),
          client.keyValueStore(run.defaultKeyValueStoreId).delete(),
        ]);
        storageDeleted = results[0].status === 'fulfilled';
        if (!storageDeleted) opts.log?.('warn', 'could not delete scraper dataset', { actorId, runId: run.id });
      }
      opts.onRun?.({
        actorId,
        runId: run.id,
        status: run.status,
        items: items.length,
        usageTotalUsd: typeof run.usageTotalUsd === 'number' ? run.usageTotalUsd : null,
        storageDeleted,
      });
    }
  };
}
