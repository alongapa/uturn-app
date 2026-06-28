import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { useUser } from '@/contexts/UserContext';
import { useAppState } from '@/store/appState';
import { TIER_COLORS, TIER_LABELS } from '@/models/types';

export default function DriverHomeScreen() {
  const { user } = useUser();
  const { state } = useAppState();

  if (!user) return null;

  const myTrips = state.trips.filter((t) => t.driverId === user.id);
  const activeTrips = myTrips.filter((t) => t.status !== 'completed' && t.status !== 'cancelled');
  const tierColor = TIER_COLORS[user.tier];
  const tierLabel = TIER_LABELS[user.tier];

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        <View style={s.header}>
          <Text style={s.title}>Panel Conductor</Text>
          <View style={[s.tier, { backgroundColor: tierColor }]}>
            <Text style={s.tierTxt}>⭐ {tierLabel}</Text>
          </View>
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statVal}>{user.completedTripsAsDriver}</Text>
            <Text style={s.statLabel}>Viajes\ncompletos</Text>
          </View>
          <View style={s.statCard}>
            <Text style={[s.statVal, { color: '#246BFD' }]}>{user.rating.toFixed(1)} ★</Text>
            <Text style={s.statLabel}>Rating\npromedio</Text>
          </View>
          <View style={s.statCard}>
            <Text style={[s.statVal, { color: '#F59E0B' }]}>{user.uturnCredits}</Text>
            <Text style={s.statLabel}>Créditos\nUTurn</Text>
          </View>
        </View>

        {/* CTA publicar */}
        <TouchableOpacity style={s.publishBtn} onPress={() => router.push('/driver/create-trip')} activeOpacity={0.85}>
          <Text style={s.publishIcon}>🚗</Text>
          <View>
            <Text style={s.publishTitle}>Publicar nuevo viaje</Text>
            <Text style={s.publishSub}>Comparte tu ruta con compañeros de universidad</Text>
          </View>
        </TouchableOpacity>

        {/* Viajes activos */}
        <Text style={s.sectionTitle}>Viajes activos</Text>
        {activeTrips.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyTxt}>No tienes viajes activos</Text>
          </View>
        ) : (
          activeTrips.map((trip) => {
            const passengers = state.bookings.filter((b) => b.tripId === trip.id && b.status === 'reserved');
            return (
              <TouchableOpacity
                key={trip.id}
                style={s.tripCard}
                onPress={() => router.push('/driver/manage-passengers')}
                activeOpacity={0.85}
              >
                <View style={s.tripTop}>
                  <View>
                    <Text style={s.tripRoute}>{trip.meetPoint} → {trip.dest}</Text>
                    <Text style={s.tripTime}>
                      {new Date(trip.departAt).toLocaleString('es-CL', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <Text style={s.tripPrice}>${trip.price.toLocaleString('es-CL')}</Text>
                </View>
                <View style={s.tripBottom}>
                  <Text style={s.seats}>
                    {passengers.length}/{trip.seats} pasajeros
                  </Text>
                  <TouchableOpacity
                    style={s.manageBtn}
                    onPress={() => router.push('/driver/manage-passengers')}
                  >
                    <Text style={s.manageTxt}>Gestionar</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          })
        )}

        {/* Ver mapa */}
        <TouchableOpacity style={s.mapBtn} onPress={() => router.push('/driver/routes-map')}>
          <Text style={s.mapBtnTxt}>🗺️ Ver mapa de rutas</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll: { padding: 20, gap: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 26, fontWeight: '800', color: '#0A1525' },
  tier: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  tierTxt: { fontSize: 12, fontWeight: '800', color: '#fff' },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0', gap: 4 },
  statVal: { fontSize: 24, fontWeight: '800', color: '#0A1525' },
  statLabel: { fontSize: 10, color: '#64748B', textAlign: 'center' },
  publishBtn: { backgroundColor: '#0A1525', borderRadius: 16, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 },
  publishIcon: { fontSize: 32 },
  publishTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  publishSub: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#0A1525' },
  empty: { backgroundColor: '#fff', borderRadius: 14, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  emptyTxt: { fontSize: 14, color: '#94A3B8' },
  tripCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E2E8F0', gap: 12 },
  tripTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  tripRoute: { fontSize: 15, fontWeight: '700', color: '#0A1525' },
  tripTime: { fontSize: 13, color: '#64748B', marginTop: 2 },
  tripPrice: { fontSize: 18, fontWeight: '800', color: '#246BFD' },
  tripBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  seats: { fontSize: 13, color: '#64748B' },
  manageBtn: { backgroundColor: '#EFF6FF', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  manageTxt: { fontSize: 13, fontWeight: '700', color: '#246BFD' },
  mapBtn: { borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 14, paddingVertical: 14, alignItems: 'center', backgroundColor: '#fff' },
  mapBtnTxt: { fontSize: 14, fontWeight: '700', color: '#0A1525' },
});
