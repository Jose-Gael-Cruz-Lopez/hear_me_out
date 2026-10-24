// Busyness-aware timing: Google's "popular times" for the winning place (scraped with Apify). Hour
// columns on a grid (labels can't drift), heat-colored bars that grow once, closed hours called out,
// and a dashed arrow drawn from the packed earliest slot to the quieter time we picked.
import type { Option, Plan } from '@hmo/bindings';
import { formatClock } from '@hmo/module/logic/slot';
import { motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import { tsMs } from '../lib/time';

const DAY = 1440;
const MAX_BARS = 8;

function localMinuteOfDay(ms: number, tzOffsetMin: number): number {
  const local = ms + tzOffsetMin * 60_000;
  return Math.floor((((local % 86_400_000) + 86_400_000) % 86_400_000) / 60_000);
}

const hourLabel = (h: number) => {
  const h24 = ((h % 24) + 24) % 24;
  return `${h24 % 12 === 0 ? 12 : h24 % 12}${h24 < 12 ? 'a' : 'p'}`;
};

/** Animate only the first time this plan's chart is shown in this tab, so re-renders never replay it. */
function useFirstShow(key: string): boolean {
  const [first] = useState(() => {
    try {
      if (sessionStorage.getItem(key)) return false;
      sessionStorage.setItem(key, '1');
    } catch {
      /* private mode: just animate */
    }
    return true;
  });
  return first;
}

/** Hours to draw: around the two times that matter, with closed (0%) hours trimmed off both ends. */
function hourRange(naiveHour: number, chosenHour: number, busy: (h: number) => number, max: number): number[] {
  const lo = Math.min(naiveHour, chosenHour);
  const hi = Math.max(naiveHour, chosenHour);
  let start = lo - 3;
  let end = hi + 3;
  while (start < lo && busy(start) === 0) start++;
  while (end > hi && busy(end) === 0) end--;
  // Keep one closed hour on each side as context, then cap the width around the chosen hour.
  if (start > lo - 3 && busy(start - 1) === 0) start--;
  if (end < hi + 3 && busy(end + 1) === 0) end++;
  while (end - start + 1 > max) {
    if (chosenHour - start > end - chosenHour) start++;
    else end--;
  }
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

export function BusyChart({ plan, option, tzOffsetMin, compact = false, bare = false }: { plan: Plan; option: Option; tzOffsetMin: number; compact?: boolean; bare?: boolean }) {
  const reduce = useReducedMotion();
  const first = useFirstShow(`hmo-busy-${plan.id}`);
  if (plan.weekday < 0 || option.busyness.length !== 168 || plan.busyPct < 0) return null;
  const animate = first && !reduce;

  // Minutes from today's local midnight (the plan can be tomorrow), anchored on the stored earliest slot.
  const naive = plan.naiveStartMin;
  let chosen = Math.floor(naive / DAY) * DAY + localMinuteOfDay(tsMs(plan.startAt), tzOffsetMin);
  if (chosen < naive - DAY / 2) chosen += DAY;
  const moved = chosen !== naive;
  const packed = !moved && plan.busyPct >= 70;

  const busy = (absHour: number) => option.busyness[(((plan.weekday * 24 + absHour) % 168) + 168) % 168] ?? 0;
  const chosenHour = Math.floor(chosen / 60);
  const naiveHour = Math.floor(naive / 60);
  const hours = hourRange(naiveHour, chosenHour, busy, compact ? 7 : MAX_BARS);
  const col = (h: number) => hours.indexOf(h) + 1; // 1-based grid column
  const from = col(naiveHour);
  const to = col(chosenHour);
  const span = Math.abs(to - from) + 1;
  const ltr = to >= from;
  const barsDone = animate ? 0.25 + hours.length * 0.06 + 0.5 : 0;

  return (
    <div className={`busy ${compact ? 'busy-compact' : ''} ${bare ? 'busy-bare' : ''}`}>
      <div className="busy-head">
        <div className="busy-title">
          {moved ? (
            <>
              Go at <mark>{formatClock(chosen)}</mark>, not <s>{formatClock(naive)}</s>
            </>
          ) : packed ? (
            'Packed all evening: book ahead'
          ) : (
            <>
              <mark>{formatClock(chosen)}</mark> is a good time
            </>
          )}
        </div>
        <div className="busy-sub">
          {moved
            ? `Usually ${plan.naiveBusyPct}% full at ${formatClock(naive)}, ${plan.busyPct}% when you arrive.`
            : packed
              ? `Usually ${plan.busyPct}% full at ${formatClock(chosen)}, and it doesn't ease up while everyone's free.`
              : `Usually ${plan.busyPct}% full then, and everyone's free.`}
        </div>
      </div>

      <div className="busy-grid" style={{ gridTemplateColumns: `repeat(${hours.length}, minmax(0, 1fr))` }} role="img" aria-label={hours.map(h => `${hourLabel(h)} ${busy(h) ? `${busy(h)}%` : 'closed'}`).join(', ')}>
        {/* Row 1: the arrow and the two time labels. */}
        {moved && (
          <div className={`busy-arc ${ltr ? 'ltr' : 'rtl'}`} style={{ gridColumn: `${Math.min(from, to)} / span ${span}`, ['--inset' as string]: `${50 / span}%` }}>
            {/* A dashed curve from the packed hour to the chosen one, wiped in from the packed side. */}
            <motion.div
              className="busy-arc-draw"
              initial={animate ? { clipPath: ltr ? 'inset(-20% 100% -20% 0)' : 'inset(-20% 0 -20% 100%)' } : false}
              animate={{ clipPath: 'inset(-20% 0% -20% 0%)' }}
              transition={{ delay: barsDone, duration: 0.9, ease: 'easeInOut' }}
            >
              <svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden>
                <path
                  d={`M ${50 / span} 30 C ${50 / span} 2, ${100 - 50 / span} 2, ${100 - 50 / span} 26`}
                  fill="none"
                  stroke="#14140f"
                  strokeWidth={3}
                  strokeDasharray="7 6"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <i className="busy-arrowhead" />
            </motion.div>
          </div>
        )}
        {moved && (
          <span className="busy-was" style={{ gridColumn: from }}>
            {formatClock(naive)}
          </span>
        )}
        <motion.span
          className="busy-pin"
          style={{ gridColumn: to }}
          initial={animate ? { scale: 0.4, opacity: 0, y: 8 } : false}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ delay: barsDone + (moved ? 0.6 : 0), type: 'spring', stiffness: 420, damping: 16 }}
        >
          {formatClock(chosen)}
        </motion.span>

        {/* Row 2: gridlines + bars. */}
        <div className="busy-lines" style={{ gridColumn: `1 / span ${hours.length}` }}>
          <i style={{ bottom: '100%' }}>
            <em>100%</em>
          </i>
          <i style={{ bottom: '50%' }}>
            <em>50%</em>
          </i>
        </div>
        {hours.map((h, i) => {
          const pct = busy(h);
          const kind = h === chosenHour ? 'chosen' : moved && h === naiveHour ? 'packed' : '';
          return (
            <div key={h} className="busy-cell" style={{ gridColumn: i + 1 }}>
              {pct === 0 ? (
                <span className="busy-closed">closed</span>
              ) : (
                <motion.div
                  className={`busy-bar ${kind}`}
                  style={{ height: `${pct}%`, ['--heat' as string]: `${Math.round(pct * 0.7)}%` }}
                  initial={animate ? { scaleY: 0 } : false}
                  animate={{ scaleY: 1 }}
                  transition={{ delay: 0.25 + i * 0.06, type: 'spring', stiffness: 170, damping: 20 }}
                >
                  <span className="busy-pct">{pct}%</span>
                </motion.div>
              )}
            </div>
          );
        })}

        {/* Row 3: hour labels. */}
        {hours.map((h, i) => (
          <span key={`l${h}`} className={`busy-hour ${h === chosenHour ? 'on' : ''}`} style={{ gridColumn: i + 1 }}>
            {hourLabel(h)}
          </span>
        ))}
      </div>
      <div className="busy-src">How full it usually gets · Google Maps popular times via Apify</div>
    </div>
  );
}
