import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { loadConfig } from '../config';
import type { Deps } from './deps';
import { loadFixtureAreas, scrapeVenues } from '../services/venues';
import { resolveVenueSet } from './handlers';

vi.mock('../services/venues', async importOriginal => ({
  ...await importOriginal<typeof import('../services/venues')>(),
  scrapeVenues: vi.fn(),
}));

const fixtures = loadFixtureAreas(resolve(import.meta.dirname, '../../../../fixtures'));
const cacheVenues = vi.fn().mockResolvedValue(undefined);
const deps = () => ({
  cfg: loadConfig({ demoMode: true }), fixtures,
  conn: { reducers: { cacheVenues } },
}) as unknown as Deps;
const payload = (category: string) => ({ category, locationLabel: fixtures[0].label, lat: fixtures[0].lat, lng: fixtures[0].lng, hasGeo: true });

beforeEach(() => {
  vi.mocked(scrapeVenues).mockReset().mockResolvedValue(null);
  cacheVenues.mockClear();
});

describe('scouting preserves the chosen category through live and fallback paths', () => {
  it.each(['food', 'activity', 'movie'])('caches only the chosen %s fixtures for an offline room', async category => {
    const result = await resolveVenueSet(deps(), payload(category));
    const cached = cacheVenues.mock.calls[0][0];
    expect(result.source).toBe('fixture');
    expect(cached.category).toBe(category);
    expect(JSON.parse(cached.itemsJson).venues).toEqual(fixtures[0].venues[category]);
  });
  it('keeps two live cinemas instead of discarding them for lack of four results', async () => {
    const live = fixtures[0].venues.movie.slice(0, 2);
    vi.mocked(scrapeVenues).mockResolvedValue({ venues: live, source: 'apify' });
    const result = await resolveVenueSet(deps(), payload('movie'));
    expect(result.source).toBe('apify');
    expect(result.count).toBe(2);
    expect(JSON.parse(cacheVenues.mock.calls[0][0].itemsJson).venues).toEqual(live);
  });
  it('filters unrelated live results before persisting the category cache', async () => {
    const movies = fixtures[0].venues.movie.slice(0, 2);
    vi.mocked(scrapeVenues).mockResolvedValue({ venues: [...fixtures[0].venues.food.slice(0, 3), ...movies], source: 'apify' });
    const result = await resolveVenueSet(deps(), payload('movie'));
    expect(result.count).toBe(2);
    expect(JSON.parse(cacheVenues.mock.calls[0][0].itemsJson).venues).toEqual(movies);
  });
  it('fails explicitly when no cinemas exist instead of substituting activity venues', async () => {
    const d = deps();
    d.fixtures = fixtures.map(f => ({ ...f, venues: { ...f.venues, movie: [] } }));
    await expect(resolveVenueSet(d, payload('movie'))).rejects.toThrow('No movie venues available');
    expect(cacheVenues).not.toHaveBeenCalled();
  });
});
