// Pitch Fight — SpacetimeDB module.
// SpacetimeDB is the live game board: every phone and the big screen subscribe
// to these tables, and every rule of the game is enforced here in reducers.
// The AI host (Next.js API routes) never writes here directly; the host's
// big-screen client calls host-only reducers with the AI results.
import { schema, table, t, SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import type { Identity } from 'spacetimedb';

const PHASES = ['LOBBY', 'PROFILE', 'OPTIONS', 'PITCH', 'SHOWTIME', 'VOTE', 'RESULT', 'PLAN'] as const;
type Phase = (typeof PHASES)[number];

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;
const BUDGETS = [1, 2, 3];
const DIETS = ['any', 'vegetarian', 'vegan', 'halal', 'gluten-free'];
const DISTANCES = ['walk', 'short-ride', 'anywhere'];
const FREE_SLOTS = ['now', 'tonight', 'tomorrow-lunch', 'tomorrow-night', 'weekend'];
const RSVP = ['in', 'maybe', 'out'];
const PROFILE_FIELDS = ['budget', 'diet', 'distance', 'freeWhen', 'vibe'];

const lobby = table(
  { name: 'lobby', public: true },
  {
    code: t.string().primaryKey(),
    host: t.identity(),
    phase: t.string(),
    createdAt: t.timestamp(),
    locationLabel: t.string(),
    lat: t.f64(),
    lng: t.f64(),
    // Which option (by slot) is on stage during SHOWTIME.
    showtimeIndex: t.u32(),
    winnerOptionId: t.u64(),
    tieBreak: t.bool(),
    // Free-form line the host screen shows (e.g. which filters had to be relaxed).
    notice: t.string(),
  }
);

const player = table(
  { name: 'player', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    lobbyCode: t.string().index('btree'),
    identity: t.identity(),
    name: t.string(),
    joinedAt: t.timestamp(),
    connected: t.bool(),
  }
);

const profile = table(
  { name: 'profile', public: true },
  {
    playerId: t.u64().primaryKey(),
    lobbyCode: t.string().index('btree'),
    budget: t.u8(),
    diet: t.string(),
    distance: t.string(),
    freeWhen: t.array(t.string()),
    vibe: t.string(),
    // Fields the player chose NOT to show the group (still used for filtering).
    hidden: t.array(t.string()),
  }
);

const option = table(
  { name: 'option', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    lobbyCode: t.string().index('btree'),
    slot: t.u32(),
    name: t.string(),
    category: t.string(),
    address: t.string(),
    priceLevel: t.u8(),
    rating: t.f64(),
    distanceM: t.u32(),
    mapsUrl: t.string(),
    blurb: t.string(),
    posterUrl: t.string(),
    // The AI host's own pitch, used when nobody was assigned to defend this option.
    hostLine: t.string(),
  }
);

const assignment = table(
  { name: 'assignment', public: true },
  {
    playerId: t.u64().primaryKey(),
    lobbyCode: t.string().index('btree'),
    optionId: t.u64(),
    prompt: t.string(),
    order: t.u32(),
  }
);

const pitch = table(
  { name: 'pitch', public: true },
  {
    playerId: t.u64().primaryKey(),
    lobbyCode: t.string().index('btree'),
    optionId: t.u64(),
    text: t.string(),
    mode: t.string(),
    reaction: t.string(),
    submittedAt: t.timestamp(),
  }
);

const vote = table(
  { name: 'vote', public: true },
  {
    voterId: t.u64().primaryKey(),
    lobbyCode: t.string().index('btree'),
    optionId: t.u64(),
  }
);

const plan = table(
  { name: 'plan', public: true },
  {
    lobbyCode: t.string().primaryKey(),
    optionId: t.u64(),
    whenLabel: t.string(),
    startIso: t.string(),
    durationMin: t.u32(),
    blurb: t.string(),
  }
);

const rsvp = table(
  { name: 'rsvp', public: true },
  {
    playerId: t.u64().primaryKey(),
    lobbyCode: t.string().index('btree'),
    status: t.string(),
  }
);

const OptionInput = t.object('OptionInput', {
  name: t.string(),
  category: t.string(),
  address: t.string(),
  priceLevel: t.u8(),
  rating: t.f64(),
  distanceM: t.u32(),
  mapsUrl: t.string(),
  blurb: t.string(),
});

const AssignmentInput = t.object('AssignmentInput', {
  playerId: t.u64(),
  // Index into the options array passed in the same call (ids don't exist yet).
  optionIndex: t.u32(),
  prompt: t.string(),
});

const spacetimedb = schema({ lobby, player, profile, option, assignment, pitch, vote, plan, rsvp });
export default spacetimedb;

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

function clean(s: string, max: number) {
  return s.replace(/\s+/g, ' ').trim().slice(0, max);
}

function getLobby(ctx: Ctx, code: string) {
  const l = ctx.db.lobby.code.find(code.toUpperCase());
  if (!l) throw new SenderError(`No game with code ${code}`);
  return l;
}

function requireHost(ctx: Ctx, code: string) {
  const l = getLobby(ctx, code);
  if (!l.host.isEqual(ctx.sender)) throw new SenderError('Only the host can do that');
  return l;
}

function requirePhase(l: { phase: string }, ...phases: Phase[]) {
  if (!phases.includes(l.phase as Phase)) {
    throw new SenderError(`Not allowed during ${l.phase} (needs ${phases.join(' or ')})`);
  }
}

function findPlayer(ctx: Ctx, code: string, who: Identity) {
  return playersOf(ctx, code).find(p => p.identity.isEqual(who));
}

function requirePlayer(ctx: Ctx, code: string) {
  const p = findPlayer(ctx, code, ctx.sender);
  if (!p) throw new SenderError('Join the game first');
  return p;
}

function playersOf(ctx: Ctx, code: string) {
  return [...ctx.db.player.lobbyCode.filter(code)];
}

function setPhase(ctx: Ctx, code: string, phase: Phase, patch: Partial<{ showtimeIndex: number; winnerOptionId: bigint; tieBreak: boolean; notice: string }> = {}) {
  const l = getLobby(ctx, code);
  ctx.db.lobby.code.update({ ...l, ...patch, phase });
}

function clearRound(ctx: Ctx, code: string) {
  for (const r of [...ctx.db.option.lobbyCode.filter(code)]) ctx.db.option.id.delete(r.id);
  for (const r of [...ctx.db.assignment.lobbyCode.filter(code)]) ctx.db.assignment.playerId.delete(r.playerId);
  for (const r of [...ctx.db.pitch.lobbyCode.filter(code)]) ctx.db.pitch.playerId.delete(r.playerId);
  for (const r of [...ctx.db.vote.lobbyCode.filter(code)]) ctx.db.vote.voterId.delete(r.voterId);
  for (const r of [...ctx.db.rsvp.lobbyCode.filter(code)]) ctx.db.rsvp.playerId.delete(r.playerId);
  ctx.db.plan.lobbyCode.delete(code);
}

export const onDisconnect = spacetimedb.clientDisconnected(ctx => {
  for (const p of [...ctx.db.player.iter()]) {
    if (p.identity.isEqual(ctx.sender) && p.connected) ctx.db.player.id.update({ ...p, connected: false });
  }
});

export const onConnect = spacetimedb.clientConnected(ctx => {
  for (const p of [...ctx.db.player.iter()]) {
    if (p.identity.isEqual(ctx.sender) && !p.connected) ctx.db.player.id.update({ ...p, connected: true });
  }
});

// ---------- LOBBY ----------

export const createLobby = spacetimedb.reducer(
  { code: t.string(), locationLabel: t.string(), lat: t.f64(), lng: t.f64() },
  (ctx, { code, locationLabel, lat, lng }) => {
    const c = code.toUpperCase();
    if (!/^[A-Z]{4}$/.test(c)) throw new SenderError('Room code must be 4 letters');
    if (ctx.db.lobby.code.find(c)) throw new SenderError('Room code taken');
    ctx.db.lobby.insert({
      code: c,
      host: ctx.sender,
      phase: 'LOBBY',
      createdAt: ctx.timestamp,
      locationLabel: clean(locationLabel, 80),
      lat,
      lng,
      showtimeIndex: 0,
      winnerOptionId: 0n,
      tieBreak: false,
      notice: '',
    });
  }
);

export const joinLobby = spacetimedb.reducer({ code: t.string(), name: t.string() }, (ctx, { code, name }) => {
  const l = getLobby(ctx, code);
  const n = clean(name, 20);
  if (!n) throw new SenderError('Pick a name');
  const existing = findPlayer(ctx, l.code, ctx.sender);
  const others = playersOf(ctx, l.code).filter(p => !existing || p.id !== existing.id);
  if (others.some(p => p.name.toLowerCase() === n.toLowerCase())) throw new SenderError('Someone already has that name');
  if (existing) {
    ctx.db.player.id.update({ ...existing, name: n, connected: true });
    return;
  }
  requirePhase(l, 'LOBBY', 'PROFILE');
  if (others.length >= MAX_PLAYERS) throw new SenderError('Game is full');
  ctx.db.player.insert({ id: 0n, lobbyCode: l.code, identity: ctx.sender, name: n, joinedAt: ctx.timestamp, connected: true });
});

export const startProfiles = spacetimedb.reducer({ code: t.string() }, (ctx, { code }) => {
  const l = requireHost(ctx, code);
  requirePhase(l, 'LOBBY');
  if (playersOf(ctx, l.code).length < MIN_PLAYERS) throw new SenderError(`Need at least ${MIN_PLAYERS} players`);
  setPhase(ctx, l.code, 'PROFILE');
});

// ---------- PROFILE ----------

export const submitProfile = spacetimedb.reducer(
  {
    code: t.string(),
    budget: t.u8(),
    diet: t.string(),
    distance: t.string(),
    freeWhen: t.array(t.string()),
    vibe: t.string(),
    hidden: t.array(t.string()),
  },
  (ctx, { code, budget, diet, distance, freeWhen, vibe, hidden }) => {
    const l = getLobby(ctx, code);
    requirePhase(l, 'LOBBY', 'PROFILE');
    const p = requirePlayer(ctx, l.code);
    if (!BUDGETS.includes(budget)) throw new SenderError('Bad budget');
    if (!DIETS.includes(diet)) throw new SenderError('Bad diet');
    if (!DISTANCES.includes(distance)) throw new SenderError('Bad distance');
    const free = [...new Set(freeWhen)].filter(f => FREE_SLOTS.includes(f));
    if (free.length === 0) throw new SenderError('Pick at least one time you are free');
    const row = {
      playerId: p.id,
      lobbyCode: l.code,
      budget,
      diet,
      distance,
      freeWhen: free,
      vibe: clean(vibe, 30),
      hidden: [...new Set(hidden)].filter(h => PROFILE_FIELDS.includes(h)),
    };
    if (ctx.db.profile.playerId.find(p.id)) ctx.db.profile.playerId.update(row);
    else ctx.db.profile.insert(row);
  }
);

// ---------- OPTIONS (AI results written by the host screen) ----------

export const setOptions = spacetimedb.reducer(
  { code: t.string(), options: t.array(OptionInput), assignments: t.array(AssignmentInput), notice: t.string() },
  (ctx, { code, options, assignments, notice }) => {
    const l = requireHost(ctx, code);
    requirePhase(l, 'PROFILE');
    if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) {
      throw new SenderError(`Need ${MIN_OPTIONS}-${MAX_OPTIONS} options`);
    }
    const players = playersOf(ctx, l.code);
    const playerIds = new Set(players.map(p => p.id));
    const assigned = new Set<bigint>();
    for (const a of assignments) {
      if (!playerIds.has(a.playerId)) throw new SenderError('Assignment for unknown player');
      if (assigned.has(a.playerId)) throw new SenderError('Player assigned twice');
      if (a.optionIndex >= options.length) throw new SenderError('Assignment to unknown option');
      assigned.add(a.playerId);
    }
    if (assigned.size !== playerIds.size) throw new SenderError('Every player needs an option to defend');

    clearRound(ctx, l.code);
    const ids = options.map(
      (o, slot) =>
        ctx.db.option.insert({
          id: 0n,
          lobbyCode: l.code,
          slot,
          name: clean(o.name, 80),
          category: clean(o.category, 40),
          address: clean(o.address, 120),
          priceLevel: Math.min(Math.max(o.priceLevel, 1), 4),
          rating: o.rating,
          distanceM: o.distanceM,
          mapsUrl: o.mapsUrl.slice(0, 500),
          blurb: clean(o.blurb, 200),
          posterUrl: '',
          hostLine: '',
        }).id
    );
    assignments.forEach((a, order) =>
      ctx.db.assignment.insert({
        playerId: a.playerId,
        lobbyCode: l.code,
        optionId: ids[a.optionIndex]!,
        prompt: clean(a.prompt, 200),
        order,
      })
    );
    setPhase(ctx, l.code, 'OPTIONS', { notice: clean(notice, 200), showtimeIndex: 0, winnerOptionId: 0n, tieBreak: false });
  }
);

