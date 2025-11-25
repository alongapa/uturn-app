import * as Location from 'expo-location';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { meetingPoints } from '@/constants/meetingPoints';
import { useAppState } from '@/store/appState';
import { useLocalSearchParams } from 'expo-router';

type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

const DEFAULT_REGION: MapRegion = {
  latitude: -33.4489,
  longitude: -70.6693,
  latitudeDelta: 0.2,
  longitudeDelta: 0.2,
};

const colors = {
  origin: '#E11D48',
  meeting: '#16A34A',
  destination: '#2563EB',
  route: '#0A1525',
};

export default function MapScreen() {
  const { tripId, meetingPointId } = useLocalSearchParams<{ tripId?: string; meetingPointId?: string }>();
  const { trips } = useAppState();
  const [region, setRegion] = useState<MapRegion>(DEFAULT_REGION);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const mapRef = useRef<any>(null);

  const trip = useMemo(() => trips.find((t) => t.id === tripId), [trips, tripId]);
  const targetPoint = useMemo(
    () => meetingPoints.find((point) => point.id === meetingPointId || point.id === trip?.puntoEncuentroId),
    [meetingPointId, trip?.puntoEncuentroId]
  );

  useEffect(() => {
    if (trip) {
      const points = trip.routePolyline && trip.routePolyline.length >= 2
        ? trip.routePolyline
        : [trip.coordenadasOrigen, trip.coordenadasDestino];
      const coords = targetPoint ? [...points, targetPoint.coordenadas] : points;
      if (mapRef.current && coords.length >= 2) {
        mapRef.current.fitToCoordinates(coords, {
          edgePadding: { top: 60, bottom: 60, left: 40, right: 40 },
          animated: true,
        });
      }
      setLoadingLocation(false);
      return;
    }

    if (targetPoint) {
      setRegion({ ...targetPoint.coordenadas, latitudeDelta: 0.05, longitudeDelta: 0.05 });
      setLoadingLocation(false);
      return;
    }

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLoadingLocation(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      setRegion({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      });
      setLoadingLocation(false);
    })().catch((error) => {
      console.error(error);
      setLoadingLocation(false);
      Alert.alert('No se pudo obtener tu ubicación');
    });
  }, [trip, targetPoint]);

  return (
    <SafeAreaView style={styles.safeArea}>
      {loadingLocation ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loaderText}>Buscando ubicación...</Text>
        </View>
      ) : (
        <MapView ref={mapRef} style={styles.map} region={region}>
          {trip ? (
            <>
              <Marker coordinate={trip.coordenadasOrigen} pinColor={colors.origin} title="Origen" />
              {trip.meetingPointCoords && (
                <Marker coordinate={trip.meetingPointCoords} pinColor={colors.meeting} title="Punto de encuentro" />
              )}
              <Marker coordinate={trip.coordenadasDestino} pinColor={colors.destination} title="Destino" />
              <Polyline
                coordinates={
                  trip.routePolyline && trip.routePolyline.length >= 2
                    ? trip.routePolyline
                    : [trip.coordenadasOrigen, trip.coordenadasDestino]
                }
                strokeColor={colors.route}
                strokeWidth={4}
              />
            </>
          ) : (
            meetingPoints.map((point) => (
              <Marker
                key={point.id}
                coordinate={point.coordenadas}
                title={point.nombre}
                description={point.tipo === 'campus' ? 'Campus' : 'Punto de encuentro'}
                pinColor={point.tipo === 'meeting-point' ? colors.meeting : colors.destination}
              />
            ))
          )}
        </MapView>
      )}
      <View style={styles.floatingCard}>
        <Text style={styles.cardTitle}>Región Metropolitana</Text>
        <Text style={styles.cardMeta}>Puntos de encuentro y campus activos</Text>
        <TouchableOpacity style={styles.button} onPress={() => setRegion(DEFAULT_REGION)}>
          <Text style={styles.buttonText}>Recentrar</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  loaderText: {
    marginTop: 12,
    color: '#0f172a',
  },
  floatingCard: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  cardMeta: {
    color: '#475569',
  },
  button: {
    marginTop: 8,
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '700',
  },
});
