import { SenderError, t } from 'spacetimedb/server';
import spacetimedb, { prevote } from '../schema';
import {
  checkEarly,
  enqueueFactcheck,
  enqueueJob,
  findMyPlayer,
  getRoom,
  playableIn,
  requireMyPlayer,
  requirePhase,
} from '../core';
import { clampText } from '../logic/text';

export const answerWarmup = spacetimedb.reducer({ warmupId: t.u64(), answer: t.string() }, (ctx, { warmupId, answer }) => {
  const w = ctx.db.warmup.id.find(warmupId);
  if (!w) throw new SenderError('No such question.');
  const r = getRoom(ctx, w.roomId);
  requirePhase(r, 'warmup', 'scouting');
  const me = requireMyPlayer(ctx, w.roomId);
  if (me.id !== w.playerId) throw new SenderError('That is not your question.');
  if (answer !== 'a' && answer !== 'b') throw new SenderError('Pick a or b.');
  ctx.db.warmup.id.update({ ...w, answer });
  ctx.db.player.id.update({ ...me, actedSeq: r.phaseSeq });
  checkEarly(ctx, r.id);
});

function requireOption(ctx: Parameters<typeof getRoom>[0], roomId: bigint, optionId: bigint): void {
  const o = ctx.db.option.id.find(optionId);
  if (!o || o.roomId !== roomId) throw new SenderError('That is not one of the finalists.');
}

export const castPrevote = spacetimedb.reducer({ roomId: t.u64(), optionId: t.u64() }, (ctx, { roomId, optionId }) => {
  const r = getRoom(ctx, roomId);
  requirePhase(r, 'prevote');
  const me = requireMyPlayer(ctx, roomId);
  requireOption(ctx, roomId, optionId);
  const row = { playerId: me.id, roomId, optionId };
  if (ctx.db.prevote.playerId.find(me.id)) ctx.db.prevote.playerId.update(row);
  else ctx.db.prevote.insert(row);
  ctx.db.player.id.update({ ...me, actedSeq: r.phaseSeq });
  checkEarly(ctx, roomId);
});

/** Your own secret pre-vote. Nobody else can read it. */
export const myPrevote = spacetimedb.view({ name: 'my_prevote', public: true }, t.array(prevote.rowType), ctx => {
  const out = [];
  for (const p of ctx.db.player.identity.filter(ctx.sender)) {
    if (p.isBot) continue;
    const pv = ctx.db.prevote.playerId.find(p.id);
    if (pv) out.push(pv);
  }
  return out;
});

const MAX_AUDIO_BYTES = 1_500_000;

/** Store a recorded pitch in SpacetimeDB and queue transcription. One re-record is allowed. */
export const uploadPitchAudio = spacetimedb.reducer(
  { pitchId: t.u64(), mime: t.string(), bytes: t.array(t.u8()), durationMs: t.u32(), browserTranscript: t.string() },
  (ctx, { pitchId, mime, bytes, durationMs, browserTranscript }) => {
    const p = ctx.db.pitch.id.find(pitchId);
    if (!p) throw new SenderError('No such pitch.');
    const r = getRoom(ctx, p.roomId);
    requirePhase(r, 'pitching');
    const me = requireMyPlayer(ctx, p.roomId);
    if (me.id !== p.playerId) throw new SenderError('That is not your pitch.');
    if (p.recordings >= 2) throw new SenderError('You already used your re-record.');
    if (!mime.startsWith('audio/')) throw new SenderError('Audio only.');
    if (bytes.length === 0 || bytes.length > MAX_AUDIO_BYTES) throw new SenderError('Recording is empty or too large.');

    if (p.audioMediaId !== 0n) ctx.db.media.id.delete(p.audioMediaId);
    const m = ctx.db.media.insert({ id: 0n, roomId: p.roomId, kind: 'pitch_audio', mime, bytes, createdAt: ctx.timestamp });
    ctx.db.pitch.id.update({
      ...p,
      audioMediaId: m.id,
      audioMime: mime,
      durationMs: Math.min(durationMs, 35_000),
      recordings: p.recordings + 1,
      liveCaption: clampText(browserTranscript, 1200),
      transcript: '',
      transcriptSource: '',
      status: 'transcribing',
      rulingKind: 'pending',
      rulingText: '',
    });
    ctx.db.player.id.update({ ...me, actedSeq: r.phaseSeq });
    enqueueJob(ctx, p.roomId, 'transcribe', p.id, { mediaId: m.id });
  }
);

