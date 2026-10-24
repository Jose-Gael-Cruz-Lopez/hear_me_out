// The AI host. Every call to Meta's Muse models lives in this file, behind the AiHost interface.
//
//  - Muse Spark (text/reasoning): pick options, write defend-prompts, react to pitches, pick a time.
//  - Muse Voice Transcribe: voice pitch → text.
//  - Muse Image: a funny movie poster per option.
//
// When MUSE_API_KEY is missing we run a deterministic MOCK host, so the whole game works offline.
// When a live call fails or times out, the routes fall back to the mock for that one call (see withFallback).
import { hash, PERSONAS } from '../game/assign';

export type AiMode = 'mock' | 'muse';

export interface CandidateBrief {
  id: string;
  name: string;
  category: string;
  priceLevel: number | null;
  rating: number | null;
  reviews: number;
  distanceM: number;
  vibes: string[];
}

export interface ChooseOptionsInput {
  /** What the group asked for (already enforced by the hard filters; context for the AI). */
  groupSummary: string;
  candidates: CandidateBrief[];
  count: number;
}

export interface ChooseOptionsOutput {
  ids: string[];
  /** One short, funny line per chosen id. */
  blurbs: Record<string, string>;
}

export interface PromptInput {
  playerName: string;
  playerVibe: string;
  optionName: string;
  optionCategory: string;
}

export interface ReactInput {
  playerName: string;
  optionName: string;
  prompt: string;
  pitch: string;
}

export interface HostPitchInput {
  optionName: string;
  category: string;
  blurb: string;
  rating: number;
}

export interface PickTimeInput {
  optionName: string;
  total: number;
  slots: { slot: string; label: string; count: number }[];
}

export interface PosterInput {
  name: string;
  category: string;
  blurb: string;
}

export interface Poster {
  contentType: string;
  body: string | Uint8Array;
}

export interface AiHost {
  mode: AiMode;
  chooseOptions(input: ChooseOptionsInput): Promise<ChooseOptionsOutput>;
  writePrompt(input: PromptInput, seed: number): Promise<string>;
  reactToPitch(input: ReactInput): Promise<string>;
  hostPitch(input: HostPitchInput): Promise<string>;
  pickTime(input: PickTimeInput): Promise<{ slot: string; blurb: string }>;
  transcribe(audio: Blob, browserHint?: string): Promise<string>;
  poster(input: PosterInput): Promise<Poster>;
}

// ---------------------------------------------------------------------------------------------
// Mock host: deterministic, funny-enough, zero network.
// ---------------------------------------------------------------------------------------------

const pick = <T,>(list: readonly T[], seed: string) => list[hash(seed) % list.length]!;

function stars(r: number | null) {
  return r ? `${r.toFixed(1)}★` : 'unrated';
}

function walk(m: number) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}

const CATEGORY_JOKES = [
  'the group chat will finally stop arguing',
  'your future self already said thank you',
  'scientifically proven to end friendships (in a good way)',
  'the main character move',
  'zero regrets, some crumbs',
  'the vibes have been pre-approved',
];

const REACTIONS = [
  (n: string, o: string) => `Objection overruled! ${n} just made ${o} sound like a legal obligation.`,
  (n: string, o: string) => `${n}, I came in skeptical and I'm leaving with a reservation at ${o}.`,
  (n: string) => `That pitch had the energy of a group chat at 2am. ${n}, I respect it.`,
  (n: string, o: string) => `Bold of you, ${n}, to defend ${o} with that much confidence and zero evidence.`,
  (n: string) => `I've hosted four thousand of these and ${n} is the first to make me emotional.`,
  (n: string, o: string) => `The judges are confused but intrigued. ${o} is suddenly a contender.`,
  (n: string) => `${n} said all of that with a straight face. Iconic.`,
  (n: string, o: string) => `If ${o} doesn't win, ${n} is legally allowed to say "I told you so" forever.`,
];

