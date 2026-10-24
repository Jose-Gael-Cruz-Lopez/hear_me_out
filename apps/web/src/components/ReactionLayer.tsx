import { IconText } from './Ink';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useState } from 'react';
import { useTable } from 'spacetimedb/react';
import { tables } from '@hmo/bindings';
import { useRoom } from '../lib/room';
import { play } from '../lib/sound';
import { seatColor } from './ui';

interface Particle {
  id: number;
  emoji: string;
  x: number;
}

let nextId = 1;

/** Reactions arrive through the `reaction` event table: broadcast to subscribers, never stored. */
export function ReactionLayer() {
  const { room, playerById } = useRoom();
  const [particles, setParticles] = useState<Particle[]>([]);
  const [objection, setObjection] = useState<{ id: number; name: string; color: string } | null>(null);

  const onInsert = useCallback(
    (r: { emoji: string; playerId: bigint }) => {
      if (r.emoji === 'OBJECTION') {
        const p = playerById(r.playerId);
        const id = nextId++;
        setObjection({ id, name: p?.name ?? 'Someone', color: seatColor(p?.seat ?? 0) });
        play('objection');
        setTimeout(() => setObjection(o => (o?.id === id ? null : o)), 1800);
        return;
      }
      const id = nextId++;
      setParticles(ps => [...ps.slice(-40), { id, emoji: r.emoji, x: 5 + Math.random() * 90 }]);
      play('pop');
      setTimeout(() => setParticles(ps => ps.filter(p => p.id !== id)), 2600);
    },
    [playerById]
  );

  useTable(tables.reaction.where(r => r.roomId.eq(room.id)), { onInsert });

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {particles.map(p => (
        <span key={p.id} className="absolute bottom-0 text-6xl" style={{ left: `${p.x}%`, animation: 'float-up 2.6s ease-out forwards' }}>
          <IconText text={p.emoji} size={56} />
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
              <div className="font-display text-[8rem] leading-none font-black text-sustain text-outline italic">OBJECTION!</div>
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
