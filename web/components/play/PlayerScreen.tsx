'use client';

// The phone controller. Everything here is a reducer call; the server enforces the rules.
import { useEffect, useState } from 'react';
import { useAction, useGame, useLoadedOnce, type Game } from '@/lib/stdb';
import { BUDGETS, DIETS, DISTANCES, FREE_SLOTS, label, VIBES } from '@/lib/game/questions';
import { Countdown, Dot, ErrorBox, OptionMeta, PhaseTrack, playerStyle, posterSrc, price, ReconnectBanner, Spinner, useScores, useToast } from '../shared/ui';
import { GemBadge, GemEvidence } from '../shared/Gem';
import { PlanCard } from '../shared/PlanCard';
import { Recorder } from './Recorder';

const XP_PER_LEVEL = 1000;

export function PlayerScreen({ code }: { code: string }) {
  const g = useGame(code);
  const toast = useToast();
  const loaded = useLoadedOnce(g.connected && g.ready);
  if (!loaded) {
    return (
      <main className="phone center" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="logo pulse" style={{ fontSize: '2.4rem' }}>
          Pitch Fight
        </div>
        <div className="muted" style={{ fontWeight: 800 }}>
          <Spinner /> Connecting…
        </div>
      </main>
    );
  }
  if (!g.lobby) {
    return (
      <main className="phone center" style={{ justifyContent: 'center' }}>
        <h2>No game with code {g.code}</h2>
        <a className="btn" href="/">
          Back
        </a>
      </main>
    );
  }
  return (
    <main className="phone">
      <ReconnectBanner show={!g.connected} />
      {g.me ? <PhoneHud g={g} /> : <div className="logo" style={{ fontSize: '1.4rem' }}>Pitch Fight</div>}
      <div key={g.phase} className="grow slideup">
        {!g.me ? <Join g={g} /> : <Phase g={g} toast={toast.show} />}
      </div>
      {toast.node}
    </main>
  );
}

/** Avatar with an XP ring, name, level, and the round's phase track. Points are derived from game rows. */
function PhoneHud({ g }: { g: Game }) {
  const scores = useScores(g);
  const mine = scores.find(s => s.player.id === g.me!.id)?.total ?? 0;
  const s = playerStyle(g.me!);
  const level = 1 + Math.floor(mine / XP_PER_LEVEL);
  const pct = (mine % XP_PER_LEVEL) / XP_PER_LEVEL;
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="phone-top">
        <div className="ring-avatar" style={{ background: `conic-gradient(var(--yellow) ${pct * 360}deg, var(--panel2) 0)` }}>
          <span style={{ background: s.color }}>{s.face}</span>
        </div>
        <div className="who">
          <div className="who-row">
            <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.me!.name}</b>
            <span className="xp-label">
              LVL {level} · {mine.toLocaleString()} PTS
            </span>
          </div>
          <div className="progress">
            <div style={{ width: `${pct * 100}%` }} />
          </div>
        </div>
        <Countdown deadlineMicros={g.lobby!.deadlineMicros} />
        <span className="code-box">{g.code}</span>
      </div>
      <PhaseTrack phase={g.phase} />
    </div>
  );
}

function Phase({ g, toast }: { g: Game; toast: (t: string) => void }) {
  switch (g.phase) {
    case 'LOBBY':
      return <Lobby g={g} />;
    case 'PROFILE':
      return <Questions g={g} toast={toast} />;
    case 'OPTIONS':
      return <Assignment g={g} />;
    case 'PITCH':
      return <Pitch g={g} toast={toast} />;
    case 'SHOWTIME':
      return <Showtime g={g} />;
    case 'VOTE':
      return <Vote g={g} toast={toast} />;
    case 'RESULT':
      return <Result g={g} />;
    case 'PLAN':
      return <Plan g={g} toast={toast} />;
    default:
      return null;
  }
}

