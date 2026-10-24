import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { isOpenAt, normalizeApifyItem, parseHours, type PlacesFile } from '@/lib/places/normalize';
import { buildGroup, filterPlaces, meetsDiet, optionCount, pickDiverse, type GroupMember } from '@/lib/game/filter';
import { rankSlots, slotStart } from '@/lib/game/slots';
import { assignPlayers } from '@/lib/game/assign';
import { buildIcs } from '@/lib/game/ics';
import { mockHost, mockPosterSvg } from '@/lib/ai/muse';
import { DEFAULT_LOCATION } from '@/lib/game/questions';

const sample = JSON.parse(readFileSync(new URL('../data/places/sample-palace-of-fine-arts.json', import.meta.url), 'utf8')) as PlacesFile;

const member = (over: Partial<GroupMember> = {}): GroupMember => ({
  playerId: '1', name: 'A', budget: 2, diet: 'any', distance: 'short-ride', freeWhen: ['now'], vibe: 'tacos', ...over,
});

describe('opening hours', () => {
  it('parses common Google formats', () => {
    expect(parseHours('11 AM to 10 PM')).toEqual([[660, 1320]]);
    expect(parseHours('11:30 AM to 2:30 PM, 5 to 9:30 PM')).toEqual([[690, 870], [1020, 1290]]);
    expect(parseHours('12 to 10 PM')).toEqual([[720, 1320]]);
    expect(parseHours('11 to 2 PM')).toEqual([[660, 840]]);
    expect(parseHours('6 PM to 2 AM')).toEqual([[1080, 1560]]);
    expect(parseHours('5 PM to 12 AM')).toEqual([[1020, 1440]]);
    expect(parseHours('Open 24 hours')).toEqual([[0, 1440]]);
    expect(parseHours('Closed')).toEqual([]);
    expect(parseHours('11 AM–10 PM')).toEqual([[660, 1320]]);
    expect(parseHours('whenever')).toBeNull();
  });

  it('handles past-midnight spill into the next day', () => {
    const week = Array.from({ length: 7 }, () => [[1080, 1560]] as [number, number][]);
    expect(isOpenAt(week, 2, 60)).toBe(true); // 1am Tuesday: Monday night is still going
    expect(isOpenAt(week, 2, 180)).toBe(false);
    expect(isOpenAt(null, 2, 180)).toBeNull();
  });
});

describe('apify normalization', () => {
  it('maps an Apify item to a Place', () => {
    const p = normalizeApifyItem({
      title: 'Taco Town', categoryName: 'Mexican restaurant', address: '1 Main', location: { lat: 37.8, lng: -122.44 },
      price: '$10–20', totalScore: 4.6, reviewsCount: 321, url: 'https://maps.google.com/x', placeId: 'abc',
      additionalInfo: { Offerings: [{ 'Vegetarian options': true }, { 'Halal food': true }] },
      openingHours: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day => ({ day, hours: '11 AM to 10 PM' })),
    })!;
    expect(p).toMatchObject({ id: 'abc', kind: 'food', priceLevel: 1, rating: 4.6, reviews: 321 });
    expect(p.dietTags.sort()).toEqual(['halal', 'vegetarian']);
    expect(p.hours![3]).toEqual([[660, 1320]]);
    expect(normalizeApifyItem({ title: 'Gone', location: { lat: 1, lng: 1 }, permanentlyClosed: true })).toBeNull();
  });
});

