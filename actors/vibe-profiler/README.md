# Vibe Profiler: turn public social posts into interest & taste tags

**Vibe Profiler** reads the recent public posts of your own Instagram, TikTok and Facebook accounts and turns them into a small, explainable taste profile: top hashtags, tagged places, interests (food, nightlife, outdoors, gaming, film, music, fitness, arts, sports, travel), specific tastes (ramen, tacos, coffee, dessert, spicy food, board games, live music...), whether you post like a **morning person** or a **night owl**, and up to **8 vibe tags**, each with a one-line reason and the posts it came from.

It is built for consent-first personalization: group-outing planners, "what should we do tonight?" apps, onboarding flows that skip the 20-question survey, or simply seeing what your feed says about you. It was made for Hear Me Out, a party game that turns group indecision into a plan.

- Three platforms in one run (scrapers run in parallel)
- Deterministic and explainable by default: every tag cites post indices
- Optional AI tags with **Muse Spark** (Meta Model API), with automatic fallback
- Privacy by default: no raw post text in the output, scraper datasets deleted after use, no sensitive traits ever inferred
- Cheap: 256 MB of memory, one scraper run per platform, hard per-post limits

> **Only profile accounts that are yours** (or that you are allowed to analyze, such as a brand page you manage) and that you have consented to profile. Vibe Profiler works on public posts only and never reads private messages.

## How it works

