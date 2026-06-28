import React from 'react';
import { StyleSheet, Text, View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useUser } from '@/contexts/UserContext';
import { useAppState } from '@/store/appState';

export default function DriverRoutesMapScreenWeb() {
  const { user } = useUser();
  const { state } = useAppState();
  const myTrips = state.trips.filter((t) => t.driverId === user?.id);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.banner}>
          <Text style={s.bannerTitle}>Mapa no disponible en web</Text>
          <Text style={s.bannerSub}>Abre la app móvil para ver el mapa interactivo de rutas.</Text>
        </View>
        {myTrips.length === 0 ? (
          <Text style={s.empty}>No tienes rutas publicadas todavía.</Text>
        ) : (
          myTrips.map((trip) => (
            <View key={trip.id} style={s.card}>
              <Text style={s.route}>{trip.meetPoint} → {trip.dest}</Text>
              <Text style={s.meta}>{new Date(trip.departAt).toLocaleString('es-CL')}</Text>
            </View>
          ))
        )}
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
  empty: { fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: 20 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E2E8F0', gap: 4 },
  route: { fontSize: 15, fontWeight: '700', color: '#0A1525' },
  meta: { fontSize: 13, color: '#64748B' },
});
