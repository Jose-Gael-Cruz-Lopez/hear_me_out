import { DbConnection, tables } from '@hmo/bindings';
import type { Config } from './config';
import { log } from './log';

export type Conn = DbConnection;

/** Connect as the admin identity and subscribe to everything the orchestrator reads. */
export function connect(cfg: Config): Promise<Conn> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const conn = DbConnection.builder()
      .withUri(cfg.stdbUri)
      .withDatabaseName(cfg.dbName)
      .withToken(cfg.stdbToken || undefined)
      .withAutomaticReconnect()
      .onConnect((c, identity) => {
        log.info('connected to SpacetimeDB', { uri: cfg.stdbUri, db: cfg.dbName, identity: identity.toHexString().slice(0, 12) });
        if (settled) return;
        c.subscriptionBuilder()
          .onApplied(() => {
            if (settled) return;
            settled = true;
            resolve(c);
          })
          .onError(ctx => {
            const err = (ctx as { event?: unknown }).event ?? 'unknown error';
            log.error('subscription failed', { err: String(err) });
            if (!settled) {
              settled = true;
              reject(err);
            }
          })
          .subscribe([
            tables.room,
            tables.player,
            tables.profilePublic,
            tables.option,
            tables.assignment,
            tables.pitch,
            tables.warmup,
            tables.vote,
            tables.plan,
            tables.award,
            tables.media.where(m => m.kind.eq('pitch_audio')),
            tables.adminJobs,
            tables.adminVenueCache,
          ]);
      })
      .onConnectError((_ctx, err) => {
        log.error('could not connect to SpacetimeDB', { err: String(err) });
        if (!settled) {
          settled = true;
          reject(err);
        }
      })
      .onDisconnect((_ctx, err) => log.warn('disconnected from SpacetimeDB', { err: String(err ?? '') }))
      .build();
    void conn;
  });
}
