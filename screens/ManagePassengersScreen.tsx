import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useUser } from '@/contexts/UserContext';
import { useAppState } from '@/store/appState';
import { COLORS, RADII, SPACING, TYPE } from '@/constants/designSystem';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { AppButton } from '@/components/ui/AppButton';
import { PASSENGER_MANIFEST } from '@/constants/mock-data';

const STATUS_META = {
  confirmado: { bg: COLORS.successSoft, text: COLORS.success, label: 'Confirmado' },
  pendiente: { bg: COLORS.warningSoft, text: COLORS.warning, label: 'Pendiente' },
  completado: { bg: COLORS.primarySoft, text: COLORS.primaryDark, label: 'Completado' },
};

export default function ManagePassengersScreen() {
  const { user } = useUser();
  const { state } = useAppState();
  const activeTrip = state.trips.filter((t) => t.driverId === user?.id)[0];

  function handleConfirm(name: string) {
    Alert.alert('Pasajero confirmado', `${name} fue confirmado para el viaje.`);
  }
  function handleReject(name: string) {
    Alert.alert('Rechazar pasajero', `¿Rechazar a ${name}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Rechazar', style: 'destructive' },
    ]);
  }

  const summary = [
    { value: PASSENGER_MANIFEST.filter((p) => p.status === 'confirmado').length, label: 'Confirmados', color: '#fff' },
    { value: PASSENGER_MANIFEST.filter((p) => p.status === 'pendiente').length, label: 'Pendientes', color: COLORS.warning },
    { value: activeTrip?.seats ?? 4, label: 'Cupos', color: COLORS.primary },
  ];

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        <View>
          <Text style={TYPE.title}>Gestionar pasajeros</Text>
          <Text style={s.sub}>{activeTrip ? `${activeTrip.meetPoint} → ${activeTrip.dest}` : 'Pasajeros de tu próximo viaje'}</Text>
        </View>

        <Card dark style={s.summary}>
          {summary.map((item, i) => (
            <React.Fragment key={item.label}>
              {i > 0 && <View style={s.summaryDivider} />}
              <View style={s.summaryItem}>
                <Text style={[s.summaryVal, { color: item.color }]}>{item.value}</Text>
                <Text style={s.summaryLabel}>{item.label}</Text>
              </View>
            </React.Fragment>
          ))}
        </Card>

        <View style={{ gap: SPACING.md }}>
          {PASSENGER_MANIFEST.map((p) => {
            const meta = STATUS_META[p.status];
            return (
              <Card key={p.id} style={{ gap: SPACING.md }}>
                <View style={s.cardTop}>
                  <Avatar name={p.name} size={44} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={s.name}>{p.name}</Text>
                    <Text style={s.faculty}>{p.faculty}</Text>
                    <View style={s.pickupRow}>
                      <Ionicons name="location-outline" size={13} color={COLORS.textSubtle} />
                      <Text style={s.pickup}>{p.pickup} · Asiento {p.seat}</Text>
                    </View>
                  </View>
                  <View style={[s.statusBadge, { backgroundColor: meta.bg }]}>
                    <Text style={[s.statusTxt, { color: meta.text }]}>{meta.label}</Text>
                  </View>
                </View>

                {p.badges && p.badges.length > 0 && (
                  <View style={s.badges}>
                    {p.badges.map((b) => (
                      <View key={b} style={s.badge}><Text style={s.badgeTxt}>{b}</Text></View>
                    ))}
                  </View>
                )}

                {p.status === 'pendiente' && (
                  <View style={s.actions}>
                    <AppButton label="Rechazar" variant="danger" fullWidth={false} style={{ flex: 1 }} onPress={() => handleReject(p.name)} />
                    <AppButton label="Confirmar" variant="secondary" fullWidth={false} style={{ flex: 1 }} onPress={() => handleConfirm(p.name)} />
                  </View>
                )}
              </Card>
            );
          })}
        </View>

        <AppButton label="Ver ruta y puntos de recogida" variant="ghost" icon="map-outline" onPress={() => router.push('/driver/routes-map')} />

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: SPACING.xl, gap: SPACING.lg, paddingBottom: 40 },
  sub: { ...TYPE.body, marginTop: 4 },
  summary: { flexDirection: 'row', alignItems: 'center' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryVal: { fontSize: 24, fontWeight: '800' },
  summaryLabel: { fontSize: 11, color: COLORS.onDarkMuted, marginTop: 2 },
  summaryDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.1)' },
  cardTop: { flexDirection: 'row', gap: SPACING.md, alignItems: 'flex-start' },
  name: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  faculty: { fontSize: 12, color: COLORS.textMuted },
  pickupRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pickup: { fontSize: 12, color: COLORS.textSubtle },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADII.sm },
  statusTxt: { fontSize: 11, fontWeight: '700' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badge: { backgroundColor: COLORS.surfaceMuted, borderRadius: RADII.sm, paddingHorizontal: 8, paddingVertical: 4 },
  badgeTxt: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: SPACING.sm },
});
