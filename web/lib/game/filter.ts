// Hard filters run in code, never by the AI: budget, diet, open at the planned time, distance.
// The AI only ever chooses among places that already passed these.
import { isOpenAt, type Place } from '../places/normalize';
import { distanceMeters, vibesFor, type Vibe } from './questions';

export interface GroupMember {
  playerId: string;
  name: string;
  budget: number;
  diet: string;
  distance: string;
  freeWhen: string[];
  vibe: string;
}

export interface Group {
  maxBudget: number;
  diets: string[];
  maxDistanceM: number;
  vibes: Record<string, number>;
}

export interface Candidate extends Place {
  distanceM: number;
  vibes: Vibe[];
  openAtPlanTime: boolean | null;
  score: number;
}

export function buildGroup(members: GroupMember[]): Group {
  const vibes: Record<string, number> = {};
  for (const m of members) if (m.vibe) vibes[m.vibe] = (vibes[m.vibe] ?? 0) + 1;
  return {
    maxBudget: members.length ? Math.min(...members.map(m => m.budget)) : 3,
    diets: [...new Set(members.map(m => m.diet).filter(d => d && d !== 'any'))],
    maxDistanceM: members.length ? Math.min(...members.map(m => distanceMeters(m.distance))) : 5000,
    vibes,
  };
}

export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371e3;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function meetsDiet(p: Place, diets: string[]) {
  if (p.kind === 'activity') return true;
  return diets.every(d => p.dietTags.includes(d) || (d === 'vegetarian' && p.dietTags.includes('vegan')));
}

const DIET_WORD: Record<string, string> = { vegetarian: 'veggie', vegan: 'vegan', halal: 'halal', 'gluten-free': 'gluten-free' };

/**
 * Applies the hard filters, loosening distance → budget → hours (never diet, unless nothing is left)
 * until there are at least `want` candidates. Returns candidates best-first plus a note about what was loosened.
 */
export function filterPlaces(
  places: Place[],
  origin: { lat: number; lng: number },
  group: Group,
  when: { day: number; minute: number },
  want = 4
): { candidates: Candidate[]; relaxed: string[] } {
  const enriched: Candidate[] = places.map(p => {
    const vibes = vibesFor(`${p.category} ${p.name}`);
    const distanceM = Math.round(haversineM(origin, p));
    const openAtPlanTime = isOpenAt(p.hours, when.day, when.minute);
    const vibeVotes = vibes.reduce((n, v) => n + (group.vibes[v] ?? 0), 0);
    const score =
      vibeVotes * 1.5 +
      (p.rating ?? 3.8) +
      Math.log10(p.reviews + 1) * 0.3 -
      (distanceM / 1000) * 0.2 -
      (openAtPlanTime === null ? 0.5 : 0);
    return { ...p, distanceM, vibes, openAtPlanTime, score };
  });

  const steps = [
    { dist: group.maxDistanceM, budget: group.maxBudget, hours: true, diet: true, note: '' },
    { dist: group.maxDistanceM * 2, budget: group.maxBudget, hours: true, diet: true, note: 'stretched the distance a bit' },
    { dist: 15000, budget: group.maxBudget, hours: true, diet: true, note: 'looked further away' },
    { dist: 15000, budget: group.maxBudget + 1, hours: true, diet: true, note: 'went one $ over budget' },
    { dist: 15000, budget: 4, hours: false, diet: true, note: "included places whose hours we couldn't confirm" },
    { dist: 15000, budget: 4, hours: false, diet: false, note: `couldn't find enough ${group.diets.map(d => DIET_WORD[d]).join(' + ')} spots` },
  ];
  let best: Candidate[] = [];
  const relaxed: string[] = [];
  for (const step of steps) {
    if (step.note) relaxed.push(step.note);
    best = enriched
      .filter(
        p =>
          p.distanceM <= step.dist &&
          (p.priceLevel ?? 2) <= step.budget &&
          (!step.hours || p.openAtPlanTime !== false) &&
          (!step.diet || meetsDiet(p, group.diets))
      )
      .sort((a, b) => b.score - a.score);
    if (best.length >= want) break;
  }
  return { candidates: best, relaxed: relaxed.length ? [relaxed[relaxed.length - 1]!] : [] };
}

/** Deterministic pick: each group vibe's best match first, then fill with variety. */
export function pickDiverse(candidates: Candidate[], group: Group, n: number): Candidate[] {
  const chosen: Candidate[] = [];
  const take = (c: Candidate | undefined) => c && !chosen.includes(c) && chosen.push(c);
  const vibesByPopularity = Object.entries(group.vibes).sort((a, b) => b[1] - a[1]).map(([v]) => v);
  for (const v of vibesByPopularity) {
    if (chosen.length >= n) break;
    take(candidates.find(c => c.vibes.includes(v as Vibe) && !chosen.includes(c)));
  }
  const usedCats = () => new Set(chosen.map(c => c.category));
  for (const c of candidates) {
    if (chosen.length >= n) break;
    if (!usedCats().has(c.category)) take(c);
  }
  for (const c of candidates) {
    if (chosen.length >= n) break;
    take(c);
  }
  return chosen;
}

export function optionCount(players: number, available: number) {
  return Math.min(Math.max(players, 4), 6, available);
}
