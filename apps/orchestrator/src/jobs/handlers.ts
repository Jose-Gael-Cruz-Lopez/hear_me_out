import type { AiJob, Option, OptionInput, Player } from '@hmo/bindings';
import { appearsIn, localNow, menuEvidence, MENU_DIETS, type LatLng, type MenuPage, type Venue } from '@hmo/shared';
import { bestLineFallback, botPitchText, chipsToTags, defaultHints, defaultWarmup, type VenueFacts } from '@hmo/module/logic/fallbacks';
import { finalistCount } from '@hmo/module/logic/timing';
import * as prompts from '../prompts';
import { toWav } from '../services/audio';
import { evaluate, pickVaried, shortlist, type Candidate, type Member } from '../services/curation';
import { factcheckLocal, type VenueRecord } from '../services/factcheck';
import { geocode } from '../services/geocode';
import { crawlMenus, siteUrl } from '../services/menu';
import { profileSocial } from '../services/social';
import { botBoldClaim, offlineIcebreakers, offlinePosterPrompt, offlineStylePrompt, offlineTags } from '../services/offline';
import { DEFAULT_QUERIES, nearestFixture, saveRawScrape, scrapeVenues, venueKey } from '../services/venues';
import { log } from '../log';
import type { Deps } from './deps';
import { membersOf, optionsOf, playersOf, profileOf, roomOf } from './deps';

export type Handler = (job: AiJob, d: Deps) => Promise<void>;

/** Thrown when there is nothing to improve (e.g. Muse offline): the module's offline content stays. */
export class SkipJob extends Error {}

function payload<T>(job: AiJob): T {
  try {
    return JSON.parse(job.payloadJson || '{}') as T;
  } catch {
    return {} as T;
  }
}

const facts = (o: Option): VenueFacts => ({
  title: o.title,
  category: o.category,
  priceLevel: o.priceLevel,
  rating: o.rating,
  reviewCount: o.reviewCount,
  travelMin: o.travelMin,
  hoursText: o.hoursText,
  dietaryNotes: o.dietaryNotes,
  reviewSnippets: o.reviewSnippets,
});

const record = (o: Option): VenueRecord => ({ ...facts(o), hoursKnown: o.hoursKnown, openIntervals: o.openIntervals });

/** Venue data as the prompts see it: facts only, no internal fields. */
const promptVenue = (o: Option) => ({
  title: o.title,
  category: o.category,
  price: o.priceLevel > 0 ? '$'.repeat(o.priceLevel) : 'unknown',
  rating: o.rating || 'unknown',
  reviewCount: o.reviewCount,
  minutesAway: o.travelMin,
  hoursToday: o.hoursKnown ? o.hoursText : 'unknown',
  dietaryNotes: o.dietaryNotes,
  reviewSnippets: o.reviewSnippets.slice(0, 2),
});

// ---------- Profiles ----------

interface DistillPayload {
  playerName: string;
  budgetMax: number;
  dietary: string[];
  maxTravelMin: number;
  vibeChips: string[];
  pastedContext: string;
  socialLinks: { platform: string; handle: string }[];
}

const distill_profile: Handler = async (job, d) => {
  const p = payload<DistillPayload>(job);
  // The player linked their own public account and consented: derive tags from it (raw posts stay in memory).
  const social = await profileSocial(d.cfg, p.socialLinks ?? []);
  const chipTags = chipsToTags(p.vibeChips ?? [], p.dietary ?? [], p.budgetMax ?? 2);
  const socialTags = (social?.tags ?? []).map(t => ({ tag: t.tag, reason: `${t.reason} (your posts)`, source: 'social' }));
  const fallback = offlineTags({ vibeChips: p.vibeChips ?? [], dietary: p.dietary ?? [], budgetMax: p.budgetMax ?? 2, pastedContext: p.pastedContext ?? '' }, [...chipTags, ...socialTags]);
  const out = await d.muse.json({
    ...prompts.distillProfile,
    input: {
      basics: { budgetMax: p.budgetMax, dietary: p.dietary, maxTravelMin: p.maxTravelMin },
      vibeChips: p.vibeChips,
      pastedFromTheirMuse: p.pastedContext || '(nothing pasted)',
      fromTheirOwnPublicPosts: social
        ? { tags: social.tags, interests: social.interests, topHashtags: social.topHashtags, postingPattern: social.postingPattern, posts: social.postCount }
        : '(no account linked)',
    },
    effort: 'minimal',
    roomId: job.roomId,
  });
  const tags = out?.tags ?? fallback;
  const notes = [
    out ? '' : 'Drafted from your picks and pasted text (AI distillation offline).',
    (p.socialLinks ?? []).length > 0 ? (social ? `Read ${social.postCount} public posts; raw posts were not stored.` : "Couldn't read your linked account, so it wasn't used.") : '',
  ].filter(Boolean);
  await d.conn.reducers.finishDistill({ jobId: job.id, tags, note: notes.join(' ') });
};

