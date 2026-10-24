import { describe, expect, it } from 'vitest';
import { ConnectionId, ScheduleAt, Timestamp } from 'spacetimedb';
import { createModuleTestHarness, TestAuth } from 'spacetimedb/server/test-utils';
import spacetimedb, * as m from './index';

let conn = 1n;
const auth = (sub: string) => TestAuth.fromJwtPayload(JSON.stringify({ iss: 'test', sub }), new ConnectionId(conn++));

const HOST = 'host';
const CODE = 'ABCD';

function setup() {
  const test = createModuleTestHarness(spacetimedb, m);
  const as = (who: string, fn: Parameters<typeof test.withReducerTx>[1]) => test.withReducerTx(auth(who), fn);
  as(HOST, ctx => m.createLobby(ctx, { code: CODE, locationLabel: 'Palace of Fine Arts', lat: 37.8, lng: -122.45 }));
  return { test, as };
}

const phase = (test: ReturnType<typeof setup>['test']) => test.db.lobby.code.find(CODE)!.phase;

const opt = (name: string) => ({
  name,
  category: 'Tacos',
  address: '1 Main St',
  priceLevel: 2,
  rating: 4.5,
  distanceM: 500,
  mapsUrl: 'https://maps.example',
  blurb: 'good',
});

function playerId(test: ReturnType<typeof setup>['test'], name: string) {
  return [...test.db.player.iter()].find(p => p.name === name)!.id;
}

/** Runs a full game up to the VOTE phase with alice + bob. */
function toVote() {
  const s = setup();
  const { test, as } = s;
  as('alice', ctx => m.joinLobby(ctx, { code: CODE, name: 'Alice' }));
  as('bob', ctx => m.joinLobby(ctx, { code: CODE, name: 'Bob' }));
  as(HOST, ctx => m.startProfiles(ctx, { code: CODE }));
  for (const who of ['alice', 'bob']) {
    as(who, ctx =>
      m.submitProfile(ctx, { code: CODE, budget: 2, diet: 'any', distance: 'walk', freeWhen: ['tonight'], vibe: 'tacos', hidden: [] })
    );
  }
  const alice = playerId(test, 'Alice');
  const bob = playerId(test, 'Bob');
  as(HOST, ctx =>
    m.setOptions(ctx, {
      code: CODE,
      options: [opt('Taco Spot'), opt('Pizza Place'), opt('Boba Bar')],
      assignments: [
        { playerId: alice, optionIndex: 0, prompt: 'like a lawyer' },
        { playerId: bob, optionIndex: 1, prompt: 'like a pirate' },
      ],
      notice: '',
    })
  );
  as(HOST, ctx => m.startPitching(ctx, { code: CODE }));
  as('alice', ctx => m.submitPitch(ctx, { code: CODE, text: 'Tacos are justice', mode: 'text' }));
  as(HOST, ctx => m.startShowtime(ctx, { code: CODE }));
  as(HOST, ctx => m.startVoting(ctx, { code: CODE }));
  const options = [...test.db.option.iter()].sort((a, b) => a.slot - b.slot);
  return { ...s, alice, bob, options };
}

