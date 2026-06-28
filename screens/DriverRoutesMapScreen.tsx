import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';

import { useUser } from '@/contexts/UserContext';
import { useAppState } from '@/store/appState';
import { getCampusById } from '@/constants/campuses';

const DEFAULT_REGION = {
  latitude: -33.4489,
  longitude: -70.6693,
  latitudeDelta: 0.2,
  longitudeDelta: 0.2,
};

export default function DriverRoutesMapScreen() {
  const { user } = useUser();
  const { state } = useAppState();

  const myTrips = useMemo(
    () => state.trips.filter((t) => t.driverId === user?.id),
    [state.trips, user?.id]
  );

  const region = useMemo(() => {
    const firstCampus = myTrips[0] && getCampusById(myTrips[0].originCampusId);
    if (firstCampus) {
      return {
        latitude: firstCampus.latitude,
        longitude: firstCampus.longitude,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      };
    }
    return DEFAULT_REGION;
  }, [myTrips]);

  return (
    <SafeAreaView style={s.safe}>
      <MapView style={s.map} initialRegion={region}>
        {myTrips.map((trip) => {
          const campus = getCampusById(trip.originCampusId);
          if (!campus) return null;
          const mp = campus.meetingPoints.find((m) => m.id === trip.meetingPointId) ?? campus.meetingPoints[0];
          return (
            <Marker
              key={trip.id}
              coordinate={{ latitude: mp.latitude, longitude: mp.longitude }}
              title={`${mp.name} → ${trip.dest}`}
              description={new Date(trip.departAt).toLocaleString('es-CL')}
              pinColor="#246BFD"
            />
          );
        })}
      </MapView>
      <View style={s.banner}>
        <Text style={s.bannerTitle}>{myTrips.length} ruta(s) publicada(s)</Text>
        <Text style={s.bannerSub}>Toca un marcador para ver el detalle</Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  map: { flex: 1 },
  banner: {
    position: 'absolute', bottom: 24, left: 20, right: 20,
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#E2E8F0', gap: 4,
  },
  bannerTitle: { fontSize: 16, fontWeight: '800', color: '#0A1525' },
  bannerSub: { fontSize: 13, color: '#64748B' },
});
