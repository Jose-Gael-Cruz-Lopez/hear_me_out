import { SenderError, t } from 'spacetimedb/server';
import spacetimedb, { lobbyMatch } from '../schema';
import { enqueueJob, findMyPlayer, getRoom, playersIn, requireAdmin, requireHost, requirePhase, settleMergeOffer } from '../core';
import { haversineKm, matchBlurbFallback, matchScore } from '../logic/match';
import { clampText, sanitizeTags } from '../logic/text';

/** Host of a public meetup sets the vibe the lobby advertises and the intended start time. */
export const setMeetupDetails = spacetimedb.reducer(
  { roomId: t.u64(), vibeTags: t.array(t.string()), targetStartMin: t.i32() },
  (ctx, { roomId, vibeTags, targetStartMin }) => {
    const r = getRoom(ctx, roomId);
    requireHost(ctx, r);
    requirePhase(r, 'lobby');
    if (r.mode !== 'strangers') throw new SenderError('Only public meetups advertise a vibe.');
    ctx.db.room.id.update({
      ...r,
      vibeTags: sanitizeTags(vibeTags, 6),
      targetStartMin: targetStartMin < 0 ? -1 : Math.min(targetStartMin, 26 * 60),
    });
  }
);

/**
 * Score every open public lobby for this visitor (weighted tag overlap + distance) and keep the
 * results in a private table only the visitor can read. Top matches get an AI one-liner.
 */
export const browseLobbies = spacetimedb.reducer(
  { tags: t.array(t.string()), lat: t.f64(), lng: t.f64(), hasGeo: t.bool() },
  (ctx, { tags, lat, lng, hasGeo }) => {
    const visitorTags = sanitizeTags(tags, 12);
    for (const m of [...ctx.db.lobbyMatch.identity.filter(ctx.sender)]) ctx.db.lobbyMatch.id.delete(m.id);
    const scored: { roomId: bigint; score: number; shared: string[]; distanceKm: number; count: number }[] = [];
    for (const r of ctx.db.room.iter()) {
      if (!r.isPublic || (r.phase !== 'lobby' && r.phase !== 'profiles')) continue;
      const distanceKm = hasGeo && r.hasGeo ? haversineKm({ lat, lng }, r) : null;
      const { score, shared } = matchScore(visitorTags, r.vibeTags, distanceKm);
      scored.push({ roomId: r.id, score, shared, distanceKm: distanceKm ?? -1, count: playersIn(ctx, r.id).length });
    }
    scored.sort((a, b) => b.score - a.score);
    scored.slice(0, 20).forEach((s, i) => {
      const row = ctx.db.lobbyMatch.insert({
        id: 0n,
        identity: ctx.sender,
        roomId: s.roomId,
        score: s.score,
        sharedTags: s.shared,
        distanceKm: Math.round(s.distanceKm * 10) / 10,
        blurb: matchBlurbFallback(s.shared, s.count),
        createdAt: ctx.timestamp,
      });
      if (i < 3 && s.shared.length > 0) enqueueJob(ctx, s.roomId, 'match_blurb', row.id, { shared: s.shared, players: s.count });
    });
  }
);

export const myLobbyMatches = spacetimedb.view({ name: 'my_lobby_matches', public: true }, t.array(lobbyMatch.rowType), ctx => [
  ...ctx.db.lobbyMatch.identity.filter(ctx.sender),
]);

export const finishMatchBlurb = spacetimedb.reducer({ jobId: t.u64(), line: t.string() }, (ctx, { jobId, line }) => {
  requireAdmin(ctx);
  const job = ctx.db.aiJob.id.find(jobId);
  if (!job || job.status !== 'running') return;
  ctx.db.aiJob.id.update({ ...job, status: 'done' });
  const m = ctx.db.lobbyMatch.id.find(job.refId);
  if (m && line.trim()) ctx.db.lobbyMatch.id.update({ ...m, blurb: clampText(line, 140) });
});

/**
 * Block & report. The reporter's client hides the player immediately; two independent reports
 * (or one from the host) remove the player from the room.
 */
export const reportPlayer = spacetimedb.reducer({ roomId: t.u64(), playerId: t.u64(), reason: t.string() }, (ctx, { roomId, playerId, reason }) => {
  const r = getRoom(ctx, roomId);
  const target = ctx.db.player.id.find(playerId);
  if (!target || target.roomId !== roomId) throw new SenderError('No such player.');
  const isHost = r.hostIdentity.equals(ctx.sender);
  const me = findMyPlayer(ctx, roomId);
  if (!me && !isHost) throw new SenderError('You are not in this room.');
  if (me && me.id === playerId) throw new SenderError('You cannot report yourself.');
  const reporterPlayerId = me?.id ?? 0n;
  const prior = [...ctx.db.report.roomId.filter(roomId)].filter(x => x.reportedPlayerId === playerId);
  if (!prior.some(x => x.reporterPlayerId === reporterPlayerId)) {
    ctx.db.report.insert({ id: 0n, roomId, reporterPlayerId, reportedPlayerId: playerId, reason: clampText(reason, 200), createdAt: ctx.timestamp });
  }
  const reporters = new Set([...prior.map(x => x.reporterPlayerId), reporterPlayerId]);
  if (isHost || reporters.size >= 2) {
    ctx.db.player.id.delete(playerId);
    ctx.db.profilePublic.playerId.delete(playerId);
    ctx.db.profileDraft.playerId.delete(playerId);
  }
});

/** Vote on merging tables with the other group that picked the same place. Needs a majority in both rooms. */
export const voteMerge = spacetimedb.reducer({ offerId: t.u64(), yes: t.bool() }, (ctx, { offerId, yes }) => {
  const offer = ctx.db.mergeOffer.id.find(offerId);
  if (!offer || offer.status !== 'open') throw new SenderError('That offer is closed.');
  const me = findMyPlayer(ctx, offer.roomA) ?? findMyPlayer(ctx, offer.roomB);
  if (!me) throw new SenderError('You are not in either group.');
  const row = { playerId: me.id, offerId, roomId: me.roomId, yes };
  if (ctx.db.mergeVote.playerId.find(me.id)) ctx.db.mergeVote.playerId.update(row);
  else ctx.db.mergeVote.insert(row);
  settleMergeOffer(ctx, offerId);
});


export const finishMergeIntro = spacetimedb.reducer({ jobId: t.u64(), text: t.string() }, (ctx, { jobId, text }) => {
  requireAdmin(ctx);
  const job = ctx.db.aiJob.id.find(jobId);
  if (!job || job.status !== 'running') return;
  ctx.db.aiJob.id.update({ ...job, status: 'done' });
  const offer = ctx.db.mergeOffer.id.find(job.refId);
  if (offer && text.trim()) ctx.db.mergeOffer.id.update({ ...offer, introText: clampText(text, 400) });
});

