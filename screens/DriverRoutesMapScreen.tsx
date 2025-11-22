import React, { useMemo } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';

import MapView, { Marker, Polyline } from 'react-native-maps';

import { useAppState } from '@/store/appState';

const { width, height } = Dimensions.get('window');
const ASPECT_RATIO = width / height;
const LATITUDE_DELTA = 0.09;
const LONGITUDE_DELTA = LATITUDE_DELTA * ASPECT_RATIO;

export default function DriverRoutesMapScreen() {
  const { trips, currentUser } = useAppState();

  const driverTrips = useMemo(() => trips.filter((trip) => trip.driverId === currentUser?.id), [currentUser?.id, trips]);

  const region = useMemo(() => {
    if (!driverTrips.length) return undefined;
    const first = driverTrips[0];
    return {
      latitude: first.coordenadasOrigen.latitude,
      longitude: first.coordenadasOrigen.longitude,
      latitudeDelta: LATITUDE_DELTA,
      longitudeDelta: LONGITUDE_DELTA,
    };
  }, [driverTrips]);

  if (!region) {
    return (
      <View style={styles.empty}> 
        <Text style={styles.emptyText}>No tienes rutas publicadas todavía.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView style={styles.map} initialRegion={region}>
        {driverTrips.map((trip) => (
          <React.Fragment key={trip.id}>
            <Marker coordinate={trip.coordenadasOrigen} pinColor="green" title="Origen" description={trip.origenCampus} />
            <Marker coordinate={trip.coordenadasDestino} pinColor="blue" title="Destino" description={trip.destinoCampus} />
            <Polyline
              coordinates={[trip.coordenadasOrigen, trip.coordenadasDestino]}
              strokeColor="#2563eb"
              strokeWidth={4}
            />
          </React.Fragment>
        ))}
      </MapView>
      <View style={styles.legend}> 
        <Text style={styles.legendText}>Punto de Encuentro: Verde</Text>
        <Text style={styles.legendText}>Destino: Azul</Text>
        <Text style={styles.legendText}>Ruta activa: Línea azul</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  legend: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  legendText: { color: '#0f172a' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#475569' },
});