// ---------- Warm-up ----------

const warmup: Handler = async (job, d) => {
  const players = playersOf(d.conn, job.roomId);
  const withTags = players.map(p => ({ p, tags: profileOf(d.conn, p.id)?.approvedTags ?? [] }));
  const out = await d.muse.json({
    ...prompts.warmup,
    input: { players: withTags.map(({ p, tags }) => ({ playerId: p.id.toString(), name: p.name, tags })) },
    effort: 'minimal',
    roomId: job.roomId,
  });
  const questions = withTags.map(({ p, tags }, i) => {
    const m = out?.questions.find(q => q.playerId === p.id.toString());
    return m ? { playerId: p.id, question: m.question, choiceA: m.choiceA, choiceB: m.choiceB } : { playerId: p.id, ...defaultWarmup(tags, i * 3 + Number(job.roomId % 5n)) };
  });
  await d.conn.reducers.finishWarmup({ jobId: job.id, questions });
};

// ---------- Scouting ----------

export interface ScoutPayload {
  category: string;
  locationLabel: string;
  lat: number;
  lng: number;
  hasGeo: boolean;
}

const SIX_HOURS_MS = 6 * 3600 * 1000;

/**
 * Venues for a category + place: fresh cache (6 h) → live Apify run → recorded fixtures.
 * Live and fixture results are written to venue_cache so curation (and later rooms) can use them.
 */
export async function resolveVenueSet(d: Deps, p: ScoutPayload): Promise<{ key: string; center: LatLng; count: number; source: 'cache' | 'apify' | 'fixture' }> {
  const category = p.category || 'food';
  let center: LatLng | null = p.hasGeo ? { lat: p.lat, lng: p.lng } : null;
  if (!center && p.locationLabel && !d.cfg.demoMode) center = await geocode(p.locationLabel);
  const fixture = nearestFixture(d.fixtures, center);
  if (!center && fixture && (d.cfg.demoMode || p.locationLabel === d.cfg.demoLocation)) center = { lat: fixture.lat, lng: fixture.lng };
  const queries = DEFAULT_QUERIES[category] ?? DEFAULT_QUERIES.food;
  const key = venueKey(center, p.locationLabel, category, queries);

  const cached = [...d.conn.db.adminVenueCache.iter()].find(c => c.key === key);
  if (cached && Date.now() - Number(cached.fetchedAt.microsSinceUnixEpoch / 1000n) < SIX_HOURS_MS) {
    const set = JSON.parse(cached.itemsJson) as { center: LatLng; venues: Venue[] };
    return { key, center: set.center, count: set.venues.length, source: 'cache' };
  }

  const live = await scrapeVenues(d.cfg, { center, locationLabel: p.locationLabel, queries, timeoutMs: 85_000 });
  if (live && live.venues.length >= 4) {
    const liveCenter = center ?? { lat: live.venues[0].lat, lng: live.venues[0].lng };
    if (live.rawItems) saveRawScrape(d.cfg.fixturesDir, key, live.rawItems);
    await d.conn.reducers.cacheVenues({ key, category, query: queries.join('+'), source: 'apify', itemsJson: JSON.stringify({ center: liveCenter, venues: live.venues }) });
    return { key, center: liveCenter, count: live.venues.length, source: 'apify' };
  }

  if (!fixture) throw new Error('No live venues and no fixtures');
  const venues = fixture.venues[category]?.length ? fixture.venues[category] : fixture.venues.activity;
  const fixtureKey = `fixture:${fixture.area}|${category}`;
  const fixtureCenter = { lat: fixture.lat, lng: fixture.lng };
  await d.conn.reducers.cacheVenues({ key: fixtureKey, category, query: queries.join('+'), source: 'fixture', itemsJson: JSON.stringify({ center: fixtureCenter, venues }) });
  return { key: fixtureKey, center: fixtureCenter, count: venues.length, source: 'fixture' };
}

