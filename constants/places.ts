import { CAMPUSES, type CampusId } from './campuses';
import { haversineDistanceMeters } from '@/services/geo';
import type { Coordinates } from '@/services/location';

export type PlaceType = 'campus' | 'meeting-point' | 'hotspot';

export interface Place {
  id: string;
  name: string;
  type: PlaceType;
  campusId?: CampusId;
  aliases?: string[];
  coordinates: Coordinates;
}

export interface PlaceMatch {
  place: Place;
  score: number;
}

const HOTSPOTS: Place[] = [
  { id: 'hotspot-metro-manquehue', name: 'Metro Manquehue', type: 'hotspot', coordinates: { latitude: -33.4087, longitude: -70.5706 } },
  { id: 'hotspot-rotonda-atenas', name: 'Rotonda Atenas', type: 'hotspot', coordinates: { latitude: -33.4075, longitude: -70.5481 } },
  { id: 'hotspot-casona-condes', name: 'Casona Las Condes', type: 'hotspot', coordinates: { latitude: -33.4017, longitude: -70.5114 } },
  { id: 'hotspot-metro-tobalaba', name: 'Metro Tobalaba', type: 'hotspot', coordinates: { latitude: -33.4253, longitude: -70.6097 } },
  { id: 'hotspot-metro-grecia', name: 'Metro Grecia', type: 'hotspot', coordinates: { latitude: -33.4629, longitude: -70.5651 } },
];

const CAMPUS_PLACES: Place[] = CAMPUSES.map((campus) => ({
  id: campus.id,
  name: campus.name,
  type: 'campus',
  campusId: campus.id,
  aliases: [campus.commune, campus.address, `${campus.name} ${campus.commune}`],
  coordinates: { latitude: campus.latitude, longitude: campus.longitude },
}));

const MEETING_POINT_PLACES: Place[] = CAMPUSES.flatMap((campus) =>
  campus.meetingPoints.map((meetingPoint) => ({
    id: meetingPoint.id,
    name: meetingPoint.name,
    type: 'meeting-point' as const,
    campusId: campus.id,
    aliases: [campus.name],
    coordinates: { latitude: meetingPoint.latitude, longitude: meetingPoint.longitude },
  }))
);

export const PLACES: Place[] = [...CAMPUS_PLACES, ...MEETING_POINT_PLACES, ...HOTSPOTS];

const MATCH_THRESHOLD = 0.4;

const COMBINING_DIACRITIC_MIN = 0x0300;
const COMBINING_DIACRITIC_MAX = 0x036f;

function stripDiacritics(text: string): string {
  return Array.from(text)
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code < COMBINING_DIACRITIC_MIN || code > COMBINING_DIACRITIC_MAX;
    })
    .join('');
}

function normalize(text: string): string {
  return stripDiacritics(text.normalize('NFD')).toLowerCase().trim();
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

function scoreCandidate(query: string, text: string): number {
  const nq = normalize(query);
  const nt = normalize(text);
  if (!nq || !nt) return 0;
  if (nt === nq) return 1;
  if (nt.startsWith(nq)) return 0.95;
  if (nt.includes(nq)) return 0.85;

  const queryTokens = nq.split(/\s+/).filter(Boolean);
  const textTokens = nt.split(/\s+/).filter(Boolean);
  const tokenScore =
    queryTokens.reduce((sum, qt) => {
      const best = textTokens.reduce((max, tt) => {
        if (tt.startsWith(qt) || tt.includes(qt)) return Math.max(max, 0.8);
        return Math.max(max, similarity(qt, tt));
      }, 0);
      return sum + best;
    }, 0) / queryTokens.length;

  return Math.max(tokenScore, similarity(nq, nt));
}

export function searchPlaces(query: string, options?: { limit?: number; types?: PlaceType[] }): PlaceMatch[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const limit = options?.limit ?? 6;
  const pool = options?.types ? PLACES.filter((place) => options.types!.includes(place.type)) : PLACES;

  return pool
    .map((place) => {
      const nameScore = scoreCandidate(trimmed, place.name);
      const aliasScore = (place.aliases ?? []).reduce((max, alias) => Math.max(max, scoreCandidate(trimmed, alias)), 0);
      return { place, score: Math.max(nameScore, aliasScore) };
    })
    .filter((match) => match.score >= MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function resolveNearestPlace(coords: Coordinates, maxDistanceMeters = 120): Place | null {
  let best: { place: Place; distance: number } | null = null;
  for (const place of PLACES) {
    const distance = haversineDistanceMeters(coords, place.coordinates);
    if (distance <= maxDistanceMeters && (!best || distance < best.distance)) {
      best = { place, distance };
    }
  }
  return best?.place ?? null;
}
