// pnpm sim:match — "Find my people": 3 strangers queue up, connect their (simulated) Muse, approve tags,
// get matched into one server-owned room automatically, and play through to a confirmed meetup.
import { startOrchestrator } from '@hmo/orchestrator';
import { autopilot, check, connect, finish, rejects, t, waitFor } from './simlib';

const MEMORY = 'Loves spicy ramen and board game nights. Budget about $20. Free after 7pm.';

async function main(): Promise<void> {
  console.log('Hear Me Out matchmaking simulator (DEMO_MODE fixtures)');
  const orch = await startOrchestrator({ demoMode: true });
  const names = ['Ivy', 'Jun', 'Kai'];
  const seekers = await Promise.all(names.map(n => connect(n)));
  const [a] = seekers;
  const where = process.env.DEMO_LOCATION || 'San Francisco';

  // A stale "Ivy" who queued and closed the window. The real Ivy must still get in: the queue is shared.
  const ghost = await connect('Ghost');
  await ghost.reducers.joinMatchmaking({ category: 'food', locationLabel: where, tzOffsetMin: 0, name: 'Ivy', avatar: '🙂', confirmed18: true, fastMode: true });
  ghost.disconnect();

  for (const [i, c] of seekers.entries()) {
    await c.reducers.joinMatchmaking({ category: 'food', locationLabel: process.env.DEMO_LOCATION || 'San Francisco', tzOffsetMin: -new Date().getTimezoneOffset(), name: names[i], avatar: '🙂', confirmed18: true, fastMode: true });
  }
  const queue = await waitFor('queue room', () => [...a.db.room.iter()].find(r => r.mode === 'queue' && r.fastMode));
  const inQueue = () => [...a.db.player.iter()].filter(p => p.roomId === queue.id);
  await waitFor('3 in queue', () => inQueue().length >= 3, 5000).catch(() => undefined);
  check(inQueue().length >= 3, `3 strangers joined the ${queue.category} queue (${queue.code})`);
  check(inQueue().filter(p => p.name === 'Ivy').length >= 2, 'a name someone already used in the queue does not block joining');

  // Each builds a profile in the queue (simulated Muse memory) and approves the drafted tags.
  for (const [i, c] of seekers.entries()) {
    const me = await waitFor('me', () => [...c.db.player.iter()].find(p => p.roomId === queue.id && p.identity.isEqual(c.identity!)));
    await c.reducers.submitProfile({ roomId: queue.id, budgetMax: 2, dietary: [], maxTravelMin: 30, availability: [{ startMin: 18 * 60, endMin: 23 * 60 }], vibeChips: ['Spicy'], pastedContext: MEMORY, socialLinks: [], consent: false });
    const draft = await waitFor('draft', () => [...c.db.myProfileDraft.iter()].find(d => d.playerId === me.id && d.status === 'ready'));
    await c.reducers.approveTags({ roomId: queue.id, tags: draft.draftTags.map(x => x.tag) });
  }

  // The matcher moves all three into a new room and starts the game.
  const room = await waitFor('matched room', () => {
    const ids = new Set(seekers.map(c => [...a.db.player.iter()].find(p => p.identity.isEqual(c.identity!) && p.roomId !== queue.id)?.roomId));
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

  // WhatsApp group for the people going: generated name + intro, one attendee pastes the invite.
  const LINK = 'https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv';
  const [, b, c] = seekers;
  const chat = (conn: typeof a) => [...conn.db.myGroupChat.iter()].find(g => g.roomId === room.id);
  const before = await waitFor('group chat info', () => chat(b), 5000).catch(() => undefined);
  check(!!before && before.inviteUrl === '' && before.suggestedName.includes(option?.title ?? '?') && before.intro.includes(option?.title ?? '?'),
    `attendees get a generated group name: "${before?.suggestedName}"`);
  check((await rejects(a.reducers.setGroupChatLink({ roomId: room.id, url: 'https://wa.me/15551234567' }))) !== null, 'a non-invite link is rejected');
  await a.reducers.setGroupChatLink({ roomId: room.id, url: LINK });
  const after = await waitFor('invite visible', () => chat(c)?.inviteUrl === LINK && chat(c), 5000).catch(() => undefined);
  check(!!after && after.shareUrl.startsWith('https://wa.me/?text=') && decodeURIComponent(after.shareUrl).includes(LINK), 'everyone going sees the invite and a wa.me share link');
  check(chat(b)?.canEdit === false && (await rejects(b.reducers.setGroupChatLink({ roomId: room.id, url: LINK.replace('Ab', 'Zz') }))) !== null,
    'only whoever added it can replace it');
  const outsider = await connect('Outsider');
  check([...outsider.db.myGroupChat.iter()].length === 0, 'someone outside the meetup sees no group chat');
  check((await rejects(outsider.reducers.setGroupChatLink({ roomId: room.id, url: LINK }))) !== null, 'an outsider cannot set the link');
  const myPlan = [...c.db.plan.iter()].find(p => p.roomId === room.id)!;
  await c.reducers.setRsvp({ planId: myPlan.id, status: 'no' });
  const hidden = await waitFor('hidden after no', () => !chat(c), 5000).catch(() => false);
  check(hidden === true, "switching your RSVP to no hides the group chat");
  outsider.disconnect();

  // Friends game: rejoining under your name from a new window keeps your seat; a clash gets a number.
  const host = await connect('Host');
  await host.reducers.createRoom({ mode: 'friends', tzOffsetMin: 0, fastMode: true });
  const friends = await waitFor('friends room', () => [...host.db.room.iter()].find(r => r.mode === 'friends' && r.hostIdentity.isEqual(host.identity!)));
  const first = await connect('Zed');
  await first.reducers.joinRoom({ code: friends.code, name: 'Zed', avatar: '🙂' });
  const seat = await waitFor('Zed seat', () => [...host.db.player.iter()].find(p => p.roomId === friends.id && p.name === 'Zed'));
  first.disconnect();
  await waitFor('Zed offline', () => host.db.player.id.find(seat.id)?.connected === false, 5000);
  const again = await connect('Zed again');
  await again.reducers.joinRoom({ code: friends.code, name: 'zed', avatar: '😎' });
  const reclaimed = await waitFor('Zed back', () => {
    const p = host.db.player.id.find(seat.id);
    return p?.identity.isEqual(again.identity!) && p.connected ? p : null;
  }, 5000).catch(() => null);
  check(!!reclaimed && [...host.db.player.iter()].filter(p => p.roomId === friends.id).length === 1, 'rejoining a friends game under your name from a new window keeps your seat');
  const twin = await connect('Other Zed');
  await twin.reducers.joinRoom({ code: friends.code, name: 'Zed', avatar: '🙂' });
  const numbered = await waitFor('Zed 2', () => [...host.db.player.iter()].find(p => p.roomId === friends.id && p.identity.isEqual(twin.identity!)), 5000).catch(() => null);
  check(numbered?.name === 'Zed 2', 'a second Zed joins as "Zed 2" instead of getting an error');
  await host.reducers.deleteRoom({ roomId: friends.id }).catch(() => undefined);
  for (const c of [again, twin, host]) c.disconnect();

  for (const id of [room.id, queue.id]) await orch.conn.reducers.deleteRoom({ roomId: id }).catch(() => undefined);
  orch.stop();
  finish();
}

main().catch(err => {
  console.error(`${t()}  ❌ sim crashed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
