import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { formatCLP, formatDeadline } from '@/services/credits';
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

type TripRow = {
  id: string;
  tripId: string | undefined;
  driverId?: string;
  route: string;
  date: string;
  departAtMs: number;
  estado: 'pendiente' | 'confirmada' | 'cancelada';
  isPast: boolean;
  estadoPago: 'pendiente' | 'pagado';
  montoCLP?: number;
  pagoVenceAt?: string;
  pagadoAt?: string;
};

export default function MyTripsScreen() {
  const { bookings, trips, cancelBooking, canUserBookOrCancel, currentUser, pushNotification } = useAppState();
  const now = new Date();

  const rows = useMemo<TripRow[]>(() => {
    return bookings.map((booking) => {
      const trip = trips.find((t) => t.id === booking.tripId);
      const salida = trip ? new Date(trip.horaSalida) : null;
      const departAtMs = salida ? salida.getTime() : 0;
      const isPast = salida ? salida.getTime() < now.getTime() : false;
      return {
        id: booking.id,
        tripId: trip?.id,
        driverId: trip?.driverId,
        route: trip ? `${trip.origenCampus} → ${trip.destinoCampus}` : 'Ruta no disponible',
        date: trip ? formatDateTimeCL(trip.horaSalida) : 'Horario no disponible',
        departAtMs,
        estado: booking.estado,
        isPast,
        estadoPago: booking.estadoPago,
        montoCLP: booking.montoCLP,
        pagoVenceAt: booking.pagoVenceAt,
        pagadoAt: booking.pagadoAt,
      };
    });
  }, [bookings, trips, now]);

  const porPagar = rows.filter((row) => row.estado !== 'cancelada' && row.estadoPago === 'pendiente');
  const recientes = [...rows].sort((a, b) => b.departAtMs - a.departAtMs);
  const pagados = rows.filter((row) => row.estadoPago === 'pagado');

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

  const handlePay = (bookingId: string) => {
    router.push({ pathname: '/payment', params: { bookingId } });
  };

  const renderPaymentBadge = (row: TripRow) => {
    if (row.estado === 'cancelada') return null;
    const paid = row.estadoPago === 'pagado';
    return (
      <View style={[styles.badge, paid ? styles.badgePagado : styles.badgePorPagar]}>
        <Text style={styles.badgeText}>{paid ? 'Pagado' : 'Por pagar'}</Text>
      </View>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Mis viajes</Text>

      <Text style={styles.sectionTitle}>Por pagar</Text>
      {porPagar.length === 0 ? (
        <Text style={styles.metaMuted}>No tienes pagos pendientes. ¡Bien ahí!</Text>
      ) : (
        porPagar.map((row) => {
          const overdue = row.pagoVenceAt ? new Date(row.pagoVenceAt).getTime() < now.getTime() : false;
          return (
            <View key={row.id} style={[styles.card, styles.cardPorPagar]}>
              <View style={styles.rowBetween}>
                <Text style={styles.route}>{row.route}</Text>
                {row.montoCLP !== undefined && <Text style={styles.amount}>{formatCLP(row.montoCLP)}</Text>}
              </View>
              <Text style={styles.meta}>{row.date}</Text>
              {row.pagoVenceAt && (
                <Text style={[styles.deadline, overdue && styles.deadlineOverdue]}>
                  {formatDeadline(row.pagoVenceAt, now)}
                </Text>
              )}
              <TouchableOpacity style={styles.payButton} onPress={() => handlePay(row.id)}>
                <Text style={styles.payButtonText}>Pagar ahora</Text>
              </TouchableOpacity>
            </View>
          );
        })
      )}

      <Text style={styles.sectionTitle}>Recientes</Text>
      {recientes.length === 0 ? (
        <Text style={styles.metaMuted}>Todavía no tienes viajes.</Text>
      ) : (
        recientes.map((row) => (
          <View key={row.id} style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.route}>{row.route}</Text>
              <View
                style={[
                  styles.badge,
                  row.estado === 'confirmada'
                    ? styles.badgeConfirmada
                    : row.estado === 'cancelada'
                    ? styles.badgeCancelada
                    : styles.badgePendiente,
                ]}
              >
                <Text style={styles.badgeText}>{row.estado}</Text>
              </View>
            </View>
            <Text style={styles.meta}>{row.date}</Text>
            <View style={styles.rowBetween}>
              {renderPaymentBadge(row)}
              {!row.isPast && row.estado !== 'cancelada' && (
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => handleCancel(row.id, row.driverId)}
                >
                  <Text style={styles.secondaryText}>Cancelar</Text>
                </TouchableOpacity>
              )}
            </View>
            {row.isPast && <Text style={styles.metaMuted}>Este viaje ya ocurrió</Text>}
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>Pagados</Text>
      {pagados.length === 0 ? (
        <Text style={styles.metaMuted}>Aún no registras pagos.</Text>
      ) : (
        pagados.map((row) => (
          <View key={row.id} style={styles.pastCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.route}>{row.route}</Text>
              {row.montoCLP !== undefined && <Text style={styles.amountPaid}>{formatCLP(row.montoCLP)}</Text>}
            </View>
            <Text style={styles.meta}>{row.date}</Text>
            {row.pagadoAt && <Text style={styles.metaMuted}>Pagado el {formatDateTimeCL(row.pagadoAt)}</Text>}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 8,
  },
  card: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  cardPorPagar: {
    borderColor: '#fcd34d',
    backgroundColor: '#fffbeb',
  },
  route: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    flexShrink: 1,
  },
  meta: {
    color: '#475569',
  },
  metaMuted: {
    color: '#94a3b8',
  },
  amount: {
    fontSize: 16,
    fontWeight: '800',
    color: '#b45309',
  },
  amountPaid: {
    fontSize: 15,
    fontWeight: '800',
    color: '#16a34a',
  },
  deadline: {
    color: '#b45309',
    fontWeight: '700',
  },
  deadlineOverdue: {
    color: '#dc2626',
  },
  payButton: {
    backgroundColor: '#0A1525',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  payButtonText: {
    color: '#ffffff',
    fontWeight: '800',
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
  badgePagado: { backgroundColor: '#DCFCE7' },
  badgePorPagar: { backgroundColor: '#FEF3C7' },
  badgeText: { color: '#0f172a', fontWeight: '700', textTransform: 'capitalize' },
  pastCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 4,
  },
});