const scout: Handler = async (job, d) => {
  const set = await resolveVenueSet(d, payload<ScoutPayload>(job));
  await d.conn.reducers.finishScout({ jobId: job.id, venueKey: set.key, lat: set.center.lat, lng: set.center.lng, hasGeo: true, count: set.count, source: set.source });
};

// ---------- Curation ----------

function loadVenueSet(d: Deps, key: string): { center: LatLng; venues: Venue[] } | null {
  const row = [...d.conn.db.adminVenueCache.iter()].find(c => c.key === key);
  if (!row) return null;
  try {
    return JSON.parse(row.itemsJson);
  } catch {
    return null;
  }
}

function toOptionInput(c: Candidate, fitSummary: string, lines: { playerId: bigint; line: string }[], score: number): OptionInput {
  const v = c.venue;
  return {
    placeId: v.placeId,
    title: v.title,
    category: v.category,
    address: v.address,
    lat: v.lat,
    lng: v.lng,
    priceLevel: Math.max(0, Math.min(4, Math.round(v.priceLevel))),
    rating: v.rating,
    reviewCount: Math.max(0, Math.round(v.reviewCount)),
    hoursText: c.hoursText,
    hoursKnown: c.hoursKnown,
    openIntervals: c.open.map(w => ({ startMin: Math.round(w.startMin), endMin: Math.round(w.endMin) })),
    mapsUrl: v.mapsUrl,
    imageUrl: v.imageUrl,
    reviewSnippets: v.reviewSnippets.slice(0, 2),
    dietaryNotes: c.dietNotes,
    distanceKm: Math.round(c.distanceKm * 100) / 100,
    travelMin: Math.max(1, Math.min(600, Math.round(c.travelMin))),
    fitSummary,
    perPlayerFit: lines,
    groupFitScore: Math.max(0, Math.min(100, Math.round(score))),
    stretchNote: c.stretchNote,
    busyness: Uint8Array.from(v.busyness?.length === 168 ? v.busyness : []),
  };
}

/** Why this venue fits the group, in a few words (the card already shows rating, price and distance). */
function deterministicSummary(c: Candidate, members: Member[]): string {
  const bits: string[] = [];
  const diets = [...new Set(members.flatMap(m => m.dietary))];
  if (diets.length && c.dietOk) bits.push(`${diets.join(' + ')} ✓`);
  if (c.venue.priceLevel > 0 && c.budgetOk) bits.push('fits every budget');
  if (c.travelOk) bits.push("within everyone's travel time");
  if (c.hoursOk) bits.push('open when you are free');
  if (c.tagHits[0]) bits.push(`for the ${c.tagHits[0].replace(/-/g, ' ')} crowd`);
  if (bits.length === 0) bits.push(c.venue.category);
  return bits.slice(0, 3).join(' · ');
}

