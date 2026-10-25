// Local-only, typed-pitch audit of Food/Activity/Movie in host-less Find my people rooms.
// Run with the fixture worker already running; no microphone or paid API requests.
import { mkdirSync, writeFileSync } from 'node:fs';
import { autopilot, check, checks, connect, URI, waitFor } from './simlib';
import type { DbConnection } from '@hmo/bindings';

const receipt: string[] = [];
const connections: DbConnection[] = [];
const stops: (() => void)[] = [];
const originalLog = console.log;
console.log = (...args: unknown[]) => { receipt.push(args.map(String).join(' ')); originalLog(...args); };

try {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(URI).hostname)) throw new Error('Category audit only runs locally.');
  for (const category of ['food', 'activity', 'movie']) {
    const names = ['Ari', 'Bea', 'Cam'];
    const people = await Promise.all(names.map(name => connect(`${category} ${name}`)));
    connections.push(...people);
    const [first] = people;
    for (const [i, c] of people.entries()) await c.reducers.joinMatchmaking({ category, locationLabel: 'Palace of Fine Arts, San Francisco', tzOffsetMin: -420, name: names[i], avatar: '🙂', confirmed18: true, fastMode: true });
    const queue = await waitFor('own category queue', () => {
      const player = [...first.db.player.iter()].find(p => p.identity.equals(first.identity!));
      return player && first.db.room.id.find(player.roomId);
    });
    check(queue.mode === 'queue' && queue.category === category, `${category}: correct category queue`);
    for (const c of people) {
      const me = await waitFor('player', () => [...c.db.player.iter()].find(p => p.identity.equals(c.identity!) && p.roomId === queue.id));
      await c.reducers.submitProfile({ roomId: queue.id, budgetMax: 2, dietary: [], maxTravelMin: 30, availability: [{ startMin: 1080, endMin: 1380 }], vibeChips: ['Board games'], pastedContext: '', socialLinks: [], consent: false });
      await waitFor('private draft', () => [...c.db.myProfileDraft.iter()].find(d => d.playerId === me.id && d.status === 'ready'));
      await c.reducers.approveTags({ roomId: queue.id, tags: ['board-games', 'cozy-spots'] });
    }
    const room = await waitFor('matched group', () => {
      const players = people.map(c => [...first.db.player.iter()].find(p => p.identity.equals(c.identity!) && p.roomId !== queue.id));
      const id = players[0]?.roomId;
      return id && players.every(p => p?.roomId === id) ? first.db.room.id.find(id) : null;
    }, 20_000);
    check(room.category === category && room.mode === 'strangers' && !room.isPublic, `${category}: matched group retains category in its own room`);
    const currentStops = people.map((c, i) => autopilot(c, names[i], () => room.id, { rsvp: 'yes' }));
    stops.push(...currentStops);
    const plan = await waitFor('confirmed plan', () => [...first.db.plan.iter()].find(p => p.roomId === room.id && p.meetupConfirmed), 60_000);
    const options = [...first.db.option.iter()].filter(o => o.roomId === room.id);
    check(options.length >= 2 && new Set(options.map(o => o.placeId)).size === options.length, `${category}: distinct playable finalists`);
    if (category === 'movie') check(options.every(o => /movie theater|cinema/i.test(o.category)), 'movie: only cinemas in matched game');
    check(people.every(c => c.db.room.id.find(room.id)?.phase === 'plan'), `${category}: every player reaches the final plan`);
    check([...first.db.rsvp.iter()].filter(r => r.planId === plan.id && r.status === 'yes').length === 3, `${category}: three independent RSVPs confirm the meetup`);
    const length = Number(plan.endAt.microsSinceUnixEpoch - plan.startAt.microsSinceUnixEpoch) / 60_000_000;
    check(length === (category === 'movie' ? 150 : category === 'activity' ? 120 : 90), `${category}: correct ${length}-minute plan duration`);
    currentStops.forEach(stop => stop());
    console.log(`${category}: confirmed ${first.db.option.id.find(plan.optionId)?.title} in room ${room.code}`);
  }
  if (checks.some(c => !c.ok)) throw new Error('Category matchmaking checks failed');
  console.log(`PASS ${checks.length} category matchmaking checks`);
} catch (error) {
  console.log(`FAIL ${String(error)}`);
  process.exitCode = 1;
} finally {
  stops.forEach(stop => stop());
  connections.forEach(c => c.disconnect());
  mkdirSync('docs/ui-verification/category-flows', { recursive: true });
  writeFileSync('docs/ui-verification/category-flows/matchmaking.txt', receipt.join('\n') + '\n');
}
