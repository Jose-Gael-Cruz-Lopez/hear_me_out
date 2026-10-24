import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_POSTS_PER_PROFILE,
  MAX_POSTS_PER_PROFILE,
  MAX_VIBE_TAGS,
  SCRAPER_ACTORS,
  buildScraperInput,
  deterministicVibeTags,
  enrich,
  isSensitiveText,
  normalizePosts,
  parseFacebookPage,
  parseInstagramHandle,
  parseTiktokHandle,
  postingPatternFrom,
  profileHandles,
  resolveTargets,
  sanitizeVibeTags,
  splitByHandle,
  toKebab,
  toPublicMerged,
  toPublicProfile,
  type CallActor,
  type MuseTagger,
  type NormalizedPost,
} from './core.js';

const fixture = (name: string): Record<string, unknown>[] =>
  JSON.parse(readFileSync(new URL(`../test/fixtures/${name}`, import.meta.url), 'utf8')).items;
const readJson = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));

const IG = fixture('instagram-natgeo.json');
const TT = fixture('tiktok-nba.json');
const FB = fixture('facebook-nasa.json');
const FOODIE = fixture('synthetic-foodie-instagram.json');

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Fake callActor serving recorded fixtures per scraper. */
function fixtureCallActor(overrides: Partial<Record<string, unknown[] | Error>> = {}) {
  const data: Record<string, unknown[] | Error> = {
    [SCRAPER_ACTORS.instagram]: IG,
    [SCRAPER_ACTORS.tiktok]: TT,
    [SCRAPER_ACTORS.facebook]: FB,
    ...overrides,
  };
  return vi.fn<CallActor>(async actorId => {
    const d = data[actorId];
    if (d instanceof Error) throw d;
    return d ?? [];
  });
}

describe('handle parsing', () => {
  it('accepts usernames, @handles and profile URLs', () => {
    for (const raw of ['natgeo', '@NatGeo', 'https://www.instagram.com/natgeo/', 'instagram.com/natgeo?hl=en']) {
      expect(parseInstagramHandle(raw)).toEqual({ platform: 'instagram', handle: 'natgeo', url: 'https://www.instagram.com/natgeo/' });
    }
    for (const raw of ['nba', '@nba', 'https://www.tiktok.com/@nba', 'https://www.tiktok.com/@NBA?lang=en']) {
      expect(parseTiktokHandle(raw)).toEqual({ platform: 'tiktok', handle: 'nba', url: 'https://www.tiktok.com/@nba' });
    }
    for (const raw of ['https://www.facebook.com/nasa', 'facebook.com/NASA/', 'nasa', 'https://m.facebook.com/nasa?ref=x']) {
      expect(parseFacebookPage(raw)).toEqual({ platform: 'facebook', handle: 'nasa', url: 'https://www.facebook.com/nasa' });
    }
    expect(parseFacebookPage('https://www.facebook.com/profile.php?id=12345')?.handle).toBe('profile.php?id=12345');
  });

  it('rejects junk', () => {
    expect(parseInstagramHandle('not a handle!')).toBeNull();
    expect(parseInstagramHandle('')).toBeNull();
    expect(parseTiktokHandle('a b')).toBeNull();
    expect(parseFacebookPage('https://www.facebook.com/profile.php?id=abc')).toBeNull();
  });

  it('dedupes, caps per platform and reports invalid entries', () => {
    const many = Array.from({ length: 12 }, (_, i) => `brand${i}`);
    const { targets, warnings } = resolveTargets({ instagramHandles: ['natgeo', '@natgeo', 'bad handle', ...many], tiktokHandles: ['nba'] });
    expect(targets.filter(t => t.platform === 'instagram')).toHaveLength(10);
    expect(targets.filter(t => t.platform === 'tiktok')).toHaveLength(1);
    expect(warnings.some(w => w.includes('invalid instagram handle'))).toBe(true);
    expect(warnings.some(w => w.includes('Only the first 10'))).toBe(true);
  });
});

