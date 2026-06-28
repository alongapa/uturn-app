import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';
import { useLocalSearchParams } from 'expo-router';

import { useAppState } from '@/store/appState';
import { meetingPoints } from '@/constants/meetingPoints';
import { getCampusById } from '@/constants/campuses';
import { MAP_STYLE } from '@/constants/mapStyle';

const DEFAULT_REGION = {
  latitude: -33.4489,
  longitude: -70.6693,
  latitudeDelta: 0.2,
  longitudeDelta: 0.2,
};

export default function MapScreen() {
  const { tripId, meetingPointId } = useLocalSearchParams<{ tripId?: string; meetingPointId?: string }>();
  const { state } = useAppState();
  const trip = useMemo(() => state.trips.find((t) => t.id === tripId), [state.trips, tripId]);

  const initialRegion = useMemo(() => {
    const point = meetingPoints.find((p) => p.id === meetingPointId || p.id === trip?.meetingPointId);
    if (point) {
      return { ...point.coordenadas, latitudeDelta: 0.04, longitudeDelta: 0.04 };
    }
    if (trip) {
      const campus = getCampusById(trip.originCampusId);
      if (campus) {
        return { latitude: campus.latitude, longitude: campus.longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 };
      }
    }
    return DEFAULT_REGION;
  }, [trip, meetingPointId]);

  const [region, setRegion] = useState(initialRegion);

  return (
    <SafeAreaView style={s.safe}>
      <MapView style={s.map} region={region} onRegionChangeComplete={setRegion} customMapStyle={MAP_STYLE as any}>
        {meetingPoints.map((p) => (
          <Marker
            key={p.id}
            coordinate={p.coordenadas}
            title={p.nombre}
            description={p.tipo === 'campus' ? 'Campus' : 'Punto de encuentro'}
            pinColor={p.tipo === 'campus' ? '#246BFD' : '#22C55E'}
          />
        ))}
      </MapView>
      <View style={s.card}>
        <Text style={s.cardTitle}>
          {trip ? `${trip.meetPoint} → ${trip.dest}` : 'Puntos de encuentro'}
        </Text>
        <Text style={s.cardSub}>Campus y puntos de encuentro activos</Text>
        <TouchableOpacity style={s.btn} onPress={() => setRegion(DEFAULT_REGION)}>
          <Text style={s.btnTxt}>Recentrar</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  map: { flex: 1 },
  card: { position: 'absolute', bottom: 24, left: 20, right: 20, backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E2E8F0', gap: 6 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#0A1525' },
  cardSub: { fontSize: 13, color: '#64748B' },
  btn: { marginTop: 6, backgroundColor: '#0A1525', paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  btnTxt: { color: '#fff', fontWeight: '700' },
});
