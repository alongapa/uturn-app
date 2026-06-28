import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { useAppState } from '@/store/appState';
import { TIER_COLORS, TIER_LABELS } from '@/models/types';
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
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Text style={s.backTxt}>Volver</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const tier = trip.driverTier ?? 'novato';

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Conductor */}
        <View style={s.driverCard}>
          <View style={s.avatar}>
            <Text style={s.avatarTxt}>{trip.driverName[0]}</Text>
          </View>
          <View style={s.driverInfo}>
            <View style={s.nameRow}>
              <Text style={s.driverName}>{trip.driverName}</Text>
              <View style={[s.tierBadge, { backgroundColor: TIER_COLORS[tier] }]}>
                <Text style={s.tierTxt}>⭐ {TIER_LABELS[tier]}</Text>
              </View>
            </View>
            <Text style={s.driverRating}>⭐ {(trip.driverRating ?? 4.5).toFixed(1)} de calificación</Text>
          </View>
        </View>

        {/* Ruta */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Detalle de la ruta</Text>
          <View style={s.routeRow}>
            <Text style={s.routeLabel}>Punto de encuentro</Text>
            <Text style={s.routeVal}>{trip.meetPoint}</Text>
          </View>
          <View style={s.routeRow}>
            <Text style={s.routeLabel}>Destino</Text>
            <Text style={s.routeVal}>{trip.dest}</Text>
          </View>
          <View style={s.routeRow}>
            <Text style={s.routeLabel}>Salida</Text>
            <Text style={s.routeVal}>
              {new Date(trip.departAt).toLocaleString('es-CL', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
          <View style={s.routeRow}>
            <Text style={s.routeLabel}>Asientos</Text>
            <Text style={s.routeVal}>{trip.seats} disponibles</Text>
          </View>
          {trip.routeNotes ? (
            <View style={s.notesBox}>
              <Text style={s.notesTxt}>💬 {trip.routeNotes}</Text>
            </View>
          ) : null}
        </View>

        {/* Timeline */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Itinerario estimado</Text>
          {TRIP_TIMELINE.map((entry, i) => (
            <View key={entry.id} style={s.timelineRow}>
              <View style={s.timelineLeft}>
                <View style={[s.timelineDot, i === 0 && s.timelineDotFirst, i === TRIP_TIMELINE.length - 1 && s.timelineDotLast]} />
                {i < TRIP_TIMELINE.length - 1 && <View style={s.timelineLine} />}
              </View>
              <View style={s.timelineBody}>
                <View style={s.timelineHeader}>
                  <Text style={s.timelineTitle}>{entry.title}</Text>
                  <Text style={s.timelineTime}>{entry.time}</Text>
                </View>
                <Text style={s.timelineDetail}>{entry.detail}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Mapa */}
        <TouchableOpacity style={s.mapBtn} onPress={() => router.push({ pathname: '/map', params: { tripId: trip.id } })}>
          <Text style={s.mapTxt}>🗺️ Ver punto de encuentro en mapa</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* Footer reservar */}
      <View style={s.footer}>
        <View>
          <Text style={s.footerLabel}>Precio por pasajero</Text>
          <Text style={s.footerPrice}>${trip.price.toLocaleString('es-CL')}</Text>
        </View>
        <TouchableOpacity
          style={s.reserveBtn}
          onPress={() => router.push({ pathname: '/payment', params: { tripId: trip.id } })}
          activeOpacity={0.85}
        >
          <Text style={s.reserveTxt}>Reservar asiento</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll: { padding: 20, gap: 14, paddingBottom: 20 },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  notFoundTxt: { fontSize: 16, color: '#64748B' },
  backBtn: { backgroundColor: '#0A1525', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  backTxt: { color: '#fff', fontWeight: '700' },
  driverCard: { backgroundColor: '#0A1525', borderRadius: 16, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#246BFD', alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 22, fontWeight: '800', color: '#fff' },
  driverInfo: { flex: 1, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  driverName: { fontSize: 18, fontWeight: '800', color: '#fff' },
  tierBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tierTxt: { fontSize: 10, fontWeight: '700', color: '#fff' },
  driverRating: { fontSize: 13, color: '#94A3B8' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E2E8F0', gap: 12 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#0A1525' },
  routeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  routeLabel: { fontSize: 13, color: '#64748B' },
  routeVal: { fontSize: 13, fontWeight: '600', color: '#0A1525', flex: 1, textAlign: 'right' },
  notesBox: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10 },
  notesTxt: { fontSize: 13, color: '#475569' },
  timelineRow: { flexDirection: 'row', gap: 12 },
  timelineLeft: { alignItems: 'center', width: 16 },
  timelineDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#CBD5E1', marginTop: 2 },
  timelineDotFirst: { backgroundColor: '#22C55E' },
  timelineDotLast: { backgroundColor: '#246BFD' },
  timelineLine: { flex: 1, width: 2, backgroundColor: '#E2E8F0', marginVertical: 2 },
  timelineBody: { flex: 1, paddingBottom: 16 },
  timelineHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  timelineTitle: { fontSize: 14, fontWeight: '700', color: '#0A1525' },
  timelineTime: { fontSize: 13, color: '#246BFD', fontWeight: '600' },
  timelineDetail: { fontSize: 12, color: '#64748B', marginTop: 2 },
  mapBtn: { borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 14, paddingVertical: 14, alignItems: 'center', backgroundColor: '#fff' },
  mapTxt: { fontSize: 14, fontWeight: '700', color: '#0A1525' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  footerLabel: { fontSize: 12, color: '#64748B' },
  footerPrice: { fontSize: 24, fontWeight: '800', color: '#0A1525' },
  reserveBtn: { backgroundColor: '#0A1525', paddingHorizontal: 28, paddingVertical: 16, borderRadius: 14 },
  reserveTxt: { fontSize: 16, fontWeight: '800', color: '#fff' },
});
