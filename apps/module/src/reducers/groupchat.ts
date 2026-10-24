import { SenderError, t, type InferSchema, type ReadonlyDbView } from 'spacetimedb/server';
import type { Identity } from 'spacetimedb';
import spacetimedb from '../schema';
import { getRoom } from '../core';
import { groupIntro, isWhatsAppInvite, normalizeInvite, shareText, suggestedGroupName, waShareUrl, type MeetupFacts } from '../logic/whatsapp';

// WhatsApp group for the people going. Someone who RSVP'd yes creates the group in WhatsApp, taps
// "Invite via link" and pastes it with set_group_chat_link. Only people going see it (my_group_chat).
// Public/stranger meetups unlock it once the meetup is confirmed (3 yes RSVPs), like the exact address.

type ReadDb = ReadonlyDbView<InferSchema<typeof spacetimedb>>;
type RoomRow = NonNullable<ReturnType<ReadDb['room']['id']['find']>>;

function myPlayerIn(db: ReadDb, roomId: bigint, who: Identity) {
  for (const p of db.player.identity.filter(who)) if (p.roomId === roomId && !p.isBot) return p;
  return undefined;
}

function isGoing(db: ReadDb, roomId: bigint, who: Identity): boolean {
  const p = myPlayerIn(db, roomId, who);
  return !!p && db.rsvp.playerId.find(p.id)?.status === 'yes';
}

/** May this identity paste or change the room's link? */
function canSetLink(db: ReadDb, r: RoomRow, who: Identity): boolean {
  if (r.phase !== 'plan') return false;
  const plan = db.plan.roomId.find(r.id);
  if (!plan) return false;
  const isHost = r.hostIdentity.equals(who);
  if (!isHost && !isGoing(db, r.id, who)) return false;
  if (r.mode === 'strangers' && !plan.meetupConfirmed) return false;
  const existing = db.groupChat.roomId.find(r.id);
  // Once set, only whoever set it (or the host) can replace it, so one attendee can't hijack the group.
  return !existing || isHost || existing.setByIdentity.equals(who);
}

function meetupFacts(db: ReadDb, r: RoomRow): MeetupFacts | undefined {
  const plan = db.plan.roomId.find(r.id);
  const option = plan && db.option.id.find(plan.optionId);
  if (!plan || !option) return undefined;
  const roomIds = plan.mergedWithRoomId ? [r.id, plan.mergedWithRoomId] : [r.id];
  const going = roomIds.flatMap(id =>
    [...db.player.roomId.filter(id)].filter(p => !p.isBot && db.rsvp.playerId.find(p.id)?.status === 'yes').map(p => p.name)
  );
  return {
    groupName: r.groupName,
    venueTitle: option.title,
    address: option.address,
    mapsUrl: option.mapsUrl,
    slotLabel: plan.slotLabel,
    going,
    icebreakers: plan.icebreakers,
  };
}

export const setGroupChatLink = spacetimedb.reducer({ roomId: t.u64(), url: t.string() }, (ctx, { roomId, url }) => {
  const r = getRoom(ctx, roomId);
  if (r.phase !== 'plan' || !ctx.db.plan.roomId.find(r.id)) throw new SenderError('Add a group chat once there is a plan.');
  const isHost = r.hostIdentity.equals(ctx.sender);
  if (!isHost && !isGoing(ctx.db, r.id, ctx.sender)) throw new SenderError("RSVP yes to add the group chat.");
  if (r.mode === 'strangers' && !ctx.db.plan.roomId.find(r.id)!.meetupConfirmed) {
    throw new SenderError('The group chat unlocks once 3 people are going.');
  }
  if (!canSetLink(ctx.db, r, ctx.sender)) throw new SenderError('Someone already added the group chat.');
  const link = normalizeInvite(url);
  if (!link) {
    ctx.db.groupChat.roomId.delete(r.id);
    return;
  }
  if (!isWhatsAppInvite(link)) throw new SenderError('Paste a WhatsApp group invite link (https://chat.whatsapp.com/…).');
  const row = { roomId: r.id, inviteUrl: link, setByIdentity: ctx.sender, updatedAt: ctx.timestamp };
  if (ctx.db.groupChat.roomId.find(r.id)) ctx.db.groupChat.roomId.update(row);
  else ctx.db.groupChat.insert(row);
});

const GroupChatInfo = t.row('GroupChatInfo', {
  roomId: t.u64().primaryKey(),
  /** '' until someone going pastes the invite. */
  inviteUrl: t.string(),
  /** Generated: what to name the group in WhatsApp. */
  suggestedName: t.string(),
  /** Generated: the first message to post in the group. */
  intro: t.string(),
  /** Generated: wa.me link sharing the plan + invite ('' until there is an invite). */
  shareUrl: t.string(),
  canEdit: t.bool(),
});

/**
 * The group chat for each meetup you're going to (RSVP yes), or host. Tables that merged share each
 * other's chat. Nobody else gets a row, so the invite never reaches people who aren't coming.
 */
export const myGroupChat = spacetimedb.view({ name: 'my_group_chat', public: true }, t.array(GroupChatInfo), ctx => {
  const rooms = new Map<bigint, RoomRow>();
  const consider = (r: RoomRow | null | undefined) => {
    if (!r || r.phase !== 'plan' || !ctx.db.plan.roomId.find(r.id)) return;
    if (r.mode === 'strangers' && !ctx.db.plan.roomId.find(r.id)!.meetupConfirmed) return;
    rooms.set(r.id, r);
  };
  for (const p of ctx.db.player.identity.filter(ctx.sender)) {
    if (p.isBot || ctx.db.rsvp.playerId.find(p.id)?.status !== 'yes') continue;
    const r = ctx.db.room.id.find(p.roomId);
    consider(r);
    const merged = ctx.db.plan.roomId.find(p.roomId)?.mergedWithRoomId;
    if (merged) consider(ctx.db.room.id.find(merged));
  }
  for (const g of ctx.db.groupChat.iter()) {
    const r = ctx.db.room.id.find(g.roomId);
    if (r?.hostIdentity.equals(ctx.sender)) consider(r);
  }
  const out = [];
  for (const r of rooms.values()) {
    const facts = meetupFacts(ctx.db, r);
    if (!facts) continue;
    const inviteUrl = ctx.db.groupChat.roomId.find(r.id)?.inviteUrl ?? '';
    out.push({
      roomId: r.id,
      inviteUrl,
      suggestedName: suggestedGroupName(facts),
      intro: groupIntro(facts),
      shareUrl: inviteUrl ? waShareUrl(shareText(facts, inviteUrl)) : '',
      canEdit: canSetLink(ctx.db, r, ctx.sender),
    });
  }
  return out;
});
