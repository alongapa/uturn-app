import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useUser } from '@/contexts/UserContext';
import { useAppState } from '@/store/appState';
import { COLORS, RADII, SPACING, TYPE, SHADOW } from '@/constants/designSystem';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { TierBadge } from '@/components/ui/TierBadge';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { RECOMMENDED_TRIPS, DRIVER_SPOTLIGHT } from '@/constants/mock-data';
import { TUTORS } from '@/constants/tutors';

const TUTORING_PROMOS = TUTORS.slice(0, 4).map((t) => ({
  id: t.id,
  subject: t.subjects[0]?.name ?? '',
  tutor: t.name,
  rating: t.rating,
  price: t.pricePerHour,
  available: t.availability[0] ? `${t.availability[0].day} ${t.availability[0].slots[0]}` : 'Consultar',
}));

export default function HomeScreen() {
  const { user } = useUser();
  const { state } = useAppState();

  const firstName = user?.name.split(' ')[0] ?? 'Estudiante';
  const upcomingBooking = state.bookings.find((b) => b.status === 'reserved');
  const upcomingTrip = upcomingBooking
    ? state.trips.find((t) => t.id === upcomingBooking.tripId)
    : null;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.kicker}>Bienvenido</Text>
            <Text style={s.greeting}>{firstName}</Text>
            <View style={s.headerMeta}>
              {user && <TierBadge tier={user.tier} size="sm" />}
              <View style={s.credits}>
                <Ionicons name="wallet-outline" size={13} color={COLORS.textMuted} />
                <Text style={s.creditsTxt}>{user?.uturnCredits ?? 0} créditos</Text>
              </View>
            </View>
          </View>
          <Avatar name={user?.name ?? 'U'} size={48} />
        </View>

        {/* Próximo viaje */}
        {upcomingTrip && (
          <Card dark style={s.upcoming}>
            <View style={s.upcomingRow}>
              <Ionicons name="navigate-circle" size={20} color={COLORS.primary} />
              <Text style={s.upcomingLabel}>Próximo viaje</Text>
            </View>
            <Text style={s.upcomingRoute}>{upcomingTrip.meetPoint} → {upcomingTrip.dest}</Text>
            <Text style={s.upcomingTime}>
              {new Date(upcomingTrip.departAt).toLocaleString('es-CL', { weekday: 'long', hour: '2-digit', minute: '2-digit' })}
            </Text>
            <TouchableOpacity
              style={s.upcomingBtn}
              onPress={() => router.push({ pathname: '/map', params: { tripId: upcomingTrip.id } })}
            >
              <Text style={s.upcomingBtnTxt}>Ver ruta</Text>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </TouchableOpacity>
          </Card>
        )}

        {/* Acciones rápidas */}
        <View style={s.actions}>
          <TouchableOpacity style={s.actionPrimary} onPress={() => router.push('/driver/create-trip')} activeOpacity={0.9}>
            <View style={s.actionIcon}><Ionicons name="car-sport" size={22} color="#fff" /></View>
            <Text style={s.actionPrimaryTxt}>Publicar viaje</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.actionSecondary} onPress={() => router.push('/passenger/search-results')} activeOpacity={0.9}>
            <View style={[s.actionIcon, { backgroundColor: COLORS.primarySoft }]}>
              <Ionicons name="search" size={22} color={COLORS.primary} />
            </View>
            <Text style={s.actionSecondaryTxt}>Buscar viaje</Text>
          </TouchableOpacity>
        </View>

        {/* Asesorías */}
        <View style={s.section}>
          <SectionHeader title="Asesorías disponibles" subtitle="Tutores que aprobaron el ramo con nota 6 o más" actionLabel="Ver todas" onAction={() => router.push('/asesorias' as never)} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.hScroll} contentContainerStyle={s.hScrollContent}>
            {TUTORING_PROMOS.map((t) => (
              <TouchableOpacity key={t.id} style={s.tutorCard} activeOpacity={0.9} onPress={() => router.push({ pathname: '/asesorias/[id]', params: { id: t.id } } as never)}>
                <View style={s.tutorTop}>
                  <Text style={s.tutorSubject}>{t.subject}</Text>
                  <View style={s.tutorRating}>
                    <Ionicons name="star" size={11} color={COLORS.warning} />
                    <Text style={s.tutorRatingTxt}>{t.rating}</Text>
                  </View>
                </View>
                <Text style={s.tutorName}>con {t.tutor}</Text>
                <View style={s.tutorTimeRow}>
                  <Ionicons name="time-outline" size={13} color={COLORS.primary} />
                  <Text style={s.tutorTime}>{t.available}</Text>
                </View>
                <View style={s.tutorFooter}>
                  <Text style={s.tutorPrice}>${t.price.toLocaleString('es-CL')}</Text>
                  <View style={s.tutorBtn}><Text style={s.tutorBtnTxt}>Reservar</Text></View>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Viajes recomendados */}
        <View style={s.section}>
          <SectionHeader title="Viajes recomendados" actionLabel="Ver más" onAction={() => router.push('/passenger/search-results')} />
          <View style={{ gap: SPACING.md, marginTop: SPACING.md }}>
            {RECOMMENDED_TRIPS.slice(0, 3).map((trip) => (
              <TouchableOpacity
                key={trip.id}
                onPress={() => router.push({ pathname: '/trip/[id]', params: { id: trip.id } })}
                activeOpacity={0.9}
              >
                <Card>
                  <View style={s.tripTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.tripDriver}>{trip.driverName}</Text>
                      <Text style={s.tripRoute}>{trip.meetPoint} → {trip.dest}</Text>
                    </View>
                    <Text style={s.tripPrice}>${trip.price.toLocaleString('es-CL')}</Text>
                  </View>
                  <View style={s.tripMetaRow}>
                    <View style={s.tripMeta}>
                      <Ionicons name="time-outline" size={14} color={COLORS.textMuted} />
                      <Text style={s.tripMetaTxt}>
                        {new Date(trip.departAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                    <View style={s.tripMeta}>
                      <Ionicons name="people-outline" size={14} color={COLORS.textMuted} />
                      <Text style={s.tripMetaTxt}>{trip.seats} asientos</Text>
                    </View>
                  </View>
                </Card>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Conductores destacados */}
        <View style={s.section}>
          <SectionHeader title="Conductores destacados" />
          <View style={{ gap: SPACING.sm, marginTop: SPACING.md }}>
            {DRIVER_SPOTLIGHT.map((d) => (
              <Card key={d.id} style={s.driverCard}>
                <Avatar name={d.name} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={s.driverName}>{d.name}</Text>
                  <View style={s.driverMetaRow}>
                    <Ionicons name="star" size={13} color={COLORS.warning} />
                    <Text style={s.driverMeta}>{d.rating} · {d.completedTrips} viajes</Text>
                  </View>
                  <Text style={s.driverCar}>{d.car}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.textSubtle} />
              </Card>
            ))}
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: SPACING.xl, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.xl },
  kicker: { ...TYPE.caption, color: COLORS.textSubtle },
  greeting: { ...TYPE.display, marginTop: 2 },
  headerMeta: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.sm },
  credits: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  creditsTxt: { ...TYPE.caption, color: COLORS.textMuted },

  upcoming: { marginBottom: SPACING.xl },
  upcomingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  upcomingLabel: { fontSize: 12, color: COLORS.onDarkMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  upcomingRoute: { fontSize: 18, fontWeight: '800', color: '#fff', marginTop: 8 },
  upcomingTime: { fontSize: 13, color: COLORS.onDarkMuted, marginTop: 4, textTransform: 'capitalize' },
  upcomingBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: SPACING.lg, backgroundColor: COLORS.primary, borderRadius: RADII.md, paddingVertical: 13 },
  upcomingBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },

  actions: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.xxl },
  actionPrimary: { flex: 1, backgroundColor: COLORS.ink, borderRadius: RADII.lg, padding: SPACING.lg, gap: SPACING.md, ...SHADOW.card },
  actionSecondary: { flex: 1, backgroundColor: COLORS.surface, borderRadius: RADII.lg, padding: SPACING.lg, gap: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  actionIcon: { width: 44, height: 44, borderRadius: RADII.md, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  actionPrimaryTxt: { fontSize: 15, fontWeight: '700', color: '#fff' },
  actionSecondaryTxt: { fontSize: 15, fontWeight: '700', color: COLORS.text },

  section: { marginBottom: SPACING.xxl },
  hScroll: { marginHorizontal: -SPACING.xl, marginTop: SPACING.md },
  hScrollContent: { paddingHorizontal: SPACING.xl, gap: SPACING.md },
  tutorCard: { width: 210, backgroundColor: COLORS.surface, borderRadius: RADII.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, ...SHADOW.card },
  tutorTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tutorSubject: { fontSize: 15, fontWeight: '800', color: COLORS.text, flex: 1 },
  tutorRating: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: COLORS.warningSoft, paddingHorizontal: 7, paddingVertical: 3, borderRadius: RADII.sm },
  tutorRatingTxt: { fontSize: 11, fontWeight: '700', color: COLORS.warning },
  tutorName: { fontSize: 13, color: COLORS.textMuted, marginTop: 6 },
  tutorTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  tutorTime: { fontSize: 12, color: COLORS.primary, fontWeight: '600' },
  tutorFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: SPACING.md },
  tutorPrice: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  tutorBtn: { backgroundColor: COLORS.ink, paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADII.sm },
  tutorBtnTxt: { fontSize: 12, fontWeight: '700', color: '#fff' },

  tripTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  tripDriver: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  tripRoute: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  tripPrice: { fontSize: 18, fontWeight: '800', color: COLORS.primary },
  tripMetaRow: { flexDirection: 'row', gap: SPACING.lg, marginTop: SPACING.md },
  tripMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tripMetaTxt: { fontSize: 13, color: COLORS.textMuted },

  driverCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  driverName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  driverMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  driverMeta: { fontSize: 13, color: COLORS.textMuted },
  driverCar: { fontSize: 12, color: COLORS.textSubtle, marginTop: 2 },
});