export const setPoster = spacetimedb.reducer({ optionId: t.u64(), posterUrl: t.string() }, (ctx, { optionId, posterUrl }) => {
  const o = ctx.db.option.id.find(optionId);
  if (!o) throw new SenderError('No such option');
  requireHost(ctx, o.lobbyCode);
  if (posterUrl.length > 2000) throw new SenderError('Poster URL too long');
  ctx.db.option.id.update({ ...o, posterUrl });
});

export const setHostLine = spacetimedb.reducer({ optionId: t.u64(), line: t.string() }, (ctx, { optionId, line }) => {
  const o = ctx.db.option.id.find(optionId);
  if (!o) throw new SenderError('No such option');
  requireHost(ctx, o.lobbyCode);
  ctx.db.option.id.update({ ...o, hostLine: clean(line, 400) });
});

export const startPitching = spacetimedb.reducer({ code: t.string() }, (ctx, { code }) => {
  const l = requireHost(ctx, code);
  requirePhase(l, 'OPTIONS');
  setPhase(ctx, l.code, 'PITCH');
});

// ---------- PITCH ----------

export const submitPitch = spacetimedb.reducer(
  { code: t.string(), text: t.string(), mode: t.string() },
  (ctx, { code, text, mode }) => {
    const l = getLobby(ctx, code);
    requirePhase(l, 'PITCH');
    const p = requirePlayer(ctx, l.code);
    const a = ctx.db.assignment.playerId.find(p.id);
    if (!a) throw new SenderError('You have nothing to defend');
    const body = text.trim().slice(0, 800);
    if (!body) throw new SenderError('Say something!');
    if (mode !== 'voice' && mode !== 'text') throw new SenderError('Bad pitch mode');
    const row = { playerId: p.id, lobbyCode: l.code, optionId: a.optionId, text: body, mode, reaction: '', submittedAt: ctx.timestamp };
    if (ctx.db.pitch.playerId.find(p.id)) ctx.db.pitch.playerId.update(row);
    else ctx.db.pitch.insert(row);
  }
);

