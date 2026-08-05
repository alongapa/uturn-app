import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { TripSafetyPanel } from '@/components/safety/trip-safety-panel';
import { Badge } from '@/components/ui/Badge';
import { StatusColors } from '@/constants/theme';
import { formatCLP, hoursUntil } from '@/services/payments';
import type { BookingPayment } from '@/store/appState';
import { useAppState } from '@/store/appState';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

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
  route: string;
  date: string;
  departAtMs: number;
  estado: 'pendiente' | 'confirmada' | 'cancelada' | 'completada';
  isPast: boolean;
  tripId: string | undefined;
  driverId?: string;
  pago: BookingPayment;
  yaCalificado: boolean;
};

const PAYMENT_LABELS: Record<BookingPayment['estado'], string> = {
  pendiente: 'Pago pendiente',
  marcado: 'Pago por confirmar',
  confirmado: 'Pago confirmado',
  vencido: 'Pago vencido',
  disputado: 'En disputa',
};

const PAYMENT_TONE: Record<BookingPayment['estado'], keyof typeof StatusColors> = {
  pendiente: 'warning',
  marcado: 'warning',
  confirmado: 'success',
  vencido: 'danger',
  disputado: 'info',
};

const PAYMENT_ICON_NAME: Record<BookingPayment['estado'], IoniconName> = {
  pendiente: 'time-outline',
  marcado: 'time-outline',
  confirmado: 'checkmark-circle',
  vencido: 'alert-circle',
  disputado: 'help-circle-outline',
};

const ESTADO_TONE: Record<TripRow['estado'], keyof typeof StatusColors> = {
  pendiente: 'warning',
  confirmada: 'success',
  cancelada: 'danger',
  completada: 'success',
};

