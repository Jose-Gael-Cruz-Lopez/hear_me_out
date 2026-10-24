import { motion } from 'motion/react';
import { Avatar, Countdown, MuteButton } from '../components/ui';
import { useRoom } from '../lib/room';
import { unlockAudio } from '../lib/sound';
import { JoinForm } from './Join';
import { ProfileFlow } from './Profile';
import { Recorder } from './Recorder';
import {
  PlayAssignment,
  PlayFinalists,
  PlayLobby,
  PlayPlan,
  PlayPlayback,
  PlayPrevote,
  PlayResults,
  PlayVote,
  PlayWaiting,
  PlayWarmup,
} from './phases';

export function PlayScreen() {
  const { room, me } = useRoom();
  if (!me) return <JoinForm />;

  const screen = (() => {
    switch (room.phase) {
      case 'lobby':
        return <PlayLobby />;
      case 'profiles':
        return <ProfileFlow />;
      case 'warmup':
        return <PlayWarmup />;
      case 'scouting':
        return <PlayWaiting emoji="🛰️" title="Scouting real places…" sub={room.aiStatus} />;
      case 'finalists':
        return <PlayFinalists />;
      case 'prevote':
        return <PlayPrevote />;
      case 'assigning':
        return <PlayWaiting emoji="📜" title="Writing your case file…" sub="You might be defending someone else's pick." />;
      case 'assignments':
        return <PlayAssignment />;
      case 'pitching':
        return <Recorder />;
      case 'playback':
        return <PlayPlayback />;
      case 'vote':
        return <PlayVote />;
      case 'results':
        return <PlayResults />;
      case 'plan':
        return <PlayPlan />;
      default:
        return <PlayWaiting emoji="🔨" title="Court adjourned" />;
    }
  })();

  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col" onClick={unlockAudio}>
      <header className="flex items-center justify-between gap-3 px-4 pt-4">
        <div className="flex items-center gap-3">
          <Avatar player={me} size={44} label={false} />
          <div>
            <div className="font-display text-lg leading-none font-black">{me.name}</div>
            <div className="text-xs font-bold tracking-widest text-muted">ROOM {room.code}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <MuteButton />
          <Countdown deadline={room.phaseDeadline} startedAt={room.phaseStartedAt} size={52} />
        </div>
      </header>
      <main className="flex flex-1 flex-col px-4 py-5">
                  <motion.div key={room.phase} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-1 flex-col">
            {screen}
          </motion.div>
      </main>
    </div>
  );
}
