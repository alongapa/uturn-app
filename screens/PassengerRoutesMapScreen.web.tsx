import { useLocalSearchParams } from 'expo-router';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ROUTE_PROXIMITY_MAX, distanceToPolylineMeters } from '@/services/geo';
import type { Coordinates, Trip } from '@/store/appState';
import { useAppState } from '@/store/appState';

type Params = {
  originLat?: string;
  originLng?: string;
  destino?: string;
};

const asCoords = (lat?: string, lng?: string): Coordinates | null => {
  const latitude = lat ? Number(lat) : NaN;
  const longitude = lng ? Number(lng) : NaN;
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;
  return { latitude, longitude };
};

const getPolyline = (trip: Trip) => {
  if (trip.routePolyline && trip.routePolyline.length >= 2) return trip.routePolyline;
  const points = [trip.coordenadasOrigen];
  if (trip.meetingPointCoords) points.push(trip.meetingPointCoords);
  points.push(trip.coordenadasDestino);
  return points;
};

export default function PassengerRoutesMapScreenWeb() {
  const params = useLocalSearchParams<Params>();
  const { trips } = useAppState();
  const originCoords = asCoords(params.originLat, params.originLng);

  const compatibleTrips = useMemo(() => {
    if (!originCoords) return [];
    return trips
      .map((trip) => {
        const matchesDestination = params.destino ? trip.destinoCampusId === params.destino : true;
        if (!matchesDestination) return null;
        const distance = distanceToPolylineMeters(originCoords, getPolyline(trip));
        return { trip, distance };
      })
      .filter((item): item is { trip: Trip; distance: number } => Boolean(item && item.distance <= ROUTE_PROXIMITY_MAX));
  }, [originCoords, params.destino, trips]);

  if (!originCoords) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No hay origen válido para mostrar en el mapa.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>El mapa de rutas no está disponible en la web.</Text>
      <Text style={styles.body}>Abre la app móvil para verlas trazadas en el mapa. Viajes compatibles cerca de tu origen:</Text>
      {compatibleTrips.length === 0 ? (
        <Text style={styles.emptyText}>Ningún viaje pasa cerca de tu origen por ahora.</Text>
      ) : (
        compatibleTrips.map(({ trip, distance }) => (
          <View key={trip.id} style={styles.card}>
            <Text style={styles.cardTitle}>{trip.origenCampus} → {trip.destinoCampus}</Text>
            <Text style={styles.meta}>Salida: {new Date(trip.horaSalida).toLocaleString('es-CL')}</Text>
            <Text style={styles.meta}>A {Math.round(distance)} m de tu origen</Text>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: '#f8fafc',
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
  },
  body: {
    fontSize: 14,
    color: '#334155',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 4,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  meta: { color: '#475569' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#475569' },
});
