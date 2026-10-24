import { describe, expect, it } from 'vitest';
import { sway } from './sway';

const opt = (id: bigint, sortOrder: number) => ({ id, title: `Option ${id}`, groupFitScore: 50, sortOrder });
const options = [opt(10n, 1), opt(20n, 0), opt(30n, 2)];
const assignments = [
  { playerId: 1n, optionId: 10n },
  { playerId: 2n, optionId: 20n },
];

describe('live sway meter', () => {
  it('orders finalists, turns totals into shares, and reports gains since the pre-vote', () => {
    const r = sway(options, [
      { optionId: 10n, leaning: 3, prevoted: 1 },
      { optionId: 20n, leaning: 1, prevoted: 3 },
    ], assignments);
    expect(r.standings.map(s => s.optionId)).toEqual([20n, 10n, 30n]);
    expect(r.leaning).toBe(4);
    expect(r.standings.map(s => s.share)).toEqual([0.25, 0.75, 0]);
    expect(r.standings.map(s => s.gain)).toEqual([-2, 2, 0]);
  });

  it('names Most Persuasive as soon as a defended place gains ground', () => {
    const r = sway(options, [{ optionId: 10n, leaning: 2, prevoted: 1 }, { optionId: 20n, leaning: 1, prevoted: 2 }], assignments);
    expect(r.persuasive).toEqual({ optionId: 10n, gain: 1, advocateIds: [1n] });
  });

  it('names nobody until someone actually moves, and ignores undefended places', () => {
    expect(sway(options, [{ optionId: 10n, leaning: 2, prevoted: 2 }], assignments).persuasive).toBeNull();
    // Only option 30 gained, but nobody defends it.
    expect(sway(options, [{ optionId: 30n, leaning: 1, prevoted: 0 }, { optionId: 10n, leaning: 0, prevoted: 1 }], assignments).persuasive).toBeNull();
  });

  it('handles a room where nobody leans yet', () => {
    const r = sway(options, [], assignments);
    expect(r.leaning).toBe(0);
    expect(r.standings.every(s => s.share === 0 && s.gain === 0)).toBe(true);
  });
});
