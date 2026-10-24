import { describe, expect, it } from 'vitest';
import { matchMentions, nameVariants, normName, sentenceAround } from '@/lib/gems/match';
import { findHappenings, scoreGem } from '@/lib/gems/score';
import {
  hashtags, normalizeEvent, normalizeInstagram, normalizePress, normalizeReddit, normalizeTikTok, pressUrls, redditInput,
} from '@/lib/gems/sources';
import type { Mention } from '@/lib/gems/types';
import { normalizeApifyItem } from '@/lib/places/normalize';

const NOW = new Date('2026-10-24T12:00:00Z');

const place = (over: Partial<{ id: string; name: string; rating: number | null; reviews: number; reviewTexts: string[] }> = {}) => ({
  id: 'p1', name: "Sister's Dumpling House - Marina", rating: 4.8, reviews: 52, mapsUrl: 'https://maps.example/p1', ...over,
});

const m = (source: Mention['source'], text: string, over: Partial<Mention> = {}): Mention => ({
  source, text, url: `https://example.com/${source}/${text.length}`, date: '2026-10-01T00:00:00Z', engagement: 10, ...over,
});

describe('name matching', () => {
  it('normalizes punctuation, accents and ampersands', () => {
    expect(normName("Café Nés & Co.")).toBe(' cafe nes and co ');
  });

  it('builds variants without suffixes and generic tails', () => {
    expect(nameVariants("Sister's Dumpling House - Marina")).toEqual(expect.arrayContaining([' sisters dumpling house ', ' sisters dumpling ']));
    expect(nameVariants('The Pizza Place')).toEqual([]); // nothing distinctive
    expect(nameVariants('Pizza')).toEqual([]);
    expect(nameVariants('Tartine')).toEqual([' tartine ']);
  });

  it('matches whole phrases only, across sources', () => {
    const places = [{ id: 'a', name: "Sister's Dumpling House" }, { id: 'b', name: 'Tartine' }, { id: 'c', name: 'Bar' }];
    const hits = matchMentions(places, [
      m('reddit', 'Honestly sisters dumpling is the most underrated spot in the Marina'),
      m('instagram', 'Weekend at TARTINE ☕️ #sffoodie'),
      m('tiktok', 'Tartinesque vibes at the bar'), // no whole-word hit for "tartine", "bar" is generic
    ]);
    expect(hits.get('a')).toHaveLength(1);
    expect(hits.get('b')).toHaveLength(1);
    expect(hits.has('c')).toBe(false);
  });

  it('quotes the sentence that names the place', () => {
    const text = 'Moved here last year. Sisters Dumpling is a hidden gem, get the pork ones! Parking is bad.';
    expect(sentenceAround(text, ' sisters dumpling ')).toBe('Sisters Dumpling is a hidden gem, get the pork ones!');
  });
});

describe('source normalizers', () => {
  it('reads Reddit posts and comments', () => {
    const post = normalizeReddit({ dataType: 'post', title: 'Hidden gems in the Marina?', body: 'Looking for cheap eats', url: 'https://reddit.com/r/sf/1', createdAt: '2026-09-01T00:00:00Z', upVotes: 42 });
    expect(post).toMatchObject({ source: 'reddit', url: 'https://reddit.com/r/sf/1', engagement: 42 });
    expect(post!.text).toContain('Hidden gems in the Marina?');
    expect(normalizeReddit({ body: 'x', url: 'u' })).toBeNull(); // too short
    expect(normalizeReddit({ title: 'nsfw thing here', url: 'u', over18: true })).toBeNull();
  });

  it('reads Instagram, TikTok, press pages and events', () => {
    expect(normalizeInstagram({ caption: 'Best dumplings ever #sfhiddengems', shortCode: 'abc', timestamp: '2026-10-10T00:00:00.000Z', likesCount: 120, locationName: 'Sisters Dumpling' }))
      .toMatchObject({ source: 'instagram', url: 'https://www.instagram.com/p/abc/', engagement: 120 });
    expect(normalizeTikTok({ text: 'POV: you found the best pop up in SF', webVideoUrl: 'https://tiktok.com/v/1', createTime: 1760000000, playCount: 9000 }))
      .toMatchObject({ source: 'tiktok', engagement: 9000, date: new Date(1760000000 * 1000).toISOString() });
    expect(normalizePress({ url: 'https://eater.example/best', text: 'The 38 essential restaurants in San Francisco. '.repeat(10) }))
      .toMatchObject({ source: 'press' });
    expect(normalizeEvent({ name: 'Night market', venue: { name: 'Fort Mason' }, url: 'https://events.example/1', startDate: '2026-10-30' }))
      .toMatchObject({ source: 'events', text: expect.stringContaining('Fort Mason') });
  });

  it('keeps only article URLs from search results', () => {
    const urls = pressUrls(
      [{ organicResults: [{ url: 'https://sf.eater.com/maps/best' }, { url: 'https://www.reddit.com/r/sf' }, { url: 'https://www.yelp.com/biz/x' }, { url: 'https://theinfatuation.com/sf' }] }],
      10
    );
    expect(urls).toEqual(['https://sf.eater.com/maps/best', 'https://theinfatuation.com/sf']);
  });

  it('builds local searches and hashtags', () => {
    expect(redditInput({ city: 'San Francisco', hood: 'Marina', tag: 'sf' }, 100).searches).toContain('Marina San Francisco hidden gem');
    expect(hashtags({ city: 'Berkeley', tag: 'berkeley' })).toContain('berkeleyhiddengems');
  });
});

