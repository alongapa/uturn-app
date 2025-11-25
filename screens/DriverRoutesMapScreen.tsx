import React, { useEffect, useMemo, useRef } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';

import MapView, { Marker, Polyline } from 'react-native-maps';

import { useAppState } from '@/store/appState';

const { width, height } = Dimensions.get('window');
const ASPECT_RATIO = width / height;
const LATITUDE_DELTA = 0.09;
const LONGITUDE_DELTA = LATITUDE_DELTA * ASPECT_RATIO;

const colors = {
  origin: '#E11D48',
  meeting: '#16A34A',
  destination: '#2563EB',
  route: '#0A1525',
};

export default function DriverRoutesMapScreen() {
  const { trips, currentUser } = useAppState();
  const mapRef = useRef<any>(null);

  const driverTrips = useMemo(
    () => trips.filter((trip) => trip.driverId === currentUser?.id),
    [currentUser?.id, trips]
  );

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

  useEffect(() => {
    if (!mapRef.current || driverTrips.length === 0) return;
    const coords = driverTrips.flatMap((trip) => {
      if (trip.routePolyline && trip.routePolyline.length >= 2) return trip.routePolyline;
      const points = [trip.coordenadasOrigen];
      if (trip.meetingPointCoords) points.push(trip.meetingPointCoords);
      points.push(trip.coordenadasDestino);
      return points;
    });
    if (coords.length < 2) return;
    mapRef.current.fitToCoordinates(coords, {
      edgePadding: { top: 60, bottom: 60, left: 40, right: 40 },
      animated: true,
    });
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
      <MapView ref={mapRef} style={styles.map} initialRegion={region}>
        {driverTrips.map((trip) => {
          const polyline =
            trip.routePolyline && trip.routePolyline.length >= 2
              ? trip.routePolyline
              : [trip.coordenadasOrigen, trip.coordenadasDestino];
          return (
            <React.Fragment key={trip.id}>
              <Marker coordinate={trip.coordenadasOrigen} pinColor={colors.origin} title="Origen" description={trip.origenCampus} />
              {trip.meetingPointCoords && (
                <Marker
                  coordinate={trip.meetingPointCoords}
                  pinColor={colors.meeting}
                  title="Punto de encuentro"
                  description={trip.puntoEncuentroId}
                />
              )}
              <Marker
                coordinate={trip.coordenadasDestino}
                pinColor={colors.destination}
                title="Destino"
                description={trip.destinoCampus}
              />
              <Polyline coordinates={polyline} strokeColor={colors.route} strokeWidth={4} />
            </React.Fragment>
          );
        })}
      </MapView>
      <View style={styles.legend}>
        <Text style={styles.legendText}>Origen: rojo</Text>
        <Text style={styles.legendText}>Punto de encuentro: verde</Text>
        <Text style={styles.legendText}>Destino: azul</Text>
        <Text style={styles.legendText}>Ruta activa: línea azul marino</Text>
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