// ---------- SHOWTIME ----------

export const startShowtime = spacetimedb.reducer({ code: t.string() }, (ctx, { code }) => {
  const l = requireHost(ctx, code);
  requirePhase(l, 'PITCH');
  setPhase(ctx, l.code, 'SHOWTIME', { showtimeIndex: 0 });
});

export const setReaction = spacetimedb.reducer(
  { code: t.string(), playerId: t.u64(), reaction: t.string() },
  (ctx, { code, playerId, reaction }) => {
    const l = requireHost(ctx, code);
    requirePhase(l, 'SHOWTIME', 'VOTE');
    const pt = ctx.db.pitch.playerId.find(playerId);
    if (!pt || pt.lobbyCode !== l.code) throw new SenderError('No such pitch');
    ctx.db.pitch.playerId.update({ ...pt, reaction: clean(reaction, 280) });
  }
);

export const nextPitch = spacetimedb.reducer({ code: t.string(), delta: t.i32() }, (ctx, { code, delta }) => {
  const l = requireHost(ctx, code);
  requirePhase(l, 'SHOWTIME');
  const count = [...ctx.db.option.lobbyCode.filter(l.code)].length;
  // showtimeIndex === count means "that's everyone" (the curtain-call screen).
  const next = Math.min(Math.max(l.showtimeIndex + delta, 0), count);
  ctx.db.lobby.code.update({ ...l, showtimeIndex: next });
});

