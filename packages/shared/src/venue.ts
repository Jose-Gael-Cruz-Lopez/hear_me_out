/** A real place, normalized from the Google Maps scraper output. */
export interface Venue {
  placeId: string;
  title: string;
  category: string;
  categories: string[];
  address: string;
  neighborhood: string;
  lat: number;
  lng: number;
  /** 0 = unknown, 1..4 */
  priceLevel: number;
  priceText: string;
  rating: number;
  reviewCount: number;
  openingHours: { day: string; hours: string }[];
  mapsUrl: string;
  imageUrl: string;
  reviewSnippets: string[];
  /** Flattened "additionalInfo" facts that are true, e.g. "Vegan options", "Good for groups". */
  offerings: string[];
}

export interface VenueSet {
  key: string;
  source: 'apify' | 'fixture' | 'cache';
  center: { lat: number; lng: number } | null;
  venues: Venue[];
}

/** Google shows either "$$" or a range like "$10–20". */
export function priceLevelFrom(price: unknown): { level: number; text: string } {
  if (typeof price !== 'string' || !price.trim()) return { level: 0, text: '' };
  const text = price.replace(/\s+/g, '').trim();
  if (/^\$+$/.test(text)) return { level: Math.min(4, text.length), text };
  const nums = [...text.matchAll(/\d+/g)].map(m => Number(m[0]));
  if (nums.length === 0) return { level: 0, text };
  // Ranges like "$20–30": bucket by the midpoint. "$100+" is the top bucket.
  const mid = text.includes('+') ? Math.max(...nums) * 1.5 : (Math.min(...nums) + Math.max(...nums)) / 2;
  const level = mid <= 15 ? 1 : mid <= 30 ? 2 : mid <= 60 ? 3 : 4;
  return { level, text };
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function asNumber(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Normalize one dataset item from `compass/crawler-google-places`. Unknown fields become empty values. */
export function normalizeGoogleMapsItem(raw: Record<string, unknown>): Venue | null {
  const title = asString(raw.title);
  const location = (raw.location ?? {}) as { lat?: unknown; lng?: unknown };
  const lat = asNumber(location.lat);
  const lng = asNumber(location.lng);
  if (!title || (!lat && !lng)) return null;
  if (raw.permanentlyClosed === true || raw.temporarilyClosed === true) return null;

  const price = priceLevelFrom(raw.price);
  const hours = Array.isArray(raw.openingHours)
    ? (raw.openingHours as { day?: unknown; hours?: unknown }[])
        .map(h => ({ day: asString(h.day), hours: asString(h.hours) }))
        .filter(h => h.day && h.hours)
    : [];

  const offerings: string[] = [];
  const info = raw.additionalInfo;
  if (info && typeof info === 'object') {
    for (const entries of Object.values(info as Record<string, unknown>)) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (!entry || typeof entry !== 'object') continue;
        for (const [k, v] of Object.entries(entry as Record<string, unknown>)) if (v === true) offerings.push(k);
      }
    }
  }

  const reviewSnippets = Array.isArray(raw.reviews)
    ? (raw.reviews as { text?: unknown; textTranslated?: unknown }[])
        .map(r => asString(r.textTranslated) || asString(r.text))
        .filter(Boolean)
        .map(t => t.replace(/\s+/g, ' ').slice(0, 280))
        .slice(0, 3)
    : [];

  const categories = Array.isArray(raw.categories) ? (raw.categories as unknown[]).map(asString).filter(Boolean) : [];
  return {
    placeId: asString(raw.placeId) || asString(raw.cid) || title,
    title,
    category: asString(raw.categoryName) || categories[0] || '',
    categories,
    address: asString(raw.address),
    neighborhood: asString(raw.neighborhood),
    lat,
    lng,
    priceLevel: price.level,
    priceText: price.text,
    rating: asNumber(raw.totalScore),
    reviewCount: asNumber(raw.reviewsCount),
    openingHours: hours,
    mapsUrl: asString(raw.url),
    imageUrl: asString(raw.imageUrl),
    reviewSnippets,
    offerings: [...new Set(offerings)].slice(0, 40),
  };
}
