import { SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import { ScheduleAt, Timestamp, type Infer } from 'spacetimedb';
import spacetimedb, { option, pitch, player, room } from './schema';
import { assignDefenders } from './logic/assign';
import { botPitchText, defaultBrief, defaultInvite, type VenueFacts } from './logic/fallbacks';
import { mergeIntroFallback } from './logic/match';
import { busyFromWeek, formatSlotLabel, localMidnightMicros, localMinutes, localWeekday, pickSlot } from './logic/slot';
import { mostPersuasive, tallyVotes } from './logic/tally';
import { topTags } from './logic/text';
import { phaseSeconds, pitchSeconds, type Phase } from './logic/timing';

export type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;
export type RoomRow = Infer<typeof room.rowType>;
export type PlayerRow = Infer<typeof player.rowType>;
export type OptionRow = Infer<typeof option.rowType>;
export type PitchRow = Infer<typeof pitch.rowType>;

export type JobKind =
  | 'distill_profile'
  | 'warmup'
  | 'scout'
  | 'curate'
  | 'assign'
  | 'transcribe'
  | 'factcheck'
  | 'bot_pitch'
  | 'awards'
  | 'plan_copy'
  | 'poster'
  | 'icebreakers'
  | 'match_blurb'
  | 'merge_intro'
  | 'menu_check';

// ---------- Auth ----------

export function isAdmin(ctx: Ctx): boolean {
  const cfg = ctx.db.config.id.find(0);
  return !!cfg && cfg.adminIdentity.equals(ctx.sender);
}

export function requireAdmin(ctx: Ctx): void {
  if (!isAdmin(ctx)) throw new SenderError('This reducer is for the orchestrator only.');
}

export function getRoom(ctx: Ctx, roomId: bigint): RoomRow {
  const r = ctx.db.room.id.find(roomId);
  if (!r) throw new SenderError('That room does not exist.');
  return r;
}

export function requireHost(ctx: Ctx, r: RoomRow): void {
  if (!r.hostIdentity.equals(ctx.sender)) throw new SenderError('Only the host can do that.');
}

export function findMyPlayer(ctx: Ctx, roomId: bigint): PlayerRow | undefined {
  for (const p of ctx.db.player.identity.filter(ctx.sender)) if (p.roomId === roomId && !p.isBot) return p;
  return undefined;
}

export function requireMyPlayer(ctx: Ctx, roomId: bigint): PlayerRow {
  const p = findMyPlayer(ctx, roomId);
  if (!p) throw new SenderError('You are not in this room.');
  return p;
}

export function requirePhase(r: RoomRow, ...phases: Phase[]): void {
  if (!phases.includes(r.phase as Phase)) throw new SenderError(`Not allowed during ${r.phase}.`);
}

// ---------- Queries ----------

export function playersIn(ctx: Ctx, roomId: bigint): PlayerRow[] {
  return [...ctx.db.player.roomId.filter(roomId)].sort((a, b) => a.seat - b.seat);
}

export function optionsIn(ctx: Ctx, roomId: bigint): OptionRow[] {
  return [...ctx.db.option.roomId.filter(roomId)].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function pitchesIn(ctx: Ctx, roomId: bigint): PitchRow[] {
  return [...ctx.db.pitch.roomId.filter(roomId)].sort((a, b) => a.playOrder - b.playOrder);
}

/** Pitches the TV will play, in order. Stable once playback starts. */
export function playableIn(ctx: Ctx, roomId: bigint): PitchRow[] {
  return pitchesIn(ctx, roomId).filter(p => p.status !== 'waiting' && p.status !== 'skipped');
}

export function venueFacts(o: OptionRow): VenueFacts {
  return {
    title: o.title,
    category: o.category,
    priceLevel: o.priceLevel,
    rating: o.rating,
    reviewCount: o.reviewCount,
    travelMin: o.travelMin,
    hoursText: o.hoursText,
    dietaryNotes: o.dietaryNotes,
    reviewSnippets: o.reviewSnippets,
  };
}

// ---------- Jobs ----------

export function toJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}

export function enqueueJob(ctx: Ctx, roomId: bigint, kind: JobKind, refId: bigint, payload: unknown = {}): void {
  ctx.db.aiJob.insert({
    id: 0n,
    roomId,
    kind,
    status: 'queued',
    refId,
    payloadJson: toJson(payload),
    resultJson: '',
    error: '',
    attempts: 0,
    createdAt: ctx.timestamp,
    claimedAt: undefined,
  });
}

export function hasActiveJob(ctx: Ctx, roomId: bigint, kind: JobKind): boolean {
  for (const j of ctx.db.aiJob.roomId.filter(roomId)) {
    if (j.kind === kind && (j.status === 'queued' || j.status === 'running')) return true;
  }
  return false;
}

/** Queue a fact-check for a pitch whose transcript just became ready. */
export function enqueueFactcheck(ctx: Ctx, p: PitchRow): void {
  if (!p.transcript.trim()) {
    ctx.db.pitch.id.update({ ...p, rulingKind: 'none', rulingText: '' });
    return;
  }
  enqueueJob(ctx, p.roomId, 'factcheck', p.id);
}

export function setAiStatus(ctx: Ctx, roomId: bigint, aiStatus: string): void {
  const r = ctx.db.room.id.find(roomId);
  if (r && r.aiStatus !== aiStatus) ctx.db.room.id.update({ ...r, aiStatus });
}

// ---------- Phase machine ----------

/** Move a room to a phase, bump its sequence number and schedule the deadline timer. */
export function setPhase(
  ctx: Ctx,
  r: RoomRow,
  phase: Phase,
  seconds?: number | null,
  patch: Partial<RoomRow> = {}
): RoomRow {
  const secs = seconds === undefined ? phaseSeconds(phase, r.fastMode) : seconds;
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const phaseSeq = r.phaseSeq + 1;
  const deadline = secs == null ? undefined : new Timestamp(now + BigInt(Math.round(secs * 1_000_000)));
  const next: RoomRow = { ...r, ...patch, phase, phaseSeq, phaseStartedAt: ctx.timestamp, phaseDeadline: deadline };
  ctx.db.room.id.update(next);
  if (deadline) {
    ctx.db.phaseTimer.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(deadline.microsSinceUnixEpoch),
      roomId: r.id,
      phaseSeq,
    });
  }
  return next;
}