const curate: Handler = async (job, d) => {
  const room = roomOf(d.conn, job.roomId);
  if (!room) throw new Error('room gone');
  const p = payload<{ forceFixtures?: boolean }>(job);
  const members: Member[] = membersOf(d.conn, room.id);
  let set = p.forceFixtures ? null : loadVenueSet(d, room.venueKey);
  if (!set || set.venues.length < 2) {
    const fx = nearestFixture(d.fixtures, room.hasGeo ? { lat: room.lat, lng: room.lng } : null);
    if (!fx) throw new Error('no venues available');
    set = { center: { lat: fx.lat, lng: fx.lng }, venues: fx.venues[room.category]?.length ? fx.venues[room.category] : fx.venues.activity };
  }
  const { weekday, minutes } = localNow(Date.now(), room.tzOffsetMin);
  const cands = evaluate(set.venues, members, { center: set.center, weekday, nowMin: minutes, category: room.category });
  const n = finalistCount(members.length);
  const short = shortlist(cands, members, n, 10);
  if (short.length < 2) throw new Error('not enough venues');

  const out = await d.muse.json({
    ...prompts.curate,
    input: {
      n,
      category: room.category,
      players: members.map(m => ({ playerId: m.playerId.toString(), name: m.name, tags: m.tags, budgetMax: m.budgetMax, dietary: m.dietary, maxTravelMin: m.maxTravelMin })),
      candidates: short.map(c => ({
        placeId: c.venue.placeId,
        title: c.venue.title,
        category: c.venue.category,
        price: c.venue.priceLevel > 0 ? '$'.repeat(c.venue.priceLevel) : 'unknown',
        rating: c.venue.rating,
        reviewCount: c.venue.reviewCount,
        minutesAway: c.travelMin,
        hoursToday: c.hoursKnown ? c.hoursText : 'unknown',
        dietNotes: c.dietNotes,
        offerings: c.venue.offerings.slice(0, 10),
        review: c.venue.reviewSnippets[0] ?? '',
        stretchNote: c.stretchNote,
        score: c.score,
      })),
    },
    effort: 'medium',
    timeoutMs: 30_000,
    roomId: room.id,
  });

  let options: OptionInput[] | null = null;
  if (out) {
    const picked = out.finalists
      .map(f => ({ f, c: short.find(c => c.venue.placeId === f.placeId) }))
      .filter((x): x is { f: (typeof out.finalists)[number]; c: Candidate } => !!x.c);
    const unique = picked.filter((x, i) => picked.findIndex(y => y.c === x.c) === i).slice(0, n);
    if (unique.length >= Math.min(n, short.length) && unique.length >= 2) {
      options = unique.map(({ f, c }) => {
        const lines = members.map(m => {
          const line = f.perPlayerFit.find(l => l.playerId === m.playerId.toString())?.line;
          return { playerId: m.playerId, line: line ? `${m.name}: ${line.replace(new RegExp(`^${m.name}:\\s*`), '')}` : c.fitLines.find(l => l.playerId === m.playerId)!.line };
        });
        // Blend the AI's judgment with the deterministic score so tie-breaks stay grounded in data.
        return toOptionInput(c, f.fitSummary, lines, (c.score + f.groupFitScore) / 2);
      });
    } else {
      log.warn('muse curate returned unusable finalists, using deterministic picks', { got: unique.length, n });
    }
  }
  options ??= pickVaried(short, n).map(c => toOptionInput(c, deterministicSummary(c, members), c.fitLines, c.score));
  await d.conn.reducers.finishCurate({ jobId: job.id, options });
};

// ---------- Menu check ----------

/**
 * Proof from each finalist's own website that it serves the group's diets: crawl the sites with Apify's
 * Website Content Crawler and pull real dishes ("Tofu Larb (VG)") from the menu text.
 */
