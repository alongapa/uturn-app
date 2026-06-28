import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';

import { useAppState } from '@/store/appState';
import { COLORS, RADII, SPACING, TYPE } from '@/constants/designSystem';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { TierBadge } from '@/components/ui/TierBadge';
import { AppButton } from '@/components/ui/AppButton';
import { TRIP_TIMELINE } from '@/constants/mock-data';

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useAppState();
  const trip = state.trips.find((t) => t.id === id);

  if (!trip) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.notFound}>
          <Text style={s.notFoundTxt}>Viaje no encontrado</Text>
          <AppButton label="Volver" variant="secondary" fullWidth={false} onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  const tier = trip.driverTier ?? 'novato';
  const rows = [
    { icon: 'location-outline' as const, label: 'Punto de encuentro', value: trip.meetPoint },
    { icon: 'flag-outline' as const, label: 'Destino', value: trip.dest },
    {
      icon: 'calendar-outline' as const, label: 'Salida',
      value: new Date(trip.departAt).toLocaleString('es-CL', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
    },
    { icon: 'people-outline' as const, label: 'Asientos', value: `${trip.seats} disponibles` },
  ];

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        <Card dark style={s.driverCard}>
          <Avatar name={trip.driverName} size={56} dark />
          <View style={{ flex: 1 }}>
            <View style={s.nameRow}>
              <Text style={s.driverName}>{trip.driverName}</Text>
              <TierBadge tier={tier} solid size="sm" />
            </View>
            <View style={s.ratingRow}>
              <Ionicons name="star" size={14} color={COLORS.warning} />
              <Text style={s.driverRating}>{(trip.driverRating ?? 4.5).toFixed(1)} de calificación</Text>
            </View>
          </View>
        </Card>

        <Card style={{ gap: SPACING.md }}>
          <Text style={TYPE.heading}>Detalle de la ruta</Text>
          {rows.map((r) => (
            <View key={r.label} style={s.detailRow}>
              <Ionicons name={r.icon} size={18} color={COLORS.textMuted} />
              <Text style={s.detailLabel}>{r.label}</Text>
              <Text style={s.detailValue}>{r.value}</Text>
            </View>
          ))}
          {trip.routeNotes ? (
            <View style={s.notesBox}>
              <Ionicons name="chatbubble-ellipses-outline" size={16} color={COLORS.textMuted} />
              <Text style={s.notesTxt}>{trip.routeNotes}</Text>
            </View>
          ) : null}
        </Card>

        <Card style={{ gap: SPACING.md }}>
          <Text style={TYPE.heading}>Itinerario estimado</Text>
          {TRIP_TIMELINE.map((entry, i) => (
            <View key={entry.id} style={s.timelineRow}>
              <View style={s.timelineLeft}>
                <View style={[s.timelineDot, i === 0 && s.dotFirst, i === TRIP_TIMELINE.length - 1 && s.dotLast]} />
                {i < TRIP_TIMELINE.length - 1 && <View style={s.timelineLine} />}
              </View>
              <View style={{ flex: 1, paddingBottom: SPACING.lg }}>
                <View style={s.timelineHeader}>
                  <Text style={s.timelineTitle}>{entry.title}</Text>
                  <Text style={s.timelineTime}>{entry.time}</Text>
                </View>
                <Text style={s.timelineDetail}>{entry.detail}</Text>
              </View>
            </View>
          ))}
        </Card>

        <AppButton label="Ver punto de encuentro en mapa" variant="ghost" icon="map-outline" onPress={() => router.push({ pathname: '/map', params: { tripId: trip.id } })} />

      </ScrollView>

      <View style={s.footer}>
        <View>
          <Text style={s.footerLabel}>Precio por pasajero</Text>
          <Text style={s.footerPrice}>${trip.price.toLocaleString('es-CL')}</Text>
        </View>
        <AppButton label="Reservar asiento" fullWidth={false} style={{ paddingHorizontal: 28 }} onPress={() => router.push({ pathname: '/payment', params: { tripId: trip.id } })} />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: SPACING.xl, gap: SPACING.lg, paddingBottom: SPACING.xl },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.lg, padding: SPACING.xl },
  notFoundTxt: { fontSize: 16, color: COLORS.textMuted },
  driverCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  driverName: { fontSize: 18, fontWeight: '800', color: '#fff' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  driverRating: { fontSize: 13, color: COLORS.onDarkMuted },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  detailLabel: { fontSize: 13, color: COLORS.textMuted },
  detailValue: { fontSize: 13, fontWeight: '600', color: COLORS.text, flex: 1, textAlign: 'right' },
  notesBox: { flexDirection: 'row', gap: SPACING.sm, backgroundColor: COLORS.surfaceMuted, borderRadius: RADII.md, padding: SPACING.md },
  notesTxt: { fontSize: 13, color: COLORS.textMuted, flex: 1 },
  timelineRow: { flexDirection: 'row', gap: SPACING.md },
  timelineLeft: { alignItems: 'center', width: 16 },
  timelineDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.borderStrong, marginTop: 2 },
  dotFirst: { backgroundColor: COLORS.success },
  dotLast: { backgroundColor: COLORS.primary },
  timelineLine: { flex: 1, width: 2, backgroundColor: COLORS.border, marginVertical: 2 },
  timelineHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  timelineTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  timelineTime: { fontSize: 13, color: COLORS.primary, fontWeight: '600' },
  timelineDetail: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACING.xl, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border },
  footerLabel: { fontSize: 12, color: COLORS.textMuted },
  footerPrice: { fontSize: 24, fontWeight: '800', color: COLORS.text },
});
