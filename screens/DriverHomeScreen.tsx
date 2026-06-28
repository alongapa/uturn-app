import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useUser } from '@/contexts/UserContext';
import { useAppState } from '@/store/appState';
import { COLORS, RADII, SPACING, TYPE } from '@/constants/designSystem';
import { Card } from '@/components/ui/Card';
import { TierBadge } from '@/components/ui/TierBadge';
import { AppButton } from '@/components/ui/AppButton';

export default function DriverHomeScreen() {
  const { user } = useUser();
  const { state } = useAppState();
  if (!user) return null;

  const myTrips = state.trips.filter((t) => t.driverId === user.id);
  const activeTrips = myTrips.filter((t) => t.status !== 'completed' && t.status !== 'cancelled');

  const stats = [
    { value: String(user.completedTripsAsDriver), label: 'Viajes completos', color: COLORS.text },
    { value: `${user.rating.toFixed(1)}`, label: 'Rating promedio', color: COLORS.primary, star: true },
    { value: String(user.uturnCredits), label: 'Créditos UTurn', color: COLORS.warning },
  ];

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        <View style={s.header}>
          <Text style={TYPE.display}>Panel Conductor</Text>
          <TierBadge tier={user.tier} solid />
        </View>

        <View style={s.statsRow}>
          {stats.map((st) => (
            <Card key={st.label} style={s.statCard} padded={false}>
              <View style={s.statValRow}>
                {st.star && <Ionicons name="star" size={16} color={COLORS.warning} />}
                <Text style={[s.statVal, { color: st.color }]}>{st.value}</Text>
              </View>
              <Text style={s.statLabel}>{st.label}</Text>
            </Card>
          ))}
        </View>

        <TouchableOpacity style={s.publishBtn} onPress={() => router.push('/driver/create-trip')} activeOpacity={0.9}>
          <View style={s.publishIcon}><Ionicons name="add" size={26} color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.publishTitle}>Publicar nuevo viaje</Text>
            <Text style={s.publishSub}>Comparte tu ruta con compañeros</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={COLORS.onDarkMuted} />
        </TouchableOpacity>

        <Text style={TYPE.heading}>Viajes activos</Text>
        {activeTrips.length === 0 ? (
          <Card style={{ alignItems: 'center', paddingVertical: SPACING.xxl }}>
            <Text style={s.emptyTxt}>No tienes viajes activos</Text>
          </Card>
        ) : (
          <View style={{ gap: SPACING.md }}>
            {activeTrips.map((trip) => {
              const passengers = state.bookings.filter((b) => b.tripId === trip.id && b.status === 'reserved');
              return (
                <TouchableOpacity key={trip.id} onPress={() => router.push('/driver/manage-passengers')} activeOpacity={0.9}>
                  <Card style={{ gap: SPACING.md }}>
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
                      <View style={s.seatsRow}>
                        <Ionicons name="people-outline" size={15} color={COLORS.textMuted} />
                        <Text style={s.seats}>{passengers.length}/{trip.seats} pasajeros</Text>
                      </View>
                      <View style={s.manageBtn}>
                        <Text style={s.manageTxt}>Gestionar</Text>
                      </View>
                    </View>
                  </Card>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <AppButton label="Ver mapa de rutas" variant="ghost" icon="map-outline" onPress={() => router.push('/driver/routes-map')} />

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: SPACING.xl, gap: SPACING.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: SPACING.sm },
  statCard: { flex: 1, alignItems: 'center', paddingVertical: SPACING.lg, gap: 4 },
  statValRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statVal: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 10, color: COLORS.textMuted, textAlign: 'center' },
  publishBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: COLORS.ink, borderRadius: RADII.lg, padding: SPACING.lg },
  publishIcon: { width: 44, height: 44, borderRadius: RADII.md, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  publishTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  publishSub: { fontSize: 12, color: COLORS.onDarkMuted, marginTop: 2 },
  emptyTxt: { fontSize: 14, color: COLORS.textSubtle },
  tripTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  tripRoute: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  tripTime: { fontSize: 13, color: COLORS.textMuted, marginTop: 2, textTransform: 'capitalize' },
  tripPrice: { fontSize: 18, fontWeight: '800', color: COLORS.primary },
  tripBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  seatsRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  seats: { fontSize: 13, color: COLORS.textMuted },
  manageBtn: { backgroundColor: COLORS.primarySoft, paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADII.sm },
  manageTxt: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
});
