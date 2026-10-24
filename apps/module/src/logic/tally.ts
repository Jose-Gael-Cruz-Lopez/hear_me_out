export interface TallyOption {
  id: bigint;
  title: string;
  groupFitScore: number;
  sortOrder: number;
}

export interface TallyResult {
  counts: Map<bigint, number>;
  winnerId: bigint;
  tied: boolean;
  /** One line explaining the tie-break, or '' when there was no tie. */
  tiebreakText: string;
}

export function tallyVotes(options: readonly TallyOption[], votes: readonly { optionId: bigint }[]): TallyResult {
  const counts = new Map<bigint, number>(options.map(o => [o.id, 0]));
  for (const v of votes) if (counts.has(v.optionId)) counts.set(v.optionId, (counts.get(v.optionId) ?? 0) + 1);

  const max = Math.max(0, ...counts.values());
  const leaders = options.filter(o => (counts.get(o.id) ?? 0) === max);
  const ranked = [...leaders].sort((a, b) => b.groupFitScore - a.groupFitScore || a.sortOrder - b.sortOrder);
  const winner = ranked[0];
  if (!winner) return { counts, winnerId: 0n, tied: false, tiebreakText: '' };

  if (leaders.length < 2) return { counts, winnerId: winner.id, tied: false, tiebreakText: '' };
  const runnerUp = ranked[1];
  const tiebreakText =
    winner.groupFitScore === runnerUp.groupFitScore
      ? `The Judge breaks the tie: ${winner.title} was on the docket first.`
      : `The Judge breaks the tie: ${winner.title} fits the whole group better (${winner.groupFitScore} vs ${runnerUp.groupFitScore}).`;
  return { counts, winnerId: winner.id, tied: true, tiebreakText };
}

export interface PersuasionResult {
  optionId: bigint;
  gain: number;
  advocateIds: bigint[];
}

/** The option that gained the most votes between the secret pre-vote and the final vote, and who defended it. */
export function mostPersuasive(
  options: readonly TallyOption[],
  prevotes: readonly { optionId: bigint }[],
  votes: readonly { optionId: bigint }[],
  assignments: readonly { playerId: bigint; optionId: bigint }[]
): PersuasionResult | null {
  let best: PersuasionResult | null = null;
  for (const o of [...options].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const advocates = assignments.filter(a => a.optionId === o.id).map(a => a.playerId);
    if (advocates.length === 0) continue;
    const gain = votes.filter(v => v.optionId === o.id).length - prevotes.filter(v => v.optionId === o.id).length;
    if (!best || gain > best.gain) best = { optionId: o.id, gain, advocateIds: advocates };
  }
  return best;
}
