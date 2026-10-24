// Who defends what. Spread players across options, and avoid giving anyone the place
// that matches their own craving (defending your own pick is too easy).
import type { Vibe } from './questions';

export const PERSONAS = [
  'like a lawyer giving closing arguments in court',
  'like a nature documentary narrator',
  'like a hype-man at a boxing match',
  'like a Shakespearean actor',
  'like a late-night infomercial host',
  'like a sports commentator calling the final seconds',
  'like a conspiracy theorist who has finally cracked the case',
  'like a teary best-man wedding toast',
  'like a pirate captain rallying the crew',
  'like a medieval royal herald',
  'like a TED talk that will change lives',
  'like a real-estate agent showing a dream home',
] as const;

export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export interface AssignPlayer {
  playerId: string;
  name: string;
  vibe: string;
}

export interface AssignOption {
  name: string;
  vibes: Vibe[];
}

export interface Assignment {
  playerId: string;
  optionIndex: number;
  prompt: string;
}

export function assignPlayers(players: AssignPlayer[], options: AssignOption[], seed: string): Assignment[] {
  const load = options.map(() => 0);
  const order = [...players].sort((a, b) => hash(seed + a.playerId) - hash(seed + b.playerId));
  const personaStart = hash(seed) % PERSONAS.length;
  return order.map((p, i) => {
    const ranked = options
      .map((o, idx) => ({ idx, own: o.vibes.includes(p.vibe as Vibe) ? 1 : 0 }))
      .sort((a, b) => load[a.idx]! - load[b.idx]! || a.own - b.own || a.idx - b.idx);
    const pick = ranked[0]!.idx;
    load[pick]!++;
    const persona = PERSONAS[(personaStart + i) % PERSONAS.length];
    return { playerId: p.playerId, optionIndex: pick, prompt: `Defend ${options[pick]!.name} ${persona}.` };
  });
}
