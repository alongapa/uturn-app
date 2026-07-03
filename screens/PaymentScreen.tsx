import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { PAYMENT_DEADLINE_HOURS, formatCLP, getPaymentBreakdown } from '@/services/payments';
import { useAppState } from '@/store/appState';

const formatDateTimeCL = (iso: string) => new Date(iso).toLocaleString('es-CL');

export default function PaymentScreen() {
  const { price, destination, tripId, bookingId: bookingIdParam } = useLocalSearchParams<{
    price?: string;
    destination?: string;
    tripId?: string;
    bookingId?: string;
  }>();
  const {
    trips,
    bookings,
    addBooking,
    markPaymentSent,
    getDriverBankDetails,
    canUserBookOrCancel,
    pushNotification,
    currentUser,
  } = useAppState();

  // Puede llegar con una reserva existente (desde Mis viajes o el perfil) o
  // crearla aquí al confirmar (flujo de reserva original).
  const [bookingId, setBookingId] = useState<string | null>(bookingIdParam ?? null);
  const booking = bookings.find((b) => b.id === bookingId);

  const trip = useMemo(
    () => trips.find((t) => t.id === (booking ? booking.tripId : tripId)),
    [trips, tripId, booking]
  );
  const precioCupo = trip?.precioCLP ?? Number(price ?? 0);
  const breakdown = booking
    ? { precioCLP: booking.pago.precioCLP, comisionCLP: booking.pago.comisionCLP, totalCLP: booking.pago.totalCLP }
    : getPaymentBreakdown(precioCupo);
  const bankDetails = trip ? getDriverBankDetails(trip.driverId) : null;
  const destino = trip?.destinoCampus ?? destination ?? 'Destino no especificado';

  if (bookingIdParam && !booking) {
    return (
      <View style={styles.missingContainer}>
        <Text style={styles.title}>Pago no disponible</Text>
        <Text style={styles.detailLabel}>No encontramos esta reserva.</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.back()}>
          <Text style={styles.buttonText}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleConfirm = () => {
    if (!currentUser) {
      Alert.alert('Debes iniciar sesión para confirmar.');
      return;
    }
    const check = canUserBookOrCancel(currentUser, new Date());
    if (!check.allowed) {
      Alert.alert(check.reason ?? 'No puedes reservar en este momento');
      return;
    }

    const newBooking = addBooking({
      tripId: tripId ?? 'sin-trip',
      passengerId: currentUser.id,
      estado: 'confirmada',
    });
    setBookingId(newBooking.id);
    pushNotification({
      message: 'Un pasajero reservó tu viaje (pago pendiente)',
      type: 'action',
      targetUserId: trip?.driverId,
    });
    Alert.alert(
      'Reserva confirmada',
      `Tienes ${PAYMENT_DEADLINE_HOURS} horas para transferir ${formatCLP(breakdown.totalCLP)} al conductor. Si no pagas a tiempo recibirás un strike.`
    );
  };

  const handleMarkPaid = () => {
    if (!booking) return;
    const result = markPaymentSent(booking.id);
    if (!result.success) {
      Alert.alert(result.reason ?? 'No se pudo marcar el pago');
      return;
    }
    Alert.alert(
      'Pago marcado',
      'El conductor deberá confirmar la recepción. Cuando lo haga, sumarás créditos Uturn por pagar a tiempo.'
    );
    router.replace('/(tabs)/my-trips');
  };

  const handlePayLater = () => {
    Alert.alert(
      'Pago pendiente',
      'Puedes marcar el pago desde "Mis viajes". Recuerda: tienes 48 horas antes de recibir un strike.'
    );
    router.replace('/(tabs)/my-trips');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Resumen de pago</Text>
      <Text style={styles.detailLabel}>Destino</Text>
      <Text style={styles.detailValue}>{destino}</Text>

      <View style={styles.breakdownCard}>
        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>Precio del cupo</Text>
          <Text style={styles.breakdownValue}>{formatCLP(breakdown.precioCLP)}</Text>
        </View>
        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>Comisión Uturn</Text>
          <Text style={styles.breakdownValue}>{formatCLP(breakdown.comisionCLP)}</Text>
        </View>
        <View style={[styles.breakdownRow, styles.breakdownTotalRow]}>
          <Text style={styles.breakdownTotalLabel}>Total a pagar</Text>
          <Text style={styles.amount}>{formatCLP(breakdown.totalCLP)}</Text>
        </View>
      </View>

      <View style={styles.bankCard}>
        <Text style={styles.bankTitle}>Datos bancarios del conductor</Text>
        {bankDetails ? (
          <>
            <BankRow label="Titular" value={bankDetails.titular} />
            {bankDetails.rut && <BankRow label="RUT" value={bankDetails.rut} />}
            <BankRow label="Banco" value={bankDetails.banco} />
            <BankRow label="Tipo de cuenta" value={bankDetails.tipoCuenta} />
            <BankRow label="N° de cuenta" value={bankDetails.numeroCuenta} />
            <Text style={styles.bankHint}>
              Transfiere el total y luego marca el pago como realizado. El conductor confirmará la
              recepción.
            </Text>
          </>
        ) : (
          <Text style={styles.bankHint}>
            El conductor aún no registra sus datos bancarios. Coordina el pago directamente con él.
          </Text>
        )}
      </View>

      {!booking ? (
        <>
          <Text style={styles.deadlineHint}>
            Al confirmar, tu pago quedará pendiente con un plazo de {PAYMENT_DEADLINE_HOURS} horas.
            Plazo vencido sin pagar = 1 strike (3 strikes = baneo de 2 días de los turnos).
          </Text>
          <TouchableOpacity style={styles.button} onPress={handleConfirm}>
            <Text style={styles.buttonText}>Confirmar reserva</Text>
          </TouchableOpacity>
        </>
      ) : booking.pago.estado === 'confirmado' ? (
        <Text style={styles.paidNote}>Este pago ya fue confirmado por el conductor. ¡Gracias!</Text>
      ) : booking.pago.estado === 'marcado' ? (
        <View style={styles.deadlineCard}>
          <Text style={styles.deadlineTitle}>Pago por confirmar</Text>
          <Text style={styles.deadlineText}>
            Marcaste el pago como realizado. Espera la confirmación del conductor.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.deadlineCard}>
            <Text style={styles.deadlineTitle}>
              {booking.pago.estado === 'vencido' ? 'Pago vencido' : 'Pago pendiente'}
            </Text>
            <Text style={styles.deadlineText}>
              {booking.pago.estado === 'vencido'
                ? 'El plazo venció y recibiste un strike. Paga cuanto antes para evitar más sanciones.'
                : `Vence el ${formatDateTimeCL(booking.pago.venceAt)} (${PAYMENT_DEADLINE_HOURS} horas de plazo).`}
            </Text>
          </View>
          <TouchableOpacity style={styles.button} onPress={handleMarkPaid}>
            <Text style={styles.buttonText}>Ya realicé el pago</Text>
          </TouchableOpacity>
          {!bookingIdParam && (
            <TouchableOpacity style={styles.secondaryButton} onPress={handlePayLater}>
              <Text style={styles.secondaryButtonText}>Pagar más tarde</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </ScrollView>
  );
}

function BankRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.bankRow}>
      <Text style={styles.bankLabel}>{label}</Text>
      <Text style={styles.bankValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    padding: 24,
    gap: 8,
  },
  missingContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
    color: '#0f172a',
  },
  detailLabel: {
    fontSize: 14,
    color: '#475569',
    marginTop: 4,
  },
  detailValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
  },
  breakdownCard: {
    marginTop: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    gap: 10,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownLabel: { color: '#475569' },
  breakdownValue: { color: '#0f172a', fontWeight: '600' },
  breakdownTotalRow: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 10,
  },
  breakdownTotalLabel: { color: '#0f172a', fontWeight: '700' },
  amount: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1d4ed8',
  },
  bankCard: {
    marginTop: 12,
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    padding: 16,
    gap: 8,
  },
  bankTitle: { fontWeight: '700', color: '#0f172a', fontSize: 16 },
  bankRow: { flexDirection: 'row', justifyContent: 'space-between' },
  bankLabel: { color: '#475569' },
  bankValue: { color: '#0f172a', fontWeight: '600' },
  bankHint: { color: '#475569', fontSize: 13, marginTop: 4 },
  deadlineHint: {
    color: '#92400e',
    backgroundColor: '#fef3c7',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    fontSize: 13,
  },
  deadlineCard: {
    marginTop: 12,
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  deadlineTitle: { fontWeight: '800', color: '#92400e' },
  deadlineText: { color: '#92400e' },
  paidNote: {
    marginTop: 16,
    color: '#16a34a',
    fontWeight: '700',
    textAlign: 'center',
  },
  button: {
    marginTop: 16,
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '700',
  },
});
