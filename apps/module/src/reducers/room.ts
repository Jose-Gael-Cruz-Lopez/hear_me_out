import { SenderError, t } from 'spacetimedb/server';
import spacetimedb from '../schema';
import {
  advance,
  checkEarly,
  enqueueJob,
  findMyPlayer,
  getRoom,
  isAdmin,
  playersIn,
  requireHost,
  requirePhase,
  setPhase,
  startGame as beginGame,
  type Ctx,
} from '../core';
import { deleteRoomData } from '../cleanup';
import { addPlayer, nextSeat } from '../players';
import { BOT_PRESETS } from '../logic/bots';
import { makeRoomCode, normalizeCode } from '../logic/codes';
import { groupName, isFirstName } from '../logic/match';
import { clampText } from '../logic/text';
import { MAX_PLAYERS } from '../logic/timing';

const CATEGORIES = ['food', 'activity', 'movie'];

export const createRoom = spacetimedb.reducer(
  { mode: t.string(), tzOffsetMin: t.i32(), fastMode: t.bool() },
  (ctx, { mode, tzOffsetMin, fastMode }) => {
    if (mode !== 'friends' && mode !== 'strangers') throw new SenderError('Unknown mode.');
    let code = makeRoomCode(n => ctx.random.integerInRange(0, n - 1));
    while (ctx.db.room.code.find(code)) code = makeRoomCode(n => ctx.random.integerInRange(0, n - 1));
    ctx.db.room.insert({
      id: 0n,
      code,
      mode,
      category: '',
      hostIdentity: ctx.sender,
      phase: 'lobby',
      phaseSeq: 0,
      phaseStartedAt: ctx.timestamp,
      phaseDeadline: undefined,
      locationLabel: '',
      lat: 0,
      lng: 0,
      hasGeo: false,
      tzOffsetMin: Math.max(-840, Math.min(840, tzOffsetMin)),
      isPublic: mode === 'strangers',
      vibeTags: [],
      aiStatus: '',
      scoutStatus: '',
      venueKey: '',
      currentPitchIdx: 0,
      winnerOptionId: 0n,
      tiebreakText: '',
      fastMode,
      createdAt: ctx.timestamp,
      groupName: groupName(n => ctx.random.integerInRange(0, n - 1)),
      targetStartMin: -1,
    });
  }
);

/** Category + location. Setting both starts the venue scout right away, so Apify runs during profiles. */
export const setRoomSetup = spacetimedb.reducer(
  { roomId: t.u64(), category: t.string(), locationLabel: t.string(), lat: t.f64(), lng: t.f64(), hasGeo: t.bool() },
  (ctx, { roomId, category, locationLabel, lat, lng, hasGeo }) => {
    const r = getRoom(ctx, roomId);
    requireHost(ctx, r);
    requirePhase(r, 'lobby', 'profiles');
    if (!CATEGORIES.includes(category)) throw new SenderError('Pick food, activity or movie.');
    const label = clampText(locationLabel, 120);
    if (!label && !hasGeo) throw new SenderError('Pick a location.');
    const changed = r.category !== category || r.locationLabel !== label || r.lat !== lat || r.lng !== lng;
    ctx.db.room.id.update({
      ...r,
      category,
      locationLabel: label,
      lat: hasGeo ? lat : 0,
      lng: hasGeo ? lng : 0,
      hasGeo,
      scoutStatus: changed || r.scoutStatus === '' ? 'running' : r.scoutStatus,
      venueKey: changed ? '' : r.venueKey,
      aiStatus: 'The Judge is scouting the neighborhood…',
    });
    if (changed || r.scoutStatus === '') {
      for (const j of [...ctx.db.aiJob.roomId.filter(roomId)]) {
        if (j.kind === 'scout' && j.status === 'queued') ctx.db.aiJob.id.delete(j.id);
      }
      enqueueJob(ctx, roomId, 'scout', 0n, { category, locationLabel: label, lat, lng, hasGeo });
    }
  }
);

export const joinRoom = spacetimedb.reducer({ code: t.string(), name: t.string(), avatar: t.string() }, (ctx, { code, name, avatar }) =>
  addPlayer(ctx, code, name, avatar, false)
);

/** Public meetups: 18+ confirmation and first names only. */
export const joinPublicRoom = spacetimedb.reducer(
  { code: t.string(), name: t.string(), avatar: t.string(), confirmed18: t.bool() },
  (ctx, { code, name, avatar, confirmed18 }) => {
    if (!confirmed18) throw new SenderError('Public meetups are 18+ only.');
    addPlayer(ctx, code, name, avatar, true);
  }
);

