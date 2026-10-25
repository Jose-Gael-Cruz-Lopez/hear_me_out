import { IconText } from '../components/Ink';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Crowd } from '../components/Crowd';
import { DEMO_LOCATION } from '../lib/connection';
import { useCall, useRoom } from '../lib/room';
import { unlockAudio } from '../lib/sound';
import { toast } from '../lib/toast';

const MEETUP_VIBES = ['spicy-food', 'board-games', 'karaoke', 'ramen', 'tacos', 'live-music', 'night-owl', 'cheap-eats', 'outdoors', 'dessert', 'anime', 'coffee'];
const MEETUP_TIMES = [
  { label: '6pm', min: 18 * 60 },
  { label: '7pm', min: 19 * 60 },
  { label: '8pm', min: 20 * 60 },
  { label: '9pm', min: 21 * 60 },
  { label: 'Flexible', min: -1 },
];

const CATEGORIES = [
  { id: 'food', label: 'Food', emoji: '🍜' },
  { id: 'activity', label: 'Activity', emoji: '🎳' },
  { id: 'movie', label: 'Movie', emoji: '🎬' },
] as const;

export function HostLobby({ isHost }: { isHost: boolean }) {
  const { room, players } = useRoom();
  const call = useCall();
  const [category, setCategory] = useState(room.category || 'food');
  const [where, setWhere] = useState(room.locationLabel || DEMO_LOCATION);
  const [locating, setLocating] = useState(false);
  const joinUrl = `${window.location.origin}/play/${room.code}`;
  const ready = !!room.category && (!!room.locationLabel || room.hasGeo);

  const saveSetup = (cat: string, label: string, geo?: { lat: number; lng: number }) => {
    const coordinates = geo ?? (room.hasGeo && label === room.locationLabel ? { lat: room.lat, lng: room.lng } : undefined);
    return call(c => c.reducers.setRoomSetup({ roomId: room.id, category: cat, locationLabel: label, lat: coordinates?.lat ?? 0, lng: coordinates?.lng ?? 0, hasGeo: !!coordinates }));
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      toast('Location is unavailable. Enter a neighborhood or address instead.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocating(false);
        setWhere('Near this computer');
        void saveSetup(category, 'Near this computer', { lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setLocating(false);
        toast('Could not use this computer’s location. Enter a neighborhood or address instead.');
      },
      { timeout: 8000 }
    );
  };

  return (
    <div className="grid flex-1 gap-8 lg:grid-cols-[1.2fr_1fr]">
      <div className="flex flex-col gap-8">
        <div className="card p-8 text-center">
          <div className="text-xl font-bold text-cream/80">Join from your own browser window at</div>
          <div className="mt-2 break-all text-lg font-black text-sky">{joinUrl.replace(/^https?:\/\//, '')}</div>
          <div className="mt-6 text-lg font-bold text-cream/70">or enter the code</div>
          <motion.div className="font-display text-[clamp(4rem,9vw,7rem)] leading-none font-black tracking-[0.15em] text-sun text-outline" animate={{ rotate: [-1.5, 1.5, -1.5] }} transition={{ repeat: Infinity, duration: 3 }}>
            {room.code}
          </motion.div>
        </div>

        <div className="card flex-1 p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="font-display text-3xl font-black">Players ({players.length}/8)</div>
            {isHost && (
              <button className="btn btn-ghost text-base" onClick={() => call(c => c.reducers.addBot({ roomId: room.id }))} disabled={players.length >= 8}><IconText text={" 🤖 Add bot "} /></button>
            )}
          </div>
          {players.length === 0 && <div className="text-xl text-cream/60">Waiting for the jury to arrive…</div>}
          <div className="queue-scene" style={{ height: 300 }}>
            <Crowd variant="stage" phase="LOBBY" members={players.map(p=>({ id:p.id,name:p.name,connected:p.connected,isBot:p.isBot,status:p.connected?'In the room':'Reconnecting…' }))} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">{players.map(p=><span className="chip bg-white" key={String(p.id)}>{p.name}{p.isBot?' · bot':''}</span>)}</div>
        </div>
      </div>

      <div className="card flex flex-col gap-6 p-6">
        <div className="font-display text-3xl font-black">Tonight we decide…</div>
        <div className="grid grid-cols-3 gap-3">
          {CATEGORIES.map(c => (
            <button
              key={c.id}
              disabled={!isHost}
              onClick={() => {
                setCategory(c.id);
                if (where) void saveSetup(c.id, where);
              }}
              className={`rounded-3xl p-4 font-display text-2xl font-black transition ${category === c.id ? 'bg-sun text-ink shadow-[0_6px_0_rgb(0_0_0/0.35)]' : 'bg-ink-3 text-cream hover:bg-ink-4'}`}
            >
              <div className="text-5xl"><IconText text={c.emoji} size={42} /></div>
              {c.label}
            </button>
          ))}
        </div>

        {category === 'movie' && <p className="text-sm text-muted">Choose a cinema together. Film listings, showtimes and ticket prices must be checked with the cinema.</p>}

        <div className="space-y-3">
          <div className="text-lg font-bold text-cream/80">Where?</div>
          <form
            className="flex gap-2"
            onSubmit={e => {
              e.preventDefault();
              if (where.trim()) void saveSetup(category, where.trim());
            }}
          >
            <input
              value={where}
              onChange={e => setWhere(e.target.value)}
              disabled={!isHost}
              placeholder="Neighborhood or address"
              className="min-w-0 flex-1 rounded-2xl bg-ink px-4 py-3 text-lg ring-2 ring-white/10 outline-none focus:ring-sky"
            />
            <button className="btn btn-sky text-base" disabled={!isHost || !where.trim()}>
              Set
            </button>
          </form>
          <div className="flex flex-wrap gap-2">
            <button className="chip bg-ink-3 px-4 py-2 text-cream ring-1 ring-white/10" disabled={!isHost || locating} onClick={useMyLocation}><IconText text={" 📍 "} />{locating ? 'Locating…' : "Use this computer's location"}
            </button>
            {DEMO_LOCATION && (
              <button className="chip bg-ink-3 px-4 py-2 text-cream ring-1 ring-white/10" disabled={!isHost} onClick={() => (setWhere(DEMO_LOCATION), void saveSetup(category, DEMO_LOCATION))}><IconText text={` 🏛️ ${DEMO_LOCATION.split(',')[0]} `} /></button>
            )}
          </div>
        </div>

        {room.mode === 'strangers' && (
          <div className="space-y-3 rounded-2xl bg-sky/10 p-4 ring-1 ring-sky/30">
            <div className="text-lg font-bold">Advertise your vibe (shown in the public lobby list)</div>
            <div className="flex flex-wrap gap-2">
              {MEETUP_VIBES.map(v => {
                const on = room.vibeTags.includes(v);
                return (
                  <button
                    key={v}
                    disabled={!isHost || (!on && room.vibeTags.length >= 6)}
                    onClick={() => call(c => c.reducers.setMeetupDetails({ roomId: room.id, vibeTags: on ? room.vibeTags.filter(x => x !== v) : [...room.vibeTags, v].slice(0, 6), targetStartMin: room.targetStartMin }))}
                    className={`chip px-3 py-1.5 disabled:opacity-40 ${on ? 'bg-sun text-ink' : 'bg-ink-3 text-cream'}`}
                  >
                    #{v}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold">Meet around</span>
              {MEETUP_TIMES.map(t => (
                <button
                  key={t.label}
                  disabled={!isHost}
                  onClick={() => call(c => c.reducers.setMeetupDetails({ roomId: room.id, vibeTags: room.vibeTags, targetStartMin: t.min }))}
                  className={`chip px-3 py-1.5 ${room.targetStartMin === t.min ? 'bg-sun text-ink' : 'bg-ink-3 text-cream'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="text-sm text-cream/70"><IconText text={"🛡️ 18+ · first names only · public venues · exact address after RSVP · 3 RSVPs to confirm"} /></div>
          </div>
        )}

        <div className="rounded-2xl bg-ink/60 p-4">
          {room.scoutStatus === '' && <div className="text-cream/60">Pick a category and a place. The Judge starts scouting real venues right away.</div>}
          {room.scoutStatus === 'running' && (
            <div className="flex items-center gap-3 text-lg">
              <span className="inline-block animate-spin text-2xl"><IconText text={"🛰️"} /></span> Scouting real places near {room.locationLabel || 'you'} with Apify…
            </div>
          )}
          {room.scoutStatus === 'done' && <div className="text-lg font-bold text-lime"><IconText text={"✅ "} />{room.aiStatus || 'Venues ready.'}</div>}
          {room.scoutStatus === 'failed' && <div className="text-lg text-tang">Scouting hit traffic. We'll use saved venue data.</div>}
        </div>

        <div className="mt-auto">
          {isHost ? (
            <button
              className="btn btn-pop w-full py-5 text-3xl"
              disabled={players.length < 2 || !ready}
              onClick={() => {
                unlockAudio();
                void call(c => c.reducers.startGame({ roomId: room.id }));
              }}
            >
              <IconText text={players.length < 2 ? 'Need 2+ players' : !ready ? 'Pick category + place' : "Let's go! ▶"} />
            </button>
          ) : (
            <div className="text-center text-cream/60">Waiting for the host…</div>
          )}
        </div>
      </div>
    </div>
  );
}
