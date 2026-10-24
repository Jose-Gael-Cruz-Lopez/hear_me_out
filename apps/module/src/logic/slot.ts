export interface Win {
  startMin: number;
  endMin: number;
}

export interface SlotPlayer {
  id: bigint;
  /** Empty means "flexible": available any time tonight. */
  windows: readonly Win[];
}

export interface SlotResult {
  startMin: number;
  endMin: number;
  attendees: bigint[];
  cantMake: bigint[];
}

const DAY = 1440;
const LATEST_START = 25 * 60; // 1am

function covers(windows: readonly Win[], start: number, end: number): boolean {
  return windows.some(w => w.startMin <= start && w.endMin >= end);
}

function shift(windows: readonly Win[], by: number): Win[] {
  return windows.map(w => ({ startMin: w.startMin + by, endMin: w.endMin + by }));
}

function search(
  fromMin: number,
  players: readonly SlotPlayer[],
  venueOpen: readonly Win[] | null,
  slotLen: number,
  dayOffset: number
): SlotResult | null {
  const step = 15;
  let best: SlotResult | null = null;
  const first = Math.ceil(fromMin / step) * step;
  for (let s = first; s <= LATEST_START + dayOffset; s += step) {
    const e = s + slotLen;
    if (venueOpen && !covers(venueOpen, s, e)) continue;
    const attendees: bigint[] = [];
    const cantMake: bigint[] = [];
    for (const p of players) {
      const windows = shift(p.windows, dayOffset);
      if (p.windows.length === 0 || covers(windows, s, e)) attendees.push(p.id);
      else cantMake.push(p.id);
    }
    if (cantMake.length === 0) return { startMin: s, endMin: e, attendees, cantMake };
    if (!best || attendees.length > best.attendees.length) best = { startMin: s, endMin: e, attendees, cantMake };
  }
  return best && best.attendees.length > 0 ? best : null;
}

/**
 * Earliest slot (at least `leadMin` from now) that everyone can make and the venue is open for.
 * If nobody-misses is impossible, the slot with the most attendees (earliest on ties).
 * If tonight has no workable slot at all, tries the same windows tomorrow.
 */
export function pickSlot(args: {
  nowMin: number;
  players: readonly SlotPlayer[];
  venue: { hoursKnown: boolean; open: readonly Win[] };
  slotLen: number;
  leadMin?: number;
}): SlotResult {
  const lead = args.leadMin ?? 30;
  const open = args.venue.hoursKnown ? args.venue.open : null;
  const tonight = search(args.nowMin + lead, args.players, open, args.slotLen, 0);
  if (tonight && tonight.cantMake.length === 0) return tonight;

  const tomorrowOpen = open ? shift(open, DAY) : null;
  const tomorrow = search(DAY, args.players, tomorrowOpen, args.slotLen, DAY);
  if (tomorrow && (!tonight || tomorrow.attendees.length > tonight.attendees.length)) return tomorrow;
  if (tonight) return tonight;

  // Nothing fits: default to 7pm (or the next quarter hour) and let the plan say who can't make it.
  const start = Math.max(19 * 60, Math.ceil((args.nowMin + lead) / 15) * 15);
  return { startMin: start, endMin: start + args.slotLen, attendees: [], cantMake: args.players.map(p => p.id) };
}

const pad = (n: number) => String(n).padStart(2, '0');

export function formatClock(min: number): string {
  const m = ((min % DAY) + DAY) % DAY;
  const h24 = Math.floor(m / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${pad(m % 60)} ${h24 < 12 ? 'AM' : 'PM'}`;
}

export function formatSlotLabel(startMin: number, endMin: number, nowMin: number): string {
  const day = startMin >= DAY ? 'Tomorrow' : startMin >= 17 * 60 || nowMin >= 17 * 60 ? 'Tonight' : 'Today';
  return `${day} · ${formatClock(startMin)} – ${formatClock(endMin)}`;
}

/** Minutes since local midnight for a UTC instant. */
export function localMinutes(nowMicros: bigint, tzOffsetMin: number): number {
  const localMs = Number(nowMicros / 1000n) + tzOffsetMin * 60_000;
  const dayMs = ((localMs % 86_400_000) + 86_400_000) % 86_400_000;
  return Math.floor(dayMs / 60_000);
}

/** UTC micros of local midnight for the day containing `nowMicros`. */
export function localMidnightMicros(nowMicros: bigint, tzOffsetMin: number): bigint {
  const minutes = localMinutes(nowMicros, tzOffsetMin);
  const sinceMidnightMicros = BigInt(minutes) * 60_000_000n + (nowMicros % 60_000_000n);
  return nowMicros - sinceMidnightMicros;
}
