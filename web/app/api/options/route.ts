import { NextResponse } from 'next/server';
import { loadPlaces } from '@/lib/places/load';
import { buildGroup, filterPlaces, haversineM, optionCount, pickDiverse } from '@/lib/game/filter';
import { assignPlayers } from '@/lib/game/assign';
import { DIETS, DISTANCES, label, VIBES } from '@/lib/game/questions';
import { withFallback } from '@/lib/ai/muse';
import type { OptionsRequest, OptionsResponse } from '@/lib/api-types';

export async function POST(req: Request) {
  const body = (await req.json()) as OptionsRequest;
  const file = await loadPlaces(body);
  // If the cache we found is for somewhere else, measure distances from that cache's center.
  const origin = haversineM(body, file.location) < 25_000 ? body : file.location;
  const group = buildGroup(body.members);
  const { candidates, relaxed } = filterPlaces(file.places, origin, group, body.when);
  const count = optionCount(body.players.length, candidates.length);
  if (count < 2) return NextResponse.json({ error: 'Not enough places nearby. Try fetching places for this area.' }, { status: 422 });

  // Pre-rank with variety, then let the AI choose among the top of that list (never outside it).
  const shortlist = pickDiverse(candidates, group, Math.min(candidates.length, 14));
  const groupSummary = [
    `${body.members.length} people`,
    `budget up to ${'$'.repeat(group.maxBudget)}`,
    group.diets.length ? `diets: ${group.diets.map(d => label(DIETS, d)).join(', ')}` : 'no diet restrictions',
    `max distance ${label(DISTANCES, body.members[0]?.distance ?? 'short-ride')}`,
    `cravings: ${Object.entries(group.vibes).map(([v, n]) => `${label(VIBES, v)} ×${n}`).join(', ') || 'anything'}`,
    `going ${body.when.label}`,
  ].join('; ');
  const briefs = shortlist.map(c => ({
    id: c.id, name: c.name, category: c.category, priceLevel: c.priceLevel, rating: c.rating,
    reviews: c.reviews, distanceM: c.distanceM, vibes: c.vibes,
  }));
  const chosen = await withFallback('chooseOptions', ai => ai.chooseOptions({ groupSummary, candidates: briefs, count }));

  // Hard guarantee: only shortlisted ids, no duplicates, exactly `count` (top up from the shortlist).
  const ids = [...new Set(chosen.value.ids.filter(id => shortlist.some(c => c.id === id)))].slice(0, count);
  for (const c of shortlist) if (ids.length < count && !ids.includes(c.id)) ids.push(c.id);
  const picked = ids.map(id => shortlist.find(c => c.id === id)!);

  const players = body.players.map(p => ({
    ...p,
    vibe: body.members.find(m => m.playerId === p.playerId)?.vibe ?? '',
  }));
  const base = assignPlayers(players, picked, body.code);
  const prompts = await Promise.all(
    base.map((a, i) => {
      const p = players.find(x => x.playerId === a.playerId)!;
      const o = picked[a.optionIndex]!;
      return withFallback('writePrompt', ai =>
        ai.writePrompt({ playerName: p.name, playerVibe: p.vibe, optionName: o.name, optionCategory: o.category }, i + body.code.charCodeAt(0))
      );
    })
  );

  const res: OptionsResponse = {
    options: picked.map(c => ({
      name: c.name,
      category: c.category,
      address: c.address,
      priceLevel: c.priceLevel ?? 2,
      rating: c.rating ?? 0,
      distanceM: c.distanceM,
      mapsUrl: c.mapsUrl,
      blurb: chosen.value.blurbs[c.id] ?? c.category,
    })),
    assignments: base.map((a, i) => ({ ...a, prompt: prompts[i]!.value })),
    notice: [relaxed.length ? `We ${relaxed.join(', ')}.` : '', file.sample ? 'Using sample places data.' : ''].filter(Boolean).join(' '),
    source: file.source,
    sample: !!file.sample,
    ai: chosen.mode,
  };
  return NextResponse.json(res);
}
