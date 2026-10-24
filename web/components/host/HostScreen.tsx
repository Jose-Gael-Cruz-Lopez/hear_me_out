'use client';

// The big screen (host laptop / TV). Renders the shared game board and, when this browser is the
// lobby's host, drives the AI: it calls our API routes and writes results via host-only reducers.
import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useAction, useGame, useLoadedOnce, type Game } from '@/lib/stdb';
import { rankSlots } from '@/lib/game/slots';
import { DIETS, DISTANCES, FREE_SLOTS, label, VIBES } from '@/lib/game/questions';
import type { OptionsResponse, PlanResponse } from '@/lib/api-types';
import type { Option } from '@/src/module_bindings/types';
import { Avatar, Countdown, ErrorBox, OptionMeta, posterSrc, price, ReconnectBanner, Spinner } from '../ui';
import { PlanCard } from '../PlanCard';
import { HostVoiceProvider, useHostVoice } from './HostVoice';

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `${url} failed`);
  return json as T;
}

const PHASE_NAMES: Record<string, string> = {
  LOBBY: 'Lobby',
  PROFILE: 'Questions',
  OPTIONS: 'The contenders',
  PITCH: 'Pitch time',
  SHOWTIME: 'Showtime',
  VOTE: 'Vote',
  RESULT: 'Winner',
  PLAN: 'The plan',
};

export function HostScreen({ code }: { code: string }) {
  return (
    <HostVoiceProvider>
      <HostInner code={code} />
    </HostVoiceProvider>
  );
}

function HostInner({ code }: { code: string }) {
  const g = useGame(code);
  const [ai, setAi] = useState('');
  useEffect(() => {
    fetch('/api/status')
      .then(r => r.json())
      .then(s => setAi(s.ai))
      .catch(() => {});
  }, []);

  const loaded = useLoadedOnce(g.connected && g.ready);
  if (!loaded) {
    return (
      <main className="stage center">
        <Spinner /> Connecting to the game board…
      </main>
    );
  }
  if (!g.lobby) {
    return (
      <main className="stage center">
        <h1>No game with code {g.code}</h1>
        <a className="btn" href="/host">
          Start a new game
        </a>
      </main>
    );
  }

  return (
    <main className="stage">
      <ReconnectBanner show={!g.connected} />
      <header className="stage-top">
        <div className="logo">Pitch Fight</div>
        <div className="code-box">{g.code}</div>
        <span className="badge">{PHASE_NAMES[g.phase] ?? g.phase}</span>
        <Countdown deadlineMicros={g.lobby.deadlineMicros} />
        <div className="spacer" />
        {ai && <span className={`badge ${ai === 'mock' ? 'warn' : ''}`}>AI host: {ai === 'mock' ? 'mock mode' : 'Meta Muse'}</span>}
        {!g.isHost && <span className="badge warn">Spectator screen</span>}
      </header>
      {g.lobby.notice && g.phase !== 'LOBBY' && g.phase !== 'PROFILE' && <div className="muted small">ℹ️ {g.lobby.notice}</div>}
      <Phase g={g} />
    </main>
  );
}

function Phase({ g }: { g: Game }) {
  switch (g.phase) {
    case 'LOBBY':
      return <Lobby g={g} />;
    case 'PROFILE':
      return <Profiles g={g} />;
    case 'OPTIONS':
      return <Options g={g} />;
    case 'PITCH':
      return <Pitching g={g} />;
    case 'SHOWTIME':
      return <Showtime g={g} />;
    case 'VOTE':
      return <Vote g={g} />;
    case 'RESULT':
      return <Result g={g} />;
    case 'PLAN':
      return <Plan g={g} />;
    default:
      return <div>Unknown phase {g.phase}</div>;
  }
}

// ---------------------------------------------------------------- LOBBY

