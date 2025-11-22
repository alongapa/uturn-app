import React, { useMemo } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useLocalSearchParams, router } from 'expo-router';

import { useAppState } from '@/store/appState';

export default function PassengerSearchResultsScreen() {
  const params = useLocalSearchParams<{ origen?: string; destino?: string; horario?: string }>();
  const { trips, addBooking, currentUser } = useAppState();

  const filtered = useMemo(() => {
    return trips.filter((trip) => {
      const matchOrigen = params.origen ? trip.origenCampus.toLowerCase().includes(params.origen.toLowerCase()) : true;
      const matchDestino = params.destino
        ? trip.destinoCampus.toLowerCase().includes(params.destino.toLowerCase())
        : true;
      return matchOrigen && matchDestino;
    });
  }, [params.destino, params.origen, trips]);

  const handleReserve = (tripId: string, price: number, destination: string) => {
    if (!currentUser) return;
    addBooking({ tripId, passengerId: currentUser.id, estado: 'confirmada' });
    router.push({ pathname: '/payment', params: { price: price.toString(), destination, tripId } });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Resultados de búsqueda</Text>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.route}>{item.origenCampus} → {item.destinoCampus}</Text>
            <Text style={styles.meta}>Sale: {new Date(item.horaSalida).toLocaleTimeString('es-CL')}</Text>
            <Text style={styles.meta}>Precio: ${item.precioCLP}</Text>
            <Text style={styles.meta}>Asientos: {item.asientosDisponibles - item.asientosOcupados}</Text>
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => router.push({ pathname: `/passenger/trip-map/${item.id}` })}
              >
                <Text style={styles.secondaryText}>Ver en mapa</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => handleReserve(item.id, item.precioCLP, item.destinoCampus)}
              >
                <Text style={styles.primaryText}>Reservar</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  title: { fontSize: 20, fontWeight: '800', color: '#0f172a', marginBottom: 12 },
  list: { gap: 12 },
  card: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 6,
  },
  route: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  meta: { color: '#475569' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, gap: 8 },
  primaryButton: { flex: 1, backgroundColor: '#2563eb', paddingVertical: 10, borderRadius: 12 },
  secondaryButton: { flex: 1, borderColor: '#2563eb', borderWidth: 1, paddingVertical: 10, borderRadius: 12 },
  primaryText: { color: '#fff', textAlign: 'center', fontWeight: '700' },
  secondaryText: { color: '#2563eb', textAlign: 'center', fontWeight: '700' },
});