describe('gem score', () => {
  const v = ' sisters dumpling ';
  const matched = [
    { mention: m('reddit', 'Sisters Dumpling is the most underrated spot, locals know.'), variant: v },
    { mention: m('reddit', 'We went to sisters dumpling after the game'), variant: v },
    { mention: m('tiktok', 'sisters dumpling had a line out the door 🥟', { date: '2026-10-15T00:00:00Z' }), variant: v },
  ];

  it('rewards loved-but-unknown places, local recommendations and recent posts, with reasons', () => {
    const gem = scoreGem(place({ reviewTexts: ['Cozy spot, we talked for hours over dumplings.'] }), matched, normName('best restaurants: tartine, zuni cafe'), NOW);
    expect(gem.score).toBeGreaterThanOrEqual(60);
    expect(gem.known).toBe(false);
    expect(gem.reasons.join(' | ')).toMatch(/4\.8★ with only 52 reviews/);
    expect(gem.reasons.join(' | ')).toMatch(/recommended by locals in 2 Reddit threads/);
    expect(gem.reasons.join(' | ')).toMatch(/post on TikTok in the last 2 months/);
    expect(gem.hangout).toEqual(expect.arrayContaining(['good for talking', 'cozy']));
    expect(gem.counts).toEqual({ reddit: 2, tiktok: 1 });
    // Evidence: the recommending Reddit quote first, one per source, then a Google review.
    expect(gem.evidence.map(e => e.source)).toEqual(['reddit', 'tiktok', 'maps']);
    expect(gem.evidence[0]!.quote).toContain('underrated');
  });

  it('penalizes places already on the big "best of" lists', () => {
    const known = scoreGem(place(), matched, normName("the essential list: sister's dumpling house, tartine"), NOW);
    const hidden = scoreGem(place(), matched, normName('the essential list: tartine'), NOW);
    expect(known.known).toBe(true);
    expect(known.score).toBeLessThan(hidden.score);
    expect(known.reasons).toContain('already on the big "best of" lists');
  });

  it('gives an ordinary place a low score and no made-up evidence', () => {
    const gem = scoreGem(place({ rating: 4.1, reviews: 2300 }), [], '', NOW);
    expect(gem.score).toBe(0);
    expect(gem.evidence).toEqual([]);
    expect(gem.reasons).toEqual([]);
  });

  it('stays within 0–100', () => {
    const lots = Array.from({ length: 30 }, (_, i) => ({ mention: m('reddit', `sisters dumpling hidden gem ${i}`, { url: `u${i}` }), variant: v }));
    expect(scoreGem(place(), lots, '', NOW).score).toBeLessThanOrEqual(100);
  });
});

describe('happenings', () => {
  it('surfaces recent pop-ups that are not on Google Maps', () => {
    const list = findHappenings(
      [
        m('instagram', 'Pop-up this Saturday at the Fort Mason lot! 🍜', { engagement: 300 }),
        m('instagram', 'Old pop up from last year', { date: '2025-01-01T00:00:00Z' }),
        m('reddit', 'Just a normal restaurant review'),
      ],
      new Set(),
      NOW
    );
    expect(list).toHaveLength(1);
    expect(list[0]!.text).toContain('Fort Mason');
  });
});

describe('Google Maps reviews', () => {
  it('keeps a few review texts for hangout signals', () => {
    const p = normalizeApifyItem({
      title: 'Tartine', placeId: 't1', location: { lat: 37.76, lng: -122.42 }, categoryName: 'Bakery',
      reviews: [{ text: 'Great place to sit with friends for hours.' }, { text: 'ok' }, { textTranslated: 'Cozy and quiet, perfect for long talks.' }],
    });
    expect(p!.reviewTexts).toEqual(['Great place to sit with friends for hours.', 'Cozy and quiet, perfect for long talks.']);
    expect(normalizeApifyItem({ title: 'X', location: { lat: 1, lng: 1 } })!.reviewTexts).toBeUndefined();
  });
});
