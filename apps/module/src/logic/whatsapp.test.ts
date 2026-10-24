import { describe, expect, it } from 'vitest';
import { groupIntro, isWhatsAppInvite, normalizeInvite, shareText, suggestedGroupName, waShareUrl, type MeetupFacts } from './whatsapp';

const LINK = 'https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv';
const meetup: MeetupFacts = {
  groupName: 'The Taco Lawyers',
  venueTitle: 'Tacolicious & Co',
  address: '2250 Chestnut St',
  mapsUrl: 'https://www.google.com/maps/place/?q=place_id:abc',
  slotLabel: 'Tonight 7:00–8:30 PM',
  going: ['Ivy', 'Jun', 'Kai'],
  icebreakers: ['Best taco you ever had?'],
};

describe('whatsapp invite links', () => {
  it('accepts WhatsApp group invites, trimming spaces and a trailing slash', () => {
    expect(isWhatsAppInvite(LINK)).toBe(true);
    expect(normalizeInvite(`  ${LINK}/ `)).toBe(LINK);
    expect(isWhatsAppInvite(`  ${LINK}/ `)).toBe(true);
  });

  it('rejects anything else', () => {
    for (const bad of [
      '',
      'http://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv',
      'https://chat.whatsapp.com.evil.example/AbCdEfGhIjKlMnOpQrStUv',
      'https://evil.example/chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv',
      'https://wa.me/15551234567',
      'https://chat.whatsapp.com/short',
      'https://chat.whatsapp.com/invite/AbCdEfGhIjKlMnOpQrStUv',
      'https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv?x=1',
      'javascript:alert(1)',
    ]) {
      expect(isWhatsAppInvite(bad), bad).toBe(false);
    }
  });
});

describe('whatsapp group generation', () => {
  it('suggests a group name within WhatsApp limits', () => {
    expect(suggestedGroupName(meetup)).toBe('The Taco Lawyers · Tacolicious & Co');
    expect(suggestedGroupName({ groupName: '', venueTitle: '' })).toBe('Hear Me Out meetup');
    const long = suggestedGroupName({ groupName: 'x'.repeat(80), venueTitle: 'y'.repeat(80) });
    expect(long.length).toBe(100);
    expect(long.endsWith('…')).toBe(true);
  });

  it('writes a first message with names, place, time, map and an icebreaker', () => {
    const intro = groupIntro(meetup);
    expect(intro).toContain('Ivy, Jun and Kai');
    expect(intro).toContain('Tacolicious & Co, 2250 Chestnut St');
    expect(intro).toContain('Tonight 7:00–8:30 PM');
    expect(intro).toContain(meetup.mapsUrl);
    expect(intro).toContain('Best taco you ever had?');
    expect(groupIntro({ ...meetup, going: [], icebreakers: [] })).toContain('Hi everyone!');
  });

  it('builds a fully encoded wa.me share link that round-trips', () => {
    const text = shareText(meetup, LINK);
    expect(text).toContain(LINK);
    const url = waShareUrl(text);
    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
    expect(url).not.toMatch(/[\s&]Co/);
    expect(decodeURIComponent(url.slice('https://wa.me/?text='.length))).toBe(text);
  });
});
