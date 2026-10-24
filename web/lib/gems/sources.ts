// The Apify actors behind the hidden-gems layer, their inputs, and normalizers that turn each actor's
// output into a common Mention. Actor output fields vary between versions, so every normalizer reads
// several possible field names and drops items it can't make sense of.
//
// Import-free at runtime so scripts/fetch-gems.ts can run it with Node's type stripping.
import type { Mention, MentionSource } from './types';

type Item = Record<string, any>;

export interface Area {
  /** "San Francisco" — used in search phrases. */
  city: string;
  /** "Marina" — optional neighborhood for more local searches. */
  hood?: string;
  /** "sf" — hashtag prefix (#sfhiddengems, #sffoodie). */
  tag: string;
}

/** Actor ids (Apify Store "username~actor-name"). Each can be overridden with an env var. */
export function actorIds(env: Record<string, string | undefined>) {
  return {
    reddit: env.APIFY_REDDIT_ACTOR || 'trudax~reddit-scraper-lite',
    instagram: env.APIFY_INSTAGRAM_ACTOR || 'apify~instagram-hashtag-scraper',
    tiktok: env.APIFY_TIKTOK_ACTOR || 'clockworks~tiktok-scraper',
    search: env.APIFY_SEARCH_ACTOR || 'apify~google-search-scraper',
    crawler: env.APIFY_CRAWLER_ACTOR || 'apify~website-content-crawler',
    events: env.APIFY_EVENTS_ACTOR || '',
  };
}

const places = (a: Area) => [a.hood ? `${a.hood} ${a.city}` : '', a.city].filter(Boolean);

export function redditInput(a: Area, maxItems: number) {
  const searches = places(a).flatMap(p => [
    `${p} hidden gem`,
    `${p} underrated restaurant`,
    `${p} hole in the wall`,
    `${p} hangout spot`,
    `${p} best cheap eats`,
  ]);
  return {
    searches,
    searchPosts: true,
    searchComments: true,
    searchCommunities: false,
    searchUsers: false,
    sort: 'relevance',
    time: 'year',
    maxItems,
    maxPostCount: Math.ceil(maxItems / searches.length),
    maxComments: 15,
    includeNSFW: false,
    proxy: { useApifyProxy: true },
  };
}

export function hashtags(a: Area) {
  const t = a.tag.toLowerCase();
  return [`${t}hiddengems`, `${t}hiddengem`, `${t}foodie`, `${t}eats`, `${t}popup`, `${t}food`];
}

export function instagramInput(a: Area, perTag: number) {
  return { hashtags: hashtags(a), resultsLimit: perTag, resultsType: 'posts' };
}

export function tiktokInput(a: Area, perTag: number) {
  return {
    hashtags: hashtags(a),
    resultsPerPage: perTag,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    shouldDownloadSubtitles: false,
  };
}

/** Step 1 of "press": find the big "best of" lists for the area. */
export function pressSearchInput(a: Area) {
  const p = places(a);
  return {
    queries: p.flatMap(x => [`best restaurants ${x}`, `best bars ${x}`, `essential restaurants ${x} eater`]).join('\n'),
    resultsPerPage: 10,
    maxPagesPerQuery: 1,
    countryCode: 'us',
  };
}

/** Step 2 of "press": read those list articles. */
export function pressCrawlInput(urls: string[]) {
  return {
    startUrls: urls.map(url => ({ url })),
    maxCrawlDepth: 0,
    maxCrawlPages: urls.length,
    crawlerType: 'cheerio',
  };
}

/** Organic result URLs from the Google Search scraper, skipping social sites and maps. */
export function pressUrls(items: Item[], max: number): string[] {
  const urls: string[] = [];
  for (const page of items) {
    for (const r of (page.organicResults ?? []) as Item[]) {
      const url = String(r.url ?? r.link ?? '');
      if (!/^https?:\/\//.test(url)) continue;
      if (/(reddit|instagram|tiktok|facebook|youtube|google|tripadvisor)\.|yelp\.com\/biz/.test(url)) continue;
      if (!urls.includes(url)) urls.push(url);
    }
  }
  return urls.slice(0, max);
}

// ------------------------------------------------------------------------------ normalizers

function firstString(...vals: unknown[]): string {
  for (const v of vals) if (typeof v === 'string' && v.trim()) return v.trim();
  return '';
}

function firstNumber(...vals: unknown[]): number {
  for (const v of vals) if (typeof v === 'number' && Number.isFinite(v)) return v;
  return 0;
}

function isoDate(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (v == null || v === '') continue;
    const d = typeof v === 'number' ? new Date(v < 1e12 ? v * 1000 : v) : new Date(String(v));
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

function mention(source: MentionSource, text: string, url: string, date: string | null, engagement: number): Mention | null {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length < 8 || !url) return null;
  return { source, text: clean.slice(0, 4000), url, date, engagement };
}

export function normalizeReddit(item: Item): Mention | null {
  if (item.over18 === true) return null;
  const text = [item.title, item.body ?? item.text ?? item.selftext].filter(x => typeof x === 'string').join('\n');
  const url = firstString(item.url, item.link, item.permalink && `https://www.reddit.com${item.permalink}`);
  return mention('reddit', text, url, isoDate(item.createdAt, item.created_utc, item.created), firstNumber(item.upVotes, item.score, item.ups));
}

export function normalizeInstagram(item: Item): Mention | null {
  const text = [item.caption, item.locationName && `📍 ${item.locationName}`].filter(Boolean).join('\n');
  const url = firstString(item.url, item.shortCode && `https://www.instagram.com/p/${item.shortCode}/`);
  return mention('instagram', text, url, isoDate(item.timestamp, item.takenAt), firstNumber(item.likesCount, item.likes));
}

export function normalizeTikTok(item: Item): Mention | null {
  const loc = firstString(item.locationMeta?.locationName, item.poi?.name);
  const text = [item.text, item.desc, loc && `📍 ${loc}`].filter(Boolean).join('\n');
  const url = firstString(item.webVideoUrl, item.url, item.videoUrl);
  return mention('tiktok', text, url, isoDate(item.createTimeISO, item.createTime), firstNumber(item.playCount, item.diggCount));
}

export function normalizePress(item: Item): Mention | null {
  const text = [item.metadata?.title, item.text, item.markdown].find(x => typeof x === 'string' && x.length > 200) ?? item.text;
  return mention('press', String(text ?? ''), firstString(item.url, item.loadedUrl), isoDate(item.metadata?.publishedAt), 0);
}

export function normalizeEvent(item: Item): Mention | null {
  const venue = firstString(item.venue?.name, item.location?.name, item.venueName, item.place);
  const text = [item.title ?? item.name, venue && `📍 ${venue}`, item.description ?? item.summary].filter(Boolean).join('\n');
  return mention('events', text, firstString(item.url, item.link, item.eventUrl), isoDate(item.startDate, item.start, item.date), 0);
}

export const NORMALIZERS: Record<MentionSource, (item: Item) => Mention | null> = {
  reddit: normalizeReddit,
  instagram: normalizeInstagram,
  tiktok: normalizeTikTok,
  press: normalizePress,
  events: normalizeEvent,
};