function Lobby({ g }: { g: Game }) {
  const { say } = useHostVoice();
  const act = useAction();
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/play/${g.code}` : '';
  useEffect(() => {
    if (joinUrl) QRCode.toDataURL(joinUrl, { margin: 1, width: 440 }).then(setQr);
  }, [joinUrl]);
  useEffect(() => {
    say(`Welcome to Pitch Fight! Grab your phones and join with code ${g.code.split('').join(' ')}.`, 'welcome');
  }, [say, g.code]);
  const last = g.players[g.players.length - 1];
  useEffect(() => {
    if (last) say(`${last.name} has entered the arena.`, `joined-${last.id}`);
  }, [say, last]);

  const share = async () => {
    const text = `Join my Pitch Fight 🥊 — we're deciding where to go. Code ${g.code}: ${joinUrl}`;
    if (navigator.share) {
      try {
        await navigator.share({ text, url: joinUrl });
        return;
      } catch {}
    }
    await navigator.clipboard.writeText(text);
    setCopied(true);
  };

  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 40 }}>
      <div className="stack" style={{ flex: 1, minWidth: 300 }}>
        <div className="muted" style={{ fontSize: '1.4rem', fontWeight: 800 }}>
          Join on your phone at <span style={{ color: 'var(--cyan)' }}>{joinUrl.replace(/^https?:\/\//, '')}</span>
        </div>
        <div className="huge-code">{g.code}</div>
        <div className="row">
          <button className="btn cyan" onClick={share}>
            {copied ? '✅ Copied — paste it in the group chat' : '🔗 Copy invite for the group chat'}
          </button>
        </div>
        <h2 style={{ marginTop: 20 }}>Players ({g.players.length})</h2>
        <div className="players">
          {g.players.length === 0 && <div className="muted">Waiting for the first brave soul…</div>}
          {g.players.map(p => (
            <Avatar
              key={String(p.id)}
              p={p}
              onRemove={g.isHost ? () => act.run(() => g.conn!.reducers.removePlayer({ code: g.code, playerId: p.id })) : undefined}
            />
          ))}
        </div>
        {g.isHost && (
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn ghost" disabled={act.busy} onClick={() => act.run(() => g.conn!.reducers.addBot({ code: g.code }))}>
              🤖 Add test bot
            </button>
            <button
              className="btn big pink"
              disabled={g.players.length < 2 || act.busy}
              onClick={() => act.run(() => g.conn!.reducers.startProfiles({ code: g.code }))}
            >
              Everybody&apos;s in → Start
            </button>
            {g.players.length < 2 && <span className="muted">Need at least 2 players (bots count — great for solo testing)</span>}
          </div>
        )}
        <ErrorBox error={act.error} />
      </div>
      {qr && <img className="qr" src={qr} alt={`QR code to join ${g.code}`} style={{ width: 280, height: 280 }} />}
    </div>
  );
}

// ---------------------------------------------------------------- PROFILE

function sharedAnswers(p: Game['profiles'][number]) {
  const hidden = new Set(p.hidden);
  const out: string[] = [];
  if (!hidden.has('budget')) out.push(price(p.budget));
  if (!hidden.has('diet') && p.diet !== 'any') out.push(label(DIETS, p.diet));
  if (!hidden.has('distance')) out.push(label(DISTANCES, p.distance));
  if (!hidden.has('vibe')) out.push(VIBES.find(v => v.value === p.vibe)?.emoji ?? '');
  if (!hidden.has('freeWhen')) out.push(p.freeWhen.map(f => label(FREE_SLOTS, f)).join(' / '));
  return out.filter(Boolean).join(' · ');
}

