import { ApifyClient } from 'apify-client';
import type { MenuPage } from '@hmo/shared';
import type { Config } from '../config';
import { log } from '../log';

export interface MenuSite {
  key: string;
  /** The venue's own homepage. */
  url: string;
}

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};

/** A usable http(s) homepage, or '' (Google sometimes lists Instagram or a booking page instead). */
export function siteUrl(raw: string | undefined): string {
  if (!raw) return '';
  try {
    const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    if (!/^https?:$/.test(u.protocol)) return '';
    if (/(^|\.)(instagram|facebook|yelp|tiktok|twitter|x|linktr|opentable|resy|toasttab|doordash|ubereats|grubhub)\./i.test(`.${u.hostname}`)) return '';
    return `${u.protocol}//${u.host}/`;
  } catch {
    return '';
  }
}

/**
 * One Apify Website Content Crawler run over every finalist's own site: the homepage, a guessed /menu
 * page, and one level of links. Returns the crawled pages per site key, or null if the run failed.
 */
export async function crawlMenus(cfg: Config, sites: readonly MenuSite[], timeoutMs: number): Promise<Map<string, MenuPage[]> | null> {
  if (!cfg.apifyEnabled || sites.length === 0) return null;
  const client = new ApifyClient({ token: cfg.apifyToken });
  const input = {
    startUrls: sites.flatMap(s => [{ url: s.url }, { url: new URL('menu', s.url).toString() }]),
    crawlerType: 'cheerio',
    maxCrawlDepth: 1,
    maxCrawlPages: sites.length * 6,
    maxConcurrency: 10,
    removeCookieWarnings: true,
    saveHtml: false,
    saveMarkdown: false,
    saveFiles: false,
    saveScreenshots: false,
  };
  const started = Date.now();
  try {
    const run = await client.actor('apify/website-content-crawler').start(input);
    log.info('menu crawl started', { runId: run.id, sites: sites.length });
    let status = run.status;
    while (Date.now() - started < timeoutMs) {
      await new Promise(r => setTimeout(r, 3000));
      status = (await client.run(run.id).get())?.status ?? status;
      if (['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) break;
    }
    const { items } = await client.dataset(run.defaultDatasetId).listItems({ clean: true });
    if (status !== 'SUCCEEDED') void client.run(run.id).abort().catch(() => undefined);
    const out = new Map<string, MenuPage[]>(sites.map(s => [s.key, []]));
    for (const item of items as { url?: string; text?: string; crawl?: { loadedUrl?: string } }[]) {
      const url = item.crawl?.loadedUrl || item.url || '';
      const text = item.text ?? '';
      const site = sites.find(s => host(s.url) && host(s.url) === host(url));
      if (site && text) out.get(site.key)!.push({ url, text });
    }
    log.info('menu crawl done', { status, pages: items.length, seconds: Math.round((Date.now() - started) / 1000) });
    return out;
  } catch (err) {
    log.warn('menu crawl failed', { err: String(err).slice(0, 200) });
    return null;
  }
}
