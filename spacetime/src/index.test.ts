import { describe, expect, it } from 'vitest';
import { ConnectionId } from 'spacetimedb';
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

  it('closeVoting picks the most-voted option', () => {
    const { test, as, options } = toVote();
    as('alice', ctx => m.castVote(ctx, { code: CODE, optionId: options[2]!.id }));
    as('bob', ctx => m.castVote(ctx, { code: CODE, optionId: options[2]!.id }));
    expect(() => as('bob', ctx => m.closeVoting(ctx, { code: CODE }))).toThrow('Only the host');
    as(HOST, ctx => m.closeVoting(ctx, { code: CODE }));
    const l = test.db.lobby.code.find(CODE)!;
    expect(l.phase).toBe('RESULT');
    expect(l.winnerOptionId).toBe(options[2]!.id);
    expect(l.tieBreak).toBe(false);
  });

  it('breaks ties between leaders', () => {
    const { test, as, options } = toVote();
    as('alice', ctx => m.castVote(ctx, { code: CODE, optionId: options[1]!.id }));
    as('bob', ctx => m.castVote(ctx, { code: CODE, optionId: options[0]!.id }));
    as(HOST, ctx => m.closeVoting(ctx, { code: CODE }));
    const l = test.db.lobby.code.find(CODE)!;
    expect(l.tieBreak).toBe(true);
    expect([options[0]!.id, options[1]!.id]).toContain(l.winnerOptionId);
  });

  it('rejects pitches outside PITCH phase', () => {
    const { as } = toVote();
    expect(() => as('bob', ctx => m.submitPitch(ctx, { code: CODE, text: 'late', mode: 'text' }))).toThrow('Not allowed during VOTE');
  });
});

describe('plan', () => {
  it('sets the plan, takes RSVPs, and play-again clears the round', () => {
    const { test, as, options } = toVote();
    as('alice', ctx => m.castVote(ctx, { code: CODE, optionId: options[2]!.id }));
    as(HOST, ctx => m.closeVoting(ctx, { code: CODE }));
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