const menu_check: Handler = async (job, d) => {
  const room = roomOf(d.conn, job.roomId);
  if (!room) throw new Error('room gone');
  const diets = (payload<{ diets?: string[] }>(job).diets ?? []).filter(x => MENU_DIETS.includes(x));
  if (!d.cfg.apifyEnabled) throw new SkipJob('menu check needs live Apify');
  if (diets.length === 0) throw new SkipJob('no diet the menu check can read');
  const options = optionsOf(d.conn, room.id);
  const set = loadVenueSet(d, room.venueKey);
  const venueOf = (o: Option) => set?.venues.find(v => v.placeId === o.placeId);
  const sites = options.map(o => ({ key: String(o.id), url: siteUrl(venueOf(o)?.website) })).filter(s => s.url);
  const pages = sites.length ? await crawlMenus(d.cfg, sites, 75_000) : new Map();
  if (!pages) throw new Error('menu crawl failed');
  const results = await Promise.all(
    options.map(async o => {
      const site = sites.find(s => s.key === String(o.id));
      // Venue data recorded before websites were kept has no field at all: that's "not checked", not "no website".
      if (!site) return { optionId: o.id, status: venueOf(o)?.website === undefined ? 'unavailable' : 'no_website', dishes: [], sourceUrl: '' };
      const got: MenuPage[] = [...(pages.get(site.key) ?? [])].sort((a, b) => Number(/menu/i.test(b.url)) - Number(/menu/i.test(a.url)));
      const menuUrl = got.find(p => /menu/i.test(p.url))?.url ?? site.url;
      // Muse reads the menu when it's connected; every dish it names must really be on the page.
      const ai = got.length
        ? await d.muse.json({
            ...prompts.menuDiet,
            input: { restaurant: o.title, diets, pages: got.slice(0, 6).map(p => ({ url: p.url, text: p.text.slice(0, 2500) })) },
            timeoutMs: 20_000,
            roomId: room.id,
          })
        : null;
      const dishes: { diet: string; dish: string }[] = [];
      let sourceUrl = '';
      for (const diet of diets) {
        const fromAi = (ai?.diets.find(x => x.diet === diet)?.dishes ?? []).filter(x => appearsIn(got, x));
        const fromMarks = menuEvidence(got, diet);
        // A vegan dish already listed also proves vegetarian; don't repeat it under each diet.
        const fresh = (fromAi.length ? fromAi : fromMarks.dishes).filter(x => !dishes.some(y => y.dish === x));
        for (const dish of fresh.slice(0, 3)) dishes.push({ diet, dish });
        if (!sourceUrl) sourceUrl = fromAi.length ? menuUrl : fromMarks.url;
      }
      return { optionId: o.id, status: dishes.length ? 'confirmed' : 'not_found', dishes, sourceUrl: sourceUrl || site.url };
    })
  );
  log.info('menu check', { room: room.code, confirmed: results.filter(r => r.status === 'confirmed').length, of: results.length });
  await d.conn.reducers.finishMenuCheck({ jobId: job.id, results });
};

// ---------- Assignments ----------

const assign: Handler = async (job, d) => {
  const players = playersOf(d.conn, job.roomId);
  const options = optionsOf(d.conn, job.roomId);
  const rows = [...d.conn.db.assignment.iter()].filter(a => a.roomId === job.roomId);
  const items = rows
    .map(a => ({ a, p: players.find(p => p.id === a.playerId), o: options.find(o => o.id === a.optionId) }))
    .filter((x): x is { a: (typeof rows)[number]; p: Player; o: Option } => !!x.p && !!x.o);

  const out = await d.muse.json({
    ...prompts.assign,
    input: {
      assignments: items.map(({ a, p, o }) => ({
        playerId: p.id.toString(),
        name: p.name,
        tags: profileOf(d.conn, p.id)?.approvedTags ?? [],
        coCounsel: a.coCounsel,
        option: promptVenue(o),
      })),
    },
    effort: 'low',
    roomId: job.roomId,
  });
  const briefs = items.map(({ p, o }, i) => {
    const m = out?.briefs.find(b => b.playerId === p.id.toString());
    if (m) return { playerId: p.id, stylePrompt: m.stylePrompt, hints: m.hints };
    const tags = profileOf(d.conn, p.id)?.approvedTags ?? [];
    return { playerId: p.id, stylePrompt: offlineStylePrompt(o.title, tags, i + p.seat * 3), hints: defaultHints(facts(o)) };
  });
  await d.conn.reducers.finishAssign({ jobId: job.id, briefs });
};

// ---------- Pitches ----------

const transcribe: Handler = async (job, d) => {
  const pitch = d.conn.db.pitch.id.find(job.refId);
  if (!pitch) throw new Error('pitch gone');
  const { mediaId } = payload<{ mediaId?: string }>(job);
  const media = mediaId ? d.conn.db.media.id.find(BigInt(mediaId)) : undefined;
  if (d.muse.enabled && media) {
    try {
      const wav = await toWav(media.bytes, media.mime);
      const text = await d.muse.transcribe(wav, job.roomId);
      if (text) {
        await d.conn.reducers.finishTranscribe({ jobId: job.id, transcript: text, source: 'muse' });
        return;
      }
    } catch (err) {
      log.warn('audio conversion failed', { err: String(err).slice(0, 200) });
    }
  }
  if (pitch.liveCaption.trim()) {
    // Honest fallback: the browser's own speech recognition, labeled as such in the UI.
    await d.conn.reducers.finishTranscribe({ jobId: job.id, transcript: pitch.liveCaption, source: 'browser' });
    return;
  }
  throw new Error(d.muse.enabled ? 'transcription failed' : 'transcription unavailable (no Muse key)');
};