function Waiting({ title, text, g, icon }: { title: string; text: string; g: Game; icon?: string }) {
  return (
    <div className="stack center" style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 }}>
      {icon && <div style={{ fontSize: 72 }} className="bob">{icon}</div>}
      <h1 className="display" style={{ fontSize: '2.6rem', margin: 0 }}>
        {title}
      </h1>
      <p className="muted" style={{ fontWeight: 700, margin: 0 }}>
        {text}
      </p>
      <div className="row" style={{ justifyContent: 'center', gap: 6 }}>
        {g.players.map(p => (
          <span key={String(p.id)} className="pop">
            <Dot p={p} size={38} />
          </span>
        ))}
      </div>
    </div>
  );
}

function Lobby({ g }: { g: Game }) {
  const s = playerStyle(g.me!);
  return (
    <div className="stack center" style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 }}>
      <div className="hero-avatar" style={{ background: s.color }}>
        {s.face}
      </div>
      <h1 className="display" style={{ fontSize: '2.8rem', margin: 0 }}>
        You&apos;re in, {g.me!.name}!
      </h1>
      <p className="muted" style={{ fontWeight: 700, margin: 0 }}>
        Waiting for the crew<span className="pulse">…</span> {g.players.length} fighter{g.players.length === 1 ? '' : 's'} so far
      </p>
      <div className="row" style={{ justifyContent: 'center', gap: 6 }}>
        {g.players.map(p => (
          <span key={String(p.id)} className="pop">
            <Dot p={p} size={38} />
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- JOIN

function Join({ g }: { g: Game }) {
  const act = useAction();
  const [name, setName] = useState('');
  useEffect(() => {
    try {
      setName(localStorage.getItem('pitchfight:name') ?? '');
    } catch {}
  }, []);
  const canJoin = g.phase === 'LOBBY' || g.phase === 'PROFILE';
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      localStorage.setItem('pitchfight:name', name.trim());
    } catch {}
    act.run(() => g.conn!.reducers.joinLobby({ code: g.code, name }));
  };
  if (!canJoin) return <Waiting icon="⏳" title="Game in progress" text="This round already started. Catch the next one!" g={g} />;
  return (
    <form className="stack" onSubmit={submit} style={{ flex: 1, justifyContent: 'center', gap: 16 }}>
      <div className="eyebrow">Room {g.code} · {g.players.length} fighters waiting</div>
      <h1 className="display" style={{ fontSize: '2.8rem', margin: 0 }}>
        What&apos;s your fighter name?
      </h1>
      <input className="input" autoFocus maxLength={20} value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
      <button className={`btn big pink block ${name.trim() ? 'breathe' : ''}`} disabled={!name.trim() || act.busy}>
        Join the fight 🥊
      </button>
      <ErrorBox error={act.error} />
    </form>
  );
}

// ---------------------------------------------------------------- QUESTIONS

interface Answers {
  budget: number;
  diet: string;
  distance: string;
  freeWhen: string[];
  vibe: string;
  hidden: string[];
}

const STEPS = ['budget', 'diet', 'distance', 'freeWhen', 'vibe', 'review'] as const;
const QUESTION_COUNT = STEPS.length - 1;

function StepHeader({ step }: { step: number }) {
  const isReview = step >= QUESTION_COUNT;
  return (
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <span className="eyebrow">{isReview ? 'Final check' : `Question ${step + 1} of ${QUESTION_COUNT}`}</span>
      <span className="dots">
        {Array.from({ length: QUESTION_COUNT }, (_, i) => (
          <span key={i} className={i < step ? 'done' : i === step ? 'now' : ''} />
        ))}
      </span>
    </div>
  );
}

function Questions({ g, toast }: { g: Game; toast: (t: string) => void }) {
  const act = useAction();
  const mine = g.profiles.find(p => p.playerId === g.me!.id);
  const [editing, setEditing] = useState(false);
  const [step, setStep] = useState(0);
  const [a, setA] = useState<Answers>({ budget: 0, diet: '', distance: '', freeWhen: [], vibe: '', hidden: [] });

  useEffect(() => {
    if (mine && !editing)
      setA({ budget: mine.budget, diet: mine.diet, distance: mine.distance, freeWhen: [...mine.freeWhen], vibe: mine.vibe, hidden: [...mine.hidden] });
  }, [mine, editing]);

  if (mine && !editing) {
    return (
      <div className="stack center" style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 }}>
        <div style={{ fontSize: 72 }} className="pop">
          ✅
        </div>
        <h1 className="display" style={{ fontSize: '2.6rem', margin: 0 }}>
          Locked in
        </h1>
        <p className="muted" style={{ fontWeight: 700, margin: 0 }}>
          Waiting for the others… The AI host is about to go scouting.
        </p>
        <button
          className="btn ghost"
          onClick={() => {
            setEditing(true);
            setStep(STEPS.length - 1);
          }}
        >
          Change my answers
        </button>
      </div>
    );
  }

  const set = (patch: Partial<Answers>, advance = true) => {
    setA(prev => ({ ...prev, ...patch }));
    if (advance) setTimeout(() => setStep(s => s + 1), 220);
  };
  const toggleHidden = (field: string) =>
    setA(prev => ({ ...prev, hidden: prev.hidden.includes(field) ? prev.hidden.filter(h => h !== field) : [...prev.hidden, field] }));
  const current = STEPS[step]!;

  const submit = () =>
    act.run(async () => {
      await g.conn!.reducers.submitProfile({ code: g.code, ...a });
      setEditing(false);
      toast('✅ Answers sent');
    });

  return (
    <div className="stack" style={{ flex: 1 }}>
      <StepHeader step={step} />
      <div key={current} className="stack slideup">
        {current === 'budget' && (
          <>
            <h2 style={{ fontSize: '2.2rem', margin: 0 }}>What&apos;s your budget?</h2>
            <div className="stack">
              {BUDGETS.map(b => (
                <button key={b.value} className={`choice ${a.budget === b.value ? 'on' : ''}`} onClick={() => set({ budget: b.value })}>
                  <span className="display" style={{ fontSize: '1.8rem' }}>
                    {b.label}
                  </span>
                  <span className="hint">{b.hint}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {current === 'diet' && (
          <>
            <h2 style={{ fontSize: '2.2rem', margin: 0 }}>Any diet needs?</h2>
            <div className="choice-grid">
              {DIETS.map(d => (
                <button key={d.value} className={`choice ${a.diet === d.value ? 'on' : ''}`} onClick={() => set({ diet: d.value })}>
                  <span className="emoji">{d.emoji}</span>
                  {d.label}
                </button>
              ))}
            </div>
          </>
        )}
        {current === 'distance' && (
          <>
            <h2 style={{ fontSize: '2.2rem', margin: 0 }}>How far will you go?</h2>
            <div className="stack">
              {DISTANCES.map(d => (
                <button key={d.value} className={`choice ${a.distance === d.value ? 'on' : ''}`} onClick={() => set({ distance: d.value })}>
                  {d.label}
                  <span className="hint">{d.hint}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {current === 'freeWhen' && (
          <>
            <h2 style={{ fontSize: '2.2rem', margin: 0 }}>When are you free?</h2>
            <p className="muted" style={{ margin: 0, fontWeight: 700 }}>
              Pick all that work.
            </p>
            <div className="chips">
              {FREE_SLOTS.map(f => (
                <button
                  key={f.value}
                  className={`chip ${a.freeWhen.includes(f.value) ? 'on' : ''}`}
                  onClick={() =>
                    set({ freeWhen: a.freeWhen.includes(f.value) ? a.freeWhen.filter(x => x !== f.value) : [...a.freeWhen, f.value] }, false)
                  }
                >
                  {f.label}
                </button>
              ))}
            </div>
            <button className="btn block" disabled={a.freeWhen.length === 0} onClick={() => setStep(s => s + 1)}>
              Next
            </button>
          </>
        )}
        {current === 'vibe' && (
          <>
            <h2 style={{ fontSize: '2.2rem', margin: 0 }}>What are you craving?</h2>
            <div className="choice-grid">
              {VIBES.map(v => (
                <button key={v.value} className={`choice ${a.vibe === v.value ? 'on' : ''}`} onClick={() => set({ vibe: v.value })}>
                  <span className="emoji">{v.emoji}</span>
                  {v.label}
                </button>
              ))}
            </div>
          </>
        )}
        {current === 'review' && (
          <>
            <h2 style={{ fontSize: '2.2rem', margin: 0 }}>Here&apos;s what we&apos;ll share</h2>
            <p className="muted" style={{ margin: 0, fontWeight: 700 }}>
              Tap 👁️ to hide an answer from the big screen. Hidden answers still filter the options — nobody sees why.
            </p>
            {(
              [
                ['budget', 'Budget', price(a.budget || 1)],
                ['diet', 'Diet', label(DIETS, a.diet)],
                ['distance', 'Distance', label(DISTANCES, a.distance)],
                ['freeWhen', 'Free', a.freeWhen.map(f => label(FREE_SLOTS, f)).join(', ')],
                ['vibe', 'Craving', label(VIBES, a.vibe)],
              ] as const
            ).map(([field, name, value], i) => (
              <div key={field} className="card row slideup" style={{ padding: 10, animationDelay: `${i * 0.05}s`, flexWrap: 'nowrap' }}>
                <button className="btn ghost" style={{ padding: '8px 12px' }} onClick={() => setStep(i)} aria-label={`Edit ${name}`}>
                  ✏️
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="muted small" style={{ fontWeight: 700 }}>
                    {name}
                  </div>
                  <b style={{ opacity: a.hidden.includes(field) ? 0.4 : 1, transition: 'opacity .2s' }}>{value || '—'}</b>
                </div>
                <button className={`chip ${a.hidden.includes(field) ? '' : 'on'}`} style={{ padding: '8px 12px' }} onClick={() => toggleHidden(field)}>
                  {a.hidden.includes(field) ? '🙈 Hidden' : '👁️ Shared'}
                </button>
              </div>
            ))}
            <button
              className="btn big pink block"
              disabled={act.busy || !a.budget || !a.diet || !a.distance || !a.freeWhen.length || !a.vibe}
              onClick={submit}
            >
              Approve &amp; send ✅
            </button>
            <ErrorBox error={act.error} />
          </>
        )}
      </div>
      {step > 0 && current !== 'review' && (
        <button className="btn ghost" onClick={() => setStep(s => s - 1)}>
          ◀ Back
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- ASSIGNMENT / PITCH

function useMyAssignment(g: Game) {
  const a = g.assignments.find(x => x.playerId === g.me!.id);
  const o = a ? g.options.find(x => x.id === a.optionId) : undefined;
  return { a, o };
}

function AssignmentCard({ g, compact }: { g: Game; compact?: boolean }) {
  const { a, o } = useMyAssignment(g);
  if (!a || !o) return <div className="card">No assignment yet…</div>;
  if (compact) {
    return (
      <div className="prompt-card row" style={{ padding: 12, gap: 12, flexWrap: 'nowrap', animation: 'none' }}>
        <img src={posterSrc(o)} alt="" style={{ width: 40, borderRadius: 8 }} />
        <div style={{ minWidth: 0 }}>
          <div className="label">Defend {o.name}</div>
          <b style={{ fontSize: '0.95rem' }}>{a.prompt}</b>
        </div>
      </div>
    );
  }
  return (
    <div className="prompt-card shine stack">
      <div className="label">You must defend</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 900, lineHeight: 1.2 }}>{a.prompt}</div>
      <div className="inner">
        <img src={posterSrc(o)} alt="" style={{ width: 64, borderRadius: 10 }} />
        <div style={{ flex: 1 }}>
          <b>{o.name}</b>
          <OptionMeta o={o} />
          <div className="small" style={{ marginTop: 4, fontWeight: 700 }}>
            {o.blurb}
          </div>
          <GemBadge g={g} o={o} />
        </div>
      </div>
    </div>
  );
}

/** Why this place is a hidden gem (social mentions, press), as ammo for the pitch. Renders nothing for ordinary spots. */
function MyEvidence({ g }: { g: Game }) {
  const { o } = useMyAssignment(g);
  return o ? <GemEvidence g={g} o={o} /> : null;
}

function Assignment({ g }: { g: Game }) {
  return (
    <div className="stack" style={{ flex: 1 }}>
      <div className="eyebrow">Your mission has arrived</div>
      <AssignmentCard g={g} />
      <MyEvidence g={g} />
      <div className="eyebrow" style={{ marginTop: 6 }}>
        Ways to score
      </div>
      {[
        ['🎙️', 'Lock in a pitch', '+100'],
        ['🗣️', 'Use your voice', '+50'],
        ['🗳️', 'Every vote your spot gets', '+200'],
        ['🏆', 'Your spot wins', '+500'],
      ].map(([icon, text, xp], i) => (
        <div key={text} className="objective" style={{ animationDelay: `${0.4 + i * 0.1}s` }}>
          <span style={{ fontSize: 22 }}>{icon}</span>
          {text}
          <span className="xp">{xp}</span>
        </div>
      ))}
      <div className="spacer" />
      <p className="muted center" style={{ fontWeight: 700, margin: 0 }}>
        Start plotting. Pitching opens in a moment.
      </p>
    </div>
  );
}

function Pitch({ g, toast }: { g: Game; toast: (t: string) => void }) {
  const act = useAction();
  const mine = g.pitches.find(p => p.playerId === g.me!.id);
  const [mode, setMode] = useState<'voice' | 'text'>('voice');
  const [text, setText] = useState('');
  const [fromVoice, setFromVoice] = useState(false);
  const [redo, setRedo] = useState(false);
  const [ai, setAi] = useState('mock');
  useEffect(() => {
    fetch('/api/status')
      .then(r => r.json())
      .then(s => setAi(s.ai))
      .catch(() => {});
  }, []);

  if (mine && !redo) {
    return (
      <div className="stack" style={{ flex: 1 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h1 className="display" style={{ fontSize: '2.4rem', margin: 0 }}>
            Pitch locked 🔒
          </h1>
          <span className="pill done pop">+{mine.mode === 'voice' ? 150 : 100}</span>
        </div>
        <div className="quote">“{mine.text}”</div>
        <p className="muted" style={{ fontWeight: 700 }}>
          Save the rest for showtime. You can redo it until the host starts the show.
        </p>
        <div className="spacer" />
        <button
          className="btn ghost"
          onClick={() => {
            setRedo(true);
            setText(mine.text);
          }}
        >
          ↺ Redo my pitch
        </button>
      </div>
    );
  }

  const submit = () =>
    act.run(async () => {
      await g.conn!.reducers.submitPitch({ code: g.code, text, mode: fromVoice ? 'voice' : 'text' });
      setRedo(false);
      toast(fromVoice ? '🎙️ Locked · +150 pts' : '✍️ Locked · +100 pts');
    });

  return (
    <div className="stack" style={{ flex: 1 }}>
      <AssignmentCard g={g} compact />
      <MyEvidence g={g} />
      <div className="segmented">
        <button className={mode === 'voice' ? 'on' : ''} onClick={() => setMode('voice')}>
          🎙️ Voice <span className="small">+50</span>
        </button>
        <button
          className={mode === 'text' ? 'on alt' : ''}
          onClick={() => {
            setMode('text');
            setFromVoice(false);
          }}
        >
          ✍️ Type (loud room)
        </button>
      </div>
      {mode === 'voice' && !text && (
        <Recorder
          useBrowserHint={ai === 'mock'}
          onTranscript={t => {
            setText(t);
            setFromVoice(true);
          }}
        />
      )}
      {(mode === 'text' || text) && (
        <>
          <textarea
            className="input"
            rows={6}
            maxLength={600}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Ladies and gentlemen of the jury…"
          />
          <div className="muted small" style={{ textAlign: 'right', fontWeight: 700, marginTop: -6 }}>
            {text.length}/600
          </div>
          <div className="spacer" />
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            {fromVoice && (
              <button
                className="btn ghost"
                onClick={() => {
                  setText('');
                  setFromVoice(false);
                }}
              >
                ↺ Re-record
              </button>
            )}
            <button className="btn big pink" style={{ flex: 1 }} disabled={!text.trim() || act.busy} onClick={submit}>
              Lock it in 🔒
            </button>
          </div>
        </>
      )}
      <ErrorBox error={act.error} />
    </div>
  );
}

// ---------------------------------------------------------------- SHOWTIME / VOTE / RESULT / PLAN

function Showtime({ g }: { g: Game }) {
  const { o: myOption } = useMyAssignment(g);
  const current = g.options[g.lobby!.showtimeIndex];
  const mine = current && myOption && current.id === myOption.id;
  return (
    <div className="stack center" style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14 }}>
      {mine && <span className="badge warn pulse">● You&apos;re on the big screen</span>}
      <div style={{ fontSize: 80 }} className="bob">
        {mine ? '🎤' : '👀'}
      </div>
      <h1 className="display" style={{ fontSize: '2.6rem', margin: 0 }}>
        {mine ? "You're up!" : 'Eyes on the big screen'}
      </h1>
      {current ? (
        <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
          <img src={posterSrc(current)} alt="" style={{ width: 44, borderRadius: 8 }} />
          <span className="muted" style={{ fontWeight: 800 }}>
            Now pitching: {current.name}
          </span>
        </div>
      ) : (
        <p className="muted" style={{ fontWeight: 700 }}>
          Voting opens any second…
        </p>
      )}
    </div>
  );
}

function Vote({ g, toast }: { g: Game; toast: (t: string) => void }) {
  const act = useAction();
  const { o: defended } = useMyAssignment(g);
  const myVote = g.votes.find(v => v.voterId === g.me!.id);
  const [choice, setChoice] = useState<bigint | null>(null);
  if (myVote) {
    const o = g.options.find(x => x.id === myVote.optionId);
    return (
      <div className="stack center" style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14 }}>
        <div style={{ fontSize: 72 }} className="pop">
          🗳️
        </div>
        <h1 className="display" style={{ fontSize: '2.6rem', margin: 0 }}>
          Vote cast
        </h1>
        <p className="muted" style={{ fontWeight: 700, margin: 0 }}>
          You voted for {o?.name}. No take-backs.
        </p>
        <div style={{ width: '100%', maxWidth: 260 }} className="progress">
          <div style={{ width: `${(g.votes.length / Math.max(1, g.players.length)) * 100}%`, background: 'var(--green)' }} />
        </div>
        <p className="muted small" style={{ fontWeight: 800, margin: 0 }}>
          {g.votes.length}/{g.players.length} voted
        </p>
      </div>
    );
  }
  return (
    <div className="stack" style={{ flex: 1, gap: 10 }}>
      <h1 className="display" style={{ fontSize: '2.4rem', margin: 0 }}>
        Where are we going?
      </h1>
      <p className="muted" style={{ margin: 0, fontWeight: 700 }}>
        One vote. Your own spot is locked.
      </p>
      {g.options.map(o => {
        const own = defended?.id === o.id;
        const on = choice === o.id;
        return (
          <button key={String(o.id)} className={`choice row ${on ? 'on' : ''}`} disabled={own} onClick={() => setChoice(o.id)}>
            <img src={posterSrc(o)} alt="" style={{ width: 46, height: 46, objectFit: 'cover', borderRadius: 12 }} />
            <span style={{ flex: 1 }}>
              {o.name}
              <span className="hint">{own ? '🛡️ You defended this one' : `${o.category} · ${price(o.priceLevel)}`}</span>
            </span>
            <span className="mark">{on ? '✅' : own ? '🔒' : ''}</span>
          </button>
        );
      })}
      <div className="spacer" />
      <button
        className={`btn big block ${choice === null ? 'ghost' : 'pink'}`}
        disabled={choice === null || act.busy}
        onClick={() =>
          act.run(async () => {
            await g.conn!.reducers.castVote({ code: g.code, optionId: choice! });
            toast('🗳️ Vote cast · +25 pts');
          })
        }
      >
        {choice === null ? 'Pick a spot' : 'Cast my vote 🗳️'}
      </button>
      <ErrorBox error={act.error} />
    </div>
  );
}

function Result({ g }: { g: Game }) {
  const winner = g.options.find(o => o.id === g.lobby!.winnerOptionId);
  const scores = useScores(g);
  const rank = scores.findIndex(s => s.player.id === g.me!.id);
  const me = scores[rank];
  const { o: defended } = useMyAssignment(g);
  const iWon = !!winner && defended?.id === winner.id;
  return (
    <div className="stack" style={{ flex: 1, gap: 12 }}>
      <div className="stack center" style={{ alignItems: 'center', gap: 6 }}>
        <div className="eyebrow">🏆 The winner is</div>
        <h1 className="display pop" style={{ color: 'var(--yellow)', fontSize: '3rem', textShadow: '3px 3px 0 var(--coral)', margin: 0 }}>
          {winner?.name}
        </h1>
        <div style={{ fontWeight: 800 }}>{iWon ? "That's yours. You won the room. 🎉" : `You placed #${rank + 1} of ${scores.length}`}</div>
      </div>
      {me && (
        <>
          <div className="badge-card shine">
            <div className="medal">{rank === 0 ? '👅' : me.award === 'Mic Drop' ? '🎤' : me.award === 'Lone Wolf' ? '🐺' : me.award === 'Bold Strategy' ? '🫥' : '⌨️'}</div>
            <div>
              <div className="small" style={{ fontWeight: 900, letterSpacing: '0.14em' }}>
                BADGE UNLOCKED
              </div>
              <div className="display" style={{ fontSize: '1.7rem' }}>
                {me.award}
              </div>
            </div>
          </div>
          <div className="ledger">
            {me.lines.map((l, i) => (
              <div key={l.label} style={{ animationDelay: `${0.4 + i * 0.12}s` }}>
                <span>{l.label}</span>
                <span className="v">+{l.value}</span>
              </div>
            ))}
            <div>
              <span>Round total</span>
              <span className="v display" style={{ fontSize: '1.6rem' }}>
                {me.total.toLocaleString()}
              </span>
            </div>
          </div>
        </>
      )}
      <div className="spacer" />
      <p className="muted center" style={{ fontWeight: 700, margin: 0 }}>
        The host is locking in a time<span className="pulse">…</span>
      </p>
    </div>
  );
}

function Plan({ g, toast }: { g: Game; toast: (t: string) => void }) {
  const act = useAction();
  const mine = g.rsvps.find(r => r.playerId === g.me!.id)?.status;
  const rsvp = (status: string) =>
    act.run(async () => {
      await g.conn!.reducers.setRsvp({ code: g.code, status });
      if (status === 'in') toast("🔥 You're in!");
    });
  return (
    <div className="stack" style={{ flex: 1 }}>
      <PlanCard g={g} compact />
      <h2 style={{ marginTop: 8, marginBottom: 0, fontSize: '1.8rem' }}>You coming?</h2>
      <div className="stack" style={{ gap: 10 }}>
        {(
          [
            ['in', "✅ I'm in"],
            ['maybe', '🤔 Maybe'],
            ['out', '❌ Out'],
          ] as const
        ).map(([s, text]) => (
          <button key={s} className={`chip ${mine === s ? 'on' : ''}`} style={{ minHeight: 56 }} disabled={act.busy} onClick={() => rsvp(s)}>
            {text}
          </button>
        ))}
      </div>
      <ErrorBox error={act.error} />
    </div>
  );
}
