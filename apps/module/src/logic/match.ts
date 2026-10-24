// Strangers mode: how well a visitor's vibe matches an open lobby. Pure, so it runs in a reducer.

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Weighted tag overlap (up to ~70 points) plus closeness (up to 30 points, zero at 10 km).
 * Lobbies without a location ("online") get a neutral 15 for distance.
 */
export function matchScore(visitorTags: readonly string[], roomTags: readonly string[], distanceKm: number | null): { score: number; shared: string[] } {
  const room = new Set(roomTags);
  const shared = [...new Set(visitorTags)].filter(t => room.has(t));
  const union = new Set([...visitorTags, ...roomTags]).size || 1;
  const tagScore = shared.length === 0 ? 0 : (shared.length / union) * 49 + Math.min(shared.length, 3) * 7;
  const distScore = distanceKm === null ? 15 : Math.max(0, 30 * (1 - distanceKm / 10));
  return { score: Math.round(Math.min(100, tagScore + distScore)), shared };
}

export function matchBlurbFallback(shared: readonly string[], playerCount: number): string {
  if (shared.length === 0) return playerCount > 0 ? `${playerCount} people, new vibes. Could be fun!` : 'Be the first one in.';
  const list = shared.slice(0, 2).map(t => t.replace(/-/g, ' '));
  return `You'd vibe: you're all into ${list.join(' and ')}.`;
}

const ADJ = ['Taco', 'Spicy', 'Midnight', 'Hungry', 'Noodle', 'Karaoke', 'Cozy', 'Chaotic', 'Fancy', 'Sneaky', 'Saucy', 'Crunchy'];
const NOUN = ['Lawyers', 'Jury', 'Detectives', 'Council', 'Squad', 'Society', 'Committee', 'Tribunal', 'Crew', 'Senate'];

/** "The Taco Lawyers" — a fun group name so merge offers can say who picked the same place. */
export function groupName(randInt: (n: number) => number): string {
  return `The ${ADJ[randInt(ADJ.length)]} ${NOUN[randInt(NOUN.length)]}`;
}

export function mergeIntroFallback(a: string, b: string, venue: string, slot: string): string {
  return `Two juries, one verdict: ${a}, meet ${b}! You both picked ${venue} (${slot}). Pull up a chair and swap your best pitch.`;
}

/** First names only in public rooms: one word, letters (plus ' and -), 1-20 chars. */
export function isFirstName(name: string): boolean {
  return /^[\p{L}'-]{1,20}$/u.test(name.trim());
}
