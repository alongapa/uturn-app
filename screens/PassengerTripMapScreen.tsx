import React, { useMemo } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';

import MapView, { Marker, Polyline } from 'react-native-maps';
import { useLocalSearchParams } from 'expo-router';

import { useAppState } from '@/store/appState';

const { width, height } = Dimensions.get('window');
const ASPECT_RATIO = width / height;
const LATITUDE_DELTA = 0.09;
const LONGITUDE_DELTA = LATITUDE_DELTA * ASPECT_RATIO;

export default function PassengerTripMapScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { trips } = useAppState();

  const trip = trips.find((t) => t.id === id);

  const region = useMemo(() => {
    if (!trip) return undefined;
    return {
      latitude: trip.coordenadasOrigen.latitude,
      longitude: trip.coordenadasOrigen.longitude,
      latitudeDelta: LATITUDE_DELTA,
      longitudeDelta: LONGITUDE_DELTA,
    };
  }, [trip]);

  if (!trip || !region) {
    return (
      <View style={styles.empty}> 
        <Text style={styles.emptyText}>Viaje no encontrado</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView style={styles.map} initialRegion={region}>
        <Marker coordinate={trip.coordenadasOrigen} pinColor="green" title="Origen" />
        <Marker coordinate={trip.coordenadasDestino} pinColor="blue" title="Destino" />
        <Polyline coordinates={[trip.coordenadasOrigen, trip.coordenadasDestino]} strokeColor="#2563eb" strokeWidth={4} />
      </MapView>
      <View style={styles.overlay}> 
        <Text style={styles.title}>{trip.origenCampus} → {trip.destinoCampus}</Text>
        <Text style={styles.meta}>Salida: {new Date(trip.horaSalida).toLocaleString('es-CL')}</Text>
      </View>
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
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 12,
    padding: 12,
  },
  title: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  meta: { color: '#475569', marginTop: 4 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#475569' },
});
