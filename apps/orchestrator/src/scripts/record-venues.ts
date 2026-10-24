// Records a real Google Maps scrape (Apify) for the demo location into fixtures/raw/.
// Usage: pnpm --filter @hmo/orchestrator exec tsx --env-file=../../.env src/scripts/record-venues.ts food
import { ApifyClient } from 'apify-client';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const category = process.argv[2] ?? 'food';
const QUERIES: Record<string, string[]> = {
  food: ['restaurants', 'vegetarian friendly restaurant', 'cheap eats', 'ramen', 'tacos'],
  activity: ['board game cafe', 'karaoke', 'bowling', 'arcade', 'escape room', 'mini golf'],
  movie: ['movie theater'],
};

const token = process.env.APIFY_TOKEN;
if (!token) throw new Error('APIFY_TOKEN is not set');
const lat = 37.8029186;
const lng = -122.4484029;

const client = new ApifyClient({ token });
const started = Date.now();
const run = await client.actor('compass/crawler-google-places').call(
  {
    searchStringsArray: QUERIES[category],
    customGeolocation: { type: 'Point', coordinates: [lng, lat], radiusKm: 3 },
    maxCrawledPlacesPerSearch: 10,
    language: 'en',
    skipClosedPlaces: true,
    maxReviews: 3,
    reviewsSort: 'mostRelevant',
    maxImages: 0,
    scrapeReviewsPersonalData: false,
  },
  { waitSecs: 600 }
);
console.log(`run ${run.id} ${run.status} in ${Math.round((Date.now() - started) / 1000)}s`);
const { items } = await client.dataset(run.defaultDatasetId).listItems();
const dir = resolve(import.meta.dirname, '../../../../fixtures/raw');
mkdirSync(dir, { recursive: true });
const file = resolve(dir, `venues-palace-of-fine-arts-${category}.json`);
writeFileSync(file, JSON.stringify({ recordedAt: new Date().toISOString(), lat, lng, queries: QUERIES[category], items }, null, 2));
console.log(`saved ${items.length} places to ${file}`);