/** What happens when the current phase's deadline passes (or the host skips). */
export function advance(ctx: Ctx, r: RoomRow): void {
  switch (r.phase as Phase) {
    case 'profiles':
      return enterWarmup(ctx, r);
    case 'warmup':
      return afterWarmup(ctx, r);
    case 'scouting':
      return onScoutingTimeout(ctx, r);
    case 'finalists':
      setPhase(ctx, r, 'prevote');
      return;
    case 'prevote':
      return endPrevote(ctx, r);
    case 'assigning':
      setPhase(ctx, r, 'assignments', undefined, { aiStatus: '' });
      return;
    case 'assignments':
      return enterPitching(ctx, r);
    case 'pitching':
      return endPitching(ctx, r);
    case 'playback':
      return startPitch(ctx, r, r.currentPitchIdx + 1);
    case 'vote':
      return endVote(ctx, r);
    case 'results':
      setPhase(ctx, r, 'plan');
      return;
    default:
      return;
  }
}

/** Advance early when everyone who needs to act has acted. Call after player actions and job results. */
export function checkEarly(ctx: Ctx, roomId: bigint): void {
  const r = ctx.db.room.id.find(roomId);
  if (!r) return;
  const players = playersIn(ctx, roomId);
  const humans = players.filter(p => !p.isBot);
  switch (r.phase as Phase) {
    case 'profiles':
      if (players.every(p => p.ready)) advance(ctx, r);
      return;
    case 'warmup': {
      const rows = [...ctx.db.warmup.roomId.filter(roomId)];
      const answered = rows.length > 0 && rows.every(w => w.answer !== '');
      if (answered && optionsIn(ctx, roomId).length >= 2) advance(ctx, r);
      return;
    }
    case 'prevote':
    case 'vote':
      if (humans.every(p => p.actedSeq === r.phaseSeq)) advance(ctx, r);
      return;
    case 'pitching': {
      const pitches = pitchesIn(ctx, roomId);
      if (pitches.length > 0 && pitches.every(p => p.status === 'ready')) advance(ctx, r);
      return;
    }
    default:
      return;
  }
}

export function startGame(ctx: Ctx, r: RoomRow): void {
  const next = setPhase(ctx, r, 'profiles');
  checkEarly(ctx, next.id);
}

