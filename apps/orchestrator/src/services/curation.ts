import { dietEvidence, estimateTravelMin, haversineKm, openIntervalsForDay, type LatLng, type Venue, type Win } from '@hmo/shared';
import { pickSlot } from '@hmo/module/logic/slot';

export interface Member {
  playerId: bigint;
  name: string;
  budgetMax: number;
  dietary: string[];
  maxTravelMin: number;
  windows: Win[];
  tags: string[];
}

export interface Candidate {
  venue: Venue;
  distanceKm: number;
  travelMin: number;
  hoursKnown: boolean;
  hoursText: string;
  open: Win[];
  dietNotes: string[];
  dietOk: boolean;
  budgetOk: boolean;
  travelOk: boolean;
  hoursOk: boolean;
  score: number;
  stretchNote: string;
  fitLines: { playerId: bigint; line: string }[];
  tagHits: string[];
}

const SLOT_LEN: Record<string, number> = { food: 90, activity: 120, movie: 150 };
const money = (n: number) => (n > 0 ? '$'.repeat(n) : '?');

function tagHitsFor(v: Venue, tags: readonly string[]): string[] {
  const hay = `${v.title} ${v.category} ${v.categories.join(' ')} ${v.offerings.join(' ')} ${v.reviewSnippets.join(' ')}`.toLowerCase();
  return tags.filter(tag => {
    const words = tag.split('-').filter(w => w.length > 2 && !['food', 'eats', 'spots', 'night', 'late'].includes(w));
    return words.length > 0 && words.some(w => hay.includes(w));
  });
}

/** Evaluate every venue against the group's hard constraints and score its fit (0-100). */
export function evaluate(venues: readonly Venue[], group: readonly Member[], ctx: { center: LatLng; weekday: number; nowMin: number; category: string }): Candidate[] {
  const isFood = ctx.category === 'food';
  const budgetCap = Math.min(...group.map(m => m.budgetMax), 4);
  const travelCap = Math.min(...group.map(m => m.maxTravelMin), 120);
  const diets = [...new Set(group.flatMap(m => m.dietary))];
  const allTags = [...new Set(group.flatMap(m => m.tags))];
  const slotLen = SLOT_LEN[ctx.category] ?? 90;

  return venues.map(venue => {
    const distanceKm = haversineKm(ctx.center, venue);
    const travelMin = estimateTravelMin(distanceKm);
    const hours = openIntervalsForDay(venue.openingHours, ctx.weekday);
    const evidence = diets.map(d => dietEvidence(venue, d, isFood));
    const dietOk = evidence.every(e => e.confirmed);
    const budgetOk = venue.priceLevel === 0 || venue.priceLevel <= budgetCap;
    const travelOk = travelMin <= travelCap;
    const slot = pickSlot({
      nowMin: ctx.nowMin,
      players: group.map(m => ({ id: m.playerId, windows: m.windows })),
      venue: { hoursKnown: hours.hoursKnown, open: hours.open },
      slotLen,
    });
    const hoursOk = slot.cantMake.length === 0 && slot.startMin < 1440;
    const tagHits = tagHitsFor(venue, allTags);

    let score = 0;
    if (venue.rating > 0) score += Math.max(0, Math.min(30, ((venue.rating - 3.5) / 1.5) * 30));
    score += Math.min(1, Math.log10(venue.reviewCount + 1) / 4) * 10;
    score += budgetOk ? 15 : Math.max(0, 15 - 6 * (venue.priceLevel - budgetCap));
    score += travelOk ? 15 * Math.max(0.3, 1 - travelMin / Math.max(travelCap, 1)) : 0;
    score += diets.length === 0 ? 15 : (15 * evidence.filter(e => e.confirmed).length) / diets.length;
    score += Math.min(15, tagHits.length * 5);

    const fitLines = group.map(m => {
      const parts: string[] = [];
      for (const d of m.dietary) {
        const e = evidence.find(x => x.diet === d);
        if (e) parts.push(e.confirmed ? `${d} ✓` : `${d}: unconfirmed`);
      }
      if (venue.priceLevel > 0) parts.push(`${money(venue.priceLevel)} (your max ${money(m.budgetMax)})`);
      parts.push(`~${travelMin} min (you said ≤${m.maxTravelMin})`);
      const hit = tagHits.find(t => m.tags.includes(t));
      if (hit) parts.push(`you're into ${hit.replace(/-/g, ' ')}`);
      return { playerId: m.playerId, line: `${m.name}: ${parts.join(' · ')}` };
    });

    return {
      venue,
      distanceKm,
      travelMin,
      hoursKnown: hours.hoursKnown,
      hoursText: hours.text,
      open: hours.open,
      dietNotes: evidence.filter(e => e.note).map(e => e.note),
      dietOk,
      budgetOk,
      travelOk,
      hoursOk,
      score: Math.round(Math.max(0, Math.min(100, score))),
      stretchNote: '',
      fitLines,
      tagHits,
    };
  });
}

function stretchNoteFor(c: Candidate, group: readonly Member[]): string {
  if (!c.dietOk) return c.dietNotes.find(n => n.startsWith("Couldn't")) ?? 'Diet options unconfirmed. Check the menu.';
  if (!c.hoursOk) return 'Hours are tight for some of you tonight.';
  if (!c.budgetOk) {
    const over = group.filter(m => c.venue.priceLevel > m.budgetMax).map(m => m.name);
    return `We stretched the budget for ${over.join(', ') || 'some of you'}.`;
  }
  if (!c.travelOk) {
    const far = group.filter(m => c.travelMin > m.maxTravelMin).map(m => m.name);
    return `A bit farther than ${far.join(', ') || 'some of you'} wanted.`;
  }
  return '';
}

/**
 * Hard filters first, then relax in this order when too few venues pass: travel, budget, hours.
 * Diet is never relaxed: a venue without diet evidence only appears as a last resort, clearly labeled.
 * Returns up to `pool` candidates ordered strict-first, then by score, with variety across categories.
 */
export function shortlist(cands: readonly Candidate[], group: readonly Member[], needed: number, pool = 10): Candidate[] {
  const levels: ((c: Candidate) => boolean)[] = [
    c => c.dietOk && c.budgetOk && c.travelOk && c.hoursOk,
    c => c.dietOk && c.budgetOk && c.hoursOk,
    c => c.dietOk && c.hoursOk,
    c => c.dietOk,
    () => true,
  ];
  const chosen: Candidate[] = [];
  for (const passes of levels) {
    const fresh = cands.filter(c => passes(c) && !chosen.includes(c)).sort((a, b) => b.score - a.score);
    for (const c of fresh) chosen.push({ ...c, stretchNote: levels[0](c) ? '' : stretchNoteFor(c, group) });
    if (chosen.length >= pool) break;
  }
  return chosen.slice(0, pool);
}

/** Pick `n` finalists: venues that meet every constraint first (in different categories when possible), then the rest. */
export function pickVaried(list: readonly Candidate[], n: number): Candidate[] {
  const out: Candidate[] = [];
  const seenCats = new Set<string>();
  const strict = list.filter(c => !c.stretchNote);
  for (const c of strict) {
    if (out.length >= n) break;
    const cat = c.venue.category.toLowerCase();
    if (!seenCats.has(cat)) {
      out.push(c);
      seenCats.add(cat);
    }
  }
  for (const c of [...strict, ...list]) {
    if (out.length >= n) break;
    if (!out.includes(c)) out.push(c);
  }
  return out;
}
