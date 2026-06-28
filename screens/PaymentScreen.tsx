import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';

import { useUser } from '@/contexts/UserContext';
import { useAppState } from '@/store/appState';
import { COLORS, RADII, SPACING, TYPE } from '@/constants/designSystem';
import { Card } from '@/components/ui/Card';
import { AppButton } from '@/components/ui/AppButton';
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

  const methods: Array<{ id: PayMethod; label: string; sub: string; icon: keyof typeof Ionicons.glyphMap; disabled?: boolean }> = [
    { id: 'webpay', label: 'WebPay', sub: 'Tarjeta de débito o crédito', icon: 'card-outline' },
    { id: 'credits', label: 'Créditos UTurn', sub: `Tienes ${user.uturnCredits} créditos`, icon: 'wallet-outline', disabled: !canUseCredits },
    { id: 'cash', label: 'Efectivo', sub: 'Pagas al conductor en el viaje', icon: 'cash-outline' },
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
      if (method === 'credits') updateUser({ uturnCredits: user!.uturnCredits - trip!.price });
      setProcessing(false);
      Alert.alert('¡Reserva confirmada!', `Tu asiento con ${trip!.driverName} está confirmado.`, [
        { text: 'Ver mis viajes', onPress: () => router.replace('/(tabs)/my-trips') },
      ]);
    }, 1200);
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        <Text style={TYPE.title}>Confirmar y pagar</Text>

        <Card dark>
          <Text style={s.summaryTitle}>{trip.meetPoint} → {trip.dest}</Text>
          <Text style={s.summaryDriver}>con {trip.driverName}</Text>
          <Text style={s.summaryTime}>
            {new Date(trip.departAt).toLocaleString('es-CL', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </Text>
          <View style={s.divider} />
          <View style={s.priceRow}>
            <Text style={s.priceLabel}>Total a pagar</Text>
            <Text style={s.priceVal}>${trip.price.toLocaleString('es-CL')}</Text>
          </View>
        </Card>

        <Text style={[TYPE.heading, { marginTop: SPACING.sm }]}>Método de pago</Text>
        <View style={{ gap: SPACING.md }}>
          {methods.map((m) => {
            const active = method === m.id;
            return (
              <TouchableOpacity
                key={m.id}
                style={[s.method, active && s.methodActive, m.disabled && s.methodDisabled]}
                onPress={() => !m.disabled && setMethod(m.id)}
                disabled={m.disabled}
                activeOpacity={0.9}
              >
                <View style={[s.methodIcon, active && s.methodIconActive]}>
                  <Ionicons name={m.icon} size={20} color={active ? COLORS.primary : COLORS.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.methodLabel, m.disabled && s.muted]}>{m.label}</Text>
                  <Text style={[s.methodSub, m.disabled && s.muted]}>{m.disabled ? 'Créditos insuficientes' : m.sub}</Text>
                </View>
                <View style={[s.radio, active && s.radioActive]}>{active && <View style={s.radioDot} />}</View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={s.disclaimerRow}>
          <Ionicons name="information-circle-outline" size={16} color={COLORS.textSubtle} />
          <Text style={s.disclaimer}>
            Cancelar con menos de 1 hora de anticipación afecta tu reputación.
          </Text>
        </View>

      </ScrollView>

      <View style={s.footer}>
        <AppButton label={`Pagar $${trip.price.toLocaleString('es-CL')}`} loading={processing} onPress={handlePay} />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: SPACING.xl, gap: SPACING.lg },
  summaryTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  summaryDriver: { fontSize: 14, color: COLORS.onDarkMuted, marginTop: 4 },
  summaryTime: { fontSize: 13, color: '#7BA7CC', marginTop: 2, textTransform: 'capitalize' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: SPACING.lg },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priceLabel: { fontSize: 14, color: COLORS.onDarkMuted },
  priceVal: { fontSize: 24, fontWeight: '800', color: '#fff' },
  method: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADII.md, padding: SPACING.lg, borderWidth: 1.5, borderColor: COLORS.border },
  methodActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primarySoft },
  methodDisabled: { opacity: 0.6 },
  methodIcon: { width: 40, height: 40, borderRadius: RADII.sm, backgroundColor: COLORS.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  methodIconActive: { backgroundColor: '#fff' },
  methodLabel: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  methodSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  muted: { color: COLORS.textSubtle },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: COLORS.borderStrong, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: COLORS.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.primary },
  disclaimerRow: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'flex-start', marginTop: SPACING.xs },
  disclaimer: { fontSize: 12, color: COLORS.textSubtle, flex: 1, lineHeight: 18 },
  footer: { padding: SPACING.xl, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border },
});
