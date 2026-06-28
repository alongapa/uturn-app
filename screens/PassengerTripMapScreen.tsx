import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { router, useLocalSearchParams } from 'expo-router';

import { useAppState } from '@/store/appState';
import { getCampusById } from '@/constants/campuses';

const DEFAULT_REGION = {
  latitude: -33.4489,
  longitude: -70.6693,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};

export default function PassengerTripMapScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { state } = useAppState();
  const trip = state.trips.find((t) => t.id === id);

  const points = useMemo(() => {
    if (!trip) return null;
    const campus = getCampusById(trip.originCampusId);
    const mp = campus?.meetingPoints.find((m) => m.id === trip.meetingPointId) ?? campus?.meetingPoints[0];
    const dest = trip.destinationCampusId ? getCampusById(trip.destinationCampusId) : null;
    return {
      origin: mp ? { latitude: mp.latitude, longitude: mp.longitude } : null,
      destination: dest ? { latitude: dest.latitude, longitude: dest.longitude } : null,
    };
  }, [trip]);

  const region = points?.origin
    ? { ...points.origin, latitudeDelta: 0.06, longitudeDelta: 0.06 }
    : DEFAULT_REGION;

  const [showRoute] = useState(true);

  if (!trip) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.empty}>
          <Text style={s.emptyTxt}>Viaje no encontrado</Text>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Text style={s.backTxt}>Volver</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <MapView style={s.map} initialRegion={region}>
        {points?.origin && (
          <Marker coordinate={points.origin} title={trip.meetPoint} description="Punto de encuentro" pinColor="#22C55E" />
        )}
        {points?.destination && (
          <Marker coordinate={points.destination} title={trip.dest} description="Destino" pinColor="#F97316" />
        )}
        {showRoute && points?.origin && points?.destination && (
          <Polyline coordinates={[points.origin, points.destination]} strokeColor="#246BFD" strokeWidth={3} />
        )}
      </MapView>
      <View style={s.card}>
        <Text style={s.route}>{trip.meetPoint} → {trip.dest}</Text>
        <Text style={s.meta}>
          Salida: {new Date(trip.departAt).toLocaleString('es-CL', { hour: '2-digit', minute: '2-digit' })}
        </Text>
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
  safe: { flex: 1 },
  map: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  emptyTxt: { fontSize: 16, color: '#64748B' },
  backBtn: { backgroundColor: '#0A1525', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  backTxt: { color: '#fff', fontWeight: '700' },
  card: { position: 'absolute', bottom: 24, left: 20, right: 20, backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E2E8F0', gap: 8 },
  route: { fontSize: 16, fontWeight: '800', color: '#0A1525' },
  meta: { fontSize: 13, color: '#64748B' },
  reserveBtn: { marginTop: 4, backgroundColor: '#0A1525', paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
  reserveTxt: { color: '#fff', fontWeight: '700' },
});
