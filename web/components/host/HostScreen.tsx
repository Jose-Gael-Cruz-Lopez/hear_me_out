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
import { Confetti, Countdown, Dot, ErrorBox, OptionMeta, PhaseTrack, posterSrc, price, ReconnectBanner, RemoveButton, Ring, Spinner, useScores, useSecondsLeft } from '../shared/ui';
import { PlanCard } from '../shared/PlanCard';
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

const SEATS = 8;
/** Matches PITCH_SECONDS in spacetime/src/index.ts; the server's deadline is what actually ends the phase. */
const PITCH_SECONDS = 90;

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
      <main className="stage center" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="logo pulse" style={{ fontSize: '3rem' }}>
          Pitch Fight
        </div>
        <div className="muted" style={{ fontWeight: 800 }}>
          <Spinner /> Connecting to the game board…
        </div>
      </main>
    );
  }
  if (!g.lobby) {
    return (
      <main className="stage center" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <h1 className="display" style={{ fontSize: '3rem' }}>
          No game with code {g.code}
        </h1>
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
        <PhaseTrack phase={g.phase} variant="stage" />
        <span className="phase-label">{PHASE_NAMES[g.phase] ?? g.phase}</span>
        <Countdown deadlineMicros={g.lobby.deadlineMicros} />
        {ai && <span className={`badge ${ai === 'mock' ? 'warn' : 'good'}`}>AI host · {ai === 'mock' ? 'mock' : 'Meta Muse'}</span>}
        {!g.isHost && <span className="badge warn">Spectator</span>}
      </header>
      {g.lobby.notice && g.phase !== 'LOBBY' && g.phase !== 'PROFILE' && (
        <div className="muted small" style={{ fontWeight: 700 }}>
          ℹ️ {g.lobby.notice}
        </div>
      )}
      <div key={g.phase} className="stack slideup" style={{ gap: 20 }}>
        <Phase g={g} />
      </div>
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

  const empty = Math.max(0, SEATS - g.players.length);

  return (
    <div className="row" style={{ alignItems: 'stretch', gap: 40 }}>
      <div className="stack" style={{ flex: 1, minWidth: 300, gap: 14 }}>
        <div className="muted" style={{ fontSize: '1.35rem', fontWeight: 800 }}>
          Join on your phone at <span style={{ color: 'var(--cyan)' }}>{joinUrl.replace(/^https?:\/\//, '')}</span>
        </div>
        <div className="huge-code" aria-label={`Room code ${g.code}`}>
          {g.code.split('').map((c, i) => (
            <span key={i}>{c}</span>
          ))}
        </div>
        <div className="row" style={{ alignItems: 'baseline', marginTop: 6 }}>
          <div className="display" style={{ fontSize: '1.9rem' }}>
            Fighters
          </div>
          <div className="muted" style={{ fontWeight: 800, fontSize: '1.1rem' }}>
            {g.players.length} / {SEATS} seats
          </div>
        </div>
        <div className="seats">
          {g.players.map(p => (
            <div key={String(p.id)} className={`seat ${p.connected ? '' : 'off'}`}>
              <Dot p={p} bob />
              <div>
                <b style={{ fontSize: '1.15rem' }}>{p.name}</b>
                <span className="tag">{p.isBot ? 'TEST BOT' : p.connected ? 'READY' : 'RECONNECTING'}</span>
              </div>
              {g.isHost && <RemoveButton name={p.name} onClick={() => act.run(() => g.conn!.reducers.removePlayer({ code: g.code, playerId: p.id }))} />}
            </div>
          ))}
          {Array.from({ length: empty }, (_, i) => (
            <div key={`e${i}`} className="seat empty">
              <span className="dot">?</span>
              {i === 0 && g.players.length === 0 ? 'Waiting for the first brave soul…' : 'Open seat'}
            </div>
          ))}
        </div>
        <ErrorBox error={act.error} />
      </div>
      <div className="stack" style={{ width: 300, gap: 16 }}>
        {qr ? <img className="qr" src={qr} alt={`QR code to join ${g.code}`} /> : <div className="qr" />}
        <button className="btn cyan" onClick={share}>
          {copied ? '✅ Copied — paste it in the group chat' : '🔗 Copy invite for the group chat'}
        </button>
        <div className="spacer" />
        {g.isHost && (
          <button className="btn ghost" disabled={act.busy || g.players.length >= SEATS} onClick={() => act.run(() => g.conn!.reducers.addBot({ code: g.code }))}>
            🤖 Add test bot
          </button>
        )}
        {g.isHost && (
          <button
            className="btn big pink breathe"
            disabled={g.players.length < 2 || act.busy}
            onClick={() => act.run(() => g.conn!.reducers.startProfiles({ code: g.code }))}
          >
            <span>
              Everybody&apos;s in → Start
              <span className="sub">{g.players.length < 2 ? 'Need at least 2 fighters (bots count)' : `${g.players.length} fighters ready`}</span>
            </span>
          </button>
        )}
      </div>
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
  if (hidden.size) out.push(`🙈 ${hidden.size} hidden`);
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
  const cravings = g.profiles.filter(p => !p.hidden.includes('vibe')).map(p => VIBES.find(v => v.value === p.vibe)?.emoji ?? '');
  const hiddenCount = g.profiles.reduce((n, p) => n + p.hidden.length, 0);

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
    <div className="row" style={{ alignItems: 'stretch', gap: 32 }}>
      <div className="stack" style={{ flex: 1, minWidth: 320 }}>
        <h1 className="phase-title display">Tell me what you want</h1>
        <p className="muted" style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>
          {answered.length}/{g.players.length} locked in · players choose what the big screen sees
        </p>
        <div className="stack" style={{ gap: 10 }}>
          {g.players.map((p, i) => {
            const pr = g.profiles.find(x => x.playerId === p.id);
            return (
              <div key={String(p.id)} className="status-row" style={{ animationDelay: `${i * 0.06}s` }}>
                <div className="who">
                  <Dot p={p} />
                  {p.name}
                </div>
                <div className="shared muted" style={{ fontWeight: 800 }}>
                  {pr ? sharedAnswers(pr) : <span className="pulse">answering…</span>}
                </div>
                <div className={`tick ${pr ? 'on' : ''}`}>{pr ? '✓' : ''}</div>
              </div>
            );
          })}
        </div>
        <ErrorBox error={act.error} />
      </div>
      <div className="stack" style={{ width: 340, gap: 14 }}>
        <div className="card stack">
          <div className="eyebrow">Group taste so far</div>
          <div style={{ fontSize: 40, letterSpacing: 6, minHeight: 48 }}>{cravings.join('') || <span className="muted pulse">…</span>}</div>
          {hiddenCount > 0 && (
            <div className="muted small" style={{ fontWeight: 700 }}>
              {hiddenCount} answer{hiddenCount === 1 ? '' : 's'} hidden — still filtering the spots.
            </div>
          )}
        </div>
        <div className="spacer" />
        {g.isHost && (
          <button className="btn big pink" disabled={answered.length === 0 || act.busy} onClick={findSpots}>
            {act.busy ? (
              <>
                <Spinner /> {status}
              </>
            ) : answered.length < g.players.length ? (
              <span>
                🔎 Find spots now<span className="sub">{g.players.length - answered.length} still answering</span>
              </span>
            ) : (
              '🔎 Find our spots'
            )}
          </button>
        )}
      </div>
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
        <div key={String(o.id)} className="option-card">
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
    <>
      <div className="row" style={{ alignItems: 'baseline', gap: 20 }}>
        <h1 className="phase-title display" style={{ margin: 0 }}>
          The contenders
        </h1>
        <span className="muted" style={{ fontWeight: 800, fontSize: '1.1rem' }}>
          {g.options.length} real spots · pass everyone&apos;s filters
        </span>
      </div>
      <OptionGrid
        g={g}
        render={o => {
          const d = defendersOf(g, o);
          return (
            <div className="row small" style={{ fontWeight: 800, gap: 6 }}>
              {d.length ? (
                <>
                  {d.map(p => (
                    <Dot key={String(p.id)} p={p} size={26} />
                  ))}
                  {d.map(p => p.name).join(' & ')}
                </>
              ) : (
                '🤖 The AI host defends this one'
              )}
            </div>
          );
        }}
      />
      {g.isHost && (
        <div className="row">
          <button className="btn big pink breathe" disabled={act.busy} onClick={() => act.run(() => g.conn!.reducers.startPitching({ code: g.code }))}>
            🎤 Start pitching
          </button>
        </div>
      )}
      <ErrorBox error={act.error} />
    </>
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
    say('Phones out! Record your voice, or type it if the room is too loud. The clock is ticking.', 'pitch-intro');
  }, [say]);
  const left = useSecondsLeft(g.lobby!.deadlineMicros) ?? 0;
  const ringColor = left > 10 ? 'var(--lime)' : left > 5 ? 'var(--yellow)' : 'var(--red)';
  const done = g.players.filter(p => g.pitches.some(x => x.playerId === p.id));
  return (
    <div className="row" style={{ alignItems: 'center', gap: 40 }}>
      <div className="stack" style={{ alignItems: 'center', width: 300 }}>
        <Ring pct={left / PITCH_SECONDS} color={ringColor} size={280} inner={236}>
          <div className="num" style={{ fontSize: 112, color: ringColor }}>
            {left}
          </div>
          <div className="eyebrow">{left ? 'seconds' : 'overtime'}</div>
        </Ring>
        <div style={{ fontWeight: 900, fontSize: '1.15rem' }}>
          {done.length}/{g.players.length} pitches locked
        </div>
      </div>
      <div className="stack" style={{ flex: 1, minWidth: 320, gap: 10 }}>
        <h1 className="phase-title display">Make your case</h1>
        {g.players.map((p, i) => {
          const pt = g.pitches.find(x => x.playerId === p.id);
          const a = g.assignments.find(x => x.playerId === p.id);
          const o = a ? g.options.find(x => x.id === a.optionId) : undefined;
          return (
            <div key={String(p.id)} className="status-row" style={{ gridTemplateColumns: 'auto minmax(0,1fr) auto', animationDelay: `${i * 0.06}s` }}>
              <Dot p={p} />
              <div>
                <b style={{ fontSize: '1.15rem' }}>{p.name}</b>
                <div className="muted small" style={{ fontWeight: 700 }}>
                  defending {o?.name ?? '…'}
                </div>
              </div>
              {pt ? (
                <span className="pill done pop">{pt.mode === 'voice' ? '🎙️' : '✍️'} Locked +100</span>
              ) : (
                <span className="pill">
                  <span className="pulse">●●●</span> Working on it
                </span>
              )}
            </div>
          );
        })}
        {g.isHost && (
          <div className="row" style={{ marginTop: 8 }}>
            <button className={`btn big pink ${done.length === g.players.length ? 'breathe' : ''}`} disabled={act.busy} onClick={() => act.run(() => g.conn!.reducers.startShowtime({ code: g.code }))}>
              🎬 Showtime{done.length < g.players.length ? ' (latecomers forfeit)' : ''}
            </button>
          </div>
        )}
        <ErrorBox error={act.error} />
      </div>
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
    <>
      {o ? (
        <div className="showtime" key={String(o.id)}>
          <div className="poster-wrap">
            <img className="poster" src={posterSrc(o)} alt={`Poster for ${o.name}`} />
          </div>
          <div className="stack" style={{ gap: 16 }}>
            <div className="row" style={{ gap: 14 }}>
              <span className="eyebrow">
                Contender {idx + 1} of {g.options.length}
              </span>
              <span className="pips">
                {g.options.map((x, i) => (
                  <span key={String(x.id)} className={i < idx ? 'past' : i === idx ? 'now' : ''} />
                ))}
              </span>
            </div>
            <h1 className="phase-title display" style={{ margin: 0 }}>
              {o.name}
            </h1>
            <OptionMeta o={o} />
            {defenders.map(p => {
              const pt = pitches.find(x => x.playerId === p.id);
              const prompt = g.assignments.find(a => a.playerId === p.id)?.prompt;
              return (
                <div key={String(p.id)} className="stack" style={{ gap: 10 }}>
                  <div className="speech">
                    <div className="who">
                      <Dot p={p} size={22} />
                      {p.name} {pt?.mode === 'voice' ? '🎙️' : '✍️'} · {prompt}
                    </div>
                    {pt ? pt.text : <i>(silence… the defense rests)</i>}
                  </div>
                  {pt && (
                    <div className="speech host" style={{ animationDelay: '0.6s', animationFillMode: 'backwards' }}>
                      <div className="who">🤖 AI host</div>
                      {pt.reaction || <Spinner />}
                    </div>
                  )}
                </div>
              );
            })}
            {defenders.length === 0 && (
              <div className="speech host" style={{ marginLeft: 0 }}>
                <div className="who">🤖 AI host (nobody defended this one)</div>
                {o.hostLine || <Spinner />}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="center stack" style={{ alignItems: 'center', marginTop: 40 }}>
          <h1 className="display pop" style={{ fontSize: '6rem', color: 'var(--yellow)', textShadow: '5px 5px 0 var(--coral)' }}>
            That&apos;s a wrap!
          </h1>
          <p className="muted" style={{ fontSize: '1.4rem', fontWeight: 800 }}>
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
            className={`btn big ${o ? 'ghost' : 'pink breathe'}`}
            disabled={act.busy}
            onClick={() => act.run(() => g.conn!.reducers.startVoting({ code: g.code }))}
          >
            🗳️ Open voting
          </button>
        </div>
      )}
      <ErrorBox error={act.error} />
    </>
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
  const max = Math.max(1, ...g.options.map(o => g.votes.filter(v => v.optionId === o.id).length));
  return (
    <div className="row" style={{ alignItems: 'stretch', gap: 36 }}>
      <div className="stack" style={{ flex: 1, minWidth: 320 }}>
        <h1 className="phase-title display">Vote on your phone</h1>
        <p className="muted" style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>
          One vote each. No voting for the place you defended.
        </p>
        <div className="race" style={{ marginTop: 6 }}>
          {g.options.map(o => {
            const vs = g.votes.filter(v => v.optionId === o.id);
            return (
              <div key={String(o.id)} className="race-row">
                <img src={posterSrc(o)} alt="" />
                <b style={{ fontSize: '1.1rem', lineHeight: 1.1 }}>{o.name}</b>
                <div className="race-track">
                  <div style={{ width: vs.length ? `${Math.max(14, (vs.length / max) * 100)}%` : 0 }}>
                    {vs.map(v => {
                      const p = g.players.find(x => x.id === v.voterId);
                      return p ? <Dot key={String(v.voterId)} p={p} size={32} /> : null;
                    })}
                  </div>
                </div>
                <div className="n">{vs.length}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="stack" style={{ alignItems: 'center', justifyContent: 'center', width: 280, gap: 16 }}>
        <Ring pct={g.votes.length / Math.max(1, g.players.length)} color="var(--green)" size={220} inner={180}>
          <div className="num" style={{ fontSize: 72 }}>
            {g.votes.length}/{g.players.length}
          </div>
          <div className="eyebrow">voted</div>
        </Ring>
        <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
          {g.players.map(p => {
            const voted = g.votes.some(v => v.voterId === p.id);
            return (
              <span key={String(p.id)} style={{ opacity: voted ? 1 : 0.35, transition: 'opacity .3s', filter: voted ? 'none' : 'grayscale(1)' }}>
                <Dot p={p} size={40} />
              </span>
            );
          })}
        </div>
        {g.isHost && (
          <button className="btn pink" disabled={act.busy || g.votes.length === 0} onClick={() => act.run(() => g.conn!.reducers.closeVoting({ code: g.code }))}>
            Close voting
          </button>
        )}
        <ErrorBox error={act.error} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- RESULT

function Result({ g }: { g: Game }) {
  const { say } = useHostVoice();
  const act = useAction();
  const scores = useScores(g);
  const winner = g.options.find(o => o.id === g.lobby!.winnerOptionId);
  const winVotes = useMemo(() => (winner ? g.votes.filter(v => v.optionId === winner.id).length : 0), [g.votes, winner]);
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
    <>
      <Confetti />
      <div className="showtime">
        <div className="poster-wrap winner">
          <div className="crown">👑</div>
          <img className="poster shine" src={posterSrc(winner)} alt={`Poster for ${winner.name}`} />
        </div>
        <div className="stack" style={{ gap: 12 }}>
          <div className="eyebrow">
            🏆 The winner · {winVotes} of {g.votes.length} votes{g.lobby!.tieBreak ? ' · tie broken by the AI host' : ''}
          </div>
          <h1 className="display pop" style={{ fontSize: 'clamp(3rem, 7vw, 6rem)', color: 'var(--yellow)', textShadow: '5px 5px 0 var(--coral)', margin: 0 }}>
            {winner.name}
          </h1>
          <OptionMeta o={winner} />
          <div className="display" style={{ fontSize: '1.5rem', marginTop: 8 }}>
            MVP board
          </div>
          <div className="stack" style={{ gap: 8 }}>
            {scores.map((s, i) => (
              <div key={String(s.player.id)} className="board-row" style={{ animationDelay: `${0.3 + i * 0.12}s` }}>
                <div className="rank">{i + 1}</div>
                <Dot p={s.player} />
                <b style={{ fontSize: '1.15rem' }}>{s.player.name}</b>
                <span className="badge">{s.award}</span>
                <div className="pts">{s.total.toLocaleString()}</div>
              </div>
            ))}
          </div>
          {g.isHost && (
            <div className="row" style={{ marginTop: 6 }}>
              <button className="btn big pink breathe" disabled={act.busy} onClick={lockPlan}>
                {act.busy ? <Spinner /> : '📅'} Make it the plan
              </button>
            </div>
          )}
          <ErrorBox error={act.error} />
        </div>
      </div>
    </>
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
    <div className="stack" style={{ maxWidth: 1000, width: '100%', margin: '0 auto', gap: 20 }}>
      <PlanCard g={g} />
      {g.isHost && (
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn ghost" disabled={act.busy} onClick={() => act.run(() => g.conn!.reducers.playAgain({ code: g.code }))}>
            🔁 Rematch with this crew
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
