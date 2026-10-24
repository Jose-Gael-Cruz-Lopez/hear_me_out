import { ScheduleAt } from 'spacetimedb';
import { enqueueJob, playersIn, startGame, type Ctx, type RoomRow } from './core';
import { makeRoomCode } from './logic/codes';
import { groupName } from './logic/match';

/** A fresh room row. Matchmaking rooms are owned by the module itself (no human host, timers drive everything). */
export function insertRoom(ctx: Ctx, f: { mode: string; category: string; locationLabel: string; tzOffsetMin: number; fastMode: boolean; isPublic: boolean; aiStatus?: string }): RoomRow {
  let code = makeRoomCode(n => ctx.random.integerInRange(0, n - 1));
  while (ctx.db.room.code.find(code)) code = makeRoomCode(n => ctx.random.integerInRange(0, n - 1));
  return ctx.db.room.insert({
    id: 0n,
    code,
    mode: f.mode,
    category: f.category,
    hostIdentity: ctx.identity,
    phase: 'lobby',
    phaseSeq: 0,
    phaseStartedAt: ctx.timestamp,
    phaseDeadline: undefined,
    locationLabel: f.locationLabel,
    lat: 0,
    lng: 0,
    hasGeo: false,
    tzOffsetMin: f.tzOffsetMin,
    isPublic: f.isPublic,
    vibeTags: [],
    aiStatus: f.aiStatus ?? '',
    scoutStatus: '',
    venueKey: '',
    currentPitchIdx: 0,
    winnerOptionId: 0n,
    tiebreakText: '',
    fastMode: f.fastMode,
    createdAt: ctx.timestamp,
    groupName: groupName(n => ctx.random.integerInRange(0, n - 1)),
    targetStartMin: -1,
  });
}

/** After someone approves their tags in a queue, check again once things go quiet (15 s). */
export function scheduleQueueCheck(ctx: Ctx, q: RoomRow): void {
  const secs = q.fastMode ? 2 : 15;
  ctx.db.phaseTimer.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + BigInt(secs) * 1_000_000n),
    roomId: q.id,
    phaseSeq: q.phaseSeq,
  });
  tryMatch(ctx, q, false);
}

/**
 * Simple proof-of-concept matcher: 4 ready people match right away; 3 match once the queue has been
 * quiet for the check delay. The group is the longest-waiting person plus whoever shares the most
 * approved tags with them. The group gets its own server-owned room and the game starts.
 */
export function tryMatch(ctx: Ctx, q: RoomRow, quiet: boolean): void {
  const ready = playersIn(ctx, q.id)
    .filter(p => p.ready && p.connected && !p.isBot)
    .sort((a, b) => Number(a.joinedAt.microsSinceUnixEpoch - b.joinedAt.microsSinceUnixEpoch));
  if (ready.length < 3 || (ready.length < 4 && !quiet)) return;

  const tagsOf = (id: bigint) => ctx.db.profilePublic.playerId.find(id)?.approvedTags ?? [];
  const anchor = ready[0];
  const anchorTags = new Set(tagsOf(anchor.id));
  const others = ready
    .slice(1)
    .map(p => ({ p, shared: tagsOf(p.id).filter(t => anchorTags.has(t)).length }))
    .sort((a, b) => b.shared - a.shared)
    .slice(0, 3)
    .map(x => x.p);
  const group = [anchor, ...others];

  const counts = new Map<string, number>();
  for (const p of group) for (const t of tagsOf(p.id)) counts.set(t, (counts.get(t) ?? 0) + 1);
  const shared = [...counts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 3);
  const why = shared.length ? `You matched on ${shared.map(t => `#${t}`).join(', ')}.` : 'You matched: new people, new vibes.';

  const room = insertRoom(ctx, { mode: 'strangers', category: q.category, locationLabel: q.locationLabel, tzOffsetMin: q.tzOffsetMin, fastMode: q.fastMode, isPublic: false, aiStatus: why });
  group.forEach((p, seat) => {
    ctx.db.player.id.update({ ...p, roomId: room.id, seat, ready: true, actedSeq: 0 });
    const pub = ctx.db.profilePublic.playerId.find(p.id);
    if (pub) ctx.db.profilePublic.playerId.update({ ...pub, roomId: room.id });
    const draft = ctx.db.profileDraft.playerId.find(p.id);
    if (draft) ctx.db.profileDraft.playerId.update({ ...draft, roomId: room.id });
  });
  const scouting = { ...room, scoutStatus: 'running' };
  ctx.db.room.id.update(scouting);
  enqueueJob(ctx, room.id, 'scout', 0n, { category: q.category, locationLabel: q.locationLabel, lat: 0, lng: 0, hasGeo: false });
  startGame(ctx, scouting);

  // Enough people left for another table? Match them too.
  const fresh = ctx.db.room.id.find(q.id);
  if (fresh) tryMatch(ctx, fresh, quiet);
}
