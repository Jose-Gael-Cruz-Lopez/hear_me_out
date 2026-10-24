import type { LatLng } from '@hmo/shared';
import { log } from '../log';

const cache = new Map<string, LatLng | null>();

/** Typed neighborhood -> coordinates via OpenStreetMap Nominatim (free, no key, 1 req/s). */
export async function geocode(label: string, timeoutMs = 6000): Promise<LatLng | null> {
  const key = label.trim().toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key) ?? null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(label)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'hear-me-out-hackathon/0.1 (party game; contact via repo)' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = (await res.json()) as { lat: string; lon: string }[];
    const hit = rows[0] ? { lat: Number(rows[0].lat), lng: Number(rows[0].lon) } : null;
    cache.set(key, hit);
    return hit;
  } catch (err) {
    log.warn('geocode failed', { label, err: String(err).slice(0, 120) });
    return null;
  }
}
