import { describe, expect, it } from 'vitest';
import { Identity, Timestamp } from 'spacetimedb';
import { checkEarly, playableIn, type Ctx } from './core';
import { acknowledgePhase, answerWarmup, castPrevote, castVote, setLean, submitTypedPitch } from './reducers/game';
import { finishBotPitches, finishScout, finishTranscribe, finishWarmup } from './reducers/jobs';
import { kickPlayer, setRoomSetup } from './reducers/room';
import { advancePhase } from './reducers/lifecycle';
import { applyFallback } from './cleanup';

type Row = Record<string, unknown>;

/** Small in-memory implementation of the table/index API, exercising real reducer callbacks. */
function fixture(phase: string, humanCount = 2, botCount = 1) {
  const data = new Map<string, Row[]>();
  const rows = (name: string) => {
    if (!data.has(name)) data.set(name, []);
    return data.get(name)!;
  };
  const same = (a: unknown, b: unknown) => a instanceof Identity && b instanceof Identity ? a.equals(b) : a === b;
  const playerKeys = new Set(['profilePublic', 'profileDraft', 'assignment', 'prevote', 'lean', 'vote', 'rsvp']);
  const db = new Proxy({}, {
    get: (_target, name: string) => {
      const list = rows(name);
      const primary = playerKeys.has(name) ? 'playerId' : name === 'phaseTimer' ? 'scheduledId' : 'id';
      return new Proxy({
        iter: () => list.values(),
        insert: (input: Row) => {
          const row = { ...input };
          if (row[primary] === 0n) row[primary] = BigInt(list.length + 1);
          list.push(row);
          return row;
        },
      }, {
        get: (table, field: string) => field in table ? table[field as keyof typeof table] : {
          find: (value: unknown) => list.find(row => same(row[field], value)) ?? null,
          filter: (value: unknown) => list.filter(row => same(row[field], value)).values(),
          update: (row: Row) => {
            const index = list.findIndex(old => same(old[primary], row[primary]));
            if (index < 0) throw new Error(`Missing ${name} row`);
            list[index] = { ...row };
          },
          delete: (value: unknown) => {
            const index = list.findIndex(row => same(row[field], value));
            if (index >= 0) list.splice(index, 1);
          },
        },
      });
    },
  });
  const host = new Identity(100n);
  const moduleIdentity = new Identity(200n);
  let sender = new Identity(1n);
  const random = Object.assign(() => 0.25, { integerInRange: (min: number) => min });
  const ctx = { db, get sender() { return sender; }, identity: moduleIdentity, timestamp: new Timestamp(1_000_000n), random } as unknown as Ctx;
  rows('room').push({
    id: 1n, phase, phaseSeq: 10, fastMode: false, currentPitchIdx: 0, hostIdentity: host,
    category: 'food', aiStatus: '', scoutStatus: 'running', tzOffsetMin: 0, targetStartMin: -1,
    groupName: 'Test group', vibeTags: [], phaseStartedAt: new Timestamp(0n),
  });
  for (let index = 0; index < humanCount + botCount; index++) {
    rows('player').push({
      id: BigInt(index + 1), roomId: 1n, identity: new Identity(BigInt(index + 1)), seat: index,
      name: `Player ${index + 1}`, isBot: index >= humanCount, ready: true, connected: true, actedSeq: 0,
    });
  }
  const room = () => rows('room')[0];
  const asPlayer = (id: bigint) => { sender = new Identity(id); };
  const option = (id: bigint) => rows('option').push({
    id, roomId: 1n, sortOrder: Number(id), title: `Venue ${id}`, groupFitScore: 80,
    priceLevel: 2, rating: 4.5, reviewCount: 10, travelMin: 10, hoursText: '', dietaryNotes: [], reviewSnippets: [],
    busyness: [], hoursKnown: false, openIntervals: [], perPlayerFit: [], placeId: `place-${id}`,
  });
  return { ctx, rows, room, asPlayer, option, host, moduleIdentity };
}

