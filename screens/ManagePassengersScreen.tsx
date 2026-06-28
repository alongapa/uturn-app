import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { useUser } from '@/contexts/UserContext';
import { useAppState } from '@/store/appState';
import { PASSENGER_MANIFEST } from '@/constants/mock-data';

const STATUS_META = {
  confirmado: { bg: '#F0FDF4', text: '#15803D', label: 'Confirmado' },
  pendiente: { bg: '#FFFBEB', text: '#D97706', label: 'Pendiente' },
  completado: { bg: '#EFF6FF', text: '#1D4ED8', label: 'Completado' },
};

export default function ManagePassengersScreen() {
  const { user } = useUser();
  const { state } = useAppState();

  const myTrips = state.trips.filter((t) => t.driverId === user?.id);
  const activeTrip = myTrips[0];

  function handleConfirm(name: string) {
    Alert.alert('Pasajero confirmado', `${name} fue confirmado para el viaje.`);
  }

  function handleReject(name: string) {
    Alert.alert('Rechazar pasajero', `¿Rechazar a ${name}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Rechazar', style: 'destructive' },
    ]);
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        <Text style={s.title}>Gestionar pasajeros</Text>
        {activeTrip ? (
          <Text style={s.sub}>{activeTrip.meetPoint} → {activeTrip.dest}</Text>
        ) : (
          <Text style={s.sub}>Pasajeros de tu próximo viaje</Text>
        )}

        <View style={s.summary}>
          <View style={s.summaryItem}>
            <Text style={s.summaryVal}>{PASSENGER_MANIFEST.filter((p) => p.status === 'confirmado').length}</Text>
            <Text style={s.summaryLabel}>Confirmados</Text>
          </View>
          <View style={s.summaryDivider} />
          <View style={s.summaryItem}>
            <Text style={[s.summaryVal, { color: '#D97706' }]}>{PASSENGER_MANIFEST.filter((p) => p.status === 'pendiente').length}</Text>
            <Text style={s.summaryLabel}>Pendientes</Text>
          </View>
          <View style={s.summaryDivider} />
          <View style={s.summaryItem}>
            <Text style={[s.summaryVal, { color: '#246BFD' }]}>{activeTrip?.seats ?? 4}</Text>
            <Text style={s.summaryLabel}>Cupos</Text>
          </View>
        </View>

        {PASSENGER_MANIFEST.map((p) => {
          const meta = STATUS_META[p.status];
          return (
            <View key={p.id} style={s.card}>
              <View style={s.cardTop}>
                <View style={s.avatar}>
                  <Text style={s.avatarTxt}>{p.name[0]}</Text>
                </View>
                <View style={s.info}>
                  <Text style={s.name}>{p.name}</Text>
                  <Text style={s.faculty}>{p.faculty}</Text>
                  <Text style={s.pickup}>📍 {p.pickup} · Asiento {p.seat}</Text>
                </View>
                <View style={[s.statusBadge, { backgroundColor: meta.bg }]}>
                  <Text style={[s.statusTxt, { color: meta.text }]}>{meta.label}</Text>
                </View>
              </View>

              {p.badges && p.badges.length > 0 && (
                <View style={s.badges}>
                  {p.badges.map((b) => (
                    <View key={b} style={s.badge}>
                      <Text style={s.badgeTxt}>{b}</Text>
                    </View>
                  ))}
                </View>
              )}

              {p.status === 'pendiente' && (
                <View style={s.actions}>
                  <TouchableOpacity style={s.rejectBtn} onPress={() => handleReject(p.name)}>
                    <Text style={s.rejectTxt}>Rechazar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.confirmBtn} onPress={() => handleConfirm(p.name)}>
                    <Text style={s.confirmTxt}>Confirmar</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}

        <TouchableOpacity style={s.mapBtn} onPress={() => router.push('/driver/routes-map')}>
          <Text style={s.mapTxt}>🗺️ Ver ruta y puntos de recogida</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll: { padding: 20, gap: 14, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '800', color: '#0A1525' },
  sub: { fontSize: 14, color: '#64748B' },
  summary: { flexDirection: 'row', backgroundColor: '#0A1525', borderRadius: 16, padding: 18, alignItems: 'center' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryVal: { fontSize: 24, fontWeight: '800', color: '#fff' },
  summaryLabel: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  summaryDivider: { width: 1, height: 32, backgroundColor: '#1E293B' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E2E8F0', gap: 12 },
  cardTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 18, fontWeight: '800', color: '#246BFD' },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '700', color: '#0A1525' },
  faculty: { fontSize: 12, color: '#64748B' },
  pickup: { fontSize: 12, color: '#94A3B8' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusTxt: { fontSize: 11, fontWeight: '700' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badge: { backgroundColor: '#F1F5F9', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  badgeTxt: { fontSize: 11, color: '#475569', fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10 },
  rejectBtn: { flex: 1, borderWidth: 1, borderColor: '#DC2626', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  rejectTxt: { fontSize: 13, fontWeight: '700', color: '#DC2626' },
  confirmBtn: { flex: 1, backgroundColor: '#0A1525', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  confirmTxt: { fontSize: 13, fontWeight: '700', color: '#fff' },
  mapBtn: { borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 14, paddingVertical: 14, alignItems: 'center', backgroundColor: '#fff' },
  mapTxt: { fontSize: 14, fontWeight: '700', color: '#0A1525' },
});