describe('scraper inputs', () => {
  const ig = parseInstagramHandle('natgeo')!;
  it('uses the verified input fields of each scraper', () => {
    expect(buildScraperInput('instagram', [ig], 12)).toMatchObject({ directUrls: ['https://www.instagram.com/natgeo/'], resultsType: 'posts', resultsLimit: 12 });
    expect(buildScraperInput('tiktok', [parseTiktokHandle('nba')!], 5)).toMatchObject({
      profiles: ['nba'],
      resultsPerPage: 5,
      profileScrapeSections: ['videos'],
      shouldDownloadVideos: false,
    });
    expect(buildScraperInput('facebook', [parseFacebookPage('nasa')!], 7)).toMatchObject({
      startUrls: [{ url: 'https://www.facebook.com/nasa' }],
      resultsLimit: 7,
    });
  });
});

describe('normalizePosts', () => {
  it('normalizes Instagram posts', () => {
    const posts = normalizePosts('instagram', 'natgeo', IG);
    expect(posts).toHaveLength(3);
    expect(posts.map(p => p.mediaType)).toEqual(['carousel', 'image', 'video']);
    expect(posts[0]).toMatchObject({ platform: 'instagram', handle: 'natgeo', timestamp: '2026-10-23T19:00:00.000Z', locationName: null });
    expect(posts[0].hashtags).toEqual(['rolex', 'africaearthswildhome', 'perpetualplanet']);
    expect(posts[0].text).toContain('bearded vultures');
    // Instagram's "Photo by X on <date>." prefix is stripped from alt text.
    expect(posts[1].altText?.startsWith('May be an image of whale')).toBe(true);
  });

  it('normalizes TikTok videos', () => {
    const posts = normalizePosts('tiktok', 'nba', TT);
    expect(posts).toHaveLength(3);
    expect(posts[0]).toMatchObject({ platform: 'tiktok', mediaType: 'video', timestamp: '2026-10-24T06:45:35.000Z', locationName: null });
    expect(posts[0].hashtags).toEqual(['nba', 'basketball', 'lukadoncic', 'austinreaves', 'lakers']);
  });

  it('normalizes Facebook posts (hashtags from text, OCR as alt text)', () => {
    const posts = normalizePosts('facebook', 'nasa', FB);
    expect(posts).toHaveLength(3);
    expect(posts.map(p => p.mediaType)).toEqual(['video', 'image', 'image']);
    expect(posts[0].timestamp).toBe('2026-10-23T23:40:58.000Z');
    expect(posts[1].altText).toContain('clouds');
    expect(normalizePosts('facebook', 'x', [{ text: 'Taco night #TacoTuesday #tacos', time: '2026-01-01T00:00:00Z' }])[0]).toMatchObject({
      hashtags: ['tacotuesday', 'tacos'],
      mediaType: 'text',
    });
  });

  it('skips error items and junk', () => {
    const posts = normalizePosts('instagram', 'natgeo', [null, 'x', { error: 'not_found', errorDescription: 'Page not found' }, IG[0]]);
    expect(posts).toHaveLength(1);
  });

  it('parses unix-second timestamps', () => {
    const [p] = normalizePosts('tiktok', 'nba', [{ text: 'hi', createTime: 1792824335 }]);
    expect(p.timestamp).toBe('2026-10-24T06:45:35.000Z');
  });
});

describe('splitByHandle', () => {
  it('groups items by the input URL and collects per-handle errors', () => {
    const targets = [parseInstagramHandle('natgeo')!, parseInstagramHandle('example.foodie')!];
    const missing = { inputUrl: 'https://www.instagram.com/example.foodie/', error: 'not_found', errorDescription: 'Page not found' };
    const groups = splitByHandle('instagram', targets, [...IG, missing, ...FOODIE.slice(0, 2)]);
    expect(groups.get('natgeo')!.items).toHaveLength(3);
    expect(groups.get('example.foodie')!.items).toHaveLength(2);
    expect(groups.get('example.foodie')!.errors).toEqual(['not_found: Page not found']);
  });

  it('assigns everything to the only target when items lack a usable key', () => {
    const groups = splitByHandle('tiktok', [parseTiktokHandle('nba')!], [{ text: 'no input field' }]);
    expect(groups.get('nba')!.items).toHaveLength(1);
  });
});