describe('complete tasks advance the shared room immediately', () => {
  it('leaves warm-up for scouting as soon as everyone answers, without waiting for venues', () => {
    const f = fixture('warmup');
    f.rows('player').forEach((p, index) => f.rows('warmup').push({ id: BigInt(index + 1), playerId: p.id, roomId: 1n, answer: p.isBot ? 'a' : '' }));
    answerWarmup(f.ctx, { warmupId: 1n, answer: 'a' });
    expect(f.room().phase).toBe('warmup');
    f.asPlayer(2n);
    answerWarmup(f.ctx, { warmupId: 2n, answer: 'b' });
    expect(f.room().phase).toBe('scouting');
    expect(f.room().phaseSeq).toBe(11);
  });

  it('goes straight to finalists when venues are already ready', () => {
    const f = fixture('warmup');
    f.option(10n);
    f.option(20n);
    f.rows('player').forEach(p => f.rows('warmup').push({ playerId: p.id, roomId: 1n, answer: 'a' }));
    checkEarly(f.ctx, 1n);
    expect(f.room().phase).toBe('finalists');
  });

  it('does not mistake partial warm-up output or an empty room for completion', () => {
    const f = fixture('warmup');
    f.rows('warmup').push({ playerId: 1n, roomId: 1n, answer: 'a' });
    checkEarly(f.ctx, 1n);
    expect(f.room().phase).toBe('warmup');
    f.rows('player').splice(0);
    checkEarly(f.ctx, 1n);
    expect(f.room().phase).toBe('warmup');
  });

  it('fills omitted/duplicate model questions with one answerable question per current player', () => {
    const f = fixture('warmup');
    f.rows('config').push({ id: 0, adminIdentity: f.ctx.sender });
    f.rows('aiJob').push({ id: 1n, roomId: 1n, status: 'running' });
    finishWarmup(f.ctx, { jobId: 1n, questions: [
      { playerId: 1n, question: 'Pick?', choiceA: 'A', choiceB: 'B' },
      { playerId: 1n, question: 'Duplicate?', choiceA: 'C', choiceB: 'D' },
    ] });
    expect(f.rows('warmup').map(w => w.playerId)).toEqual([1n, 2n, 3n]);
    expect(f.rows('warmup')[1].question).toBeTruthy();
    expect(f.rows('warmup')[2].answer).toBe('a');
    expect(f.room().phase).toBe('warmup');
  });

  it('advances a bot-only warm-up when its job completes instead of missing the completion check', () => {
    const f = fixture('warmup', 0, 2);
    f.rows('config').push({ id: 0, adminIdentity: f.ctx.sender });
    f.rows('aiJob').push({ id: 1n, roomId: 1n, status: 'running' });
    finishWarmup(f.ctx, { jobId: 1n, questions: [] });
    expect(f.room().phase).toBe('scouting');
  });

  it('keeps a briefly disconnected player in the quorum, but rechecks immediately after an explicit kick', () => {
    const f = fixture('finalists');
    f.rows('player')[0].actedSeq = 10;
    f.rows('player')[1].connected = false;
    checkEarly(f.ctx, 1n);
    expect(f.room().phase).toBe('finalists');
    f.asPlayer(100n);
    kickPlayer(f.ctx, { roomId: 1n, playerId: 2n });
    expect(f.room().phase).toBe('prevote');
  });

  it('ignores an orphaned warm-up question left after a host kick', () => {
    const f = fixture('warmup', 1, 1);
    f.rows('warmup').push({ playerId: 1n, roomId: 1n, answer: 'a' }, { playerId: 2n, roomId: 1n, answer: 'b' }, { playerId: 99n, roomId: 1n, answer: '' });
    checkEarly(f.ctx, 1n);
    expect(f.room().phase).toBe('scouting');
  });

  it('finishes secret pre-votes on the last real player, with bot choices filled at the transition', () => {
    const f = fixture('prevote');
    f.option(10n);
    f.option(20n);
    castPrevote(f.ctx, { roomId: 1n, optionId: 10n });
    expect(f.room().phase).toBe('prevote');
    f.asPlayer(2n);
    castPrevote(f.ctx, { roomId: 1n, optionId: 20n });
    expect(f.room().phase).toBe('assigning');
    expect(f.rows('prevote')).toHaveLength(3);
    expect(f.rows('assignment')).toHaveLength(3);
  });

  it('finishes voting and creates the real plan as soon as the last human votes', () => {
    const f = fixture('vote');
    f.option(10n);
    f.option(20n);
    castVote(f.ctx, { roomId: 1n, optionId: 10n });
    expect(f.room().phase).toBe('vote');
    f.asPlayer(2n);
    castVote(f.ctx, { roomId: 1n, optionId: 10n });
    expect(f.room().phase).toBe('results');
    expect(f.rows('plan')).toHaveLength(1);
    expect(f.rows('vote')).toHaveLength(3);
  });

  it('does not treat a transcribing or failed pitch as completed', () => {
    const f = fixture('pitching');
    f.rows('pitch').push(
      { id: 1n, roomId: 1n, playerId: 1n, status: 'ready', playOrder: 0, durationMs: 0, transcript: 'A ready pitch.' },
      { id: 2n, roomId: 1n, playerId: 2n, status: 'transcribing', playOrder: 1, durationMs: 0, transcript: '' },
      { id: 3n, roomId: 1n, playerId: 3n, status: 'ready', playOrder: 2, durationMs: 0, transcript: 'A bot pitch.' },
    );
    checkEarly(f.ctx, 1n);
    expect(f.room().phase).toBe('pitching');
    f.rows('pitch')[1].status = 'needs_text';
    checkEarly(f.ctx, 1n);
    expect(f.room().phase).toBe('pitching');
    f.asPlayer(2n);
    submitTypedPitch(f.ctx, { pitchId: 2n, text: 'Let us go here.' });
    expect(f.room().phase).toBe('playback');
  });
});