describe('lobby', () => {
  it('creates a lobby in LOBBY phase and rejects bad/duplicate codes', () => {
    const { test, as } = setup();
    expect(phase(test)).toBe('LOBBY');
    expect(() => as('x', ctx => m.createLobby(ctx, { code: 'ABCD', locationLabel: '', lat: 0, lng: 0 }))).toThrow('taken');
    expect(() => as('x', ctx => m.createLobby(ctx, { code: 'AB1', locationLabel: '', lat: 0, lng: 0 }))).toThrow('4 letters');
  });

  it('joins players, renames on rejoin, and rejects duplicate names', () => {
    const { test, as } = setup();
    as('alice', ctx => m.joinLobby(ctx, { code: 'abcd', name: '  Alice ' }));
    as('alice', ctx => m.joinLobby(ctx, { code: CODE, name: 'Ali' }));
    expect([...test.db.player.iter()].map(p => p.name)).toEqual(['Ali']);
    expect(() => as('bob', ctx => m.joinLobby(ctx, { code: CODE, name: 'ali' }))).toThrow('already has that name');
    expect(() => as('bob', ctx => m.joinLobby(ctx, { code: 'ZZZZ', name: 'Bob' }))).toThrow('No game');
  });

  it('only the host can advance, and needs 2 players', () => {
    const { test, as } = setup();
    as('alice', ctx => m.joinLobby(ctx, { code: CODE, name: 'Alice' }));
    expect(() => as(HOST, ctx => m.startProfiles(ctx, { code: CODE }))).toThrow('at least 2');
    as('bob', ctx => m.joinLobby(ctx, { code: CODE, name: 'Bob' }));
    expect(() => as('alice', ctx => m.startProfiles(ctx, { code: CODE }))).toThrow('Only the host');
    as(HOST, ctx => m.startProfiles(ctx, { code: CODE }));
    expect(phase(test)).toBe('PROFILE');
  });
});

describe('profile + options', () => {
  it('validates profiles and filters free slots / hidden fields', () => {
    const { test, as } = setup();
    as('alice', ctx => m.joinLobby(ctx, { code: CODE, name: 'Alice' }));
    expect(() =>
      as('alice', ctx => m.submitProfile(ctx, { code: CODE, budget: 9, diet: 'any', distance: 'walk', freeWhen: ['now'], vibe: '', hidden: [] }))
    ).toThrow('budget');
    expect(() =>
      as('alice', ctx => m.submitProfile(ctx, { code: CODE, budget: 1, diet: 'any', distance: 'walk', freeWhen: ['never'], vibe: '', hidden: [] }))
    ).toThrow('at least one');
    as('alice', ctx =>
      m.submitProfile(ctx, { code: CODE, budget: 1, diet: 'vegan', distance: 'walk', freeWhen: ['now', 'now', 'x'], vibe: 'boba', hidden: ['diet', 'junk'] })
    );
    const p = [...test.db.profile.iter()][0]!;
    expect(p.freeWhen).toEqual(['now']);
    expect(p.hidden).toEqual(['diet']);
  });

  it('setOptions requires every player to be assigned', () => {
    const { test, as } = setup();
    as('alice', ctx => m.joinLobby(ctx, { code: CODE, name: 'Alice' }));
    as('bob', ctx => m.joinLobby(ctx, { code: CODE, name: 'Bob' }));
    as(HOST, ctx => m.startProfiles(ctx, { code: CODE }));
    const alice = playerId(test, 'Alice');
    expect(() =>
      as(HOST, ctx =>
        m.setOptions(ctx, {
          code: CODE,
          options: [opt('A'), opt('B')],
          assignments: [{ playerId: alice, optionIndex: 0, prompt: '' }],
          notice: '',
        })
      )
    ).toThrow('Every player');
    expect(phase(test)).toBe('PROFILE');
    expect(test.db.option.count()).toBe(0n);
  });
});

