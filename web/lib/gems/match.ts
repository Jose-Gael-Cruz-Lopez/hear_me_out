// Finds which Google Maps places a Reddit comment / Instagram caption / article is talking about.
// The same place is written differently everywhere ("Sister's Dumpling House - Marina" vs
// "sisters dumpling"), so names are normalized and matched as whole phrases. Generic names
// ("Pizza", "The Bar") are never matched on their own, to avoid false positives.
import type { Mention } from './types';

/** Words that don't identify a place by themselves. */
const GENERIC = new Set([
  'the', 'a', 'an', 'and', 'of', 'at', 'on', 'in', 'by', 'to', 'restaurant', 'restaurants', 'cafe', 'coffee', 'bar',
  'grill', 'kitchen', 'house', 'eatery', 'bistro', 'shop', 'co', 'company', 'sf', 'san', 'francisco', 'bay', 'area',
  'marina', 'street', 'st', 'ave', 'food', 'foods', 'pizza', 'pizzeria', 'tacos', 'taco', 'taqueria', 'sushi',
  'ramen', 'burger', 'burgers', 'bakery', 'deli', 'market', 'tea', 'boba', 'club', 'lounge', 'pub', 'brewing',
  'brewery', 'thai', 'indian', 'mexican', 'italian', 'japanese', 'chinese', 'korean', 'vietnamese', 'cuisine',
  'park', 'museum', 'bowling', 'arcade', 'karaoke', 'new', 'old', 'little', 'big', 'best', 'good', 'one', 'two',
  'express', 'place', 'spot', 'corner', 'garden', 'golden', 'gate', 'north', 'south', 'east', 'west', 'beach',
]);

export function normName(s: string): string {
  return ` ${s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `;
}

/** "Sister's Dumpling House - Marina (Chestnut St)" → [" sisters dumpling house ", " sisters dumpling "]. */
export function nameVariants(name: string): string[] {
  const head = name.split(/\s[-–—|:]\s|\(/)[0] ?? name;
  const out = new Set<string>();
  for (const raw of [head, head.replace(/^the\s+/i, '')]) {
    const n = normName(raw);
    out.add(n);
    // Also try without a trailing generic word ("Sisters Dumpling House" → "Sisters Dumpling").
    const words = n.trim().split(' ');
    while (words.length > 1 && GENERIC.has(words[words.length - 1]!)) {
      words.pop();
      out.add(` ${words.join(' ')} `);
    }
  }
  return [...out].filter(isDistinctive);
}

/** A variant can identify a place on its own only if it has a real, non-generic word in it. */
export function isDistinctive(variant: string): boolean {
  const words = variant.trim().split(' ').filter(Boolean);
  const specific = words.filter(w => !GENERIC.has(w) && !/^\d+$/.test(w));
  if (!specific.length) return false;
  if (words.length === 1) return words[0]!.length >= 5;
  return specific.join('').length >= 4;
}

export function mentionsPlace(normalizedText: string, variants: string[]): string | null {
  for (const v of variants) if (normalizedText.includes(v)) return v;
  return null;
}

export interface Matched {
  mention: Mention;
  /** The variant that matched, for pulling out a quote around it. */
  variant: string;
}

/** placeId → the mentions that talk about it. */
export function matchMentions(
  places: { id: string; name: string }[],
  mentions: Mention[]
): Map<string, Matched[]> {
  const variants = places.map(p => ({ id: p.id, v: nameVariants(p.name) })).filter(p => p.v.length);
  const out = new Map<string, Matched[]>();
  for (const m of mentions) {
    const text = normName(m.text);
    for (const p of variants) {
      const hit = mentionsPlace(text, p.v);
      if (!hit) continue;
      const list = out.get(p.id) ?? [];
      if (!list.some(x => x.mention.url === m.url)) list.push({ mention: m, variant: hit });
      out.set(p.id, list);
    }
  }
  return out;
}

/** The sentence in `text` that names the place, trimmed for a quote card. */
export function sentenceAround(text: string, variant: string, max = 180): string {
  const sentences = text.split(/(?<=[.!?\n])\s+/);
  const hit = sentences.find(s => normName(s).includes(variant)) ?? sentences[0] ?? text;
  const s = hit.replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}