function enterWarmup(ctx: Ctx, r: RoomRow): void {
  const players = playersIn(ctx, r.id);
  for (const p of players) {
    if (!p.ready) ctx.db.player.id.update({ ...p, ready: true });
    if (!ctx.db.profilePublic.playerId.find(p.id)) {
      ctx.db.profilePublic.insert({
        playerId: p.id,
        roomId: r.id,
        approvedTags: [],
        budgetMax: 2,
        dietary: [],
        maxTravelMin: 30,
        availability: [],
      });
    }
  }
  const profiles = [...ctx.db.profilePublic.roomId.filter(r.id)];
  const vibeTags = topTags(profiles.map(p => p.approvedTags));
  const next = setPhase(ctx, r, 'warmup', undefined, { vibeTags });
  enqueueJob(ctx, r.id, 'warmup', 0n);
  maybeStartCurate(ctx, next);
}

/** Curation needs both the scouted venues and final profiles; start it as soon as both exist. */
export function maybeStartCurate(ctx: Ctx, r: RoomRow, forceFixtures = false): void {
  if (r.phase !== 'warmup' && r.phase !== 'scouting') return;
  if (optionsIn(ctx, r.id).length > 0) return;
  if (!forceFixtures && r.scoutStatus !== 'done' && r.scoutStatus !== 'failed') return;
  if (!forceFixtures && hasActiveJob(ctx, r.id, 'curate')) return;
  enqueueJob(ctx, r.id, 'curate', 0n, { forceFixtures: forceFixtures || r.scoutStatus === 'failed' });
  setAiStatus(ctx, r.id, 'The Judge is weighing the evidence…');
}

function afterWarmup(ctx: Ctx, r: RoomRow): void {
  if (optionsIn(ctx, r.id).length >= 2) {
    enterFinalists(ctx, r);
    return;
  }
  const next = setPhase(ctx, r, 'scouting', undefined, { aiStatus: 'The Judge is still scouting the neighborhood…' });
  maybeStartCurate(ctx, next);
}

function onScoutingTimeout(ctx: Ctx, r: RoomRow): void {
  if (optionsIn(ctx, r.id).length >= 2) {
    enterFinalists(ctx, r);
    return;
  }
  // Never stall: fall back to fixture venues and give the orchestrator a little more time.
  const next = setPhase(ctx, r, 'scouting', 20, { aiStatus: 'Traffic on the way to the courthouse… using the case files we have.' });
  maybeStartCurate(ctx, next, true);
}

export function enterFinalists(ctx: Ctx, r: RoomRow): void {
  setPhase(ctx, r, 'finalists', undefined, { aiStatus: '' });
}

function endPrevote(ctx: Ctx, r: RoomRow): void {
  const players = playersIn(ctx, r.id);
  const options = optionsIn(ctx, r.id);
  if (options.length === 0) return;
  for (const p of players) {
    if (p.isBot && !ctx.db.prevote.playerId.find(p.id)) {
      const pick = options[ctx.random.integerInRange(0, options.length - 1)];
      ctx.db.prevote.insert({ playerId: p.id, roomId: r.id, optionId: pick.id });
    }
  }
  const prevotes = new Map<bigint, bigint>();
  for (const pv of ctx.db.prevote.roomId.filter(r.id)) prevotes.set(pv.playerId, pv.optionId);
  seedLeans(ctx, r.id, prevotes);

  const mapping = assignDefenders(
    players.map(p => ({ id: p.id, prevote: prevotes.get(p.id) ?? null })),
    options.map(o => o.id),
    () => ctx.random()
  );
  for (const a of [...ctx.db.assignment.roomId.filter(r.id)]) ctx.db.assignment.playerId.delete(a.playerId);
  players.forEach((p, i) => {
    const a = mapping.get(p.id);
    const o = a && options.find(x => x.id === a.optionId);
    if (!a || !o) return;
    // Default briefs exist immediately; the assign job upgrades them with personalized prompts.
    const brief = defaultBrief(venueFacts(o), i + ctx.random.integerInRange(0, 7));
    ctx.db.assignment.insert({
      playerId: p.id,
      roomId: r.id,
      optionId: o.id,
      stylePrompt: brief.stylePrompt,
      hints: brief.hints,
      coCounsel: a.coCounsel,
    });
  });
  setPhase(ctx, r, 'assigning', undefined, { aiStatus: 'The Judge is writing your case files…' });
  enqueueJob(ctx, r.id, 'assign', 0n);
}

