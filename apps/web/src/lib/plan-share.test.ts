import { describe, expect, it, vi } from 'vitest';
import { canSharePoster, facebookShareUrl, planShareCaption, posterFilename, publicVenueUrl } from './plan-share';

const details = { title: 'A café & friends', slotLabel: 'Saturday · 7pm', address: '100 Main St', category: 'Coffee', mapsUrl: 'https://www.google.com/maps/place/cafe' };

describe('social plan exports', () => {
  it('shares public event details without a private room or attendee list', () => {
    expect(planShareCaption(details)).toBe('A café & friends\nSaturday · 7pm\n100 Main St\nhttps://www.google.com/maps/place/cafe');
    expect(new URL(facebookShareUrl(details)).searchParams.get('u')).toBe(details.mapsUrl);
    expect(new URL(facebookShareUrl(details)).searchParams.has('quote')).toBe(false);
  });
  it.each(['http://localhost:5175/play/ABCD', 'https://hear-me-out.example/play/ABCD', 'javascript:alert(1)', 'https://www.google.com.evil.test/maps', 'http://www.google.com/maps/place/cafe', 'https://someone:secret@www.google.com/maps'])('never shares a room, unsafe or credentialed URL: %s', mapsUrl => {
    const url = publicVenueUrl({ ...details, mapsUrl });
    expect(url).toContain('https://www.google.com/maps/search/?api=1&query=');
    expect(new URL(url).searchParams.get('query')).toBe('A café & friends, 100 Main St');
  });
  it('accepts public Maps short links', () => {
    expect(publicVenueUrl({ ...details, mapsUrl: 'https://maps.app.goo.gl/abc' })).toBe('https://maps.app.goo.gl/abc');
  });
  it('uses a safe portable PNG name', () => {
    expect(posterFilename('../Café & 朋友 / sunset')).toBe('cafe-sunset-invite.png');
    expect(posterFilename('🌞')).toBe('hear-me-out-invite.png');
  });
  it('requires file-specific share support and handles browser rejections', () => {
    const file = {} as File;
    expect(canSharePoster(file, { share: async () => {}, canShare: data => data?.files?.[0] === file })).toBe(true);
    expect(canSharePoster(file, { share: async () => {}, canShare: () => false })).toBe(false);
    expect(canSharePoster(file, { share: async () => {}, canShare: () => { throw new Error('unsupported'); } })).toBe(false);
    expect(canSharePoster(file, { share: undefined, canShare: undefined } as unknown as Navigator)).toBe(false);
  });
  it('returns false without a browser navigator (server rendering)', () => {
    vi.stubGlobal('navigator', undefined);
    try { expect(canSharePoster({} as File)).toBe(false); }
    finally { vi.unstubAllGlobals(); }
  });
});
