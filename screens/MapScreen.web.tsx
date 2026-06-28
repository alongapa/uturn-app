import React from 'react';
import { StyleSheet, Text, View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';

import { useAppState } from '@/store/appState';
import { meetingPoints } from '@/constants/meetingPoints';

export default function MapScreenWeb() {
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();
  const { state } = useAppState();
  const trip = state.trips.find((t) => t.id === tripId);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.banner}>
          <Text style={s.bannerTitle}>Mapa no disponible en web</Text>
          <Text style={s.bannerSub}>Abre la app móvil para ver el mapa interactivo.</Text>
        </View>
        {trip && (
          <View style={s.card}>
            <Text style={s.cardTitle}>{trip.meetPoint} → {trip.dest}</Text>
            <Text style={s.meta}>{new Date(trip.departAt).toLocaleString('es-CL')}</Text>
          </View>
        )}
        <View style={s.card}>
          <Text style={s.cardTitle}>Puntos de encuentro</Text>
          {meetingPoints.map((p) => (
            <View key={p.id} style={s.pointRow}>
              <Text style={s.pointName}>{p.nombre}</Text>
              <Text style={s.pointMeta}>{p.coordenadas.latitude.toFixed(4)}, {p.coordenadas.longitude.toFixed(4)}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll: { padding: 20, gap: 12 },
  banner: { backgroundColor: '#EFF6FF', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#BFDBFE', gap: 4 },
  bannerTitle: { fontSize: 16, fontWeight: '700', color: '#0A1525' },
  bannerSub: { fontSize: 14, color: '#334155' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E2E8F0', gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#0A1525' },
  meta: { fontSize: 13, color: '#64748B' },
  pointRow: { borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 8 },
  pointName: { fontSize: 14, fontWeight: '600', color: '#0A1525' },
  pointMeta: { fontSize: 12, color: '#64748B' },
});
