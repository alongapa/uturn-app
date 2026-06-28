import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { useUser } from '@/contexts/UserContext';
import { useAppState } from '@/store/appState';
import { TIER_COLORS, TIER_LABELS } from '@/models/types';
import { RECOMMENDED_TRIPS, DRIVER_SPOTLIGHT } from '@/constants/mock-data';

const TUTORING_PROMOS = [
  { id: 't1', subject: 'Cálculo I', tutor: 'Martín R.', rating: 4.9, price: 8000, available: 'Hoy 19:00' },
  { id: 't2', subject: 'Derecho Civil', tutor: 'Sofía V.', rating: 5.0, price: 10000, available: 'Mañana 10:00' },
  { id: 't3', subject: 'Macroeconomía', tutor: 'Felipe A.', rating: 4.8, price: 7500, available: 'Hoy 21:00' },
];

export default function HomeScreen() {
  const { user } = useUser();
  const { state } = useAppState();

  const tierColor = user ? TIER_COLORS[user.tier] : '#94A3B8';
  const tierLabel = user ? TIER_LABELS[user.tier] : '';
  const firstName = user?.name.split(' ')[0] ?? 'Estudiante';

  const upcomingBooking = state.bookings.find((b) => b.status === 'reserved');
  const upcomingTrip = upcomingBooking
    ? state.trips.find((t) => t.id === upcomingBooking.tripId)
    : null;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.greeting}>Hola, {firstName} 👋</Text>
            <View style={s.tierRow}>
              <View style={[s.tierBadge, { backgroundColor: tierColor + '22', borderColor: tierColor }]}>
                <Text style={[s.tierTxt, { color: tierColor }]}>⭐ {tierLabel}</Text>
              </View>
              <Text style={s.credits}>💰 {user?.uturnCredits ?? 0} créditos</Text>
            </View>
          </View>
          <Image source={require('@/assets/images/logomini.png')} style={s.miniLogo} resizeMode="contain" />
        </View>

        {/* Próximo viaje */}
        {upcomingTrip ? (
          <View style={s.upcomingCard}>
            <Text style={s.upcomingLabel}>Próximo viaje</Text>
            <Text style={s.upcomingRoute}>{upcomingTrip.meetPoint} → {upcomingTrip.dest}</Text>
            <Text style={s.upcomingTime}>
              {new Date(upcomingTrip.departAt).toLocaleString('es-CL', { hour: '2-digit', minute: '2-digit', weekday: 'long' })}
            </Text>
            <TouchableOpacity
              style={s.upcomingBtn}
              onPress={() => router.push({ pathname: '/map', params: { tripId: upcomingTrip.id } })}
            >
              <Text style={s.upcomingBtnTxt}>Ver en mapa</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Acciones rápidas */}
        <View style={s.actions}>
          <TouchableOpacity style={s.actionBtn} onPress={() => router.push('/driver/create-trip')}>
            <Image source={require('@/assets/icons/uturn-auto.png')} style={s.actionIcon} resizeMode="contain" />
            <Text style={s.actionTxt}>Publicar viaje</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.actionBtn, s.actionBtnSecondary]} onPress={() => router.push('/passenger/search-results')}>
            <Image source={require('@/assets/icons/uturn-passengers.png')} style={s.actionIcon} resizeMode="contain" />
            <Text style={s.actionTxt}>Buscar viaje</Text>
          </TouchableOpacity>
        </View>

        {/* Promo Asesorías */}
        <View style={s.promoSection}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>📚 Asesorías disponibles</Text>
            <TouchableOpacity>
              <Text style={s.seeAll}>Ver todas</Text>
            </TouchableOpacity>
          </View>
          <Text style={s.sectionSub}>Tutores que pasaron el ramo con 6 o más</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.hScroll}>
            {TUTORING_PROMOS.map((t) => (
              <TouchableOpacity key={t.id} style={s.tutoringCard} activeOpacity={0.85}>
                <View style={s.tutoringTop}>
                  <Text style={s.tutoringSubject}>{t.subject}</Text>
                  <View style={s.ratingBadge}>
                    <Text style={s.ratingTxt}>⭐ {t.rating}</Text>
                  </View>
                </View>
                <Text style={s.tutoringTutor}>con {t.tutor}</Text>
                <Text style={s.tutoringTime}>{t.available}</Text>
                <View style={s.tutoringFooter}>
                  <Text style={s.tutoringPrice}>${t.price.toLocaleString('es-CL')}</Text>
                  <View style={s.bookBtn}>
                    <Text style={s.bookBtnTxt}>Reservar</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Viajes recomendados */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>🚗 Viajes recomendados</Text>
          <TouchableOpacity onPress={() => router.push('/passenger/search-results')}>
            <Text style={s.seeAll}>Ver más</Text>
          </TouchableOpacity>
        </View>

        {RECOMMENDED_TRIPS.slice(0, 3).map((trip) => (
          <TouchableOpacity
            key={trip.id}
            style={s.tripCard}
            onPress={() => router.push({ pathname: '/trip/[id]', params: { id: trip.id } })}
            activeOpacity={0.85}
          >
            <View style={s.tripTop}>
              <View>
                <Text style={s.tripDriver}>{trip.driverName}</Text>
                <Text style={s.tripRoute}>{trip.meetPoint} → {trip.dest}</Text>
              </View>
              <Text style={s.tripPrice}>${trip.price.toLocaleString('es-CL')}</Text>
            </View>
            <View style={s.tripBottom}>
              <Text style={s.tripMeta}>
                🕐 {new Date(trip.departAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
              </Text>
              <Text style={s.tripMeta}>💺 {trip.seats} asientos</Text>
              {trip.routeNotes ? <Text style={s.tripNotes}>{trip.routeNotes}</Text> : null}
            </View>
          </TouchableOpacity>
        ))}

        {/* Conductores destacados */}
        <Text style={[s.sectionTitle, { marginTop: 24 }]}>🏆 Conductores destacados</Text>
        {DRIVER_SPOTLIGHT.map((d) => (
          <View key={d.id} style={s.driverCard}>
            <View style={s.driverAvatar}>
              <Text style={s.driverInitial}>{d.name[0]}</Text>
            </View>
            <View style={s.driverInfo}>
              <Text style={s.driverName}>{d.name}</Text>
              <Text style={s.driverMeta}>⭐ {d.rating} · {d.completedTrips} viajes</Text>
              <Text style={s.driverCar}>{d.car}</Text>
            </View>
          </View>
        ))}

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll: { padding: 20, gap: 0 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  greeting: { fontSize: 24, fontWeight: '800', color: '#0A1525' },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  tierBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  tierTxt: { fontSize: 12, fontWeight: '700' },
  credits: { fontSize: 12, color: '#64748B' },
  miniLogo: { width: 40, height: 40 },

  upcomingCard: {
    backgroundColor: '#0A1525', borderRadius: 16, padding: 18, marginBottom: 20,
  },
  upcomingLabel: { fontSize: 11, color: '#7BA7CC', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  upcomingRoute: { fontSize: 18, fontWeight: '800', color: '#fff', marginTop: 4 },
  upcomingTime: { fontSize: 13, color: '#94A3B8', marginTop: 4 },
  upcomingBtn: { marginTop: 12, backgroundColor: '#246BFD', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  upcomingBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },

  actions: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  actionBtn: { flex: 1, backgroundColor: '#0A1525', borderRadius: 14, padding: 16, alignItems: 'center', gap: 8 },
  actionBtnSecondary: { backgroundColor: '#EFF6FF', borderWidth: 1.5, borderColor: '#246BFD' },
  actionIcon: { width: 32, height: 32 },
  actionTxt: { fontSize: 13, fontWeight: '700', color: '#fff' },

  promoSection: { marginBottom: 28 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#0A1525', marginBottom: 2 },
  sectionSub: { fontSize: 12, color: '#64748B', marginBottom: 12 },
  seeAll: { fontSize: 13, color: '#246BFD', fontWeight: '600' },
  hScroll: { marginHorizontal: -20, paddingHorizontal: 20 },
  tutoringCard: {
    width: 200, backgroundColor: '#fff', borderRadius: 16, padding: 14,
    marginRight: 12, borderWidth: 1, borderColor: '#E2E8F0',
  },
  tutoringTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tutoringSubject: { fontSize: 14, fontWeight: '800', color: '#0A1525', flex: 1 },
  ratingBadge: { backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  ratingTxt: { fontSize: 11, fontWeight: '700', color: '#D97706' },
  tutoringTutor: { fontSize: 12, color: '#64748B', marginTop: 4 },
  tutoringTime: { fontSize: 12, color: '#246BFD', fontWeight: '600', marginTop: 4 },
  tutoringFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  tutoringPrice: { fontSize: 16, fontWeight: '800', color: '#0A1525' },
  bookBtn: { backgroundColor: '#0A1525', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  bookBtnTxt: { fontSize: 11, fontWeight: '700', color: '#fff' },

  tripCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0',
  },
  tripTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  tripDriver: { fontSize: 14, fontWeight: '700', color: '#0A1525' },
  tripRoute: { fontSize: 13, color: '#64748B', marginTop: 2 },
  tripPrice: { fontSize: 18, fontWeight: '800', color: '#246BFD' },
  tripBottom: { flexDirection: 'row', gap: 12, marginTop: 10, flexWrap: 'wrap' },
  tripMeta: { fontSize: 12, color: '#64748B' },
  tripNotes: { fontSize: 12, color: '#94A3B8', fontStyle: 'italic' },

  driverCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0',
  },
  driverAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center',
  },
  driverInitial: { fontSize: 20, fontWeight: '800', color: '#246BFD' },
  driverInfo: { flex: 1 },
  driverName: { fontSize: 15, fontWeight: '700', color: '#0A1525' },
  driverMeta: { fontSize: 12, color: '#64748B', marginTop: 2 },
  driverCar: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
});
