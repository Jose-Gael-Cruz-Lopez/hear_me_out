import { SenderError, t } from 'spacetimedb/server';
import spacetimedb, { profileDraft, SocialLink, TimeWindow } from '../schema';
import { checkEarly, enqueueJob, getRoom, requireMyPlayer, requirePhase } from '../core';
import { clampText, sanitizeDiets, sanitizeTags } from '../logic/text';
import { scheduleQueueCheck } from '../queue';

const PLATFORMS = ['instagram', 'tiktok', 'facebook'];

/**
 * Save a player's basics (shared with the group) and their private "Bring your Muse" inputs,
 * then queue AI distillation into draft tags. Nothing private is visible to other players.
 */
export const submitProfile = spacetimedb.reducer(
  {
    roomId: t.u64(),
    budgetMax: t.u8(),
    dietary: t.array(t.string()),
    maxTravelMin: t.u16(),
    availability: t.array(TimeWindow),
    vibeChips: t.array(t.string()),
    pastedContext: t.string(),
    socialLinks: t.array(SocialLink),
    consent: t.bool(),
  },
  (ctx, args) => {
    const r = getRoom(ctx, args.roomId);
    requirePhase(r, 'lobby', 'profiles');
    const me = requireMyPlayer(ctx, r.id);

    const budgetMax = Math.max(1, Math.min(4, args.budgetMax));
    const maxTravelMin = Math.max(5, Math.min(120, args.maxTravelMin));
    const dietary = sanitizeDiets(args.dietary);
    const availability = args.availability
      .filter(w => w.endMin > w.startMin && w.startMin >= 0 && w.endMin <= 2 * 1440)
      .slice(0, 8);
    const vibeChips = args.vibeChips.map(c => clampText(c, 32)).filter(Boolean).slice(0, 12);
    const pastedContext = clampText(args.pastedContext, 2000);
    if (args.socialLinks.length > 0 && !args.consent) {
      throw new SenderError('Please confirm the account is yours and you consent before linking it.');
    }
    const socialLinks = args.socialLinks
      .filter(l => PLATFORMS.includes(l.platform))
      .map(l => ({ platform: l.platform, handle: clampText(l.handle.replace(/^@/, ''), 60) }))
      .filter(l => l.handle)
      .slice(0, 3);

    const existingPublic = ctx.db.profilePublic.playerId.find(me.id);
    const publicRow = {
      playerId: me.id,
      roomId: r.id,
      approvedTags: existingPublic?.approvedTags ?? [],
      budgetMax,
      dietary,
      maxTravelMin,
      availability,
    };
    if (existingPublic) ctx.db.profilePublic.playerId.update(publicRow);
    else ctx.db.profilePublic.insert(publicRow);

    const draftRow = {
      playerId: me.id,
      identity: ctx.sender,
      roomId: r.id,
      vibeChips,
      pastedContext,
      socialLinks,
      consent: args.consent,
      draftTags: [],
      status: 'distilling',
      note: '',
    };
    if (ctx.db.profileDraft.playerId.find(me.id)) ctx.db.profileDraft.playerId.update(draftRow);
    else ctx.db.profileDraft.insert(draftRow);

    // The job payload carries the private inputs; ai_job is only visible to the orchestrator.
    enqueueJob(ctx, r.id, 'distill_profile', me.id, {
      playerName: me.name,
      budgetMax,
      dietary,
      maxTravelMin,
      availability,
      vibeChips,
      pastedContext,
      socialLinks,
    });
  }
);

/** The player approves (and may have edited) their tags. Only now do tags become visible to others. */
export const approveTags = spacetimedb.reducer({ roomId: t.u64(), tags: t.array(t.string()) }, (ctx, { roomId, tags }) => {
  const r = getRoom(ctx, roomId);
  requirePhase(r, 'lobby', 'profiles');
  const me = requireMyPlayer(ctx, roomId);
  const approved = sanitizeTags(tags, 8);
  const pub = ctx.db.profilePublic.playerId.find(me.id);
  if (!pub) throw new SenderError('Fill in the basics first.');
  ctx.db.profilePublic.playerId.update({ ...pub, approvedTags: approved });
  const draft = ctx.db.profileDraft.playerId.find(me.id);
  if (draft) ctx.db.profileDraft.playerId.update({ ...draft, status: 'approved' });
  ctx.db.player.id.update({ ...me, ready: true, actedSeq: r.phaseSeq });
  if (r.mode === 'queue') scheduleQueueCheck(ctx, r);
  else checkEarly(ctx, roomId);
});

/** A player's own private draft (inputs + unapproved tags). Other players never see these rows. */
export const myProfileDraft = spacetimedb.view(
  { name: 'my_profile_draft', public: true },
  t.array(profileDraft.rowType),
  ctx => [...ctx.db.profileDraft.identity.filter(ctx.sender)]
);
