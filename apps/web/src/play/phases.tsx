import { IconText } from '../components/Ink';
import { motion } from 'motion/react';
import { useRef } from 'react';
import { buildIcs, googleCalendarUrl, type CalendarEvent } from '@hmo/shared';
import { MergeBanner } from '../components/MergeBanner';
import { SafetyList } from '../components/Safety';
import { Avatar, Poster, seatColor, useObjectUrl, VenueCard } from '../components/ui';
import { isMatchedRoom, useCall, useRoom } from '../lib/room';
import { HostPlayback } from '../host/Playback';
import { play } from '../lib/sound';
import { tsMs } from '../lib/time';
import { toast } from '../lib/toast';

export function PlayWaiting({ emoji, title, sub }: { emoji: string; title: string; sub?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <motion.div className="text-8xl" animate={{ y: [0, -12, 0] }} transition={{ repeat: Infinity, duration: 1.4 }}>
        <IconText text={emoji} size={96} />
      </motion.div>
      <div className="font-display text-3xl font-black">{title}</div>
      {sub && <div className="text-cream/70">{sub}</div>}
    </div>
  );
}

export function PlayLobby() {
  const { me, players, room } = useRoom();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      {me && <Avatar player={me} size={140} />}
      <div className="font-display text-3xl font-black">You're in!</div>
      <div className="text-lg text-cream/75">
        {players.length} player{players.length === 1 ? '' : 's'} in room {room.code}. Watch the TV, the host starts the game.
      </div>
      <div className="w-full">
        <SafetyList />
      </div>
    </div>
  );
}

