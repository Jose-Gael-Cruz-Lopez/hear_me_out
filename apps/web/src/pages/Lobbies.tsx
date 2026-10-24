import { IconText } from '../components/Ink';
import { motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables } from '@hmo/bindings';
import { formatClock } from '@hmo/module/logic/slot';
import { Logo } from '../components/ui';
import { useCall } from '../lib/room';

const VIBES = ['spicy-food', 'board-games', 'karaoke', 'ramen', 'tacos', 'live-music', 'night-owl', 'cheap-eats', 'outdoors', 'dessert', 'anime', 'coffee', 'vegan', 'craft-beer'];
const CATEGORY_EMOJI: Record<string, string> = { food: '🍜', activity: '🎳', movie: '🎬' };

/** Neighborhood-level only: drop street addresses, states and zip codes ("3301 Lyon St, San Francisco, CA" -> "San Francisco"). */
function neighborhood(label: string): string {
  if (!label) return 'Online';
  if (label === 'Near this computer') return 'Nearby';
  const parts = label
    .split(',')
    .map(p => p.trim())
    .filter(p => p && !/^\d/.test(p) && !/^[A-Z]{2}(\s+\d{5})?$/.test(p) && !/^\d{5}$/.test(p) && !/^(USA|United States)$/i.test(p));
  return parts.slice(0, 2).join(', ') || 'Nearby';
}

export function Lobbies() {
  const call = useCall();
  const [, navigate] = useLocation();
  const { isActive } = useSpacetimeDB();
  const [tags, setTags] = useState<string[]>(['board-games', 'spicy-food']);
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [matches] = useTable(tables.myLobbyMatches);
  const [rooms] = useTable(tables.room.where(r => r.isPublic.eq(true)));
  const [players] = useTable(tables.player);

  const browse = useCallback(() => {
    if (!isActive) return;
    void call(c => c.reducers.browseLobbies({ tags, lat: geo?.lat ?? 0, lng: geo?.lng ?? 0, hasGeo: !!geo }), { silent: true });
  }, [call, tags, geo, isActive]);

  useEffect(() => {
    browse();
    const id = setInterval(browse, 10_000);
    return () => clearInterval(id);
  }, [browse]);

  const cards = useMemo(
    () =>
      [...matches]
        .map(m => ({ m, r: rooms.find(r => r.id === m.roomId) }))
        .filter((x): x is { m: (typeof matches)[number]; r: (typeof rooms)[number] } => !!x.r && (x.r.phase === 'lobby' || x.r.phase === 'profiles'))
        .sort((a, b) => b.m.score - a.m.score),
    [matches, rooms]
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <Logo />
        <Link href="/" className="chip bg-ink-3 text-cream"><IconText text={" ← Home "} /></Link>
      </div>
      <div>
        <div className="font-display text-4xl font-black">Open meetups near you</div>
        <div className="text-cream/75">Small public groups deciding what to do tonight. Pick your vibe to find your people.</div>
      </div>

      <div className="card space-y-4 p-5">
        <div className="flex flex-wrap gap-2">
          {VIBES.map(v => (
            <button key={v} onClick={() => setTags(t => (t.includes(v) ? t.filter(x => x !== v) : [...t, v]))} className={`chip px-4 py-2 ${tags.includes(v) ? 'bg-sun text-ink' : 'bg-ink-3 text-cream'}`}>
              #{v}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="chip bg-ink-3 px-4 py-2 text-cream"
            onClick={() => navigator.geolocation?.getCurrentPosition(p => setGeo({ lat: p.coords.latitude, lng: p.coords.longitude }), () => undefined, { timeout: 8000 })}
          ><IconText text={" 📍 "} />{geo ? 'Using your location' : 'Use my location'}
          </button>
          <span className="text-sm text-muted">Lobbies only show a neighborhood. The exact place unlocks after you RSVP.</span>
        </div>
      </div>

      <div className="chip bg-sky/15 px-4 py-2 text-sky ring-1 ring-sky/40"><IconText text={"🛡️ 18+ only · first names only · public venues only · block & report on every player"} /></div>

      {cards.length === 0 && <div className="card p-6 text-lg text-cream/70">No open meetups right now. Host one from the home screen!</div>}
      <div className="grid gap-4 md:grid-cols-2">
        {cards.map(({ m, r }, i) => {
          const count = players.filter(p => p.roomId === r.id).length;
          return (
            <motion.div key={String(r.id)} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} className="card space-y-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-display text-2xl font-black">
                    <IconText text={CATEGORY_EMOJI[r.category] ?? '✨'} size={25} /> {r.groupName || 'Open meetup'}
                  </div>
                  <div className="text-sm text-cream/70">
                    {neighborhood(r.locationLabel)}
                    {m.distanceKm >= 0 && ` · ~${m.distanceKm} km`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-display text-3xl font-black text-lime">{m.score}%</div>
                  <div className="text-xs text-muted">match</div>
                </div>
              </div>
              <div className="text-cream/85">{m.blurb}</div>
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="chip bg-ink-3"><IconText text={"👥 "} />{count}/8</span>
                <span className="chip bg-ink-3"><IconText text={"🕒 "} />{r.targetStartMin >= 0 ? `around ${formatClock(r.targetStartMin)}` : 'flexible time'}</span>
                {r.vibeTags.map(t => (
                  <span key={t} className={`chip ${m.sharedTags.includes(t) ? 'bg-sun/20 text-sun' : 'bg-ink-3 text-cream/70'}`}>
                    #{t}
                  </span>
                ))}
              </div>
              <button className="btn btn-pop w-full" onClick={() => navigate(`/play/${r.code}`)}>
                Join {r.groupName || 'meetup'}
              </button>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
