// Deterministic, offline content used when an AI job fails or times out.
// The orchestrator's fixture mode reuses these so DEMO_MODE and failures look the same.

export interface VenueFacts {
  title: string;
  category: string;
  priceLevel: number;
  rating: number;
  reviewCount: number;
  travelMin: number;
  hoursText: string;
  dietaryNotes: readonly string[];
  reviewSnippets: readonly string[];
}

const PERSONAS = [
  'like a courtroom lawyer who has never lost a case',
  'like a nature-documentary narrator who just discovered this place',
  'like a sports commentator calling the final seconds of the championship',
  'like a movie-trailer voice announcing a summer blockbuster',
  'like a royal herald reading a decree to the whole kingdom',
  'like a late-night infomercial host (but wait, there is more)',
  'like a detective revealing who did it in the final scene',
  'like a hype coach giving the halftime speech of their life',
] as const;

export function personaFor(index: number): string {
  return PERSONAS[((index % PERSONAS.length) + PERSONAS.length) % PERSONAS.length];
}

export function priceLabel(level: number): string {
  return level > 0 ? '$'.repeat(level) : 'price unknown';
}

/** 1234567 -> "1,234,567" (no Intl, which the module runtime may not have). */
export function withCommas(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function defaultHints(v: VenueFacts): string[] {
  const hints: string[] = [];
  if (v.rating > 0) hints.push(`${v.rating.toFixed(1)} stars from ${withCommas(v.reviewCount)} reviews`);
  hints.push(`${priceLabel(v.priceLevel)} · about ${v.travelMin} min away`);
  if (v.dietaryNotes.length > 0) hints.push(v.dietaryNotes[0]);
  else if (v.hoursText) hints.push(`Hours today: ${v.hoursText}`);
  if (hints.length < 3 && v.reviewSnippets.length > 0) hints.push(`A reviewer said: "${v.reviewSnippets[0].slice(0, 90)}"`);
  if (hints.length < 3) hints.push(v.category || 'A real place near you');
  if (hints.length < 3) hints.push(/movie|cinema/i.test(v.category) ? 'Check current films, showtimes and ticket prices before going.' : 'Check opening hours before going.');
  return hints.slice(0, 3);
}

export function defaultBrief(v: VenueFacts, index: number): { stylePrompt: string; hints: string[] } {
  return { stylePrompt: `Defend ${v.title} ${personaFor(index)}.`, hints: defaultHints(v) };
}

const WARMUPS: readonly [string, string, string][] = [
  ['Pineapple on pizza:', 'Defend it', 'Destroy it'],
  ['The best part of a night out is…', 'The food', 'The people'],
  ['Running 10 minutes late is…', 'Fashionable', 'A crime'],
  ['Splitting the bill:', 'Exactly even', 'Pay for what you got'],
  ['The ideal hangout ends…', 'Before 10pm', 'After 1am'],
  ['Trying the weird menu item:', 'Always', 'Never'],
  ['Karaoke:', 'Born for it', 'Hide me'],
  ['Board games night:', 'Ruthless', 'Here for snacks'],
];

const TAG_WARMUPS: Record<string, [string, string, string]> = {
  'spicy-food': ['Spice level tonight:', 'Mild and alive', 'Tears are flavor'],
  'board-games': ['Monopoly ends friendships:', 'Worth it', 'Never again'],
  'night-owl': ['A perfect night starts at…', '7pm sharp', 'Whenever, man'],
  ramen: ['Ramen etiquette:', 'Slurp loudly', 'Silent dignity'],
  tacos: ['Taco Tuesday on a Friday:', 'Legal', 'Lawless'],
  karaoke: ['Your karaoke move:', 'The power ballad', 'The group rap'],
  vegan: ['Vegan cheese:', 'Underrated', 'Overrated'],
  dessert: ['Dessert first?', 'Obviously', 'Chaos'],
  anime: ['Subs or dubs?', 'Subs', 'Dubs'],
  'cheap-eats': ['Best dinner budget:', 'Under $15', 'Treat yourself'],
};

export function defaultWarmup(tags: readonly string[], index: number): { question: string; choiceA: string; choiceB: string } {
  for (const tag of tags) {
    const q = TAG_WARMUPS[tag];
    if (q) return { question: q[0], choiceA: q[1], choiceB: q[2] };
  }
  const q = WARMUPS[((index % WARMUPS.length) + WARMUPS.length) % WARMUPS.length];
  return { question: q[0], choiceA: q[1], choiceB: q[2] };
}

const OPENERS: [RegExp, string][] = [
  [/lawyer/i, 'Members of the jury!'],
  [/documentary|narrator/i, 'Here, in its natural habitat…'],
  [/sports|commentator/i, 'AND THE CROWD GOES WILD!'],
  [/trailer/i, 'In a world of indecision…'],
  [/herald|royal/i, 'Hear ye, hear ye!'],
  [/infomercial/i, "But wait, there's more!"],
  [/detective/i, 'The clues all point to one place.'],
  [/coach/i, 'Listen up, team!'],
  [/toast/i, 'Raise your glasses, everyone!'],
  [/weather/i, "Tonight's forecast: delicious."],
];

/** A spoken-sounding pitch built only from real venue facts, opened in the assigned persona's voice. */
export function botPitchText(v: VenueFacts, stylePrompt: string, botName: string): string {
  const opener = OPENERS.find(([re]) => re.test(stylePrompt))?.[1] ?? 'Ladies and gentlemen!';
  const parts = [opener, `I, ${botName}, present ${v.title}.`];
  if (v.rating > 0) parts.push(`${v.rating.toFixed(1)} stars from ${withCommas(v.reviewCount)} reviews.`);
  parts.push(v.priceLevel > 0 ? `It's ${'$'.repeat(v.priceLevel)} and about ${v.travelMin} minutes away.` : `It's about ${v.travelMin} minutes away.`);
  const diet = v.dietaryNotes.find(n => !n.startsWith("Couldn't"));
  const quoted = diet?.match(/"([^"]+)"/)?.[1];
  if (quoted) parts.push(`They even have ${quoted.toLowerCase()}.`);
  else if (v.reviewSnippets[0]) parts.push(`One reviewer said: "${v.reviewSnippets[0].split(/(?<=[.!?])\s/)[0].slice(0, 100)}"`);
  parts.push(`Do not let this group chat die in indecision. Vote ${v.title}!`);
  return parts.join(' ');
}

