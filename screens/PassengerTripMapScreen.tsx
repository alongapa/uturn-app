import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import MapView, { Marker, Polyline } from 'react-native-maps';
import { useLocalSearchParams } from 'expo-router';

import { useAppState } from '@/store/appState';

const markerColors = {
  origin: '#E11D48',
  meeting: '#16A34A',
  destination: '#2563EB',
  route: '#0A1525',
};

export default function PassengerTripMapScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { trips } = useAppState();
  const mapRef = useRef<any>(null);

  const trip = trips.find((t) => t.id === id);

  const polyline = useMemo(() => {
    if (!trip) return [];
    if (trip.routePolyline && trip.routePolyline.length >= 2) {
      return trip.routePolyline;
    }
    const points = [trip.coordenadasOrigen];
    if (trip.meetingPointCoords) points.push(trip.meetingPointCoords);
    points.push(trip.coordenadasDestino);
    return points;
  }, [trip]);

  useEffect(() => {
    if (trip && mapRef.current && polyline.length >= 2) {
      mapRef.current.fitToCoordinates(polyline, {
        edgePadding: { top: 60, bottom: 60, left: 40, right: 40 },
        animated: true,
      });
    }
  }, [polyline, trip]);

  if (!trip || polyline.length < 2) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Viaje no encontrado</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          latitude: polyline[0].latitude,
          longitude: polyline[0].longitude,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08,
        }}
      >
        <Marker coordinate={trip.coordenadasOrigen} pinColor={markerColors.origin} title="Origen" />
        {trip.meetingPointCoords && (
          <Marker coordinate={trip.meetingPointCoords} pinColor={markerColors.meeting} title="Punto de encuentro" />
        )}
        <Marker coordinate={trip.coordenadasDestino} pinColor={markerColors.destination} title="Destino" />
        <Polyline coordinates={polyline} strokeColor={markerColors.route} strokeWidth={4} />
      </MapView>
      <View style={styles.overlay}>
        <Text style={styles.title}>{trip.origenCampus} → {trip.destinoCampus}</Text>
        <Text style={styles.meta}>Salida: {new Date(trip.horaSalida).toLocaleString('es-CL')}</Text>
        <View style={styles.legendRow}>
          <Legend label="Origen" color={markerColors.origin} />
          <Legend label="Punto de encuentro" color={markerColors.meeting} />
          <Legend label="Destino" color={markerColors.destination} />
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
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  title: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  meta: { color: '#475569' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendLabel: { color: '#0f172a', fontWeight: '600' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#475569' },
});