describe('enrich', () => {
  const posts = normalizePosts('instagram', 'example.foodie', FOODIE);

  it('counts hashtags and places, leaving out generic and sensitive ones', () => {
    const e = enrich(posts);
    expect(e.postCount).toBe(10);
    expect(e.topHashtags[0]).toEqual({ tag: 'ramen', count: 2 });
    const tags = e.topHashtags.map(h => h.tag);
    expect(tags).not.toContain('fyp');
    expect(tags).not.toContain('vegan');
    expect(e.topLocations.slice(0, 2)).toEqual([
      { name: 'Example Ramen House', count: 2 },
      { name: 'Example Taqueria', count: 2 },
    ]);
    expect(e.topLocations.map(l => l.name)).not.toContain('Example Chapel');
  });

  it('matches interests and sub-interests with evidence indices', () => {
    const e = enrich(posts);
    const sub = Object.fromEntries(e.subInterests.map(h => [h.interest, h]));
    expect(sub.ramen.evidencePostIndices).toEqual([0, 5]);
    expect(sub.tacos.evidencePostIndices).toEqual([1, 8]);
    expect(sub['spicy-food'].evidencePostIndices).toEqual([1, 2, 5, 8]);
    expect(sub['board-games'].matchedPosts).toBe(1);
    expect(sub.ramen.matchedTerms).toEqual(expect.arrayContaining(['ramen', '🍜', '#ramen']));
    const food = e.interests.find(h => h.interest === 'food')!;
    expect(food.matchedPosts).toBe(7);
    expect(food.share).toBe(0.7);
    expect(e.interests[0].interest).toBe('food');
  });

  it('derives the posting pattern in the requested time zone', () => {
    const la = enrich(posts, { timeZone: 'America/Los_Angeles' });
    expect(la.postingPattern).toBe('night-owl');
    expect(la.postingHours).toEqual({ morning: 2, afternoon: 0, evening: 0, lateNight: 8 });
    expect(enrich(posts, { timeZone: 'UTC' }).postingPattern).toBe('morning-person');
    expect(enrich(posts, { timeZone: 'Not/AZone' }).timeZone).toBe('UTC');
    expect(la.firstPostAt).toBe('2026-10-01T06:30:00.000Z');
    expect(la.lastPostAt).toBe('2026-10-20T07:40:00.000Z');
  });

  it('labels too-few or spread-out timestamps honestly', () => {
    expect(postingPatternFrom({ morning: 1, afternoon: 0, evening: 0, lateNight: 2 })).toBe('unknown');
    expect(postingPatternFrom({ morning: 2, afternoon: 2, evening: 2, lateNight: 2 })).toBe('mixed');
  });

  it('avoids common substring false positives', () => {
    const p = (text: string, hashtags: string[] = []): NormalizedPost => ({
      platform: 'instagram',
      handle: 'x',
      text,
      hashtags,
      locationName: null,
      timestamp: null,
      mediaType: 'image',
    });
    const e = enrich([
      p('This really improves my mood. A musical symbol.', ['husband', 'technology', 'steampunk', 'heartstrings', 'sacramentokings', 'startrek']),
    ]);
    expect(e.interests.map(h => h.interest)).toEqual([]);
    // "signature" ends in "nature" but must not count as outdoors; the cocktail part still counts.
    const sig = enrich([p('', ['signaturecocktail'])]);
    expect(sig.interests.map(h => h.interest)).toEqual(['nightlife']);
  });

  it('matches stems as hashtag prefixes and suffixes', () => {
    const p = (hashtags: string[]): NormalizedPost => ({
      platform: 'tiktok',
      handle: 'x',
      text: '',
      hashtags,
      locationName: null,
      timestamp: null,
      mediaType: 'video',
    });
    const subs = enrich([p(['ramenlover']), p(['bestramen']), p(['nycwildlifephotos'])]).subInterests.map(h => h.interest);
    expect(subs).toEqual(expect.arrayContaining(['ramen', 'wildlife']));
  });

  it('handles an empty post list', () => {
    const e = enrich([]);
    expect(e).toMatchObject({ postCount: 0, interests: [], postingPattern: 'unknown', firstPostAt: null });
  });
});

