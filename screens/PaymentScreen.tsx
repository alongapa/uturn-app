import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { useUser } from '@/contexts/UserContext';
import { useAppState } from '@/store/appState';
import type { Booking } from '@/models/types';

type PayMethod = 'credits' | 'webpay' | 'cash';

export default function PaymentScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const { user, updateUser } = useUser();
  const { state, dispatch } = useAppState();
  const [method, setMethod] = useState<PayMethod>('webpay');
  const [processing, setProcessing] = useState(false);

  const trip = state.trips.find((t) => t.id === tripId);
  if (!trip || !user) return null;

  const canUseCredits = user.uturnCredits >= trip.price;

  const methods: Array<{ id: PayMethod; label: string; sub: string; icon: string; disabled?: boolean }> = [
    { id: 'webpay', label: 'WebPay', sub: 'Tarjeta de débito o crédito', icon: '💳' },
    { id: 'credits', label: 'Créditos UTurn', sub: `Tienes ${user.uturnCredits} créditos`, icon: '💰', disabled: !canUseCredits },
    { id: 'cash', label: 'Efectivo', sub: 'Pagas al conductor en el viaje', icon: '💵' },
  ];

  function handlePay() {
    setProcessing(true);
    setTimeout(() => {
      const booking: Booking = {
        id: 'booking_' + Date.now(),
        tripId: trip!.id,
        passengerId: user!.id,
        passengerName: user!.name,
        status: 'reserved',
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: 'ADD_BOOKING', payload: booking });

      if (method === 'credits') {
        updateUser({ uturnCredits: user!.uturnCredits - trip!.price });
      }

      setProcessing(false);
      Alert.alert(
        '¡Reserva confirmada! 🎉',
        `Tu asiento con ${trip!.driverName} está confirmado.`,
        [{ text: 'Ver mis viajes', onPress: () => router.replace('/(tabs)/my-trips') }]
      );
    }, 1200);
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        <Text style={s.title}>Confirmar y pagar</Text>

        {/* Resumen */}
        <View style={s.summary}>
          <Text style={s.summaryTitle}>{trip.meetPoint} → {trip.dest}</Text>
          <Text style={s.summaryDriver}>con {trip.driverName}</Text>
          <Text style={s.summaryTime}>
            {new Date(trip.departAt).toLocaleString('es-CL', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </Text>
          <View style={s.summaryDivider} />
          <View style={s.priceRow}>
            <Text style={s.priceLabel}>Total a pagar</Text>
            <Text style={s.priceVal}>${trip.price.toLocaleString('es-CL')}</Text>
          </View>
        </View>

        {/* Métodos de pago */}
        <Text style={s.sectionTitle}>Método de pago</Text>
        {methods.map((m) => (
          <TouchableOpacity
            key={m.id}
            style={[s.method, method === m.id && s.methodActive, m.disabled && s.methodDisabled]}
            onPress={() => !m.disabled && setMethod(m.id)}
            disabled={m.disabled}
          >
            <Text style={s.methodIcon}>{m.icon}</Text>
            <View style={s.methodInfo}>
              <Text style={[s.methodLabel, m.disabled && s.textMuted]}>{m.label}</Text>
              <Text style={[s.methodSub, m.disabled && s.textMuted]}>
                {m.disabled ? 'Créditos insuficientes' : m.sub}
              </Text>
            </View>
            <View style={[s.radio, method === m.id && s.radioActive]}>
              {method === m.id && <View style={s.radioDot} />}
            </View>
          </TouchableOpacity>
        ))}

        <Text style={s.disclaimer}>
          Al confirmar aceptas las políticas de cancelación de UTurn. Cancelar con menos de 1 hora afecta tu reputación.
        </Text>

      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity style={[s.payBtn, processing && s.payBtnOff]} onPress={handlePay} disabled={processing}>
          {processing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={s.payTxt}>Pagar ${trip.price.toLocaleString('es-CL')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll: { padding: 20, gap: 14 },
  title: { fontSize: 26, fontWeight: '800', color: '#0A1525' },
  summary: { backgroundColor: '#0A1525', borderRadius: 16, padding: 18 },
  summaryTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  summaryDriver: { fontSize: 14, color: '#94A3B8', marginTop: 4 },
  summaryTime: { fontSize: 13, color: '#7BA7CC', marginTop: 2 },
  summaryDivider: { height: 1, backgroundColor: '#1E293B', marginVertical: 14 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priceLabel: { fontSize: 14, color: '#94A3B8' },
  priceVal: { fontSize: 24, fontWeight: '800', color: '#fff' },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#0A1525', marginTop: 8 },
  method: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1.5, borderColor: '#E2E8F0' },
  methodActive: { borderColor: '#246BFD', backgroundColor: '#EFF6FF' },
  methodDisabled: { opacity: 0.6 },
  methodIcon: { fontSize: 26 },
  methodInfo: { flex: 1 },
  methodLabel: { fontSize: 15, fontWeight: '700', color: '#0A1525' },
  methodSub: { fontSize: 12, color: '#64748B', marginTop: 2 },
  textMuted: { color: '#94A3B8' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: '#246BFD' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#246BFD' },
  disclaimer: { fontSize: 12, color: '#94A3B8', marginTop: 8, lineHeight: 18 },
  footer: { padding: 20, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  payBtn: { backgroundColor: '#0A1525', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  payBtnOff: { opacity: 0.7 },
  payTxt: { fontSize: 16, fontWeight: '800', color: '#fff' },
});