function enterPitching(ctx: Ctx, r: RoomRow): void {
  for (const old of pitchesIn(ctx, r.id)) ctx.db.pitch.id.delete(old.id);
  const players = playersIn(ctx, r.id);
  const options = optionsIn(ctx, r.id);
  const assignments = [...ctx.db.assignment.roomId.filter(r.id)];
  const ordered = assignments
    .map(a => ({ a, o: options.find(o => o.id === a.optionId), p: players.find(p => p.id === a.playerId) }))
    .filter((x): x is { a: (typeof assignments)[number]; o: OptionRow; p: PlayerRow } => !!x.o && !!x.p)
    .sort((x, y) => x.o.sortOrder - y.o.sortOrder || x.p.seat - y.p.seat);

  const botPitchIds: bigint[] = [];
  ordered.forEach(({ a, p }, i) => {
    const row = ctx.db.pitch.insert({
      id: 0n,
      roomId: r.id,
      playerId: p.id,
      optionId: a.optionId,
      playOrder: i,
      audioMediaId: 0n,
      audioMime: '',
      liveCaption: '',
      transcript: '',
      transcriptSource: '',
      status: 'waiting',
      durationMs: 0,
      recordings: 0,
      rulingKind: 'pending',
      rulingText: '',
    });
    if (p.isBot) botPitchIds.push(row.id);
  });
  setPhase(ctx, r, 'pitching');
  if (botPitchIds.length > 0) enqueueJob(ctx, r.id, 'bot_pitch', 0n, { pitchIds: botPitchIds });
}

function endPitching(ctx: Ctx, r: RoomRow): void {
  for (const p of pitchesIn(ctx, r.id)) {
    if (p.status === 'waiting') ctx.db.pitch.id.update({ ...p, status: 'skipped', rulingKind: 'none' });
  }
  startPitch(ctx, r, 0);
}

/** Show pitch `idx` on the TV, or move on to the vote when there are no more. */
function startPitch(ctx: Ctx, r: RoomRow, idx: number): void {
  const list = playableIn(ctx, r.id);
  const p = list[idx];
  if (!p) {
    enterVote(ctx, r);
    return;
  }
  setPhase(ctx, r, 'playback', pitchSeconds({ durationMs: p.durationMs, transcript: p.transcript, fast: r.fastMode }), {
    currentPitchIdx: idx,
  });
  swayBots(ctx, r.id, p.optionId);
}

/** Live Sway Meter: everyone's private lean starts at their secret pre-vote (no pre-vote, no lean). */
function seedLeans(ctx: Ctx, roomId: bigint, prevotes: Map<bigint, bigint>): void {
  for (const l of [...ctx.db.lean.roomId.filter(roomId)]) ctx.db.lean.playerId.delete(l.playerId);
  for (const [playerId, optionId] of prevotes) ctx.db.lean.insert({ playerId, roomId, optionId, updatedAt: ctx.timestamp });
}

export function writeLean(ctx: Ctx, roomId: bigint, playerId: bigint, optionId: bigint): void {
  const row = { playerId, roomId, optionId, updatedAt: ctx.timestamp };
  if (ctx.db.lean.playerId.find(playerId)) ctx.db.lean.playerId.update(row);
  else ctx.db.lean.insert(row);
}

/** Some bots get won over by the pitch on screen, so a solo game's sway meter still moves. */
function swayBots(ctx: Ctx, roomId: bigint, optionId: bigint): void {
  for (const p of playersIn(ctx, roomId)) {
    if (p.isBot && ctx.random() < 0.4) writeLean(ctx, roomId, p.id, optionId);
  }
}

function enterVote(ctx: Ctx, r: RoomRow): void {
  setPhase(ctx, r, 'vote');
  enqueueJob(ctx, r.id, 'awards', 0n);
}