const bot_pitch: Handler = async (job, d) => {
  const { pitchIds = [] } = payload<{ pitchIds?: string[] }>(job);
  const items = pitchIds
    .map(id => d.conn.db.pitch.id.find(BigInt(id)))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map(p => ({
      pitch: p,
      player: d.conn.db.player.id.find(p.playerId),
      option: d.conn.db.option.id.find(p.optionId),
      brief: d.conn.db.assignment.playerId.find(p.playerId),
    }))
    .filter(x => x.player && x.option);
  const out = await d.muse.json({
    ...prompts.botPitch,
    input: {
      pitches: items.map(x => ({
        pitchId: x.pitch.id.toString(),
        botName: x.player!.name,
        stylePrompt: x.brief?.stylePrompt ?? '',
        venue: promptVenue(x.option!),
        hints: x.brief?.hints ?? [],
      })),
    },
    effort: 'low',
    roomId: job.roomId,
  });
  const pitches = items.map((x, i) => {
    const m = out?.pitches.find(p => p.pitchId === x.pitch.id.toString());
    const text = m?.text ?? `${botPitchText(facts(x.option!), x.brief?.stylePrompt ?? '', x.player!.name)} ${botBoldClaim(i + Number(job.roomId % 4n))}`;
    return { pitchId: x.pitch.id, text };
  });
  await d.conn.reducers.finishBotPitches({ jobId: job.id, pitches });
};

const factcheck: Handler = async (job, d) => {
  const pitch = d.conn.db.pitch.id.find(job.refId);
  if (!pitch || !pitch.transcript) throw new Error('nothing to check');
  const option = d.conn.db.option.id.find(pitch.optionId);
  if (!option) throw new Error('option gone');
  const local = factcheckLocal(pitch.transcript, record(option));
  const out = await d.muse.json({
    ...prompts.factcheck,
    input: { transcript: pitch.transcript, venue: promptVenue(option) },
    effort: 'low',
    timeoutMs: 12_000,
    roomId: job.roomId,
  });
  // Muse rules first; if it finds nothing but the local checker caught a claim, use that.
  const ruling = out && out.kind !== 'none' ? out : local;
  await d.conn.reducers.finishFactcheck({ jobId: job.id, kind: ruling.kind, text: ruling.text });
};

// ---------- Results & plan ----------

const awards: Handler = async (job, d) => {
  const pitches = [...d.conn.db.pitch.iter()].filter(p => p.roomId === job.roomId && p.transcript);
  const players = playersOf(d.conn, job.roomId);
  if (pitches.length === 0) throw new Error('no transcripts');
  const out = await d.muse.json({
    ...prompts.awards,
    input: { transcripts: pitches.map(p => ({ playerId: p.playerId.toString(), name: players.find(x => x.id === p.playerId)?.name, transcript: p.transcript })) },
    effort: 'low',
    roomId: job.roomId,
  });
  const valid = out && pitches.some(p => p.playerId.toString() === out.playerId);
  const pick = valid ? { playerId: BigInt(out!.playerId), quote: out!.quote } : bestLineFallback(pitches.map(p => ({ playerId: p.playerId, text: p.transcript })));
  if (!pick) throw new Error('no quotable line');
  await d.conn.reducers.finishAwards({ jobId: job.id, playerId: pick.playerId, quote: pick.quote });
};

