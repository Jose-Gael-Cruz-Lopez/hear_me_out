import { type Infer } from 'spacetimedb';
import { aiJob } from './schema';
import {
  checkEarly,
  enqueueFactcheck,
  fallbackBotPitch,
  maybeStartCurate,
  optionsIn,
  pitchesIn,
  playersIn,
  setAiStatus,
  setPhase,
  type Ctx,
} from './core';
import { bestLineFallback, chipsToTags, defaultWarmup } from './logic/fallbacks';

type JobRow = Infer<typeof aiJob.rowType>;

function parsePayload(job: JobRow): Record<string, unknown> {
  try {
    const v = JSON.parse(job.payloadJson || '{}');
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Mark a job failed and apply a deterministic fallback so the game keeps moving.
 * Used by fail_job (orchestrator gave up) and by the janitor (job stuck or never claimed).
 */
export function applyFallback(ctx: Ctx, job: JobRow, error: string): void {
  ctx.db.aiJob.id.update({ ...job, status: 'failed', error: error.slice(0, 500) });
  const r = ctx.db.room.id.find(job.roomId);
  if (!r) return;
  const payload = parsePayload(job);

  switch (job.kind) {
    case 'distill_profile': {
      const draft = ctx.db.profileDraft.playerId.find(job.refId);
      const profile = ctx.db.profilePublic.playerId.find(job.refId);
      if (!draft) return;
      ctx.db.profileDraft.playerId.update({
        ...draft,
        draftTags: chipsToTags(draft.vibeChips, profile?.dietary ?? [], profile?.budgetMax ?? 2),
        status: 'ready',
        note: 'AI distillation was unavailable, so these tags come straight from your picks.',
      });
      return;
    }
    case 'warmup': {
      const existing = [...ctx.db.warmup.roomId.filter(r.id)];
      playersIn(ctx, r.id).forEach((p, i) => {
        if (existing.some(w => w.playerId === p.id)) return;
        const tags = ctx.db.profilePublic.playerId.find(p.id)?.approvedTags ?? [];
        const q = defaultWarmup(tags, i);
        ctx.db.warmup.insert({ id: 0n, roomId: r.id, playerId: p.id, ...q, answer: p.isBot ? (ctx.random() < 0.5 ? 'a' : 'b') : '' });
      });
      setAiStatus(ctx, r.id, '');
      return;
    }
    case 'scout': {
      ctx.db.room.id.update({ ...r, scoutStatus: 'failed' });
      const updated = ctx.db.room.id.find(r.id);
      if (updated) maybeStartCurate(ctx, updated, true);
      return;
    }
    case 'curate': {
      if (payload.forceFixtures !== true) {
        maybeStartCurate(ctx, r, true);
      } else {
        setAiStatus(ctx, r.id, 'The Judge lost the case files. The host can skip to try again.');
      }
      return;
    }
    case 'assign': {
      if (r.phase === 'assigning') setPhase(ctx, r, 'assignments', undefined, { aiStatus: '' });
      return;
    }
    case 'transcribe': {
      const p = ctx.db.pitch.id.find(job.refId);
      if (!p || p.status !== 'transcribing') return;
      if (p.liveCaption.trim()) {
        const ready = { ...p, transcript: p.liveCaption, transcriptSource: 'browser', status: 'ready' };
        ctx.db.pitch.id.update(ready);
        enqueueFactcheck(ctx, ready);
      } else {
        ctx.db.pitch.id.update({ ...p, status: 'needs_text' });
      }
      checkEarly(ctx, r.id);
      return;
    }
    case 'bot_pitch': {
      const ids = Array.isArray(payload.pitchIds) ? payload.pitchIds.map(x => BigInt(String(x))) : [];
      for (const id of ids) {
        const p = ctx.db.pitch.id.find(id);
        if (!p || p.status === 'ready') continue;
        const ready = { ...p, transcript: fallbackBotPitch(ctx, p), transcriptSource: 'bot', status: 'ready' };
        ctx.db.pitch.id.update(ready);
        enqueueFactcheck(ctx, ready);
      }
      checkEarly(ctx, r.id);
      return;
    }
    case 'factcheck': {
      const p = ctx.db.pitch.id.find(job.refId);
      if (p && p.rulingKind === 'pending') ctx.db.pitch.id.update({ ...p, rulingKind: 'none', rulingText: '' });
      return;
    }
    case 'awards': {
      if ([...ctx.db.award.roomId.filter(r.id)].some(a => a.kind === 'best_line')) return;
      const best = bestLineFallback(
        pitchesIn(ctx, r.id)
          .filter(p => p.transcript)
          .map(p => ({ playerId: p.playerId, text: p.transcript }))
      );
      if (best) ctx.db.award.insert({ id: 0n, roomId: r.id, kind: 'best_line', playerId: best.playerId, text: best.quote });
      return;
    }
    case 'plan_copy': {
      const plan = ctx.db.plan.id.find(job.refId);
      if (plan && plan.status === 'drafting') ctx.db.plan.id.update({ ...plan, status: 'ready' });
      return;
    }
    default:
      return;
  }
}

/** Remove a room and everything that belongs to it. */
export function deleteRoomData(ctx: Ctx, roomId: bigint): void {
  for (const p of playersIn(ctx, roomId)) {
    ctx.db.profilePublic.playerId.delete(p.id);
    ctx.db.profileDraft.playerId.delete(p.id);
    ctx.db.assignment.playerId.delete(p.id);
    ctx.db.prevote.playerId.delete(p.id);
    ctx.db.vote.playerId.delete(p.id);
    ctx.db.rsvp.playerId.delete(p.id);
    ctx.db.mergeVote.playerId.delete(p.id);
    ctx.db.player.id.delete(p.id);
  }
  for (const o of optionsIn(ctx, roomId)) ctx.db.option.id.delete(o.id);
  for (const p of pitchesIn(ctx, roomId)) ctx.db.pitch.id.delete(p.id);
  for (const x of [...ctx.db.objection.roomId.filter(roomId)]) ctx.db.objection.id.delete(x.id);
  for (const x of [...ctx.db.warmup.roomId.filter(roomId)]) ctx.db.warmup.id.delete(x.id);
  for (const x of [...ctx.db.award.roomId.filter(roomId)]) ctx.db.award.id.delete(x.id);
  for (const x of [...ctx.db.media.roomId.filter(roomId)]) ctx.db.media.id.delete(x.id);
  for (const x of [...ctx.db.report.roomId.filter(roomId)]) ctx.db.report.id.delete(x.id);
  for (const x of [...ctx.db.aiJob.roomId.filter(roomId)]) ctx.db.aiJob.id.delete(x.id);
  for (const x of [...ctx.db.mergeOffer.roomA.filter(roomId)]) ctx.db.mergeOffer.id.delete(x.id);
  for (const x of [...ctx.db.mergeOffer.roomB.filter(roomId)]) ctx.db.mergeOffer.id.delete(x.id);
  const plan = ctx.db.plan.roomId.find(roomId);
  if (plan) ctx.db.plan.id.delete(plan.id);
  ctx.db.room.id.delete(roomId);
}

