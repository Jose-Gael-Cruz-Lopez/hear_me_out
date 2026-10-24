// Offline content generators used when Muse is unavailable (DEMO_MODE, no key, timeouts).
// They still personalize from real inputs (tags, venue data), they just aren't AI-written.
import { coverArtPrompt } from './cover-art';

const PERSONAS = [
  'a courtroom lawyer',
  'a nature-documentary narrator',
  'a sports commentator',
  'a movie-trailer voice',
  'a royal herald',
  'an infomercial host',
  'a noir detective',
  'a hype coach',
  'a wedding toastmaster',
  'a weather anchor',
];

const TAG_TWISTS: Record<string, string> = {
  'spicy-food': 'who just ate a ghost pepper',
  'board-games': 'reading from the official rulebook',
  'night-owl': 'at 2am after three espressos',
  'early-bird': 'who has been awake since 5am',
  'cheap-eats': 'who counts every single coin',
  vegan: 'who is secretly a very passionate carrot',
  vegetarian: 'speaking on behalf of the vegetables',
  ramen: 'who just discovered broth',
  anime: 'mid dramatic anime transformation',
  karaoke: 'who can only speak in song lyrics',
  tacos: 'on a sacred taco pilgrimage',
  'live-music': 'with a full drum solo',
  outdoors: 'lost on a mountain trail',
  dessert: 'with a sugar rush',
  arcades: 'chasing the high score',
  'bubble-tea': 'who drinks boba like coffee',
  photography: 'posing for every photo',
  bbq: 'with smoke in their eyes',
  bowling: 'chasing the perfect strike',
  'escape-rooms': 'who has three minutes left on the clock',
  'craft-beer': 'tasting hoppy notes',
  brunch: 'holding a bottomless mimosa',
};

const GENERIC_TWISTS = [
  'who has exactly 30 seconds to save the group chat',
  'who just won the lottery',
  'on their first day on the job',
  'in the season finale',
];

/** "Defend X like <persona> <twist>." — persona varies by seat, twist from the player's own tags. */
export function offlineStylePrompt(title: string, tags: readonly string[], seed: number): string {
  const persona = PERSONAS[seed % PERSONAS.length];
  const tag = tags.find(t => TAG_TWISTS[t]);
  const twist = tag ? TAG_TWISTS[tag] : GENERIC_TWISTS[seed % GENERIC_TWISTS.length];
  return `Defend ${title} like ${persona} ${twist}.`;
}

const KEYWORD_TAGS: [RegExp, string][] = [
  [/\bramen\b/i, 'ramen'],
  [/\bsushi\b/i, 'sushi'],
  [/\btacos?\b|\bmexican\b/i, 'tacos'],
  [/\bpizza\b/i, 'pizza'],
  [/\bbbq\b|barbecue/i, 'bbq'],
  [/\bthai\b/i, 'thai-food'],
  [/\bindian\b|\bcurry\b/i, 'indian-food'],
  [/\bkorean\b|\bkbbq\b/i, 'korean-food'],
  [/dim sum|dumplings?/i, 'dumplings'],
  [/\bburgers?\b/i, 'burgers'],
  [/\bspicy\b|\bheat\b|hot sauce/i, 'spicy-food'],
  [/\bcoffee\b|\bcafes?\b/i, 'coffee'],
  [/\bboba\b|bubble tea/i, 'bubble-tea'],
  [/\bdesserts?\b|\bsweets?\b|ice cream/i, 'dessert'],
  [/\bbrunch\b/i, 'brunch'],
  [/karaoke/i, 'karaoke'],
  [/board games?/i, 'board-games'],
  [/bowling/i, 'bowling'],
  [/arcades?/i, 'arcades'],
  [/hik(e|ing)|outdoors?|parks?/i, 'outdoors'],
  [/museums?|galler(y|ies)/i, 'museums'],
  [/movies?|films?|cinema/i, 'movies'],
  [/\banime\b|\bmanga\b/i, 'anime'],
  [/live music|concerts?|gigs?/i, 'live-music'],
  [/cocktails?|\bbars?\b/i, 'cocktails'],
  [/cheap|budget|broke|affordable/i, 'cheap-eats'],
  [/night owl|stay(ing)? up late|late nights?/i, 'night-owl'],
  [/early bird|mornings?/i, 'early-bird'],
];

export interface DistillInput {
  vibeChips: string[];
  dietary: string[];
  budgetMax: number;
  pastedContext: string;
}

/** Tags from chips + keyword matches in the pasted Muse summary, each with its source. */
export function offlineTags(input: DistillInput, chipTags: { tag: string; reason: string; source: string }[]) {
  const out = [...chipTags];
  for (const [re, tag] of KEYWORD_TAGS) {
    if (out.length >= 8) break;
    const m = input.pastedContext.match(re);
    if (m && !out.some(t => t.tag === tag)) out.push({ tag, reason: `Your Muse summary mentions "${m[0]}"`, source: 'paste' });
  }
  return out.slice(0, 8);
}

const BOLD_CLAIMS = [
  'It is open until 2am, trust me.',
  'Five stars. Every single review.',
  "And it's super cheap!",
  "It's literally a 2 minute walk.",
];

/** Bots exaggerate one fact on purpose so the fact-checker has something to rule on. */
export function botBoldClaim(seed: number): string {
  return BOLD_CLAIMS[seed % BOLD_CLAIMS.length];
}

export function offlinePosterPrompt(title: string, _slotLabel: string, category = ''): string {
  // Retain the existing call shape, but keep time/venue typography out of the art.
  return coverArtPrompt(title, category);
}

export function offlineIcebreakers(tags: readonly string[]): string[] {
  const t = tags.slice(0, 3).map(x => x.replace(/-/g, ' '));
  const out = [
    t[0] ? `Hottest take about ${t[0]}?` : 'What is the best thing you ate this month?',
    t[1] ? `Best ${t[1]} memory, go.` : 'What would your theme song be?',
    t[2] ? `If ${t[2]} were an Olympic sport, who here wins gold?` : 'What is your most controversial food opinion?',
  ];
  return out;
}
