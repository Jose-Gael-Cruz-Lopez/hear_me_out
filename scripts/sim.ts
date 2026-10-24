// pnpm sim — drives a Friends room from lobby to plan against the local SpacetimeDB server.
// Two scripted "human" connections + three bots; the orchestrator runs in-process on fixtures
// (DEMO_MODE) unless --live is passed. Exits non-zero if any acceptance check fails.
import { DbConnection, tables, type Room } from '@hmo/bindings';
import { startOrchestrator } from '@hmo/orchestrator';

const URI = process.env.SPACETIMEDB_URI || 'ws://127.0.0.1:3000';
const DB = process.env.SPACETIMEDB_DB_NAME || 'hear-me-out';
const LIVE = process.argv.includes('--live');
const VERBOSE = process.argv.includes('--verbose');
const started = Date.now();
const t = () => `${((Date.now() - started) / 1000).toFixed(1).padStart(5)}s`;
const checks: { ok: boolean; label: string }[] = [];

function check(ok: boolean, label: string): void {
  checks.push({ ok, label });
  console.log(`${t()}  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
}

function connect(label: string): Promise<DbConnection> {
  return new Promise((resolve, reject) => {
    DbConnection.builder()
      .withUri(URI)
      .withDatabaseName(DB)
      .onConnect(conn => {
        conn
          .subscriptionBuilder()
          .onApplied(() => resolve(conn))
          .subscribe([
            tables.room,
            tables.player,
            tables.profilePublic,
            tables.option,
            tables.assignment,
            tables.pitch,
            tables.warmup,
            tables.vote,
            tables.award,
            tables.plan,
            tables.rsvp,
            tables.objection,
            tables.myProfileDraft,
            tables.myPrevote,
            tables.adminJobs,
          ]);
      })
      .onConnectError((_ctx, err) => reject(new Error(`${label}: ${err}`)))
      .build();
  });
}

async function waitFor<T>(label: string, fn: () => T | undefined | null | false, timeoutMs = 30_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for: ${label}`);
    await new Promise(r => setTimeout(r, 40));
  }
}

const quiet = <T>(p: Promise<T>) => p.catch(err => (VERBOSE ? console.log(`${t()}  (expected) ${String(err).slice(0, 120)}`) : undefined));