1. **Validate handles.** Accepts usernames, `@handles` or profile URLs; dedupes; up to 10 per platform.
2. **Scrape in parallel**, one run per platform, capped at `postsPerProfile` posts per handle:
   - Instagram: [`apify/instagram-scraper`](https://apify.com/apify/instagram-scraper) (posts)
   - TikTok: [`clockworks/tiktok-scraper`](https://apify.com/clockworks/tiktok-scraper) (profile videos, no downloads)
   - Facebook: [`apify/facebook-posts-scraper`](https://apify.com/apify/facebook-posts-scraper) (public pages)
3. **Normalize** every post to `{ platform, handle, text, hashtags, locationName, timestamp, mediaType }`.
4. **Enrich deterministically**: top hashtags (generic ones like `#fyp` dropped), top tagged places, keyword + hashtag + emoji matching against an interest dictionary (counted per post, so one keyword-stuffed caption can't dominate), and the posting-time pattern in your time zone.
5. **Tag**: with a Muse API key, Muse Spark writes up to 8 kebab-case tags with evidence post indices (validated, retried once, sanitized). Without a key, or if Muse fails, tags come from the heuristics.
6. **Clean up**: the scraper runs' default datasets and key-value stores are deleted.
7. **Output** one dataset item per handle and a merged profile in the `OUTPUT` record.

## Input

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `instagramHandles` | string[] | | Usernames or profile URLs, e.g. `natgeo` |
| `tiktokHandles` | string[] | | Usernames or profile URLs, e.g. `nba` |
| `facebookPageUrls` | string[] | | Public page URLs, e.g. `https://www.facebook.com/nasa` |
| `postsPerProfile` | integer | `12` | Recent posts per handle (1-30) |
| `timeZone` | string | `UTC` | IANA zone for the posting pattern, e.g. `America/Los_Angeles` |
| `includePosts` | boolean | `false` | Also store normalized posts (with text) in the output |
| `deleteScrapedData` | boolean | `true` | Delete the scraper runs' datasets after deriving tags |
| `museApiKey` | secret string | | Meta Model API key for AI tags (optional) |
| `museModel` | string | `muse-spark-1.3` | Muse Spark model id |

```json
{
  "instagramHandles": ["natgeo"],
  "tiktokHandles": ["nba"],
  "facebookPageUrls": ["https://www.facebook.com/nasa"],
  "postsPerProfile": 6,
  "timeZone": "America/Los_Angeles"
}
```

## Output

### Dataset: one item per handle

Real output for `tiktok:nba` from the input above (heuristic tags, lists trimmed):

```json
{
  "platform": "tiktok",
  "handle": "nba",
  "profileUrl": "https://www.tiktok.com/@nba",
  "status": "ok",
  "postCount": 6,
  "topHashtags": [{ "tag": "basketball", "count": 6 }, { "tag": "nba", "count": 6 }],
  "topLocations": [],
  "interests": [
    {
      "interest": "sports",
      "parent": null,
      "matchedPosts": 6,
      "share": 1,
      "evidencePostIndices": [0, 1, 2, 3, 4, 5],
      "matchedTerms": ["#basketball", "#nba", "basketball", "nba"]
    }
  ],
  "subInterests": [],
  "postingPattern": "night-owl",
  "postingHours": { "morning": 0, "afternoon": 0, "evening": 3, "lateNight": 3 },
  "timeZone": "America/Los_Angeles",
  "firstPostAt": "2026-10-14T00:53:48.000Z",
  "lastPostAt": "2026-10-24T06:45:35.000Z",
  "vibeTags": [
    { "tag": "sports-fan", "reason": "6 of 6 posts mention sports (#basketball, #nba, basketball)", "evidencePostIndices": [0, 1, 2, 3, 4, 5] },
    { "tag": "night-owl", "reason": "3 of 6 posts were published between 9pm and 5am (America/Los_Angeles)", "evidencePostIndices": [3, 4, 5] }
  ],
  "vibeTagsSource": "heuristic",
  "tags": ["sports-fan", "night-owl"]
}
```

`status` is `ok`, `no-posts` (public account with nothing returned) or `error` (with an `error` message; other platforms still complete). `vibeTagsSource` is `muse` or `heuristic`. With `includePosts: true` the item also carries `posts`, and `evidencePostIndices` index into that list.

### `OUTPUT` record: the merged profile

The same fields computed over all handles together, plus `handles`, `warnings`, `generatedAt` and a `privacy` block. Merged evidence indices point into the concatenation of every handle's posts in input order (Instagram, then TikTok, then Facebook). Trimmed real output:

```json
{
  "handles": [
    { "platform": "instagram", "handle": "natgeo", "status": "ok", "postCount": 6 },
    { "platform": "tiktok", "handle": "nba", "status": "ok", "postCount": 6 },
    { "platform": "facebook", "handle": "nasa", "status": "ok", "postCount": 6 }
  ],
  "postCount": 18,
  "tags": ["outdoorsy", "sports-fan", "wildlife", "traveler", "beach-days"],
  "vibeTags": [
    { "tag": "outdoorsy", "reason": "6 of 18 posts mention the outdoors (🏖, animal, beach)", "evidencePostIndices": [0, 1, 2, 4, 5, 13] },
    { "tag": "wildlife", "reason": "4 of 18 posts mention wildlife (animal, #photoark, conservation)", "evidencePostIndices": [0, 1, 2, 5] }
  ],
  "vibeTagsSource": "heuristic",
  "postingPattern": "mixed",
  "postingHours": { "morning": 4, "afternoon": 7, "evening": 3, "lateNight": 4 },
  "timeZone": "America/Los_Angeles",
  "warnings": [],
  "privacy": { "rawPostTextStored": false, "scraperDatasetsDeleted": true }
}
```

### Interests and tags

| Interest (tag) | Specific tastes (tag = name unless noted) |
| --- | --- |
| food (`foodie`) | ramen, tacos, sushi, pizza, burgers, bbq, coffee, boba, dessert, spicy-food, brunch |
| nightlife (`nightlife`) | cocktails |
| outdoors (`outdoorsy`) | hiking, beach (`beach-days`), wildlife |
| gaming (`gamer`) | board-games, video-games |
| film (`movie-buff`) | anime |
| music (`music-lover`) | live-music, karaoke |
| fitness (`fitness`) | running, yoga, climbing |
| arts (`arts-and-culture`) | museums, theater, comedy (`comedy-shows`) |
| sports (`sports-fan`) | bowling |
| travel (`traveler`) | |

Posting pattern: `night-owl` when at least 40% of posts are published 21:00-05:00 local time (and more than in the morning), `morning-person` for 05:00-11:00, otherwise `mixed`; `unknown` with fewer than 4 dated posts. A heuristic tag needs at least 2 matching posts (1 for profiles with 5 posts or fewer) and 10% of posts. A specific taste replaces its parent when it explains all of the parent's posts.

## AI tags with Muse Spark (optional)

Add your Meta Model API key as `museApiKey` (stored as a secret input). Vibe Profiler then calls Muse Spark (`POST https://api.meta.ai/v1/chat/completions`, OpenAI-compatible) once per handle and once for the merged profile, with a JSON-schema response format, low reasoning effort and a 25 s timeout. The model gets indexed posts (text up to 300 characters, hashtags, place, media type, local hour) plus the deterministic signals, and must cite post indices for every tag. Replies are validated with zod, retried once with the validation error, sanitized (kebab-case, at most 8 tags, valid indices only), and replaced by the heuristic tags on any failure.

## Privacy

- **Consent first.** Run it only on accounts that are yours, or that you are allowed to analyze, and that you have agreed to profile. Public posts only; private messages are never read.
- **No raw post text in the output by default.** Dataset items and `OUTPUT` contain counts and derived fields only. `includePosts` is an explicit opt-in for debugging.
- **Scraper data is deleted after use.** After deriving tags, the actor deletes the default dataset and key-value store of every scraper run it started (`client.dataset(run.defaultDatasetId).delete()` and the same for the key-value store), so raw posts do not outlive the run. The scraper runs themselves (status, logs, and their input, which contains the handles) stay in your Apify run history under your account's retention settings; delete them there if you need to. Set `deleteScrapedData: false` to keep the scraper datasets.
- **No sensitive traits.** Tags, top hashtags and top places never include health, religion, sexuality or gender identity, politics, ethnicity, or diet (diet is only what a person states). The interest dictionary has no such categories, Muse is instructed not to infer them, and a deny-list filters every tag, hashtag and place name before output.
- **Less data to the model.** Links and @mentions are stripped from text before it is sent to Muse, and Muse is only called when you provide your own key.

## Cost

You pay the scrapers' per-post prices plus a little compute for this actor (256 MB, usually under a minute). Free-tier prices checked on 2026-10-24 (paid plans are cheaper):

| Scraper | Price | 12 posts |
| --- | --- | --- |
| Instagram (`apify/instagram-scraper`) | $0.0027 per post | ~$0.03 |
| TikTok (`clockworks/tiktok-scraper`) | $0.0037 per video + $0.001 per run | ~$0.05 |
| Facebook (`apify/facebook-posts-scraper`) | $0.005 per post + $0.001 per run | ~$0.06 |

The example input above (6 posts on each platform) cost $0.07 in scraper charges. Each scraper call also gets a pay-per-event charge cap derived from `postsPerProfile`. Muse calls are billed to your Meta account.

## Limits and tips

- Public accounts only. The Facebook scraper supports public pages, not personal profiles.
- Up to 10 handles per platform and 30 posts per handle per run.
- Set `timeZone` to where the person lives; timestamps are UTC, so the posting pattern is meaningless in the wrong zone.
- Brand and media accounts make good test inputs; personal accounts give much more specific tastes.

## Use it as a library

The logic is a pure TypeScript core with no Apify SDK dependency, so a backend can call it directly with any `callActor` implementation:

```ts
import { ApifyClient } from 'apify-client';
import { profileHandles } from 'vibe-profiler';
import { createApifyCallActor } from 'vibe-profiler/apify';
import { createMuseTagger } from 'vibe-profiler/muse';

const callActor = createApifyCallActor(new ApifyClient({ token: process.env.APIFY_TOKEN }));
const muse = process.env.META_API_KEY ? createMuseTagger({ apiKey: process.env.META_API_KEY }) : undefined;
const { profiles, merged } = await profileHandles({ instagramHandles: ['natgeo'], timeZone: 'America/Los_Angeles' }, { callActor, muse });
```

## Development

```bash
pnpm install                                                  # from the monorepo root
npx vitest run --config actors/vibe-profiler/vitest.config.ts # unit tests on recorded fixtures
pnpm --filter vibe-profiler typecheck
cd actors/vibe-profiler && APIFY_TOKEN=... npx apify-cli run --purge --input '{"instagramHandles":["natgeo"],"postsPerProfile":3}'
pnpm --filter vibe-profiler push                              # apify push (needs the Apify CLI and `apify login`)
```

## Is it legal to scrape social media?

Vibe Profiler only reads public posts, and only for accounts you say are your own or that you may analyze. Personal data is protected by the GDPR in the EU and by other laws elsewhere, so do not profile people without a legitimate reason and their consent. If you are unsure, consult a lawyer. See also Apify's post on [the legality of web scraping](https://blog.apify.com/is-web-scraping-legal/).
