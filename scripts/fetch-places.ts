// Pre-fetches real places near a location with Apify's Google Maps scraper and caches them
// to web/data/places/<slug>.json. The game reads that cache, so scraping speed never blocks play.
//
//   node scripts/fetch-places.ts                       # Palace of Fine Arts (Cal Hacks venue)
//   node scripts/fetch-places.ts --label "Berkeley, CA" --lat 37.8716 --lng -122.2727 --slug berkeley
//
// Needs APIFY_TOKEN in the environment or in .env / web/.env.local. Node >= 22.18 (runs .ts directly).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeApifyItem, type Place, type PlacesFile } from '../web/lib/places/normalize.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const f of ['.env', 'web/.env.local']) if (existsSync(join(ROOT, f))) process.loadEnvFile(join(ROOT, f));

const ACTOR = 'compass~crawler-google-places';
const QUERIES = [
  'restaurants', 'tacos', 'pizza', 'sushi', 'ramen', 'burgers', 'vegan restaurant', 'halal food',
  'dessert', 'boba', 'coffee shop', 'cocktail bar', 'bowling', 'arcade', 'karaoke', 'museum', 'park',
];

function arg(name: string, fallback: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const label = arg('label', 'Palace of Fine Arts, San Francisco');
const lat = Number(arg('lat', '37.8029'));
const lng = Number(arg('lng', '-122.4484'));
const slug = arg('slug', 'palace-of-fine-arts');
const radiusKm = Number(arg('radius-km', '5'));
const perSearch = Number(arg('per-search', '10'));
const token = process.env.APIFY_TOKEN;
if (!token) {
  console.error('APIFY_TOKEN is not set (see .env.example).');
  process.exit(1);
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`https://api.apify.com/v2${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) throw new Error(`Apify ${path} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

const input = {
  searchStringsArray: QUERIES,
  customGeolocation: { type: 'Point', coordinates: [lng, lat], radiusKm },
  maxCrawledPlacesPerSearch: perSearch,
  language: 'en',
  skipClosedPlaces: true,
  scrapePlaceDetailPage: false,
};

console.log(`Starting ${ACTOR} for "${label}" (${QUERIES.length} searches × ${perSearch}) …`);
const run = (await api(`/acts/${ACTOR}/runs`, { method: 'POST', body: JSON.stringify(input) })).data;
console.log(`Run ${run.id} started. Polling (this usually takes 2–6 minutes)…`);

let status = run.status as string;
while (!['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) {
  await new Promise(r => setTimeout(r, 10_000));
  status = (await api(`/actor-runs/${run.id}`)).data.status;
  process.stdout.write(`  ${status}\n`);
}
if (status !== 'SUCCEEDED') throw new Error(`Apify run ended with ${status}`);

const items = (await api(`/datasets/${run.defaultDatasetId}/items?clean=true&format=json`)) as Record<string, unknown>[];
const byId = new Map<string, Place>();
for (const item of items) {
  const p = normalizeApifyItem(item);
  if (p && !byId.has(p.id)) byId.set(p.id, p);
}

const file: PlacesFile = {
  source: `Apify ${ACTOR} (Google Maps), run ${run.id}`,
  location: { label, lat, lng },
  fetchedAt: new Date().toISOString(),
  places: [...byId.values()],
};
const out = join(ROOT, 'web/data/places', `${slug}.json`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(file, null, 1));
console.log(`Saved ${file.places.length} places (from ${items.length} results) to ${out}`);
