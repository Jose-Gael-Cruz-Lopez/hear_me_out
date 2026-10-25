import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import type { Venue } from '@hmo/shared';
import { loadFixtureAreas, nearestFixture, venuesForCategory } from './venues';
import { evaluate, pickVaried, shortlist, type Member } from './curation';
import { defaultHints } from '@hmo/module/logic/fallbacks';

const [area] = loadFixtureAreas(resolve(import.meta.dirname, '../../../../fixtures'));
const member: Member = { playerId: 1n, name: 'Alex', budgetMax: 2, dietary: ['vegan'], maxTravelMin: 30, windows: [], tags: ['board-games'] };
const venue = (placeId: string, category: string, title = category): Venue => ({ ...area.venues.food[0], placeId, category, categories: [category], title, offerings: [] });

describe('category-specific venue data', () => {
  it.each(['food', 'activity', 'movie'])('has at least four distinct usable %s fallback venues', category => {
    const venues = area.venues[category];
    expect(venues.length).toBeGreaterThanOrEqual(4);
    expect(new Set(venues.map(v => v.placeId)).size).toBe(venues.length);
    expect(venuesForCategory(venues, category)).toEqual(venues);
    const picks = pickVaried(shortlist(evaluate(venues, [member], { center: area, weekday: 6, nowMin: 600, category }), [member], 4), 4);
    expect(picks).toHaveLength(4);
    expect(new Set(picks.map(p => p.venue.placeId)).size).toBe(4);
  });
  it('does not mistake an escape room, brewpub or live theater for a cinema', () => {
    const candidates = [venue('escape', 'Escape room center'), venue('beer', 'Brewpub'), venue('stage', 'Performing arts theater'), venue('film', 'Movie theater')];
    expect(venuesForCategory(candidates, 'movie').map(v => v.placeId)).toEqual(['film']);
  });
  it('rejects shopping and accommodation noise from activity searches', () => {
    const candidates = [venue('shop', 'Department store', 'Arcade games at Target'), venue('apartment', 'Apartment', 'Apartment with arcade'), venue('stop', 'Bus stop'), venue('bowl', 'Bowling alley'), venue('games', 'Escape room center')];
    expect(venuesForCategory(candidates, 'activity').map(v => v.placeId)).toEqual(['bowl', 'games']);
  });
  it('deduplicates live place ids before curation', () => {
    const v = venue('cinema', 'Movie theater');
    expect(venuesForCategory([v, { ...v }], 'movie')).toHaveLength(1);
  });
  it('never falls back across categories when an area has no cinemas', () => {
    const empty = { ...area, venues: { ...area.venues, movie: [] } };
    expect(nearestFixture([empty], area, 'movie')).toBeNull();
    expect(nearestFixture([empty, area], area, 'movie')).toBe(area);
  });
  it('does not invent movie prices, ratings, hours or screening times in the recorded fallback', () => {
    for (const v of area.venues.movie) {
      expect(v.rating).toBe(0);
      expect(v.priceLevel).toBe(0);
      expect(v.openingHours).toEqual([]);
      expect(v.website).toMatch(/^https:\/\//);
      const hints = defaultHints({ ...v, travelMin: 15, hoursText: '', dietaryNotes: [] });
      expect(hints).toHaveLength(3);
      expect(hints.join(' ')).toContain('Check current films, showtimes and ticket prices');
    }
  });
});

describe('curation with sparse or non-food results', () => {
  it.each(['activity', 'movie'])('does not label %s venues as vegan without food evidence', category => {
    const c = evaluate(area.venues[category], [member], { center: area, weekday: 6, nowMin: 600, category });
    expect(c.every(c => c.dietNotes.length === 0 && c.dietOk)).toBe(true);
    expect(c.flatMap(c => c.fitLines).some(f => /vegan/.test(f.line))).toBe(false);
  });
  it('does not repeat the same place while relaxing constraints', () => {
    const candidates = evaluate(area.venues.movie.slice(0, 2), [member], { center: area, weekday: 6, nowMin: 600, category: 'movie' });
    const short = shortlist([...candidates, ...candidates.map(c => ({ ...c }))], [member], 4, 10);
    expect(short).toHaveLength(2);
    expect(pickVaried(short, 4)).toHaveLength(2);
  });
});