/** Typed pitch: the fallback when there is no mic or transcription failed. */
export const submitTypedPitch = spacetimedb.reducer({ pitchId: t.u64(), text: t.string() }, (ctx, { pitchId, text }) => {
  const p = ctx.db.pitch.id.find(pitchId);
  if (!p) throw new SenderError('No such pitch.');
  const r = getRoom(ctx, p.roomId);
  requirePhase(r, 'pitching', 'playback');
  const me = requireMyPlayer(ctx, p.roomId);
  if (me.id !== p.playerId) throw new SenderError('That is not your pitch.');
  const clean = clampText(text, 800);
  if (clean.length < 3) throw new SenderError('Say a little more!');
  if (r.phase === 'playback' && p.status !== 'needs_text') throw new SenderError('Pitches are locked.');
  const ready = { ...p, transcript: clean, transcriptSource: 'typed', status: 'ready', rulingKind: 'pending', rulingText: '' };
  ctx.db.pitch.id.update(ready);
  ctx.db.player.id.update({ ...me, actedSeq: r.phaseSeq });
  enqueueFactcheck(ctx, ready);
  checkEarly(ctx, r.id);
});

const EMOJIS = ['😂', '🔥', '🧑‍⚖️', '🍜', '👏', '😱', '💯', '🤔'];

export const react = spacetimedb.reducer({ pitchId: t.u64(), emoji: t.string() }, (ctx, { pitchId, emoji }) => {
  const p = ctx.db.pitch.id.find(pitchId);
  if (!p) return;
  if (!EMOJIS.includes(emoji)) throw new SenderError('Unknown reaction.');
  const me = requireMyPlayer(ctx, p.roomId);
  ctx.db.reaction.insert({ roomId: p.roomId, pitchId, playerId: me.id, emoji });
});

/** One OBJECTION! per player per pitch, and not on your own pitch. */
export const raiseObjection = spacetimedb.reducer({ pitchId: t.u64() }, (ctx, { pitchId }) => {
  const p = ctx.db.pitch.id.find(pitchId);
  if (!p) return;
  const r = getRoom(ctx, p.roomId);
  requirePhase(r, 'playback');
  const current = playableIn(ctx, r.id)[r.currentPitchIdx];
  if (!current || current.id !== pitchId) throw new SenderError('You can only object to the pitch on screen.');
  const me = requireMyPlayer(ctx, p.roomId);
  if (me.id === p.playerId) throw new SenderError('You cannot object to yourself.');
  for (const o of ctx.db.objection.roomId.filter(r.id)) {
    if (o.pitchId === pitchId && o.playerId === me.id) throw new SenderError('You already objected.');
  }
  ctx.db.objection.insert({ id: 0n, roomId: r.id, pitchId, playerId: me.id });
  ctx.db.reaction.insert({ roomId: r.id, pitchId, playerId: me.id, emoji: 'OBJECTION' });
});

export const castVote = spacetimedb.reducer({ roomId: t.u64(), optionId: t.u64() }, (ctx, { roomId, optionId }) => {
  const r = getRoom(ctx, roomId);
  requirePhase(r, 'vote');
  const me = requireMyPlayer(ctx, roomId);
  requireOption(ctx, roomId, optionId);
  const row = { playerId: me.id, roomId, optionId };
  if (ctx.db.vote.playerId.find(me.id)) ctx.db.vote.playerId.update(row);
  else ctx.db.vote.insert(row);
  ctx.db.player.id.update({ ...me, actedSeq: r.phaseSeq });
  checkEarly(ctx, roomId);
});

export const setRsvp = spacetimedb.reducer({ planId: t.u64(), status: t.string() }, (ctx, { planId, status }) => {
  const plan = ctx.db.plan.id.find(planId);
  if (!plan) throw new SenderError('No such plan.');
  if (!['yes', 'maybe', 'no'].includes(status)) throw new SenderError('RSVP yes, maybe or no.');
  const me = findMyPlayer(ctx, plan.roomId);
  if (!me) throw new SenderError('You are not in this room.');
  const row = { playerId: me.id, planId, roomId: plan.roomId, status };
  if (ctx.db.rsvp.playerId.find(me.id)) ctx.db.rsvp.playerId.update(row);
  else ctx.db.rsvp.insert(row);
  // Public meetups only count as confirmed once at least 3 people say yes.
  const yes = [...ctx.db.rsvp.planId.filter(planId)].filter(x => x.status === 'yes').length;
  const confirmed = yes >= 3;
  const fresh = ctx.db.plan.id.find(planId);
  if (fresh && fresh.meetupConfirmed !== confirmed) ctx.db.plan.id.update({ ...fresh, meetupConfirmed: confirmed });
});