const mock: AiHost = {
  mode: 'mock',

  async chooseOptions({ candidates, count }) {
    // The route already ranked candidates with variety; the mock simply keeps that order.
    const chosen = candidates.slice(0, count);
    return {
      ids: chosen.map(c => c.id),
      blurbs: Object.fromEntries(
        chosen.map(c => [c.id, `${stars(c.rating)} ${c.category.toLowerCase()}, ${walk(c.distanceM)} away — ${pick(CATEGORY_JOKES, c.id)}.`])
      ),
    };
  },

  async writePrompt({ optionName }, seed) {
    return `Defend ${optionName} ${PERSONAS[seed % PERSONAS.length]}.`;
  },

  async reactToPitch({ playerName, optionName, pitch }) {
    if (!pitch.trim() || pitch.startsWith('(')) return `${playerName} pleads the fifth. ${optionName} will have to speak for itself.`;
    return pick(REACTIONS, playerName + pitch)(playerName, optionName);
  },

  async hostPitch({ optionName, category, rating }) {
    return `Nobody was brave enough to defend ${optionName}, so I will: ${rating ? `${rating.toFixed(1)} stars` : 'a hidden gem'} of ${category.toLowerCase()} excellence. Vote with your hearts. And stomachs.`;
  },

  async pickTime({ optionName, slots, total }) {
    const best = slots[0]!;
    const who = best.count >= total ? 'Everyone' : `${best.count} of ${total} of you`;
    return { slot: best.slot, blurb: `${who} said you're free ${best.label.toLowerCase()}. ${optionName} it is — no take-backs.` };
  },

  async transcribe(_audio, browserHint) {
    return browserHint?.trim() || '(Voice pitch recorded — set MUSE_API_KEY to transcribe it with Muse Voice.)';
  },

  async poster({ name, category, blurb }) {
    return { contentType: 'image/svg+xml', body: mockPosterSvg(name, category, blurb) };
  },
};

function xml(s: string) {
  return s.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);
}