function Profiles({ g }: { g: Game }) {
  const { say } = useHostVoice();
  const act = useAction();
  const [status, setStatus] = useState('');
  useEffect(() => {
    say('Answer five quick questions on your phone. Budget, diet, distance, when you are free, and what you are craving. Nobody judges. Much.', 'profile-intro');
  }, [say]);
  const answered = g.players.filter(p => g.profiles.some(pr => pr.playerId === p.id));

  const findSpots = () =>
    act.run(async () => {
      setStatus('Scouting the neighborhood…');
      say('Scouting the neighborhood. Give me a second.', `scouting-${Date.now()}`);
      const now = new Date();
      const best = rankSlots(
        g.profiles.map(p => p.freeWhen),
        now
      )[0]!;
      const res = await postJson<OptionsResponse>('/api/options', {
        code: g.code,
        lat: g.lobby!.lat,
        lng: g.lobby!.lng,
        members: g.profiles.map(p => ({
          playerId: String(p.playerId),
          name: g.players.find(x => x.id === p.playerId)?.name ?? '?',
          budget: p.budget,
          diet: p.diet,
          distance: p.distance,
          freeWhen: [...p.freeWhen],
          vibe: p.vibe,
        })),
        players: g.players.map(p => ({ playerId: String(p.id), name: p.name })),
        when: { day: best.start.getDay(), minute: best.start.getHours() * 60 + best.start.getMinutes(), label: best.label },
      });
      setStatus('Writing your assignments…');
      await g.conn!.reducers.setOptions({
        code: g.code,
        options: res.options,
        assignments: res.assignments.map(a => ({ ...a, playerId: BigInt(a.playerId) })),
        notice: res.notice,
      });
    }).finally(() => setStatus(''));

  return (
    <div className="stack">
      <h1 className="phase-title display">Tell me what you want</h1>
      <p className="muted" style={{ fontSize: '1.3rem' }}>
        {answered.length}/{g.players.length} answered · players choose what the group gets to see
      </p>
      <div className="stack">
        {g.players.map(p => {
          const pr = g.profiles.find(x => x.playerId === p.id);
          return (
            <div key={String(p.id)} className="row">
              <Avatar p={p} extra={pr ? <span className="check">✓</span> : <Spinner />} />
              {pr && <span className="muted" style={{ fontSize: '1.1rem' }}>{sharedAnswers(pr)}</span>}
            </div>
          );
        })}
      </div>
      {g.isHost && (
        <div className="row">
          <button className="btn big pink" disabled={answered.length === 0 || act.busy} onClick={findSpots}>
            {act.busy ? (
              <>
                <Spinner /> {status}
              </>
            ) : answered.length < g.players.length ? (
              `Find spots now (${g.players.length - answered.length} still answering)`
            ) : (
              '🔎 Find our spots'
            )}
          </button>
        </div>
      )}
      <ErrorBox error={act.error} />
    </div>
  );
}

// ---------------------------------------------------------------- OPTIONS

function defendersOf(g: Game, o: Option) {
  return g.assignments.filter(a => a.optionId === o.id).map(a => g.players.find(p => p.id === a.playerId)!).filter(Boolean);
}

/** Host-only background work once options exist: posters + the AI's pitch for undefended options. */
function useOptionPrep(g: Game) {
  const started = useRef(new Set<string>());
  useEffect(() => {
    if (!g.isHost || !g.conn) return;
    for (const o of g.options) {
      const pk = `poster-${o.id}`;
      if (!o.posterUrl && !started.current.has(pk)) {
        started.current.add(pk);
        const url = posterSrc(o);
        // Warm the poster cache, then record its URL on the board for every screen.
        fetch(url).finally(() => g.conn?.reducers.setPoster({ optionId: o.id, posterUrl: url }).catch(() => {}));
      }
      const hk = `host-${o.id}`;
      if (!o.hostLine && defendersOf(g, o).length === 0 && !started.current.has(hk)) {
        started.current.add(hk);
        postJson<{ line: string }>('/api/react', { kind: 'orphan', optionName: o.name, category: o.category, blurb: o.blurb, rating: o.rating })
          .then(r => g.conn?.reducers.setHostLine({ optionId: o.id, line: r.line }))
          .catch(() => started.current.delete(hk));
      }
    }
  }, [g]);
}

function OptionGrid({ g, render }: { g: Game; render?: (o: Option) => React.ReactNode }) {
  return (
    <div className="options-grid">
      {g.options.map(o => (
        <div key={String(o.id)} className="option-card pop">
          <img src={posterSrc(o)} alt={`Poster for ${o.name}`} />
          <div className="body">
            <b style={{ fontSize: '1.15rem' }}>{o.name}</b>
            <OptionMeta o={o} />
            {render?.(o)}
          </div>
        </div>
      ))}
    </div>
  );
}