describe('explicit shared readiness is phase-scoped', () => {
  it.each([['finalists', 'prevote'], ['assignments', 'pitching'], ['results', 'plan']])('lets everyone finish %s early', (phase, next) => {
    const f = fixture(phase);
    acknowledgePhase(f.ctx, { roomId: 1n, phaseSeq: 10 });
    expect(f.room().phase).toBe(phase);
    expect(f.rows('player')[0].actedSeq).toBe(10);
    f.asPlayer(2n);
    acknowledgePhase(f.ctx, { roomId: 1n, phaseSeq: 10 });
    expect(f.room().phase).toBe(next);
    expect(f.room().phaseSeq).toBe(11);
    acknowledgePhase(f.ctx, { roomId: 1n, phaseSeq: 10 });
    expect(f.room().phaseSeq).toBe(11);
  });

  it('requires a new acknowledgement for every pitch; changing a lean never skips playback', () => {
    const f = fixture('playback');
    f.option(10n);
    f.rows('pitch').push(
      { id: 1n, roomId: 1n, playerId: 1n, optionId: 10n, status: 'ready', playOrder: 0, durationMs: 0, transcript: 'First' },
      { id: 2n, roomId: 1n, playerId: 2n, optionId: 10n, status: 'ready', playOrder: 1, durationMs: 0, transcript: 'Second' },
    );
    setLean(f.ctx, { roomId: 1n, optionId: 10n });
    expect(f.rows('player')[0].actedSeq).toBe(0);
    acknowledgePhase(f.ctx, { roomId: 1n, phaseSeq: 10 });
    f.asPlayer(2n);
    acknowledgePhase(f.ctx, { roomId: 1n, phaseSeq: 10 });
    expect(f.room().currentPitchIdx).toBe(1);
    expect(f.room().phaseSeq).toBe(11);
    acknowledgePhase(f.ctx, { roomId: 1n, phaseSeq: 10 });
    checkEarly(f.ctx, 1n);
    expect(f.room().currentPitchIdx).toBe(1);
    expect(f.room().phaseSeq).toBe(11);
  });

  it('rejects non-members, and cannot acknowledge a task instead of performing it', () => {
    const f = fixture('prevote');
    expect(() => acknowledgePhase(f.ctx, { roomId: 1n, phaseSeq: 10 })).toThrow('Not allowed during prevote');
    f.asPlayer(99n);
    expect(() => acknowledgePhase(f.ctx, { roomId: 1n, phaseSeq: 10 })).toThrow('You are not in this room');
  });

  it('does not skip an empty/bot-only viewing scene from an empty human quorum', () => {
    for (const bots of [0, 2]) {
      const f = fixture('playback', 0, bots);
      checkEarly(f.ctx, 1n);
      expect(f.room().phaseSeq).toBe(10);
    }
  });

  it('ignores an old deadline after all humans already advanced the phase', () => {
    const f = fixture('finalists', 1, 0);
    acknowledgePhase(f.ctx, { roomId: 1n, phaseSeq: 10 });
    f.asPlayer(200n);
    advancePhase(f.ctx, { timer: { scheduledId: 1n, roomId: 1n, phaseSeq: 10 } as Parameters<typeof advancePhase>[1]['timer'] });
    expect(f.room().phase).toBe('prevote');
    expect(f.room().phaseSeq).toBe(11);
  });
});

