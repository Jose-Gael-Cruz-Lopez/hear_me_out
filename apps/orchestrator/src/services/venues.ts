import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ApifyClient } from 'apify-client';
import { geohashKey, haversineKm, normalizeGoogleMapsItem, type LatLng, type Venue } from '@hmo/shared';
import type { Config } from '../config';
import { log } from '../log';

export const DEFAULT_QUERIES: Record<string, string[]> = {
  food: ['restaurants', 'vegetarian friendly restaurant', 'cheap eats'],
  activity: ['board game cafe', 'karaoke', 'bowling', 'arcade'],
  movie: ['movie theater'],
};

export interface FixtureArea {
  area: string;
  label: string;
  lat: number;
  lng: number;
  recordedAt: string;
  venues: Record<string, Venue[]>;
}

/** Recorded real Apify datasets, used in DEMO_MODE and whenever a live run fails. */
export function loadFixtureAreas(fixturesDir: string): FixtureArea[] {
  if (!existsSync(fixturesDir)) return [];
  const areas: FixtureArea[] = [];
  for (const f of readdirSync(fixturesDir)) {
    if (!/^venues-.*\.json$/.test(f)) continue;
    const d = JSON.parse(readFileSync(resolve(fixturesDir, f), 'utf8'));
    areas.push({
      area: d.area,
      label: d.label,
      lat: d.lat,
      lng: d.lng,
      recordedAt: d.recordedAt,
      venues: { food: d.food ?? [], activity: d.activity ?? [], movie: d.movie ?? [] },
    });
  }
  return areas;
}

export function nearestFixture(areas: readonly FixtureArea[], center: LatLng | null): FixtureArea | null {
  if (areas.length === 0) return null;
  if (!center) return areas[0];
  return [...areas].sort((a, b) => haversineKm(center, a) - haversineKm(center, b))[0];
}

export interface ScoutResult {
  venues: Venue[];
  source: 'apify' | 'fixture';
  rawItems?: unknown[];
}

/**
 * Run the Google Maps scraper asynchronously and poll. If the run is slow, use whatever it has
 * scraped so far (if enough), so the wait stays hidden inside the warm-up round.
 */
export async function scrapeVenues(
  cfg: Config,
  args: { center: LatLng | null; locationLabel: string; queries: string[]; timeoutMs: number }
): Promise<ScoutResult | null> {
  if (!cfg.apifyEnabled) return null;
  const client = new ApifyClient({ token: cfg.apifyToken });
  const input: Record<string, unknown> = {
    searchStringsArray: args.queries,
    maxCrawledPlacesPerSearch: 12,
    language: 'en',
    skipClosedPlaces: true,
    maxReviews: 2,
    reviewsSort: 'mostRelevant',
    maxImages: 0,
    scrapeReviewsPersonalData: false,
  };
  if (args.center) input.customGeolocation = { type: 'Point', coordinates: [args.center.lng, args.center.lat], radiusKm: 3 };
  else input.locationQuery = args.locationLabel;

  const started = Date.now();
  try {
    const run = await client.actor('compass/crawler-google-places').start(input);
    log.info('apify run started', { runId: run.id, queries: args.queries.join(' | ') });
    let status = run.status;
    while (Date.now() - started < args.timeoutMs) {
      await new Promise(r => setTimeout(r, 3000));
      status = (await client.run(run.id).get())?.status ?? status;
      if (['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) break;
    }
    const { items } = await client.dataset(run.defaultDatasetId).listItems({ clean: true });
    if (status !== 'SUCCEEDED') {
      log.warn('apify run not finished in time, using partial results', { status, items: items.length });
      void client.run(run.id).abort().catch(() => undefined);
    }
    const seen = new Set<string>();
    const venues: Venue[] = [];
    for (const item of items as Record<string, unknown>[]) {
      const v = normalizeGoogleMapsItem(item);
      if (v && !seen.has(v.placeId)) {
        seen.add(v.placeId);
        venues.push(v);
      }
    }
    log.info('apify run done', { status, venues: venues.length, seconds: Math.round((Date.now() - started) / 1000) });
    return venues.length >= 4 ? { venues, source: 'apify', rawItems: items } : null;
  } catch (err) {
    log.warn('apify run failed', { err: String(err).slice(0, 200) });
    return null;
  }
}

/** Keep a copy of every live scrape so a later DEMO_MODE run can replay it. */
export function saveRawScrape(fixturesDir: string, key: string, items: unknown[]): void {
  try {
    const dir = resolve(fixturesDir, 'cache');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, `raw-${key.replace(/[^a-z0-9.,+-]+/gi, '_')}.json`), JSON.stringify({ recordedAt: new Date().toISOString(), items }));
  } catch (err) {
    log.warn('could not save raw scrape', { err: String(err) });
  }
}

export function venueKey(center: LatLng | null, locationLabel: string, category: string, queries: string[]): string {
  const where = center ? geohashKey(center, 2) : locationLabel.toLowerCase().replace(/\s+/g, ' ').trim();
  return `${where}|${category}|${queries.join('+')}`;
}