describe('deterministicVibeTags', () => {
  it('prefers specific tags and adds the posting pattern', () => {
    const posts = normalizePosts('instagram', 'example.foodie', FOODIE);
    const tags = deterministicVibeTags(enrich(posts, { timeZone: 'America/Los_Angeles' }), posts);
    expect(tags.map(t => t.tag)).toEqual(['foodie', 'spicy-food', 'dessert', 'ramen', 'tacos', 'night-owl']);
    const ramen = tags.find(t => t.tag === 'ramen')!;
    expect(ramen.evidencePostIndices).toEqual([0, 5]);
    expect(ramen.reason).toMatch(/^2 of 10 posts mention ramen/);
    const owl = tags.find(t => t.tag === 'night-owl')!;
    expect(owl.evidencePostIndices).toEqual([0, 1, 2, 3, 5, 6, 7, 8]);
    expect(owl.reason).toContain('America/Los_Angeles');
    for (const t of tags) {
      expect(t.tag).toMatch(KEBAB);
      expect(isSensitiveText(t.tag)).toBe(false);
      expect(t.evidencePostIndices.every(i => i >= 0 && i < posts.length)).toBe(true);
    }
  });

  it('works on the recorded brand fixtures', () => {
    const ng = normalizePosts('instagram', 'natgeo', IG);
    const ngTags = deterministicVibeTags(enrich(ng), ng).map(t => t.tag);
    expect(ngTags).toContain('wildlife');
    expect(ngTags).not.toContain('outdoorsy'); // fully explained by the more specific wildlife tag
    const nba = normalizePosts('tiktok', 'nba', TT);
    expect(deterministicVibeTags(enrich(nba), nba).map(t => t.tag)).toContain('sports-fan');
  });

  it('returns nothing for no posts and never more than the cap', () => {
    expect(deterministicVibeTags(enrich([]))).toEqual([]);
    const posts = normalizePosts('instagram', 'x', FOODIE);
    expect(deterministicVibeTags(enrich([...posts, ...posts, ...posts]), posts).length).toBeLessThanOrEqual(MAX_VIBE_TAGS);
  });
});

describe('sanitizeVibeTags', () => {
  it('kebab-cases, dedupes, drops sensitive tags and bad indices, caps at 8', () => {
    const out = sanitizeVibeTags(
      [
        { tag: 'Spicy Food', reason: ' loves   heat ', evidencePostIndices: [3, 1, 1, 99, -1, 2.5] },
        { tag: 'spicy-food', reason: 'dupe', evidencePostIndices: [0] },
        { tag: 'vegan-eats', reason: 'diet', evidencePostIndices: [0] },
        { tag: 'Church Goer', reason: 'religion', evidencePostIndices: [0] },
        { tag: '#PrideMonth', reason: 'identity', evidencePostIndices: [0] },
        { tag: 'no-evidence', reason: 'x', evidencePostIndices: [] },
        ...Array.from({ length: 10 }, (_, i) => ({ tag: `tag ${i}`, reason: 'r', evidencePostIndices: [0] })),
      ],
      5,
      { requireEvidence: true }
    );
    expect(out[0]).toEqual({ tag: 'spicy-food', reason: 'loves heat', evidencePostIndices: [1, 3] });
    expect(out.map(t => t.tag)).not.toContain('vegan-eats');
    expect(out.map(t => t.tag)).not.toContain('church-goer');
    expect(out.map(t => t.tag)).not.toContain('pridemonth');
    expect(out.map(t => t.tag)).not.toContain('no-evidence');
    expect(out).toHaveLength(MAX_VIBE_TAGS);
  });

  it('keeps harmless look-alikes', () => {
    expect(isSensitiveText('hospitality')).toBe(false);
    expect(isSensitiveText('magazines')).toBe(false);
    expect(isSensitiveText('trumpet-jazz')).toBe(false);
    expect(isSensitiveText('weightlifting')).toBe(false);
    expect(toKebab('Café & Crêpes!')).toBe('cafe-and-crepes');
  });
});

