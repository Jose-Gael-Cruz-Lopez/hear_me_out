// Scores "hidden gems" for a cached places file by asking the rest of the internet about them.
//
// Runs these Apify actors in parallel (each can be overridden with an env var, see web/.env.example):
//   reddit     trudax~reddit-scraper-lite          "<area> hidden gem / underrated / hole in the wall" threads
//   instagram  apify~instagram-hashtag-scraper     #sfhiddengems #sffoodie #sfpopup …
//   tiktok     clockworks~tiktok-scraper           same hashtags
//   press      apify~google-search-scraper  →  apify~website-content-crawler   the big "best of" lists
//   events     $APIFY_EVENTS_ACTOR (optional)       any event-listing actor
// then matches every post to the Google Maps places, computes a Gem Score with reasons + quotes,
// and writes them back into web/data/places/<slug>.json (the file the game reads).
//
//   node scripts/fetch-places.ts --reviews 5          # first: places (+ review text) from Google Maps
//   node scripts/fetch-gems.ts                        # Palace of Fine Arts / San Francisco / #sf…
//   node scripts/fetch-gems.ts --slug berkeley --city Berkeley --tag berkeley [--hood Southside]
//   node scripts/fetch-gems.ts --sources reddit,press  # only some sources
//   node scripts/fetch-gems.ts --from-raw              # re-score from the saved raw data, no scraping
//
// Raw actor output is saved to web/data/gems-raw/<slug>/ so scoring can be re-run offline.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PlacesFile } from '../web/lib/places/normalize.ts';
import type { GemSource, Mention, MentionSource } from '../web/lib/gems/types.ts';
import {
  actorIds, instagramInput, NORMALIZERS, pressCrawlInput, pressSearchInput, pressUrls, redditInput, tiktokInput, type Area,
} from '../web/lib/gems/sources.ts';
import { matchMentions, normName } from '../web/lib/gems/match.ts';
import { findHappenings, scoreGem } from '../web/lib/gems/score.ts';
import { arg, flag, ROOT, runActor } from './apify.ts';

const slug = arg('slug', 'palace-of-fine-arts');
const area: Area = {
  city: arg('city', 'San Francisco'),
  hood: arg('hood', slug === 'palace-of-fine-arts' ? 'Marina' : '') || undefined,
  tag: arg('tag', 'sf'),
};
const perSource = Number(arg('limit', '60'));
const fromRaw = flag('from-raw');
const ids = actorIds(process.env);
const wanted = new Set(
  arg('sources', ['reddit', 'instagram', 'tiktok', 'press', ids.events ? 'events' : ''].filter(Boolean).join(',')).split(',')
);

const placesPath = join(ROOT, 'web/data/places', `${slug}.json`);
if (!existsSync(placesPath)) {
  console.error(`No ${placesPath}. Run scripts/fetch-places.ts first (with --slug ${slug}).`);
  process.exit(1);
}
const file = JSON.parse(readFileSync(placesPath, 'utf8')) as PlacesFile;
const rawDir = join(ROOT, 'web/data/gems-raw', slug);
mkdirSync(rawDir, { recursive: true });

type Job = { source: MentionSource; actor: string; run: () => Promise<Record<string, unknown>[]> };

const jobs: Job[] = [
  { source: 'reddit', actor: ids.reddit, run: async () => (await runActor(ids.reddit, redditInput(area, perSource * 2), 'reddit')).items },
  { source: 'instagram', actor: ids.instagram, run: async () => (await runActor(ids.instagram, instagramInput(area, Math.ceil(perSource / 3)), 'instagram')).items },
  { source: 'tiktok', actor: ids.tiktok, run: async () => (await runActor(ids.tiktok, tiktokInput(area, Math.ceil(perSource / 3)), 'tiktok')).items },
  {
    source: 'press',
    actor: `${ids.search} → ${ids.crawler}`,
    run: async () => {
      const search = await runActor(ids.search, pressSearchInput(area), 'press/search');
      const urls = pressUrls(search.items, 12);
      console.log(`[press] reading ${urls.length} "best of" pages`);
      return urls.length ? (await runActor(ids.crawler, pressCrawlInput(urls), 'press/crawl')).items : [];
    },
  },
];
if (ids.events) {
  const input = process.env.APIFY_EVENTS_INPUT ? JSON.parse(process.env.APIFY_EVENTS_INPUT) : { query: `events ${area.city}`, maxItems: perSource };
  jobs.push({ source: 'events', actor: ids.events, run: async () => (await runActor(ids.events, input, 'events')).items });
}

const summary: NonNullable<PlacesFile['gemSources']> = [];
const mentions: Mention[] = [];

await Promise.all(
  jobs
    .filter(j => wanted.has(j.source))
    .map(async j => {
      const rawPath = join(rawDir, `${j.source}.json`);
      try {
        let items: Record<string, unknown>[];
        if (fromRaw) {
          if (!existsSync(rawPath)) throw new Error('no saved raw data');
          items = JSON.parse(readFileSync(rawPath, 'utf8'));
        } else {
          items = await j.run();
          writeFileSync(rawPath, JSON.stringify(items));
        }
        const normalized = items.map(i => NORMALIZERS[j.source](i)).filter((m): m is Mention => !!m);
        mentions.push(...normalized);
        summary.push({ source: j.source, actor: j.actor, items: normalized.length });
      } catch (err) {
        // One source failing (actor renamed, rate limit, no credits) shouldn't sink the others.
        console.warn(`[${j.source}] skipped: ${(err as Error).message}`);
        summary.push({ source: j.source, actor: j.actor, items: 0, error: (err as Error).message.slice(0, 200) });
      }
    })
);

const press = mentions.filter(m => m.source === 'press');
const pressText = press.map(m => normName(m.text)).join(' ');
const social = mentions.filter(m => m.source !== 'press');
const matched = matchMentions(file.places, social);
const matchedUrls = new Set([...matched.values()].flat().map(m => m.mention.url));

for (const place of file.places) {
  place.gem = scoreGem(place, matched.get(place.id) ?? [], pressText);
}
const withReviews = file.places.filter(p => p.reviewTexts?.length).length;
summary.push({ source: 'maps' as GemSource, actor: 'compass~crawler-google-places', items: withReviews });

file.gemSources = summary;
file.gemsAt = new Date().toISOString();
file.happenings = findHappenings(social, matchedUrls);
writeFileSync(placesPath, JSON.stringify(file, null, 1));

const top = [...file.places].sort((a, b) => (b.gem?.score ?? 0) - (a.gem?.score ?? 0)).slice(0, 12);
console.log(`\nSources: ${summary.map(s => `${s.source} ${s.error ? '✗' : s.items}`).join(' · ')}`);
console.log(`Matched ${matchedUrls.size} posts to ${matched.size} places. ${file.happenings.length} pop-ups/happenings found.\n`);
for (const p of top) console.log(`${String(p.gem!.score).padStart(3)}  ${p.name}  —  ${p.gem!.reasons.slice(0, 2).join('; ')}`);
console.log(`\nSaved to ${placesPath}`);
