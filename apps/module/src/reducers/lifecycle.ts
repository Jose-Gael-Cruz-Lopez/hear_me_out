import { SenderError } from 'spacetimedb/server';
import { ScheduleAt } from 'spacetimedb';
import spacetimedb, { janitorTimer, phaseTimer } from '../schema';
import { advance, type Ctx } from '../core';
import { applyFallback, deleteRoomData } from '../cleanup';
import { tryMatch } from '../queue';

export const init = spacetimedb.init(ctx => {
  if (!ctx.db.config.id.find(0)) ctx.db.config.insert({ id: 0, adminIdentity: ctx.sender });
  ctx.db.janitorTimer.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.interval(30_000_000n) });
});

function setConnected(ctx: Ctx, connected: boolean): void {
  for (const p of [...ctx.db.player.identity.filter(ctx.sender)]) {
    if (!p.isBot && p.connected !== connected) ctx.db.player.id.update({ ...p, connected });
  }
}

export const onConnect = spacetimedb.clientConnected(ctx => setConnected(ctx, true));
export const onDisconnect = spacetimedb.clientDisconnected(ctx => setConnected(ctx, false));

function requireScheduler(ctx: Ctx): void {
  if (!ctx.sender.equals(ctx.identity)) throw new SenderError('Scheduled reducers cannot be called directly.');
}

export const advancePhase = spacetimedb.reducer({ onSchedule: phaseTimer }, { timer: phaseTimer.rowType }, (ctx, { timer }) => {
  requireScheduler(ctx);
  const r = ctx.db.room.id.find(timer.roomId);
  if (!r || r.phaseSeq !== timer.phaseSeq) return; // stale: the phase already moved on
  if (r.mode === 'queue') return tryMatch(ctx, r, true); // matchmaking check after things went quiet
  advance(ctx, r);
});

const SECOND = 1_000_000n;

export const janitor = spacetimedb.reducer({ onSchedule: janitorTimer }, { timer: janitorTimer.rowType }, ctx => {
  requireScheduler(ctx);
  const now = ctx.timestamp.microsSinceUnixEpoch;

  for (const job of [...ctx.db.aiJob.status.filter('running')]) {
    const claimed = job.claimedAt?.microsSinceUnixEpoch ?? job.createdAt.microsSinceUnixEpoch;
    if (now - claimed < 150n * SECOND) continue; // longer than the orchestrator's own 120 s job timeout
    if (job.attempts < 3) ctx.db.aiJob.id.update({ ...job, status: 'queued', claimedAt: undefined });
    else applyFallback(ctx, job, 'timed out');
  }
  for (const job of [...ctx.db.aiJob.status.filter('queued')]) {
    if (now - job.createdAt.microsSinceUnixEpoch > 600n * SECOND) applyFallback(ctx, job, 'never picked up');
  }
  for (const status of ['done', 'failed']) {
    for (const job of [...ctx.db.aiJob.status.filter(status)]) {
      if (now - job.createdAt.microsSinceUnixEpoch > 3600n * SECOND) ctx.db.aiJob.id.delete(job.id);
    }
  }
  for (const r of [...ctx.db.room.iter()]) {
    if (now - r.createdAt.microsSinceUnixEpoch > 12n * 3600n * SECOND) deleteRoomData(ctx, r.id);
  }
  for (const m of [...ctx.db.lobbyMatch.iter()]) {
    if (now - m.createdAt.microsSinceUnixEpoch > 3600n * SECOND) ctx.db.lobbyMatch.id.delete(m.id);
  }
  for (const m of [...ctx.db.media.iter()]) {
    if (now - m.createdAt.microsSinceUnixEpoch > 2n * 3600n * SECOND) ctx.db.media.id.delete(m.id);
  }
});
