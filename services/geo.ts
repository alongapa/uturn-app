import type { Coordinates } from './location';

const EARTH_RADIUS_METERS = 6371000;

const toRadians = (deg: number) => (deg * Math.PI) / 180;

export function haversineDistanceMeters(a: Coordinates, b: Coordinates) {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function distanceToSegmentMeters(p: Coordinates, a: Coordinates, b: Coordinates) {
  // Equirectangular approximation is good enough for short city distances.
  const midLatRad = toRadians((a.latitude + b.latitude) / 2);
  const x1 = toRadians(a.longitude) * Math.cos(midLatRad);
  const y1 = toRadians(a.latitude);
  const x2 = toRadians(b.longitude) * Math.cos(midLatRad);
  const y2 = toRadians(b.latitude);
  const x0 = toRadians(p.longitude) * Math.cos(midLatRad);
  const y0 = toRadians(p.latitude);

  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((x0 - x1) * dx + (y0 - y1) * dy) / (dx * dx + dy * dy)));

  const projX = x1 + t * dx;
  const projY = y1 + t * dy;

  const projLonRad = projX / Math.cos(midLatRad);
  const projPoint: Coordinates = {
    latitude: (projY * 180) / Math.PI,
    longitude: (projLonRad * 180) / Math.PI,
  };
  return haversineDistanceMeters(p, projPoint);
}

export function distanceToPolylineMeters(point: Coordinates, polyline: Coordinates[]) {
  if (polyline.length < 2) return Infinity;

  let minDistance = Infinity;
  for (let i = 0; i < polyline.length - 1; i += 1) {
    const candidate = distanceToSegmentMeters(point, polyline[i], polyline[i + 1]);
    if (candidate < minDistance) {
      minDistance = candidate;
    }
  }
  return minDistance;
}

export const ROUTE_PROXIMITY_MIN = 800;
export const ROUTE_PROXIMITY_MAX = 1200;
