import { describe, expect, it } from 'vitest';
import { assignDefenders } from './assign';
import { busyFromWeek, formatSlotLabel, localMidnightMicros, localMinutes, localWeekday, pickSlot, slotBusyness } from './slot';
import { mostPersuasive, tallyVotes } from './tally';
import { sanitizeTag, sanitizeTags, topTags, uniqueName } from './text';
import { makeRoomCode } from './codes';
import { bestLineFallback } from './fallbacks';

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return s / 2 ** 31;
  };
}

describe('assignDefenders', () => {
  it('covers every option and avoids own picks when possible', () => {
    for (let seed = 1; seed < 50; seed++) {
      const players = [
        { id: 1n, prevote: 10n },
        { id: 2n, prevote: 10n },
        { id: 3n, prevote: 20n },
        { id: 4n, prevote: 30n },
        { id: 5n, prevote: null },
      ];
      const m = assignDefenders(players, [10n, 20n, 30n], seeded(seed));
      expect(m.size).toBe(5);
      const covered = new Set([...m.values()].map(a => a.optionId));
      expect(covered).toEqual(new Set([10n, 20n, 30n]));
      for (const p of players) expect(m.get(p.id)!.optionId).not.toBe(p.prevote);
    }
  });
  it('marks co-counsel when players outnumber options', () => {
    const m = assignDefenders([{ id: 1n, prevote: null }, { id: 2n, prevote: null }, { id: 3n, prevote: null }], [10n, 20n], seeded(3));
    expect([...m.values()].filter(a => a.coCounsel).length).toBe(2);
  });
});

describe('pickSlot', () => {
  const venue = { hoursKnown: true, open: [{ startMin: 17 * 60, endMin: 22 * 60 }] };
  it('finds the earliest slot everyone can make', () => {
    const s = pickSlot({
      nowMin: 12 * 60,
      players: [
        { id: 1n, windows: [{ startMin: 18 * 60, endMin: 23 * 60 }] },
        { id: 2n, windows: [{ startMin: 19 * 60, endMin: 22 * 60 }] },
        { id: 3n, windows: [] },
      ],
      venue,
      slotLen: 90,
    });
    expect(s).toMatchObject({ startMin: 19 * 60, endMin: 20 * 60 + 30, cantMake: [] });
  });
  it('maximizes attendance and names who cannot make it', () => {
    const s = pickSlot({
      nowMin: 12 * 60,
      players: [
        { id: 1n, windows: [{ startMin: 17 * 60, endMin: 19 * 60 }] },
        { id: 2n, windows: [{ startMin: 17 * 60, endMin: 19 * 60 }] },
        { id: 3n, windows: [{ startMin: 20 * 60, endMin: 22 * 60 }] },
      ],
      venue,
      slotLen: 90,
    });
    expect(s.cantMake).toEqual([3n]);
    expect(s.startMin).toBe(17 * 60);
  });
  it('respects the lead time from now', () => {
    const s = pickSlot({ nowMin: 19 * 60 + 10, players: [{ id: 1n, windows: [] }], venue, slotLen: 60 });
    expect(s.startMin).toBe(19 * 60 + 45);
  });
  it('formats labels', () => {
    expect(formatSlotLabel(19 * 60 + 30, 21 * 60, 600)).toBe('Tonight · 7:30 PM – 9:00 PM');
    expect(formatSlotLabel(1440 + 19 * 60, 1440 + 20 * 60, 600)).toBe('Tomorrow · 7:00 PM – 8:00 PM');
  });
  it('converts local time with a timezone offset', () => {
    const utcMidnightPlus3h = BigInt(Date.UTC(2026, 9, 24, 3, 0)) * 1000n; // 03:00Z = 20:00 PDT the day before
    expect(localMinutes(utcMidnightPlus3h, -420)).toBe(20 * 60);
    const midnight = localMidnightMicros(utcMidnightPlus3h, -420);
    expect(new Date(Number(midnight / 1000n)).toISOString()).toBe('2026-10-23T07:00:00.000Z');
  });
});