describe('pitch + vote', () => {
  it('runs the loop to VOTE and stores pitches', () => {
    const { test, alice, options } = toVote();
    expect(phase(test)).toBe('VOTE');
    const pt = test.db.pitch.playerId.find(alice)!;
    expect(pt.optionId).toBe(options[0]!.id);
  });

  it('blocks self-votes, double votes and non-players', () => {
    const { as, options } = toVote();
    expect(() => as('alice', ctx => m.castVote(ctx, { code: CODE, optionId: options[0]!.id }))).toThrow('defended');
    as('alice', ctx => m.castVote(ctx, { code: CODE, optionId: options[2]!.id }));
    expect(() => as('alice', ctx => m.castVote(ctx, { code: CODE, optionId: options[1]!.id }))).toThrow('already voted');
    expect(() => as('stranger', ctx => m.castVote(ctx, { code: CODE, optionId: options[1]!.id }))).toThrow('Join the game');
  });

  it('closes itself when the last vote lands and picks the most-voted option', () => {
    const { test, as, options } = toVote();
    as('alice', ctx => m.castVote(ctx, { code: CODE, optionId: options[2]!.id }));
    expect(phase(test)).toBe('VOTE');
    expect(() => as('bob', ctx => m.closeVoting(ctx, { code: CODE }))).toThrow('Only the host');
    as('bob', ctx => m.castVote(ctx, { code: CODE, optionId: options[2]!.id }));
    const l = test.db.lobby.code.find(CODE)!;
    expect(l.phase).toBe('RESULT');
    expect(l.winnerOptionId).toBe(options[2]!.id);
    expect(l.tieBreak).toBe(false);
  });

  it('breaks ties between leaders', () => {
    const { test, as, options } = toVote();
    as('alice', ctx => m.castVote(ctx, { code: CODE, optionId: options[1]!.id }));
    as('bob', ctx => m.castVote(ctx, { code: CODE, optionId: options[0]!.id }));
    const l = test.db.lobby.code.find(CODE)!;
    expect(l.tieBreak).toBe(true);
    expect([options[0]!.id, options[1]!.id]).toContain(l.winnerOptionId);
  });

  it('rejects pitches outside PITCH phase', () => {
    const { as } = toVote();
    expect(() => as('bob', ctx => m.submitPitch(ctx, { code: CODE, text: 'late', mode: 'text' }))).toThrow('Not allowed during VOTE');
  });
});

describe('showtime', () => {
  it('steps through options (not pitches) and clamps at the curtain call', () => {
    const s = setup();
    const { test, as } = s;
    as('alice', ctx => m.joinLobby(ctx, { code: CODE, name: 'Alice' }));
    as('bob', ctx => m.joinLobby(ctx, { code: CODE, name: 'Bob' }));
    as(HOST, ctx => m.startProfiles(ctx, { code: CODE }));
    const [alice, bob] = [playerId(test, 'Alice'), playerId(test, 'Bob')];
    as(HOST, ctx =>
      m.setOptions(ctx, {
        code: CODE,
        options: [opt('A'), opt('B'), opt('C'), opt('D')],
        assignments: [
          { playerId: alice, optionIndex: 0, prompt: '' },
          { playerId: bob, optionIndex: 1, prompt: '' },
        ],
        notice: '',
      })
    );
    const orphan = [...test.db.option.iter()].find(o => o.name === 'D')!;
    expect(() => as('alice', ctx => m.setHostLine(ctx, { optionId: orphan.id, line: 'hi' }))).toThrow('Only the host');
    as(HOST, ctx => m.setHostLine(ctx, { optionId: orphan.id, line: 'The AI defends D!' }));
    expect(test.db.option.id.find(orphan.id)!.hostLine).toBe('The AI defends D!');
    as(HOST, ctx => m.startPitching(ctx, { code: CODE }));
    as(HOST, ctx => m.startShowtime(ctx, { code: CODE }));
    for (let i = 0; i < 10; i++) as(HOST, ctx => m.nextPitch(ctx, { code: CODE, delta: 1 }));
    expect(test.db.lobby.code.find(CODE)!.showtimeIndex).toBe(4);
    as(HOST, ctx => m.nextPitch(ctx, { code: CODE, delta: -1 }));
    expect(test.db.lobby.code.find(CODE)!.showtimeIndex).toBe(3);
  });
});

