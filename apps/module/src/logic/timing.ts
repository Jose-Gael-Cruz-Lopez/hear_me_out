export type Phase =
  | 'lobby'
  | 'profiles'
  | 'warmup'
  | 'scouting'
  | 'finalists'
  | 'prevote'
  | 'assigning'
  | 'assignments'
  | 'pitching'
  | 'playback'
  | 'vote'
  | 'results'
  | 'plan'
  | 'ended';

/**
 * Phase deadlines in seconds as [normal, fast]. `null` means the phase has no deadline
 * (it ends on a host action or when an AI job finishes).
 * Waiting phases (scouting, assigning) have a long safety deadline so the round never stalls.
 */
const PHASE_SECONDS: Record<Phase, readonly [number, number] | null> = {
  lobby: null,
  profiles: [75, 6],
  warmup: [45, 3],
  scouting: [120, 20],
  finalists: [15, 2],
  prevote: [15, 2],
  assigning: [20, 8],
  assignments: [12, 2],
  pitching: [60, 8],
  playback: null, // per-pitch, see pitchSeconds
  vote: [20, 2],
  results: [15, 2],
  plan: null,
  ended: null,
};

export function phaseSeconds(phase: Phase, fast: boolean): number | null {
  const entry = PHASE_SECONDS[phase];
  if (!entry) return null;
  return fast ? entry[1] : entry[0];
}

/** How long the TV spends on one pitch: the audio (or reading time for text) plus time for the ruling. */
export function pitchSeconds(opts: { durationMs: number; transcript: string; fast: boolean }): number {
  if (opts.fast) return 2;
  const RULING_SECONDS = 6;
  let body: number;
  if (opts.durationMs > 0) {
    body = opts.durationMs / 1000;
  } else {
    const words = opts.transcript.trim().split(/\s+/).filter(Boolean).length;
    body = words / 2.6;
  }
  return Math.round(Math.min(Math.max(body, 6), 35) + RULING_SECONDS);
}

export const MAX_PLAYERS = 8;
export const MAX_FINALISTS = 4;
export const MIN_FINALISTS = 2;

export function finalistCount(players: number): number {
  return Math.max(MIN_FINALISTS, Math.min(players, MAX_FINALISTS));
}