describe('profileHandles', () => {
  const input = {
    instagramHandles: ['natgeo'],
    tiktokHandles: ['@nba'],
    facebookPageUrls: ['https://www.facebook.com/nasa'],
    postsPerProfile: 3,
  };

  it('runs one scraper per platform and profiles each handle plus a merged profile', async () => {
    const callActor = fixtureCallActor();
    const result = await profileHandles(input, { callActor });
    expect(callActor).toHaveBeenCalledTimes(3);
    const calls = Object.fromEntries(callActor.mock.calls.map(([id, inp, opts]) => [id, { inp, opts }]));
    expect(calls[SCRAPER_ACTORS.instagram].inp).toMatchObject({ directUrls: ['https://www.instagram.com/natgeo/'], resultsLimit: 3 });
    expect(calls[SCRAPER_ACTORS.tiktok].inp).toMatchObject({ profiles: ['nba'], resultsPerPage: 3 });
    expect(calls[SCRAPER_ACTORS.facebook].inp).toMatchObject({ startUrls: [{ url: 'https://www.facebook.com/nasa' }], resultsLimit: 3 });
    expect(calls[SCRAPER_ACTORS.facebook].opts).toEqual({ maxItems: 3 });

    expect(result.profiles.map(p => `${p.platform}:${p.handle}:${p.status}:${p.postCount}`)).toEqual([
      'instagram:natgeo:ok:3',
      'tiktok:nba:ok:3',
      'facebook:nasa:ok:3',
    ]);
    expect(result.profiles.every(p => p.vibeTagsSource === 'heuristic')).toBe(true);
    expect(result.profiles[1].tags).toContain('sports-fan');
    expect(result.merged.postCount).toBe(9);
    expect(result.merged.posts).toHaveLength(9);
    expect(result.merged.handles).toHaveLength(3);
    expect(result.merged.tags.length).toBeGreaterThan(0);
    expect(result.merged.vibeTags.every(t => t.evidencePostIndices.every(i => i < 9))).toBe(true);
  });

  it('clamps postsPerProfile and trims extra items', async () => {
    const callActor = fixtureCallActor();
    const r = await profileHandles({ instagramHandles: ['natgeo'], postsPerProfile: 500 }, { callActor });
    expect(callActor.mock.calls[0][1]).toMatchObject({ resultsLimit: MAX_POSTS_PER_PROFILE });
    const r2 = await profileHandles({ instagramHandles: ['natgeo'] }, { callActor });
    expect(callActor.mock.calls[1][1]).toMatchObject({ resultsLimit: DEFAULT_POSTS_PER_PROFILE });
    const r3 = await profileHandles({ instagramHandles: ['natgeo'], postsPerProfile: 2 }, { callActor });
    expect([r.profiles[0].postCount, r2.profiles[0].postCount, r3.profiles[0].postCount]).toEqual([3, 3, 2]);
  });

  it('isolates a failing platform', async () => {
    const callActor = fixtureCallActor({ [SCRAPER_ACTORS.tiktok]: new Error('boom') });
    const result = await profileHandles(input, { callActor });
    const tt = result.profiles.find(p => p.platform === 'tiktok')!;
    expect(tt).toMatchObject({ status: 'error', error: 'boom', postCount: 0, vibeTags: [] });
    expect(result.profiles.filter(p => p.status === 'ok')).toHaveLength(2);
    expect(result.warnings.some(w => w.includes('clockworks/tiktok-scraper failed'))).toBe(true);
    expect(result.merged.postCount).toBe(6);
  });

  it('reports handles without posts', async () => {
    const callActor = fixtureCallActor({ [SCRAPER_ACTORS.instagram]: [] });
    const result = await profileHandles({ instagramHandles: ['natgeo'] }, { callActor });
    expect(result.profiles[0].status).toBe('no-posts');
    expect(result.merged).toMatchObject({ postCount: 0, vibeTags: [], tags: [] });
    expect(result.warnings).toContain('No public posts found for instagram:natgeo');
  });

  it('marks a handle as error when the scraper only returned an error item', async () => {
    const callActor = fixtureCallActor({ [SCRAPER_ACTORS.instagram]: [{ inputUrl: 'https://www.instagram.com/natgeo/', error: 'not_found' }] });
    const result = await profileHandles({ instagramHandles: ['natgeo'] }, { callActor });
    expect(result.profiles[0]).toMatchObject({ status: 'error', error: 'not_found' });
  });

  it('uses Muse tags when available and sanitizes them', async () => {
    const muse = vi.fn<MuseTagger>(async posts => [
      { tag: 'Wildlife Docs', reason: 'nature films', evidencePostIndices: [0, 1, 42] },
      { tag: 'religious', reason: 'never', evidencePostIndices: [0] },
      { tag: 'uncited', reason: 'no evidence', evidencePostIndices: [] },
      { tag: 'late-scroller', reason: 'x', evidencePostIndices: [posts.length - 1] },
    ]);
    const result = await profileHandles({ instagramHandles: ['natgeo'] }, { callActor: fixtureCallActor(), muse });
    expect(muse).toHaveBeenCalledTimes(1); // single handle: merged profile reuses its tags
    const p = result.profiles[0];
    expect(p.vibeTagsSource).toBe('muse');
    expect(p.vibeTags).toEqual([
      { tag: 'wildlife-docs', reason: 'nature films', evidencePostIndices: [0, 1] },
      { tag: 'late-scroller', reason: 'x', evidencePostIndices: [2] },
    ]);
    expect(result.merged.vibeTags).toEqual(p.vibeTags);
    expect(result.merged.vibeTagsSource).toBe('muse');
  });

  it('calls Muse per handle and for the merged profile', async () => {
    const muse = vi.fn<MuseTagger>(async posts => [{ tag: 'x', reason: 'y', evidencePostIndices: [posts.length - 1] }]);
    const result = await profileHandles(input, { callActor: fixtureCallActor(), muse });
    expect(muse).toHaveBeenCalledTimes(4);
    expect(result.merged.vibeTags[0].evidencePostIndices).toEqual([8]);
  });

  it('falls back to heuristic tags when Muse returns null, nothing usable, or throws', async () => {
    for (const impl of [async () => null, async () => [{ tag: 'politics', reason: 'x', evidencePostIndices: [0] }], async () => { throw new Error('timeout'); }]) {
      const log = vi.fn();
      const result = await profileHandles({ tiktokHandles: ['nba'] }, { callActor: fixtureCallActor(), muse: vi.fn<MuseTagger>(impl), log });
      expect(result.profiles[0].vibeTagsSource).toBe('heuristic');
      expect(result.profiles[0].tags).toContain('sports-fan');
      expect(log).toHaveBeenCalledWith('warn', expect.stringContaining('Muse'), expect.anything());
    }
  });

  it('does not call Muse for handles without posts', async () => {
    const muse = vi.fn<MuseTagger>(async () => null);
    await profileHandles({ instagramHandles: ['natgeo'] }, { callActor: fixtureCallActor({ [SCRAPER_ACTORS.instagram]: [] }), muse });
    expect(muse).not.toHaveBeenCalled();
  });

  it('warns about an unknown time zone and uses UTC', async () => {
    const r = await profileHandles({ instagramHandles: ['natgeo'], timeZone: 'Mars/Olympus' }, { callActor: fixtureCallActor() });
    expect(r.merged.timeZone).toBe('UTC');
    expect(r.warnings).toContain('Unknown time zone "Mars/Olympus", using UTC');
  });

  it('makes no scraper calls without handles', async () => {
    const callActor = fixtureCallActor();
    const r = await profileHandles({}, { callActor });
    expect(callActor).not.toHaveBeenCalled();
    expect(r.profiles).toEqual([]);
  });
});

