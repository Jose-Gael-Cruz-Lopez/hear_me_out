// Turns everything the sources said about a place into a Gem Score with plain-language reasons and
// quotable evidence. Fully deterministic: no AI, so it's testable and explainable to judges.
import type { Evidence, GemInfo, GemSource, Mention } from './types';
import { normName, sentenceAround, type Matched } from './match.ts';

const DAY = 86_400_000;

/** Phrases that mean "people recommend this", not just "it exists". */
const RECOMMEND =
  /\b(hidden gem|underrated|must[- ]try|go-to|favou?rite|recommend|obsessed|slaps|worth it|sleeper|locals?\b|best kept secret|so good|hole in the wall|don'?t sleep on)/i;

/** Hangout signals, read from Google reviews and posts. */
export const HANGOUT: { tag: string; re: RegExp }[] = [
  { tag: 'good for talking', re: /\b(quiet|conversation|talk(ed)? for hours|hear each other|catch up|chill vibe|low[- ]key)\b/i },
  { tag: 'cozy', re: /\b(cozy|cosy|intimate|homey|warm vibe)\b/i },
  { tag: 'great for groups', re: /\b(big groups?|large group|our group|group of \d+|for groups|big table|long table)\b/i },
  { tag: 'open late', re: /\b(late[- ]night|open late|after midnight|till (1|2|3) ?am|until (1|2|3) ?am)\b/i },
  { tag: 'stay for hours', re: /\b(stay(ed)? for hours|linger|hang ?out|hung out|spent hours)\b/i },
  { tag: 'games', re: /\b(board games?|trivia|arcade games?|pool table|darts|ping pong|skee)\b/i },
  { tag: 'outdoor seating', re: /\b(patio|outdoor seating|backyard|rooftop|parklet)\b/i },
  { tag: 'live music', re: /\b(live music|open mic|live band|jazz night|dj)\b/i },
  { tag: 'cheap', re: /\b(cheap|affordable|great value|under \$1\d|student budget)\b/i },
];

export interface GemPlaceInput {
  id: string;
  name: string;
  rating: number | null;
  reviews: number;
  mapsUrl: string;
  reviewTexts?: string[];
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * @param matched mentions of this place from Reddit / Instagram / TikTok / events
 * @param pressText all "best of" list text, normalized with normName (used to detect famous places)
 */
export function scoreGem(place: GemPlaceInput, matched: Matched[], pressText: string, now = new Date()): GemInfo {
  let score = 0;
  const reasons: { text: string; weight: number }[] = [];
  const counts: Partial<Record<GemSource, number>> = {};
  for (const m of matched) counts[m.mention.source] = (counts[m.mention.source] ?? 0) + 1;

  // 1. Loved but not mainstream: high rating on few reviews.
  const r = place.rating ?? 0;
  if (r >= 4.5 && place.reviews >= 10 && place.reviews <= 400) {
    const pts = Math.min(30, (r - 4.4) * 40 + (place.reviews <= 150 ? 8 : 3));
    score += pts;
    reasons.push({ text: `${r.toFixed(1)}★ with only ${place.reviews} reviews`, weight: pts });
  } else if (r >= 4.6 && place.reviews > 400) {
    score += 5;
  }

  // 2. Locals recommend it on Reddit.
  const reddit = matched.filter(m => m.mention.source === 'reddit');
  if (reddit.length) {
    const recommended = reddit.filter(m => RECOMMEND.test(m.mention.text)).length;
    const pts = Math.min(30, reddit.length * 8 + (recommended ? 6 : 0));
    score += pts;
    reasons.push({
      text: recommended
        ? `recommended by locals in ${plural(reddit.length, 'Reddit thread')}`
        : `talked about in ${plural(reddit.length, 'Reddit thread')}`,
      weight: pts,
    });
  }

  // 3. People are posting about it right now.
  const social = matched.filter(m => m.mention.source === 'instagram' || m.mention.source === 'tiktok');
  const recent = social.filter(m => m.mention.date && now.getTime() - Date.parse(m.mention.date) < 60 * DAY);
  if (social.length) {
    const pts = Math.min(20, recent.length * 5 + (social.length - recent.length) * 2);
    score += pts;
    const where = [...new Set(social.map(m => (m.mention.source === 'tiktok' ? 'TikTok' : 'Instagram')))].join(' and ');
    reasons.push({
      text: recent.length ? `${plural(recent.length, 'post')} on ${where} in the last 2 months` : `posted about on ${where}`,
      weight: pts,
    });
  }

  // 4. Events happening there.
  const events = matched.filter(m => m.mention.source === 'events');
  if (events.length) {
    score += Math.min(10, events.length * 5);
    reasons.push({ text: `${plural(events.length, 'upcoming event')} listed`, weight: 5 });
  }

  // 5. Famous? If it's on the big "best of" lists, it's not hidden.
  const known = pressText.length > 0 && matchedInPress(place.name, pressText);
  if (known) {
    score -= 15;
    reasons.push({ text: 'already on the big "best of" lists', weight: -1 });
  } else if (pressText.length > 0 && reasons.length > 0) {
    // Only worth saying when something else already marks it as a find.
    score += 5;
    reasons.push({ text: 'not on any big "best of" list', weight: 4 });
  }

  // 6. Hangout signals from reviews and posts.
  const texts = [...(place.reviewTexts ?? []), ...matched.map(m => m.mention.text)];
  const hangout = HANGOUT.filter(h => texts.some(t => h.re.test(t))).map(h => h.tag);
  if (hangout.length) {
    const pts = Math.min(10, hangout.length * 3);
    score += pts;
    reasons.push({ text: `people say: ${hangout.slice(0, 3).join(', ')}`, weight: pts });
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons: reasons.sort((a, b) => b.weight - a.weight).map(x => x.text),
    evidence: pickEvidence(place, matched),
    hangout,
    counts,
    known,
  };
}

function matchedInPress(name: string, pressText: string): boolean {
  const head = normName(name.split(/\s[-–—|:]\s|\(/)[0] ?? name);
  return head.trim().length >= 4 && pressText.includes(head);
}

const SOURCE_RANK: Record<GemSource, number> = { reddit: 0, tiktok: 1, instagram: 2, events: 3, maps: 4, press: 5 };

/** Up to 3 quotes: the most convincing mentions first, then a review with a hangout signal. */
function pickEvidence(place: GemPlaceInput, matched: Matched[]): Evidence[] {
  const out: Evidence[] = [];
  const ranked = [...matched]
    .filter(m => m.mention.source !== 'press')
    .sort(
      (a, b) =>
        Number(RECOMMEND.test(b.mention.text)) - Number(RECOMMEND.test(a.mention.text)) ||
        SOURCE_RANK[a.mention.source] - SOURCE_RANK[b.mention.source] ||
        b.mention.engagement - a.mention.engagement
    );
  for (const m of ranked) {
    if (out.length >= 2) break;
    if (out.some(e => e.source === m.mention.source)) continue; // one per source when possible
    out.push({ source: m.mention.source, quote: sentenceAround(m.mention.text, m.variant), url: m.mention.url, date: m.mention.date });
  }
  for (const m of ranked) {
    if (out.length >= 2) break;
    if (out.some(e => e.url === m.mention.url)) continue;
    out.push({ source: m.mention.source, quote: sentenceAround(m.mention.text, m.variant), url: m.mention.url, date: m.mention.date });
  }
  const review = (place.reviewTexts ?? []).find(t => HANGOUT.some(h => h.re.test(t))) ?? place.reviewTexts?.[0];
  if (review) {
    const sentence = review.split(/(?<=[.!?])\s+/).find(s => HANGOUT.some(h => h.re.test(s))) ?? review;
    out.push({ source: 'maps', quote: sentence.length > 180 ? `${sentence.slice(0, 179)}…` : sentence, url: place.mapsUrl, date: null });
  }
  return out.slice(0, 3);
}

/** Posts about pop-ups / night markets / supper clubs that didn't match any Maps place. */
export function findHappenings(mentions: Mention[], matchedUrls: Set<string>, now = new Date()) {
  return mentions
    .filter(m => !matchedUrls.has(m.url))
    .filter(m => /\b(pop[- ]?up|night market|supper club|food truck|one night only|this (friday|saturday|weekend))\b/i.test(m.text))
    .filter(m => !m.date || now.getTime() - Date.parse(m.date) < 30 * DAY)
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, 12)
    .map(m => ({ source: m.source as GemSource, text: m.text.slice(0, 220), url: m.url, date: m.date }));
}
