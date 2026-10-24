import { IconText, AvatarMark } from '../components/Ink';
import confetti from 'canvas-confetti';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import type { Player } from '@hmo/bindings';
import { MergeBanner } from '../components/MergeBanner';
import { MuseReservation } from '../components/Muse';
import { Avatar, PhaseTitle, Poster, seatColor, useObjectUrl, VenueCard } from '../components/ui';
import { MenuProof } from '../components/MenuProof';
import { BusyChart } from '../components/BusyChart';
import { useRoom } from '../lib/room';
import { play } from '../lib/sound';

function useActed() {
  const { room } = useRoom();
  return (p: Player) => p.actedSeq === room.phaseSeq;
}

function PlayerRow({ players, done }: { players: Player[]; done: (p: Player) => boolean }) {
  return (
    <div className="flex flex-wrap justify-center gap-6">
      {players.map(p => (
        <Avatar key={String(p.id)} player={p} size={84} done={done(p)} dim={!done(p)} />
      ))}
    </div>
  );
}

function Waiting({ emoji, title, sub }: { emoji: string; title: string; sub?: string }) {
  return (
    <div className="grid flex-1 place-items-center">
      <div className="text-center">
        <motion.div className="text-[9rem]" animate={{ rotate: [-8, 8, -8], y: [0, -10, 0] }} transition={{ repeat: Infinity, duration: 1.6 }}>
          <IconText text={emoji} size={96} />
        </motion.div>
        <PhaseTitle title={title} sub={sub} />
      </div>
    </div>
  );
}

