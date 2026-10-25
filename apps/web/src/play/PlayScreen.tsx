import { useEffect } from 'react';
import { GameCast } from '../components/GameCast';
import { IconText } from '../components/Ink';
import { motion } from 'motion/react';
import { Link } from 'wouter';
import { ReactionLayer } from '../components/ReactionLayer';
import { Avatar, Countdown, MuteButton } from '../components/ui';
import { isMatchedRoom, useRoom } from '../lib/room';
import { unlockAudio } from '../lib/sound';
import { JoinForm } from './Join';
import { ProfileFlow } from './Profile';
import { Recorder } from './Recorder';
import { FollowMatch, QueueScreen } from './Queue';
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
  const { room, me, pitches } = useRoom();
  if (room.mode === 'queue') {
    return (
      <>
        <FollowMatch />
        {me ? <Frame><QueueScreen /></Frame> : <JoinForm />}
      </>
    );
  }
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
        return <PlayWaiting emoji="🛰️" title="Scouting real places…" sub="Finding places that fit your group." />;
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
        return pitches.some(p => p.playerId === me.id && p.status === 'needs_text') ? <Recorder /> : <PlayPlayback />;
      case 'vote':
        return <PlayVote />;
      case 'results':
        return <PlayResults />;
      case 'plan':
        return <PlayPlan />;
      default:
        return <div className="flex flex-1 flex-col gap-6"><PlayWaiting emoji="🔨" title="Court adjourned" /><Link href="/" className="btn btn-sun">Back home</Link></div>;
    }
  })();

  return <Frame>{screen}</Frame>;
}

/** Matched meetups: the tags at least two of you share (why the matcher put you together). */
function MatchedOn() {
  const { room, profiles } = useRoom();
  if (!isMatchedRoom(room)) return null;
  const counts = new Map<string, number>();
  for (const p of profiles.values()) for (const t of p.approvedTags) counts.set(t, (counts.get(t) ?? 0) + 1);
  const shared = [...counts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => `#${t}`);
  return (
    <div className="mx-4 mt-3 chip justify-center bg-lime/15 px-4 py-2 text-lime ring-1 ring-lime/40"><IconText text={" 🤝 "} />{room.groupName}: {shared.length ? `matched on ${shared.join(' ')}` : 'new people, new vibes'}
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  const { room, me } = useRoom();
  useEffect(() => { window.scrollTo({ top: 0 }); }, [room.phase]);
  if (!me) return null;
  return (
    <div className="relative isolate mx-auto flex min-h-full max-w-xl flex-col" onClick={unlockAudio}>
      <header className="player-game-bar flex items-center justify-between gap-3 px-4 pt-4">
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
      <MatchedOn />
      <GameCast />
      <main className="flex flex-1 flex-col px-4 py-5">
                  <motion.div key={room.phase} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-1 flex-col">
            {children}
          </motion.div>
      </main>
      {room.phase === 'playback' && <ReactionLayer key={room.currentPitchIdx} viewport />}
    </div>
  );
}
