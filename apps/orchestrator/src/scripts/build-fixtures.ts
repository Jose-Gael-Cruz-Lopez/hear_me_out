// Normalizes recorded Apify datasets (fixtures/raw/*.json) into the committed fixture used by DEMO_MODE.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeGoogleMapsItem, type Venue } from '@hmo/shared';

const dir = resolve(import.meta.dirname, '../../../../fixtures');
const area = 'palace-of-fine-arts';
const out: Record<string, unknown> = {
  area,
  label: 'Palace of Fine Arts, San Francisco',
  lat: 37.8029186,
  lng: -122.4484029,
  source: 'Apify compass/crawler-google-places, recorded run (real data)',
};

for (const category of ['food', 'activity', 'movie']) {
  const file = resolve(dir, 'raw', `venues-${area}-${category}.json`);
  if (!existsSync(file)) {
    out[category] = [];
    continue;
  }
  const raw = JSON.parse(readFileSync(file, 'utf8')) as { recordedAt: string; items: Record<string, unknown>[] };
  out.recordedAt = raw.recordedAt;
  const seen = new Set<string>();
  const venues: Venue[] = [];
  for (const item of raw.items) {
    const v = normalizeGoogleMapsItem(item);
    if (!v || seen.has(v.placeId)) continue;
    seen.add(v.placeId);
    venues.push(v);
  }
  out[category] = venues;
  console.log(`${category}: ${venues.length} venues (from ${raw.items.length} items)`);
}

writeFileSync(resolve(dir, `venues-${area}.json`), JSON.stringify(out, null, 1));
console.log('wrote', resolve(dir, `venues-${area}.json`));
