import { CAMPUSES, type CampusId, getCampusById } from '@/constants/campuses';
import type { Coordinates, Trip } from '@/store/appState';

import { distanceToPolylineMeters, haversineDistanceMeters, nearestPointOnPolyline } from './geo';

export type MatchLabel = 'Coincidencia alta' | 'Buena coincidencia' | 'Coincidencia baja';

export type MeetingPointSuggestion = {
  name: string;
  coordinates: Coordinates;
  distance: number;
  reason: 'Ruta cercana' | 'Punto seguro';
};

export type TripMatch = {
  trip: Trip;
  score: number;
  rank: 100 | 80 | 60 | 30;
  matchLabel: MatchLabel;
  distanceToRoute: number;
  distanceToMeeting?: number | null;
  recommendedMeetingPoint?: MeetingPointSuggestion | null;
  reasons: string[];
};

const PROXIMITY_TOLERANCE_METERS = 1200;
const MAX_WALK_DISTANCE = 800;

const SAFE_PUBLIC_SPOTS: MeetingPointSuggestion[] = [
  {
    name: 'Metro Manquehue',
    coordinates: { latitude: -33.4087, longitude: -70.5706 },
    distance: 0,
    reason: 'Punto seguro',
  },
  {
    name: 'Metro Tobalaba',
    coordinates: { latitude: -33.4239, longitude: -70.6045 },
    distance: 0,
    reason: 'Punto seguro',
  },
  {
    name: 'Metro Grecia',
    coordinates: { latitude: -33.4629, longitude: -70.5651 },
    distance: 0,
    reason: 'Punto seguro',
  },
  {
    name: 'Plaza Las Condes',
    coordinates: { latitude: -33.4055, longitude: -70.5448 },
    distance: 0,
    reason: 'Punto seguro',
  },
];

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const buildPolyline = (trip: Trip) => {
  if (trip.routePolyline && trip.routePolyline.length >= 2) return trip.routePolyline;
  const points = [trip.coordenadasOrigen];
  if (trip.meetingPointCoords) points.push(trip.meetingPointCoords);
  points.push(trip.coordenadasDestino);
  return points;
};

function priceScore(prices: number[], price: number) {
  if (!prices.length) return 0.5;
  const sorted = [...prices].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (!median) return 0.5;
  const delta = clamp((median - price) / median, -0.4, 0.6);
  return clamp(0.5 + delta);
}

function timeScore(departure: string, now: Date) {
  const diffHours = (new Date(departure).getTime() - now.getTime()) / (1000 * 60 * 60);
  if (Number.isNaN(diffHours)) return 0.5;
  if (diffHours < 0) return 0;
  if (diffHours <= 1) return 1;
  if (diffHours <= 3) return 0.85;
  if (diffHours <= 6) return 0.7;
  return 0.5;
}

function matchLabel(score: number): MatchLabel {
  if (score >= 0.85) return 'Coincidencia alta';
  if (score >= 0.65) return 'Buena coincidencia';
  return 'Coincidencia baja';
}

function rankPercent(score: number): 100 | 80 | 60 | 30 {
  if (score >= 0.85) return 100;
  if (score >= 0.65) return 80;
  if (score >= 0.5) return 60;
  return 30;
}

export function suggestMeetingPoint(
  passengerLocation: Coordinates,
  route: Coordinates[]
): MeetingPointSuggestion | null {
  if (route.length < 2) return null;
  const nearest = nearestPointOnPolyline(passengerLocation, route);
  if (nearest.distance <= MAX_WALK_DISTANCE) {
    return {
      name: 'Punto de encuentro recomendado',
      coordinates: nearest.point,
      distance: nearest.distance,
      reason: 'Ruta cercana',
    };
  }

  const closestSafe = SAFE_PUBLIC_SPOTS.reduce<MeetingPointSuggestion | null>((best, spot) => {
    const distance = haversineDistanceMeters(passengerLocation, spot.coordinates);
    if (!best || distance < best.distance) {
      return { ...spot, distance };
    }
    return best;
  }, null);

  if (closestSafe && closestSafe.distance <= PROXIMITY_TOLERANCE_METERS * 2) {
    return closestSafe;
  }

  return null;
}

export function rankTripsForPassenger({
  passengerLocation,
  passengerCommune,
  destinationId,
  trips,
  now = new Date(),
  toleranceMeters = PROXIMITY_TOLERANCE_METERS,
}: {
  passengerLocation: Coordinates;
  passengerCommune?: string | null;
  destinationId?: CampusId;
  trips: Trip[];
  now?: Date;
  toleranceMeters?: number;
}): TripMatch[] {
  const priceList = trips.map((trip) => trip.precioCLP || 0).filter(Boolean);

  return trips
    .map((trip) => {
      if (destinationId && trip.destinoCampusId && trip.destinoCampusId !== destinationId) {
        return null;
      }

      const polyline = buildPolyline(trip);
      const distanceToRoute = distanceToPolylineMeters(passengerLocation, polyline);
      const distanceToMeeting = trip.meetingPointCoords
        ? haversineDistanceMeters(passengerLocation, trip.meetingPointCoords)
        : null;
      const reputation = clamp((trip.driverReputation ?? 4.3) / 5);
      const time = timeScore(trip.horaSalida, now);
      const price = priceScore(priceList, trip.precioCLP);

      const routeScore = clamp(1 - Math.min(distanceToRoute, toleranceMeters) / toleranceMeters);
      const meetingScore = distanceToMeeting !== null ? clamp(1 - Math.min(distanceToMeeting, toleranceMeters) / toleranceMeters) : 0.6;

      const campus = trip.destinoCampusId ? getCampusById(trip.destinoCampusId) : null;
      const communeMatch = passengerCommune && campus?.commune
        ? passengerCommune.toLowerCase().includes(campus.commune.toLowerCase()) ||
          campus.commune.toLowerCase().includes(passengerCommune.toLowerCase())
        : false;

      const score =
        routeScore * 0.35 +
        meetingScore * 0.25 +
        reputation * 0.2 +
        price * 0.1 +
        time * 0.1 +
        (communeMatch ? 0.05 : 0);

      const suggestion = suggestMeetingPoint(passengerLocation, polyline);
      const label = matchLabel(score);
      const rank = rankPercent(score);
      const reasons: string[] = [];

      if (routeScore >= 0.8) reasons.push('Ruta pasa cerca del pasajero');
      if (meetingScore >= 0.7) reasons.push('Punto de encuentro cercano');
      if (communeMatch) reasons.push('Cruza su comuna');
      if ((trip.driverReputation ?? 0) >= 4.5) reasons.push('Conductor con buena reputación');

      return {
        trip,
        score,
        matchLabel: label,
        rank,
        distanceToRoute,
        distanceToMeeting,
        recommendedMeetingPoint: suggestion,
        reasons,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if ((a.distanceToRoute ?? Infinity) !== (b.distanceToRoute ?? Infinity)) {
        return (a.distanceToRoute ?? Infinity) - (b.distanceToRoute ?? Infinity);
      }
      if ((b.trip.driverReputation ?? 0) !== (a.trip.driverReputation ?? 0)) {
        return (b.trip.driverReputation ?? 0) - (a.trip.driverReputation ?? 0);
      }
      if (a.trip.precioCLP !== b.trip.precioCLP) return a.trip.precioCLP - b.trip.precioCLP;
      return new Date(a.trip.horaSalida).getTime() - new Date(b.trip.horaSalida).getTime();
    });
}
