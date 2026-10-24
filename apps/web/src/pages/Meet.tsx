import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables } from '@hmo/bindings';
import { Logo } from '../components/ui';
import { DEMO_LOCATION } from '../lib/connection';
import { useCall } from '../lib/room';
import { unlockAudio } from '../lib/sound';

const AVATARS = ['🦊', '🐙', '🐸', '🦄', '🐼', '🐯', '🦖', '🐝', '🦉', '🐳', '🌮', '👽'];
const CATEGORIES = [
  { id: 'food', label: '🍜 Food' },
  { id: 'activity', label: '🎳 Activity' },
  { id: 'movie', label: '🎬 Movie' },
];

/** "Find my people": join the matchmaking queue, build your vibe there, get matched with strangers. */
export function Meet() {
  const [, navigate] = useLocation();
  const call = useCall();
  const { identity, isActive } = useSpacetimeDB();
  const [category, setCategory] = useState('food');
  const [where, setWhere] = useState(DEMO_LOCATION || 'San Francisco');
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [adult, setAdult] = useState(false);
  const [joined, setJoined] = useState(false);
  const [rooms] = useTable(tables.room.where(r => r.mode.eq('queue')));
  const [mine] = useTable(tables.player.where(p => p.identity.eq(identity!)), { enabled: !!identity });

  useEffect(() => {
    if (!joined) return;
    const q = rooms.find(r => mine.some(p => p.roomId === r.id));
    if (q) navigate(`/play/${q.code}`);
  }, [joined, rooms, mine, navigate]);

  return (
    <div className="mx-auto max-w-md space-y-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <Logo size="sm" />
        <Link href="/" className="chip bg-ink-3 text-cream">
          ← Home
        </Link>
      </div>
      <div>
        <div className="font-display text-4xl font-black">Find my people</div>
        <div className="text-cream/75">Tell us your vibe. We'll match you with 2–3 people nearby who share it, and you'll decide where to go together.</div>
      </div>
      <form
        className="card space-y-5 p-6"
        onSubmit={async e => {
          e.preventDefault();
          unlockAudio();
          if (await call(c => c.reducers.joinMatchmaking({ category, locationLabel: where, tzOffsetMin: -new Date().getTimezoneOffset(), name, avatar, confirmed18: adult, fastMode: false }))) setJoined(true);
        }}
      >
        <div className="grid grid-cols-3 gap-2">
          {CATEGORIES.map(c => (
            <button key={c.id} type="button" onClick={() => setCategory(c.id)} className={`rounded-2xl p-3 font-display font-black ${category === c.id ? 'bg-sun text-ink' : 'bg-ink-3 text-cream'}`}>
              {c.label}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="text-sm font-bold text-muted">AROUND</span>
          <input value={where} onChange={e => setWhere(e.target.value)} className="mt-1 w-full rounded-2xl bg-ink px-4 py-3 ring-2 ring-white/10 outline-none focus:ring-sky" />
        </label>
        <label className="block">
          <span className="text-sm font-bold text-muted">FIRST NAME (ONE WORD)</span>
          <input value={name} onChange={e => setName(e.target.value.slice(0, 20))} className="mt-1 w-full rounded-2xl bg-ink px-4 py-3 font-display text-2xl font-black ring-2 ring-white/10 outline-none focus:ring-sun" />
        </label>
        <div className="grid grid-cols-6 gap-2">
          {AVATARS.map(a => (
            <button key={a} type="button" onClick={() => setAvatar(a)} className={`grid aspect-square place-items-center rounded-2xl text-2xl ${avatar === a ? 'bg-pop' : 'bg-white/5'}`}>
              {a}
            </button>
          ))}
        </div>
        <div className="space-y-2 rounded-2xl bg-sky/10 p-4 text-sm ring-1 ring-sky/30">
          <div className="text-cream/80">🛡️ First names only · public venues · exact address after you RSVP · block & report anyone · a meetup confirms at 3 RSVPs</div>
          <label className="flex items-center gap-2 font-bold">
            <input type="checkbox" checked={adult} onChange={e => setAdult(e.target.checked)} className="h-5 w-5 accent-[#a3ff5c]" />
            I'm 18 or older
          </label>
        </div>
        <button className="btn btn-pop w-full" disabled={!isActive || !name.trim() || !adult || joined}>
          {joined ? 'Joining…' : 'Find my people'}
        </button>
      </form>
    </div>
  );
}