describe('privacy-safe views', () => {
  it('omits posts by default and includes them only on request', async () => {
    const r = await profileHandles({ instagramHandles: ['natgeo'] }, { callActor: fixtureCallActor() });
    const pub = toPublicProfile(r.profiles[0]);
    expect('posts' in pub).toBe(false);
    expect(JSON.stringify(pub)).not.toContain('bearded vultures');
    expect(JSON.stringify(toPublicMerged(r.merged))).not.toContain('bearded vultures');
    expect(toPublicProfile(r.profiles[0], true).posts).toHaveLength(3);
  });
});

describe('actor definition', () => {
  const schema = readJson('../.actor/input_schema.json');
  const actor = readJson('../.actor/actor.json');

  it('keeps input schema defaults in sync with the core', () => {
    const props = schema.properties;
    expect(props.postsPerProfile.default).toBe(DEFAULT_POSTS_PER_PROFILE);
    expect(props.postsPerProfile.maximum).toBe(MAX_POSTS_PER_PROFILE);
    expect(props.museApiKey.isSecret).toBe(true);
    expect(props.museModel.default).toBe('muse-spark-1.3');
    expect(props.includePosts.default).toBe(false);
    expect(props.deleteScrapedData.default).toBe(true);
    for (const key of ['instagramHandles', 'tiktokHandles', 'facebookPageUrls']) expect(props[key].type).toBe('array');
  });

  it('declares a valid actor spec', () => {
    expect(actor).toMatchObject({ actorSpecification: 1, name: 'vibe-profiler', version: '0.1', input: './input_schema.json' });
    const ds = readJson('../.actor/dataset_schema.json');
    for (const view of Object.values<{ transformation: { fields: string[] }; display: { properties: Record<string, unknown> } }>(ds.views)) {
      for (const f of view.transformation.fields) expect(view.display.properties[f]).toBeDefined();
    }
  });
});
