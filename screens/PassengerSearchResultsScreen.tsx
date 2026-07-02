import React, { useMemo } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { router, useLocalSearchParams } from 'expo-router';

import type { CampusId } from '@/constants/campuses';
import { rankTripsForPassenger } from '@/services/matching';
import type { Coordinates } from '@/store/appState';
import { useAppState } from '@/store/appState';

type Params = {
  originLat?: string;
  originLng?: string;
  destino?: CampusId;
  originLabel?: string;
};

const formatTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Horario no disponible';
  return date.toLocaleString('es-CL', { hour: '2-digit', minute: '2-digit' });
};

const asCoords = (lat?: string, lng?: string): Coordinates | null => {
  const latitude = lat ? Number(lat) : NaN;
  const longitude = lng ? Number(lng) : NaN;
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;
  return { latitude, longitude };
};

export default function PassengerSearchResultsScreen() {
  const params = useLocalSearchParams<Params>();
  const { trips, currentUser, canUserBookOrCancel } = useAppState();

  const originCoords = asCoords(params.originLat, params.originLng);
  const selectedDestination = params.destino;

  const ranked = useMemo(() => {
    if (!originCoords) return [];
    return rankTripsForPassenger({
      passengerLocation: originCoords,
      passengerCommune: params.originLabel ?? '',
      destinationId: selectedDestination,
      trips,
      now: new Date(),
    });
  }, [originCoords, params.originLabel, selectedDestination, trips]);

  const handleReserve = (tripId: string, price: number, destination: string) => {
    if (!currentUser) {
      Alert.alert('Inicia sesión para reservar');
      return;
    }
    const check = canUserBookOrCancel(currentUser, new Date());
    if (!check.allowed) {
      Alert.alert(check.reason ?? 'No puedes reservar en este momento');
      return;
    }
    // La reserva se crea al confirmar en la pantalla de pago.
    router.push({ pathname: '/payment', params: { price: price.toString(), destination, tripId } });
  };

  if (!originCoords) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Falta la ubicación de origen.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Viajes compatibles</Text>
        <TouchableOpacity
          style={styles.mapButton}
          onPress={() =>
            router.push({
              pathname: '/passenger/routes-map' as any,
              params: {
                originLat: originCoords.latitude.toString(),
                originLng: originCoords.longitude.toString(),
                destino: selectedDestination,
                originLabel: params.originLabel,
              },
            })
          }
        >
          <Text style={styles.mapButtonText}>Ver conductores</Text>
        </TouchableOpacity>
      </View>
      {params.originLabel && <Text style={styles.sub}>Origen: {params.originLabel}</Text>}
      {ranked.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No hay rutas cercanas</Text>
          <Text style={styles.emptyText}>Prueba con otra dirección o campus.</Text>
        </View>
      ) : (
        <FlatList
          data={ranked}
          keyExtractor={(item) => item.trip.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.route}>{item.trip.origenCampus} → {item.trip.destinoCampus}</Text>
                <View
                  style={[
                    styles.badge,
                    item.score >= 0.85 ? styles.badgeHigh : item.score >= 0.68 ? styles.badgeGood : styles.badgeLow,
                  ]}
                >
                  <Text style={styles.badgeText}>{item.matchLabel}</Text>
                </View>
              </View>
              <Text style={styles.meta}>Match: {item.rank}%</Text>
              <Text style={styles.meta}>Sale: {formatTime(item.trip.horaSalida)} hrs</Text>
              <Text style={styles.meta}>Precio: ${item.trip.precioCLP}</Text>
              <Text style={styles.meta}>Asientos: {item.trip.asientosDisponibles - item.trip.asientosOcupados}</Text>
              <Text style={styles.meta}>Distancia a ruta: {Math.round(item.distanceToRoute)} m</Text>
              {item.recommendedMeetingPoint && (
                <Text style={styles.meta}>
                  Punto recomendado: {item.recommendedMeetingPoint.name} ({Math.round(item.recommendedMeetingPoint.distance)} m) · {item.recommendedMeetingPoint.reason}
                </Text>
              )}
              <Text style={styles.meta}>Reputación conductor: {item.trip.driverReputation?.toFixed(1) ?? 'N/D'}</Text>
              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => router.push({ pathname: `/passenger/trip-map/${item.trip.id}` as any })}
                >
                  <Text style={styles.secondaryText}>Ver mapa</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => handleReserve(item.trip.id, item.trip.precioCLP, item.trip.destinoCampus)}
                >
                  <Text style={styles.primaryText}>Reservar</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  title: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  sub: { color: '#475569', marginTop: 2 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  mapButton: {
    backgroundColor: '#0A1525',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  mapButtonText: { color: '#fff', fontWeight: '700' },
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
  primaryButton: { flex: 1, backgroundColor: '#0A1525', paddingVertical: 10, borderRadius: 12 },
  secondaryButton: { flex: 1, borderColor: '#0A1525', borderWidth: 1, paddingVertical: 10, borderRadius: 12 },
  primaryText: { color: '#fff', textAlign: 'center', fontWeight: '700' },
  secondaryText: { color: '#0A1525', textAlign: 'center', fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 20 },
  emptyTitle: { fontWeight: '700', color: '#0f172a' },
  emptyText: { color: '#475569', marginTop: 4 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  badgeHigh: { backgroundColor: '#DCFCE7' },
  badgeGood: { backgroundColor: '#E0F2FE' },
  badgeLow: { backgroundColor: '#FEF9C3' },
  badgeText: { color: '#0f172a', fontWeight: '700' },
});
