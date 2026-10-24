import { motion } from 'motion/react';
import { useTable } from 'spacetimedb/react';
import { tables } from '@hmo/bindings';
import { useCall, useRoom } from '../lib/room';
import { Avatar } from './ui';

/** "The Taco Lawyers picked the same place at 8pm. Merge tables?" — shown on the TV and on player plan screens. */
export function MergeBanner({ asPlayer }: { asPlayer: boolean }) {
  const { room, mergeOffers, mergeVotes, me, players, rsvps } = useRoom();
  const call = useCall();
  const offer = mergeOffers.find(o => o.status === 'open' || o.status === 'accepted') ?? mergeOffers[0];
  const otherId = offer ? (offer.roomA === room.id ? offer.roomB : offer.roomA) : 0n;
  const [otherRooms] = useTable(tables.room.where(r => r.id.eq(otherId)), { enabled: !!offer });
  const [otherPlayers] = useTable(tables.player.where(p => p.roomId.eq(otherId)), { enabled: !!offer });
  const [otherRsvps] = useTable(tables.rsvp.where(r => r.roomId.eq(otherId)), { enabled: !!offer && offer.status === 'accepted' });
  if (!offer) return null;
  const other = otherRooms[0];
  const myVote = mergeVotes.find(v => v.playerId === me?.id);
  const tally = (roomId: bigint, n: number) => `${mergeVotes.filter(v => v.roomId === roomId && v.yes).length}/${n} yes`;

  if (offer.status === 'declined') return <div className="card p-4 text-cream/70">The merge with {other?.groupName ?? 'the other group'} was declined. Your own table it is!</div>;

  if (offer.status === 'accepted') {
    const guests = [...players.map(p => ({ p, r: rsvps.find(x => x.playerId === p.id) })), ...otherPlayers.map(p => ({ p, r: otherRsvps.find(x => x.playerId === p.id) }))];
    return (
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="card space-y-3 bg-gradient-to-r from-grape/40 to-pop/30 p-5">
        <div className="font-display text-2xl font-black">🎉 Tables merged with {other?.groupName ?? 'another group'}!</div>
        <div className="text-lg">{offer.introText}</div>
        <div className="flex flex-wrap gap-4">
          {guests.map(({ p, r }) => (
            <Avatar key={String(p.id)} player={p} size={48} done={r?.status === 'yes'} />
          ))}
        </div>
        <div className="text-sm text-cream/70">{guests.length} people at one table · {offer.venueTitle} · {offer.slotLabel}</div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="card space-y-3 p-5 ring-2 ring-sun">
      <div className="font-display text-2xl font-black text-sun">
        {other?.groupName ?? 'Another group'} picked {offer.venueTitle} too, {offer.slotLabel.split('·').pop()?.trim()}. Merge tables?
      </div>
      <div className="text-sm text-cream/75">
        Needs a majority in both groups · you: {tally(room.id, players.length)} · them: {tally(otherId, otherPlayers.length)}
      </div>
      {asPlayer && me && (
        <div className="flex gap-3">
          <button className={`btn flex-1 ${myVote?.yes ? 'btn-lime' : 'btn-ghost'}`} onClick={() => call(c => c.reducers.voteMerge({ offerId: offer.id, yes: true }))}>
            Merge! 🤝
          </button>
          <button className={`btn flex-1 ${myVote && !myVote.yes ? 'btn-pop' : 'btn-ghost'}`} onClick={() => call(c => c.reducers.voteMerge({ offerId: offer.id, yes: false }))}>
            Just us
          </button>
        </div>
      )}
    </motion.div>
  );
}