function endVote(ctx: Ctx, r: RoomRow): void {
  const players = playersIn(ctx, r.id);
  const options = optionsIn(ctx, r.id);
  if (options.length === 0) return;
  const assignments = [...ctx.db.assignment.roomId.filter(r.id)];

  for (const p of players) {
    if (!p.isBot || ctx.db.vote.playerId.find(p.id)) continue;
    const mine = assignments.find(a => a.playerId === p.id);
    const loyal = mine && ctx.random() < 0.5;
    const pick = loyal ? mine.optionId : options[ctx.random.integerInRange(0, options.length - 1)].id;
    ctx.db.vote.insert({ playerId: p.id, roomId: r.id, optionId: pick });
  }

  const tallyOptions = options.map(o => ({ id: o.id, title: o.title, groupFitScore: o.groupFitScore, sortOrder: o.sortOrder }));
  const votes = [...ctx.db.vote.roomId.filter(r.id)];
  const result = tallyVotes(tallyOptions, votes);
  const prevotes = [...ctx.db.prevote.roomId.filter(r.id)];
  const persuasion = mostPersuasive(tallyOptions, prevotes, votes, assignments);

  for (const a of [...ctx.db.award.roomId.filter(r.id)]) if (a.kind === 'most_persuasive') ctx.db.award.id.delete(a.id);
  if (persuasion) {
    const o = options.find(x => x.id === persuasion.optionId);
    const title = o?.title ?? 'their pick';
    const text =
      persuasion.gain > 0
        ? `Flipped ${persuasion.gain} vote${persuasion.gain === 1 ? '' : 's'} for ${title}`
        : persuasion.gain === 0
          ? `Held the line for ${title}`
          : `Tough crowd, but nobody argued harder for ${title}`;
    for (const playerId of persuasion.advocateIds) {
      ctx.db.award.insert({ id: 0n, roomId: r.id, kind: 'most_persuasive', playerId, text });
    }
  }

  const winner = options.find(o => o.id === result.winnerId) ?? options[0];
  const next = setPhase(ctx, r, 'results', undefined, { winnerOptionId: winner.id, tiebreakText: result.tiebreakText });
  const planId = createPlan(ctx, next, winner, players);
  enqueueJob(ctx, r.id, 'plan_copy', planId);
  proposeMerges(ctx, next, planId, winner);
}

/** Another room picked the same place at an overlapping time: offer to merge tables (bots say yes). */
function proposeMerges(ctx: Ctx, r: RoomRow, planId: bigint, winner: OptionRow): void {
  const mine = ctx.db.plan.id.find(planId);
  if (!mine) return;
  for (const other of [...ctx.db.plan.iter()]) {
    if (other.roomId === r.id) continue;
    const otherOption = ctx.db.option.id.find(other.optionId);
    const otherRoom = ctx.db.room.id.find(other.roomId);
    if (!otherOption || !otherRoom || otherOption.placeId !== winner.placeId || otherRoom.phase === 'ended') continue;
    const overlaps =
      other.startAt.microsSinceUnixEpoch < mine.endAt.microsSinceUnixEpoch && mine.startAt.microsSinceUnixEpoch < other.endAt.microsSinceUnixEpoch;
    if (!overlaps) continue;
    const exists = [...ctx.db.mergeOffer.roomA.filter(other.roomId)].some(o => o.roomB === r.id);
    if (exists) continue;
    const offer = ctx.db.mergeOffer.insert({
      id: 0n,
      roomA: other.roomId,
      roomB: r.id,
      venueTitle: winner.title,
      slotLabel: other.slotLabel,
      status: 'open',
      introText: mergeIntroFallback(otherRoom.groupName || 'Group A', r.groupName || 'Group B', winner.title, other.slotLabel),
      createdAt: ctx.timestamp,
    });
    for (const roomId of [other.roomId, r.id]) {
      for (const p of playersIn(ctx, roomId)) {
        if (p.isBot && !ctx.db.mergeVote.playerId.find(p.id)) ctx.db.mergeVote.insert({ playerId: p.id, offerId: offer.id, roomId, yes: true });
      }
    }
    settleMergeOffer(ctx, offer.id);
  }
}

