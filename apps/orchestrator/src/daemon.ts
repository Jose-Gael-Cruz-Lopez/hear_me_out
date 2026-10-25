// Continuous hosted entry point. No HTTP port or browser-side provider keys are needed.
import { loadConfig } from './config';
import { log } from './log';
import { startOrchestrator } from './main';

const cfg = loadConfig();
if (!cfg.stdbToken) {
  throw new Error('Set the server-only SPACETIMEDB_TOKEN to this database publisher identity.');
}
if (!cfg.demoMode && (!cfg.metaApiKey || !cfg.apifyToken)) {
  log.warn('Live integrations are incomplete', { museConfigured: !!cfg.metaApiKey, apifyConfigured: !!cfg.apifyToken });
}

let shutdownRequested = false;
let worker: Awaited<ReturnType<typeof startOrchestrator>> | undefined;
async function shutdown(): Promise<void> {
  if (shutdownRequested) return;
  shutdownRequested = true;
  log.info('stopping worker; draining current jobs');
  if (worker) await worker.drain();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());

try {
  worker = await startOrchestrator(cfg);
  if (shutdownRequested) await worker.drain();
} catch (error) {
  log.error('worker startup failed', { error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
}
