import React, { useMemo } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useAppState } from '@/store/appState';

export default function MyTripsScreen() {
  const { bookings, trips, cancelBooking, canUserBookOrCancel, currentUser } = useAppState();

  const data = useMemo(
    () =>
      bookings.map((booking) => {
        const trip = trips.find((t) => t.id === booking.tripId);
        return {
          ...booking,
          route: trip ? `${trip.origenCampus} → ${trip.destinoCampus}` : 'Ruta no disponible',
          date: trip ? new Date(trip.horaSalida).toLocaleString('es-CL') : 'Horario no disponible',
        };
      }),
    [bookings, trips]
  );

  const handleCancel = (bookingId: string) => {
    const canProceed = canUserBookOrCancel(currentUser, new Date());
    if (!canProceed.allowed) {
      Alert.alert(canProceed.reason ?? 'No puedes cancelar en este momento');
      return;
    }

    const result = cancelBooking(bookingId, new Date());
    if (!result.success && result.reason) {
      Alert.alert(result.reason);
    } else {
      Alert.alert(result.reason ?? 'Reserva cancelada');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mis viajes reservados</Text>
      <FlatList
        data={data}
        keyExtractor={(trip) => trip.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.route}>{item.route}</Text>
            <Text style={styles.meta}>{item.date}</Text>
            <Text style={styles.meta}>Estado: {item.estado}</Text>
            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => handleCancel(item.id)}>
                <Text style={styles.secondaryText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    padding: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 16,
    textAlign: 'center',
  },
  listContent: {
    gap: 12,
  },
  card: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  route: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 8,
  },
  meta: {
    color: '#475569',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
  },
  secondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  secondaryText: {
    color: '#0f172a',
    fontWeight: '700',
  },
});
