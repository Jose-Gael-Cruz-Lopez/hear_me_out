// pnpm sim:strangers — two public meetups pick the same place and merge tables.
// Checks the lobby browser, vibe matching, safety rules, the meetup card and a two-room merge.
import type { DbConnection, Room } from '@hmo/bindings';
import { startOrchestrator } from '@hmo/orchestrator';
import { autopilot, check, connect, finish, rejects, t, waitFor } from './simlib';

const DEMO = process.env.DEMO_LOCATION || 'Palace of Fine Arts, San Francisco';

async function makeRoom(host: DbConnection, tags: string[]): Promise<Room> {
  const hex = host.identity!.toHexString();
  await host.reducers.createRoom({ mode: 'strangers', tzOffsetMin: -new Date().getTimezoneOffset(), fastMode: true });
  const room = await waitFor('room', () => [...host.db.room.iter()].filter(r => r.hostIdentity.toHexString() === hex).sort((a, b) => Number(b.id - a.id))[0]);
  await host.reducers.setMeetupDetails({ roomId: room.id, vibeTags: tags, targetStartMin: 20 * 60 });
  await host.reducers.setRoomSetup({ roomId: room.id, category: 'food', locationLabel: DEMO, lat: 37.8029, lng: -122.4484, hasGeo: true });
  return host.db.room.id.find(room.id)!;
}

