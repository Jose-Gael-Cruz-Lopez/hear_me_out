import { ApifyClient } from 'apify-client';
import { profileHandles } from 'vibe-profiler';
import { createApifyCallActor } from 'vibe-profiler/apify';
import { createMuseTagger } from 'vibe-profiler/muse';
import type { Config } from '../config';
import { log } from '../log';

export interface SocialLink {
  platform: string;
  handle: string;
}

/** Only derived signals leave this module: raw posts stay in memory for the duration of the call. */
export interface SocialSummary {
  tags: { tag: string; reason: string }[];
  interests: string[];
  topHashtags: string[];
  postingPattern: string;
  source: 'muse' | 'heuristic';
  postCount: number;
}

/**
 * Run the vibe-profiler core (our Apify actor's logic) on the player's own, consented public handles.
 * The scrapers' datasets are deleted after reading; nothing raw is written to SpacetimeDB.
 */
export async function profileSocial(cfg: Config, links: readonly SocialLink[], timeoutMs = 75_000): Promise<SocialSummary | null> {
  if (!cfg.apifyEnabled || links.length === 0) return null;
  const handles = (p: string) => links.filter(l => l.platform === p).map(l => l.handle.replace(/^@/, ''));
  const input = {
    instagramHandles: handles('instagram'),
    tiktokHandles: handles('tiktok'),
    facebookPageUrls: handles('facebook').map(h => (h.startsWith('http') ? h : `https://www.facebook.com/${h}`)),
    postsPerProfile: 12,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
  const deps = {
    callActor: createApifyCallActor(new ApifyClient({ token: cfg.apifyToken }), { deleteScrapedData: true }),
    muse: cfg.museEnabled ? createMuseTagger({ apiKey: cfg.metaApiKey, model: cfg.museModel, baseURL: cfg.museBaseUrl, reasoningEffort: 'minimal' }) : undefined,
  };
  const started = Date.now();
  try {
    const result = await Promise.race([
      profileHandles(input, deps),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('vibe-profiler timed out')), timeoutMs)),
    ]);
    const m = result.merged;
    log.info('vibe-profiler done', { posts: m.posts.length, tags: m.tags.length, source: m.vibeTagsSource, ms: Date.now() - started });
    if (m.posts.length === 0) return null;
    return {
      tags: m.vibeTags.map(t => ({ tag: t.tag, reason: t.reason })),
      interests: m.interests.map(i => i.interest),
      topHashtags: m.topHashtags.slice(0, 8).map(h => h.tag),
      postingPattern: m.postingPattern,
      source: m.vibeTagsSource,
      postCount: m.posts.length,
    };
  } catch (err) {
    log.warn('vibe-profiler failed', { err: String(err).slice(0, 200) });
    return null;
  }
}
