// Typed-only live completion audit. Uses the already-running local fixture worker, never a mic.
// SPACETIMEDB_URI=ws://127.0.0.1:3002 SPACETIMEDB_DB_NAME=hear-me-out-meta-ui pnpm exec tsx scripts/sim-completion.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { type DbConnection, type Room } from '@hmo/bindings';
import { connect, DB, URI, waitFor } from './simlib';

const categoryArg = process.argv.find(arg => arg.startsWith('--category='))?.split('=')[1];
const category = categoryArg ?? 'food';
if (!['food', 'activity', 'movie'].includes(category)) throw new Error('Use --category=food, activity or movie');
const output = resolve(categoryArg ? `docs/ui-verification/category-flows/${category}-completion.txt` : 'docs/ui-verification/social-sharing/completion-sim.txt');
const transcript: string[] = [];
const connections: DbConnection[] = [];
const began = performance.now();
let checks = 0;
const timings: { phase: string; milliseconds: number; deadlineRemainingMs: number }[] = [];

function log(line: string): void {
  transcript.push(line);
  console.log(line);
}

function check(condition: boolean, label: string): void {
  if (!condition) throw new Error(label);
  checks++;
  log(`PASS ${label}`);
}

async function main(): Promise<void> {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(URI).hostname)) throw new Error('This audit only runs against a local server.');
  log(`Hear Me Out: normal-speed, three-human ${category} completion audit`);
  log(`UTC ${new Date().toISOString()}`);
  log(`Server ${URI}; database ${DB}`);
  log('Three independent player identities plus a separate host. Typed pitches only. Existing local fixture worker handles AI jobs.');

  for (const name of ['host', 'Avery', 'Blair', 'Casey']) connections.push(await connect(name));
  const [host, ...humans] = connections;
  check(new Set(connections.map(c => c.identity!.toHexString())).size === 4, 'four distinct connected identities');
  await host.reducers.createRoom({ mode: 'friends', tzOffsetMin: -420, fastMode: false });
  const created = await waitFor('new audit room', () => [...host.db.room.iter()]
    .filter(r => r.hostIdentity.equals(host.identity!)).sort((a, b) => Number(b.id - a.id))[0]);
  const roomId = created.id;
  const room = (connection = host) => connection.db.room.id.find(roomId)!;
  const me = (connection: DbConnection) => [...connection.db.player.iter()].find(p => p.roomId === roomId && p.identity.equals(connection.identity!))!;
  log(`Room ${created.code}; id ${roomId}; fastMode=${created.fastMode}`);
  check(!created.fastMode, 'normal deadlines enabled (not fast-mode simulation)');
  await Promise.all(humans.map((connection, index) => connection.reducers.joinRoom({
    code: created.code, name: ['Avery', 'Blair', 'Casey'][index], avatar: ['🦊', '🐙', '🐸'][index],
  })));
  await waitFor('three people visible everywhere', () => connections.every(c => [...c.db.player.iter()].filter(p => p.roomId === roomId && !p.isBot).length === 3));
  check(connections.every(c => [...c.db.player.iter()].filter(p => p.roomId === roomId).length === 3), 'exactly three real players; no bots');
  await host.reducers.setRoomSetup({ roomId, category, locationLabel: 'Palace of Fine Arts, San Francisco', lat: 0, lng: 0, hasGeo: false });
  await host.reducers.startGame({ roomId });

  async function phase(name: string): Promise<Room> {
    await waitFor(`all clients in ${name}`, () => connections.every(c => room(c)?.phase === name), 45_000);
    const current = room();
    check(connections.every(c => room(c).phaseSeq === current.phaseSeq), `${name}: same phase sequence on all four clients`);
    return current;
  }

  async function complete(
    name: string,
    action: (connection: DbConnection, index: number, current: Room) => Promise<unknown>,
    acknowledged = false,
  ): Promise<Room> {
    const current = await phase(name);
    const seq = current.phaseSeq;
    for (let index = 0; index < 2; index++) {
      await action(humans[index], index, current);
      await waitFor(`${name}: player ${index + 1} ready on every screen`, () => connections.every(c =>
        [...c.db.player.iter()].find(p => p.id === me(humans[index]).id)?.actedSeq === seq));
      check(connections.every(c => room(c).phase === name && room(c).phaseSeq === seq), `${name}: ${index + 1}/3 finished, step remains open everywhere`);
      if (acknowledged && index === 0) {
        await humans[index].reducers.acknowledgePhase({ roomId, phaseSeq: seq });
        check(connections.every(c => room(c).phaseSeq === seq), `${name}: duplicate acknowledgement does not advance`);
      }
    }
    const start = performance.now();
    const deadlineRemainingMs = Number(current.phaseDeadline!.microsSinceUnixEpoch / 1000n) - Date.now();
    check(deadlineRemainingMs > 1_000, `${name}: final action occurs with ${deadlineRemainingMs}ms left on the normal timer`);
    await action(humans[2], 2, current);
    await waitFor(`${name}: final completion propagates`, () => connections.every(c => room(c).phaseSeq > seq), 2_500);
    const milliseconds = Math.round(performance.now() - start);
    const next = room();
    check(milliseconds < deadlineRemainingMs && connections.every(c => room(c).phaseSeq === next.phaseSeq && room(c).phase === next.phase), `${name}: last completion advances all four clients in ${milliseconds}ms → ${next.phase} (before deadline)`);
    timings.push({ phase: name === 'playback' ? `${name} ${current.currentPitchIdx + 1}` : name, milliseconds, deadlineRemainingMs });
    if (acknowledged) {
      await humans[0].reducers.acknowledgePhase({ roomId, phaseSeq: seq });
      await humans[2].reducers.acknowledgePhase({ roomId, phaseSeq: seq });
      check(connections.every(c => room(c).phaseSeq === next.phaseSeq), `${name}: stale acknowledgements cannot skip the following step`);
    }
    return next;
  }

  await phase('profiles');
  await Promise.all(humans.map(connection => connection.reducers.submitProfile({
    roomId, budgetMax: 2, dietary: [], maxTravelMin: 30,
    availability: [{ startMin: 0, endMin: 2880 }], vibeChips: ['Coffee', 'Board games'],
    pastedContext: 'Audit fixture: likes affordable casual hangouts and board games.', socialLinks: [], consent: false,
  })));
  await waitFor('all private drafts distilled', () => humans.every(c => [...c.db.myProfileDraft.iter()].some(d => d.playerId === me(c).id && d.status === 'ready')), 40_000);
  await complete('profiles', connection => connection.reducers.approveTags({ roomId, tags: ['coffee', 'board-games'] }));
  await phase('warmup');
  await waitFor('warm-up question for each player', () => humans.every(c => [...c.db.warmup.iter()].some(w => w.roomId === roomId && w.playerId === me(c).id)), 35_000);
  await complete('warmup', (connection, index) => connection.reducers.answerWarmup({
    warmupId: [...connection.db.warmup.iter()].find(w => w.roomId === roomId && w.playerId === me(connection).id)!.id,
    answer: index % 2 ? 'b' : 'a',
  }));
  await phase('finalists');
  const options = [...host.db.option.iter()].filter(o => o.roomId === roomId).sort((a, b) => a.sortOrder - b.sortOrder);
  check(options.length >= 2, 'real room has at least two curated fixture finalists');
  check(new Set(options.map(o => o.placeId)).size === options.length, 'every finalist is a distinct place');
  if (category === 'movie') check(options.every(o => /movie theater|cinema/i.test(o.category)), 'Movie finalists are cinemas, never activity/food venues');
  if (category === 'activity') check(options.every(o => !/store|apartment|bus stop|movie theater/i.test(o.category)), 'Activity finalists contain no retail, lodging, transit or cinema results');
  if (category !== 'food') check(options.every(o => !/vegan|vegetarian/i.test(o.fitSummary + o.perPlayerFit.map(f => f.line).join(' '))), 'non-food plans do not invent diet compatibility');
  const acknowledge = (connection: DbConnection, _index: number, current: Room) => connection.reducers.acknowledgePhase({ roomId, phaseSeq: current.phaseSeq });
  await complete('finalists', acknowledge, true);
  await complete('prevote', connection => connection.reducers.castPrevote({ roomId, optionId: options[0].id }));
  await waitFor('own pre-vote views contain one choice', () => humans.every(c => [...c.db.myPrevote.iter()].filter(p => p.roomId === roomId).length === 1));
  check(humans.every(c => {
    const own = [...c.db.myPrevote.iter()].filter(p => p.roomId === roomId);
    return own.length === 1 && own[0].playerId === me(c).id;
  }), 'pre-vote views contain your choice and never expose another player’s choice');
  check([...host.db.myPrevote.iter()].every(p => p.roomId !== roomId), 'host cannot read private pre-votes');
  await phase('assignments');
  await complete('assignments', acknowledge, true);
  await waitFor('all pitch rows available', () => humans.every(c => [...c.db.pitch.iter()].some(p => p.roomId === roomId && p.playerId === me(c).id)));
  await complete('pitching', (connection, index) => connection.reducers.submitTypedPitch({
    pitchId: [...connection.db.pitch.iter()].find(p => p.roomId === roomId && p.playerId === me(connection).id)!.id,
    text: ['I rest my case: this looks cozy.', 'An easy place for us to meet.', 'Let us make tonight happen.'][index],
  }));

  for (let index = 0; index < 3; index++) {
    const current = await phase('playback');
    check(current.currentPitchIdx === index, `playback: correct pitch index ${index}`);
    const optionId = options[(index + 1) % options.length].id;
    const expected = optionId === options[0].id ? 3 : 1;
    const start = performance.now();
    await humans[0].reducers.setLean({ roomId, optionId });
    await waitFor('anonymous sway totals synchronize', () => connections.every(c =>
      [...c.db.roomSway.iter()].some(s => s.roomId === roomId && s.optionId === optionId && s.leaning === expected)), 2_500);
    check(connections.every(c => room(c).phaseSeq === current.phaseSeq), `playback ${index + 1}: live lean reaches all clients in ${Math.round(performance.now() - start)}ms and does not skip listening`);
    check(humans.every(c => {
      const own = [...c.db.myLean.iter()].filter(l => l.roomId === roomId);
      return own.length === 1 && own[0].playerId === me(c).id;
    }), `playback ${index + 1}: each player sees exactly their own private lean`);
    await complete('playback', acknowledge, true);
  }

  await complete('vote', connection => connection.reducers.castVote({ roomId, optionId: options[0].id }));
  await complete('results', acknowledge, true);
  await phase('plan');
  await waitFor('shared final plan', () => connections.every(c => [...c.db.plan.iter()].some(p => p.roomId === roomId)));
  const plan = [...host.db.plan.iter()].find(p => p.roomId === roomId)!;
  check(plan.optionId === options[0].id, 'winning plan reflects all three votes');
  const expectedMinutes = category === 'movie' ? 150 : category === 'activity' ? 120 : 90;
  check(Number(plan.endAt.microsSinceUnixEpoch - plan.startAt.microsSinceUnixEpoch) / 60_000_000 === expectedMinutes, `${category} plan has the correct ${expectedMinutes}-minute duration`);
  for (let index = 0; index < humans.length; index++) {
    const start = performance.now();
    await humans[index].reducers.setRsvp({ planId: plan.id, status: 'yes' });
    await waitFor(`RSVP ${index + 1} live everywhere`, () => connections.every(c => [...c.db.rsvp.iter()].filter(r => r.planId === plan.id && r.status === 'yes').length === index + 1), 2_500);
    check(true, `plan: ${index + 1}/3 RSVPs synchronize in ${Math.round(performance.now() - start)}ms`);
  }
  await waitFor('three-person confirmation', () => connections.every(c => c.db.plan.id.find(plan.id)?.meetupConfirmed));
  check(connections.every(c => room(c).phase === 'plan'), 'final plan stays available for sharing after everyone RSVPs');

  log('');
  log('Final-completion latency across all four clients (normal timers):');
  timings.forEach(t => log(`  ${t.phase}: ${t.milliseconds}ms; normal deadline had ${t.deadlineRemainingMs}ms remaining`));
  log(`PASS ${checks} checks; ${Math.round(performance.now() - began)}ms total; room ${created.code} preserved for UI inspection.`);
}

try {
  await main();
} catch (error) {
  log(`FAIL ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  connections.forEach(connection => connection.disconnect());
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${transcript.join('\n')}\n`);
  log(`Evidence written to ${output}`);
}
