import { SenderError, t } from 'spacetimedb/server';
import { type Infer } from 'spacetimedb';
import spacetimedb, {
  aiJob,
  BotPitchInput,
  BriefInput,
  OptionInput,
  PlayerLine,
  TagReason,
  venueCache,
  WarmupInput,
} from '../schema';
import {
  checkEarly,
  enqueueFactcheck,
  enqueueJob,
  enterFinalists,
  isAdmin,
  maybeStartCurate,
  playersIn,
  requireAdmin,
  setAiStatus,
  setPhase,
  type Ctx,
} from '../core';
import { applyFallback } from '../cleanup';
import { clampText, sanitizeTags } from '../logic/text';

type JobRow = Infer<typeof aiJob.rowType>;

/** Finish a running job. Returns null (and changes nothing) if the job is not running anymore. */
function finish(ctx: Ctx, jobId: bigint, result: unknown = {}): JobRow | null {
  requireAdmin(ctx);
  const job = ctx.db.aiJob.id.find(jobId);
  if (!job || job.status !== 'running') return null;
  const resultJson = JSON.stringify(result, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)).slice(0, 4000);
  const done = { ...job, status: 'done', resultJson };
  ctx.db.aiJob.id.update(done);
  return done;
}

// ---------- Job lifecycle ----------

export const claimJob = spacetimedb.reducer({ jobId: t.u64() }, (ctx, { jobId }) => {
  requireAdmin(ctx);
  const job = ctx.db.aiJob.id.find(jobId);
  if (!job || job.status !== 'queued') throw new SenderError('Job is not available.');
  ctx.db.aiJob.id.update({ ...job, status: 'running', attempts: job.attempts + 1, claimedAt: ctx.timestamp });
});

export const failJob = spacetimedb.reducer({ jobId: t.u64(), error: t.string() }, (ctx, { jobId, error }) => {
  requireAdmin(ctx);
  const job = ctx.db.aiJob.id.find(jobId);
  if (!job || job.status === 'done' || job.status === 'failed') return;
  applyFallback(ctx, job, error);
});

/** Queued and running jobs, visible only to the admin identity (the orchestrator). */
export const adminJobs = spacetimedb.view({ name: 'admin_jobs', public: true }, t.array(aiJob.rowType), ctx => {
  const cfg = ctx.db.config.id.find(0);
  if (!cfg || !cfg.adminIdentity.equals(ctx.sender)) return [];
  return [...ctx.db.aiJob.status.filter('queued'), ...ctx.db.aiJob.status.filter('running')];
});

export const adminVenueCache = spacetimedb.view({ name: 'admin_venue_cache', public: true }, t.array(venueCache.rowType), ctx => {
  const cfg = ctx.db.config.id.find(0);
  if (!cfg || !cfg.adminIdentity.equals(ctx.sender)) return [];
  return [...ctx.db.venueCache.iter()];
});

// ---------- Results ----------

export const finishDistill = spacetimedb.reducer(
  { jobId: t.u64(), tags: t.array(TagReason), note: t.string() },
  (ctx, { jobId, tags, note }) => {
    const job = finish(ctx, jobId, { tags: tags.length });
    if (!job) return;
    const draft = ctx.db.profileDraft.playerId.find(job.refId);
    if (!draft) return;
    const seen = new Set<string>();
    const clean = tags
      .map(tr => ({ tag: sanitizeTags([tr.tag], 1)[0] ?? '', reason: clampText(tr.reason, 120), source: clampText(tr.source, 24) }))
      .filter(tr => tr.tag && !seen.has(tr.tag) && seen.add(tr.tag))
      .slice(0, 8);
    // Raw social posts never reach the database; only these derived tags do, and only the player can see them.
    ctx.db.profileDraft.playerId.update({ ...draft, draftTags: clean, status: 'ready', note: clampText(note, 200) });
  }
);

export const finishWarmup = spacetimedb.reducer({ jobId: t.u64(), questions: t.array(WarmupInput) }, (ctx, { jobId, questions }) => {
  const job = finish(ctx, jobId, { count: questions.length });
  if (!job) return;
  const players = playersIn(ctx, job.roomId);
  for (const old of [...ctx.db.warmup.roomId.filter(job.roomId)]) ctx.db.warmup.id.delete(old.id);
  for (const q of questions) {
    const p = players.find(x => x.id === q.playerId);
    if (!p) continue;
    ctx.db.warmup.insert({
      id: 0n,
      roomId: job.roomId,
      playerId: p.id,
      question: clampText(q.question, 120),
      choiceA: clampText(q.choiceA, 40),
      choiceB: clampText(q.choiceB, 40),
      answer: p.isBot ? (ctx.random() < 0.5 ? 'a' : 'b') : '',
    });
  }
  setAiStatus(ctx, job.roomId, '');
});

