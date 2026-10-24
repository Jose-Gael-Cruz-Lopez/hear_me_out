import { describe, expect, it } from 'vitest';
import { openIntervalsForDay, parseDayHours } from './hours';
import { priceLevelFrom } from './venue';
import { buildIcs, googleCalendarUrl } from './ics';

const nb = ' '; // Google uses narrow no-break spaces before AM/PM

describe('parseDayHours', () => {
  it('parses simple ranges with narrow spaces', () => {
    expect(parseDayHours(`11${nb}AM to 9${nb}PM`)).toEqual([{ startMin: 660, endMin: 1260 }]);
  });
  it('inherits the meridiem for the start time', () => {
    expect(parseDayHours(`5 to 10${nb}PM`)).toEqual([{ startMin: 1020, endMin: 1320 }]);
    expect(parseDayHours(`12 to 9${nb}PM`)).toEqual([{ startMin: 720, endMin: 1260 }]);
  });
  it('handles split days and after-midnight closing', () => {
    expect(parseDayHours(`11:30${nb}AM to 3${nb}PM, 4:30 to 10${nb}PM`)).toEqual([
      { startMin: 690, endMin: 900 },
      { startMin: 990, endMin: 1320 },
    ]);
    expect(parseDayHours(`5${nb}PM to 2${nb}AM`)).toEqual([{ startMin: 1020, endMin: 1560 }]);
    expect(parseDayHours(`11:30${nb}AM to 12${nb}AM`)).toEqual([{ startMin: 690, endMin: 1440 }]);
  });
  it('knows closed, 24 hours and junk', () => {
    expect(parseDayHours('Closed')).toEqual([]);
    expect(parseDayHours('Open 24 hours')).toEqual([{ startMin: 0, endMin: 1440 }]);
    expect(parseDayHours('Hours might differ')).toBeNull();
  });
});

describe('openIntervalsForDay', () => {
  const week = [
    { day: 'Friday', hours: `5${nb}PM to 2${nb}AM` },
    { day: 'Saturday', hours: `6${nb}PM to 1${nb}AM` },
  ];
  it('adds yesterday spillover', () => {
    const sat = openIntervalsForDay(week, 6);
    expect(sat.hoursKnown).toBe(true);
    expect(sat.open).toEqual([
      { startMin: 0, endMin: 120 },
      { startMin: 1080, endMin: 1500 },
    ]);
  });
  it('is unknown when the day is missing', () => {
    expect(openIntervalsForDay(week, 2).hoursKnown).toBe(false);
  });
});

describe('priceLevelFrom', () => {
  it('maps dollar signs and ranges', () => {
    expect(priceLevelFrom('$$').level).toBe(2);
    expect(priceLevelFrom('$10–20').level).toBe(1);
    expect(priceLevelFrom('$20–30').level).toBe(2);
    expect(priceLevelFrom('$30–40').level).toBe(3);
    expect(priceLevelFrom('$50–100').level).toBe(4);
    expect(priceLevelFrom('$100+').level).toBe(4);
    expect(priceLevelFrom(null).level).toBe(0);
  });
});

describe('calendar', () => {
  const e = { uid: 'x@hmo', title: 'Ramen, finally', description: 'Line 1\nLine 2, with comma', location: '1 Main St', start: new Date('2026-10-25T02:30:00Z'), end: new Date('2026-10-25T04:00:00Z') };
  it('builds a valid VEVENT', () => {
    const ics = buildIcs(e);
    expect(ics).toContain('DTSTART:20261025T023000Z');
    expect(ics).toContain('DESCRIPTION:Line 1\\nLine 2\\, with comma');
    expect(ics.split('\r\n').every(l => l.length <= 75)).toBe(true);
  });
  it('builds a Google Calendar link', () => {
    expect(googleCalendarUrl(e)).toContain('dates=20261025T023000Z%2F20261025T040000Z');
  });
});