export function HostProfiles() {
  const { players, profiles } = useRoom();
  return (
    <div className="flex flex-1 flex-col items-center gap-8">
      <PhaseTitle kicker="Step 1" title="Bring your Muse" sub="Set your budget, diet, time and vibe on your device. Approve your tags to lock in." />
      <div className="chip bg-lime/15 px-5 py-2 text-lg text-lime ring-1 ring-lime/40"><IconText text={"🔒 Only what you approve is shared. Private messages are never read."} /></div>
      <div className="grid w-full max-w-6xl grid-cols-2 gap-6 md:grid-cols-4">
        {players.map(p => {
          const tags = profiles.get(p.id)?.approvedTags ?? [];
          return (
            <div key={String(p.id)} className="card flex flex-col items-center gap-3 p-5">
              <Avatar player={p} size={96} done={p.ready} dim={!p.ready} />
              <div className="flex min-h-16 flex-wrap justify-center gap-2">
                <AnimatePresence>
                  {p.ready && tags.length === 0 && <span className="text-sm text-muted">no tags shared</span>}
                  {tags.map((t, i) => (
                    <motion.span key={t} initial={{ scale: 0, y: 10 }} animate={{ scale: 1, y: 0 }} transition={{ delay: i * 0.08, type: 'spring' }} className="chip" style={{ background: `${seatColor(p.seat)}26`, color: seatColor(p.seat) }}>
                      #{t}
                    </motion.span>
                  ))}
                </AnimatePresence>
                {!p.ready && <span className="text-sm text-muted">thinking…</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function HostWarmup() {
  const { players, warmups, room } = useRoom();
  return (
    <div className="flex flex-1 flex-col items-center gap-8">
      <PhaseTitle kicker="Warm-up" title="Hot takes, rapid fire" sub={room.aiStatus ? 'While The Judge scouts real places nearby…' : 'Answer on your device!'} />
      {warmups.length === 0 && <div className="text-2xl text-cream/70">The Judge is writing questions just for you…</div>}
      <div className="grid w-full max-w-6xl gap-5 md:grid-cols-2">
        {players.map(p => {
          const w = warmups.find(x => x.playerId === p.id);
          if (!w) return null;
          return (
            <motion.div key={String(w.id)} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="card flex items-center gap-5 p-5">
              <Avatar player={p} size={72} />
              <div className="flex-1">
                <div className="font-display text-2xl font-black">{w.question}</div>
                <div className="mt-3 flex gap-3">
                  {(['a', 'b'] as const).map(k => (
                    <motion.span
                      key={k}
                      animate={w.answer === k ? { scale: [1, 1.2, 1] } : {}}
                      className={`chip px-4 py-2 text-lg ${w.answer === k ? 'bg-sun text-ink' : w.answer ? 'bg-ink-3 text-cream/40' : 'bg-ink-3 text-cream'}`}
                    >
                      {k === 'a' ? w.choiceA : w.choiceB}
                    </motion.span>
                  ))}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

export function HostScouting() {
  const { room } = useRoom();
  return <Waiting emoji="🛰️" title="Scouting real places…" sub={room.aiStatus || 'Checking hours, prices and menus against everyone in the room.'} />;
}

export function HostFinalists() {
  const { options, players } = useRoom();
  useEffect(() => {
    options.forEach((_, i) => setTimeout(() => play('ding'), 400 + i * 700));
  }, [options.length]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex flex-1 flex-col gap-6">
      <PhaseTitle kicker="Introducing" title="Tonight's contestants" sub="Real places that work for the whole group." />
      <div className={`grid gap-5 ${options.length >= 4 ? 'lg:grid-cols-4' : options.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'} md:grid-cols-2`}>
        {options.map((o, i) => (
          <motion.div key={String(o.id)} initial={{ opacity: 0, y: 60, rotate: i % 2 ? 4 : -4 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ delay: 0.3 + i * 0.7, type: 'spring', stiffness: 200, damping: 16 }}>
            <VenueCard option={o} players={players}>
              <MenuProof optionId={o.id} />
            </VenueCard>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export function HostPrevote() {
  const { players } = useRoom();
  const acted = useActed();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10">
      <PhaseTitle kicker="Secret ballot" title="Pick your favorite. Tell no one." sub="On your device. We'll see who changes their mind later…" />
      <PlayerRow players={players.filter(p => !p.isBot)} done={acted} />
    </div>
  );
}

export function HostAssigning() {
  return <Waiting emoji="📜" title="The Judge is writing your case files…" sub="Plot twist: you might have to defend someone else's pick." />;
}

export function HostAssignments() {
  const { players, assignments, optionById } = useRoom();
  return (
    <div className="flex flex-1 flex-col items-center gap-8">
      <PhaseTitle kicker="Plot twist" title="Your case, counselor" sub="Check your device for your brief and hints." />
      <div className="grid w-full max-w-5xl gap-4">
        {players.map((p, i) => {
          const a = assignments.find(x => x.playerId === p.id);
          const o = a && optionById(a.optionId);
          if (!a || !o) return null;
          return (
            <motion.div key={String(p.id)} initial={{ opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.25 }} className="card flex items-center gap-5 p-4">
              <Avatar player={p} size={64} />
              <div className="font-display text-xl font-black text-cream/60">defends</div>
              <div className="flex-1">
                <div className="font-display text-3xl font-black" style={{ color: seatColor(p.seat) }}>
                  {o.title}
                  {a.coCounsel && <span className="ml-3 chip bg-ink-3 align-middle text-sm text-cream/80">co-counsel</span>}
                </div>
                <div className="text-lg text-cream/85 italic">“{a.stylePrompt}”</div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

const PITCH_STATUS: Record<string, { label: string; cls: string }> = {
  waiting: { label: '🎙️ recording…', cls: 'text-cream/60' },
  transcribing: { label: '📝 transcribing', cls: 'text-sky' },
  needs_text: { label: '⌨️ typing it out', cls: 'text-tang' },
  ready: { label: '✅ ready', cls: 'text-lime' },
  skipped: { label: '— skipped', cls: 'text-cream/40' },
};

export function HostPitching() {
  const { players, pitches, optionById } = useRoom();
  return (
    <div className="flex flex-1 flex-col items-center gap-8">
      <PhaseTitle kicker="30 seconds" title="Record your pitch!" sub="Everyone records at once. Then we hear them out, one by one." />
      <div className="grid w-full max-w-5xl gap-4 md:grid-cols-2">
        {pitches.map(pt => {
          const p = players.find(x => x.id === pt.playerId);
          const o = optionById(pt.optionId);
          if (!p) return null;
          const s = PITCH_STATUS[pt.status] ?? PITCH_STATUS.waiting;
          return (
            <div key={String(pt.id)} className="card flex items-center gap-4 p-4">
              <Avatar player={p} size={60} done={pt.status === 'ready'} />
              <div className="flex-1">
                <div className="font-display text-xl font-black">{o?.title}</div>
                <div className={`font-bold ${s.cls}`}><IconText text={p.isBot && pt.status === 'waiting' ? '🤖 writing a pitch…' : s.label} /></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function HostVote() {
  const { options, votes, players } = useRoom();
  const acted = useActed();
  const max = Math.max(1, ...options.map(o => votes.filter(v => v.optionId === o.id).length));
  return (
    <div className="flex flex-1 flex-col items-center gap-8">
      <PhaseTitle kicker="Final vote" title="Who made the best case?" sub="Vote for any option. Votes count live." />
      <div className="w-full max-w-5xl space-y-4">
        {options.map(o => {
          const n = votes.filter(v => v.optionId === o.id).length;
          return (
            <div key={String(o.id)} className="card flex items-center gap-4 p-4">
              <div className="w-72 font-display text-2xl font-black">{o.title}</div>
              <div className="relative h-10 flex-1 overflow-hidden rounded-full bg-ink">
                <motion.div className="h-full rounded-full bg-gradient-to-r from-pop to-sun" animate={{ width: `${(n / max) * 100}%` }} transition={{ type: 'spring', stiffness: 120, damping: 18 }} />
              </div>
              <div className="w-12 text-right font-display text-3xl font-black text-sun">{n}</div>
            </div>
          );
        })}
      </div>
      <PlayerRow players={players.filter(p => !p.isBot)} done={acted} />
    </div>
  );
}

export function HostResults() {
  const { room, optionById, awards, playerById, votes, players } = useRoom();
  const winner = optionById(room.winnerOptionId);
  useEffect(() => {
    play('fanfare');
    const end = Date.now() + 2500;
    const frame = () => {
      confetti({ colors: ['#14140f','#f2dc6e','#d1e6eb','#dbe4c9'], disableForReducedMotion: true, particleCount: 6, angle: 60, spread: 70, origin: { x: 0 } });
      confetti({ colors: ['#14140f','#f2dc6e','#d1e6eb','#dbe4c9'], disableForReducedMotion: true, particleCount: 6, angle: 120, spread: 70, origin: { x: 1 } });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
  }, []);
  const persuasive = awards.filter(a => a.kind === 'most_persuasive');
  const best = awards.find(a => a.kind === 'best_line');
  return (
    <div className="flex flex-1 flex-col items-center gap-8">
      <motion.div initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 12 }}>
        <PhaseTitle kicker="The verdict is in" title={<span className="text-sun">{winner?.title ?? '…'}</span>} sub={`${votes.filter(v => v.optionId === room.winnerOptionId).length} of ${players.length} votes`} />
      </motion.div>
      {room.tiebreakText && <div className="chip bg-grape/30 px-5 py-2 text-lg ring-1 ring-grape/60"><IconText text={"⚖️ "} />{room.tiebreakText}</div>}
      {winner && <div className="w-full max-w-3xl"><MenuProof optionId={winner.id} big /></div>}
      <div className="grid w-full max-w-5xl gap-6 md:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1 }} className="card p-6">
          <div className="font-display text-lg font-black tracking-widest text-pop"><IconText text={"🏆 MOST PERSUASIVE"} /></div>
          {persuasive.map(a => {
            const p = playerById(a.playerId);
            return p ? (
              <div key={String(a.id)} className="mt-4 flex items-center gap-4">
                <Avatar player={p} size={72} />
                <div className="text-xl font-bold">{a.text}</div>
              </div>
            ) : null;
          })}
          {persuasive.length === 0 && <div className="mt-4 text-cream/60">Deliberating…</div>}
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.6 }} className="card p-6">
          <div className="font-display text-lg font-black tracking-widest text-sky"><IconText text={"💬 BEST LINE"} /></div>
          {best ? (
            <div className="mt-4 flex items-center gap-4">
              {playerById(best.playerId) && <Avatar player={playerById(best.playerId)!} size={72} />}
              <div className="font-display text-2xl font-black italic">“{best.text}”</div>
            </div>
          ) : (
            <div className="mt-4 text-cream/60">The Judge is re-reading the transcripts…</div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

export function HostPlan({ isHost }: { isHost: boolean }) {
  const { plan, optionById, players, rsvps, media, playerById, room } = useRoom();
  const [, navigate] = useLocation();
  const option = plan ? optionById(plan.optionId) : undefined;
  const posterMedia = plan && plan.posterMediaId ? media.get(plan.posterMediaId) : undefined;
  const posterUrl = useObjectUrl(posterMedia?.bytes, posterMedia?.mime);
  if (!plan) return <Waiting emoji="🗓️" title="Booking the plan…" />;
  const cantMake = plan.cantMake.map(id => playerById(id)?.name).filter(Boolean);
  const going = rsvps.filter(r => r.status === 'yes').length;
  return (
    <div className="plan-dash">
      <div className="plan-left">
        <motion.div initial={{ rotate: -6, scale: 0.85, opacity: 0 }} animate={{ rotate: -2, scale: 1, opacity: 1 }} transition={{ type: 'spring' }}>
          <Poster plan={plan} option={option} imageUrl={posterUrl || plan.posterUrl || undefined} players={players} />
        </motion.div>
        <div className="plan-panel">
          <div className="plan-label">
            Who's going · {going}/{players.length}
          </div>
          <div className="plan-rsvps">
            {players.map(p => {
              const r = rsvps.find(x => x.playerId === p.id);
              return (
                <div key={String(p.id)} className="plan-rsvp">
                  <Avatar player={p} size={38} done={r?.status === 'yes'} dim={!r} />
                  <span>{r ? (r.status === 'yes' ? 'going' : r.status) : '…'}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="plan-main">
        <header className="plan-hero">
          <div className="plan-kicker">It's a plan</div>
          <h1 className="plan-title">{option?.title}</h1>
          <div className="plan-meta">
            <span className="plan-time">{plan.slotLabel}</span>
            {option?.address && <span className="plan-addr">{option.address}</span>}
          </div>
          {cantMake.length > 0 && <div className="mt-2 chip bg-tang/20 text-tang">Can't make this slot: {cantMake.join(', ')}</div>}
          {room.mode === 'strangers' && (
            <div className={`mt-2 chip self-start px-4 py-2 ${plan.meetupConfirmed ? 'bg-lime/20 text-lime' : 'bg-sun/15 text-sun'}`}>
              <IconText text={plan.meetupConfirmed ? '✅ Meetup confirmed' : `Meetup needs 3 RSVPs (${going}/3)`} />
            </div>
          )}
        </header>
        <MergeBanner asPlayer={false} />
        {option && <BusyChart plan={plan} option={option} tzOffsetMin={room.tzOffsetMin} />}
        {option && <MenuProof optionId={option.id} />}
        {plan.whyForEach.length > 0 && (
          <div className="plan-panel">
            <div className="plan-label">Why it works for everyone</div>
            <ul className="plan-why">
              {plan.whyForEach.map(w => {
                const p = playerById(w.playerId);
                return (
                  <li key={String(w.playerId)}>
                    <AvatarMark value={p?.avatar} size={22} />
                    <span>{w.line}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <div className="plan-side">
        {option && (
          <MuseReservation
            plan={plan}
            option={option}
            category={room.category}
            party={room.mode === 'strangers' ? going : players.length - plan.cantMake.length}
            ready={room.mode !== 'strangers' || plan.meetupConfirmed}
          />
        )}
        <blockquote className="plan-invite">{plan.inviteText}</blockquote>
        {plan.icebreakers.length > 0 && (
          <div className="plan-panel">
            <div className="plan-label">Icebreakers for the table</div>
            <ul className="plan-ice">
              {plan.icebreakers.map(i => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
        )}
        {isHost && (
          <button className="btn btn-ghost self-start" onClick={() => navigate('/')}>
            New game
          </button>
        )}
      </div>
    </div>
  );
}

export function HostEnded() {
  return <div className="flex flex-1 flex-col gap-6"><Waiting emoji="🔨" title="Court adjourned" sub="See you at the plan." /><Link href="/" className="btn btn-sun self-center">Back home</Link></div>;
}