describe('plan', () => {
  it('sets the plan, takes RSVPs, and play-again clears the round', () => {
    const { test, as, options } = toVote();
    as('alice', ctx => m.castVote(ctx, { code: CODE, optionId: options[2]!.id }));
    as(HOST, ctx => m.closeVoting(ctx, { code: CODE })); // host closes early: Bob never voted
    expect(() => as(HOST, ctx => m.setPlan(ctx, { code: CODE, whenLabel: 'Tonight', startIso: 'soon', durationMin: 90, blurb: '' }))).toThrow(
      'Bad start'
    );
    as(HOST, ctx => m.setPlan(ctx, { code: CODE, whenLabel: 'Tonight 7pm', startIso: '2026-10-25T02:00:00Z', durationMin: 90, blurb: 'go' }));
    expect(phase(test)).toBe('PLAN');
    expect(test.db.plan.lobbyCode.find(CODE)!.optionId).toBe(options[2]!.id);
    as('bob', ctx => m.setRsvp(ctx, { code: CODE, status: 'in' }));
    as('bob', ctx => m.setRsvp(ctx, { code: CODE, status: 'maybe' }));
    expect([...test.db.rsvp.iter()].map(r => r.status)).toEqual(['maybe']);

    as(HOST, ctx => m.playAgain(ctx, { code: CODE }));
    expect(phase(test)).toBe('PROFILE');
    expect(test.db.option.count()).toBe(0n);
    expect(test.db.vote.count()).toBe(0n);
    expect(test.db.plan.count()).toBe(0n);
    expect(test.db.profile.count()).toBe(2n);
  });
});

describe('bots', () => {
  it('lets one human play: bots join with profiles, pitch via the host, and vote on their own', () => {
    const { test, as } = setup();
    as('alice', ctx => m.joinLobby(ctx, { code: CODE, name: 'Alice' }));
    expect(() => as('alice', ctx => m.addBot(ctx, { code: CODE }))).toThrow('Only the host');
    as(HOST, ctx => m.addBot(ctx, { code: CODE }));
    as(HOST, ctx => m.addBot(ctx, { code: CODE }));
    const bots = [...test.db.player.iter()].filter(p => p.isBot);
    expect(bots).toHaveLength(2);
    expect(new Set(bots.map(b => b.name)).size).toBe(2);
    expect(test.db.profile.count()).toBe(2n);

    as(HOST, ctx => m.startProfiles(ctx, { code: CODE }));
    // The host's own identity never counts as a bot player: host can't vote "as" a bot.
    expect(() => as(HOST, ctx => m.submitProfile(ctx, { code: CODE, budget: 1, diet: 'any', distance: 'walk', freeWhen: ['now'], vibe: '', hidden: [] }))).toThrow(
      'Join the game'
    );
    const alice = playerId(test, 'Alice');
    const [b1, b2] = bots.map(b => b.id);
    as(HOST, ctx =>
      m.setOptions(ctx, {
        code: CODE,
        options: [opt('A'), opt('B'), opt('C')],
        assignments: [
          { playerId: alice, optionIndex: 0, prompt: '' },
          { playerId: b1!, optionIndex: 1, prompt: '' },
          { playerId: b2!, optionIndex: 2, prompt: '' },
        ],
        notice: '',
      })
    );
    as(HOST, ctx => m.startPitching(ctx, { code: CODE }));
    expect(() => as(HOST, ctx => m.botPitch(ctx, { code: CODE, playerId: alice, text: 'fake' }))).toThrow('Not a bot');
    as(HOST, ctx => m.botPitch(ctx, { code: CODE, playerId: b1!, text: 'Beep boop, B is the move.' }));
    expect(test.db.pitch.playerId.find(b1!)!.text).toMatch(/Beep/);
    as(HOST, ctx => m.startShowtime(ctx, { code: CODE }));
    as(HOST, ctx => m.startVoting(ctx, { code: CODE }));
    const options = [...test.db.option.iter()];
    const votes = [...test.db.vote.iter()];
    expect(votes).toHaveLength(2);
    for (const v of votes) expect(v.optionId).not.toBe(test.db.assignment.playerId.find(v.voterId)!.optionId);
    expect(phase(test)).toBe('VOTE'); // still waiting on the human
    as('alice', ctx => m.castVote(ctx, { code: CODE, optionId: options.find(o => o.name !== 'A')!.id }));
    expect(phase(test)).toBe('RESULT');
  });

  it('needs at least one human, and the host can remove players in the lobby', () => {
    const { test, as } = setup();
    as(HOST, ctx => m.addBot(ctx, { code: CODE }));
    as(HOST, ctx => m.addBot(ctx, { code: CODE }));
    expect(() => as(HOST, ctx => m.startProfiles(ctx, { code: CODE }))).toThrow('one human');
    const bot = [...test.db.player.iter()][0]!;
    as(HOST, ctx => m.removePlayer(ctx, { code: CODE, playerId: bot.id }));
    expect(test.db.player.count()).toBe(1n);
    expect(test.db.profile.playerId.find(bot.id)).toBeNull();
  });
});

