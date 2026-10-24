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
  /** With popular times: how busy the venue usually is when you arrive (0–100). */
  busyPct?: number;
  /** The earliest slot everyone could make, and how busy that would have been. */
  naiveStartMin?: number;
  naiveBusyPct?: number;
}

/** Usual busyness (0–100) at a minute counted from today's local midnight (may run into tomorrow), or null. */
export type BusyAt = (absMin: number) => number | null;

/** How far past the earliest workable start to look for a quieter time. */
const QUIET_WINDOW = 150;
/** Each extra 15 minutes of waiting has to buy at least this much less busyness. */
const WAIT_COST_PER_15 = 4;

/**
 * Busyness when the group arrives: the slot's first hour, blending the two hourly buckets it spans.
 * Google reports 0% when a place is closed (or has no data), so 0 means "unknown", never "empty".
 */
export function slotBusyness(busy: BusyAt, start: number): number | null {
  const h = Math.floor(start / 60) * 60;
  const a = busy(h);
  if (!a) return null;
  const next = busy(h + 60);
  const b = next ? next : a;
  const frac = (start - h) / 60;
  return Math.round(a * (1 - frac) + b * frac);
}

/** Among slots everyone can make, the best trade-off between a quiet room and not waiting around. */
function quietest(full: SlotResult[], busy: BusyAt | undefined): SlotResult {
  const first = full[0]!;
  const firstBusy = busy ? slotBusyness(busy, first.startMin) : null;
  if (!busy || firstBusy === null) return first;
  let best = first;
  let bestCost = firstBusy;
  let bestBusy = firstBusy;
  for (const s of full) {
    const b = slotBusyness(busy, s.startMin);
    if (b === null) continue;
    const cost = b + (WAIT_COST_PER_15 * (s.startMin - first.startMin)) / 15;
    if (cost < bestCost) {
      best = s;
      bestCost = cost;
      bestBusy = b;
    }
  }
  return { ...best, busyPct: bestBusy, naiveStartMin: first.startMin, naiveBusyPct: firstBusy };
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
  dayOffset: number,
  busyAt?: BusyAt
): SlotResult | null {
  const step = 15;
  let best: SlotResult | null = null;
  const full: SlotResult[] = [];
  const first = Math.ceil(fromMin / step) * step;
  for (let s = first; s <= LATEST_START + dayOffset; s += step) {
    if (full.length && s > full[0]!.startMin + QUIET_WINDOW) break;
    const e = s + slotLen;
    if (venueOpen && !covers(venueOpen, s, e)) continue;
    const attendees: bigint[] = [];
    const cantMake: bigint[] = [];
    for (const p of players) {
      const windows = shift(p.windows, dayOffset);
      if (p.windows.length === 0 || covers(windows, s, e)) attendees.push(p.id);
      else cantMake.push(p.id);
    }
    if (cantMake.length === 0) {
      full.push({ startMin: s, endMin: e, attendees, cantMake });
      if (!busyAt) break; // no popular times: earliest wins, as before
      continue;
    }
    if (!full.length && (!best || attendees.length > best.attendees.length)) best = { startMin: s, endMin: e, attendees, cantMake };
  }
  if (full.length) return quietest(full, busyAt);
  return best && best.attendees.length > 0 ? best : null;
}

/**
 * Earliest slot (at least `leadMin` from now) that everyone can make and the venue is open for.
 * With popular times (`busyAt`), a slightly later slot wins when it's clearly less packed.
 * If nobody-misses is impossible, the slot with the most attendees (earliest on ties).
 * If tonight has no workable slot at all, tries the same windows tomorrow.
 */
export function pickSlot(args: {
  nowMin: number;
  players: readonly SlotPlayer[];
  venue: { hoursKnown: boolean; open: readonly Win[] };
  slotLen: number;
  leadMin?: number;
  busyAt?: BusyAt;
}): SlotResult {
  const lead = args.leadMin ?? 30;
  const open = args.venue.hoursKnown ? args.venue.open : null;
  const tonight = search(args.nowMin + lead, args.players, open, args.slotLen, 0, args.busyAt);
  if (tonight && tonight.cantMake.length === 0) return tonight;

  const tomorrowOpen = open ? shift(open, DAY) : null;
  const tomorrow = search(DAY, args.players, tomorrowOpen, args.slotLen, DAY, args.busyAt);
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

/** Local weekday (0 = Sunday) for a UTC instant, matching Google's popular-times days. */
export function localWeekday(nowMicros: bigint, tzOffsetMin: number): number {
  const localDay = Math.floor((Number(nowMicros / 1000n) + tzOffsetMin * 60_000) / 86_400_000);
  return (((localDay + 4) % 7) + 7) % 7; // 1970-01-01 was a Thursday
}

/** A BusyAt over 168 hourly values (weekday × 24 + hour) starting from `weekday` today. */
export function busyFromWeek(week: readonly number[], weekday: number): BusyAt | undefined {
  if (week.length !== 168) return undefined;
  return absMin => {
    const hour = Math.floor(absMin / 60);
    const idx = (((weekday * 24 + hour) % 168) + 168) % 168;
    return week[idx] ?? null;
  };
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