const plan_copy: Handler = async (job, d) => {
  const plan = d.conn.db.plan.id.find(job.refId);
  if (!plan) throw new Error('plan gone');
  const option = d.conn.db.option.id.find(plan.optionId);
  if (!option) throw new Error('option gone');
  const players = playersOf(d.conn, job.roomId);
  const tags = players.flatMap(p => profileOf(d.conn, p.id)?.approvedTags ?? []);
  const shared = [...new Set(tags.filter((t, i) => tags.indexOf(t) !== i)), ...new Set(tags)].slice(0, 6);
  const out = await d.muse.json({
    ...prompts.planCopy,
    input: {
      venue: promptVenue(option),
      time: plan.slotLabel,
      players: players.map(p => ({
        playerId: p.id.toString(),
        name: p.name,
        tags: profileOf(d.conn, p.id)?.approvedTags ?? [],
        fit: option.perPlayerFit.find(f => f.playerId === p.id)?.line ?? '',
        canMakeIt: !plan.cantMake.includes(p.id),
      })),
      sharedTags: shared,
    },
    effort: 'low',
    roomId: job.roomId,
  });
  const whyForEach = out
    ? out.whyForEach.filter(w => players.some(p => p.id.toString() === w.playerId)).map(w => ({ playerId: BigInt(w.playerId), line: w.line }))
    : option.perPlayerFit;
  await d.conn.reducers.finishPlanCopy({
    jobId: job.id,
    inviteText: out?.inviteText ?? plan.inviteText,
    whyForEach,
    posterPrompt: out?.posterPrompt ?? offlinePosterPrompt(option.title, plan.slotLabel),
    icebreakers: out?.icebreakers ?? offlineIcebreakers(shared),
  });
};

const poster: Handler = async (job, d) => {
  const plan = d.conn.db.plan.id.find(job.refId);
  if (!plan) throw new Error('plan gone');
  const option = d.conn.db.option.id.find(plan.optionId);
  const prompt = plan.posterPrompt || offlinePosterPrompt(option?.title ?? 'The Plan', plan.slotLabel);
  const img = await d.muse.image(prompt, job.roomId);
  if (img && img.bytes.length <= 1_400_000) {
    await d.conn.reducers.finishPoster({ jobId: job.id, posterUrl: '', mime: img.mime, bytes: new Uint8Array(img.bytes) });
    return;
  }
  // No AI poster: the client renders a typographic poster from the plan instead (labeled as such).
  await d.conn.reducers.finishPoster({ jobId: job.id, posterUrl: '', mime: '', bytes: new Uint8Array() });
};

// ---------- Strangers mode ----------

const match_blurb: Handler = async (job, d) => {
  const { shared = [], players = 0 } = payload<{ shared?: string[]; players?: number }>(job);
  const out = await d.muse.json({ ...prompts.matchBlurb, input: { sharedTags: shared, peopleInLobby: players }, effort: 'minimal', roomId: job.roomId });
  if (!out) throw new SkipJob('Muse offline: keeping the offline blurb');
  await d.conn.reducers.finishMatchBlurb({ jobId: job.id, line: out.line });
};

const merge_intro: Handler = async (job, d) => {
  const offer = d.conn.db.mergeOffer.id.find(job.refId);
  if (!offer) throw new Error('offer gone');
  const roomA = roomOf(d.conn, offer.roomA);
  const roomB = roomOf(d.conn, offer.roomB);
  const tags = (roomId: bigint) => playersOf(d.conn, roomId).flatMap(p => profileOf(d.conn, p.id)?.approvedTags ?? []);
  const out = await d.muse.json({
    ...prompts.mergeIntro,
    input: { groupA: roomA?.groupName, groupB: roomB?.groupName, venue: offer.venueTitle, time: offer.slotLabel, tagsA: tags(offer.roomA), tagsB: tags(offer.roomB) },
    effort: 'minimal',
    roomId: job.roomId,
  });
  if (!out) throw new SkipJob('Muse offline: keeping the offline intro');
  await d.conn.reducers.finishMergeIntro({ jobId: job.id, text: out.text });
};

export const handlers: Record<string, Handler> = {
  match_blurb,
  merge_intro,
  distill_profile,
  warmup,
  scout,
  curate,
  menu_check,
  assign,
  transcribe,
  bot_pitch,
  factcheck,
  awards,
  plan_copy,
  poster,
};