describe('departed players and late AI jobs cannot corrupt completion', () => {
  it('removes a kicked player\'s old votes and task rows before counting the remaining group', () => {
    const f = fixture('vote', 3, 0);
    f.option(10n);
    f.option(20n);
    f.rows('option')[0].groupFitScore = 90;
    castVote(f.ctx, { roomId: 1n, optionId: 10n });
    f.asPlayer(2n);
    castVote(f.ctx, { roomId: 1n, optionId: 20n });
    f.rows('assignment').push({ playerId: 2n, roomId: 1n, optionId: 20n });
    f.rows('prevote').push({ playerId: 2n, roomId: 1n, optionId: 20n });
    f.rows('lean').push({ playerId: 2n, roomId: 1n, optionId: 20n });
    f.rows('warmup').push({ id: 1n, playerId: 2n, roomId: 1n, answer: 'b' });
    f.asPlayer(100n);
    kickPlayer(f.ctx, { roomId: 1n, playerId: 2n });
    expect(f.room().phase).toBe('vote');
    for (const table of ['assignment', 'prevote', 'lean', 'vote', 'warmup']) {
      expect(f.rows(table).some(row => row.playerId === 2n)).toBe(false);
    }
    f.asPlayer(3n);
    castVote(f.ctx, { roomId: 1n, optionId: 20n });
    expect(f.room().phase).toBe('results');
    expect(f.room().winnerOptionId).toBe(10n); // Two current voters tie; the better fit wins.
    expect(f.rows('vote')).toHaveLength(2);
  });

  it.each(['ready', 'transcribing'])('excludes a kicked player\'s %s pitch before early playback starts', status => {
    const f = fixture('pitching');
    f.rows('pitch').push(
      { id: 1n, roomId: 1n, playerId: 1n, status: 'ready', playOrder: 0, durationMs: 0, transcript: 'First.' },
      { id: 2n, roomId: 1n, playerId: 2n, status, playOrder: 1, durationMs: 0, transcript: 'Removed pitch.' },
      { id: 3n, roomId: 1n, playerId: 3n, status: 'ready', playOrder: 2, durationMs: 0, transcript: 'Bot.' },
    );
    f.asPlayer(100n);
    kickPlayer(f.ctx, { roomId: 1n, playerId: 2n });
    expect(f.room().phase).toBe('playback');
    expect(f.rows('pitch')[1].status).toBe('skipped');
    expect(playableIn(f.ctx, 1n).map(p => p.id)).toEqual([1n, 3n]);
    f.rows('config').push({ id: 0, adminIdentity: f.ctx.sender });
    f.rows('aiJob').push({ id: 1n, roomId: 1n, refId: 2n, status: 'running', payloadJson: '' });
    finishTranscribe(f.ctx, { jobId: 1n, transcript: 'A late transcript.', source: 'muse' });
    expect(f.rows('pitch')[1].status).toBe('skipped');
    expect(f.room().phaseSeq).toBe(11);
  });

  it('keeps playback ordering stable when a player is kicked during listening', () => {
    const f = fixture('playback');
    f.room().currentPitchIdx = 1;
    f.rows('pitch').push(...f.rows('player').map((p, index) => ({
      id: p.id, roomId: 1n, playerId: p.id, status: 'ready', playOrder: index, durationMs: 0, transcript: `Pitch ${index}`,
    })));
    f.asPlayer(100n);
    kickPlayer(f.ctx, { roomId: 1n, playerId: 1n });
    expect(f.room().phaseSeq).toBe(10);
    expect(f.room().currentPitchIdx).toBe(1);
    expect(playableIn(f.ctx, 1n).map(p => p.id)).toEqual([1n, 2n, 3n]);
    f.asPlayer(2n);
    acknowledgePhase(f.ctx, { roomId: 1n, phaseSeq: 10 });
    expect(f.room().currentPitchIdx).toBe(2);
  });

  it('does not revive a kicked bot pitch from a late result or fallback', () => {
    const f = fixture('pitching');
    f.rows('pitch').push(...f.rows('player').map((p, index) => ({
      id: p.id, roomId: 1n, playerId: p.id, status: 'waiting', playOrder: index, transcript: '',
    })));
    f.asPlayer(100n);
    kickPlayer(f.ctx, { roomId: 1n, playerId: 3n });
    f.rows('config').push({ id: 0, adminIdentity: f.ctx.sender });
    f.rows('aiJob').push(
      { id: 1n, roomId: 1n, status: 'running', kind: 'bot_pitch', payloadJson: '{"pitchIds":["3"]}' },
      { id: 2n, roomId: 1n, status: 'queued', kind: 'bot_pitch', payloadJson: '{"pitchIds":["3"]}' },
    );
    finishBotPitches(f.ctx, { jobId: 1n, pitches: [{ pitchId: 3n, text: 'This arrived too late.' }] });
    expect(f.rows('pitch')[2].status).toBe('skipped');
    applyFallback(f.ctx, f.ctx.db.aiJob.id.find(2n)!, 'Late job failed.');
    expect(f.rows('pitch')[2].status).toBe('skipped');
    expect(f.room().phase).toBe('pitching');
  });

  it('preserves answered warm-ups when filling fallback questions, then advances on the final answer', () => {
    const f = fixture('warmup');
    f.rows('warmup').push({ id: 1n, playerId: 1n, roomId: 1n, answer: 'a' });
    f.rows('aiJob').push({ id: 1n, roomId: 1n, status: 'running', kind: 'warmup', payloadJson: '' });
    applyFallback(f.ctx, f.ctx.db.aiJob.id.find(1n)!, 'Question generation failed.');
    expect(f.rows('warmup')).toHaveLength(3);
    expect(f.rows('warmup')[0].answer).toBe('a');
    expect(f.room().phase).toBe('warmup');
    f.asPlayer(2n);
    answerWarmup(f.ctx, { warmupId: 2n, answer: 'b' });
    expect(f.room().phase).toBe('scouting');
  });

  it('ignores an obsolete warm-up failure after the room has moved to assigning', () => {
    const f = fixture('assigning');
    f.room().aiStatus = 'Writing case files.';
    f.rows('aiJob').push({ id: 1n, roomId: 1n, status: 'running', kind: 'warmup', payloadJson: '' });
    applyFallback(f.ctx, f.ctx.db.aiJob.id.find(1n)!, 'Too late.');
    expect(f.rows('warmup')).toHaveLength(0);
    expect(f.room().aiStatus).toBe('Writing case files.');
    expect(f.room().phaseSeq).toBe(10);
  });

  it('advances a bot-only warm-up when fallback questions finish the task', () => {
    const f = fixture('warmup', 0, 2);
    f.rows('aiJob').push({ id: 1n, roomId: 1n, status: 'running', kind: 'warmup', payloadJson: '' });
    applyFallback(f.ctx, f.ctx.db.aiJob.id.find(1n)!, 'Use the offline questions.');
    expect(f.rows('warmup')).toHaveLength(2);
    expect(f.rows('warmup').every(w => w.answer === 'a')).toBe(true);
    expect(f.room().phase).toBe('scouting');
  });
});