async function main(): Promise<void> {
  console.log('Hear Me Out strangers simulator (DEMO_MODE fixtures)');
  const orch = await startOrchestrator({ demoMode: true });
  const [hostA, hostB, visitor] = await Promise.all([connect('hostA'), connect('hostB'), connect('visitor')]);
  const a = await Promise.all(['Ana', 'Ben', 'Cy', 'Dee'].map(n => connect(n)));
  const b = await Promise.all(['Eli', 'Fay', 'Gus'].map(n => connect(n)));

  const roomA = await makeRoom(hostA, ['board-games', 'spicy-food', 'ramen']);
  const roomB = await makeRoom(hostB, ['karaoke', 'tacos']);
  console.log(`${t()}  public rooms: ${roomA.groupName} (${roomA.code}) and ${roomB.groupName} (${roomB.code})`);

  // Lobby browser + vibe match
  await visitor.reducers.browseLobbies({ tags: ['board-games', 'spicy-food'], lat: 37.80, lng: -122.44, hasGeo: true });
  const matches = await waitFor('matches', () => {
    const m = [...visitor.db.myLobbyMatches.iter()];
    return m.length >= 2 ? m : null;
  });
  const mA = matches.find(m => m.roomId === roomA.id);
  const mB = matches.find(m => m.roomId === roomB.id);
  check(!!mA && !!mB && mA.score > mB.score, `vibe match ranks ${roomA.groupName} (${mA?.score}%) above ${roomB.groupName} (${mB?.score}%)`);
  check(!!mA && mA.sharedTags.includes('board-games') && mA.blurb.length > 0, `match blurb: "${mA?.blurb}"`);
  check([...a[0].db.myLobbyMatches.iter()].length === 0, "other people can't see your lobby matches");

  // Safety rules on join
  check(!!(await rejects(a[0].reducers.joinRoom({ code: roomA.code, name: 'Ana', avatar: '🦊' }))), 'public rooms reject a join without the 18+ confirmation');
  check(!!(await rejects(a[0].reducers.joinPublicRoom({ code: roomA.code, name: 'Ana Smith', avatar: '🦊', confirmed18: true }))), 'public rooms reject full names (first names only)');
  check(!!(await rejects(a[0].reducers.joinPublicRoom({ code: roomA.code, name: 'Ana', avatar: '🦊', confirmed18: false }))), 'public rooms reject joins without 18+');
  for (const [i, c] of a.entries()) await c.reducers.joinPublicRoom({ code: roomA.code, name: ['Ana', 'Ben', 'Cy', 'Dee'][i], avatar: '🙂', confirmed18: true });
  for (const [i, c] of b.entries()) await c.reducers.joinPublicRoom({ code: roomB.code, name: ['Eli', 'Fay', 'Gus'][i], avatar: '🙂', confirmed18: true });

  // Block & report: one report keeps Dee in, a second removes her.
  const dee = await waitFor('Dee', () => [...hostA.db.player.iter()].find(p => p.roomId === roomA.id && p.name === 'Dee'));
  await a[0].reducers.reportPlayer({ roomId: roomA.id, playerId: dee.id, reason: 'test' });
  check(!!hostA.db.player.id.find(dee.id), 'one report blocks for the reporter but keeps the player in');
  await a[2].reducers.reportPlayer({ roomId: roomA.id, playerId: dee.id, reason: 'test' });
  await waitFor('Dee removed', () => !hostA.db.player.id.find(dee.id), 5000).catch(() => undefined);
  check(!hostA.db.player.id.find(dee.id), 'two independent reports remove the player from the meetup');
  a[3].disconnect();
  const membersA = a.slice(0, 3);

  // Both rooms play; everyone votes for a place that is a finalist in both rooms.
  const sharedPick = (opts: { id: bigint; placeId: string }[]) => {
    const otherPlaces = new Set([...hostB.db.option.iter()].filter(o => o.roomId === roomB.id).map(o => o.placeId));
    return (opts.find(o => otherPlaces.has(o.placeId)) ?? opts[0])?.id;
  };
  const sharedPickB = (opts: { id: bigint; placeId: string }[]) => {
    const placesA = [...hostA.db.option.iter()].filter(o => o.roomId === roomA.id);
    const chosen = [...hostA.db.vote.iter()].find(v => v.roomId === roomA.id);
    const place = placesA.find(o => o.id === chosen?.optionId)?.placeId;
    return (opts.find(o => o.placeId === place) ?? opts.find(o => placesA.some(p => p.placeId === o.placeId)) ?? opts[0])?.id;
  };
  const stops = [
    ...membersA.map((c, i) => autopilot(c, ['Ana', 'Ben', 'Cy'][i], () => roomA.id, { pickVote: sharedPick, rsvp: 'yes', mergeYes: true })),
    ...b.map((c, i) => autopilot(c, ['Eli', 'Fay', 'Gus'][i], () => roomB.id, { pickVote: sharedPickB, rsvp: i < 2 ? 'yes' : 'no', mergeYes: i !== 2 })),
  ];
  await hostA.reducers.startGame({ roomId: roomA.id });
  await hostB.reducers.startGame({ roomId: roomB.id });
  await waitFor('both plans', () => hostA.db.room.id.find(roomA.id)?.phase === 'plan' && hostB.db.room.id.find(roomB.id)?.phase === 'plan', 120_000);
  console.log(`${t()}  both meetups reached the plan`);

  const planA = () => [...hostA.db.plan.iter()].find(p => p.roomId === roomA.id);
  const planB = () => [...hostA.db.plan.iter()].find(p => p.roomId === roomB.id);
  const winA = hostA.db.option.id.find(planA()!.optionId);
  const winB = hostA.db.option.id.find(planB()!.optionId);
  check(!!winA && !!winB && winA.placeId === winB.placeId, `both groups picked ${winA?.title}`);

  const offer = await waitFor('merge offer', () => [...hostA.db.mergeOffer.iter()].find(o => o.roomA === roomA.id && o.roomB === roomB.id), 10_000).catch(() => undefined);
  check(!!offer, `merge offer created: "${roomA.groupName} + ${roomB.groupName} at ${offer?.venueTitle}"`);
  const accepted = await waitFor('merge accepted', () => {
    const o = [...hostA.db.mergeOffer.iter()].find(x => x.roomA === roomA.id && x.roomB === roomB.id);
    return o?.status === 'accepted' ? o : null;
  }, 15_000).catch(() => undefined);
  check(!!accepted, 'majority yes in both rooms merges the tables (one "no" in the other room is outvoted)');
  check(planA()?.mergedWithRoomId === roomB.id && planB()?.mergedWithRoomId === roomA.id, 'both plans point at each other after the merge');
  check(!!accepted?.introText, `merge intro: "${accepted?.introText}"`);

  await waitFor('RSVPs', () => [...hostA.db.rsvp.iter()].filter(x => x.roomId === roomA.id && x.status === 'yes').length >= 3, 10_000).catch(() => undefined);
  check(planA()?.meetupConfirmed === true, `meetup A confirmed with ${[...hostA.db.rsvp.iter()].filter(x => x.roomId === roomA.id && x.status === 'yes').length} yes RSVPs`);
  check(planB()?.meetupConfirmed === false, 'meetup B (2 yes RSVPs) is not confirmed yet');

  for (const s of stops) s();
  for (const r of [roomA, roomB]) await (r === roomA ? hostA : hostB).reducers.deleteRoom({ roomId: r.id }).catch(() => undefined);
  orch.stop();
  finish();
}

main().catch(err => {
  console.error(`${t()}  ❌ sim crashed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