export const startVoting = spacetimedb.reducer({ code: t.string() }, (ctx, { code }) => {
  const l = requireHost(ctx, code);
  requirePhase(l, 'SHOWTIME');
  setPhase(ctx, l.code, 'VOTE');
});

// ---------- VOTE ----------

export const castVote = spacetimedb.reducer({ code: t.string(), optionId: t.u64() }, (ctx, { code, optionId }) => {
  const l = getLobby(ctx, code);
  requirePhase(l, 'VOTE');
  const p = requirePlayer(ctx, l.code);
  const o = ctx.db.option.id.find(optionId);
  if (!o || o.lobbyCode !== l.code) throw new SenderError('Not an option in this game');
  const a = ctx.db.assignment.playerId.find(p.id);
  if (a && a.optionId === optionId) throw new SenderError("You can't vote for the place you defended");
  if (ctx.db.vote.voterId.find(p.id)) throw new SenderError('You already voted');
  ctx.db.vote.insert({ voterId: p.id, lobbyCode: l.code, optionId });
});

export const closeVoting = spacetimedb.reducer({ code: t.string() }, (ctx, { code }) => {
  const l = requireHost(ctx, code);
  requirePhase(l, 'VOTE');
  const options = [...ctx.db.option.lobbyCode.filter(l.code)].sort((a, b) => a.slot - b.slot);
  if (options.length === 0) throw new SenderError('No options');
  const tally = new Map<bigint, number>(options.map(o => [o.id, 0]));
  for (const v of ctx.db.vote.lobbyCode.filter(l.code)) tally.set(v.optionId, (tally.get(v.optionId) ?? 0) + 1);
  const best = Math.max(...tally.values());
  const leaders = options.filter(o => tally.get(o.id) === best);
  const winner = leaders.length === 1 ? leaders[0]! : leaders[ctx.random.integerInRange(0, leaders.length - 1)]!;
  setPhase(ctx, l.code, 'RESULT', { winnerOptionId: winner.id, tieBreak: leaders.length > 1 });
});

