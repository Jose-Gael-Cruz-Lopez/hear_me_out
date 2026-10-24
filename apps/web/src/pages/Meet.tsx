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
      <header className="meet-top">
        <Link href="/" className="meet-back" aria-label="Back to home"><DoodleIcon name="arrowLeft" size={20} /></Link>
        <span className="meet-chip">STRANGERS / RANDOM</span>
        <span className="meet-logo"><Logo size="sm" /></span>
      </header>
      <form className="meet-form" onSubmit={async e => {
        e.preventDefault(); unlockAudio(); setJoining(true);
        try { await call(c => c.reducers.joinMatchmaking({ category, locationLabel: where, tzOffsetMin: -new Date().getTimezoneOffset(), name, avatar, confirmed18: adult, fastMode: false })); }
        finally { setJoining(false); }
      }}>
        <div className="meet-body">
          <section className="meet-intro">
            <h1>Your kind of strangers.</h1>
            <p>Groups of 3–4. No host or TV: everything plays on your phones.</p>
            <div className="meet-steps">
              <div><b>1</b> Bring your vibe</div>
              <div><b>2</b> Meet your group</div>
              <div><b>3</b> Play for a real plan</div>
            </div>
          </section>
          <div className="meet-fields">
            <fieldset>
              <legend className="meet-label">WHAT'S THE OCCASION?</legend>
              <div className="meet-cats">
                {CATEGORIES.map(c => <button key={c.id} type="button" aria-pressed={category === c.id} onClick={() => setCategory(c.id)} className="meet-category"><DoodleIcon name={c.icon} size={28} />{c.label}</button>)}
              </div>
            </fieldset>
            <label className="meet-field">
              <span className="meet-label">AROUND</span>
              <input required value={where} onChange={e => setWhere(e.target.value)} className="meet-input" />
            </label>
            <label className="meet-field">
              <span className="meet-label">FIRST NAME (ONE WORD)</span>
              <input required autoComplete="given-name" value={name} onChange={e => setName(e.target.value.slice(0, 20))} placeholder="Your name" className="meet-input meet-name" />
            </label>
            <fieldset>
              <legend className="meet-label">PICK YOUR LITTLE PERSON</legend>
              <div className="meet-avatars">{AVATARS.map((a, i) => <button key={a} type="button" className="avatar-choice" aria-label={`Avatar ${i + 1}`} aria-pressed={avatar === a} onClick={() => setAvatar(a)}><AvatarMark value={a} size={44} /></button>)}</div>
            </fieldset>
            <div className="meet-safety">
              <div className="meet-safety-note"><DoodleIcon name="shield" size={22} /><span>First names only. Public venues. Exact address after you RSVP; three RSVPs confirm the meetup.</span></div>
              <label className="meet-check">
                <input type="checkbox" checked={adult} onChange={e => setAdult(e.target.checked)} />
                <span className="meet-box" aria-hidden="true">{adult && <DoodleIcon name="check" size={16} />}</span>
                I'm 18 or older
              </label>
            </div>
          </div>
        </div>
        <div className="meet-action">
          <button className="meet-go" disabled={!isActive || !name.trim() || !where.trim() || !adult || joining}>{joining ? 'Joining…' : 'Find my people'}<DoodleIcon name="arrow" size={18} /></button>
          {!isActive && <p className="meet-connecting">Connecting before we find your group…</p>}
        </div>
      </form>
    </main>
  );
}
