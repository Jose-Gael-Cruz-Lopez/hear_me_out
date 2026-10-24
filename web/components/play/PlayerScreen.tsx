'use client';

// The phone controller. Everything here is a reducer call; the server enforces the rules.
import { useEffect, useState } from 'react';
import { useAction, useGame, useLoadedOnce, type Game } from '@/lib/stdb';
import { BUDGETS, DIETS, DISTANCES, FREE_SLOTS, label, VIBES } from '@/lib/game/questions';
import { Countdown, ErrorBox, OptionMeta, playerStyle, posterSrc, price, ReconnectBanner, Spinner } from '../ui';
import { PlanCard } from '../PlanCard';
import { Recorder } from './Recorder';
import { GemBadge, GemEvidence } from '../Gem';

export function PlayerScreen({ code }: { code: string }) {
  const g = useGame(code);
  const loaded = useLoadedOnce(g.connected && g.ready);
  if (!loaded) {
    return (
      <main className="phone center" style={{ justifyContent: 'center' }}>
        <Spinner /> Connecting…
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
      <div className="phone-top">
        <span className="logo" style={{ fontSize: '1.3rem' }}>
          Pitch Fight
        </span>
        <span className="row" style={{ gap: 8 }}>
          {g.me && (
            <span>
              {playerStyle(g.me).face} {g.me.name}
            </span>
          )}
          <Countdown deadlineMicros={g.lobby.deadlineMicros} />
          <span className="code-box">{g.code}</span>
        </span>
      </div>
      {!g.me ? <Join g={g} /> : <Phase g={g} />}
    </main>
  );
}

function Phase({ g }: { g: Game }) {
  switch (g.phase) {
    case 'LOBBY':
      return <Waiting title="You're in! 🎉" text="Waiting for everyone to join. Watch the big screen." g={g} />;
    case 'PROFILE':
      return <Questions g={g} />;
    case 'OPTIONS':
      return <Assignment g={g} />;
    case 'PITCH':
      return <Pitch g={g} />;
    case 'SHOWTIME':
      return <Showtime g={g} />;
    case 'VOTE':
      return <Vote g={g} />;
    case 'RESULT':
      return <Result g={g} />;
    case 'PLAN':
      return <Plan g={g} />;
    default:
      return null;
  }
}

function Waiting({ title, text, g }: { title: string; text: string; g: Game }) {
  return (
    <div className="stack center" style={{ marginTop: 40 }}>
      <h1 className="display">{title}</h1>
      <p className="muted">{text}</p>
      <div className="muted small">{g.players.map(p => p.name).join(' · ')}</div>
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
  if (!canJoin) return <Waiting title="Game in progress" text="This round already started. Catch the next one!" g={g} />;
  return (
    <form className="stack" onSubmit={submit} style={{ marginTop: 30 }}>
      <h1 className="display">What&apos;s your name?</h1>
      <input className="input" autoFocus maxLength={20} value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
      <button className="btn big block" disabled={!name.trim() || act.busy}>
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

function Questions({ g }: { g: Game }) {
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
      <div className="stack center" style={{ marginTop: 30 }}>
        <h1 className="display">Locked in ✅</h1>
        <p className="muted">Waiting for the others… The AI host is about to go scouting.</p>
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
    if (advance) setTimeout(() => setStep(s => s + 1), 180);
  };
  const toggleHidden = (field: string) =>
    setA(prev => ({ ...prev, hidden: prev.hidden.includes(field) ? prev.hidden.filter(h => h !== field) : [...prev.hidden, field] }));
  const current = STEPS[step]!;

  const submit = () =>
    act.run(async () => {
      await g.conn!.reducers.submitProfile({ code: g.code, ...a });
      setEditing(false);
    });

  return (
    <div className="stack">
      <div className="progress">
        <div style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
      </div>
      {current === 'budget' && (
        <>
          <h2>What&apos;s your budget?</h2>
          <div className="stack">
            {BUDGETS.map(b => (
              <button key={b.value} className={`choice ${a.budget === b.value ? 'on' : ''}`} onClick={() => set({ budget: b.value })}>
                <span style={{ fontSize: '1.6rem' }}>{b.label}</span>
                <span className="hint">{b.hint}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {current === 'diet' && (
        <>
          <h2>Any diet needs?</h2>
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
          <h2>How far will you go?</h2>
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
          <h2>When are you free?</h2>
          <p className="muted" style={{ margin: 0 }}>
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
          <h2>What are you craving?</h2>
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
          <h2>Here&apos;s what we&apos;ll share</h2>
          <p className="muted" style={{ margin: 0 }}>
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
            <div key={field} className="card row" style={{ padding: 12 }}>
              <button className="btn ghost" style={{ padding: '6px 10px' }} onClick={() => setStep(i)}>
                ✏️
              </button>
              <div style={{ flex: 1 }}>
                <div className="muted small">{name}</div>
                <b style={{ opacity: a.hidden.includes(field) ? 0.4 : 1 }}>{value || '—'}</b>
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

function AssignmentCard({ g }: { g: Game }) {
  const { a, o } = useMyAssignment(g);
  if (!a || !o) return <div className="card">No assignment yet…</div>;
  return (
    <div className="prompt-card stack">
      <div className="label">Your mission</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 900 }}>{a.prompt}</div>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <img src={posterSrc(o)} alt="" style={{ width: 80, borderRadius: 8 }} />
        <div style={{ flex: 1 }}>
          <b>{o.name}</b>
          <OptionMeta o={o} />
          <div className="small" style={{ marginTop: 4 }}>
            {o.blurb}
          </div>
          <GemBadge g={g} o={o} />
        </div>
      </div>
    </div>
  );
}

function MyEvidence({ g }: { g: Game }) {
  const { o } = useMyAssignment(g);
  return o ? <GemEvidence g={g} o={o} /> : null;
}

function Assignment({ g }: { g: Game }) {
  return (
    <div className="stack">
      <h1 className="display">You must defend…</h1>
      <AssignmentCard g={g} />
      {g.me && <MyEvidence g={g} />}
      <p className="muted center">Start planning your argument. Pitching opens in a moment.</p>
    </div>
  );
}

function Pitch({ g }: { g: Game }) {
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
      <div className="stack">
        <h1 className="display">Pitch locked 🔒</h1>
        <div className="card">“{mine.text}”</div>
        <p className="muted">Save the rest for showtime. You can redo it until the host starts the show.</p>
        <button
          className="btn ghost"
          onClick={() => {
            setRedo(true);
            setText(mine.text);
          }}
        >
          Redo my pitch
        </button>
      </div>
    );
  }

  const submit = () =>
    act.run(async () => {
      await g.conn!.reducers.submitPitch({ code: g.code, text, mode: fromVoice ? 'voice' : 'text' });
      setRedo(false);
    });

  return (
    <div className="stack">
      <AssignmentCard g={g} />
      <MyEvidence g={g} />
      <div className="row">
        <button className={`chip ${mode === 'voice' ? 'on' : ''}`} onClick={() => setMode('voice')}>
          🎙️ Voice
        </button>
        <button
          className={`chip ${mode === 'text' ? 'on' : ''}`}
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
            rows={5}
            maxLength={600}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Ladies and gentlemen of the jury…"
          />
          <div className="row">
            {fromVoice && (
              <button
                className="btn ghost"
                onClick={() => {
                  setText('');
                  setFromVoice(false);
                }}
              >
                🎙️ Re-record
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
    <div className="stack center" style={{ marginTop: 30 }}>
      <h1 className="display">{mine ? "🎤 You're up!" : '👀 Eyes on the big screen'}</h1>
      {current ? <p className="muted">Now pitching: {current.name}</p> : <p className="muted">Voting opens any second…</p>}
    </div>
  );
}

function Vote({ g }: { g: Game }) {
  const act = useAction();
  const { o: defended } = useMyAssignment(g);
  const myVote = g.votes.find(v => v.voterId === g.me!.id);
  const [choice, setChoice] = useState<bigint | null>(null);
  if (myVote) {
    const o = g.options.find(x => x.id === myVote.optionId);
    return (
      <div className="stack center" style={{ marginTop: 30 }}>
        <h1 className="display">Vote cast 🗳️</h1>
        <p className="muted">You voted for {o?.name}. No take-backs.</p>
        <p className="muted small">
          {g.votes.length}/{g.players.length} voted
        </p>
      </div>
    );
  }
  return (
    <div className="stack">
      <h1 className="display">Where are we going?</h1>
      <p className="muted" style={{ margin: 0 }}>
        One vote. You can&apos;t vote for the place you defended.
      </p>
      {g.options.map(o => {
        const own = defended?.id === o.id;
        return (
          <button key={String(o.id)} className={`choice row ${choice === o.id ? 'on' : ''}`} disabled={own} onClick={() => setChoice(o.id)} style={{ textAlign: 'left' }}>
            <img src={posterSrc(o)} alt="" style={{ width: 54, borderRadius: 6 }} />
            <span style={{ flex: 1 }}>
              {o.name}
              <span className="hint">{own ? 'You defended this one' : `${o.category} · ${price(o.priceLevel)}`}</span>
            </span>
          </button>
        );
      })}
      <button
        className="btn big pink block"
        disabled={choice === null || act.busy}
        onClick={() => act.run(() => g.conn!.reducers.castVote({ code: g.code, optionId: choice! }))}
      >
        Cast my vote
      </button>
      <ErrorBox error={act.error} />
    </div>
  );
}

function Result({ g }: { g: Game }) {
  const winner = g.options.find(o => o.id === g.lobby!.winnerOptionId);
  return (
    <div className="stack center" style={{ marginTop: 20 }}>
      <div className="muted">🏆 The winner is</div>
      <h1 className="display pop" style={{ color: 'var(--yellow)', fontSize: '2.6rem' }}>
        {winner?.name}
      </h1>
      {winner && <img className="poster pop" src={posterSrc(winner)} alt="" style={{ maxWidth: 260, margin: '0 auto', borderRadius: 14 }} />}
      <p className="muted">The host is locking in a time…</p>
    </div>
  );
}

function Plan({ g }: { g: Game }) {
  const act = useAction();
  const mine = g.rsvps.find(r => r.playerId === g.me!.id)?.status;
  const rsvp = (status: string) => act.run(() => g.conn!.reducers.setRsvp({ code: g.code, status }));
  return (
    <div className="stack">
      <PlanCard g={g} compact />
      <h2 style={{ marginTop: 8 }}>You coming?</h2>
      <div className="row">
        {(
          [
            ['in', "✅ I'm in"],
            ['maybe', '🤔 Maybe'],
            ['out', '❌ Out'],
          ] as const
        ).map(([s, text]) => (
          <button key={s} className={`chip ${mine === s ? 'on' : ''}`} style={{ flex: 1 }} disabled={act.busy} onClick={() => rsvp(s)}>
            {text}
          </button>
        ))}
      </div>
      <ErrorBox error={act.error} />
    </div>
  );
}
