import { SenderError } from 'spacetimedb/server';
import { findMyPlayer, playersIn, type Ctx } from './core';
import { normalizeCode } from './logic/codes';
import { isFirstName } from './logic/match';
import { clampText, uniqueName } from './logic/text';
import { MAX_PLAYERS } from './logic/timing';

export function nextSeat(ctx: Ctx, roomId: bigint): number {
  const seats = playersIn(ctx, roomId).map(p => p.seat);
  return seats.length === 0 ? 0 : Math.max(...seats) + 1;
}

/** Join (or rejoin) a room by code. Public meetups and matchmaking queues use first names only. */
export function addPlayer(ctx: Ctx, code: string, name: string, avatar: string, publicJoin: boolean): void {
  const r = ctx.db.room.code.find(normalizeCode(code));
  if (!r) throw new SenderError('No room with that code.');
  if ((r.mode === 'strangers' || r.mode === 'queue') && !publicJoin) throw new SenderError('This is a public meetup: confirm you are 18+ to join.');
  const cleanName = clampText(name, 20);
  if (!cleanName) throw new SenderError('Pick a name.');
  if (r.mode !== 'friends' && !isFirstName(cleanName)) throw new SenderError('Public meetups use first names only (one word).');
  const cleanAvatar = clampText(avatar, 8) || '🙂';

  const existing = findMyPlayer(ctx, r.id);
  if (existing) {
    ctx.db.player.id.update({ ...existing, name: cleanName, avatar: cleanAvatar, connected: true });
    return;
  }
  const players = playersIn(ctx, r.id);
  // Friends games: a player whose window closed rejoins under the same name from a new window and
  // keeps their seat. Not in public meetups, where a stranger could take over someone's seat.
  const sameName = players.find(p => !p.isBot && !p.connected && p.name.toLowerCase() === cleanName.toLowerCase());
  if (r.mode === 'friends' && sameName) {
    ctx.db.player.id.update({ ...sameName, identity: ctx.sender, avatar: cleanAvatar, connected: true });
    const draft = ctx.db.profileDraft.playerId.find(sameName.id);
    if (draft) ctx.db.profileDraft.playerId.update({ ...draft, identity: ctx.sender });
    return;
  }
  if (r.phase !== 'lobby' && r.phase !== 'profiles') throw new SenderError('This game already started.');
  // The matchmaking queue is one shared waiting room per category: no size cap, and names only have
  // to differ inside a game (tryMatch renames clashes).
  if (r.mode !== 'queue' && players.length >= MAX_PLAYERS) throw new SenderError('This room is full.');
  ctx.db.player.insert({
    id: 0n,
    identity: ctx.sender,
    roomId: r.id,
    name: r.mode === 'queue' ? cleanName : uniqueName(cleanName, players.map(p => p.name)),
    avatar: cleanAvatar,
    isBot: false,
    connected: true,
    ready: false,
    actedSeq: 0,
    seat: nextSeat(ctx, r.id),
    joinedAt: ctx.timestamp,
  });
}
