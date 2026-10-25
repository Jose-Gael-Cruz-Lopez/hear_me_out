import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTable } from 'spacetimedb/react';
import { tables } from '@hmo/bindings';
import { reactionLabel } from '../lib/reactions';
import { motion, useReducedMotion } from 'motion/react';
import { AvatarMark } from './Ink';
import { DoodleIcon } from './DoodleIcon';
import { useRoom } from '../lib/room';
import { seatColor } from './ui';

const CUES: Record<string, [string, string]> = {
  lobby: ['The gang’s assembling.', 'Pick your person. Get comfortable.'],
  profiles: ['Bring your vibe.', 'Only share what you approve.'],
  warmup: ['A tiny hot take.', 'Pick a side. No wrong answers.'],
  scouting: ['A little field trip.', 'Finding your real-world contenders.'],
  finalists: ['Meet the contenders.', 'Good options. Questionable arguments.'],
  prevote: ['Your secret favorite.', 'Your pick stays private.'],
  assigning: ['Plot twist incoming.', 'You might defend someone else’s pick.'],
  assignments: ['You have a case.', 'Time to become unnecessarily persuasive.'],
  pitching: ['Make your case.', 'Thirty seconds. Make them care.'],
  playback: ['The floor is yours.', 'Listen. Laugh. Object.'],
  vote: ['Who won you over?', 'Vote for the plan, not the performance.'],
  results: ['An excellent argument.', 'A real plan. A very unserious process.'],
  plan: ['From little people to real plans.', 'Say you’re in. Then show up.'],
  ended: ['That was a good little argument.', 'Same people. Another round?'],
};

type CastPulse = { playerId: string; label: string; pitchId: bigint; sequence: number };
type CastMember = { id: string; name: string; avatar: string; seat: number; connected: boolean; active: boolean; done: boolean; status: string; self: boolean };

/** The roster is the game's public state, never an inferred feeling or a private vote. */
export function GameCast({ host = false }: { host?: boolean }) {
  const { room, players, me, profiles, warmups, pitches, playable, votes, rsvps } = useRoom();
  const [pulse, setPulse] = useState<CastPulse | null>(null);
  const pulseTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(pulseTimer.current), []);
  const currentPitch = playable[room.currentPitchIdx]?.id;
  const onReaction = useCallback((r: { playerId: bigint; pitchId: bigint; emoji: string }) => {
    if (room.phase !== 'playback' || r.pitchId !== currentPitch) return;
    clearTimeout(pulseTimer.current);
    setPulse(p => ({ playerId: String(r.playerId), label: r.emoji === 'OBJECTION' ? 'Objection!' : reactionLabel(r.emoji), pitchId: r.pitchId, sequence: (p?.sequence ?? 0) + 1 }));
    pulseTimer.current = setTimeout(() => setPulse(null), 2200);
  }, [room.phase, currentPitch]);
  useTable(tables.reaction.where(r => r.roomId.eq(room.id)), { onInsert: onReaction });
  const currentSpeaker = room.phase === 'playback' ? playable[room.currentPitchIdx]?.playerId : undefined;
  if (!players.length || room.mode === 'queue') return null;
  // The host lobby already has the full 3D room. Keep one scene on that screen.
  if (host && room.phase === 'lobby') return null;
  const members = players.map(p => {
    let done = false;
    let status = '';
    if (room.phase === 'profiles') { done = profiles.has(p.id); status = done ? 'Ready' : 'Finding a vibe'; }
    if (room.phase === 'warmup') { done = !!warmups.find(w => w.playerId === p.id)?.answer; status = done ? 'Picked a side' : 'Thinking'; }
    if (room.phase === 'pitching') { done = pitches.some(x => x.playerId === p.id && x.status === 'ready'); status = done ? 'Pitch is in' : 'Making a case'; }
    if (room.phase === 'vote') { done = votes.some(v => v.playerId === p.id); status = done ? 'Voted' : 'Deciding'; }
    if (room.phase === 'plan') { const r = rsvps.find(r => r.playerId === p.id); done = r?.status === 'yes'; status = done ? 'I’m in' : r?.status === 'no' ? 'Sitting this out' : r?.status === 'maybe' ? 'Maybe' : 'Coming along?'; }
    const active = p.id === currentSpeaker;
    if (active) status = 'On the floor';
    return { id: String(p.id), name: p.name, avatar: p.avatar, seat: p.seat, connected: p.connected, active, done, status, self: p.id === me?.id };
  });
  return <PartyStage key={String(room.id)} phase={room.phase} members={members} host={host} pulse={room.phase === 'playback' && pulse?.pitchId === currentPitch ? pulse : null} />;
}

export function PartyStage({ phase, members, host = false, pulse }: { phase: string; members: CastMember[]; host?: boolean; pulse?: CastPulse | null }) {
  const [twirls, setTwirls] = useState(0);
  const reduced = useReducedMotion();
  const cue = CUES[phase] ?? CUES.lobby;
  const travelling = ['scouting', 'assigning'].includes(phase);
  const celebrate = ['results', 'ended'].includes(phase);
  return <section className={`party-stage ${host ? 'party-stage--host' : ''}`} data-cast-phase={phase} data-player-count={members.length} aria-label="Your group in the game">
    <div className="party-stage__cue"><strong>{cue[0]}</strong><span>{cue[1]}</span></div>
    <div className={`party-stage__floor ${phase === 'plan' ? 'party-stage__floor--plan' : ''}`}>
      {phase === 'plan' && <div className="party-stage__table" aria-hidden="true"><DoodleIcon name="noodles" size={26} /></div>}
      <ul className="party-stage__people" aria-label="Players">
        {members.map((p, i) => {
          const reacting = pulse?.playerId === p.id;
          const pose = travelling || p.active || reacting ? 'move' : 'idle';
          const figure = <><span className="party-person__bubble">{!p.connected ? 'Reconnecting' : reacting ? pulse.label : p.active || p.self ? p.status : ''}</span>
            <motion.span className="party-person__figure" animate={reduced ? undefined : p.self && twirls ? { rotate: [0, -15, 12, -8, 0], y: [0, -9, 0] } : undefined} transition={{ duration: .65 }} key={`${p.self ? twirls : 'figure'}-${reacting ? pulse.sequence : 'rest'}`}>
              <AvatarMark value={p.avatar} size={host ? 104 : 77} pose={pose} />
            </motion.span>
            <span className="party-person__name">{p.name}{p.self ? ' · you' : ''}{p.done && <DoodleIcon name="check" size={12} />}</span></>;
          return <motion.li layout={!reduced} key={p.id} aria-label={`${p.name}${p.status ? `, ${p.status}` : ''}`} className={`party-person ${travelling ? 'is-walking' : ''} ${celebrate || p.done && phase === 'plan' ? 'is-cheering' : ''} ${p.active ? 'is-speaking' : ''} ${reacting ? 'is-reacting' : ''} ${!p.connected ? 'is-away' : ''}`}
            style={{ '--person-ink': seatColor(p.seat), '--person-delay': `${i * -.17}s`, order: phase === 'plan' ? p.done ? 0 : 1 : undefined } as CSSProperties}>
            {p.self ? <button type="button" className="party-person__button" aria-label="Make your little person do a twirl" onClick={() => setTwirls(n => n + 1)}>{figure}</button> : <div className="party-person__button">{figure}</div>}
          </motion.li>;
        })}
      </ul>
    </div>
  </section>;
}
