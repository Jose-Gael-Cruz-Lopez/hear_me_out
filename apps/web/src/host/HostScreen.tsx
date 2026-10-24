import { IconText } from '../components/Ink';
import { motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { useSpacetimeDB } from 'spacetimedb/react';
import { AiTicker, Countdown, Logo, MuteButton } from '../components/ui';
import { ReactionLayer } from '../components/ReactionLayer';
import { useCall, useRoom } from '../lib/room';
import { play, unlockAudio } from '../lib/sound';
import { HostLobby } from './Lobby';
import { HostPlayback } from './Playback';
import {
  HostAssigning,
  HostAssignments,
  HostEnded,
  HostFinalists,
  HostPitching,
  HostPlan,
  HostPrevote,
  HostProfiles,
  HostResults,
  HostScouting,
  HostVote,
  HostWarmup,
} from './phases';

const PHASE_LABEL: Record<string, string> = {
  lobby: 'Lobby',
  profiles: 'Bring your Muse',
  warmup: 'Hot takes',
  scouting: 'Scouting',
  finalists: 'The finalists',
  prevote: 'Secret ballot',
  assigning: 'Case files',
  assignments: 'Your case',
  pitching: 'Record your pitch',
  playback: 'Hear them out',
  vote: 'Final vote',
  results: 'The verdict',
  plan: 'The plan',
  ended: 'Court adjourned',
};

export function HostScreen() {
  const { room } = useRoom();
  const { identity } = useSpacetimeDB();
  const call = useCall();
  const isHost = !!identity && room.hostIdentity.isEqual(identity);
  const lastPhase = useRef(room.phase);

  useEffect(() => {
    if (lastPhase.current !== room.phase) {
      lastPhase.current = room.phase;
      play('whoosh');
    }
  }, [room.phase]);

  const screen = (() => {
    switch (room.phase) {
      case 'lobby':
        return <HostLobby isHost={isHost} />;
      case 'profiles':
        return <HostProfiles />;
      case 'warmup':
        return <HostWarmup />;
      case 'scouting':
        return <HostScouting />;
      case 'finalists':
        return <HostFinalists />;
      case 'prevote':
        return <HostPrevote />;
      case 'assigning':
        return <HostAssigning />;
      case 'assignments':
        return <HostAssignments />;
      case 'pitching':
        return <HostPitching />;
      case 'playback':
        return <HostPlayback />;
      case 'vote':
        return <HostVote />;
      case 'results':
        return <HostResults />;
      case 'plan':
        return <HostPlan isHost={isHost} />;
      default:
        return <HostEnded />;
    }
  })();

  return (
    <div className="host-shell flex min-h-full flex-col" onClick={unlockAudio}>
      <header className="flex items-center justify-between gap-4 px-6 pt-5">
        <div className="flex items-center gap-4">
          <Logo size="sm" />
          <span className="chip bg-ink-3 text-cream/80 ring-1 ring-white/10">{PHASE_LABEL[room.phase] ?? room.phase}</span>
          {room.mode === 'strangers' && <span className="chip bg-sky/20 text-sky ring-1 ring-sky/40">Public meetup</span>}
        </div>
        <div className="flex items-center gap-4">
          {room.phase !== 'lobby' && <AiTicker text={room.aiStatus} />}
          <Countdown deadline={room.phaseDeadline} startedAt={room.phaseStartedAt} tick />
          <div className="text-right">
            <div className="text-xs font-bold tracking-widest text-muted">ROOM CODE</div>
            <div className="font-display text-4xl leading-none font-black tracking-widest text-sun">{room.code}</div>
          </div>
        </div>
      </header>

      <main className="relative flex flex-1 flex-col px-6 py-6">
                  <motion.div
            key={`${room.phase}-${room.phase === 'playback' ? room.currentPitchIdx : ''}`}
            initial={{ opacity: 0, y: 30, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            className="host-content flex flex-1 flex-col"
            data-phase={room.phase}
          >
            {screen}
          </motion.div>
        <ReactionLayer />
      </main>

      {isHost && (
        <footer className="flex items-center justify-between gap-3 px-6 pb-4">
          <MuteButton />
          <div className="flex gap-2">
            {!['lobby', 'plan', 'ended'].includes(room.phase) && (
              <button className="chip bg-ink-3 px-4 py-2 text-cream ring-1 ring-white/10 hover:bg-ink-4" onClick={() => call(c => c.reducers.skipPhase({ roomId: room.id }))}>
                <IconText text={room.phase === 'playback' ? 'Next pitch ⏭' : 'Skip ⏭'} />
              </button>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}
