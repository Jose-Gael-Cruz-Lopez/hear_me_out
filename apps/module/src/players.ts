import { SenderError } from 'spacetimedb/server';
import { findMyPlayer, playersIn, type Ctx } from './core';
import { normalizeCode } from './logic/codes';
import { isFirstName } from './logic/match';
import { clampText } from './logic/text';
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
  if (r.phase !== 'lobby' && r.phase !== 'profiles') throw new SenderError('This game already started.');
  const players = playersIn(ctx, r.id);
  if (players.length >= MAX_PLAYERS) throw new SenderError('This room is full.');
  if (players.some(p => p.name.toLowerCase() === cleanName.toLowerCase())) throw new SenderError('Someone already has that name.');
  ctx.db.player.insert({
    id: 0n,
    identity: ctx.sender,
    roomId: r.id,
    name: cleanName,
    avatar: cleanAvatar,
    isBot: false,
    connected: true,
    ready: false,
    actedSeq: 0,
    seat: nextSeat(ctx, r.id),
    joinedAt: ctx.timestamp,
  });
}