async function main(): Promise<void> {
  if (!VERBOSE) process.env.SPACETIMEDB_SDK_LOG_LEVEL = 'error';
  console.log(`Hear Me Out simulator → ${URI}/${DB} (${LIVE ? 'live APIs' : 'DEMO_MODE fixtures'})`);
  const orch = await startOrchestrator(LIVE ? {} : { demoMode: true });
  const host = await connect('host');
  const alex = await connect('alex');
  const sam = await connect('sam');
  const humans = [
    { name: 'Alex', avatar: '🦊', conn: alex },
    { name: 'Sam', avatar: '🐙', conn: sam },
  ];

  // Lobby
  const hostHex = host.identity!.toHexString();
  await host.reducers.createRoom({ mode: 'friends', tzOffsetMin: -new Date().getTimezoneOffset(), fastMode: true });
  let room: Room = await waitFor('room created', () => [...host.db.room.iter()].filter(r => r.hostIdentity.toHexString() === hostHex).sort((a, b) => Number(b.id - a.id))[0]);
  console.log(`${t()}  room ${room.code} created`);
  for (const h of humans) await h.conn.reducers.joinRoom({ code: room.code.toLowerCase(), name: h.name, avatar: h.avatar });
  for (let i = 0; i < 3; i++) await host.reducers.addBot({ roomId: room.id });
  await host.reducers.setRoomSetup({ roomId: room.id, category: 'food', locationLabel: process.env.DEMO_LOCATION || 'Palace of Fine Arts, San Francisco', lat: 0, lng: 0, hasGeo: false });
  const players = () => [...host.db.player.iter()].filter(p => p.roomId === room.id);
  check(players().length === 5, '2 humans + 3 bots joined');
  await waitFor('scout finished', () => host.db.room.id.find(room.id)?.scoutStatus === 'done', LIVE ? 150_000 : 20_000);
  console.log(`${t()}  scout: ${host.db.room.id.find(room.id)?.aiStatus}`);

  // Phase timeline + scripted human behavior
  const phases: string[] = [];
  let lastSeq = -1;
  const acted = new Set<string>();
  const once = (key: string, fn: () => Promise<unknown>) => {
    if (acted.has(key)) return;
    acted.add(key);
    void quiet(fn());
  };

  const tick = setInterval(() => {
    const r = host.db.room.id.find(room.id);
    if (!r) return;
    room = r;
    if (r.phaseSeq !== lastSeq) {
      lastSeq = r.phaseSeq;
      phases.push(r.phase);
      const extra = r.phase === 'playback' ? ` #${r.currentPitchIdx + 1}` : '';
      console.log(`${t()}  phase → ${r.phase}${extra}${r.aiStatus ? `  (${r.aiStatus})` : ''}`);
    }
    for (const h of humans) {
      const me = [...h.conn.db.player.iter()].find(p => p.roomId === r.id && p.name === h.name);
      if (!me) continue;
      const k = `${h.name}:${r.phaseSeq}`;
      if (r.phase === 'profiles') {
        once(`${h.name}:profile`, () =>
          h.conn.reducers.submitProfile({
            roomId: r.id,
            budgetMax: h.name === 'Alex' ? 2 : 3,
            dietary: h.name === 'Sam' ? ['vegetarian'] : [],
            maxTravelMin: 30,
            availability: [{ startMin: 18 * 60, endMin: 23 * 60 }],
            vibeChips: h.name === 'Alex' ? ['Spicy', 'Night owl'] : ['Cozy', 'Dessert'],
            pastedContext: h.name === 'Alex' ? 'I love ramen and tacos, cheap eats, and staying up late.' : 'Big on board games, boba and brunch.',
            socialLinks: [],
            consent: false,
          })
        );
        const draft = [...h.conn.db.myProfileDraft.iter()].find(dr => dr.playerId === me.id);
        if (draft?.status === 'ready') once(`${h.name}:approve`, () => h.conn.reducers.approveTags({ roomId: r.id, tags: draft.draftTags.map(x => x.tag) }));
      }
      if (r.phase === 'warmup') {
        const w = [...h.conn.db.warmup.iter()].find(x => x.playerId === me.id && x.roomId === r.id);
        if (w && !w.answer) once(`${k}:warm`, () => h.conn.reducers.answerWarmup({ warmupId: w.id, answer: 'a' }));
      }
      const opts = [...h.conn.db.option.iter()].filter(o => o.roomId === r.id).sort((a, b) => a.sortOrder - b.sortOrder);
      if (r.phase === 'prevote' && opts.length) once(k, () => h.conn.reducers.castPrevote({ roomId: r.id, optionId: opts[h.name === 'Alex' ? 0 : 1 % opts.length].id }));
      if (r.phase === 'pitching') {
        const mine = [...h.conn.db.pitch.iter()].find(p => p.roomId === r.id && p.playerId === me.id);
        if (mine) {
          const claim = h.name === 'Alex' ? 'It is open until 2am and has five stars!' : 'It is so cheap, and only a 2 minute walk.';
          once(k, () => h.conn.reducers.submitTypedPitch({ pitchId: mine.id, text: `Friends, jurors, hungry people. ${claim} Trust me, this is the one.` }));
        }
      }
      if (r.phase === 'playback' && h.name === 'Alex') {
        const playable = [...h.conn.db.pitch.iter()].filter(p => p.roomId === r.id && p.status !== 'waiting' && p.status !== 'skipped').sort((a, b) => a.playOrder - b.playOrder);
        const current = playable[r.currentPitchIdx];
        if (current && current.playerId !== me.id) {
          once(`${k}:obj`, () => h.conn.reducers.raiseObjection({ pitchId: current.id }));
          once(`${k}:react`, () => h.conn.reducers.react({ pitchId: current.id, emoji: '🔥' }));
        }
      }
      if (r.phase === 'vote' && opts.length) once(k, () => h.conn.reducers.castVote({ roomId: r.id, optionId: opts[opts.length - 1].id }));
      if (r.phase === 'plan') {
        const plan = [...h.conn.db.plan.iter()].find(p => p.roomId === r.id);
        if (plan) once(`${h.name}:rsvp`, () => h.conn.reducers.setRsvp({ planId: plan.id, status: 'yes' }));
      }
    }
  }, 30);

  await host.reducers.startGame({ roomId: room.id });
  await waitFor('plan phase', () => host.db.room.id.find(room.id)?.phase === 'plan', LIVE ? 240_000 : 90_000);
  await waitFor('plan copy ready', () => [...host.db.plan.iter()].find(p => p.roomId === room.id && p.status === 'ready'), 20_000);
  await waitFor('human RSVPs', () => [...host.db.rsvp.iter()].filter(x => x.roomId === room.id).length >= 5, 10_000);
  await new Promise(r => setTimeout(r, 500));
  clearInterval(tick);

  // ---------- Acceptance checks ----------
  const rid = room.id;
  const all = players();
  const options = [...host.db.option.iter()].filter(o => o.roomId === rid);
  check(['profiles', 'warmup', 'finalists', 'prevote', 'assignments', 'pitching', 'playback', 'vote', 'results', 'plan'].every(p => phases.includes(p)), `visited every phase: ${phases.filter((p, i) => phases[i - 1] !== p).join(' → ')}`);
  check(options.length >= 2 && options.length <= 4, `${options.length} finalists: ${options.map(o => o.title).join(' | ')}`);
  check(options.every(o => o.perPlayerFit.length === all.length), 'every finalist has a fit line for every player');
  check(options.every(o => o.placeId && o.lat !== 0 && o.mapsUrl.startsWith('https://')), 'finalists are real places (place ids, coordinates, Maps links)');
  const sam1 = all.find(p => p.name === 'Sam')!;
  const vegOk = options.every(o => o.stretchNote.startsWith("Couldn't") || o.dietaryNotes.some(n => /vegetarian|vegan/i.test(n)) || !o.dietaryNotes.length);
  check(vegOk, "Sam's vegetarian need is confirmed (or clearly flagged) on every finalist");
  const drafts = [...sam.db.myProfileDraft.iter()];
  check(drafts.every(dr => dr.playerId === sam1.id), 'my_profile_draft only shows your own draft');
  check([...alex.db.adminJobs.iter()].length === 0, 'players cannot see the admin job queue');
  const pubTags = host.db.profilePublic.playerId.find(sam1.id)?.approvedTags ?? [];
  check(pubTags.length > 0, `approved tags are public after approval: ${pubTags.join(', ')}`);

  const assignments = [...host.db.assignment.iter()].filter(a => a.roomId === rid);
  check(assignments.length === all.length, 'every player got an assignment');
  const alexPrevote = [...alex.db.myPrevote.iter()][0];
  const alexPlayer = all.find(p => p.name === 'Alex')!;
  const alexAssign = assignments.find(a => a.playerId === alexPlayer.id);
  check(!!alexPrevote && !!alexAssign && alexAssign.optionId !== alexPrevote.optionId, 'Alex defends an option that was not their secret pick');
  check(assignments.every(a => a.stylePrompt.startsWith('Defend') && a.hints.length === 3), `style prompts + 3 hints, e.g. "${alexAssign?.stylePrompt}"`);

  const pitches = [...host.db.pitch.iter()].filter(p => p.roomId === rid);
  check(pitches.length === all.length && pitches.every(p => p.status === 'ready'), 'all pitches ready (typed + bot)');
  const rulings = pitches.filter(p => p.rulingKind === 'sustained' || p.rulingKind === 'verified');
  check(rulings.length >= 1, `fact-check rulings: ${rulings.map(p => `[${p.rulingKind}] ${p.rulingText}`).join(' / ')}`);
  check(pitches.every(p => p.rulingKind !== 'pending'), 'no ruling left pending');
  check([...host.db.objection.iter()].some(o => o.roomId === rid), 'an OBJECTION! was raised');

  const votes = [...host.db.vote.iter()].filter(v => v.roomId === rid);
  check(votes.length === all.length, `${votes.length} votes tallied`);
  const finalRoom = host.db.room.id.find(rid)!;
  const winner = options.find(o => o.id === finalRoom.winnerOptionId);
  check(!!winner, `winner: ${winner?.title}${finalRoom.tiebreakText ? ` (${finalRoom.tiebreakText})` : ''}`);
  const awards = [...host.db.award.iter()].filter(a => a.roomId === rid);
  check(awards.some(a => a.kind === 'most_persuasive'), `Most Persuasive: ${awards.filter(a => a.kind === 'most_persuasive').map(a => `${all.find(p => p.id === a.playerId)?.name}: ${a.text}`).join('; ')}`);
  check(awards.some(a => a.kind === 'best_line'), `Best line: "${awards.find(a => a.kind === 'best_line')?.text}"`);

  const plan = [...host.db.plan.iter()].find(p => p.roomId === rid)!;
  const start = new Date(Number(plan.startAt.microsSinceUnixEpoch / 1000n));
  check(plan.startAt.microsSinceUnixEpoch > 0n && plan.endAt.microsSinceUnixEpoch > plan.startAt.microsSinceUnixEpoch, `plan: ${plan.slotLabel} (${start.toString().slice(0, 21)}), can't make it: ${plan.cantMake.length}`);
  check(plan.inviteText.length > 0 && plan.whyForEach.length > 0, `invite: "${plan.inviteText.slice(0, 90)}…"`);
  const rsvps = [...host.db.rsvp.iter()].filter(x => x.roomId === rid);
  check(rsvps.length === all.length, `${rsvps.length} RSVPs`);

  const elapsed = (Date.now() - started) / 1000;
  const failed = checks.filter(c => !c.ok);
  console.log(`\n${failed.length === 0 ? '✅ sim passed' : `❌ ${failed.length} check(s) failed`} — ${checks.length} checks in ${elapsed.toFixed(1)}s`);
  await host.reducers.deleteRoom({ roomId: rid }).catch(() => undefined);
  orch.stop();
  for (const c of [host, alex, sam]) c.disconnect();
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch(err => {
  console.error(`${t()}  ❌ sim crashed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