export function PlayWarmup() {
  const { me, warmups } = useRoom();
  const call = useCall();
  const w = warmups.find(x => x.playerId === me?.id);
  if (!w) return <PlayWaiting emoji="🔥" title="Hot take incoming…" />;
  return (
    <div className="flex flex-1 flex-col justify-center gap-6">
      <div className="text-center font-display text-sm font-black tracking-[0.25em] text-sun">HOT TAKE</div>
      <div className="text-center font-display text-4xl leading-tight font-black">{w.question}</div>
      <div className="grid gap-4">
        {(['a', 'b'] as const).map(k => (
          <button
            key={k}
            onClick={() => {
              play('pop');
              void call(c => c.reducers.answerWarmup({ warmupId: w.id, answer: k }));
            }}
            className={`btn py-6 text-2xl ${w.answer === k ? 'btn-sun' : w.answer ? 'btn-ghost opacity-60' : k === 'a' ? 'btn-pop' : 'btn-sky'}`}
          >
            {k === 'a' ? w.choiceA : w.choiceB}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PlayFinalists() {
  const { options, players } = useRoom();
  return (
    <div className="flex flex-col gap-4">
      <div className="font-display text-3xl font-black">Tonight's contestants</div>
      {options.map(o => (
        <VenueCard key={String(o.id)} option={o} players={players} compact />
      ))}
    </div>
  );
}

export function PlayPrevote() {
  const { options, room, myPrevoteOptionId } = useRoom();
  const call = useCall();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="font-display text-sm font-black tracking-[0.25em] text-sun">SECRET BALLOT</div>
        <div className="font-display text-3xl font-black">Your favorite, honestly?</div>
        <div className="text-cream/70">Nobody else sees this.</div>
      </div>
      {options.map(o => (
        <button
          key={String(o.id)}
          onClick={() => {
            play('pop');
            void call(c => c.reducers.castPrevote({ roomId: room.id, optionId: o.id }));
          }}
          className={`card p-5 text-left font-display text-2xl font-black transition ${myPrevoteOptionId === o.id ? 'ring-4 ring-sun' : ''}`}
        >
          <IconText text={myPrevoteOptionId === o.id ? '🤫 ' : ''} />
          {o.title}
          <div className="text-sm font-bold text-cream/60">
            {o.category} · ~{o.travelMin} min
          </div>
        </button>
      ))}
    </div>
  );
}

export function BriefCard() {
  const { me, assignments, optionById, players } = useRoom();
  const a = assignments.find(x => x.playerId === me?.id);
  const o = a && optionById(a.optionId);
  if (!a || !o) return null;
  const partners = assignments.filter(x => x.optionId === a.optionId && x.playerId !== a.playerId).map(x => players.find(p => p.id === x.playerId)?.name);
  return (
    <div className="card overflow-hidden">
      <div className="bg-gradient-to-r from-pop to-grape px-5 py-3 font-display text-sm font-black tracking-[0.25em]">YOUR CASE</div>
      <div className="space-y-3 p-5">
        <div className="font-display text-3xl leading-tight font-black">Defend {o.title}</div>
        <div className="text-lg text-sun italic">“{a.stylePrompt}”</div>
        <ul className="space-y-1">
          {a.hints.map(h => (
            <li key={h} className="flex gap-2 text-cream/85">
              <span><IconText text={"🧾"} /></span>
              <span>{h}</span>
            </li>
          ))}
        </ul>
        {partners.length > 0 && <div className="chip bg-ink-3 text-cream/80">Co-counsel with {partners.join(', ')}</div>}
      </div>
    </div>
  );
}

export function PlayAssignment() {
  return (
    <div className="flex flex-col gap-4">
      <div className="text-center font-display text-2xl font-black">Plot twist!</div>
      <BriefCard />
      <div className="text-center text-cream/70">Recording starts in a moment. Get your persona ready.</div>
    </div>
  );
}

const EMOJIS = ['😂', '🔥', '🧑‍⚖️', '🍜', '👏', '😱', '💯', '🤔'];

export function PlayPlayback() {
  const { room, playable, me, playerById, optionById, objections } = useRoom();
  const call = useCall();
  const last = useRef(0);
  const pitch = playable[room.currentPitchIdx];
  if (!pitch) return <PlayWaiting emoji="🎤" title="Next case…" />;
  const speaker = playerById(pitch.playerId);
  const option = optionById(pitch.optionId);
  const mine = pitch.playerId === me?.id;
  const objected = objections.some(o => o.pitchId === pitch.id && o.playerId === me?.id);
  const stage = isMatchedRoom(room);
  return (
    <div className="flex flex-1 flex-col gap-5">
      {stage && (
        <div key={String(pitch.id)} className="matched-playback flex flex-col">
          <HostPlayback />
        </div>
      )}
      {!stage && <div className="card flex items-center gap-4 p-4">
        {speaker && <Avatar player={speaker} size={64} label={false} />}
        <div>
          <div className="text-sm font-bold text-cream/60">{mine ? "You're up!" : `${speaker?.name} is defending`}</div>
          <div className="font-display text-2xl font-black" style={{ color: speaker ? seatColor(speaker.seat) : undefined }}>
            {option?.title}
          </div>
        </div>
      </div>}
      <div className="reaction-controls grid grid-cols-4 gap-2">
        {EMOJIS.map(e => (
          <button
            key={e}
            aria-label={`React: ${['Laugh', 'Fire', 'Judge', 'Noodles', 'Applause', 'Surprise', 'Perfect', 'Thinking'][EMOJIS.indexOf(e)]}`}
            className="grid h-14 place-items-center rounded-2xl bg-ink-3 text-4xl shadow-[0_5px_0_rgb(0_0_0/0.35)] active:translate-y-1"
            onClick={() => {
              if (Date.now() - last.current < 200) return;
              last.current = Date.now();
              void call(c => c.reducers.react({ pitchId: pitch.id, emoji: e }), { silent: true });
            }}
          >
            <IconText text={e} size={34} />
          </button>
        ))}
      </div>
      {!mine && (
        <button
          className="btn mt-auto bg-sustain py-3 text-2xl text-white italic"
          disabled={objected}
          onClick={() => {
            play('objection');
            void call(c => c.reducers.raiseObjection({ pitchId: pitch.id }));
          }}
        >
          <IconText text={objected ? 'Objection noted ⚖️' : 'OBJECTION!'} />
        </button>
      )}
    </div>
  );
}

export function PlayVote() {
  const { options, room, votes, me } = useRoom();
  const call = useCall();
  const mine = votes.find(v => v.playerId === me?.id);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="font-display text-sm font-black tracking-[0.25em] text-sun">FINAL VOTE</div>
        <div className="font-display text-3xl font-black">Who convinced you?</div>
      </div>
      {options.map(o => (
        <button
          key={String(o.id)}
          onClick={() => {
            play('pop');
            void call(c => c.reducers.castVote({ roomId: room.id, optionId: o.id }));
          }}
          className={`card p-5 text-left font-display text-2xl font-black transition ${mine?.optionId === o.id ? 'ring-4 ring-lime' : ''}`}
        >
          <IconText text={mine?.optionId === o.id ? '🗳️ ' : ''} />
          {o.title}
        </button>
      ))}
    </div>
  );
}

export function PlayResults() {
  const { room, optionById, awards, playerById } = useRoom();
  const winner = optionById(room.winnerOptionId);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
      <div className="font-display text-sm font-black tracking-[0.25em] text-sun">THE VERDICT</div>
      <motion.div initial={{ scale: 0.4 }} animate={{ scale: 1 }} className="font-display text-5xl leading-tight font-black">
        {winner?.title}
      </motion.div>
      {room.tiebreakText && <div className="text-cream/75">{room.tiebreakText}</div>}
      {awards.map(a => (
        <div key={String(a.id)} className="card w-full p-4 text-left">
          <div className="text-xs font-black tracking-widest text-pop"><IconText text={a.kind === 'most_persuasive' ? '🏆 MOST PERSUASIVE' : '💬 BEST LINE'} /></div>
          <div className="mt-1 font-bold">
            {playerById(a.playerId)?.name}: {a.kind === 'best_line' ? `“${a.text}”` : a.text}
          </div>
        </div>
      ))}
    </div>
  );
}

export function PlayPlan() {
  const { plan, optionById, players, rsvps, me, media, room } = useRoom();
  const call = useCall();
  const option = plan ? optionById(plan.optionId) : undefined;
  const posterMedia = plan?.posterMediaId ? media.get(plan.posterMediaId) : undefined;
  const posterUrl = useObjectUrl(posterMedia?.bytes, posterMedia?.mime);
  if (!plan || !option) return <PlayWaiting emoji="🗓️" title="Booking the plan…" />;
  const mine = rsvps.find(r => r.playerId === me?.id);
  const event: CalendarEvent = {
    uid: `plan-${plan.id}@hear-me-out`,
    title: `${option.title} (Hear Me Out plan)`,
    description: plan.inviteText,
    location: option.address || option.title,
    start: new Date(tsMs(plan.startAt)),
    end: new Date(tsMs(plan.endAt)),
    url: option.mapsUrl,
  };
  const downloadIcs = () => {
    const blob = new Blob([buildIcs(event)], { type: 'text/calendar' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${option.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const share = async () => {
    const text = `${plan.inviteText}\n${option.mapsUrl}`;
    try {
      await navigator.clipboard.writeText(text);
      toast('Invite copied. Paste it in the group chat!');
    } catch {
      toast('Could not copy');
    }
  };
  const cantMake = plan.cantMake.includes(me?.id ?? -1n);
  const isPublic = room.mode === 'strangers';
  const going = rsvps.filter(r => r.status === 'yes').length;
  // Public meetups: neighborhood only until you RSVP yes.
  const showAddress = !isPublic || mine?.status === 'yes';
  return (
    <div className="flex flex-col gap-5">
      <MergeBanner asPlayer />
      {isPublic && (
        <div className={`card p-5 ring-2 ${plan.meetupConfirmed ? 'ring-lime' : 'ring-sun/50'}`}>
          <div className="font-display text-2xl font-black">
            {going} {going === 1 ? 'person' : 'people'} · {option.category} · {plan.slotLabel.split('·').pop()?.trim()}
          </div>
          <div className={plan.meetupConfirmed ? 'font-bold text-lime' : 'text-cream/75'}>
            <IconText text={plan.meetupConfirmed ? '✅ Meetup confirmed!' : `Needs 3 RSVPs to confirm (${going}/3)`} />
          </div>
          {plan.icebreakers.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-cream/85">
              {plan.icebreakers.map(i => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="card space-y-2 p-5">
        <div className="font-display text-3xl font-black">{option.title}</div>
        <div className="font-display text-xl font-extrabold text-sky">{plan.slotLabel}</div>
        <div className="text-sm text-cream/70"><IconText text={showAddress ? option.address : '📍 Exact address unlocks when you RSVP "I\'m in"'} /></div>
        {cantMake && <div className="chip bg-tang/20 text-tang">This slot doesn't fit your free time, sorry!</div>}
        <div className="text-cream/80">{plan.inviteText}</div>
        {plan.whyForEach.find(w => w.playerId === me?.id) && <div className="text-lime"><IconText text={"💚 "} />{plan.whyForEach.find(w => w.playerId === me?.id)!.line}</div>}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {(['yes', 'maybe', 'no'] as const).map(s => (
          <button key={s} className={`btn text-lg ${mine?.status === s ? 'btn-lime' : 'btn-ghost'}`} onClick={() => call(c => c.reducers.setRsvp({ planId: plan.id, status: s }))}>
            {s === 'yes' ? "I'm in" : s === 'maybe' ? 'Maybe' : "Can't"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button className="btn btn-sun text-lg" disabled={!showAddress} onClick={downloadIcs}><IconText text={" 📅 Add to calendar "} /></button>
        {showAddress ? <a className="btn btn-sky text-lg" href={googleCalendarUrl(event)} target="_blank" rel="noreferrer">Google Calendar</a> : <button className="btn btn-sky text-lg" disabled>Calendar after RSVP</button>}
        {showAddress ? (
          <a className="btn btn-ghost text-lg" href={option.mapsUrl} target="_blank" rel="noreferrer"><IconText text={" 🗺️ Maps "} /></a>
        ) : (
          <button className="btn btn-ghost text-lg" disabled><IconText text={" 🗺️ After RSVP "} /></button>
        )}
        <button className="btn btn-ghost text-lg" disabled={!showAddress} onClick={() => void share()}><IconText text={" 🔗 Share "} /></button>
      </div>
      <details className="card p-4"><summary className="cursor-pointer font-black">Invitation poster</summary><div className="mt-4"><Poster plan={plan} option={option} imageUrl={posterUrl || plan.posterUrl || undefined} players={players} /></div></details>
      <SafetyList />
      <div className="text-center text-xs text-muted">Room {room.code}</div>
    </div>
  );
}
