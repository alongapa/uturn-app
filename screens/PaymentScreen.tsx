import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useNotifications } from '@/contexts/NotificationsContext';
import { useUser } from '@/contexts/UserContext';
import { createPaymentIntent, getPlatformConfig } from '@/services/api/payments';
import {
  DEFAULT_PAYMENT_CONFIG,
  PAYMENT_DEADLINE_HOURS,
  formatCLP,
  getBreakdownWithCredits,
  getPaymentBreakdown,
  maxCreditsForPrice,
  type PaymentConfig,
} from '@/services/payments';
import { hasAcceptedPaymentRules } from '@/services/onboarding';
import { isSupabaseConfigured } from '@/services/supabase';
import { useAppState } from '@/store/appState';

const CREDIT_STEP = 10; // incremento del selector de créditos

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
    creditBalance,
  } = useAppState();
  const { maybeAskPushPermission } = useNotifications();
  const { isAuthenticated } = useUser();
  const online = isSupabaseConfigured && isAuthenticated;

  // Puede llegar con una reserva existente (desde Mis viajes o el perfil) o
  // crearla aquí al confirmar (flujo de reserva original).
  const [bookingId, setBookingId] = useState<string | null>(bookingIdParam ?? null);
  const booking = bookings.find((b) => b.id === bookingId);

  // Config financiera (comisión, tasa de créditos) + pago parcial con créditos.
  const [config, setConfig] = useState<PaymentConfig>(DEFAULT_PAYMENT_CONFIG);
  const [credits, setCredits] = useState(0);
  const [payingIntent, setPayingIntent] = useState(false);

  useEffect(() => {
    if (!online) return;
    getPlatformConfig()
      .then(setConfig)
      .catch(() => undefined);
  }, [online]);

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

  // Pago verificado (Fintoc) + pago parcial con créditos: disponible online sobre
  // una reserva pendiente/vencida. El servidor recorta los créditos al tope.
  const canPayVerified =
    online && !!booking && (booking.pago.estado === 'pendiente' || booking.pago.estado === 'vencido');
  const maxCredits = maxCreditsForPrice(breakdown.precioCLP, creditBalance, config);
  const creditBreakdown = getBreakdownWithCredits(breakdown.precioCLP, credits, creditBalance, config);
  const efectivoCLP = Math.max(0, breakdown.totalCLP - creditBreakdown.creditosCLP);

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

  const handleConfirm = async () => {
    if (!currentUser) {
      Alert.alert('Debes iniciar sesión para confirmar.');
      return;
    }
    const check = canUserBookOrCancel(currentUser, new Date());
    if (!check.allowed) {
      Alert.alert(check.reason ?? 'No puedes reservar en este momento');
      return;
    }

    // Puerta de la PRIMERA reserva (Sesión 10): nadie toma el cupo de otra
    // persona sin haber leído el plazo de 48 h y quién se lleva el strike.
    // Va acá y no en los botones "Reservar" porque este es el único punto
    // donde la reserva se crea de verdad, y las tres pantallas que llevan a
    // reservar desembocan todas aquí.
    if (!(await hasAcceptedPaymentRules())) {
      router.replace({
        pathname: '/reglas-de-pago',
        params: {
          next: `/payment?price=${price ?? ''}&destination=${encodeURIComponent(
            destination ?? ''
          )}&tripId=${tripId ?? ''}`,
        },
      });
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
      `Tienes ${PAYMENT_DEADLINE_HOURS} horas para transferir ${formatCLP(breakdown.totalCLP)} al conductor. Si no pagas a tiempo recibirás un strike.`,
      [
        {
          text: 'Entendido',
          // Permiso pedido EN CONTEXTO (Sesión 7): recién reservó y el plazo
          // de 48 h le importa; solo se ofrece si aún no lo ha decidido.
          onPress: () =>
            maybeAskPushPermission(
              'Te recordaremos este pago 24 h y 4 h antes de que venza el plazo, para que no recibas un strike.'
            ),
        },
      ]
    );
  };

  const handleVerifiedPay = async () => {
    if (!booking) return;
    setPayingIntent(true);
    try {
      const res = await createPaymentIntent(booking.id, creditBreakdown.creditosAplicados);
      if (res.status === 'confirmed') {
        Alert.alert('Pago verificado', 'Cubriste el total con créditos Unities. ¡Listo, sin transferencia!');
        router.replace('/(tabs)/my-trips');
        return;
      }
      if (res.checkoutUrl) {
        await WebBrowser.openBrowserAsync(res.checkoutUrl);
        router.replace('/(tabs)/my-trips');
        return;
      }
      // Sandbox sin credenciales de Fintoc: la intención queda creada y el webhook
      // (o el test) la verificará; el conductor no tiene que confirmar nada.
      Alert.alert(
        'Intención de pago creada',
        `Transfiere ${formatCLP(res.cashClp)} desde tu banco. Cuando la transferencia se acredite, tu pago se marcará como verificado automáticamente.`
      );
      router.replace('/(tabs)/my-trips');
    } catch (err) {
      Alert.alert('No se pudo iniciar el pago', err instanceof Error ? err.message : 'Intenta de nuevo.');
    } finally {
      setPayingIntent(false);
    }
  };

  const handleDispute = () => {
    if (!booking) return;
    router.push({ pathname: '/dispute', params: { bookingId: booking.id } });
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
      'El conductor deberá confirmar la recepción. Cuando lo haga, sumarás créditos Unities por pagar a tiempo.'
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
          <Text style={styles.breakdownLabel}>Comisión Unities</Text>
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
          <TouchableOpacity style={styles.button} onPress={() => void handleConfirm()}>
            <Text style={styles.buttonText}>Confirmar reserva</Text>
          </TouchableOpacity>
        </>
      ) : booking.pago.estado === 'confirmado' ? (
        <Text style={styles.paidNote}>Este pago ya fue confirmado por el conductor. ¡Gracias!</Text>
      ) : booking.pago.estado === 'marcado' ? (
        <View style={styles.deadlineCard}>
          <Text style={styles.deadlineTitle}>Pago por confirmar</Text>
          <Text style={styles.deadlineText}>
            Marcaste el pago como realizado. Espera la verificación automática o la confirmación del
            conductor.
          </Text>
        </View>
      ) : booking.pago.estado === 'disputado' ? (
        <View style={styles.deadlineCard}>
          <Text style={styles.deadlineTitle}>Pago en revisión</Text>
          <Text style={styles.deadlineText}>
            Recibimos tu comprobante. Congelamos el strike hasta que el equipo de Unities revise tu
            caso.
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
                ? 'El plazo venció y recibiste un strike. Paga o reclama cuanto antes.'
                : `Vence el ${formatDateTimeCL(booking.pago.venceAt)} (${PAYMENT_DEADLINE_HOURS} horas de plazo).`}
            </Text>
          </View>

          {canPayVerified && (
            <View style={styles.verifyCard}>
              <View style={styles.verifyHeader}>
                <Text style={styles.verifyTitle}>Pago verificado automático</Text>
                <View style={styles.verifyBadge}>
                  <Text style={styles.verifyBadgeText}>Recomendado</Text>
                </View>
              </View>
              <Text style={styles.verifyCaption}>
                Transferencia verificada por Fintoc: tu pago se confirma solo, sin que el conductor
                apruebe. Así evitas el strike.
              </Text>

              {maxCredits > 0 && (
                <View style={styles.creditsBox}>
                  <Text style={styles.creditsLabel}>
                    Pagar parte con créditos ({creditBalance} disponibles)
                  </Text>
                  <View style={styles.stepperRow}>
                    <TouchableOpacity
                      style={styles.stepBtn}
                      onPress={() => setCredits((c) => Math.max(0, c - CREDIT_STEP))}
                    >
                      <Text style={styles.stepBtnText}>−</Text>
                    </TouchableOpacity>
                    <View style={styles.stepValue}>
                      <Text style={styles.stepValueNum}>{creditBreakdown.creditosAplicados}</Text>
                      <Text style={styles.stepValueSub}>-{formatCLP(creditBreakdown.creditosCLP)}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.stepBtn}
                      onPress={() => setCredits((c) => Math.min(maxCredits, c + CREDIT_STEP))}
                    >
                      <Text style={styles.stepBtnText}>+</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.maxBtn} onPress={() => setCredits(maxCredits)}>
                      <Text style={styles.maxBtnText}>Máx</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              <View style={styles.payRow}>
                <Text style={styles.payRowLabel}>A pagar por transferencia</Text>
                <Text style={styles.payRowValue}>{formatCLP(efectivoCLP)}</Text>
              </View>

              <TouchableOpacity
                style={[styles.verifyButton, payingIntent && styles.disabledBtn]}
                onPress={handleVerifiedPay}
                disabled={payingIntent}
              >
                {payingIntent ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.verifyButtonText}>Pagar {formatCLP(efectivoCLP)} y verificar</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            style={canPayVerified ? styles.secondaryButton : styles.button}
            onPress={handleMarkPaid}
          >
            <Text style={canPayVerified ? styles.secondaryButtonText : styles.buttonText}>
              Ya transferí (marcar manual)
            </Text>
          </TouchableOpacity>

          {booking.pago.estado === 'vencido' && online && (
            <TouchableOpacity style={styles.disputeButton} onPress={handleDispute}>
              <Text style={styles.disputeButtonText}>Yo sí pagué · reclamar strike</Text>
            </TouchableOpacity>
          )}

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
  verifyCard: {
    marginTop: 12,
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    padding: 16,
    gap: 10,
  },
  verifyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  verifyTitle: { fontWeight: '800', color: '#0f172a', fontSize: 16 },
  verifyBadge: { backgroundColor: '#16a34a', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  verifyBadgeText: { color: '#ffffff', fontWeight: '800', fontSize: 11 },
  verifyCaption: { color: '#475569', fontSize: 13, lineHeight: 18 },
  creditsBox: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    gap: 8,
  },
  creditsLabel: { color: '#0f172a', fontWeight: '700', fontSize: 13 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  stepValue: { flex: 1, alignItems: 'center' },
  stepValueNum: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  stepValueSub: { fontSize: 12, color: '#16a34a', fontWeight: '700' },
  maxBtn: {
    borderWidth: 1,
    borderColor: '#16a34a',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  maxBtnText: { color: '#16a34a', fontWeight: '800' },
  payRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  payRowLabel: { color: '#475569', fontWeight: '600' },
  payRowValue: { color: '#0f172a', fontWeight: '800', fontSize: 18 },
  verifyButton: {
    backgroundColor: '#16a34a',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  verifyButtonText: { color: '#ffffff', fontWeight: '800', fontSize: 16 },
  disabledBtn: { opacity: 0.6 },
  disputeButton: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#f59e0b',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#fffbeb',
  },
  disputeButtonText: { color: '#b45309', fontWeight: '800' },
});
