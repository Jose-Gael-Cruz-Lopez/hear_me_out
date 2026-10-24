// pnpm sim — drives a Friends room from lobby to plan against the local SpacetimeDB server.
// Two scripted "human" connections + three bots; the orchestrator runs in-process on fixtures
// (DEMO_MODE) unless --live is passed. Exits non-zero if any acceptance check fails.
import { tables, type Room } from '@hmo/bindings';
import { startOrchestrator } from '@hmo/orchestrator';
import { check, checks, connect, DB, quiet, rejects, sineWav, t, URI, VERBOSE, waitFor } from './simlib';

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function sayToFile(text: string): Uint8Array {
  const file = join(mkdtempSync(join(tmpdir(), 'hmo-say-')), 'pitch.aiff');
  execFileSync('say', ['-o', file, text]);
  return new Uint8Array(readFileSync(file));
}

const LIVE = process.argv.includes('--live');
/** --muse: live Meta Muse, venues from recorded fixtures (saves Apify credit). */
const MUSE = process.argv.includes('--muse');
const started = Date.now();

async function main(): Promise<void> {
  if (!VERBOSE) process.env.SPACETIMEDB_SDK_LOG_LEVEL = 'error';
  console.log(`Hear Me Out simulator → ${URI}/${DB} (${MUSE ? 'live Muse + recorded venues' : LIVE ? 'live APIs' : 'DEMO_MODE fixtures'})`);
  const orch = await startOrchestrator(MUSE ? { demoMode: false, apifyToken: '' } : { demoMode: !LIVE });
  // With live Muse, upload real speech (macOS `say`) so transcription has words to hear.
  const speech = MUSE ? sayToFile('Members of the jury! This place is so cheap, and only a two minute walk. Trust me, this is the one!') : null;
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

  // Live Sway Meter observations, sampled during playback.
  const sway = { tvRows: 0, tvFields: '', maxLeaning: 0, prevoted: 0, alexLeaned: 0n, alexSaw: 0n, tvSawAlexMove: false, samSawOthers: false };
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
        if (mine && h.name === 'Alex') {
          once(k, () => h.conn.reducers.submitTypedPitch({ pitchId: mine.id, text: 'Friends, jurors, hungry people. It is open until 2am and has five stars! Trust me, this is the one.' }));
        }
        if (mine && h.name === 'Sam') {
          // A real recording path: audio bytes stored in SpacetimeDB + the browser's caption as the fallback transcript.
          once(k, () =>
            h.conn.reducers.uploadPitchAudio({
              pitchId: mine.id,
              mime: speech ? 'audio/aiff' : 'audio/wav',
              bytes: speech ?? sineWav(6.5), // ~208 KB, the size of a 30 s Opus pitch: proves large reducer args work
              durationMs: 6500,
              browserTranscript: 'It is so cheap, and only a 2 minute walk. Trust me, this is the one.',
            })
          );
        }
      }
      if (r.phase === 'playback' && h.name === 'Alex') {
        const playable = [...h.conn.db.pitch.iter()].filter(p => p.roomId === r.id && p.status !== 'waiting' && p.status !== 'skipped').sort((a, b) => a.playOrder - b.playOrder);
        const current = playable[r.currentPitchIdx];
        if (current && current.playerId !== me.id) {
          once(`${k}:obj`, () => h.conn.reducers.raiseObjection({ pitchId: current.id }));
          once(`${k}:react`, () => h.conn.reducers.react({ pitchId: current.id, emoji: '🔥' }));
        }
        // Live Sway Meter: Alex leans toward whatever is being pitched; the TV only ever sees totals.
        if (current) {
          once(`${k}:lean`, () => h.conn.reducers.setLean({ roomId: r.id, optionId: current.optionId }).then(() => (sway.alexLeaned = current.optionId)));
          const tv = [...host.db.roomSway.iter()].filter(x => x.roomId === r.id);
          if (tv.length) {
            sway.tvRows = Math.max(sway.tvRows, tv.length);
            sway.tvFields = Object.keys(tv[0]!).sort().join(',');
            sway.maxLeaning = Math.max(sway.maxLeaning, tv.reduce((n, x) => n + x.leaning, 0));
            sway.prevoted = tv.reduce((n, x) => n + x.prevoted, 0);
            if (sway.alexLeaned && tv.some(x => x.optionId === sway.alexLeaned && x.leaning > 0)) sway.tvSawAlexMove = true;
          }
          const mine = [...h.conn.db.myLean.iter()];
          if (mine[0]) sway.alexSaw = mine[0].optionId;
        }
      }
      if (r.phase === 'playback' && h.name === 'Sam' && [...h.conn.db.myLean.iter()].some(l => l.playerId !== me.id)) sway.samSawOthers = true;
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
  check(pitches.length === all.length && pitches.every(p => p.status === 'ready'), 'all pitches ready (typed, recorded, bot)');
  const samPitch = pitches.find(p => p.playerId === sam1.id);
  check(
    !!samPitch && samPitch.audioMediaId !== 0n && samPitch.transcriptSource === (MUSE ? 'muse' : LIVE ? samPitch.transcriptSource : 'browser'),
    `recorded pitch stored in SpacetimeDB media and transcribed (source: ${samPitch?.transcriptSource}): "${samPitch?.transcript.slice(0, 80)}"`
  );
  const rulings = pitches.filter(p => p.rulingKind === 'sustained' || p.rulingKind === 'verified');
  check(rulings.length >= 1, `fact-check rulings: ${rulings.map(p => `[${p.rulingKind}] ${p.rulingText}`).join(' / ')}`);
  check(pitches.every(p => p.rulingKind !== 'pending'), 'no ruling left pending');
  check([...host.db.objection.iter()].some(o => o.roomId === rid), 'an OBJECTION! was raised');

  // Menu check (Sam is vegetarian, so every food finalist gets one; DEMO_MODE can't crawl, and says so)
  // A live crawl takes ~40 s; the fast simulated game can finish first, so wait for it here.
  await waitFor('menu check', () => [...host.db.menuProof.iter()].filter(m => m.roomId === rid).every(m => m.status !== 'checking'), LIVE ? 120_000 : 10_000).catch(() => undefined);
  const proofs = [...host.db.menuProof.iter()].filter(m => m.roomId === rid);
  for (const m of proofs) {
    const o = options.find(x => x.id === m.optionId);
    console.log(`${t()}  menu  ${o?.title}: ${m.status}${m.dishes.length ? ` → ${m.dishes.map(x => `[${x.diet}] ${x.dish}`).join(' | ')}` : ''}${m.sourceUrl ? `  (${m.sourceUrl})` : ''}`);
  }
  check(proofs.length === options.length && proofs.every(m => m.diets.includes('vegetarian')), `menu check queued for all ${options.length} finalists (diets: ${proofs[0]?.diets.join(', ')})`);
  check(proofs.every(m => m.status !== 'checking'), `no menu check left spinning (${[...new Set(proofs.map(m => m.status))].join(', ')})`);
  if (!LIVE) check(proofs.every(m => m.status === 'unavailable' && m.dishes.length === 0), 'offline mode labels the menu as not checked instead of inventing dishes');

  // Live Sway Meter
  check(sway.tvRows === options.length, `the TV saw live sway totals for all ${options.length} finalists during playback`);
  check(sway.tvFields === 'leaning,optionId,prevoted,roomId', `sway rows are anonymous totals only (fields: ${sway.tvFields})`);
  check(sway.prevoted === all.length && sway.maxLeaning <= all.length, `sway totals add up: ${sway.prevoted} pre-votes, at most ${sway.maxLeaning} leaning`);
  check(sway.alexLeaned !== 0n && sway.alexSaw === sway.alexLeaned && sway.tvSawAlexMove, "Alex's lean changed live, Alex can see it, and the TV totals moved");
  check(!sway.samSawOthers, "my_lean never shows anyone else's lean");
  check(!('lean' in tables), 'the raw lean table is private (no client accessor)');
  check([...host.db.roomSway.iter()].filter(x => x.roomId === rid).length === 0, 'the sway meter is hidden outside playback');
  check(!!(await rejects(alex.reducers.setLean({ roomId: rid, optionId: options[0]!.id }))), 'leaning is only allowed during playback');

  const votes = [...host.db.vote.iter()].filter(v => v.roomId === rid);
  check(votes.length === all.length, `${votes.length} votes tallied`);
  const finalRoom = host.db.room.id.find(rid)!;
  const winner = options.find(o => o.id === finalRoom.winnerOptionId);
  check(!!winner, `winner: ${winner?.title}${finalRoom.tiebreakText ? ` (${finalRoom.tiebreakText})` : ''}`);
  const awards = [...host.db.award.iter()].filter(a => a.roomId === rid);
  check(awards.some(a => a.kind === 'most_persuasive'), `Most Persuasive: ${awards.filter(a => a.kind === 'most_persuasive').map(a => `${all.find(p => p.id === a.playerId)?.name}: ${a.text}`).join('; ')}`);
  check(awards.some(a => a.kind === 'best_line'), `Best line: "${awards.find(a => a.kind === 'best_line')?.text}"`);

  const plan = [...host.db.plan.iter()].find(p => p.roomId === rid)!;
  // Busyness-aware timing: only with real Google popular times for the winner, never invented.
  const winnerOpt = options.find(o => o.id === plan.optionId);
  const hasBusy = winnerOpt?.busyness.length === 168;
  if (hasBusy) console.log(`${t()}  timing  ${winnerOpt?.title}: earliest free ${plan.naiveStartMin} min (${plan.naiveBusyPct}% busy) → chose ${plan.slotLabel} (${plan.busyPct}% busy)`);
  check(
    hasBusy ? plan.weekday >= 0 && plan.busyPct >= 0 && plan.naiveStartMin >= 0 && plan.busyPct <= plan.naiveBusyPct : plan.weekday === -1 && plan.busyPct === -1,
    !hasBusy
      ? 'no popular times for the winner, so the plan claims no busyness'
      : plan.busyPct < plan.naiveBusyPct
        ? `plan avoids the rush: ${plan.naiveBusyPct}% → ${plan.busyPct}% busy`
        : `the earliest free slot was already the best trade-off (${plan.busyPct}% busy)`
  );
  const start = new Date(Number(plan.startAt.microsSinceUnixEpoch / 1000n));
  check(plan.startAt.microsSinceUnixEpoch > 0n && plan.endAt.microsSinceUnixEpoch > plan.startAt.microsSinceUnixEpoch, `plan: ${plan.slotLabel} (${start.toString().slice(0, 21)}), can't make it: ${plan.cantMake.length}`);
  check(plan.inviteText.length > 0 && plan.whyForEach.length > 0, `invite: "${plan.inviteText.slice(0, 90)}…"`);
  const rsvps = [...host.db.rsvp.iter()].filter(x => x.roomId === rid);
  check(rsvps.length === all.length, `${rsvps.length} RSVPs`);

  if (MUSE) {
    await waitFor('poster', () => [...host.db.plan.iter()].find(p => p.roomId === rid && (p.posterMediaId !== 0n || p.posterUrl)), 45_000).catch(() => undefined);
    const p2 = [...host.db.plan.iter()].find(p => p.roomId === rid);
    check(!!p2 && p2.posterMediaId !== 0n, 'Muse Image poster stored in SpacetimeDB media');
    console.log('\n--- What Muse wrote ---');
    for (const o of options) console.log(`finalist ${o.title}: ${o.fitSummary} | ${o.perPlayerFit.map(f => f.line).join(' / ')}`);
    for (const a of assignments) console.log(`brief: ${a.stylePrompt} | ${a.hints.join(' / ')}`);
    for (const w of [...host.db.warmup.iter()].filter(w => w.roomId === rid)) console.log(`warmup: ${w.question} [${w.choiceA} | ${w.choiceB}]`);
    for (const p of pitches.filter(p => p.transcriptSource === 'bot')) console.log(`bot pitch: ${p.transcript}`);
    console.log(`invite: ${p2?.inviteText}`);
    for (const w of p2?.whyForEach ?? []) console.log(`why: ${w.line}`);
    for (const i of p2?.icebreakers ?? []) console.log(`icebreaker: ${i}`);
    console.log(`tags (Alex): ${host.db.profilePublic.playerId.find(alexPlayer.id)?.approvedTags.join(', ')}`);
  }

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
