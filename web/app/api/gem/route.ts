import { NextResponse } from 'next/server';
import { loadPlaces } from '@/lib/places/load';
import type { GemResponse } from '@/lib/api-types';

// The hidden-gem evidence for one option. Options in SpacetimeDB only carry display fields, so the
// phones and the big screen look the full gem details up from the cached places file by Maps URL.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const lat = Number(q.get('lat'));
  const lng = Number(q.get('lng'));
  const mapsUrl = q.get('mapsUrl') ?? '';
  const name = q.get('name') ?? '';
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return NextResponse.json({ error: 'lat/lng required' }, { status: 400 });

  const file = await loadPlaces({ lat, lng });
  const place = file.places.find(p => p.mapsUrl === mapsUrl) ?? file.places.find(p => p.name === name);
  const res: GemResponse = {
    gem: place?.gem ?? null,
    sources: (file.gemSources ?? []).filter(s => !s.error && s.items > 0).map(s => s.source),
    gemsAt: file.gemsAt ?? null,
  };
  return NextResponse.json(res, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
