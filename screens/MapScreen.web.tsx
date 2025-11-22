import * as Location from 'expo-location';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { meetingPoints } from '@/constants/meetingPoints';
import { useAppState } from '@/store/appState';
import { useLocalSearchParams } from 'expo-router';

type MapRegion = {
  latitude: number;
  longitude: number;
};

const DEFAULT_REGION: MapRegion = {
  latitude: -33.4489,
  longitude: -70.6693,
};

export default function MapScreenWeb() {
  const { tripId, meetingPointId } = useLocalSearchParams<{ tripId?: string; meetingPointId?: string }>();
  const { trips } = useAppState();
  const [current, setCurrent] = useState<MapRegion | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(true);

  const trip = useMemo(() => trips.find((t) => t.id === tripId), [trips, tripId]);
  const targetPoint = useMemo(
    () => meetingPoints.find((point) => point.id === meetingPointId || point.id === trip?.puntoEncuentroId),
    [meetingPointId, trip?.puntoEncuentroId]
  );

  useEffect(() => {
    if (targetPoint) {
      setCurrent(targetPoint.coordenadas);
      setLoadingLocation(false);
      return;
    }

    if (trip) {
      setCurrent(trip.coordenadasOrigen);
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
      setCurrent({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
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
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>Mapa no disponible en web</Text>
        <Text style={styles.bannerText}>
          Abre la app móvil para ver el mapa interactivo. Aquí tienes la ubicación aproximada:
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Referencia de ubicación</Text>
        {loadingLocation ? (
          <View style={styles.loader}>
            <ActivityIndicator size="small" color="#2563eb" />
            <Text style={styles.loaderText}>Buscando ubicación...</Text>
          </View>
        ) : (
          <View style={styles.coords}>
            <Text style={styles.coordText}>
              Lat: {(current?.latitude ?? DEFAULT_REGION.latitude).toFixed(4)}
            </Text>
            <Text style={styles.coordText}>
              Lng: {(current?.longitude ?? DEFAULT_REGION.longitude).toFixed(4)}
            </Text>
          </View>
        )}
        <TouchableOpacity style={styles.button} onPress={() => setCurrent(DEFAULT_REGION)}>
          <Text style={styles.buttonText}>Usar región por defecto</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Puntos de encuentro</Text>
        {meetingPoints.map((point) => (
          <View key={point.id} style={styles.pointRow}>
            <Text style={styles.pointName}>{point.nombre}</Text>
            <Text style={styles.pointMeta}>
              {point.coordenadas.latitude.toFixed(4)}, {point.coordenadas.longitude.toFixed(4)}
            </Text>
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 16,
    gap: 12,
  },
  banner: {
    backgroundColor: '#e0f2fe',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    gap: 4,
  },
  bannerTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  bannerText: { color: '#334155' },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  loader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loaderText: { color: '#475569' },
  coords: { flexDirection: 'row', gap: 12 },
  coordText: { color: '#0f172a', fontWeight: '600' },
  button: {
    marginTop: 4,
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  buttonText: { color: '#ffffff', fontWeight: '700' },
  pointRow: { borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 8 },
  pointName: { color: '#0f172a', fontWeight: '600' },
  pointMeta: { color: '#475569' },
});
