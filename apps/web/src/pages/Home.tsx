import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables } from '@hmo/bindings';
import { Logo } from '../components/ui';
import { useCall } from '../lib/room';
import { unlockAudio } from '../lib/sound';

export function Home() {
  const [, navigate] = useLocation();
  const { identity, isActive } = useSpacetimeDB();
  const call = useCall();
  const [rooms] = useTable(tables.room);
  const [code, setCode] = useState('');
  const creating = useRef<number | null>(null);
  const [busy, setBusy] = useState(false);

  // After create_room, jump to the newest room this tab hosts.
  useEffect(() => {
    if (creating.current === null || !identity) return;
    const mine = rooms
      .filter(r => r.hostIdentity.isEqual(identity) && Number(r.createdAt.microsSinceUnixEpoch / 1000n) >= creating.current! - 5000)
      .sort((a, b) => Number(b.createdAt.microsSinceUnixEpoch - a.createdAt.microsSinceUnixEpoch))[0];
    if (mine) {
      creating.current = null;
      navigate(`/host/${mine.code}`);
    }
  }, [rooms, identity, navigate]);

  const host = async (mode: 'friends' | 'strangers') => {
    unlockAudio();
    setBusy(true);
    creating.current = Date.now();
    await call(c => c.reducers.createRoom({ mode, tzOffsetMin: -new Date().getTimezoneOffset(), fastMode: false }));
    setBusy(false);
  };

  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col items-center justify-center gap-10 px-4 py-10">
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
        <Logo size="xl" />
        <p className="mx-auto mt-5 max-w-2xl text-2xl text-cream/85">
          The party game that turns <span className="font-bold text-sun">“idk, where do you want to go?”</span> into an actual plan.
        </p>
      </motion.div>

      <div className="grid w-full gap-6 md:grid-cols-2">
        <div className="card space-y-4 p-6">
          <div className="font-display text-3xl font-black">📺 Host on this screen</div>
          <p className="text-cream/80">This window becomes the TV. Everyone else joins from their own browser window with the room code.</p>
          <div className="flex flex-wrap gap-3">
            <button className="btn btn-pop" disabled={!isActive || busy} onClick={() => host('friends')}>
              Friends game
            </button>
            <button className="btn btn-ghost" disabled={!isActive || busy} onClick={() => host('strangers')}>
              Public meetup
            </button>
          </div>
        </div>

        <form
          className="card space-y-4 p-6"
          onSubmit={e => {
            e.preventDefault();
            unlockAudio();
            if (code.trim().length === 4) navigate(`/play/${code.trim().toUpperCase()}`);
          }}
        >
          <div className="font-display text-3xl font-black">🙋 Join a game</div>
          <input
            value={code}
            onChange={e => setCode(e.target.value.replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase())}
            placeholder="ROOM CODE"
            className="w-full rounded-2xl bg-ink px-5 py-4 text-center font-display text-4xl font-black tracking-[0.4em] text-sun ring-2 ring-white/10 outline-none placeholder:text-white/20 focus:ring-sun"
            autoFocus
          />
          <div className="flex flex-wrap gap-3">
            <button className="btn btn-sun" disabled={code.length !== 4}>
              Join
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => navigate('/lobbies')}>
              Browse open meetups
            </button>
          </div>
        </form>
      </div>

      <div className="max-w-2xl text-center text-sm text-muted">
        Real places from Google Maps (via Apify) · AI by Meta Muse · live game state on SpacetimeDB.
      </div>
    </div>
  );
}