// ---------- PLAN ----------

export const setPlan = spacetimedb.reducer(
  { code: t.string(), whenLabel: t.string(), startIso: t.string(), durationMin: t.u32(), blurb: t.string() },
  (ctx, { code, whenLabel, startIso, durationMin, blurb }) => {
    const l = requireHost(ctx, code);
    requirePhase(l, 'RESULT');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(startIso)) throw new SenderError('Bad start time');
    const row = {
      lobbyCode: l.code,
      optionId: l.winnerOptionId,
      whenLabel: clean(whenLabel, 60),
      startIso,
      durationMin: Math.min(Math.max(durationMin, 15), 600),
      blurb: clean(blurb, 280),
    };
    ctx.db.plan.lobbyCode.delete(l.code);
    ctx.db.plan.insert(row);
    setPhase(ctx, l.code, 'PLAN');
  }
);

export const setRsvp = spacetimedb.reducer({ code: t.string(), status: t.string() }, (ctx, { code, status }) => {
  const l = getLobby(ctx, code);
  requirePhase(l, 'PLAN');
  const p = requirePlayer(ctx, l.code);
  if (!RSVP.includes(status)) throw new SenderError('Bad RSVP');
  const row = { playerId: p.id, lobbyCode: l.code, status };
  if (ctx.db.rsvp.playerId.find(p.id)) ctx.db.rsvp.playerId.update(row);
  else ctx.db.rsvp.insert(row);
});

// Back to the questions with the same crew (profiles kept so people can just tweak).
export const playAgain = spacetimedb.reducer({ code: t.string() }, (ctx, { code }) => {
  const l = requireHost(ctx, code);
  clearRound(ctx, l.code);
  setPhase(ctx, l.code, 'PROFILE', { showtimeIndex: 0, winnerOptionId: 0n, tieBreak: false, notice: '' });
});
