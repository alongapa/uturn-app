import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

import type { Trip } from '@/models/types';
import { meetingPoints } from '@/constants/meetingPoints';

export interface NearbyTrip extends Trip {
  distanceKm: number | null;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Ordena los viajes por cercanía real al usuario (geolocalización del dispositivo).
 * Si no hay permiso o falla la ubicación, devuelve los viajes sin distancia
 * (distanceKm: null) en su orden original — degradación silenciosa, sin romper la UI.
 */
export function useNearbyTrips(trips: Trip[]) {
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (active) { setPermissionDenied(true); setLoading(false); }
          return;
        }
        const pos = await Location.getCurrentPositionAsync({});
        if (active) {
          setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
          setLoading(false);
        }
      } catch {
        if (active) { setPermissionDenied(true); setLoading(false); }
      }
    })();
    return () => { active = false; };
  }, []);

  const withDistance: NearbyTrip[] = trips.map((trip) => {
    const mp = meetingPoints.find((p) => p.id === trip.meetingPointId);
    if (!coords || !mp) return { ...trip, distanceKm: null };
    return {
      ...trip,
      distanceKm: haversineKm(coords.latitude, coords.longitude, mp.coordenadas.latitude, mp.coordenadas.longitude),
    };
  });

  const sorted = [...withDistance].sort((a, b) => {
    if (a.distanceKm == null && b.distanceKm == null) return 0;
    if (a.distanceKm == null) return 1;
    if (b.distanceKm == null) return -1;
    return a.distanceKm - b.distanceKm;
  });

  return { trips: sorted, loading, permissionDenied, hasLocation: coords !== null };
}
