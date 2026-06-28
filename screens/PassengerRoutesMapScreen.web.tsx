import React from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { useAppState } from '@/store/appState';

export default function PassengerRoutesMapScreenWeb() {
  const { state } = useAppState();
  const trips = state.trips.filter((t) => t.status !== 'cancelled' && t.seats > 0);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.banner}>
          <Text style={s.bannerTitle}>Mapa no disponible en web</Text>
          <Text style={s.bannerSub}>Estos son los viajes disponibles ahora.</Text>
        </View>
        {trips.map((trip) => (
          <TouchableOpacity
            key={trip.id}
            style={s.card}
            onPress={() => router.push({ pathname: '/trip/[id]', params: { id: trip.id } })}
          >
            <Text style={s.route}>{trip.meetPoint} → {trip.dest}</Text>
            <Text style={s.meta}>${trip.price.toLocaleString('es-CL')} · {trip.seats} asientos</Text>
          </TouchableOpacity>
        ))}
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
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E2E8F0', gap: 4 },
  route: { fontSize: 15, fontWeight: '700', color: '#0A1525' },
  meta: { fontSize: 13, color: '#64748B' },
});