export function defaultInvite(title: string, slotLabel: string, names: readonly string[]): string {
  const who = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] ?? 'Everyone';
  return `The jury has spoken: ${title}, ${slotLabel}. ${who}, see you there. No more "idk, where do you want to go?"`;
}

export function bestLineFallback(transcripts: readonly { playerId: bigint; text: string }[]): { playerId: bigint; quote: string } | null {
  let best: { playerId: bigint; quote: string; score: number } | null = null;
  for (const t of transcripts) {
    for (const sentence of t.text.split(/(?<=[.!?])\s+/)) {
      const words = sentence.trim().split(/\s+/).filter(Boolean);
      if (words.length < 4 || words.length > 15) continue;
      const score = (sentence.match(/!/g)?.length ?? 0) * 3 + words.length;
      if (!best || score > best.score) best = { playerId: t.playerId, quote: sentence.trim(), score };
    }
  }
  return best ? { playerId: best.playerId, quote: best.quote } : null;
}

const CHIP_TAGS: Record<string, string> = {
  cheap: 'cheap-eats',
  spicy: 'spicy-food',
  'board games': 'board-games',
  'night owl': 'night-owl',
  'early bird': 'early-bird',
  cozy: 'cozy-spots',
  loud: 'lively',
  outdoors: 'outdoors',
  'live music': 'live-music',
  dessert: 'dessert',
  drinks: 'drinks',
  adventurous: 'adventurous-eater',
};

/** Tags derived directly from the player's own chips, used when AI distillation is unavailable. */
export function chipsToTags(chips: readonly string[], dietary: readonly string[], budgetMax: number) {
  const out: { tag: string; reason: string; source: string }[] = [];
  for (const chip of chips) {
    const key = chip.toLowerCase().trim();
    const tag = CHIP_TAGS[key] ?? key.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (tag && !out.some(t => t.tag === tag)) out.push({ tag, reason: `You picked "${chip}"`, source: 'chips' });
  }
  for (const d of dietary) if (!out.some(t => t.tag === d)) out.push({ tag: d, reason: 'You said this is a dietary need', source: 'basics' });
  if (budgetMax <= 1 && !out.some(t => t.tag === 'cheap-eats')) out.push({ tag: 'cheap-eats', reason: 'Your budget is $', source: 'basics' });
  return out.slice(0, 8);
}