export const cacheVenues = spacetimedb.reducer(
  { key: t.string(), category: t.string(), query: t.string(), source: t.string(), itemsJson: t.string() },
  (ctx, row) => {
    requireAdmin(ctx);
    const next = { ...row, fetchedAt: ctx.timestamp };
    if (ctx.db.venueCache.key.find(row.key)) ctx.db.venueCache.key.update(next);
    else ctx.db.venueCache.insert(next);
  }
);

export const finishScout = spacetimedb.reducer(
  { jobId: t.u64(), venueKey: t.string(), lat: t.f64(), lng: t.f64(), hasGeo: t.bool(), count: t.u32(), source: t.string() },
  (ctx, { jobId, venueKey, lat, lng, hasGeo, count, source }) => {
    const job = finish(ctx, jobId, { venueKey, count, source });
    if (!job) return;
    const r = ctx.db.room.id.find(job.roomId);
    if (!r) return;
    const next = {
      ...r,
      scoutStatus: 'done',
      venueKey,
      lat: r.hasGeo ? r.lat : lat,
      lng: r.hasGeo ? r.lng : lng,
      hasGeo: r.hasGeo || hasGeo,
      aiStatus: r.phase === 'lobby' || r.phase === 'profiles' ? `Found ${count} real places nearby.` : r.aiStatus,
    };
    ctx.db.room.id.update(next);
    maybeStartCurate(ctx, next);
  }
);

export const finishCurate = spacetimedb.reducer({ jobId: t.u64(), options: t.array(OptionInput) }, (ctx, { jobId, options }) => {
  const job = finish(ctx, jobId, { count: options.length });
  if (!job) return;
  const r = ctx.db.room.id.find(job.roomId);
  if (!r || (r.phase !== 'warmup' && r.phase !== 'scouting')) return;
  if (options.length < 2) throw new SenderError('Need at least 2 finalists.');
  for (const old of [...ctx.db.option.roomId.filter(r.id)]) ctx.db.option.id.delete(old.id);
  options.slice(0, 4).forEach((o, i) => {
    ctx.db.option.insert({
      ...o,
      id: 0n,
      roomId: r.id,
      sortOrder: i,
      groupFitScore: Math.max(0, Math.min(100, o.groupFitScore)),
      posterUrl: '',
      posterMediaId: 0n,
    });
  });
  if (r.phase === 'scouting') enterFinalists(ctx, r);
  else {
    setAiStatus(ctx, r.id, '');
    checkEarly(ctx, r.id);
  }
});

export const finishAssign = spacetimedb.reducer({ jobId: t.u64(), briefs: t.array(BriefInput) }, (ctx, { jobId, briefs }) => {
  const job = finish(ctx, jobId, { count: briefs.length });
  if (!job) return;
  for (const b of briefs) {
    const a = ctx.db.assignment.playerId.find(b.playerId);
    if (!a || a.roomId !== job.roomId) continue;
    ctx.db.assignment.playerId.update({
      ...a,
      stylePrompt: clampText(b.stylePrompt, 160) || a.stylePrompt,
      hints: b.hints.length >= 2 ? b.hints.slice(0, 3).map(h => clampText(h, 120)) : a.hints,
    });
  }
  const r = ctx.db.room.id.find(job.roomId);
  if (r && r.phase === 'assigning') setPhase(ctx, r, 'assignments', undefined, { aiStatus: '' });
});

export const finishTranscribe = spacetimedb.reducer(
  { jobId: t.u64(), transcript: t.string(), source: t.string() },
  (ctx, { jobId, transcript, source }) => {
    const job = finish(ctx, jobId, { chars: transcript.length, source });
    if (!job) return;
    const p = ctx.db.pitch.id.find(job.refId);
    if (!p || p.status !== 'transcribing') return;
    const payload = JSON.parse(job.payloadJson || '{}') as { mediaId?: string };
    if (payload.mediaId && BigInt(payload.mediaId) !== p.audioMediaId) return; // a re-record replaced this audio
    const text = clampText(transcript, 1200);
    if (!text) {
      ctx.db.pitch.id.update({ ...p, status: 'needs_text' });
      return;
    }
    const ready = { ...p, transcript: text, transcriptSource: source === 'browser' ? 'browser' : 'muse', status: 'ready' };
    ctx.db.pitch.id.update(ready);
    enqueueFactcheck(ctx, ready);
    checkEarly(ctx, p.roomId);
  }
);

