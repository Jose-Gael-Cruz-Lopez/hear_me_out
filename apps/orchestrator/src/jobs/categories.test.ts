import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { loadConfig } from '../config';
import type { Deps } from './deps';
import { loadFixtureAreas, scrapeVenues } from '../services/venues';
import { handlers, resolveVenueSet } from './handlers';
import type { AiJob } from '@hmo/bindings';

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


describe('non-food personal fit stays grounded through the final plan', () => {
  it.each(['activity', 'movie'])('rejects invented food and price claims for %s', async category => {
    const area = fixtures[0];
    const venues = area.venues[category].slice(0, 3).map(v => ({ ...v, priceLevel: 0, openingHours: [] }));
    const player = { id: 1n, roomId: 7n, name: 'Sam', seat: 0 };
    const room = { id: 7n, category, venueKey: 'qa', tzOffsetMin: 0 };
    const finishCurate = vi.fn().mockResolvedValue(undefined);
    const finishPlanCopy = vi.fn().mockResolvedValue(undefined);
    let selected: unknown;
    const plan = { id: 5n, optionId: 2n, slotLabel: 'Tonight 7 PM', inviteText: 'Join us.', cantMake: [] };
    const json = vi.fn().mockResolvedValueOnce({ finalists: venues.map(v => ({
      placeId: v.placeId, fitSummary: 'A shared outing', groupFitScore: 80,
      perPlayerFit: [{ playerId: '1', line: 'Cheap tickets and food for your vegan diet!' }],
    })) }).mockResolvedValueOnce({
      inviteText: 'Join us.', whyForEach: [{ playerId: '1', line: 'Free tickets and vegan food guaranteed!' }],
      posterPrompt: '', icebreakers: [],
    });
    const d = {
      fixtures, muse: { json },
      conn: { db: {
        room: { id: { find: () => room } },
        player: { iter: () => [player] },
        profilePublic: { playerId: { find: () => ({ budgetMax: 2, dietary: ['vegan'], maxTravelMin: 120, availability: [], approvedTags: ['cozy'] }) } },
        adminVenueCache: { iter: () => [{ key: 'qa', itemsJson: JSON.stringify({ center: { lat: area.lat, lng: area.lng }, venues }) }] },
        plan: { id: { find: () => plan } }, option: { id: { find: () => selected } },
      }, reducers: { finishCurate, finishPlanCopy } },
    } as unknown as Deps;
    const job = { id: 9n, roomId: 7n, refId: 5n, payloadJson: '{}' } as AiJob;
    await handlers.curate(job, d);
    const options = finishCurate.mock.calls[0][0].options;
    expect(options).toHaveLength(2);
    for (const option of options) {
      expect(option.perPlayerFit[0].line).toContain('min (you said');
      expect(option.perPlayerFit[0].line).not.toMatch(/food|vegan|ticket|cheap|free/i);
    }
    selected = { ...options[0], id: 2n };
    await handlers.plan_copy(job, d);
    expect(finishPlanCopy.mock.calls[0][0].whyForEach).toEqual(options[0].perPlayerFit);
    expect(json.mock.calls[1][0].input.category).toBe(category);
  });
});
