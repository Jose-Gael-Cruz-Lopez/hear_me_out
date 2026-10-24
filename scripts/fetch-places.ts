// Pre-fetches real places near a location with Apify's Google Maps scraper and caches them
// to web/data/places/<slug>.json. The game reads that cache, so scraping speed never blocks play.
//
//   node scripts/fetch-places.ts                       # Palace of Fine Arts (Cal Hacks venue)
//   node scripts/fetch-places.ts --label "Berkeley, CA" --lat 37.8716 --lng -122.2727 --slug berkeley
//   --reviews 5   also keep up to 5 recent review texts per place (read by scripts/fetch-gems.ts; slower)
//
// Needs APIFY_TOKEN in the environment or in .env / web/.env.local. Node >= 22.18 (runs .ts directly).
// Then run scripts/fetch-gems.ts to score hidden gems from Reddit, Instagram, TikTok and food press.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { normalizeApifyItem, type Place, type PlacesFile } from '../web/lib/places/normalize.ts';
import { arg, ROOT, runActor } from './apify.ts';

const ACTOR = 'compass~crawler-google-places';
const QUERIES = [
  'restaurants', 'tacos', 'pizza', 'sushi', 'ramen', 'burgers', 'vegan restaurant', 'halal food',
  'dessert', 'boba', 'coffee shop', 'cocktail bar', 'bowling', 'arcade', 'karaoke', 'museum', 'park',
];

const label = arg('label', 'Palace of Fine Arts, San Francisco');
const lat = Number(arg('lat', '37.8029'));
const lng = Number(arg('lng', '-122.4484'));
const slug = arg('slug', 'palace-of-fine-arts');
const radiusKm = Number(arg('radius-km', '5'));
const perSearch = Number(arg('per-search', '10'));
const reviews = Number(arg('reviews', '0'));

const input = {
  searchStringsArray: QUERIES,
  customGeolocation: { type: 'Point', coordinates: [lng, lat], radiusKm },
  maxCrawledPlacesPerSearch: perSearch,
  language: 'en',
  skipClosedPlaces: true,
  scrapePlaceDetailPage: reviews > 0,
  maxReviews: reviews,
  reviewsSort: 'newest',
};

console.log(`Starting ${ACTOR} for "${label}" (${QUERIES.length} searches × ${perSearch}, ${reviews} reviews each) …`);
console.log('This usually takes 2–6 minutes (longer with --reviews).');
const { runId, items } = await runActor(ACTOR, input, 'maps', 30);
const byId = new Map<string, Place>();
for (const item of items) {
  const p = normalizeApifyItem(item);
  if (p && !byId.has(p.id)) byId.set(p.id, p);
}

const file: PlacesFile = {
  source: `Apify ${ACTOR} (Google Maps), run ${runId}`,
  location: { label, lat, lng },
  fetchedAt: new Date().toISOString(),
  places: [...byId.values()],
};
const out = join(ROOT, 'web/data/places', `${slug}.json`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(file, null, 1));
console.log(`Saved ${file.places.length} places (from ${items.length} results) to ${out}`);
