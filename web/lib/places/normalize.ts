// Normalizes Apify "Google Maps Scraper" (compass/crawler-google-places) items into our Place shape.
// Kept free of imports so scripts/fetch-places.ts can run it directly with Node's type stripping.

/** Minutes since midnight, [start, end). end may exceed 1440 for places open past midnight. */
export type Range = [number, number];

export interface Place {
  id: string;
  name: string;
  category: string;
  kind: 'food' | 'activity';
  address: string;
  lat: number;
  lng: number;
  /** 1–4, or null when Google has no price info. */
  priceLevel: number | null;
  rating: number | null;
  reviews: number;
  mapsUrl: string;
  /** Subset of: vegetarian, vegan, halal, gluten-free. */
  dietTags: string[];
  /** Index 0 = Sunday … 6 = Saturday. null = hours unknown. */
  hours: Range[][] | null;
}

export interface PlacesFile {
  source: string;
  location: { label: string; lat: number; lng: number };
  fetchedAt: string;
  sample?: boolean;
  places: Place[];
}

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const FOOD_WORDS = [
  'restaurant', 'food', 'cafe', 'coffee', 'bakery', 'bar', 'pizza', 'taco', 'taqueria', 'sushi', 'ramen', 'deli',
  'diner', 'grill', 'ice cream', 'dessert', 'tea', 'boba', 'brewery', 'pub', 'burger', 'sandwich', 'creamery', 'bistro',
];

function parseClock(raw: string): { min: number; meridiem: 'am' | 'pm' | null } | null {
  const s = raw.trim().toLowerCase().replace(/\./g, '');
  if (s === 'noon') return { min: 12 * 60, meridiem: 'pm' };
  if (s === 'midnight') return { min: 0, meridiem: 'am' };
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 24 || min > 59) return null;
  return { min: (h % 12) * 60 + min, meridiem: (m[3] as 'am' | 'pm' | undefined) ?? null };
}

/** "11 AM to 2:30 PM, 5 to 10 PM" → [[660, 870], [1020, 1320]]. Returns null if unparseable. */
export function parseHours(text: string): Range[] | null {
  const s = text.replace(/[   ]/g, ' ').trim().toLowerCase();
  if (!s) return null;
  if (s.includes('closed')) return [];
  if (s.includes('24 hours')) return [[0, 1440]];
  const out: Range[] = [];
  for (const part of s.split(/,|;/)) {
    const [a, b] = part.split(/\s*(?:to|–|—|-)\s*/);
    if (!a || !b) return null;
    const start = parseClock(a);
    const end = parseClock(b);
    if (!start || !end) return null;
    let endMin = end.min + (end.meridiem === 'pm' ? 720 : 0);
    if (end.meridiem === 'am' && end.min === 0) endMin = 1440; // "12 AM" closing = midnight
    let startMin: number;
    if (start.meridiem) {
      startMin = start.min + (start.meridiem === 'pm' && start.min < 720 ? 720 : 0);
    } else {
      // "5 to 10 PM": inherit the end's meridiem unless that would start after it ends ("11 to 2 PM").
      startMin = start.min + (end.meridiem === 'pm' ? 720 : 0);
      if (startMin >= endMin && end.meridiem === 'pm') startMin -= 720;
    }
    if (endMin <= startMin) endMin += 1440; // open past midnight
    out.push([startMin, endMin]);
  }
  return out;
}

export function parseWeek(openingHours: unknown): Range[][] | null {
  if (!Array.isArray(openingHours) || openingHours.length === 0) return null;
  const week: (Range[] | null)[] = Array(7).fill(null);
  for (const row of openingHours as { day?: string; hours?: string }[]) {
    const idx = DAYS.indexOf(String(row.day ?? '').toLowerCase());
    if (idx < 0) continue;
    week[idx] = parseHours(String(row.hours ?? ''));
  }
  if (week.some(d => d === null)) return null;
  return week as Range[][];
}

export function isOpenAt(hours: Range[][] | null, day: number, minute: number): boolean | null {
  if (!hours) return null;
  if (hours[day]!.some(([s, e]) => minute >= s && minute < e)) return true;
  const prev = hours[(day + 6) % 7]!;
  return prev.some(([, e]) => e > 1440 && minute + 1440 < e);
}

function dietTagsFrom(additionalInfo: unknown, text: string): string[] {
  const tags = new Set<string>();
  const flat: string[] = [];
  if (additionalInfo && typeof additionalInfo === 'object') {
    for (const entries of Object.values(additionalInfo as Record<string, unknown>)) {
      if (!Array.isArray(entries)) continue;
      for (const e of entries) {
        for (const [k, v] of Object.entries(e as Record<string, unknown>)) if (v === true) flat.push(k.toLowerCase());
      }
    }
  }
  const all = [...flat, text.toLowerCase()].join(' | ');
  if (/vegan/.test(all)) tags.add('vegan');
  if (/vegetarian|vegan/.test(all)) tags.add('vegetarian');
  if (/halal/.test(all)) tags.add('halal');
  if (/gluten/.test(all)) tags.add('gluten-free');
  return [...tags];
}

function priceLevel(price: unknown): number | null {
  if (typeof price !== 'string') return null;
  const dollars = price.match(/^\$+/);
  if (dollars) return Math.min(dollars[0].length, 4);
  // Newer Google format: "$10–20", "$20-30", "$100+"
  const n = Number(price.replace(/[^0-9–\-+]/g, '').split(/[–\-+]/)[0]);
  if (!Number.isFinite(n) || n === 0) return null;
  return n < 15 ? 1 : n < 30 ? 2 : n < 60 ? 3 : 4;
}

export function normalizeApifyItem(item: Record<string, any>): Place | null {
  const lat = item.location?.lat;
  const lng = item.location?.lng;
  if (!item.title || typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (item.permanentlyClosed || item.temporarilyClosed) return null;
  const categories: string[] = [item.categoryName, ...(item.categories ?? [])].filter(Boolean);
  const category = String(categories[0] ?? 'Place');
  const catText = categories.join(' ').toLowerCase();
  return {
    id: String(item.placeId ?? item.cid ?? item.title),
    name: String(item.title),
    category,
    kind: FOOD_WORDS.some(w => catText.includes(w)) ? 'food' : 'activity',
    address: String(item.address ?? item.street ?? ''),
    lat,
    lng,
    priceLevel: priceLevel(item.price),
    rating: typeof item.totalScore === 'number' ? item.totalScore : null,
    reviews: Number(item.reviewsCount ?? 0),
    mapsUrl: String(item.url ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.title)}`),
    dietTags: dietTagsFrom(item.additionalInfo, `${item.title} ${catText}`),
    hours: parseWeek(item.openingHours),
  };
}
