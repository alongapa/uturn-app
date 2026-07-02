import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { formatDeadline, PAYMENT_WINDOW_HOURS } from '@/services/credits';
import { useAppState } from '@/store/appState';

export default function PaymentScreen() {
  const { price, destination, tripId, bookingId } = useLocalSearchParams<{
    price?: string;
    destination?: string;
    tripId?: string;
    bookingId?: string;
  }>();
  const { addBooking, currentUser, bookings, trips, payBooking } = useAppState();

  const booking = bookingId ? bookings.find((b) => b.id === bookingId) : undefined;
  const bookingTrip = booking ? trips.find((t) => t.id === booking.tripId) : undefined;

  const handlePayExisting = () => {
    if (!booking) return;
    const result = payBooking(booking.id);
    if (!result.success) {
      Alert.alert(result.reason ?? 'No pudimos registrar el pago');
      return;
    }
    Alert.alert(
      'Pago registrado',
      result.creditosGanados
        ? `¡Listo! Ganaste +${result.creditosGanados} créditos Uturn.`
        : '¡Listo! Tu pago quedó registrado.'
    );
    router.replace('/(tabs)/my-trips');
  };

  const handleConfirm = () => {
    if (!currentUser) {
      Alert.alert('Debes iniciar sesión para confirmar.');
      return;
    }

    addBooking({
      tripId: tripId ?? 'sin-trip',
      passengerId: currentUser.id,
      estado: 'confirmada',
      montoCLP: Number(price) || undefined,
    });
    Alert.alert('Reserva confirmada', `Recuerda pagar dentro de ${PAYMENT_WINDOW_HOURS} horas para mantener tu racha.`);
    router.replace('/(tabs)');
  };

  if (bookingId) {
    if (!booking) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Pago no disponible</Text>
          <Text style={styles.detailLabel}>No encontramos esta reserva.</Text>
          <TouchableOpacity style={styles.button} onPress={() => router.back()}>
            <Text style={styles.buttonText}>Volver</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const amount = booking.montoCLP ?? bookingTrip?.precioCLP ?? 0;
    const alreadyPaid = booking.estadoPago === 'pagado';

    return (
      <View style={styles.container}>
        <Text style={styles.title}>Pago de viaje</Text>
        <Text style={styles.detailLabel}>Ruta</Text>
        <Text style={styles.detailValue}>
          {bookingTrip ? `${bookingTrip.origenCampus} → ${bookingTrip.destinoCampus}` : 'Ruta no disponible'}
        </Text>
        <Text style={styles.detailLabel}>Total a pagar</Text>
        <Text style={styles.amount}>${amount.toLocaleString('es-CL')}</Text>
        {!alreadyPaid && booking.pagoVenceAt && (
          <Text style={styles.deadline}>{formatDeadline(booking.pagoVenceAt)}</Text>
        )}

        {alreadyPaid ? (
          <Text style={styles.paidNote}>Esta reserva ya está pagada. ¡Gracias!</Text>
        ) : (
          <TouchableOpacity style={styles.button} onPress={handlePayExisting}>
            <Text style={styles.buttonText}>Pagar ahora</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Resumen de pago</Text>
      <Text style={styles.detailLabel}>Destino</Text>
      <Text style={styles.detailValue}>{destination ?? 'Destino no especificado'}</Text>
      <Text style={styles.detailLabel}>Total a pagar</Text>
      <Text style={styles.amount}>${price ?? '0'}</Text>

      <TouchableOpacity style={styles.button} onPress={handleConfirm}>
        <Text style={styles.buttonText}>Confirmar reserva</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 24,
    color: '#0f172a',
  },
  detailLabel: {
    fontSize: 14,
    color: '#475569',
    marginTop: 12,
  },
  detailValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
    textAlign: 'center',
  },
  amount: {
    fontSize: 32,
    fontWeight: '800',
    marginVertical: 16,
    color: '#1d4ed8',
  },
  deadline: {
    color: '#b45309',
    fontWeight: '700',
  },
  paidNote: {
    marginTop: 24,
    color: '#16a34a',
    fontWeight: '700',
  },
  button: {
    marginTop: 24,
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
