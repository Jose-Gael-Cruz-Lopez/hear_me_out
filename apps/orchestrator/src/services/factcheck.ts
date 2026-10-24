import { formatClock } from '@hmo/module/logic/slot';
import { withCommas } from '@hmo/module/logic/fallbacks';

export interface VenueRecord {
  title: string;
  category: string;
  rating: number;
  reviewCount: number;
  priceLevel: number;
  travelMin: number;
  hoursKnown: boolean;
  hoursText: string;
  openIntervals: readonly { startMin: number; endMin: number }[];
  dietaryNotes: readonly string[];
}

export interface Ruling {
  kind: 'sustained' | 'verified' | 'none';
  text: string;
}

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, ten: 10, fifteen: 15, twenty: 20, thirty: 30 };
const money = (n: number) => '$'.repeat(Math.max(1, n));

/** "9", "9:30 pm", "midnight", "2am" -> minutes after local midnight (after-midnight times > 1440). */
function parseClaimTime(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/\./g, '');
  if (s === 'midnight') return 1440;
  if (s === 'noon') return 720;
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 12 || min > 59) return null;
  const mer = m[3];
  if (mer === 'am') return h === 12 ? 1440 : h <= 5 ? 1440 + h * 60 + min : h * 60 + min;
  if (mer === 'pm') return (h === 12 ? 12 : h + 12) * 60 + min;
  // No meridiem: people talk about evenings, so 1-5 means after midnight and 6-11 means PM.
  if (h === 12) return 1440;
  if (h <= 5) return 1440 + h * 60 + min;
  return (h + 12) * 60 + min;
}

function latestClose(v: VenueRecord): number | null {
  if (!v.hoursKnown || v.openIntervals.length === 0) return null;
  return Math.max(...v.openIntervals.map(w => w.endMin));
}

type Check = (t: string, v: VenueRecord) => Ruling | null;

const checkHours: Check = (t, v) => {
  const close = latestClose(v);
  if (close === null) return null;
  const closeText = close >= 1440 && close % 1440 === 0 ? 'midnight' : formatClock(close);
  if (/\b(open|opened|serving)\s+(all night|24\s*\/\s*7|24 hours|twenty[- ]four hours|super late|really late|late)\b/i.test(t)) {
    return close >= 1440
      ? { kind: 'verified', text: `Claim verified: open until ${closeText} tonight.` }
      : { kind: 'sustained', text: `OBJECTION SUSTAINED: ${v.title} closes at ${closeText} tonight.` };
  }
  const re = /\b(?:(?:open|opened|serving|serves)\s+(?:until|till|til|'til|to)|closes?\s+(?:at\s+)?)\s*(midnight|noon|\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)/gi;
  let verified: Ruling | null = null;
  for (const m of t.matchAll(re)) {
    const claimed = parseClaimTime(m[1]);
    if (claimed === null) continue;
    if (claimed > close + 15) return { kind: 'sustained', text: `OBJECTION SUSTAINED: it closes at ${closeText}, not ${m[1].trim()}.` };
    verified ??= { kind: 'verified', text: `Claim verified: open until ${closeText} tonight.` };
  }
  return verified;
};

const checkRating: Check = (t, v) => {
  if (v.rating <= 0) return null;
  const actual = `${v.rating.toFixed(1)} stars from ${withCommas(v.reviewCount)} reviews`;
  let verified: Ruling | null = null;
  for (const m of t.matchAll(/\b(\d(?:\.\d)?|five|four|three)[- ]?\s*stars?\b/gi)) {
    const claimed = /^\d/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1].toLowerCase()];
    if (claimed === undefined || claimed > 5) continue;
    if (claimed - v.rating >= 0.3) return { kind: 'sustained', text: `OBJECTION SUSTAINED: it's ${v.rating.toFixed(1)} stars, not ${claimed}.` };
    verified ??= { kind: 'verified', text: `Claim verified: ${actual}.` };
  }
  if (verified) return verified;
  if (/\b(highest[- ]rated|best[- ]rated|perfect rating|top[- ]rated)\b/i.test(t)) {
    return v.rating >= 4.6
      ? { kind: 'verified', text: `Claim verified: ${actual}.` }
      : { kind: 'sustained', text: `OBJECTION SUSTAINED: ${v.rating.toFixed(1)} stars is good, not "top-rated".` };
  }
  return null;
};