const ESTADO_ICON_NAME: Record<TripRow['estado'], IoniconName> = {
  pendiente: 'time-outline',
  confirmada: 'checkmark-circle',
  cancelada: 'close-circle',
  completada: 'checkmark-circle',
};

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export default function MyTripsScreen() {
  const {
    bookings,
    trips,
    ratings,
    cancelBooking,
    canUserBookOrCancel,
    currentUser,
    pushNotification,
    markPaymentSent,
    completeBooking,
    expireOverduePayments,
  } = useAppState();
  const [now, setNow] = useState(() => new Date());

  // Al enfocar la pantalla se revisan los plazos: cada pago vencido genera un strike.
  // (useFocusEffect porque las tabs mantienen la pantalla montada.)
  useFocusEffect(
    useCallback(() => {
      const current = new Date();
      setNow(current);
      expireOverduePayments(current);
    }, [expireOverduePayments])
  );

  const data = useMemo<TripRow[]>(() => {
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
        departAtMs: salida ? salida.getTime() : 0,
        estado: booking.estado,
        isPast,
        pago: booking.pago,
        yaCalificado: ratings.some((r) => r.bookingId === booking.id && r.fromId === currentUser?.id),
      };
    });
  }, [bookings, trips, ratings, currentUser, now]);

  // Secciones: por pagar (pendiente/vencido), recientes (todos, orden cronológico
  // descendente) y pagados (confirmados por el conductor).
  const porPagar = data.filter(
    (item) => item.estado !== 'cancelada' && (item.pago.estado === 'pendiente' || item.pago.estado === 'vencido')
  );
  const recientes = [...data].sort((a, b) => b.departAtMs - a.departAtMs);
  const pagados = data.filter((item) => item.pago.estado === 'confirmado');

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

  const handleMarkPaid = (bookingId: string) => {
    const result = markPaymentSent(bookingId);
    Alert.alert(
      result.success
        ? 'Pago marcado. El conductor deberá confirmar la recepción.'
        : result.reason ?? 'No se pudo marcar el pago'
    );
  };

  const handleGoPay = (bookingId: string) => {
    router.push({ pathname: '/payment', params: { bookingId } });
  };

  const handleDispute = (bookingId: string) => {
    router.push({ pathname: '/dispute', params: { bookingId } });
  };

  const handleCompleteAndRate = (item: TripRow) => {
    if (item.estado !== 'completada') {
      const result = completeBooking(item.id);
      if (!result.success) {
        Alert.alert(result.reason ?? 'No se pudo completar el viaje');
        return;
      }
    }
    router.push({
      pathname: '/rate' as any,
      params: { bookingId: item.id, tripId: item.tripId ?? '', toId: item.driverId ?? '' },
    });
  };

  const renderPagoBadge = (pago: BookingPayment) => (
    <Badge tone={PAYMENT_TONE[pago.estado]} icon={PAYMENT_ICON_NAME[pago.estado]} label={PAYMENT_LABELS[pago.estado]} />
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Mis viajes</Text>

      {/* Selector conductor/pasajero (vivía en el tab Inicio, hoy ocupado por el feed). */}
      <View style={styles.roleRow}>
        <TouchableOpacity style={styles.roleCard} onPress={() => router.push('/driver')}>
          <View style={styles.roleIconCircle}>
            <Ionicons name="car" size={26} color="#246BFD" />
          </View>
          <Text style={styles.roleTitle}>Conductor</Text>
          <Text style={styles.roleSubtitle}>Publica viajes con punto de encuentro seguro</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.roleCard} onPress={() => router.push('/passenger')}>
          <View style={styles.roleIconCircle}>
            <Ionicons name="people" size={26} color="#246BFD" />
          </View>
          <Text style={styles.roleTitle}>Pasajero</Text>
          <Text style={styles.roleSubtitle}>Busca rutas compatibles con tu horario</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Por pagar</Text>
      {porPagar.length === 0 ? (
        <Text style={styles.metaMuted}>No tienes pagos pendientes. ¡Racha a salvo!</Text>
      ) : (
        porPagar.map((item) => (
          <View key={item.id} style={[styles.card, styles.cardPorPagar]}>
            <View style={styles.rowBetween}>
              <Text style={styles.route}>{item.route}</Text>
              <Text style={styles.amount}>{formatCLP(item.pago.totalCLP)}</Text>
            </View>
            <Text style={styles.meta}>{item.date}</Text>
            {item.pago.estado === 'pendiente' ? (
              <Text style={styles.pagoDeadline}>
                Paga antes del {formatDateTimeCL(item.pago.venceAt)} (quedan {hoursUntil(item.pago.venceAt, now)} h)
                o recibirás un strike.
              </Text>
            ) : (
              <Text style={styles.pagoVencido}>Plazo vencido: recibiste un strike. Paga cuanto antes.</Text>
            )}
            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => handleGoPay(item.id)}>
                <Text style={styles.secondaryText}>Ver datos y pagar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.payButton} onPress={() => handleMarkPaid(item.id)}>
                <Text style={styles.payButtonText}>Marcar pago realizado</Text>
              </TouchableOpacity>
            </View>
            {item.pago.estado === 'vencido' && (
              <TouchableOpacity style={styles.disputeLink} onPress={() => handleDispute(item.id)}>
                <Text style={styles.disputeLinkText}>Yo sí pagué · reclamar strike</Text>
              </TouchableOpacity>
            )}
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>Recientes</Text>
      {recientes.length === 0 ? (
        <Text style={styles.metaMuted}>Todavía no tienes viajes.</Text>
      ) : (
        recientes.map((item) => (
          <View key={item.id} style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.route}>{item.route}</Text>
              <Badge tone={ESTADO_TONE[item.estado]} icon={ESTADO_ICON_NAME[item.estado]} label={capitalize(item.estado)} />
            </View>
            <Text style={styles.meta}>{item.date}</Text>
            {item.estado !== 'cancelada' && (
              <View style={styles.rowBetween}>
                <Text style={styles.meta}>Total: {formatCLP(item.pago.totalCLP)}</Text>
                {renderPagoBadge(item.pago)}
              </View>
            )}
            {item.pago.estado === 'marcado' && item.estado !== 'cancelada' && (
              <Text style={styles.metaMuted}>Esperando que el conductor confirme la recepción.</Text>
            )}
            {!item.isPast && item.estado !== 'cancelada' && (
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => handleCancel(item.id, item.driverId)}
                >
                  <Text style={styles.secondaryText}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            )}
            {!item.isPast && item.estado === 'confirmada' && item.tripId && (
              <View style={styles.safetyBox}>
                <Text style={styles.safetyLabel}>Seguridad en el viaje</Text>
                <TripSafetyPanel tripId={item.tripId} />
              </View>
            )}
            {item.isPast && (
              <>
                <Text style={styles.metaMuted}>Este viaje ya ocurrió</Text>
                {(item.estado === 'confirmada' || item.estado === 'completada') && !item.yaCalificado && (
                  <TouchableOpacity style={styles.rateButton} onPress={() => handleCompleteAndRate(item)}>
                    <Text style={styles.rateButtonText}>
                      {item.estado === 'completada' ? 'Calificar viaje' : 'Completar y calificar'}
                    </Text>
                  </TouchableOpacity>
                )}
                {item.yaCalificado && <Text style={styles.metaMuted}>Ya calificaste este viaje</Text>}
              </>
            )}
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>Pagados</Text>
      {pagados.length === 0 ? (
        <Text style={styles.metaMuted}>Aún no registras pagos confirmados.</Text>
      ) : (
        pagados.map((item) => (
          <View key={item.id} style={styles.pastCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.route}>{item.route}</Text>
              <Text style={styles.amountPaid}>{formatCLP(item.pago.totalCLP)}</Text>
            </View>
            <Text style={styles.meta}>{item.date}</Text>
            {item.pago.confirmadoAt && (
              <Text style={styles.metaMuted}>Confirmado el {formatDateTimeCL(item.pago.confirmadoAt)}</Text>
            )}
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
  roleRow: { flexDirection: 'row', gap: 10 },
  roleCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  roleIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleTitle: { fontWeight: '800', color: '#0f172a', fontSize: 15 },
  roleSubtitle: { color: '#475569', fontSize: 11.5, textAlign: 'center' },
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
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
    flexWrap: 'wrap',
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
  pagoDeadline: { color: '#92400e', fontSize: 13 },
  pagoVencido: { color: '#b91c1c', fontWeight: '700', fontSize: 13 },
  payButton: {
    backgroundColor: '#0A1525',
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  payButtonText: { color: '#ffffff', fontWeight: '700' },
  disputeLink: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#f59e0b',
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: '#fffbeb',
  },
  disputeLinkText: { color: '#b45309', fontWeight: '700' },
  rateButton: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#0A1525',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
  },
  rateButtonText: { color: '#0A1525', fontWeight: '700' },
  safetyBox: { marginTop: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e2e8f0', gap: 8 },
  safetyLabel: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  pastCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 4,
  },
});
