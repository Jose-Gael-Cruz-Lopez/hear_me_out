import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { factcheckLocal, type VenueRecord } from './factcheck';
import { evaluate, pickVaried, shortlist, type Member } from './curation';
import { loadFixtureAreas } from './venues';
import { offlineStylePrompt } from './offline';

const venue: VenueRecord = {
  title: 'Pho Real',
  category: 'Vietnamese restaurant',
  rating: 4.4,
  reviewCount: 812,
  priceLevel: 2,
  travelMin: 14,
  hoursKnown: true,
  hoursText: '11 AM–9 PM',
  openIntervals: [{ startMin: 660, endMin: 1260 }],
  dietaryNotes: ['Google lists "Vegetarian options"'],
};

describe('factcheckLocal', () => {
  it('sustains a wrong closing time', () => {
    expect(factcheckLocal('Trust me, it is open until midnight!', venue)).toEqual({ kind: 'sustained', text: 'OBJECTION SUSTAINED: it closes at 9:00 PM, not midnight.' });
  });
  it('verifies a true rating', () => {
    expect(factcheckLocal('It has 4.4 stars, people.', venue).kind).toBe('verified');
  });
  it('sustains an inflated rating and prefers objections over verifications', () => {
    const r = factcheckLocal('Five stars and super cheap!', venue);
    expect(r.kind).toBe('sustained');
    expect(r.text).toContain('4.4 stars');
  });
  it('checks distance claims', () => {
    expect(factcheckLocal('Only a 2 minute walk', venue).kind).toBe('sustained');
    expect(factcheckLocal('About 15 minutes away', venue).kind).toBe('verified');
  });
  it('returns none without claims', () => {
    expect(factcheckLocal('I just really like soup.', venue)).toEqual({ kind: 'none', text: '' });
  });
});

describe('curation on recorded fixtures', () => {
  const [area] = loadFixtureAreas(resolve(import.meta.dirname, '../../../../fixtures'));
  const group: Member[] = [
    { playerId: 1n, name: 'Sam', budgetMax: 2, dietary: ['vegetarian'], maxTravelMin: 25, windows: [{ startMin: 1080, endMin: 1380 }], tags: ['ramen'] },
    { playerId: 2n, name: 'Priya', budgetMax: 3, dietary: [], maxTravelMin: 30, windows: [], tags: ['tacos', 'spicy-food'] },
  ];
  it('loads the recorded area', () => {
    expect(area.venues.food.length).toBeGreaterThan(20);
  });
  it('prefers venues that meet every constraint and labels stretches', () => {
    const cands = evaluate(area.venues.food, group, { center: area, weekday: 6, nowMin: 600, category: 'food' });
    const short = shortlist(cands, group, 2);
    const picks = pickVaried(short, 2);
    expect(picks).toHaveLength(2);
    for (const c of picks) {
      if (!c.stretchNote) {
        expect(c.dietOk && c.budgetOk && c.travelOk && c.hoursOk).toBe(true);
      }
      expect(c.fitLines.map(l => l.line.split(':')[0])).toEqual(['Sam', 'Priya']);
    }
    expect(new Set(picks.map(c => c.venue.category)).size).toBe(2);
  });
});

describe('offline style prompts', () => {
  it('uses a tag twist', () => {
    expect(offlineStylePrompt('Pho Real', ['night-owl'], 1)).toBe('Defend Pho Real like a nature-documentary narrator at 2am after three espressos.');
  });
});

describe('audio conversion', () => {
  it('converts a recording to 24 kHz mono 16-bit WAV with ffmpeg', async () => {
    const { toWav } = await import('./audio');
    const rate = 8000;
    const n = rate;
    const buf = Buffer.alloc(44 + n * 2);
    buf.write('RIFF', 0);
    buf.writeUInt32LE(36 + n * 2, 4);
    buf.write('WAVEfmt ', 8);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(2, 22); // stereo in
    buf.writeUInt32LE(rate, 24);
    buf.writeUInt32LE(rate * 4, 28);
    buf.writeUInt16LE(4, 32);
    buf.writeUInt16LE(16, 34);
    buf.write('data', 36);
    buf.writeUInt32LE(n * 2, 40);
    const out = await toWav(new Uint8Array(buf), 'audio/wav');
    expect(out.toString('ascii', 0, 4)).toBe('RIFF');
    expect(out.readUInt16LE(22)).toBe(1); // mono
    expect(out.readUInt32LE(24)).toBe(24000);
    expect(out.readUInt16LE(34)).toBe(16);
  });
});