function Options({ g }: { g: Game }) {
  const { say } = useHostVoice();
  const act = useAction();
  useOptionPrep(g);
  useEffect(() => {
    if (g.options.length)
      say(
        `Here are your contenders: ${g.options.map(o => o.name).join(', ')}. Check your phone to see which one you must defend. Spoiler: it is probably not your favorite.`,
        `options-${g.options[0]!.id}`
      );
  }, [say, g.options]);
  return (
    <div className="stack">
      <h1 className="phase-title display">The contenders</h1>
      <OptionGrid
        g={g}
        render={o => {
          const d = defendersOf(g, o);
          return (
            <div className="small" style={{ fontWeight: 700 }}>
              {d.length ? `🛡️ Defended by ${d.map(p => p.name).join(' & ')}` : '🤖 The AI host will defend this one'}
            </div>
          );
        }}
      />
      {g.isHost && (
        <div className="row">
          <button className="btn big pink" disabled={act.busy} onClick={() => act.run(() => g.conn!.reducers.startPitching({ code: g.code }))}>
            🎤 Start pitching
          </button>
        </div>
      )}
      <ErrorBox error={act.error} />
    </div>
  );
}

// ---------------------------------------------------------------- PITCH

/** Host-only: ask the AI to write each bot's pitch (in character, following its prompt), then submit it. */
function useBotPitches(g: Game) {
  const started = useRef(new Set<string>());
  useEffect(() => {
    if (!g.isHost || !g.conn) return;
    for (const b of g.players.filter(p => p.isBot)) {
      const k = String(b.id);
      const a = g.assignments.find(x => x.playerId === b.id);
      const o = a && g.options.find(x => x.id === a.optionId);
      if (!a || !o || started.current.has(k) || g.pitches.some(x => x.playerId === b.id)) continue;
      started.current.add(k);
      postJson<{ line: string }>('/api/react', { kind: 'bot', botName: b.name, optionName: o.name, category: o.category, prompt: a.prompt })
        .then(r => g.conn?.reducers.botPitch({ code: g.code, playerId: b.id, text: r.line }))
        .catch(() => started.current.delete(k));
    }
  }, [g]);
}

function Pitching({ g }: { g: Game }) {
  const { say } = useHostVoice();
  const act = useAction();
  useOptionPrep(g);
  useBotPitches(g);
  useEffect(() => {
    say('Phones out! Thirty seconds of voice, or type it if the room is too loud. The clock is ticking.', 'pitch-intro');
  }, [say]);
  const done = g.players.filter(p => g.pitches.some(x => x.playerId === p.id));
  return (
    <div className="stack">
      <h1 className="phase-title display">Make your case</h1>
      <p className="muted" style={{ fontSize: '1.3rem' }}>
        {done.length}/{g.players.length} pitches locked in
      </p>
      <div className="players">
        {g.players.map(p => {
          const pt = g.pitches.find(x => x.playerId === p.id);
          return <Avatar key={String(p.id)} p={p} extra={pt ? <span className="check">{pt.mode === 'voice' ? '🎙️✓' : '✍️✓'}</span> : <Spinner />} />;
        })}
      </div>
      {g.isHost && (
        <div className="row">
          <button className="btn big pink" disabled={act.busy} onClick={() => act.run(() => g.conn!.reducers.startShowtime({ code: g.code }))}>
            🎬 Showtime{done.length < g.players.length ? ' (latecomers forfeit)' : ''}
          </button>
        </div>
      )}
      <ErrorBox error={act.error} />
    </div>
  );
}

// ---------------------------------------------------------------- SHOWTIME

function useReactions(g: Game) {
  const started = useRef(new Set<string>());
  useEffect(() => {
    if (!g.isHost || !g.conn) return;
    for (const pt of g.pitches) {
      const k = String(pt.playerId);
      if (pt.reaction || started.current.has(k)) continue;
      started.current.add(k);
      const player = g.players.find(p => p.id === pt.playerId);
      const option = g.options.find(o => o.id === pt.optionId);
      const prompt = g.assignments.find(a => a.playerId === pt.playerId)?.prompt ?? '';
      postJson<{ line: string }>('/api/react', {
        kind: 'pitch',
        playerName: player?.name ?? 'Someone',
        optionName: option?.name ?? 'this place',
        prompt,
        pitch: pt.text,
      })
        .then(r => g.conn?.reducers.setReaction({ code: g.code, playerId: pt.playerId, reaction: r.line }))
        .catch(() => started.current.delete(k));
    }
  }, [g]);
}

