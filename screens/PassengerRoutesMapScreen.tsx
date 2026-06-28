import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';
import { router } from 'expo-router';

import { useAppState } from '@/store/appState';
import { getCampusById } from '@/constants/campuses';
import { MAP_STYLE } from '@/constants/mapStyle';

const DEFAULT_REGION = {
  latitude: -33.4489,
  longitude: -70.6693,
  latitudeDelta: 0.2,
  longitudeDelta: 0.2,
};

export default function PassengerRoutesMapScreen() {
  const { state } = useAppState();

  const markers = useMemo(() => {
    return state.trips
      .filter((t) => t.status !== 'cancelled' && t.seats > 0)
      .map((trip) => {
        const campus = getCampusById(trip.originCampusId);
        const mp = campus?.meetingPoints.find((m) => m.id === trip.meetingPointId) ?? campus?.meetingPoints[0];
        if (!mp) return null;
        return { trip, coordinate: { latitude: mp.latitude, longitude: mp.longitude }, name: mp.name };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [state.trips]);

  return (
    <SafeAreaView style={s.safe}>
      <MapView style={s.map} initialRegion={DEFAULT_REGION} customMapStyle={MAP_STYLE as any}>
        {markers.map(({ trip, coordinate, name }) => (
          <Marker
            key={trip.id}
            coordinate={coordinate}
            title={`${name} → ${trip.dest}`}
            description={`$${trip.price.toLocaleString('es-CL')} · ${trip.seats} asientos`}
            pinColor="#22C55E"
            onCalloutPress={() => router.push({ pathname: '/trip/[id]', params: { id: trip.id } })}
          />
        ))}
      </MapView>
      <View style={s.banner}>
        <Text style={s.bannerTitle}>{markers.length} viaje(s) disponible(s)</Text>
        <Text style={s.bannerSub}>Toca un marcador para ver el detalle y reservar</Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  map: { flex: 1 },
  banner: { position: 'absolute', bottom: 24, left: 20, right: 20, backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E2E8F0', gap: 4 },
  bannerTitle: { fontSize: 16, fontWeight: '800', color: '#0A1525' },
  bannerSub: { fontSize: 13, color: '#64748B' },
});
