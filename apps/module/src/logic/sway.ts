// Live Sway Meter: anonymous totals of everyone's private lean during the pitches.
import { mostPersuasive, type PersuasionResult, type TallyOption } from './tally';

/** One finalist's anonymous totals, as exposed by the `room_sway` view. */
export interface SwayTotals {
  optionId: bigint;
  /** People leaning toward it right now. */
  leaning: number;
  /** People who picked it in the secret pre-vote. */
  prevoted: number;
}

export interface SwayStanding extends SwayTotals {
  /** Share of everyone currently leaning (0-1). */
  share: number;
  /** Leaning now minus pre-vote picks: positive means the pitches are winning people over. */
  gain: number;
}

export interface SwayResult {
  standings: SwayStanding[];
  leaning: number;
  /** Most Persuasive so far (same rule as the final award), or null until someone has actually moved. */
  persuasive: PersuasionResult | null;
}

const repeat = (optionId: bigint, n: number) => Array.from({ length: n }, () => ({ optionId }));

export function sway(
  options: readonly TallyOption[],
  totals: readonly SwayTotals[],
  assignments: readonly { playerId: bigint; optionId: bigint }[]
): SwayResult {
  const ordered = [...options].sort((a, b) => a.sortOrder - b.sortOrder);
  const byId = new Map(totals.map(t => [t.optionId, t]));
  const rows = ordered.map(o => byId.get(o.id) ?? { optionId: o.id, leaning: 0, prevoted: 0 });
  const leaning = rows.reduce((s, r) => s + r.leaning, 0);
  const standings = rows.map(r => ({ ...r, share: leaning ? r.leaning / leaning : 0, gain: r.leaning - r.prevoted }));
  const best = mostPersuasive(
    ordered,
    rows.flatMap(r => repeat(r.optionId, r.prevoted)),
    rows.flatMap(r => repeat(r.optionId, r.leaning)),
    assignments
  );
  return { standings, leaning, persuasive: best && best.gain > 0 ? best : null };
}
