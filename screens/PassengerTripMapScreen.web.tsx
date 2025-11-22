import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { useAppState } from '@/store/appState';

export default function PassengerTripMapScreenWeb() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { trips } = useAppState();

  const trip = trips.find((t) => t.id === id);

  if (!trip) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Viaje no encontrado</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>{trip.origenCampus} → {trip.destinoCampus}</Text>
        <Text style={styles.meta}>Salida: {new Date(trip.horaSalida).toLocaleString('es-CL')}</Text>
        <View style={styles.coords}>
          <Text style={styles.coordText}>
            Origen: {trip.coordenadasOrigen.latitude.toFixed(4)}, {trip.coordenadasOrigen.longitude.toFixed(4)}
          </Text>
          <Text style={styles.coordText}>
            Destino: {trip.coordenadasDestino.latitude.toFixed(4)}, {trip.coordenadasDestino.longitude.toFixed(4)}
          </Text>
        </View>
        <Text style={styles.note}>El mapa interactivo no está disponible en la web. Usa la app móvil para ver la ruta.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  title: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  meta: { color: '#475569' },
  coords: { gap: 4 },
  coordText: { color: '#0f172a', fontWeight: '600' },
  note: { color: '#334155', marginTop: 6 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#475569' },
});
