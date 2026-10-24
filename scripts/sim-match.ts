// pnpm sim:match — "Find my people": 3 strangers queue up, connect their (simulated) Muse, approve tags,
// get matched into one server-owned room automatically, and play through to a confirmed meetup.
import { startOrchestrator } from '@hmo/orchestrator';
import { autopilot, check, connect, finish, t, waitFor } from './simlib';

const MEMORY = 'Loves spicy ramen and board game nights. Budget about $20. Free after 7pm.';

async function main(): Promise<void> {
  console.log('Hear Me Out matchmaking simulator (DEMO_MODE fixtures)');
  const orch = await startOrchestrator({ demoMode: true });
  const names = ['Ivy', 'Jun', 'Kai'];
  const seekers = await Promise.all(names.map(n => connect(n)));
  const [a] = seekers;

  for (const [i, c] of seekers.entries()) {
    await c.reducers.joinMatchmaking({ category: 'food', locationLabel: process.env.DEMO_LOCATION || 'San Francisco', tzOffsetMin: -new Date().getTimezoneOffset(), name: names[i], avatar: '🙂', confirmed18: true, fastMode: true });
  }
  const queue = await waitFor('queue room', () => [...a.db.room.iter()].find(r => r.mode === 'queue' && r.fastMode));
  const inQueue = () => [...a.db.player.iter()].filter(p => p.roomId === queue.id);
  await waitFor('3 in queue', () => inQueue().length >= 3, 5000).catch(() => undefined);
  check(inQueue().length >= 3, `3 strangers joined the ${queue.category} queue (${queue.code})`);

  // Each builds a profile in the queue (simulated Muse memory) and approves the drafted tags.
  for (const [i, c] of seekers.entries()) {
    const me = await waitFor('me', () => [...c.db.player.iter()].find(p => p.roomId === queue.id && p.name === names[i]));
    await c.reducers.submitProfile({ roomId: queue.id, budgetMax: 2, dietary: [], maxTravelMin: 30, availability: [{ startMin: 18 * 60, endMin: 23 * 60 }], vibeChips: ['Spicy'], pastedContext: MEMORY, socialLinks: [], consent: false });
    const draft = await waitFor('draft', () => [...c.db.myProfileDraft.iter()].find(d => d.playerId === me.id && d.status === 'ready'));
    await c.reducers.approveTags({ roomId: queue.id, tags: draft.draftTags.map(x => x.tag) });
  }

  // The matcher moves all three into a new room and starts the game.
  const room = await waitFor('matched room', () => {
    const ids = new Set(names.map(n => [...a.db.player.iter()].find(p => p.name === n && p.roomId !== queue.id)?.roomId));
    const id = [...ids][0];
    return ids.size === 1 && id !== undefined ? a.db.room.id.find(id) : null;
  }, 20_000);
  console.log(`${t()}  matched into ${room.groupName} (${room.code}): ${room.aiStatus}`);
  check(room.mode === 'strangers' && !room.isPublic, 'the group got its own private strangers room');
  check(seekers.every(c => !room.hostIdentity.isEqual(c.identity!)), 'no human host: the server owns the room');
  const shared = await waitFor('shared tags', () => {
    const r = a.db.room.id.find(room.id);
    return r && r.vibeTags.length > 0 ? r.vibeTags : null;
  }, 10_000).catch(() => [] as string[]);
  check(shared.length > 0, `the group shares tags: ${shared.slice(0, 3).map(x => `#${x}`).join(' ')}`);
  check([...a.db.player.iter()].filter(p => p.roomId === room.id && p.isBot).length === 0, 'no bots in a matched meetup');

  const stops = seekers.map((c, i) => autopilot(c, names[i], () => room.id, { rsvp: 'yes' }));
  await waitFor('plan', () => a.db.room.id.find(room.id)?.phase === 'plan', 90_000);
  const plan = await waitFor('confirmed', () => [...a.db.plan.iter()].find(p => p.roomId === room.id && p.meetupConfirmed), 15_000).catch(() => undefined);
  const option = plan && a.db.option.id.find(plan.optionId);
  check(!!plan, `meetup confirmed with 3 RSVPs: ${option?.title}, ${plan?.slotLabel}`);

  for (const s of stops) s();
  for (const id of [room.id, queue.id]) await orch.conn.reducers.deleteRoom({ roomId: id }).catch(() => undefined);
  orch.stop();
  finish();
}

main().catch(err => {
  console.error(`${t()}  ❌ sim crashed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
