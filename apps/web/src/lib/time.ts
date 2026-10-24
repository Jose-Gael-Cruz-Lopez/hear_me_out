import { useEffect, useState } from 'react';
import type { Timestamp } from 'spacetimedb';

export function useNow(intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function tsMs(t: Timestamp | undefined | null): number {
  return t ? Number(t.microsSinceUnixEpoch / 1000n) : 0;
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
