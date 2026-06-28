import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { useAppState } from '@/store/appState';

export default function PassengerTripMapScreenWeb() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { state } = useAppState();
  const trip = state.trips.find((t) => t.id === id);

  if (!trip) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.empty}>
          <Text style={s.emptyTxt}>Viaje no encontrado</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.banner}>
        <Text style={s.bannerTitle}>Mapa no disponible en web</Text>
        <Text style={s.bannerSub}>Abre la app móvil para ver la ruta interactiva.</Text>
      </View>
      <View style={s.card}>
        <Text style={s.route}>{trip.meetPoint} → {trip.dest}</Text>
        <Text style={s.meta}>Salida: {new Date(trip.departAt).toLocaleString('es-CL')}</Text>
        <TouchableOpacity
          style={s.reserveBtn}
          onPress={() => router.push({ pathname: '/payment', params: { tripId: trip.id } })}
        >
          <Text style={s.reserveTxt}>Reservar — ${trip.price.toLocaleString('es-CL')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC', padding: 20, gap: 12 },
  banner: { backgroundColor: '#EFF6FF', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#BFDBFE', gap: 4 },
  bannerTitle: { fontSize: 16, fontWeight: '700', color: '#0A1525' },
  bannerSub: { fontSize: 14, color: '#334155' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E2E8F0', gap: 8 },
  route: { fontSize: 16, fontWeight: '800', color: '#0A1525' },
  meta: { fontSize: 13, color: '#64748B' },
  reserveBtn: { marginTop: 4, backgroundColor: '#0A1525', paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
  reserveTxt: { color: '#fff', fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTxt: { fontSize: 16, color: '#64748B' },
});
