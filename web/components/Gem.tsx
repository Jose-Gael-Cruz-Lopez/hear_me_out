'use client';
// Hidden-gem badge + evidence cards, fed by /api/gem (Apify data from scripts/fetch-gems.ts).
import { useEffect, useState } from 'react';
import type { GemResponse } from '@/lib/api-types';
import { GEM_THRESHOLD, type GemSource } from '@/lib/gems/types';
import type { Game } from '@/lib/stdb';

type Option = Game['options'][number];

const SOURCE_LABEL: Record<GemSource, string> = {
  maps: 'Google review',
  reddit: 'Reddit',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  press: 'Food press',
  events: 'Event listing',
};

const SOURCE_ICON: Record<GemSource, string> = {
  maps: '📍',
  reddit: '👽',
  instagram: '📸',
  tiktok: '🎵',
  press: '📰',
  events: '🎟️',
};

const cache = new Map<string, Promise<GemResponse | null>>();

export function useGem(g: Game, o: Option | undefined): GemResponse | null {
  const [data, setData] = useState<GemResponse | null>(null);
  const lat = g.lobby?.lat;
  const lng = g.lobby?.lng;
  const key = o && lat != null && lng != null ? `${lat},${lng},${o.mapsUrl}` : '';
  useEffect(() => {
    if (!key || !o) return;
    let alive = true;
    if (!cache.has(key)) {
      const q = new URLSearchParams({ lat: String(lat), lng: String(lng), mapsUrl: o.mapsUrl, name: o.name });
      cache.set(
        key,
        fetch(`/api/gem?${q}`)
          .then(r => (r.ok ? (r.json() as Promise<GemResponse>) : null))
          .catch(() => null)
      );
    }
    cache.get(key)!.then(d => alive && setData(d));
    return () => {
      alive = false;
    };
  }, [key, lat, lng, o]);
  return data;
}

/** "💎 Hidden gem · 87" plus the top reason. Renders nothing for ordinary places. */
export function GemBadge({ g, o, reasons = 1 }: { g: Game; o: Option; reasons?: number }) {
  const data = useGem(g, o);
  const gem = data?.gem;
  if (!gem || gem.score < GEM_THRESHOLD) return null;
  return (
    <div className="gem-badge">
      <span className="gem-pill">💎 Hidden gem · {gem.score}</span>
      {gem.reasons.slice(0, reasons).map(r => (
        <div key={r} className="small">
          {r}
        </div>
      ))}
    </div>
  );
}

/** Quotes from Reddit / TikTok / Instagram / Google reviews the player can use in their pitch. */
export function GemEvidence({ g, o }: { g: Game; o: Option }) {
  const data = useGem(g, o);
  const gem = data?.gem;
  if (!gem || (!gem.evidence.length && !gem.reasons.length)) return null;
  return (
    <div className="card stack" style={{ gap: 8 }}>
      <div className="label">
        {gem.score >= GEM_THRESHOLD ? `💎 Hidden gem · score ${gem.score}` : 'What people say'} · use this in your pitch
      </div>
      {gem.reasons.slice(0, 3).map(r => (
        <div key={r} className="small">
          ✓ {r}
        </div>
      ))}
      {gem.evidence.map(e => (
        <a key={e.url + e.quote} className="evidence" href={e.url} target="_blank" rel="noreferrer">
          <span className="small muted">
            {SOURCE_ICON[e.source]} {SOURCE_LABEL[e.source]}
            {e.date ? ` · ${new Date(e.date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}` : ''}
          </span>
          <span>“{e.quote}”</span>
        </a>
      ))}
      {gem.hangout.length > 0 && <div className="small muted">Vibe: {gem.hangout.join(' · ')}</div>}
    </div>
  );
}
