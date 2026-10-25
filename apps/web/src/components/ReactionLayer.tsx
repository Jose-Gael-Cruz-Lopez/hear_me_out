import { IconText, AvatarMark } from './Ink';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTable } from 'spacetimedb/react';
import { tables } from '@hmo/bindings';
import { useRoom } from '../lib/room';
import { play } from '../lib/sound';
import { seatColor } from './ui';
import { reactionLabel } from '../lib/reactions';

interface Particle {
  id: number;
  emoji: string;
  name: string;
  avatar: string;
  x: number;
}

let nextId = 1;

/** Reactions arrive through the `reaction` event table: broadcast to subscribers, never stored. */
export function ReactionLayer({ viewport = false }: { viewport?: boolean }) {
  const { room, me, playable, playerById } = useRoom();
  const currentPitchId = playable[room.currentPitchIdx]?.id;
  const meId = me?.id;
  const [particles, setParticles] = useState<Particle[]>([]);
  const [objection, setObjection] = useState<{ id: number; name: string; color: string } | null>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  const expire = useCallback((callback: () => void, delay: number) => {
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      callback();
    }, delay);
    timers.current.add(timer);
  }, []);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const onInsert = useCallback(
    (r: { emoji: string; playerId: bigint; pitchId: bigint }) => {
      if (room.phase !== 'playback' || r.pitchId !== currentPitchId) return;
      const player = playerById(r.playerId);
      if (r.emoji === 'OBJECTION') {
        const id = nextId++;
        setObjection({ id, name: player?.name ?? 'Someone', color: seatColor(player?.seat ?? 0) });
        // The sender already played this sound when pressing the button.
        if (r.playerId !== meId) play('objection');
        expire(() => setObjection(o => (o?.id === id ? null : o)), 1800);
        return;
      }
      const id = nextId++;
      setParticles(ps => [...ps.slice(-40), { id, emoji: r.emoji, name: player?.name ?? 'Someone', avatar: player?.avatar ?? '', x: Math.random() * 48 - 24 }]);
      play('pop');
      expire(() => setParticles(ps => ps.filter(p => p.id !== id)), 2600);
    },
    [currentPitchId, expire, meId, playerById, room.phase]
  );

  useTable(tables.reaction.where(r => r.roomId.eq(room.id)), { onInsert });

  if (room.phase !== 'playback') return null;

  return (
    <div className={`pointer-events-none inset-0 z-50 overflow-hidden ${viewport ? 'fixed mx-auto max-w-xl' : 'absolute'}`}>
      <div className="sr-only" role="status" aria-live="polite">
        {particles.length > 0 && `${particles[particles.length - 1].name}: ${reactionLabel(particles[particles.length - 1].emoji)}`}
      </div>
      {particles.map(p => (
        <span key={p.id} aria-hidden="true" data-reaction={p.emoji} className="absolute bottom-4" style={{ left: `calc(50% + ${p.x}px)`, transform: 'translateX(-50%)' }}>
          <span className="inline-flex items-center gap-2 rounded-full border-2 border-ink bg-white px-4 py-2 text-sm font-black text-ink shadow-[2px_3px_0_#14140f]" style={{ maxWidth: 'min(18rem, calc(100vw - 6rem))', animation: 'float-up 2.6s ease-out forwards' }}>
            <AvatarMark value={p.avatar} size={32} />
            <IconText text={p.emoji} size={24} />
            <span className="truncate">{p.name}: {reactionLabel(p.emoji)}</span>
          </span>
        </span>
      ))}
      <AnimatePresence>
        {objection && (
          <motion.div
            key={objection.id}
            initial={{ scale: 3, opacity: 0, rotate: -15 }}
            animate={{ scale: 1, opacity: 1, rotate: -6 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 500, damping: 15 }}
            className="absolute inset-0 grid place-items-center"
          >
            <div className="text-center">
              <div className={`font-display leading-none font-black text-sustain text-outline italic ${viewport ? 'text-[clamp(2.5rem,12vw,4rem)]' : 'text-[8rem]'}`}>OBJECTION!</div>
              <div className="font-display text-4xl font-black" style={{ color: objection.color }}>
                — {objection.name}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
