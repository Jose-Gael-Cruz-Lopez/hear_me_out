export interface LatLng {
  lat: number;
  lng: number;
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Rough door-to-door minutes from straight-line distance: walking under ~1.6 km,
 * otherwise a city ride (~20 km/h plus 6 minutes to get going). Shown in the UI as an estimate.
 */
export function estimateTravelMin(distanceKm: number): number {
  if (distanceKm <= 1.6) return Math.max(2, Math.round(distanceKm * 13));
  return Math.round(6 + distanceKm * 3);
}

export function geohashKey(p: LatLng, precision = 2): string {
  return `${p.lat.toFixed(precision)},${p.lng.toFixed(precision)}`;
}
