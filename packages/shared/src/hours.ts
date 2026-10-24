export interface Win {
  startMin: number;
  endMin: number;
}

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function clean(text: string): string {
  return text
    .replace(/[   ]/g, ' ')
    .replace(/\s*[–—-]\s*/g, ' to ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "11 AM", "11:30 PM", "12 AM" -> minutes since midnight. Meridiem may be inherited. */
function parseClock(s: string, inherit: 'AM' | 'PM' | null): { min: number; meridiem: 'AM' | 'PM' | null } | null {
  const m = s.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm|a\.m\.|p\.m\.)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const raw = m[3]?.toUpperCase().replace(/\./g, '') as 'AM' | 'PM' | undefined;
  const meridiem = raw ?? inherit;
  if (h > 23 || min > 59) return null;
  if (meridiem === 'AM' && h === 12) h = 0;
  else if (meridiem === 'PM' && h !== 12) h += 12;
  return { min: h * 60 + min, meridiem: raw ?? null };
}

/**
 * One day's hours text from Google Maps -> open windows in minutes.
 * Returns null when the text cannot be understood (treat hours as unknown), [] when closed.
 * A window ending after midnight has endMin > 1440.
 */
export function parseDayHours(text: string): Win[] | null {
  const t = clean(text);
  if (!t) return null;
  if (/open 24 hours/i.test(t)) return [{ startMin: 0, endMin: 1440 }];
  if (/^closed$/i.test(t)) return [];
  const out: Win[] = [];
  for (const part of t.split(/,\s*/)) {
    const [a, b] = part.split(/\s+to\s+/i);
    if (!a || !b) return null;
    const end = parseClock(b, null);
    if (!end) return null;
    const start = parseClock(a, end.meridiem);
    if (!start) return null;
    let s = start.min;
    let e = end.min;
    // "11 to 2 PM" style: an inherited PM that lands after the end really meant AM.
    if (!/[ap]\.?m/i.test(a) && s > e && end.meridiem === 'PM') s -= 12 * 60;
    if (e <= s) e += 1440;
    out.push({ startMin: s, endMin: e });
  }
  return out;
}

/**
 * Today's open windows (local minutes) including yesterday's after-midnight spillover.
 * `weekday` is 0 = Sunday.
 */
export function openIntervalsForDay(
  hours: readonly { day: string; hours: string }[],
  weekday: number
): { hoursKnown: boolean; open: Win[]; text: string } {
  const find = (d: number) => hours.find(h => h.day.toLowerCase().startsWith(DAY_NAMES[(d + 7) % 7].toLowerCase().slice(0, 3)));
  const today = find(weekday);
  if (!today) return { hoursKnown: false, open: [], text: '' };
  const todayWins = parseDayHours(today.hours);
  if (todayWins === null) return { hoursKnown: false, open: [], text: clean(today.hours) };
  const open = [...todayWins];
  const yesterday = find(weekday - 1);
  const yWins = yesterday ? parseDayHours(yesterday.hours) : null;
  for (const w of yWins ?? []) if (w.endMin > 1440) open.unshift({ startMin: 0, endMin: w.endMin - 1440 });
  return { hoursKnown: true, open, text: clean(today.hours).replace(/ to /g, '–') };
}

/** Local weekday (0 = Sunday) and minutes since local midnight for a UTC instant. */
export function localNow(nowMs: number, tzOffsetMin: number): { weekday: number; minutes: number } {
  const local = new Date(nowMs + tzOffsetMin * 60_000);
  return { weekday: local.getUTCDay(), minutes: local.getUTCHours() * 60 + local.getUTCMinutes() };
}
