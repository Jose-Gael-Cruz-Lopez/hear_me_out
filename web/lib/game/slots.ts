// Turns the "when are you free" answers into concrete times. Runs in the host's browser,
// so "tonight" means tonight in the venue's local time zone.
import { FREE_SLOTS, type FreeSlot } from './questions';

export interface SlotTime {
  slot: FreeSlot;
  label: string;
  start: Date;
  /** How many players picked this slot. */
  count: number;
}

function at(base: Date, dayOffset: number, h: number, m: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d;
}

function soon(now: Date) {
  const d = new Date(now.getTime() + 30 * 60_000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return d;
}

export function slotStart(slot: FreeSlot, now: Date): Date {
  switch (slot) {
    case 'now':
      return soon(now);
    case 'tonight': {
      const seven = at(now, 0, 19, 0);
      return now.getTime() < seven.getTime() - 30 * 60_000 ? seven : soon(now);
    }
    case 'tomorrow-lunch':
      return at(now, 1, 12, 30);
    case 'tomorrow-night':
      return at(now, 1, 19, 0);
    case 'weekend': {
      for (let i = 0; i < 8; i++) {
        const d = at(now, i, 13, 0);
        const dow = d.getDay();
        if ((dow === 6 || dow === 0) && d.getTime() > now.getTime() + 60 * 60_000) return d;
      }
      return at(now, 1, 13, 0);
    }
  }
}

export function formatWhen(d: Date, now: Date) {
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const days = Math.round((at(d, 0, 0, 0).getTime() - at(now, 0, 0, 0).getTime()) / 86_400_000);
  if (days === 0) return `Today · ${time}`;
  if (days === 1) return `Tomorrow · ${time}`;
  return `${d.toLocaleDateString([], { weekday: 'long' })} · ${time}`;
}

/** Every slot anyone picked, best first: most players free, then earliest. */
export function rankSlots(freeWhen: string[][], now: Date): SlotTime[] {
  const counts = new Map<FreeSlot, number>();
  for (const list of freeWhen) for (const s of list) counts.set(s as FreeSlot, (counts.get(s as FreeSlot) ?? 0) + 1);
  const slots = FREE_SLOTS.filter(s => counts.has(s.value)).map(s => {
    const start = slotStart(s.value, now);
    return { slot: s.value, label: formatWhen(start, now), start, count: counts.get(s.value)! };
  });
  if (slots.length === 0) {
    const start = slotStart('now', now);
    return [{ slot: 'now', label: formatWhen(start, now), start, count: 0 }];
  }
  return slots.sort((a, b) => b.count - a.count || a.start.getTime() - b.start.getTime());
}
