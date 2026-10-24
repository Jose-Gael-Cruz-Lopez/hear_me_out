import { IconText } from '../components/Ink';
import { DoodleIcon } from '../components/DoodleIcon';
import { motion } from 'motion/react';
import { useRef, useState } from 'react';
import { PITCH_REACTIONS } from '../lib/reactions';
import { buildIcs, googleCalendarUrl, type CalendarEvent } from '@hmo/shared';
import type { Option } from '@hmo/bindings';
import { MergeBanner } from '../components/MergeBanner';
import { MuseReservation } from '../components/Muse';
import { SafetyList } from '../components/Safety';
import { WhatsAppGroup } from '../components/WhatsAppGroup';
import { Avatar, Poster, seatColor, useObjectUrl, VenueImage } from '../components/ui';
import { MHead, MScreen, MStatus } from '../components/Mobile';
import { isMatchedRoom, useCall, useRoom } from '../lib/room';
import { SwayLeanCard } from '../components/SwayMeter';
import { MenuProof } from '../components/MenuProof';
import { BusyChart } from '../components/BusyChart';
import { HostPlayback } from '../host/Playback';
import { play } from '../lib/sound';
import { tsMs } from '../lib/time';
import { toast } from '../lib/toast';

export function PlayWaiting({ emoji, title, sub }: { emoji: string; title: string; sub?: string }) {
  return (
    <MScreen center>
      <motion.div className="m-bob" animate={{ y: [0, -12, 0] }} transition={{ repeat: Infinity, duration: 1.4 }}>
        <IconText text={emoji} size={64} />
      </motion.div>
      <h1 className="m-h1 m-center-text">{title}</h1>
      {sub && <p className="m-sub m-center-text">{sub}</p>}
    </MScreen>
  );
}

