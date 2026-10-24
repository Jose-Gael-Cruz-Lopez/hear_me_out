/**
 * vibe-profiler core: pure logic shared by the Apify actor (`main.ts`) and the Hear Me Out orchestrator.
 *
 * No Apify SDK imports here. Scraping is injected through `deps.callActor`, Muse through `deps.muse`.
 */
import {
  GENERIC_HASHTAGS,
  HASHTAG_COLLISIONS,
  INTEREST_RULES,
  SENSITIVE_SUBSTRINGS,
  SENSITIVE_TAG_WORDS,
  type Interest,
  type InterestRule,
} from './interests.js';

export { INTERESTS, INTEREST_RULES, type Interest, type InterestRule } from './interests.js';

// ------------------------------------------------------------------ constants

export const SCRAPER_ACTORS = {
  instagram: 'apify/instagram-scraper',
  tiktok: 'clockworks/tiktok-scraper',
  facebook: 'apify/facebook-posts-scraper',
} as const;

export const PLATFORMS = ['instagram', 'tiktok', 'facebook'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const DEFAULT_POSTS_PER_PROFILE = 12;
export const MAX_POSTS_PER_PROFILE = 30;
export const MAX_HANDLES_PER_PLATFORM = 10;
export const MAX_VIBE_TAGS = 8;
export const MAX_EVIDENCE_INDICES = 8;
export const DEFAULT_MUSE_MODEL = 'muse-spark-1.3';
export const DEFAULT_TIME_ZONE = 'UTC';

// ------------------------------------------------------------------ types

export type MediaType = 'image' | 'video' | 'carousel' | 'text' | 'unknown';

export interface NormalizedPost {
  platform: Platform;
  handle: string;
  text: string;
  /** Lowercase, without '#'. */
  hashtags: string[];
  locationName: string | null;
  /** ISO 8601 (UTC) or null when the scraper gave no date. */
  timestamp: string | null;
  mediaType: MediaType;
  /** Platform-generated image description (Instagram alt text, Facebook OCR text). Used for matching only. */
  altText?: string;
}

export interface ProfileTarget {
  platform: Platform;
  /** Lowercase handle (Instagram/TikTok username, Facebook page slug). */
  handle: string;
  /** Canonical profile URL sent to the scraper. */
  url: string;
}

export interface HashtagCount {
  tag: string;
  count: number;
}

export interface LocationCount {
  name: string;
  count: number;
}

export interface InterestHit {
  interest: string;
  /** Parent interest for sub-interests (e.g. ramen -> food); null for top-level interests. */
  parent: Interest | null;
  /** Posts that matched at least one keyword, hashtag or emoji. */
  matchedPosts: number;
  /** matchedPosts / postCount, rounded to 2 decimals. */
  share: number;
  evidencePostIndices: number[];
  /** Up to 5 matched terms, e.g. "ramen", "#ramenlover", "🍜". */
  matchedTerms: string[];
}

export type PostingPattern = 'morning-person' | 'night-owl' | 'mixed' | 'unknown';

/** Post counts by local hour: morning 05-11, afternoon 11-17, evening 17-21, lateNight 21-05. */
export interface PostingHours {
  morning: number;
  afternoon: number;
  evening: number;
  lateNight: number;
}

export interface Enrichment {
  postCount: number;
  topHashtags: HashtagCount[];
  topLocations: LocationCount[];
  interests: InterestHit[];
  subInterests: InterestHit[];
  postingPattern: PostingPattern;
  postingHours: PostingHours;
  timeZone: string;
  firstPostAt: string | null;
  lastPostAt: string | null;
}

export interface VibeTag {
  /** kebab-case, e.g. "spicy-food". */
  tag: string;
  /** Short "because..." line. */
  reason: string;
  /** Indices into the post list the tag was derived from. */
  evidencePostIndices: number[];
}

export type VibeTagSource = 'muse' | 'heuristic';
export type ProfileStatus = 'ok' | 'no-posts' | 'error';

export interface HandleProfile extends Enrichment {
  platform: Platform;
  handle: string;
  profileUrl: string;
  status: ProfileStatus;
  error?: string;
  vibeTags: VibeTag[];
  vibeTagsSource: VibeTagSource;
  /** Just the tag names, for quick display. */
  tags: string[];
  /** Normalized posts (in memory only; the actor omits them from the dataset unless asked). */
  posts: NormalizedPost[];
}

export interface MergedProfile extends Enrichment {
  handles: { platform: Platform; handle: string; status: ProfileStatus; postCount: number }[];
  vibeTags: VibeTag[];
  vibeTagsSource: VibeTagSource;
  tags: string[];
  warnings: string[];
  /** All posts in profile order; merged evidence indices point into this list. */
  posts: NormalizedPost[];
}

export interface ProfilerResult {
  profiles: HandleProfile[];
  merged: MergedProfile;
  warnings: string[];
}

export interface ProfilerInput {
  instagramHandles?: string[];
  tiktokHandles?: string[];
  facebookPageUrls?: string[];
  postsPerProfile?: number;
  /** IANA time zone used for the posting-time pattern. Default UTC. */
  timeZone?: string;
}

export interface CallActorOptions {
  /** Upper bound on dataset items the run should produce (used for cost caps). */
  maxItems: number;
}

/** Runs an Apify actor and resolves with its dataset items. */
export type CallActor = (actorId: string, input: Record<string, unknown>, options?: CallActorOptions) => Promise<unknown[]>;

/** Returns vibe tags for the posts, or null to fall back to the deterministic tags. */
export type MuseTagger = (posts: NormalizedPost[], enrichment: Enrichment) => Promise<VibeTag[] | null>;

export type LogFn = (level: 'info' | 'warn', message: string, data?: Record<string, unknown>) => void;

export interface ProfilerDeps {
  callActor: CallActor;
  muse?: MuseTagger;
  log?: LogFn;
}

// ------------------------------------------------------------------ small helpers

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const uniq = <T>(xs: Iterable<T>): T[] => [...new Set(xs)];

function toIso(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    // Unix seconds (scrapers) vs milliseconds.
    const ms = v < 1e12 ? v * 1000 : v;
    return new Date(ms).toISOString();
  }
  if (typeof v === 'string' && v.trim()) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

const HASHTAG_RE = /#([\p{L}\p{N}_]+)/gu;

export function extractHashtags(text: string): string[] {
  return uniq([...text.matchAll(HASHTAG_RE)].map(m => m[1].toLowerCase()));
}

function cleanHashtag(v: unknown): string {
  const raw = isDict(v) ? str(v.name) || str(v.title) : str(v);
  return raw.replace(/^#/, '').trim().toLowerCase();
}

/** Lowercase kebab-case, ASCII-ish, at most 40 chars. */
export function toKebab(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

/**
 * True when a tag, hashtag or place name touches health, religion, sexuality, politics, ethnicity or diet.
 * Such values are never emitted as tags, top hashtags or top locations.
 */
export function isSensitiveText(value: string): boolean {
  const parts = toKebab(value).split('-');
  const joined = parts.join('');
  return (
    parts.some(p => SENSITIVE_TAG_WORDS.has(p)) || SENSITIVE_TAG_WORDS.has(joined) || SENSITIVE_SUBSTRINGS.some(s => joined.includes(s))
  );
}


// ------------------------------------------------------------------ handles

const IG_HANDLE = /^[a-z0-9._]{1,30}$/;
const TT_HANDLE = /^[a-z0-9._]{1,40}$/;
const FB_SLUG = /^[a-z0-9.\-_]{1,80}$/;

function afterHost(raw: string, host: string): string | null {
  const i = raw.toLowerCase().indexOf(host);
  return i === -1 ? null : raw.slice(i + host.length);
}

/** Accepts "natgeo", "@natgeo" or "https://www.instagram.com/natgeo/". */
export function parseInstagramHandle(raw: string): ProfileTarget | null {
  let s = raw.trim();
  const path = afterHost(s, 'instagram.com/');
  if (path !== null) s = path.split(/[/?#]/)[0];
  s = s.replace(/^@/, '').toLowerCase();
  if (!IG_HANDLE.test(s)) return null;
  return { platform: 'instagram', handle: s, url: `https://www.instagram.com/${s}/` };
}

/** Accepts "nba", "@nba" or "https://www.tiktok.com/@nba". */
export function parseTiktokHandle(raw: string): ProfileTarget | null {
  let s = raw.trim();
  const path = afterHost(s, 'tiktok.com/');
  if (path !== null) s = path.split(/[/?#]/)[0];
  s = s.replace(/^@/, '').toLowerCase();
  if (!TT_HANDLE.test(s)) return null;
  return { platform: 'tiktok', handle: s, url: `https://www.tiktok.com/@${s}` };
}

/** Accepts "https://www.facebook.com/nasa", "facebook.com/nasa", "nasa" or ".../profile.php?id=123". */
export function parseFacebookPage(raw: string): ProfileTarget | null {
  const s = raw.trim();
  if (!s) return null;
  const hasHost = /(^|\/\/|\.)(facebook\.com|fb\.com)\//i.test(s) || /^(www\.|m\.)?(facebook|fb)\.com\//i.test(s);
  if (!hasHost) {
    const slug = s.replace(/^@/, '').toLowerCase();
    return FB_SLUG.test(slug) ? { platform: 'facebook', handle: slug, url: `https://www.facebook.com/${slug}` } : null;
  }
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments[0] === 'profile.php') {
    const id = url.searchParams.get('id');
    if (!id || !/^\d+$/.test(id)) return null;
    return { platform: 'facebook', handle: `profile.php?id=${id}`, url: `https://www.facebook.com/profile.php?id=${id}` };
  }
  let slug = segments[0] ?? '';
  if ((slug === 'pages' || slug === 'pg') && segments[1]) slug = segments[1];
  slug = slug.toLowerCase();
  if (!FB_SLUG.test(slug)) return null;
  return { platform: 'facebook', handle: slug, url: `https://www.facebook.com/${slug}` };
}

export function parseTarget(platform: Platform, raw: string): ProfileTarget | null {
  if (typeof raw !== 'string') return null;
  if (platform === 'instagram') return parseInstagramHandle(raw);
  if (platform === 'tiktok') return parseTiktokHandle(raw);
  return parseFacebookPage(raw);
}

export function resolveTargets(input: ProfilerInput): { targets: ProfileTarget[]; warnings: string[] } {
  const warnings: string[] = [];
  const targets: ProfileTarget[] = [];
  const lists: [Platform, unknown][] = [
    ['instagram', input.instagramHandles],
    ['tiktok', input.tiktokHandles],
    ['facebook', input.facebookPageUrls],
  ];
  for (const [platform, list] of lists) {
    if (!Array.isArray(list)) continue;
    const seen = new Set<string>();
    for (const raw of list) {
      const t = parseTarget(platform, String(raw ?? ''));
      if (!t) {
        if (String(raw ?? '').trim()) warnings.push(`Skipped invalid ${platform} handle: ${String(raw).slice(0, 80)}`);
        continue;
      }
      if (seen.has(t.handle)) continue;
      if (seen.size >= MAX_HANDLES_PER_PLATFORM) {
        warnings.push(`Only the first ${MAX_HANDLES_PER_PLATFORM} ${platform} handles are profiled; skipped ${t.handle}`);
        continue;
      }
      seen.add(t.handle);
      targets.push(t);
    }
  }
  return { targets, warnings };
}

export function clampPostsPerProfile(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.floor(n) : DEFAULT_POSTS_PER_PROFILE;
  return Math.min(MAX_POSTS_PER_PROFILE, Math.max(1, v));
}

// ------------------------------------------------------------------ scraper inputs

/**
 * Input for one scraper run covering every handle of a platform (one run per platform keeps start fees low).
 * Field names verified against each actor's current input schema; see NOTES.md.
 */
export function buildScraperInput(platform: Platform, targets: ProfileTarget[], postsPerProfile: number): Record<string, unknown> {
  if (platform === 'instagram') {
    return {
      directUrls: targets.map(t => t.url),
      resultsType: 'posts',
      resultsLimit: postsPerProfile,
      addParentData: false,
    };
  }
  if (platform === 'tiktok') {
    return {
      profiles: targets.map(t => t.handle),
      resultsPerPage: postsPerProfile,
      profileScrapeSections: ['videos'],
      profileSorting: 'latest',
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadSlideshowImages: false,
      shouldDownloadAvatars: false,
      shouldDownloadMusicCovers: false,
      downloadSubtitlesOptions: 'NEVER_DOWNLOAD_SUBTITLES',
      commentsPerPost: 0,
      maxFollowersPerProfile: 0,
      maxFollowingPerProfile: 0,
    };
  }
  return {
    startUrls: targets.map(t => ({ url: t.url })),
    resultsLimit: postsPerProfile,
    captionText: false,
  };
}

// ------------------------------------------------------------------ normalization

function itemError(it: Dict): string | null {
  const e = it.error ?? it.errorDescription ?? it.errorCode;
  if (e === undefined || e === null || e === '' || e === false) return null;
  const desc = str(it.errorDescription);
  const code = typeof e === 'string' ? e : JSON.stringify(e);
  return desc && desc !== code ? `${code}: ${desc}` : code;
}

/** Strips Instagram's auto prefix ("Photo by X on October 23, 2026.") and keeps the description. */
function cleanInstagramAlt(alt: string): string {
  return alt
    .replace(/^(Photo|Video)( shared)? by .+? on [A-Z][a-z]+ \d{1,2}, \d{4}\.?\s*/i, '')
    .replace(/^(Photo|Video)( shared)? by .+?(\.|$)\s*/i, '')
    .trim();
}

function normalizeInstagram(it: Dict, handle: string): NormalizedPost {
  const text = str(it.caption).trim();
  const type = str(it.type);
  const productType = str(it.productType);
  const mediaType: MediaType =
    type === 'Video' || productType === 'clips' || productType === 'igtv'
      ? 'video'
      : type === 'Sidecar'
        ? 'carousel'
        : type === 'Image'
          ? 'image'
          : 'unknown';
  const hashtags = uniq([...(Array.isArray(it.hashtags) ? it.hashtags.map(cleanHashtag) : []), ...extractHashtags(text)]).filter(Boolean);
  const alt = cleanInstagramAlt(str(it.alt));
  return {
    platform: 'instagram',
    handle,
    text,
    hashtags,
    locationName: str(it.locationName).trim() || null,
    timestamp: toIso(it.timestamp),
    mediaType,
    ...(alt ? { altText: alt } : {}),
  };
}

function normalizeTiktok(it: Dict, handle: string): NormalizedPost {
  const text = str(it.text).trim();
  const loc = isDict(it.locationMeta) ? it.locationMeta : null;
  const poi = isDict(it.poi) ? it.poi : null;
  const locationName =
    (loc && (str(loc.locationName) || str(loc.address) || str(loc.city))) || (poi && (str(poi.name) || str(poi.address))) || '';
  const hashtags = uniq([...(Array.isArray(it.hashtags) ? it.hashtags.map(cleanHashtag) : []), ...extractHashtags(text)]).filter(Boolean);
  return {
    platform: 'tiktok',
    handle,
    text,
    hashtags,
    locationName: locationName.trim() || null,
    timestamp: toIso(it.createTimeISO) ?? toIso(it.createTime),
    mediaType: it.isSlideshow === true ? 'carousel' : 'video',
  };
}

function normalizeFacebook(it: Dict, handle: string): NormalizedPost {
  const text = str(it.text).trim();
  const media = Array.isArray(it.media) ? it.media.filter(isDict) : [];
  const kinds = media.map(m => str(m.__typename).toLowerCase());
  const mediaType: MediaType =
    it.isVideo === true || kinds.some(k => k.includes('video'))
      ? 'video'
      : media.length > 1
        ? 'carousel'
        : media.length === 1
          ? 'image'
          : text
            ? 'text'
            : 'unknown';
  const ocr = media
    .map(m => str(m.ocrText).trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 600);
  return {
    platform: 'facebook',
    handle,
    text,
    hashtags: extractHashtags(text),
    locationName: null, // apify/facebook-posts-scraper exposes no tagged location.
    timestamp: toIso(it.time) ?? toIso(it.timestamp),
    mediaType,
    ...(ocr ? { altText: ocr } : {}),
  };
}

/** Normalizes raw scraper items for one handle. Error items and non-objects are skipped. */
export function normalizePosts(platform: Platform, handle: string, rawItems: readonly unknown[]): NormalizedPost[] {
  const out: NormalizedPost[] = [];
  for (const raw of rawItems) {
    if (!isDict(raw) || itemError(raw)) continue;
    const post =
      platform === 'instagram' ? normalizeInstagram(raw, handle) : platform === 'tiktok' ? normalizeTiktok(raw, handle) : normalizeFacebook(raw, handle);
    if (!post.text && !post.timestamp && post.hashtags.length === 0) continue;
    out.push(post);
  }
  return out;
}

function handleOfItem(platform: Platform, it: Dict): string | null {
  const candidates: unknown[] =
    platform === 'instagram'
      ? [it.inputUrl, it.ownerUsername, it.username]
      : platform === 'tiktok'
        ? [it.input, isDict(it.authorMeta) ? it.authorMeta.name : undefined]
        : [it.inputUrl, it.facebookUrl, isDict(it.pageName) ? undefined : it.pageName];
  for (const c of candidates) {
    if (typeof c !== 'string' || !c) continue;
    const t = parseTarget(platform, c);
    if (t) return t.handle;
  }
  return null;
}

/** Groups a platform's raw items by target handle and collects per-handle error messages. */
export function splitByHandle(
  platform: Platform,
  targets: readonly ProfileTarget[],
  rawItems: readonly unknown[]
): Map<string, { items: Dict[]; errors: string[] }> {
  const groups = new Map<string, { items: Dict[]; errors: string[] }>();
  for (const t of targets) groups.set(t.handle, { items: [], errors: [] });
  const only = targets.length === 1 ? targets[0].handle : null;
  for (const raw of rawItems) {
    if (!isDict(raw)) continue;
    const h = handleOfItem(platform, raw);
    const key = h && groups.has(h) ? h : only;
    if (!key) continue;
    const g = groups.get(key)!;
    const err = itemError(raw);
    if (err) g.errors.push(err);
    else g.items.push(raw);
  }
  return groups;
}

// ------------------------------------------------------------------ enrichment

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface CompiledRule {
  rule: InterestRule;
  wordRe: RegExp | null;
  stems: { stem: string; exact: boolean }[];
  emoji: string[];
}

/** Simple English plural: "taco" -> "tacos", "lunch" -> "lunches" (never "improv" -> "improves"). */
function pluralSuffix(word: string): string {
  if (/(s|x|z|ch|sh)$/.test(word)) return '(?:es)?';
  return /[a-z]$/.test(word) ? 's?' : '';
}

function compileRule(rule: InterestRule): CompiledRule {
  const alts = rule.words
    .map(w => w.toLowerCase())
    .sort((a, b) => b.length - a.length)
    .map(w => escapeRe(w).replace(/ /g, '[\\s-]?') + pluralSuffix(w));
  const wordRe = alts.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts.join('|')})(?![\\p{L}\\p{N}])`, 'giu') : null;
  // Stems match hashtags by substring ("ramen" in "ramenlover"); a leading "=" or a stem under 4 chars means exact.
  const stems = rule.stems.map(s => {
    const stem = s.replace(/^=/, '').toLowerCase();
    return { stem, exact: s.startsWith('=') || stem.length < 4 };
  });
  return { rule, wordRe, stems, emoji: rule.emoji.map(e => e.replace(/️/g, '')) };
}

const COMPILED_RULES: readonly CompiledRule[] = INTEREST_RULES.map(compileRule);

/** Hashtag pieces left after cutting out known collision words ("sacramentokings" -> ["kings"]). */
function hashtagPieces(h: string): string[] {
  let parts = [h];
  for (const c of HASHTAG_COLLISIONS) parts = parts.flatMap(p => p.split(c));
  return parts.filter(Boolean);
}

/**
 * A stem matches a hashtag exactly, as a prefix ("ramenlover") or suffix ("bestramen"); only stems of
 * 6+ chars may match mid-word ("nycwildlifephotos"), which keeps "ramen" out of "sacramento".
 */
function stemMatches(stem: string, exact: boolean, hashtag: string): boolean {
  if (exact) return hashtag === stem;
  return hashtagPieces(hashtag).some(p => p.startsWith(stem) || p.endsWith(stem) || (stem.length >= 6 && p.includes(stem)));
}

function matchPost(c: CompiledRule, haystack: string, hashtags: readonly string[]): string[] {
  const terms: string[] = [];
  if (c.wordRe) {
    for (const m of haystack.matchAll(c.wordRe)) terms.push(m[0].toLowerCase());
  }
  for (const h of hashtags) {
    if (c.stems.some(({ stem, exact }) => stemMatches(stem, exact, h))) terms.push(`#${h}`);
  }
  for (const e of c.emoji) if (haystack.includes(e)) terms.push(e);
  return uniq(terms);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function localHour(iso: string, fmt: Intl.DateTimeFormat): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const hour = fmt.formatToParts(d).find(p => p.type === 'hour')?.value;
  const h = hour === undefined ? NaN : Number(hour) % 24;
  return Number.isFinite(h) ? h : null;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function hourFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' });
}

export function postingBucket(hour: number): keyof PostingHours {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'lateNight';
}

export function postingPatternFrom(hours: PostingHours): PostingPattern {
  const n = hours.morning + hours.afternoon + hours.evening + hours.lateNight;
  if (n < 4) return 'unknown';
  if (hours.lateNight / n >= 0.4 && hours.lateNight > hours.morning) return 'night-owl';
  if (hours.morning / n >= 0.4 && hours.morning > hours.lateNight) return 'morning-person';
  return 'mixed';
}

function topCounts(values: Iterable<string>, limit: number): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

export interface EnrichOptions {
  timeZone?: string;
  topHashtags?: number;
  topLocations?: number;
}

/** Deterministic enrichment: top hashtags and locations, keyword interests, posting-time pattern. */
export function enrich(posts: readonly NormalizedPost[], opts: EnrichOptions = {}): Enrichment {
  const timeZone = opts.timeZone && isValidTimeZone(opts.timeZone) ? opts.timeZone : DEFAULT_TIME_ZONE;
  const postCount = posts.length;

  const topHashtags = topCounts(
    posts.flatMap(p => p.hashtags.filter(h => !GENERIC_HASHTAGS.has(h) && !isSensitiveText(h))),
    opts.topHashtags ?? 10
  ).map(({ value, count }) => ({ tag: value, count }));
  const topLocations = topCounts(
    posts.map(p => p.locationName).filter((l): l is string => !!l && !isSensitiveText(l)),
    opts.topLocations ?? 5
  ).map(({ value, count }) => ({ name: value, count }));

  // Interests: count posts (not keyword hits) so one keyword-stuffed post can't dominate.
  const hits = new Map<string, { evidence: number[]; terms: string[] }>();
  posts.forEach((p, i) => {
    const haystack = `${p.text}\n${p.altText ?? ''}`.toLowerCase().replace(/️/g, '');
    for (const c of COMPILED_RULES) {
      const terms = matchPost(c, haystack, p.hashtags);
      if (terms.length === 0) continue;
      const ids = c.rule.parent ? [c.rule.id, c.rule.parent] : [c.rule.id];
      for (const id of ids) {
        const h = hits.get(id) ?? { evidence: [], terms: [] };
        if (h.evidence[h.evidence.length - 1] !== i) h.evidence.push(i);
        h.terms.push(...terms);
        hits.set(id, h);
      }
    }
  });
  const toHit = (rule: InterestRule): InterestHit | null => {
    const h = hits.get(rule.id);
    if (!h || postCount === 0) return null;
    return {
      interest: rule.id,
      parent: rule.parent,
      matchedPosts: h.evidence.length,
      share: round2(h.evidence.length / postCount),
      evidencePostIndices: h.evidence.slice(0, MAX_EVIDENCE_INDICES),
      matchedTerms: topCounts(h.terms, 5).map(t => t.value),
    };
  };
  const byShare = (a: InterestHit, b: InterestHit) => b.matchedPosts - a.matchedPosts || a.interest.localeCompare(b.interest);
  const interests = INTEREST_RULES.filter(r => !r.parent).map(toHit).filter((x): x is InterestHit => !!x).sort(byShare);
  const subInterests = INTEREST_RULES.filter(r => r.parent).map(toHit).filter((x): x is InterestHit => !!x).sort(byShare);

  // Posting-time pattern in the requested time zone.
  const fmt = hourFormatter(timeZone);
  const postingHours: PostingHours = { morning: 0, afternoon: 0, evening: 0, lateNight: 0 };
  const stamps: string[] = [];
  for (const p of posts) {
    if (!p.timestamp) continue;
    const h = localHour(p.timestamp, fmt);
    if (h === null) continue;
    postingHours[postingBucket(h)]++;
    stamps.push(p.timestamp);
  }
  stamps.sort();

  return {
    postCount,
    topHashtags,
    topLocations,
    interests,
    subInterests,
    postingPattern: postingPatternFrom(postingHours),
    postingHours,
    timeZone,
    firstPostAt: stamps[0] ?? null,
    lastPostAt: stamps[stamps.length - 1] ?? null,
  };
}

// ------------------------------------------------------------------ vibe tags

const RULE_BY_ID = new Map(INTEREST_RULES.map(r => [r.id, r]));

/** Posts whose local hour falls in a bucket (evidence for night-owl / morning-person). */
function postsInBucket(posts: readonly NormalizedPost[], timeZone: string, bucket: keyof PostingHours): number[] {
  const fmt = hourFormatter(timeZone);
  const out: number[] = [];
  posts.forEach((p, i) => {
    if (!p.timestamp) return;
    const h = localHour(p.timestamp, fmt);
    if (h !== null && postingBucket(h) === bucket) out.push(i);
  });
  return out;
}

function formatTerms(terms: readonly string[]): string {
  return terms.slice(0, 3).join(', ');
}

/**
 * Deterministic vibe tags from the enrichment (used when Muse is off or fails).
 * Specific sub-interests win over their parents; a parent is kept only when it has extra evidence.
 * Pass `posts` to get evidence indices for posting-pattern tags.
 */
export function deterministicVibeTags(enrichment: Enrichment, posts: readonly NormalizedPost[] = []): VibeTag[] {
  const n = enrichment.postCount;
  if (n === 0) return [];
  const minPosts = n <= 5 ? 1 : 2;
  const qualifies = (h: InterestHit) => h.matchedPosts >= minPosts && h.matchedPosts / n >= 0.1;

  const patternTag =
    enrichment.postingPattern === 'night-owl' || enrichment.postingPattern === 'morning-person' ? enrichment.postingPattern : null;
  const budget = MAX_VIBE_TAGS - (patternTag ? 1 : 0);

  const candidates = [...enrichment.subInterests, ...enrichment.interests]
    .filter(qualifies)
    .sort((a, b) => b.matchedPosts - a.matchedPosts || (a.parent ? -1 : 0) - (b.parent ? -1 : 0) || a.interest.localeCompare(b.interest));

  const picked: InterestHit[] = [];
  for (const h of candidates) {
    if (picked.length >= budget) break;
    if (!h.parent) {
      // Skip a parent whose evidence is already explained by a picked, equally strong sub-interest.
      const bestSub = Math.max(0, ...picked.filter(p => p.parent === h.interest).map(p => p.matchedPosts));
      if (bestSub >= h.matchedPosts) continue;
    }
    picked.push(h);
  }

  const tags: VibeTag[] = picked.map(h => {
    const rule = RULE_BY_ID.get(h.interest)!;
    const terms = formatTerms(h.matchedTerms);
    return {
      tag: rule.tag,
      reason: `${h.matchedPosts} of ${n} posts mention ${rule.label}${terms ? ` (${terms})` : ''}`,
      evidencePostIndices: h.evidencePostIndices,
    };
  });

  if (patternTag) {
    const bucket = patternTag === 'night-owl' ? 'lateNight' : 'morning';
    const count = enrichment.postingHours[bucket];
    const timed = Object.values(enrichment.postingHours).reduce((a, b) => a + b, 0);
    const window = patternTag === 'night-owl' ? 'between 9pm and 5am' : 'between 5am and 11am';
    tags.push({
      tag: patternTag,
      reason: `${count} of ${timed} posts were published ${window} (${enrichment.timeZone})`,
      evidencePostIndices: postsInBucket(posts, enrichment.timeZone, bucket).slice(0, MAX_EVIDENCE_INDICES),
    });
  }
  return sanitizeVibeTags(tags, posts.length || n);
}

/**
 * Normalizes and filters tags from any source: kebab-case, no sensitive traits, no duplicates,
 * valid evidence indices only, at most MAX_VIBE_TAGS. `requireEvidence` drops tags citing no post.
 */
export function sanitizeVibeTags(tags: readonly VibeTag[], postCount: number, opts: { requireEvidence?: boolean } = {}): VibeTag[] {
  const out: VibeTag[] = [];
  const seen = new Set<string>();
  for (const t of tags) {
    const tag = toKebab(String(t.tag ?? ''));
    if (!tag || seen.has(tag) || isSensitiveText(tag)) continue;
    const evidence = uniq(
      (Array.isArray(t.evidencePostIndices) ? t.evidencePostIndices : []).filter(
        (i): i is number => Number.isInteger(i) && i >= 0 && i < postCount
      )
    )
      .sort((a, b) => a - b)
      .slice(0, MAX_EVIDENCE_INDICES);
    if (opts.requireEvidence && evidence.length === 0) continue;
    const reason = String(t.reason ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
    seen.add(tag);
    out.push({ tag, reason, evidencePostIndices: evidence });
    if (out.length >= MAX_VIBE_TAGS) break;
  }
  return out;
}

async function vibeTagsFor(
  posts: NormalizedPost[],
  enrichment: Enrichment,
  deps: ProfilerDeps,
  label: string
): Promise<{ vibeTags: VibeTag[]; vibeTagsSource: VibeTagSource }> {
  if (posts.length > 0 && deps.muse) {
    try {
      const tags = await deps.muse(posts, enrichment);
      const clean = tags ? sanitizeVibeTags(tags, posts.length, { requireEvidence: true }) : [];
      if (clean.length > 0) return { vibeTags: clean, vibeTagsSource: 'muse' };
      deps.log?.('warn', 'Muse returned no usable tags, using heuristic tags', { profile: label });
    } catch (err) {
      deps.log?.('warn', 'Muse failed, using heuristic tags', { profile: label, error: String(err).slice(0, 200) });
    }
  }
  return { vibeTags: deterministicVibeTags(enrichment, posts), vibeTagsSource: 'heuristic' };
}

// ------------------------------------------------------------------ orchestration

/**
 * Scrapes every handle (one scraper run per platform, in parallel), normalizes and enriches posts,
 * and derives vibe tags per handle plus a merged profile across all handles.
 * A failing platform never fails the whole run: its handles get status "error".
 */
export async function profileHandles(input: ProfilerInput, deps: ProfilerDeps): Promise<ProfilerResult> {
  const { targets, warnings } = resolveTargets(input);
  const postsPerProfile = clampPostsPerProfile(input.postsPerProfile);
  const timeZone = input.timeZone && isValidTimeZone(input.timeZone) ? input.timeZone : DEFAULT_TIME_ZONE;
  if (input.timeZone && timeZone !== input.timeZone) warnings.push(`Unknown time zone "${input.timeZone}", using UTC`);

  const byPlatform = new Map<Platform, ProfileTarget[]>();
  for (const t of targets) byPlatform.set(t.platform, [...(byPlatform.get(t.platform) ?? []), t]);

  const platformResults = await Promise.all(
    [...byPlatform.entries()].map(async ([platform, list]) => {
      const actorId = SCRAPER_ACTORS[platform];
      const started = Date.now();
      try {
        const items = await deps.callActor(actorId, buildScraperInput(platform, list, postsPerProfile), {
          maxItems: postsPerProfile * list.length,
        });
        deps.log?.('info', 'scraper finished', { actorId, handles: list.length, items: items.length, ms: Date.now() - started });
        return { platform, list, items, error: null as string | null };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        deps.log?.('warn', 'scraper failed', { actorId, error: message.slice(0, 300) });
        warnings.push(`${actorId} failed: ${message.slice(0, 200)}`);
        return { platform, list, items: [] as unknown[], error: message.slice(0, 300) };
      }
    })
  );

  const scraped: { target: ProfileTarget; posts: NormalizedPost[]; error: string | null }[] = [];
  for (const { platform, list, items, error } of platformResults) {
    const groups = splitByHandle(platform, list, items);
    for (const target of list) {
      const g = groups.get(target.handle)!;
      const posts = normalizePosts(platform, target.handle, g.items).slice(0, postsPerProfile);
      const err = error ?? (posts.length === 0 && g.errors.length ? uniq(g.errors).join('; ').slice(0, 300) : null);
      scraped.push({ target, posts, error: err });
    }
  }
  // Keep the caller's platform order: instagram, tiktok, facebook.
  scraped.sort((a, b) => PLATFORMS.indexOf(a.target.platform) - PLATFORMS.indexOf(b.target.platform));

  const allPosts = scraped.flatMap(s => s.posts);
  const mergedEnrichment = enrich(allPosts, { timeZone });
  const withPosts = scraped.filter(s => s.posts.length > 0);

  const [profiles, mergedTags] = await Promise.all([
    Promise.all(
      scraped.map(async ({ target, posts, error }): Promise<HandleProfile> => {
        const enrichment = enrich(posts, { timeZone });
        const tags = await vibeTagsFor(posts, enrichment, deps, `${target.platform}:${target.handle}`);
        const status: ProfileStatus = posts.length > 0 ? 'ok' : error ? 'error' : 'no-posts';
        return {
          platform: target.platform,
          handle: target.handle,
          profileUrl: target.url,
          status,
          ...(status === 'error' && error ? { error } : {}),
          ...enrichment,
          ...tags,
          tags: tags.vibeTags.map(t => t.tag),
          posts,
        };
      })
    ),
    // With a single productive handle the merged post list equals its list, so its tags are reused below.
    withPosts.length > 1 ? vibeTagsFor(allPosts, mergedEnrichment, deps, 'merged') : Promise.resolve(null),
  ]);

  const single = withPosts.length === 1 ? profiles.find(p => p.posts.length > 0)! : null;
  const merged = mergedTags ?? (single ? { vibeTags: single.vibeTags, vibeTagsSource: single.vibeTagsSource } : { vibeTags: [], vibeTagsSource: 'heuristic' as const });

  for (const p of profiles) {
    if (p.status === 'no-posts') warnings.push(`No public posts found for ${p.platform}:${p.handle}`);
  }

  return {
    profiles,
    merged: {
      handles: profiles.map(p => ({ platform: p.platform, handle: p.handle, status: p.status, postCount: p.postCount })),
      ...mergedEnrichment,
      ...merged,
      tags: merged.vibeTags.map(t => t.tag),
      warnings,
      posts: allPosts,
    },
    warnings,
  };
}

// ------------------------------------------------------------------ privacy-safe views

export type PublicHandleProfile = Omit<HandleProfile, 'posts'> & { posts?: NormalizedPost[] };
export type PublicMergedProfile = Omit<MergedProfile, 'posts'> & { posts?: NormalizedPost[] };

/** Drops raw posts unless explicitly requested (the default dataset item and OUTPUT shape). */
export function toPublicProfile(p: HandleProfile, includePosts = false): PublicHandleProfile {
  const { posts, ...rest } = p;
  return includePosts ? { ...rest, posts } : rest;
}

export function toPublicMerged(m: MergedProfile, includePosts = false): PublicMergedProfile {
  const { posts, ...rest } = m;
  return includePosts ? { ...rest, posts } : rest;
}