const checkPrice: Check = (t, v) => {
  if (v.priceLevel <= 0) return null;
  if (/\b(cheap|affordable|inexpensive|budget[- ]friendly|bargain|won'?t break the bank|wallet[- ]friendly)\b/i.test(t)) {
    return v.priceLevel >= 3
      ? { kind: 'sustained', text: `OBJECTION SUSTAINED: ${money(v.priceLevel)} is not exactly cheap.` }
      : { kind: 'verified', text: `Claim verified: ${money(v.priceLevel)}, easy on the wallet.` };
  }
  if (/\b(fancy|expensive|upscale|luxurious|bougie|classy)\b/i.test(t)) {
    return v.priceLevel >= 3
      ? { kind: 'verified', text: `Claim verified: ${money(v.priceLevel)}. Fancy indeed.` }
      : { kind: 'sustained', text: `OBJECTION SUSTAINED: it's only ${money(v.priceLevel)}. Fancy on a budget.` };
  }
  return null;
};

const checkDistance: Check = (t, v) => {
  const est = `about ${v.travelMin} min away`;
  let verified: Ruling | null = null;
  for (const m of t.matchAll(/\b(\d{1,2}|one|two|three|four|five|ten|fifteen|twenty|thirty)\s*(?:-|\s)?min(?:ute)?s?\b/gi)) {
    const claimed = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1].toLowerCase()];
    if (claimed === undefined) continue;
    if (claimed < v.travelMin * 0.6 - 1) return { kind: 'sustained', text: `OBJECTION SUSTAINED: it's ${est}, not ${claimed}.` };
    verified ??= { kind: 'verified', text: `Claim verified: ${est}.` };
  }
  if (verified) return verified;
  if (/\b(around the corner|right next door|walking distance|super close|so close|close by|nearby)\b/i.test(t)) {
    return v.travelMin <= 12
      ? { kind: 'verified', text: `Claim verified: ${est}.` }
      : { kind: 'sustained', text: `OBJECTION SUSTAINED: "around the corner" is ${est}.` };
  }
  return null;
};

const checkDiet: Check = (t, v) => {
  const m = t.match(/\b(vegan|vegetarian|gluten[- ]free|halal|kosher)\b/i);
  if (!m) return null;
  const diet = m[1].toLowerCase().replace(' ', '-');
  const confirmed = v.dietaryNotes.find(n => !n.startsWith("Couldn't") && n.toLowerCase().includes(diet.split('-')[0]));
  if (confirmed) return { kind: 'verified', text: `Claim verified: ${confirmed}.` };
  return null;
};

const checkReviews: Check = (t, v) => {
  if (v.reviewCount <= 0) return null;
  const m = t.match(/\b(thousands|hundreds|millions)\s+of\s+reviews\b/i);
  if (!m) return null;
  const claimed = { hundreds: 200, thousands: 2000, millions: 2_000_000 }[m[1].toLowerCase() as 'hundreds' | 'thousands' | 'millions'];
  return v.reviewCount >= claimed * 0.5
    ? { kind: 'verified', text: `Claim verified: ${withCommas(v.reviewCount)} reviews.` }
    : { kind: 'sustained', text: `OBJECTION SUSTAINED: it has ${withCommas(v.reviewCount)} reviews, not ${m[1].toLowerCase()}.` };
};

/** At most one ruling per pitch: a sustained objection beats a verification. */
export function factcheckLocal(transcript: string, v: VenueRecord): Ruling {
  const results = [checkHours, checkRating, checkPrice, checkDistance, checkDiet, checkReviews]
    .map(c => c(transcript, v))
    .filter((r): r is Ruling => r !== null);
  return results.find(r => r.kind === 'sustained') ?? results[0] ?? { kind: 'none', text: '' };
}