describe('phase timers', () => {
  const internal = TestAuth.internal();
  const fire = (test: ReturnType<typeof setup>['test'], phaseName: string) => {
    const l = test.db.lobby.code.find(CODE)!;
    const timer = { scheduledId: 1n, scheduledAt: ScheduleAt.time(l.deadlineMicros), lobbyCode: CODE, phase: phaseName, deadlineMicros: l.deadlineMicros };
    return (auth = internal) => test.withReducerTx(auth, ctx => m.phaseTimeout(ctx, { timer }));
  };

  it('clears the deadline when the host closes voting early', () => {
    const { test, as } = toVote();
    as(HOST, ctx => m.closeVoting(ctx, { code: CODE }));
    expect(test.db.lobby.code.find(CODE)!.deadlineMicros).toBe(0n);
  });

  it('PITCH times out into SHOWTIME; VOTE times out into RESULT; clients cannot fire timers', () => {
    const s = setup();
    const { test, as } = s;
    test.clock.set(new Timestamp(1_000_000n));
    as('alice', ctx => m.joinLobby(ctx, { code: CODE, name: 'Alice' }));
    as('bob', ctx => m.joinLobby(ctx, { code: CODE, name: 'Bob' }));
    as(HOST, ctx => m.startProfiles(ctx, { code: CODE }));
    const [alice, bob] = [playerId(test, 'Alice'), playerId(test, 'Bob')];
    as(HOST, ctx =>
      m.setOptions(ctx, {
        code: CODE,
        options: [opt('A'), opt('B'), opt('C')],
        assignments: [
          { playerId: alice, optionIndex: 0, prompt: '' },
          { playerId: bob, optionIndex: 1, prompt: '' },
        ],
        notice: '',
      })
    );
    as(HOST, ctx => m.startPitching(ctx, { code: CODE }));
    expect(test.db.lobby.code.find(CODE)!.deadlineMicros).toBe(1_000_000n + 90_000_000n);
    expect(test.db.phaseTimer.count()).toBe(1n);

    const pitchTimer = fire(test, 'PITCH');
    expect(() => pitchTimer(auth('alice'))).toThrow('on their own');
    pitchTimer();
    expect(phase(test)).toBe('SHOWTIME');
    pitchTimer(); // stale timer: no-op
    expect(phase(test)).toBe('SHOWTIME');

    as(HOST, ctx => m.startVoting(ctx, { code: CODE }));
    const voteTimer = fire(test, 'VOTE');
    voteTimer();
    const l = test.db.lobby.code.find(CODE)!;
    expect(l.phase).toBe('RESULT');
    expect(l.deadlineMicros).toBe(0n);
  });

  it('rejects impossible coordinates', () => {
    const { as } = setup();
    expect(() => as('x', ctx => m.createLobby(ctx, { code: 'WXYZ', locationLabel: '', lat: 999, lng: 0 }))).toThrow('Bad location');
    expect(() => as('x', ctx => m.createLobby(ctx, { code: 'WXYZ', locationLabel: '', lat: NaN, lng: 0 }))).toThrow('Bad location');
  });
});