function Showtime({ g }: { g: Game }) {
  const { say } = useHostVoice();
  const act = useAction();
  useOptionPrep(g);
  useReactions(g);
  const idx = g.lobby!.showtimeIndex;
  const o = g.options[idx];
  const pitches = o ? g.pitches.filter(p => p.optionId === o.id) : [];
  const defenders = o ? defendersOf(g, o) : [];
  const step = (delta: number) => act.run(() => g.conn!.reducers.nextPitch({ code: g.code, delta }));

  useEffect(() => {
    if (!o) {
      say("That's everyone! Time to vote. You can't vote for the place you defended. Choose wisely.", 'curtain');
      return;
    }
    say(`Contender number ${idx + 1}: ${o.name}.`, `slide-${o.id}`);
    for (const p of defenders) {
      const pt = pitches.find(x => x.playerId === p.id);
      say(pt ? `${p.name} says: ${pt.text}` : `${p.name} did not submit a pitch. Bold strategy.`, `pitch-${o.id}-${p.id}`);
      if (pt?.reaction) say(pt.reaction, `react-${o.id}-${p.id}`);
    }
    if (defenders.length === 0 && o.hostLine) say(o.hostLine, `hostline-${o.id}`);
  }, [say, o, idx, defenders, pitches]);

  return (
    <div className="stack">
      {o ? (
        <div className="showtime" key={String(o.id)}>
          <img className="poster pop" src={posterSrc(o)} alt={`Poster for ${o.name}`} style={{ borderRadius: 18 }} />
          <div className="stack" style={{ gap: 18 }}>
            <div className="muted" style={{ fontWeight: 800 }}>
              CONTENDER {idx + 1} OF {g.options.length}
            </div>
            <h1 className="phase-title display">{o.name}</h1>
            <OptionMeta o={o} />
            {defenders.map(p => {
              const pt = pitches.find(x => x.playerId === p.id);
              const prompt = g.assignments.find(a => a.playerId === p.id)?.prompt;
              return (
                <div key={String(p.id)} className="stack" style={{ gap: 10 }}>
                  <div className="speech pop">
                    <div className="who">
                      {p.name} {pt?.mode === 'voice' ? '🎙️' : '✍️'} · {prompt}
                    </div>
                    {pt ? pt.text : <i>(silence… the defense rests)</i>}
                  </div>
                  {pt && (
                    <div className="speech host pop" style={{ marginLeft: 40 }}>
                      <div className="who">🤖 AI host</div>
                      {pt.reaction || <Spinner />}
                    </div>
                  )}
                </div>
              );
            })}
            {defenders.length === 0 && (
              <div className="speech host pop">
                <div className="who">🤖 AI host (nobody defended this one)</div>
                {o.hostLine || <Spinner />}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="center stack" style={{ alignItems: 'center' }}>
          <h1 className="phase-title display">That&apos;s a wrap!</h1>
          <p className="muted" style={{ fontSize: '1.4rem' }}>
            {g.options.length} contenders. {g.pitches.length} pitches. One winner.
          </p>
        </div>
      )}
      {g.isHost && (
        <div className="row">
          <button className="btn ghost" disabled={act.busy || idx === 0} onClick={() => step(-1)}>
            ◀ Back
          </button>
          {o ? (
            <button className="btn big" disabled={act.busy} onClick={() => step(1)}>
              Next ▶
            </button>
          ) : null}
          <button
            className={`btn big ${o ? 'ghost' : 'pink'}`}
            disabled={act.busy}
            onClick={() => act.run(() => g.conn!.reducers.startVoting({ code: g.code }))}
          >
            🗳️ Open voting
          </button>
        </div>
      )}
      <ErrorBox error={act.error} />
    </div>
  );
}

// ---------------------------------------------------------------- VOTE

function Vote({ g }: { g: Game }) {
  const { say } = useHostVoice();
  const act = useAction();
  // No client-side closing: the server closes voting on the last vote or when the timer runs out.
  useEffect(() => {
    say('Voting is open! One vote each, and no voting for yourself. I am watching.', 'vote-intro');
  }, [say]);
  return (
    <div className="stack">
      <h1 className="phase-title display">Vote on your phone</h1>
      <p className="muted" style={{ fontSize: '1.3rem' }}>
        {g.votes.length}/{g.players.length} voted
      </p>
      <div className="players">
        {g.players.map(p => (
          <Avatar key={String(p.id)} p={p} extra={g.votes.some(v => v.voterId === p.id) ? <span className="check">✓</span> : <Spinner />} />
        ))}
      </div>
      <OptionGrid g={g} />
      {g.isHost && (
        <div className="row">
          <button className="btn big pink" disabled={act.busy || g.votes.length === 0} onClick={() => act.run(() => g.conn!.reducers.closeVoting({ code: g.code }))}>
            Close voting
          </button>
        </div>
      )}
      <ErrorBox error={act.error} />
    </div>
  );
}

// ---------------------------------------------------------------- RESULT

function Result({ g }: { g: Game }) {
  const { say } = useHostVoice();
  const act = useAction();
  const winner = g.options.find(o => o.id === g.lobby!.winnerOptionId);
  const tally = useMemo(
    () => g.options.map(o => ({ o, n: g.votes.filter(v => v.optionId === o.id).length })).sort((a, b) => b.n - a.n),
    [g.options, g.votes]
  );
  const max = Math.max(1, ...tally.map(t => t.n));
  useEffect(() => {
    if (!winner) return;
    const defenders = defendersOf(g, winner).map(p => p.name);
    say(
      `${g.lobby!.tieBreak ? 'It was a tie, so I flipped a very official coin. ' : ''}And the winner is… ${winner.name}! ${
        defenders.length ? `Congratulations to ${defenders.join(' and ')}, you silver-tongued legend.` : 'Defended by me, obviously.'
      }`,
      `winner-${winner.id}`
    );
  }, [say, winner, g]);

  const lockPlan = () =>
    act.run(async () => {
      const now = new Date();
      const slots = rankSlots(
        g.profiles.map(p => p.freeWhen),
        now
      ).map(s => ({ slot: s.slot, label: s.label, count: s.count, startIso: s.start.toISOString() }));
      const plan = await postJson<PlanResponse>('/api/plan', { optionName: winner!.name, total: g.players.length, slots });
      await g.conn!.reducers.setPlan({ code: g.code, whenLabel: plan.whenLabel, startIso: plan.startIso, durationMin: 90, blurb: plan.blurb });
    });

  if (!winner) return null;
  return (
    <div className="showtime">
      <img className="poster pop" src={posterSrc(winner)} alt={`Poster for ${winner.name}`} style={{ borderRadius: 18, outline: '6px solid var(--yellow)' }} />
      <div className="stack" style={{ gap: 18 }}>
        <div className="muted" style={{ fontWeight: 800 }}>
          🏆 THE WINNER{g.lobby!.tieBreak ? ' (tie broken by the AI host)' : ''}
        </div>
        <h1 className="phase-title display pop" style={{ color: 'var(--yellow)' }}>
          {winner.name}
        </h1>
        <OptionMeta o={winner} />
        <div className="stack">
          {tally.map(({ o, n }) => (
            <div key={String(o.id)}>
              <div className="row" style={{ justifyContent: 'space-between', fontWeight: 800 }}>
                <span>{o.name}</span>
                <span>
                  {n} vote{n === 1 ? '' : 's'}
                </span>
              </div>
              <div className="bar">
                <div style={{ width: `${(n / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
        {g.isHost && (
          <div className="row">
            <button className="btn big pink" disabled={act.busy} onClick={lockPlan}>
              {act.busy ? <Spinner /> : '📅'} Make it the plan
            </button>
          </div>
        )}
        <ErrorBox error={act.error} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- PLAN

function Plan({ g }: { g: Game }) {
  const { say } = useHostVoice();
  const act = useAction();
  useEffect(() => {
    if (g.plan) say(`${g.plan.blurb} Tap I'm in on your phone, and add it to your calendar.`, `plan-${g.plan.startIso}`);
  }, [say, g.plan]);
  return (
    <div className="stack" style={{ maxWidth: 900 }}>
      <PlanCard g={g} />
      {g.isHost && (
        <div className="row">
          <button className="btn ghost" disabled={act.busy} onClick={() => act.run(() => g.conn!.reducers.playAgain({ code: g.code }))}>
            🔁 Play again with this crew
          </button>
          <a className="btn ghost" href="/host">
            New game
          </a>
        </div>
      )}
      <ErrorBox error={act.error} />
    </div>
  );
}
