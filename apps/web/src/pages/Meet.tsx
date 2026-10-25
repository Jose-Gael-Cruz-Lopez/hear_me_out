import { motion } from 'motion/react';
import { AvatarMark } from '../components/Ink';
import { DoodleIcon } from '../components/DoodleIcon';
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
  { id: 'food', label: 'Food', icon: 'noodles' },
  { id: 'activity', label: 'Activity', icon: 'bowling' },
  { id: 'movie', label: 'Movie', icon: 'film' },
] as const;

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
  const [joining, setJoining] = useState(false);
  const [rooms] = useTable(tables.room.where(r => r.mode.eq('queue')));
  const [mine] = useTable(identity ? tables.player.where(p => p.identity.eq(identity)) : tables.player, { enabled: !!identity });

  useEffect(() => {
    const q = rooms.find(r => mine.some(p => p.roomId === r.id));
    if (q) navigate(`/play/${q.code}`);
  }, [rooms, mine, navigate]);

  return (
    <main className="meet-page">
      <header className="flex items-center justify-between gap-4">
        <Logo size="sm" /><Link href="/" className="ink-pill"><DoodleIcon name="arrowLeft" size={18} /> Home</Link>
      </header>
      <div className="meet-grid">
        <section className="meet-intro">
          <span className="chip bg-sun">STRANGERS / RANDOM</span>
          <h1>Your kind<br />of strangers.</h1>
          <p>Meet your group. Make a ridiculous case. Go somewhere together.</p>
          <div className="meet-steps">
            <div><b>1</b> Bring your vibe</div>
            <div><b>2</b> Meet your group</div>
            <div><b>3</b> Play for a real plan</div>
          </div>
          <p className="text-sm">3–4 people. One game. All on your phones.</p>
        </section>
        <form className="card space-y-5 p-6" onSubmit={async e => {
          e.preventDefault(); unlockAudio(); setJoining(true);
          try { await call(c => c.reducers.joinMatchmaking({ category, locationLabel: where, tzOffsetMin: -new Date().getTimezoneOffset(), name, avatar, confirmed18: adult, fastMode: false })); }
          finally { setJoining(false); }
        }}>
          <h2 className="ink-heading text-3xl">Find my people</h2>
          <fieldset>
            <legend className="mb-2 text-xs font-black tracking-widest">WHAT'S THE OCCASION?</legend>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map(c => <button key={c.id} type="button" aria-pressed={category === c.id} onClick={() => setCategory(c.id)} className={`meet-category rounded-2xl p-3 font-black ${category === c.id ? 'bg-sun' : 'bg-white'}`}><DoodleIcon name={c.icon} size={30} />{c.label}</button>)}
            </div>
          </fieldset>
          <label className="block"><span className="text-xs font-black tracking-widest">AROUND</span><input required value={where} onChange={e=>setWhere(e.target.value)} className="mt-2 w-full rounded-2xl px-4 py-3" /><span className="mt-1 block text-xs text-muted">Venue search area. Groups match on shared interests.</span></label>
          <label className="block"><span className="text-xs font-black tracking-widest">FIRST NAME (ONE WORD)</span><input required autoComplete="given-name" value={name} onChange={e=>setName(e.target.value.slice(0,20))} placeholder="Your name" className="mt-2 w-full rounded-2xl px-4 py-3 text-xl font-black" /></label>
          <motion.div key={avatar} initial={{ x: -14, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="character-preview"><AvatarMark value={avatar} size={100} pose="move" /><strong>That’s you.</strong></motion.div>
          <fieldset><legend className="mb-2 text-xs font-black tracking-widest">PICK YOUR LITTLE PERSON</legend><div className="grid grid-cols-6 gap-2">{AVATARS.map((a,i)=><button key={a} type="button" className="avatar-choice grid aspect-square place-items-center" aria-label={`Avatar ${i+1}`} aria-pressed={avatar===a} onClick={()=>setAvatar(a)}><AvatarMark value={a} size={38} /></button>)}</div></fieldset>
          <div className="space-y-3 rounded-2xl bg-sky/15 p-4 text-sm">
            <div className="flex items-start gap-2"><DoodleIcon name="shield" /><span>First names. Public venues. Your Yes unlocks the address. Three Yes replies make it a plan.</span></div>
            <label className="flex items-center gap-2 font-black"><input type="checkbox" checked={adult} onChange={e=>setAdult(e.target.checked)} className="h-5 w-5" />I'm 18 or older</label>
          </div>
          <button className="btn btn-pop w-full" disabled={!isActive || !name.trim() || !where.trim() || !adult || joining}>{joining ? 'Joining…' : 'Find my people'}<DoodleIcon name="arrow" /></button>
          {!isActive && <p className="text-center text-sm text-muted">Connecting before we find your group…</p>}
        </form>
      </div>
    </main>
  );
}