describe('tally', () => {
  const options = [
    { id: 1n, title: 'Ramen', groupFitScore: 80, sortOrder: 0 },
    { id: 2n, title: 'Tacos', groupFitScore: 90, sortOrder: 1 },
  ];
  it('breaks ties by group fit', () => {
    const r = tallyVotes(options, [{ optionId: 1n }, { optionId: 2n }]);
    expect(r.winnerId).toBe(2n);
    expect(r.tied).toBe(true);
    expect(r.tiebreakText).toContain('Tacos');
  });
  it('finds the most persuasive advocate', () => {
    const r = mostPersuasive(options, [{ optionId: 1n }, { optionId: 1n }], [{ optionId: 2n }, { optionId: 2n }], [
      { playerId: 7n, optionId: 2n },
      { playerId: 8n, optionId: 1n },
    ]);
    expect(r).toMatchObject({ optionId: 2n, gain: 2, advocateIds: [7n] });
  });
});

describe('text', () => {
  it('numbers a name someone already has', () => {
    expect(uniqueName('Sam', ['Leo'])).toBe('Sam');
    expect(uniqueName('sam', ['Sam', 'Sam 2'])).toBe('sam 3');
  });
  it('sanitizes tags', () => {
    expect(sanitizeTag('  Spicy Food!! ')).toBe('spicy-food');
    expect(sanitizeTags(['A', 'a', 'B c', ''], 8)).toEqual(['a', 'b-c']);
    expect(topTags([['x', 'y'], ['y'], ['z', 'y']])[0]).toBe('y');
  });
  it('makes 4-letter codes without I or O', () => {
    const code = makeRoomCode(n => Math.floor(seeded(9)() * n));
    expect(code).toMatch(/^[A-HJ-NP-Z]{4}$/);
  });
  it('picks a punchy best line', () => {
    const b = bestLineFallback([{ playerId: 1n, text: 'This place is fine. It has the best broth in the entire city!' }]);
    expect(b?.quote).toBe('It has the best broth in the entire city!');
  });
});

describe('busyness-aware timing', () => {
  // Friday (weekday 5): packed at 7pm, quieter by 8pm.
  const week = new Array<number>(168).fill(0);
  Object.assign(week, { [5 * 24 + 18]: 60, [5 * 24 + 19]: 85, [5 * 24 + 20]: 45, [5 * 24 + 21]: 30 });
  const busyAt = busyFromWeek(week, 5)!;
  const players = [{ id: 1n, windows: [{ startMin: 19 * 60, endMin: 23 * 60 }] }];
  const venue = { hoursKnown: true, open: [{ startMin: 17 * 60, endMin: 23 * 60 }] };

  it('goes a bit later when the earliest free slot is packed, and says what it avoided', () => {
    const s = pickSlot({ nowMin: 12 * 60, players, venue, slotLen: 90, busyAt });
    expect(s.naiveStartMin).toBe(19 * 60);
    expect(s.naiveBusyPct).toBe(85);
    expect(s.startMin).toBeGreaterThan(19 * 60);
    expect(s.busyPct!).toBeLessThan(60);
    expect(s.cantMake).toEqual([]);
  });

  it("doesn't make people wait for a tiny gain, and keeps the earliest slot without popular times", () => {
    const flat = busyFromWeek(new Array<number>(168).fill(40), 5)!;
    expect(pickSlot({ nowMin: 12 * 60, players, venue, slotLen: 90, busyAt: flat }).startMin).toBe(19 * 60);
    expect(pickSlot({ nowMin: 12 * 60, players, venue, slotLen: 90 }).startMin).toBe(19 * 60);
    expect(busyFromWeek([], 5)).toBeUndefined();
  });

  it('never picks a 0% hour: Google shows 0 when the place is closed', () => {
    const closing = new Array<number>(168).fill(0);
    Object.assign(closing, { [5 * 24 + 18]: 70, [5 * 24 + 19]: 90 }); // closes at 8pm
    const s = pickSlot({ nowMin: 12 * 60, players, venue: { hoursKnown: false, open: [] }, slotLen: 90, busyAt: busyFromWeek(closing, 5) });
    expect(s.startMin).toBe(19 * 60);
    expect(slotBusyness(busyFromWeek(closing, 5)!, 20 * 60)).toBeNull();
  });

  it('blends the hours a slot spans and wraps weekdays', () => {
    expect(slotBusyness(busyAt, 19 * 60 + 30)).toBe(65);
    expect(localWeekday(0n, 0)).toBe(4); // 1970-01-01, Thursday
    expect(busyFromWeek(week, 4)!(1440 + 19 * 60)).toBe(85); // Thursday + 1 day = Friday 7pm
  });
});
