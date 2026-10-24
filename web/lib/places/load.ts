import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PlacesFile } from './normalize';
import { haversineM } from '../game/filter';

const DIR = join(process.cwd(), 'data/places');

/** The cached places file closest to the lobby (within 25 km), preferring real Apify data over samples. */
export async function loadPlaces(near: { lat: number; lng: number }): Promise<PlacesFile> {
  const files = (await readdir(DIR)).filter(f => f.endsWith('.json'));
  const loaded = await Promise.all(files.map(async f => JSON.parse(await readFile(join(DIR, f), 'utf8')) as PlacesFile));
  const nearby = loaded
    .map(f => ({ f, d: haversineM(near, f.location) }))
    .filter(x => x.d < 25_000 && x.f.places.length > 0)
    .sort((a, b) => Number(!!a.f.sample) - Number(!!b.f.sample) || a.d - b.d);
  if (nearby.length) return nearby[0]!.f;
  // Nothing cached near this lobby: fall back to whatever we have, clearly labeled.
  const any = loaded.sort((a, b) => Number(!!a.sample) - Number(!!b.sample))[0];
  if (!any) throw new Error('No places data. Run `node scripts/fetch-places.ts`.');
  return { ...any, source: `${any.source} (no cache near this lobby; showing ${any.location.label})` };
}