export const finishBotPitches = spacetimedb.reducer({ jobId: t.u64(), pitches: t.array(BotPitchInput) }, (ctx, { jobId, pitches }) => {
  const job = finish(ctx, jobId, { count: pitches.length });
  if (!job) return;
  for (const bp of pitches) {
    const p = ctx.db.pitch.id.find(bp.pitchId);
    if (!p || p.roomId !== job.roomId || p.status === 'ready') continue;
    const ready = { ...p, transcript: clampText(bp.text, 800), transcriptSource: 'bot', status: 'ready' };
    ctx.db.pitch.id.update(ready);
    enqueueFactcheck(ctx, ready);
  }
  checkEarly(ctx, job.roomId);
});

export const finishFactcheck = spacetimedb.reducer(
  { jobId: t.u64(), kind: t.string(), text: t.string() },
  (ctx, { jobId, kind, text }) => {
    const job = finish(ctx, jobId, { kind, text });
    if (!job) return;
    const p = ctx.db.pitch.id.find(job.refId);
    if (!p) return;
    const rulingKind = kind === 'sustained' || kind === 'verified' ? kind : 'none';
    ctx.db.pitch.id.update({ ...p, rulingKind, rulingText: rulingKind === 'none' ? '' : clampText(text, 160) });
  }
);

export const finishAwards = spacetimedb.reducer(
  { jobId: t.u64(), playerId: t.u64(), quote: t.string() },
  (ctx, { jobId, playerId, quote }) => {
    const job = finish(ctx, jobId, { playerId, quote });
    if (!job) return;
    const p = ctx.db.player.id.find(playerId);
    if (!p || p.roomId !== job.roomId || !quote.trim()) return;
    for (const a of [...ctx.db.award.roomId.filter(job.roomId)]) if (a.kind === 'best_line') ctx.db.award.id.delete(a.id);
    ctx.db.award.insert({ id: 0n, roomId: job.roomId, kind: 'best_line', playerId, text: clampText(quote, 160) });
  }
);

export const finishPlanCopy = spacetimedb.reducer(
  { jobId: t.u64(), inviteText: t.string(), whyForEach: t.array(PlayerLine), posterPrompt: t.string(), icebreakers: t.array(t.string()) },
  (ctx, { jobId, inviteText, whyForEach, posterPrompt, icebreakers }) => {
    const job = finish(ctx, jobId);
    if (!job) return;
    const plan = ctx.db.plan.id.find(job.refId);
    if (!plan) return;
    ctx.db.plan.id.update({
      ...plan,
      inviteText: clampText(inviteText, 400) || plan.inviteText,
      whyForEach: whyForEach.length > 0 ? whyForEach.map(w => ({ playerId: w.playerId, line: clampText(w.line, 160) })) : plan.whyForEach,
      posterPrompt: clampText(posterPrompt, 600),
      icebreakers: icebreakers.slice(0, 3).map(i => clampText(i, 160)),
      status: 'ready',
    });
    enqueueJob(ctx, job.roomId, 'poster', plan.id);
  }
);

export const finishPoster = spacetimedb.reducer(
  { jobId: t.u64(), posterUrl: t.string(), mime: t.string(), bytes: t.array(t.u8()) },
  (ctx, { jobId, posterUrl, mime, bytes }) => {
    const job = finish(ctx, jobId, { posterUrl: posterUrl.slice(0, 200), bytes: bytes.length });
    if (!job) return;
    const plan = ctx.db.plan.id.find(job.refId);
    if (!plan) return;
    let posterMediaId = plan.posterMediaId;
    if (bytes.length > 0) {
      if (!mime.startsWith('image/') || bytes.length > 1_500_000) throw new SenderError('Bad poster image.');
      posterMediaId = ctx.db.media.insert({ id: 0n, roomId: job.roomId, kind: 'poster', mime, bytes, createdAt: ctx.timestamp }).id;
    }
    ctx.db.plan.id.update({ ...plan, posterUrl: clampText(posterUrl, 2000), posterMediaId });
  }
);

/** Partial transcript from the realtime path (stretch), streamed onto every screen. */
export const writeLiveCaption = spacetimedb.reducer({ pitchId: t.u64(), text: t.string() }, (ctx, { pitchId, text }) => {
  requireAdmin(ctx);
  const p = ctx.db.pitch.id.find(pitchId);
  if (p) ctx.db.pitch.id.update({ ...p, liveCaption: clampText(text, 1200) });
});

/** Lets the orchestrator confirm at startup that its token is the admin identity. */
export const whoAmI = spacetimedb.reducer(ctx => {
  if (!isAdmin(ctx)) throw new SenderError('not admin');
});
