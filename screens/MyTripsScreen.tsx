import React, { useMemo } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useAppState } from '@/store/appState';

const formatDateTimeCL = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Horario no disponible';
  }
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

type RenderItemProps = {
  id: string;
  route: string;
  date: string;
  estado: 'pendiente' | 'confirmada' | 'cancelada';
  isPast: boolean;
  tripId: string | undefined;
  driverId?: string;
};

export default function MyTripsScreen() {
  const { bookings, trips, cancelBooking, canUserBookOrCancel, currentUser, pushNotification } = useAppState();
  const now = new Date();

  const data = useMemo(() => {
    return bookings.map((booking) => {
      const trip = trips.find((t) => t.id === booking.tripId);
      const salida = trip ? new Date(trip.horaSalida) : null;
      const isPast = salida ? salida.getTime() < now.getTime() : false;
      return {
        id: booking.id,
        tripId: trip?.id,
        driverId: trip?.driverId,
        route: trip ? `${trip.origenCampus} → ${trip.destinoCampus}` : 'Ruta no disponible',
        date: trip ? formatDateTimeCL(trip.horaSalida) : 'Horario no disponible',
        estado: booking.estado,
        isPast,
      };
    });
  }, [bookings, trips, now]);

  const upcoming = data.filter((item) => !item.isPast);
  const past = data.filter((item) => item.isPast);

  const handleCancel = (bookingId: string, driverId?: string) => {
    const canProceed = canUserBookOrCancel(currentUser, new Date());
    if (!canProceed.allowed) {
      Alert.alert(canProceed.reason ?? 'No puedes cancelar en este momento');
      return;
    }

    Alert.alert('Confirmar cancelación', '¿Seguro que quieres cancelar este viaje?', [
      { text: 'No, volver', style: 'cancel' },
      {
        text: 'Sí, cancelar',
        style: 'destructive',
        onPress: () => {
          const result = cancelBooking(bookingId, new Date());
          if (!result.success && result.reason) {
            Alert.alert(result.reason);
          } else {
            pushNotification({
              message: 'Reserva cancelada por pasajero',
              targetUserId: driverId,
              type: 'warning',
            });
            Alert.alert(result.reason ?? 'Reserva cancelada');
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: RenderItemProps }) => (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.route}>{item.route}</Text>
        <View
          style={[
            styles.badge,
            item.estado === 'confirmada'
              ? styles.badgeConfirmada
              : item.estado === 'cancelada'
              ? styles.badgeCancelada
              : styles.badgePendiente,
          ]}
        >
          <Text style={styles.badgeText}>{item.estado}</Text>
        </View>
      </View>
      <Text style={styles.meta}>{item.date}</Text>
      {!item.isPast && (
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => handleCancel(item.id, item.driverId)}>
            <Text style={styles.secondaryText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      )}
      {item.isPast && <Text style={styles.metaMuted}>Este viaje ya ocurrió</Text>}
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mis viajes reservados</Text>
      <FlatList
        data={upcoming}
        keyExtractor={(trip) => trip.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<Text style={styles.metaMuted}>No tienes viajes próximos.</Text>}
      />

      {past.length > 0 && (
        <View style={styles.pastSection}>
          <Text style={styles.pastTitle}>Viajes pasados</Text>
          {past.map((item) => (
            <View key={item.id} style={styles.pastCard}>
              <Text style={styles.route}>{item.route}</Text>
              <Text style={styles.meta}>{item.date}</Text>
              <Text style={styles.metaMuted}>{item.estado}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
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
    gap: 8,
  },
  route: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  meta: {
    color: '#475569',
  },
  metaMuted: {
    color: '#94a3b8',
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
    backgroundColor: '#ffffff',
  },
  secondaryText: {
    color: '#0A1525',
    fontWeight: '700',
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  badgeConfirmada: { backgroundColor: '#DCFCE7' },
  badgeCancelada: { backgroundColor: '#FEE2E2' },
  badgePendiente: { backgroundColor: '#FEF9C3' },
  badgeText: { color: '#0f172a', fontWeight: '700', textTransform: 'capitalize' },
  pastSection: { marginTop: 16, gap: 8 },
  pastTitle: { fontWeight: '800', color: '#0f172a', fontSize: 16 },
  pastCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 4,
  },
});