describe('hard filters', () => {
  const when = { day: 5, minute: 19 * 60 };
  it('builds the strictest group constraints', () => {
    const g = buildGroup([member({ budget: 3, distance: 'anywhere' }), member({ budget: 1, diet: 'vegan', distance: 'walk', vibe: 'asian' })]);
    expect(g).toMatchObject({ maxBudget: 1, diets: ['vegan'], maxDistanceM: 1500, vibes: { tacos: 1, asian: 1 } });
  });

  it('enforces diet, budget, distance and hours on the sample data', () => {
    const g = buildGroup([member({ diet: 'vegan', budget: 2, distance: 'short-ride' })]);
    const { candidates, relaxed } = filterPlaces(sample.places, DEFAULT_LOCATION, g, when);
    expect(candidates.length).toBeGreaterThanOrEqual(4);
    expect(relaxed).toEqual([]);
    for (const c of candidates) {
      expect(meetsDiet(c, ['vegan'])).toBe(true);
      expect(c.priceLevel ?? 2).toBeLessThanOrEqual(2);
      expect(c.distanceM).toBeLessThanOrEqual(5000);
      expect(c.openAtPlanTime).not.toBe(false);
    }
  });

  it('relaxes distance first, then budget, never diet unless nothing is left', () => {
    const base = sample.places.find(p => p.name === 'Tacolicious')!;
    // ~2.2 km north of the venue: too far to walk, fine after stretching.
    const far = (i: number, over = {}) => ({ ...base, id: `far${i}`, name: `Far ${i}`, lat: DEFAULT_LOCATION.lat + 0.02, lng: DEFAULT_LOCATION.lng, ...over });
    const places = [far(1), far(2), far(3), far(4)];
    const walkers = buildGroup([member({ distance: 'walk', budget: 2, diet: 'vegan' })]);
    let r = filterPlaces(places, DEFAULT_LOCATION, walkers, when);
    expect(r.candidates).toHaveLength(4);
    expect(r.relaxed).toEqual(['stretched the distance a bit']);

    const pricey = places.map(p => ({ ...p, priceLevel: 3 }));
    r = filterPlaces(pricey, DEFAULT_LOCATION, walkers, when);
    expect(r.relaxed).toEqual(['went one $ over budget']);

    const meaty = places.map(p => ({ ...p, dietTags: [] }));
    r = filterPlaces(meaty, DEFAULT_LOCATION, walkers, when);
    expect(r.relaxed[0]).toMatch(/couldn't find enough vegan/);
  });

  it('picks variety and covers cravings', () => {
    const g = buildGroup([member({ vibe: 'tacos' }), member({ vibe: 'active' }), member({ vibe: 'sweet' })]);
    const { candidates } = filterPlaces(sample.places, DEFAULT_LOCATION, g, when);
    const n = optionCount(3, candidates.length);
    const picked = pickDiverse(candidates, g, n);
    expect(picked).toHaveLength(4);
    expect(new Set(picked.map(p => p.id)).size).toBe(4);
    expect(picked.some(p => p.vibes.includes('tacos'))).toBe(true);
    expect(picked.some(p => p.vibes.includes('active'))).toBe(true);
  });
});

describe('time slots', () => {
  const fri = new Date(2026, 9, 23, 15, 7); // Friday 3:07pm local
  it('turns slot names into times', () => {
    expect(slotStart('now', fri).getHours()).toBe(15);
    expect(slotStart('now', fri).getMinutes()).toBe(45);
    expect(slotStart('tonight', fri).getHours()).toBe(19);
    expect(slotStart('tomorrow-lunch', fri).getDate()).toBe(24);
    expect(slotStart('weekend', fri).getDay()).toBe(6);
  });
  it('ranks by how many people are free, then earliest', () => {
    const r = rankSlots([['now', 'tonight'], ['tonight'], ['tonight', 'weekend']], fri);
    expect(r[0]).toMatchObject({ slot: 'tonight', count: 3 });
    expect(r[1]!.slot).toBe('now');
  });
});

describe('assignments', () => {
  it('spreads players and avoids their own craving', () => {
    const options = [
      { name: 'Tacos', vibes: ['tacos' as const] },
      { name: 'Pizza', vibes: ['pizza' as const] },
      { name: 'Bowling', vibes: ['active' as const] },
      { name: 'Boba', vibes: ['sweet' as const] },
    ];
    const players = [
      { playerId: '1', name: 'A', vibe: 'tacos' },
      { playerId: '2', name: 'B', vibe: 'pizza' },
      { playerId: '3', name: 'C', vibe: 'tacos' },
    ];
    const a = assignPlayers(players, options, 'ABCD');
    expect(new Set(a.map(x => x.optionIndex)).size).toBe(3);
    for (const x of a) {
      const p = players.find(p => p.playerId === x.playerId)!;
      expect(options[x.optionIndex]!.vibes).not.toContain(p.vibe);
      expect(x.prompt).toMatch(/^Defend /);
    }
    expect(assignPlayers(players, options, 'ABCD')).toEqual(a);
  });
});

describe('ics + mock AI', () => {
  it('builds a valid calendar invite', () => {
    const ics = buildIcs({ uid: 'X', title: 'Tacos, finally', start: new Date('2026-10-25T02:00:00Z'), durationMin: 90, location: '1 Main; SF', description: 'hi' }, new Date('2026-10-24T00:00:00Z'));
    expect(ics).toContain('DTSTART:20261025T020000Z');
    expect(ics).toContain('DTEND:20261025T033000Z');
    expect(ics).toContain('SUMMARY:Tacos\\, finally');
    expect(ics).toContain('LOCATION:1 Main\\; SF');
  });

  it('mock host is deterministic and never empty', async () => {
    const r1 = await mockHost.reactToPitch({ playerName: 'Ana', optionName: 'Tacolicious', prompt: '', pitch: 'Tacos are love' });
    const r2 = await mockHost.reactToPitch({ playerName: 'Ana', optionName: 'Tacolicious', prompt: '', pitch: 'Tacos are love' });
    expect(r1).toBe(r2);
    expect(r1.length).toBeGreaterThan(10);
    expect(await mockHost.transcribe(new Blob([]), 'hello world')).toBe('hello world');
    const svg = mockPosterSvg('Ace Wasabi\'s <Sushi> & Co', 'Sushi restaurant', 'great');
    expect(svg).toContain('&lt;SUSHI&gt;');
    expect(svg.startsWith('<svg')).toBe(true);
  });
});