/** Accept when both rooms have a yes majority, decline when either has a no majority. */
export function settleMergeOffer(ctx: Ctx, offerId: bigint): void {
  const offer = ctx.db.mergeOffer.id.find(offerId);
  if (!offer || offer.status !== 'open') return;
  const verdict = (roomId: bigint): 'yes' | 'no' | 'pending' => {
    const n = playersIn(ctx, roomId).length;
    const votes = [...ctx.db.mergeVote.offerId.filter(offerId)].filter(v => v.roomId === roomId);
    const yes = votes.filter(v => v.yes).length;
    if (yes * 2 > n) return 'yes';
    if ((votes.length - yes) * 2 >= n) return 'no';
    return 'pending';
  };
  const a = verdict(offer.roomA);
  const b = verdict(offer.roomB);
  if (a === 'no' || b === 'no') {
    ctx.db.mergeOffer.id.update({ ...offer, status: 'declined' });
    return;
  }
  if (a !== 'yes' || b !== 'yes') return;
  ctx.db.mergeOffer.id.update({ ...offer, status: 'accepted' });
  const planA = ctx.db.plan.roomId.find(offer.roomA);
  const planB = ctx.db.plan.roomId.find(offer.roomB);
  if (planA) ctx.db.plan.id.update({ ...planA, mergedWithRoomId: offer.roomB });
  if (planB) ctx.db.plan.id.update({ ...planB, mergedWithRoomId: offer.roomA });
  enqueueJob(ctx, offer.roomA, 'merge_intro', offer.id);
}

function createPlan(ctx: Ctx, r: RoomRow, winner: OptionRow, players: PlayerRow[]): bigint {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const nowMin = localMinutes(now, r.tzOffsetMin);
  const slotPlayers = players.map(p => ({
    id: p.id,
    windows: ctx.db.profilePublic.playerId.find(p.id)?.availability ?? [],
  }));
  const slotLen = r.category === 'activity' ? 120 : r.category === 'movie' ? 150 : 90;
  // Public meetups advertise a start time; never plan earlier than that.
  const fromMin = r.targetStartMin >= 0 ? Math.max(nowMin, r.targetStartMin - 30) : nowMin;
  // Busyness-aware: with Google popular times, skip the rush ("go at 8:15, not 7").
  const weekday = localWeekday(now, r.tzOffsetMin);
  const busyAt = busyFromWeek(winner.busyness, weekday);
  const slot = pickSlot({
    nowMin: fromMin,
    players: slotPlayers,
    venue: { hoursKnown: winner.hoursKnown, open: winner.openIntervals },
    slotLen,
    busyAt,
  });
  const midnight = localMidnightMicros(now, r.tzOffsetMin);
  const slotLabel = formatSlotLabel(slot.startMin, slot.endMin, nowMin);
  const names = players.filter(p => !slot.cantMake.includes(p.id)).map(p => p.name);

  const existing = ctx.db.plan.roomId.find(r.id);
  if (existing) ctx.db.plan.id.delete(existing.id);
  const row = ctx.db.plan.insert({
    id: 0n,
    roomId: r.id,
    optionId: winner.id,
    startAt: new Timestamp(midnight + BigInt(slot.startMin) * 60_000_000n),
    endAt: new Timestamp(midnight + BigInt(slot.endMin) * 60_000_000n),
    slotLabel,
    cantMake: slot.cantMake,
    inviteText: defaultInvite(winner.title, slotLabel, names),
    whyForEach: winner.perPlayerFit,
    posterPrompt: '',
    posterUrl: '',
    posterMediaId: 0n,
    icebreakers: [],
    status: 'drafting',
    meetupConfirmed: false,
    mergedWithRoomId: 0n,
    weekday: busyAt ? weekday : -1,
    naiveStartMin: slot.naiveStartMin ?? -1,
    naiveBusyPct: slot.naiveBusyPct ?? -1,
    busyPct: slot.busyPct ?? -1,
  });
  for (const p of players) {
    if (p.isBot) {
      ctx.db.rsvp.insert({ playerId: p.id, planId: row.id, roomId: r.id, status: slot.cantMake.includes(p.id) ? 'no' : 'yes' });
    }
  }
  return row.id;
}

/** Text pitch for a bot when the orchestrator could not write one. */
export function fallbackBotPitch(ctx: Ctx, p: PitchRow): string {
  const o = ctx.db.option.id.find(p.optionId);
  const who = ctx.db.player.id.find(p.playerId);
  const a = ctx.db.assignment.playerId.find(p.playerId);
  if (!o) return 'I rest my case.';
  return botPitchText(venueFacts(o), a?.stylePrompt ?? '', who?.name ?? 'Bot');
}