export const leaveRoom = spacetimedb.reducer({ roomId: t.u64() }, (ctx, { roomId }) => {
  const r = getRoom(ctx, roomId);
  const me = findMyPlayer(ctx, roomId);
  if (!me) return;
  if (r.phase === 'lobby') ctx.db.player.id.delete(me.id);
  else ctx.db.player.id.update({ ...me, connected: false });
});

export const addBot = spacetimedb.reducer({ roomId: t.u64() }, (ctx, { roomId }) => {
  const r = getRoom(ctx, roomId);
  requireHost(ctx, r);
  requirePhase(r, 'lobby', 'profiles');
  const players = playersIn(ctx, roomId);
  if (players.length >= MAX_PLAYERS) throw new SenderError('This room is full.');
  const preset = BOT_PRESETS.find(b => !players.some(p => p.name === b.name));
  if (!preset) throw new SenderError('Out of bots.');
  const bot = ctx.db.player.insert({
    id: 0n,
    // Bots belong to the module itself, never to the host, so the host's identity maps to no player.
    identity: ctx.identity,
    roomId,
    name: preset.name,
    avatar: preset.avatar,
    isBot: true,
    connected: true,
    ready: true,
    actedSeq: 0,
    seat: nextSeat(ctx, roomId),
    joinedAt: ctx.timestamp,
  });
  ctx.db.profilePublic.insert({
    playerId: bot.id,
    roomId,
    approvedTags: preset.tags,
    budgetMax: preset.budgetMax,
    dietary: preset.dietary,
    maxTravelMin: preset.maxTravelMin,
    availability: preset.availability,
  });
});

export const kickPlayer = spacetimedb.reducer({ roomId: t.u64(), playerId: t.u64() }, (ctx, { roomId, playerId }) => {
  const r = getRoom(ctx, roomId);
  requireHost(ctx, r);
  const p = ctx.db.player.id.find(playerId);
  if (!p || p.roomId !== roomId) return;
  ctx.db.player.id.delete(p.id);
  ctx.db.profilePublic.playerId.delete(p.id);
  ctx.db.profileDraft.playerId.delete(p.id);
  ctx.db.assignment.playerId.delete(p.id);
  ctx.db.prevote.playerId.delete(p.id);
  ctx.db.lean.playerId.delete(p.id);
  ctx.db.vote.playerId.delete(p.id);
  for (const w of [...ctx.db.warmup.roomId.filter(roomId)]) {
    if (w.playerId === p.id) ctx.db.warmup.id.delete(w.id);
  }
  // Once listening begins, playback indices must remain stable. Before that, removed players'
  // ready/transcribing pitches must not slip into the listening queue after quorum advances.
  if (r.phase === 'pitching') {
    for (const pitch of [...ctx.db.pitch.roomId.filter(roomId)]) {
      if (pitch.playerId === p.id) ctx.db.pitch.id.update({ ...pitch, status: 'skipped', rulingKind: 'none', rulingText: '' });
    }
  }
  checkEarly(ctx, roomId);
});

export const startGame = spacetimedb.reducer({ roomId: t.u64() }, (ctx, { roomId }) => {
  const r = getRoom(ctx, roomId);
  requireHost(ctx, r);
  requirePhase(r, 'lobby');
  if (playersIn(ctx, roomId).length < 2) throw new SenderError('You need at least 2 players (bots count).');
  if (!r.category || (!r.locationLabel && !r.hasGeo)) throw new SenderError('Pick a category and a location first.');
  beginGame(ctx, r);
});

/** Host skip: end the current phase now (during playback, skip to the next pitch). */
export const skipPhase = spacetimedb.reducer({ roomId: t.u64() }, (ctx, { roomId }) => {
  const r = getRoom(ctx, roomId);
  requireHost(ctx, r);
  if (r.phase === 'lobby' || r.phase === 'plan' || r.phase === 'ended') return;
  advance(ctx, r);
});

export const endRoom = spacetimedb.reducer({ roomId: t.u64() }, (ctx, { roomId }) => {
  const r = getRoom(ctx, roomId);
  requireHost(ctx, r);
  setPhase(ctx, r, 'ended', null);
});

export const deleteRoom = spacetimedb.reducer({ roomId: t.u64() }, (ctx, { roomId }) => {
  const r = getRoom(ctx, roomId);
  if (!isAdmin(ctx)) requireHost(ctx, r); // the admin can clean up server-owned (matched) rooms
  deleteRoomData(ctx, roomId);
});