describe('category changes invalidate old scouting jobs', () => {
  it('discards both queued and running scouts so late Food results cannot replace Movie', () => {
    const f = fixture('lobby');
    Object.assign(f.room(), { category: 'food', locationLabel: 'San Francisco', lat: 0, lng: 0, hasGeo: false, venueKey: 'food-cache' });
    f.rows('aiJob').push(
      { id: 51n, roomId: 1n, kind: 'scout', status: 'running', payloadJson: '{"category":"food"}' },
      { id: 52n, roomId: 1n, kind: 'scout', status: 'queued', payloadJson: '{"category":"activity"}' },
    );
    f.asPlayer(100n);
    setRoomSetup(f.ctx, { roomId: 1n, category: 'movie', locationLabel: 'San Francisco', lat: 0, lng: 0, hasGeo: false });
    expect(f.room().category).toBe('movie');
    expect(f.room().venueKey).toBe('');
    expect(f.room().scoutStatus).toBe('running');
    expect(f.rows('aiJob').filter(j => j.kind === 'scout')).toHaveLength(1);
    expect(JSON.parse(f.rows('aiJob')[0].payloadJson as string).category).toBe('movie');
    f.rows('config').push({ id: 0, adminIdentity: f.ctx.sender });
    finishScout(f.ctx, { jobId: 51n, venueKey: 'old-food', lat: 1, lng: 1, hasGeo: true, count: 50, source: 'fixture' });
    expect(f.room().venueKey).toBe('');
    expect(f.room().scoutStatus).toBe('running');
  });
  it('keeps the finished result when the selected category is tapped again', () => {
    const f = fixture('lobby');
    Object.assign(f.room(), { category: 'movie', locationLabel: 'SF', lat: 0, lng: 0, hasGeo: false, scoutStatus: 'done', venueKey: 'cinemas', aiStatus: 'Found 4 places.' });
    f.asPlayer(100n);
    setRoomSetup(f.ctx, { roomId: 1n, category: 'movie', locationLabel: 'SF', lat: 0, lng: 0, hasGeo: false });
    expect(f.room().venueKey).toBe('cinemas');
    expect(f.room().aiStatus).toBe('Found 4 places.');
    expect(f.rows('aiJob')).toHaveLength(0);
  });

  it('recognizes a change between typed and geolocated places', () => {
    const f = fixture('lobby');
    Object.assign(f.room(), { category: 'movie', locationLabel: 'SF', lat: 0, lng: 0, hasGeo: false, scoutStatus: 'done', venueKey: 'old' });
    f.asPlayer(100n);
    setRoomSetup(f.ctx, { roomId: 1n, category: 'movie', locationLabel: 'SF', lat: 0, lng: 0, hasGeo: true });
    expect(f.room().venueKey).toBe('');
    expect(f.rows('aiJob')).toHaveLength(1);
  });
});