export function PlayLobby() {
  const { me, players } = useRoom();
  return (
    <MScreen center action={<MStatus live>Waiting for the host to start</MStatus>}>
      {me && (
        <div className="m-hero-avatar">
          <Avatar player={me} size={104} label={false} />
        </div>
      )}
      <div className="m-center-text">
        <h1 className="m-h1 m-h1-xl">You're in!</h1>
        <p className="m-sub">Watch the TV. The host starts the game.</p>
      </div>
      <div className="m-card m-card-pad m-full">
        <div className="m-label">IN THE ROOM · {players.length}</div>
        <div className="m-people">
          {players.map(p => (
            <div key={String(p.id)} className="m-person">
              <Avatar player={p} size={52} label={false} />
              <span>{p.name}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="m-full">
        <SafetyList />
      </div>
    </MScreen>
  );
}

export function PlayWarmup() {
  const { me, warmups } = useRoom();
  const call = useCall();
  const w = warmups.find(x => x.playerId === me?.id);
  if (!w) return <PlayWaiting emoji="🔥" title="Hot take incoming…" />;
  return (
    <MScreen center action={<MStatus>{w.answer ? 'Locked in. Change it any time.' : 'Pick one. No wrong answers.'}</MStatus>}>
      <div className="m-center-text">
        <div className="m-kicker m-kicker-center">
          <IconText text="🔥" /> HOT TAKE
        </div>
        <h1 className="m-h1 m-h1-balance">{w.question}</h1>
      </div>
      <div className="m-stack m-full">
        {(['a', 'b'] as const).map(k => (
          <button
            key={k}
            onClick={() => {
              play('pop');
              void call(c => c.reducers.answerWarmup({ warmupId: w.id, answer: k }));
            }}
            className={`m-take ${w.answer === k ? 'on' : w.answer ? 'off' : k === 'a' ? 'a' : 'b'}`}
          >
            {k === 'a' ? w.choiceA : w.choiceB}
          </button>
        ))}
      </div>
    </MScreen>
  );
}

function priceParts(level: number) {
  const on = Math.max(0, Math.min(4, level));
  return { on: '$'.repeat(on), off: '$'.repeat(on ? 4 - on : 0) };
}

/** A finalist as a swipeable card (photo, facts, fit line, stretch note, menu proof). */
function FinalistCard({ o }: { o: Option }) {
  const price = priceParts(o.priceLevel);
  return (
    <div className="m-fin">
      <VenueImage option={o} className="m-fin-photo" />
      <div className="m-fin-body">
        <div className="m-fin-title">{o.title}</div>
        <div className="m-meta">
          <span className="m-cat">{o.category}</span>
          {o.rating > 0 && (
            <span>
              ★ {o.rating.toFixed(1)} <span className="m-dim">({o.reviewCount})</span>
            </span>
          )}
          {o.priceLevel > 0 && (
            <span>
              <span className="m-price-on">{price.on}</span>
              <span className="m-price-off">{price.off}</span>
            </span>
          )}
          <span>~{o.travelMin} min</span>
        </div>
        {o.hoursKnown && o.hoursText && <div className="m-hours">{o.hoursText}</div>}
        {o.fitSummary && (
          <div className="m-fit">
            <DoodleIcon name="heart" size={16} />
            {o.fitSummary}
          </div>
        )}
        {o.stretchNote && <div className="m-stretch">{o.stretchNote}</div>}
        <MenuProof optionId={o.id} />
      </div>
    </div>
  );
}

export function PlayFinalists() {
  const { options } = useRoom();
  const [idx, setIdx] = useState(0);
  return (
    <MScreen action={<MStatus>Your secret ballot opens in a moment</MStatus>}>
      <MHead kicker={`FINALISTS · ${options.length} REAL PLACES`} title="Tonight's contestants" />
      <div
        className="m-swipe"
        onScroll={e => {
          const el = e.currentTarget;
          const card = el.firstElementChild as HTMLElement | null;
          if (card) setIdx(Math.round(el.scrollLeft / (card.offsetWidth + 14)));
        }}
      >
        {options.map(o => (
          <FinalistCard key={String(o.id)} o={o} />
        ))}
      </div>
      <div className="m-dots">
        {options.map((o, i) => (
          <span key={String(o.id)} className={i === idx ? 'on' : ''} />
        ))}
      </div>
    </MScreen>
  );
}

/** One compact choice row for the secret ballot and the final vote. */
function PickRow({ o, on, onPick }: { o: Option; on: boolean; onPick: () => void }) {
  return (
    <button className={`m-pick ${on ? 'on' : ''}`} onClick={onPick} aria-pressed={on}>
      <VenueImage option={o} className="m-pick-photo" />
      <span className="m-pick-text">
        <span className="m-pick-title">{o.title}</span>
        <span className="m-pick-meta">
          {o.category}
          {o.rating > 0 && ` · ★ ${o.rating.toFixed(1)}`} · {o.travelMin} min
        </span>
      </span>
      <span className="m-pick-dot">{on && <DoodleIcon name="check" size={14} />}</span>
    </button>
  );
}

export function PlayPrevote() {
  const { options, room, myPrevoteOptionId, optionById } = useRoom();
  const call = useCall();
  const picked = myPrevoteOptionId !== undefined ? optionById(myPrevoteOptionId) : undefined;
  return (
    <MScreen action={<MStatus>{picked ? `🤫 Your secret pick: ${picked.title}. Switch any time.` : 'Tap your secret favorite.'}</MStatus>}>
      <MHead kicker="SECRET BALLOT" icon={<DoodleIcon name="lock" size={14} />} title="Your favorite, honestly?" sub="Nobody else sees this." />
      <div className="m-stack">
        {options.map(o => (
          <PickRow
            key={String(o.id)}
            o={o}
            on={myPrevoteOptionId === o.id}
            onPick={() => {
              play('pop');
              void call(c => c.reducers.castPrevote({ roomId: room.id, optionId: o.id }));
            }}
          />
        ))}
      </div>
    </MScreen>
  );
}

export function BriefCard() {
  const { me, assignments, optionById, players } = useRoom();
  const a = assignments.find(x => x.playerId === me?.id);
  const o = a && optionById(a.optionId);
  if (!a || !o) return null;
  const partners = assignments.filter(x => x.optionId === a.optionId && x.playerId !== a.playerId).map(x => players.find(p => p.id === x.playerId)?.name);
  return (
    <div className="m-case">
      <div className="m-case-head">YOUR CASE</div>
      <VenueImage option={o} className="m-case-photo" />
      <div className="m-case-body">
        <div className="m-case-title">Defend {o.title}</div>
        <div className="m-sticky">“{a.stylePrompt}”</div>
        <div className="m-label m-dim">{a.hints.length} FACTS TO USE</div>
        {a.hints.map(h => (
          <div key={h} className="m-fact">
            <IconText text="🧾" size={18} />
            <span>{h}</span>
          </div>
        ))}
        {partners.length > 0 && <div className="m-chip">Co-counsel with {partners.join(', ')}</div>}
      </div>
    </div>
  );
}

/** Record screen: your case as one tappable row that opens to the style prompt and facts. */
export function CaseToggle() {
  const { me, assignments, optionById } = useRoom();
  const a = assignments.find(x => x.playerId === me?.id);
  const o = a && optionById(a.optionId);
  if (!a || !o) return null;
  return (
    <details className="m-case-toggle">
      <summary>
        <span className="m-case-tag">CASE</span>
        <span className="m-case-name">Defend {o.title}</span>
        <span className="m-case-sign" aria-hidden="true" />
      </summary>
      <div className="m-case-more">
        <div className="m-case-style">“{a.stylePrompt}”</div>
        {a.hints.map(h => (
          <div key={h}>· {h}</div>
        ))}
      </div>
    </details>
  );
}

export function PlayAssignment() {
  return (
    <MScreen center action={<MStatus>Recording starts in a moment. Get your persona ready.</MStatus>}>
      <div className="m-twist">Plot twist!</div>
      <div className="m-full">
        <BriefCard />
      </div>
      <p className="m-sub m-center-text">You might be defending someone else's pick. Sell it anyway.</p>
    </MScreen>
  );
}

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
  const text = pitch.transcript || pitch.liveCaption;
  const objection = !mine && (
    <button
      className="m-btn m-btn-danger"
      disabled={objected}
      onClick={() => {
        play('objection');
        void call(c => c.reducers.raiseObjection({ pitchId: pitch.id }));
      }}
    >
      <IconText text={objected ? 'Objection noted ⚖️' : 'OBJECTION!'} />
    </button>
  );
  return (
    <MScreen action={objection || <MStatus>You're up! Watch the room swing.</MStatus>}>
      {stage && (
        <div key={String(pitch.id)} className="matched-playback flex flex-col">
          <HostPlayback />
        </div>
      )}
      {!stage && (
        <div className="m-speaker">
          {speaker && <Avatar player={speaker} size={56} label={false} />}
          <div className="m-speaker-text">
            <div className="m-dim m-small">
              {mine ? "You're up!" : `${speaker?.name} is defending`} · {room.currentPitchIdx + 1} of {playable.length}
            </div>
            <div className="m-speaker-title" style={{ color: speaker ? seatColor(speaker.seat) : undefined }}>
              {option?.title}
            </div>
          </div>
          {option && <VenueImage option={option} className="m-speaker-photo" />}
        </div>
      )}
      {!stage && text && <div className="m-quote">“{text}”</div>}
      <SwayLeanCard />
      <div className="m-reactions">
        {PITCH_REACTIONS.map(({ emoji, label }) => (
          <button
            key={emoji}
            type="button"
            className="m-react"
            onClick={() => {
              if (Date.now() - last.current < 200) return;
              last.current = Date.now();
              void call(c => c.reducers.react({ pitchId: pitch.id, emoji }), { silent: true });
            }}
          >
            <IconText text={emoji} size={22} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </MScreen>
  );
}

export function PlayVote() {
  const { options, room, votes, me, optionById } = useRoom();
  const call = useCall();
  const mine = votes.find(v => v.playerId === me?.id);
  const picked = mine ? optionById(mine.optionId) : undefined;
  return (
    <MScreen action={<MStatus>{picked ? `🗳️ Voted for ${picked.title}. Change it until time's up.` : 'One vote each.'}</MStatus>}>
      <MHead kicker="FINAL VOTE" title="Who convinced you?" sub="Vote for the place, not the person." />
      <div className="m-stack">
        {options.map(o => (
          <PickRow
            key={String(o.id)}
            o={o}
            on={mine?.optionId === o.id}
            onPick={() => {
              play('pop');
              void call(c => c.reducers.castVote({ roomId: room.id, optionId: o.id }));
            }}
          />
        ))}
      </div>
    </MScreen>
  );
}

export function PlayResults() {
  const { room, optionById, awards, playerById, votes, players } = useRoom();
  const winner = optionById(room.winnerOptionId);
  const winVotes = votes.filter(v => v.optionId === room.winnerOptionId).length;
  return (
    <MScreen action={<MStatus>The plan is coming up…</MStatus>}>
      <div className="m-verdict">
        <div className="m-kicker m-kicker-center">THE VERDICT</div>
        {winner && (
          <motion.div initial={{ scale: 0.6, rotate: -6, opacity: 0 }} animate={{ scale: 1, rotate: -2, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 14 }} className="m-full">
            <VenueImage option={winner} className="m-verdict-photo" />
          </motion.div>
        )}
        <motion.h1 initial={{ scale: 0.4 }} animate={{ scale: 1 }} className="m-verdict-title">
          {winner?.title}
        </motion.h1>
        <div className="m-sub">
          {winVotes} of {players.length} votes{room.tiebreakText ? '' : ' · won without a tie-break'}
        </div>
        {room.tiebreakText && <div className="m-sub">{room.tiebreakText}</div>}
      </div>
      {winner && <MenuProof optionId={winner.id} />}
      {awards.map(a => (
        <div key={String(a.id)} className="m-award">
          <span className={`m-award-icon ${a.kind === 'most_persuasive' ? 'gold' : 'sky'}`}>
            <IconText text={a.kind === 'most_persuasive' ? '🏆' : '💬'} size={22} />
          </span>
          <div>
            <div className="m-label">{a.kind === 'most_persuasive' ? 'MOST PERSUASIVE' : 'BEST LINE'}</div>
            <div className="m-award-text">
              {playerById(a.playerId)?.name}: {a.kind === 'best_line' ? `“${a.text}”` : a.text}
            </div>
          </div>
        </div>
      ))}
    </MScreen>
  );
}

type PlanTab = 'timing' | 'menu' | 'invite';

export function PlayPlan() {
  const { plan, optionById, players, rsvps, me, media, room, menuProofs } = useRoom();
  const call = useCall();
  const [manualInvite, setManualInvite] = useState(false);
  const [tabChoice, setTab] = useState<PlanTab | null>(null);
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
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      setManualInvite(false);
      toast('Invite copied. Paste it in the group chat!');
    } catch {
      setManualInvite(true);
      toast('Select and copy the invite below.');
    }
  };
  const cantMake = plan.cantMake.includes(me?.id ?? -1n);
  const isPublic = room.mode === 'strangers';
  const going = rsvps.filter(r => r.status === 'yes').length;
  // Public meetups: neighborhood only until you RSVP yes.
  const showAddress = !isPublic || mine?.status === 'yes';
  const myWhy = plan.whyForEach.find(w => w.playerId === me?.id)?.line;
  const goingPlayers = players.filter(p => rsvps.some(r => r.playerId === p.id && r.status === 'yes'));
  // Only offer tabs that have something to show.
  const hasTiming = plan.weekday >= 0 && option.busyness.length === 168 && plan.busyPct >= 0;
  const proof = menuProofs.get(option.id);
  const hasMenu = proof?.status === 'confirmed' || proof?.status === 'not_found';
  const tabs: { id: PlanTab; label: string }[] = [
    ...(hasTiming ? [{ id: 'timing' as const, label: 'Timing' }] : []),
    ...(hasMenu ? [{ id: 'menu' as const, label: 'Menu' }] : []),
    { id: 'invite', label: 'Invite' },
  ];
  const tab = tabs.some(t => t.id === tabChoice) ? tabChoice! : tabs[0]!.id;

  const actions = (
    <div className="m-plan-actions">
      <button className="m-act" disabled={!showAddress} onClick={downloadIcs}>
        <DoodleIcon name="calendar" size={20} />
        Calendar
      </button>
      {showAddress ? (
        <a className="m-act" href={googleCalendarUrl(event)} target="_blank" rel="noreferrer">
          <DoodleIcon name="calendar" size={20} />
          Google
        </a>
      ) : (
        <button className="m-act" disabled>
          <DoodleIcon name="calendar" size={20} />
          After RSVP
        </button>
      )}
      {showAddress ? (
        <a className="m-act" href={option.mapsUrl} target="_blank" rel="noreferrer">
          <DoodleIcon name="map" size={20} />
          Maps
        </a>
      ) : (
        <button className="m-act" disabled>
          <DoodleIcon name="map" size={20} />
          After RSVP
        </button>
      )}
      <button className="m-act" disabled={!showAddress} onClick={() => void share()}>
        <DoodleIcon name="link" size={20} />
        Share
      </button>
    </div>
  );

  return (
    <MScreen action={actions}>
      <MergeBanner asPlayer />
      {isPublic && (
        <div className={`m-card m-card-pad ${plan.meetupConfirmed ? 'm-ok' : ''}`}>
          <div className="m-card-title">
            {going} {going === 1 ? 'person' : 'people'} · {option.category} · {plan.slotLabel.split('·').pop()?.trim()}
          </div>
          <div className="m-small">
            <IconText text={plan.meetupConfirmed ? '✅ Meetup confirmed!' : `Needs 3 RSVPs to confirm (${going}/3)`} />
          </div>
          {plan.icebreakers.length > 0 && (
            <ul className="m-list">
              {plan.icebreakers.map(i => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="ticket">
        <VenueImage option={option} className="ticket-photo" />
        <div className="ticket-hero">
          <div className="plan-kicker">It's a plan</div>
          <div className="ticket-title">{option.title}</div>
          <div className="ticket-time">{plan.slotLabel}</div>
          <div className="ticket-addr">
            <IconText text={showAddress ? option.address : '📍 Exact address unlocks when you RSVP "I\'m in"'} />
          </div>
          {cantMake && <div className="m-stretch">This slot doesn't fit your free time, sorry!</div>}
          {myWhy && <div className="ticket-why">{myWhy}</div>}
          <div className="m-seg m-seg-rsvp">
            {(['yes', 'maybe', 'no'] as const).map(s => (
              <button key={s} className={mine?.status === s ? `on ${s}` : ''} onClick={() => call(c => c.reducers.setRsvp({ planId: plan.id, status: s }))}>
                {s === 'yes' ? "I'm in" : s === 'maybe' ? 'Maybe' : "Can't"}
              </button>
            ))}
          </div>
          <div className="m-going">
            {goingPlayers.slice(0, 6).map(p => (
              <Avatar key={String(p.id)} player={p} size={30} label={false} />
            ))}
            <span>{going ? `${going} going` : 'Nobody in yet'}</span>
          </div>
        </div>
        <div className="ticket-section">
          <div className="m-tabs">
            {tabs.map(t => (
              <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="m-tab-body">
            {tab === 'timing' && <BusyChart plan={plan} option={option} tzOffsetMin={room.tzOffsetMin} compact bare />}
            {tab === 'menu' && <MenuProof optionId={option.id} />}
            {tab === 'invite' && (
              <>
                <div className="ticket-invite">“{plan.inviteText}”</div>
                <button className="m-mini" disabled={!showAddress} onClick={() => void share()}>
                  <DoodleIcon name="copy" size={14} /> Copy invite
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      {manualInvite && showAddress && (
        <label className="m-card m-card-pad m-stack-sm">
          <span className="m-card-title">Copy this invite</span>
          <textarea aria-label="Invite to copy" readOnly value={`${plan.inviteText}\n${option.mapsUrl}`} onFocus={e => e.currentTarget.select()} className="m-textarea" />
        </label>
      )}
      <MuseReservation plan={plan} option={option} category={room.category} party={isPublic ? going : players.length - plan.cantMake.length} ready={!isPublic || plan.meetupConfirmed} />
      <WhatsAppGroup />
      <details className="m-card m-card-pad">
        <summary className="m-card-title">Invitation poster</summary>
        <div className="mt-4">
          <Poster plan={plan} option={option} imageUrl={posterUrl || plan.posterUrl || undefined} players={players} />
        </div>
      </details>
      <SafetyList />
      <div className="m-room-code">Room {room.code}</div>
    </MScreen>
  );
}
