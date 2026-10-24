import { motion } from 'motion/react';
import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables } from '@hmo/bindings';
import { Avatar } from '../components/ui';
import { useRoom } from '../lib/room';
import { ProfileFlow } from './Profile';

/** When the matcher moves my player into a new room, follow it. */
export function FollowMatch() {
  const { room } = useRoom();
  const { identity } = useSpacetimeDB();
  const [, navigate] = useLocation();
  const [mine] = useTable(tables.player.where(p => p.identity.eq(identity!)), { enabled: !!identity });
  const [matched] = useTable(tables.room.where(r => r.mode.eq('strangers').and(r.isPublic.eq(false))));
  useEffect(() => {
    const target = matched.find(r => r.id !== room.id && mine.some(p => p.roomId === r.id));
    if (target) navigate(`/play/${target.code}`);
  }, [mine, matched, room.id, navigate]);
  return null;
}

/** The matchmaking queue: build your vibe, then wait to be matched with people who share it. */
export function QueueScreen() {
  const { me, players } = useRoom();
  if (!me?.ready) return <ProfileFlow />;
  const waiting = players.filter(p => p.ready && p.connected && !p.isBot);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <motion.div className="text-8xl" animate={{ rotate: [0, 15, -15, 0], scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
        🔭
      </motion.div>
      <div className="font-display text-3xl font-black">Finding your people…</div>
      <div className="text-cream/75">
        {waiting.length} {waiting.length === 1 ? 'person is' : 'people are'} ready nearby. We match groups of 3–4 who share your vibe.
      </div>
      <div className="flex flex-wrap justify-center gap-4">
        {waiting.map(p => (
          <Avatar key={String(p.id)} player={p} size={56} />
        ))}
      </div>
    </div>
  );
}