function wrap(text: string, width: number, maxLines: number) {
  const lines: string[] = [];
  let cur = '';
  for (const w of text.split(/\s+/)) {
    if ((cur + ' ' + w).trim().length > width && cur) {
      lines.push(cur);
      cur = w;
    } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.slice(0, maxLines);
}

const TAGLINES = [
  'ONE GROUP CHAT. ONE DESTINATION. NO SURVIVORS.',
  'THIS SUMMER, SOMEONE HAS TO DECIDE.',
  'THEY CAME FOR SNACKS. THEY STAYED FOR GLORY.',
  'IN A WORLD OF "I DON\'T CARE, YOU PICK"…',
  'BASED ON A TRUE CRAVING.',
];

export function mockPosterSvg(name: string, category: string, blurb: string) {
  const h = hash(name);
  const hue = h % 360;
  const titleLines = wrap(name.toUpperCase(), 13, 3);
  const titleSize = titleLines.some(l => l.length > 10) ? 58 : 72;
  const tagline = pick(TAGLINES, name);
  const blurbLines = wrap(blurb, 34, 3);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900" width="600" height="900">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="hsl(${hue},75%,22%)"/>
      <stop offset="0.6" stop-color="hsl(${(hue + 40) % 360},80%,40%)"/>
      <stop offset="1" stop-color="hsl(${(hue + 80) % 360},85%,55%)"/>
    </linearGradient>
    <radialGradient id="spot" cx="0.5" cy="0.35" r="0.5">
      <stop offset="0" stop-color="#fff" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="600" height="900" fill="url(#g)"/>
  <rect width="600" height="900" fill="url(#spot)"/>
  <text x="300" y="70" text-anchor="middle" font-family="Georgia, serif" font-size="18" letter-spacing="3" fill="#fff" opacity="0.85">A PITCH FIGHT PRODUCTION</text>
  <text x="300" y="330" text-anchor="middle" font-size="190">${categoryEmoji(category)}</text>
  ${titleLines
    .map(
      (l, i) =>
        `<text x="300" y="${470 + i * (titleSize + 8)}" text-anchor="middle" font-family="Impact, 'Arial Black', sans-serif" font-size="${titleSize}" fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke">${xml(l)}</text>`
    )
    .join('\n  ')}
  <text x="300" y="${500 + titleLines.length * (titleSize + 8)}" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="22" fill="#fff">${xml(tagline)}</text>
  ${blurbLines
    .map((l, i) => `<text x="300" y="${740 + i * 28}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="20" fill="#fff" opacity="0.9">${xml(l)}</text>`)
    .join('\n  ')}
  <text x="300" y="870" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="13" letter-spacing="2" fill="#fff" opacity="0.7">${xml(category.toUpperCase())} · RATED G FOR GROUP DECISION</text>
</svg>`;
}

function categoryEmoji(category: string) {
  const c = category.toLowerCase();
  const table: [string, string][] = [
    ['taco', '🌮'], ['mexican', '🌮'], ['pizza', '🍕'], ['italian', '🍝'], ['sushi', '🍣'], ['japanese', '🍱'],
    ['ramen', '🍜'], ['indian', '🍛'], ['chinese', '🥟'], ['thai', '🍜'], ['burger', '🍔'], ['hamburger', '🍔'],
    ['deli', '🥪'], ['sandwich', '🥪'], ['salad', '🥗'], ['vegetarian', '🥦'], ['greek', '🥙'], ['seafood', '🦞'],
    ['bakery', '🥐'], ['tea', '🧋'], ['coffee', '☕'], ['cafe', '☕'], ['ice cream', '🍦'], ['dessert', '🍰'],
    ['bar', '🍸'], ['pub', '🍺'], ['brewery', '🍺'], ['bowling', '🎳'], ['arcade', '🕹️'], ['trampoline', '🤸'],
    ['museum', '🏛️'], ['park', '🌳'], ['karaoke', '🎤'],
  ];
  return table.find(([k]) => c.includes(k))?.[1] ?? '⭐';
}

// ---------------------------------------------------------------------------------------------
// Live Muse host. Endpoint shapes are filled in from the Muse API docs.
// ---------------------------------------------------------------------------------------------

const MUSE = {
  key: process.env.MUSE_API_KEY,
  baseUrl: process.env.MUSE_API_BASE_URL ?? '',
  textModel: process.env.MUSE_TEXT_MODEL ?? '',
  transcribeModel: process.env.MUSE_TRANSCRIBE_MODEL ?? '',
  imageModel: process.env.MUSE_IMAGE_MODEL ?? '',
};

class MuseNotConfigured extends Error {
  constructor(what: string) {
    super(`Muse ${what} is not wired up yet (waiting on API docs)`);
  }
}

const muse: AiHost = {
  mode: 'muse',
  async chooseOptions() {
    throw new MuseNotConfigured('Spark');
  },
  async writePrompt() {
    throw new MuseNotConfigured('Spark');
  },
  async reactToPitch() {
    throw new MuseNotConfigured('Spark');
  },
  async hostPitch() {
    throw new MuseNotConfigured('Spark');
  },
  async pickTime() {
    throw new MuseNotConfigured('Spark');
  },
  async transcribe() {
    throw new MuseNotConfigured('Voice Transcribe');
  },
  async poster() {
    throw new MuseNotConfigured('Image');
  },
};

export function aiHost(): AiHost {
  return MUSE.key ? muse : mock;
}

export const mockHost = mock;

/**
 * Runs a live Muse call with a timeout; on any failure, logs and returns the mock result instead
 * so the game never stalls in front of judges. `mode` tells the UI which one answered.
 */
export async function withFallback<T>(
  label: string,
  live: (ai: AiHost) => Promise<T>,
  timeoutMs = 12_000
): Promise<{ value: T; mode: AiMode | 'mock-fallback' }> {
  const ai = aiHost();
  if (ai.mode === 'mock') return { value: await live(mock), mode: 'mock' };
  try {
    const value = await Promise.race([
      live(ai),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs)),
    ]);
    return { value, mode: 'muse' };
  } catch (err) {
    console.warn(`[muse] ${label} failed, using mock:`, (err as Error).message);
    return { value: await live(mock), mode: 'mock-fallback' };
  }
}
