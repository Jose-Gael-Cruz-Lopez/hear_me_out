import { loadConfig, type Config } from './config';
import { log } from './log';
import { startRunner } from './runner';
import { createMuse } from './services/muse';
import { loadFixtureAreas } from './services/venues';
import { connect, type Conn } from './stdb';

export interface Orchestrator {
  conn: Conn;
  stop(): void;
  drain(timeoutMs?: number): Promise<void>;
}

/** Connect as the admin identity and start working jobs. Exported so the simulator can run it in-process. */
export async function startOrchestrator(overrides: Partial<Config> = {}): Promise<Orchestrator> {
  const cfg = loadConfig(overrides);
  const conn = await connect(cfg);
  try {
    await conn.reducers.whoAmI({});
  } catch {
    conn.disconnect();
    throw new Error(
      'This token is not the database publisher identity. Set SPACETIMEDB_TOKEN to the token from `spacetime login show --token` (the identity that ran `spacetime publish`).'
    );
  }
  const fixtures = loadFixtureAreas(cfg.fixturesDir);
  const muse = createMuse(cfg);
  log.info('ready', {
    demoMode: cfg.demoMode,
    muse: muse.enabled ? cfg.museModel : 'off (fixtures)',
    apify: cfg.apifyEnabled ? 'live' : 'off (fixtures)',
    fixtureAreas: fixtures.map(f => f.area).join(',') || 'none',
  });
  const runner = startRunner({ cfg, conn, muse, fixtures });
  return {
    conn,
    drain: async (timeoutMs = 125_000) => {
      runner.stop();
      const deadline = Date.now() + timeoutMs;
      while (runner.inFlight() > 0 && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      conn.disconnect();
    },
    stop: () => {
      runner.stop();
      conn.disconnect();
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startOrchestrator().catch(err => {
    log.error(String(err instanceof Error ? err.message : err));
    process.exit(1);
  });
}
