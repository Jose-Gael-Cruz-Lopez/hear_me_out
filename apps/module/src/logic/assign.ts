export interface AssignPlayer {
  id: bigint;
  /** The player's secret favorite, or null if they did not pre-vote. */
  prevote: bigint | null;
}

export interface Assignment {
  optionId: bigint;
  coCounsel: boolean;
}

function shuffled<T>(items: readonly T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Give every player an option to defend.
 * 1. Every option gets at least one advocate (while players remain), preferring a player who did NOT pick it.
 * 2. Extra players become co-counsel on the least-defended option that is not their own pick.
 */
export function assignDefenders(
  players: readonly AssignPlayer[],
  optionIds: readonly bigint[],
  rand: () => number
): Map<bigint, Assignment> {
  const result = new Map<bigint, Assignment>();
  if (optionIds.length === 0) return result;

  const counts = new Map<bigint, number>(optionIds.map(id => [id, 0]));
  const pool = shuffled(players, rand);

  // Cover options with the fewest eligible advocates first, so greedy choice strands nobody.
  const eligibleCount = (optionId: bigint) => pool.filter(p => p.prevote !== optionId).length;
  const coverOrder = shuffled(optionIds, rand).sort((a, b) => eligibleCount(a) - eligibleCount(b));

  for (const optionId of coverOrder) {
    const free = pool.filter(p => !result.has(p.id));
    if (free.length === 0) break;
    const pick = free.find(p => p.prevote !== optionId) ?? free[0];
    result.set(pick.id, { optionId, coCounsel: false });
    counts.set(optionId, (counts.get(optionId) ?? 0) + 1);
  }

  for (const p of pool) {
    if (result.has(p.id)) continue;
    const candidates = optionIds.filter(id => id !== p.prevote);
    const choices = candidates.length > 0 ? candidates : [...optionIds];
    const min = Math.min(...choices.map(id => counts.get(id) ?? 0));
    const least = shuffled(choices.filter(id => (counts.get(id) ?? 0) === min), rand);
    const optionId = least[0];
    result.set(p.id, { optionId, coCounsel: true });
    counts.set(optionId, (counts.get(optionId) ?? 0) + 1);
  }

  // Anyone sharing an option with another advocate is co-counsel.
  for (const [playerId, a] of result) {
    result.set(playerId, { optionId: a.optionId, coCounsel: (counts.get(a.optionId) ?? 0) > 1 });
  }
  return result;
}
