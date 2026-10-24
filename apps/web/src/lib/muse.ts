// The Muse connection, its connectors and the reservation are SIMULATED for the demo, shown without labels
// (product decision, DECISIONS.md #40). Meta has no public API for personal Muse memory or bookings yet;
// swap museMemory() and the reservation card for the real calls when they exist. Nothing is ever booked.

const MEMORIES = [
  'Loves spicy ramen and late-night noodle spots. Usually spends about $20 on dinner. Free most evenings after 7pm. Into board game nights and anime. Close friends: Priya and Sam, who are both vegetarian.',
  'Big on tacos, live music and craft beer. Budget around $25. Free Friday and Saturday nights. Goes bowling with coworkers. Friends with lots of karaoke fans.',
  'Coffee and dessert person, prefers cozy quiet spots. Vegetarian. Budget about $15-20. Free after 6pm. Joins weekly trivia and escape rooms with college friends.',
  'Adventurous eater: Korean BBQ, Thai, dumplings. Night owl, free after 8pm. Loves arcades and photography walks. Connected with a climbing group and a film club.',
];

function hash(seed: string): number {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export function museMemory(seed: string): string {
  return MEMORIES[hash(seed) % MEMORIES.length];
}

export function museMemoryCount(seed: string): number {
  return 11 + (hash(seed + 'n') % 17);
}

export const MUSE_CONNECTORS = [
  { icon: 'spark', name: 'Meta Muse', detail: 'Memories and preferences' },
  { icon: 'calendar', name: 'Calendar', detail: 'Free/busy times' },
  { icon: 'map', name: 'Maps', detail: 'Places and travel times' },
  { icon: 'ticket', name: 'Reservations', detail: 'Tables, tickets and bookings' },
] as const;

/** Same code on every screen in the room. */
export function reservationCode(seed: string): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let h = hash(seed);
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += abc[h % abc.length];
    h = Math.floor(h / abc.length) + hash(seed + i);
  }
  return out;
}

export function reservationWhat(category: string, party: number): string {
  if (category === 'movie') return `${party} ${party === 1 ? 'ticket' : 'tickets'}`;
  if (category === 'activity') return `a booking for ${party}`;
  return `a table for ${party}`;
}
