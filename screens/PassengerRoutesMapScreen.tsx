import React, { useEffect, useMemo, useRef } from 'react';
import { Alert, Dimensions, StyleSheet, Text, View } from 'react-native';

import MapView, { Marker, Polyline } from 'react-native-maps';
import { useLocalSearchParams } from 'expo-router';

import type { CampusId } from '@/constants/campuses';
import { ROUTE_PROXIMITY_MAX, distanceToPolylineMeters } from '@/services/geo';
import type { Coordinates, Trip } from '@/store/appState';
import { useAppState } from '@/store/appState';

type Params = {
  originLat?: string;
  originLng?: string;
  destino?: CampusId;
  originLabel?: string;
};

const { width, height } = Dimensions.get('window');

const colors = {
  origin: '#E11D48',
  meeting: '#16A34A',
  destination: '#2563EB',
  route: '#0A1525',
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

export default function PassengerRoutesMapScreen() {
  const params = useLocalSearchParams<Params>();
  const { trips } = useAppState();
  const mapRef = useRef<any>(null);

  const originCoords = asCoords(params.originLat, params.originLng);

  const compatibleTrips = useMemo(() => {
    if (!originCoords) return [];
    return trips
      .map((trip) => {
        const matchesDestination = params.destino ? trip.destinoCampusId === params.destino : true;
        if (!matchesDestination) return null;
        const polyline = getPolyline(trip);
        const distance = distanceToPolylineMeters(originCoords, polyline);
        return { trip, polyline, distance };
      })
      .filter(
        (item): item is { trip: Trip; polyline: Coordinates[]; distance: number } =>
          Boolean(item && item.distance <= ROUTE_PROXIMITY_MAX)
      );
  }, [originCoords, params.destino, trips]);

  useEffect(() => {
    if (!mapRef.current || compatibleTrips.length === 0) return;
    const coords = compatibleTrips.flatMap(({ polyline }) => polyline);
    const padding = { top: 60, bottom: 60, left: 40, right: 40 };
    mapRef.current.fitToCoordinates(coords, { animated: true, edgePadding: padding });
  }, [compatibleTrips]);

  if (!originCoords) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No hay origen válido para mostrar en el mapa.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          latitude: originCoords.latitude,
          longitude: originCoords.longitude,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08 * (width / height),
        }}
        onError={() => Alert.alert('No se pudo cargar el mapa')}
      >
        <Marker coordinate={originCoords} pinColor={colors.origin} title="Tu origen" />
        {compatibleTrips.map(({ trip, polyline }) => (
          <React.Fragment key={trip.id}>
            <Marker coordinate={trip.coordenadasOrigen} pinColor={colors.origin} title="Origen" />
            {trip.meetingPointCoords && (
              <Marker coordinate={trip.meetingPointCoords} pinColor={colors.meeting} title="Punto de encuentro" />
            )}
            <Marker coordinate={trip.coordenadasDestino} pinColor={colors.destination} title="Destino" />
            <Polyline coordinates={polyline} strokeColor={colors.route} strokeWidth={4} />
          </React.Fragment>
        ))}
      </MapView>
      <View style={styles.overlay}>
        <Text style={styles.overlayTitle}>Rutas compatibles: {compatibleTrips.length}</Text>
        {params.originLabel && <Text style={styles.overlayText}>{params.originLabel}</Text>}
        <View style={styles.legendRow}>
          <Legend label="Origen" color={colors.origin} />
          <Legend label="Punto de encuentro" color={colors.meeting} />
          <Legend label="Destino" color={colors.destination} />
        </View>
      </View>
    </View>
  );
}

function Legend({ label, color }: { label: string; color: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  overlay: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  overlayTitle: { fontWeight: '800', color: '#0f172a' },
  overlayText: { color: '#475569' },
  legendRow: { flexDirection: 'row', gap: 12, marginTop: 6, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendLabel: { color: '#0f172a', fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#475569' },
});
