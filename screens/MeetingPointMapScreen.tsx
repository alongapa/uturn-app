import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';
import { router, useLocalSearchParams } from 'expo-router';

import { meetingPoints } from '@/constants/meetingPoints';

const DEFAULT_REGION = {
  latitude: -33.4489,
  longitude: -70.6693,
  latitudeDelta: 0.15,
  longitudeDelta: 0.15,
};

export default function MeetingPointMapScreen() {
  const { meetingPointId } = useLocalSearchParams<{ meetingPointId?: string }>();
  const [selectedId, setSelectedId] = useState<string | undefined>(meetingPointId);

  const onlyMeetingPoints = meetingPoints.filter((p) => p.tipo === 'meeting-point');
  const selected = meetingPoints.find((p) => p.id === selectedId);

  const region = selected
    ? { ...selected.coordenadas, latitudeDelta: 0.03, longitudeDelta: 0.03 }
    : DEFAULT_REGION;

  return (
    <SafeAreaView style={s.safe}>
      <MapView style={s.map} region={region}>
        {onlyMeetingPoints.map((p) => (
          <Marker
            key={p.id}
            coordinate={p.coordenadas}
            title={p.nombre}
            pinColor={p.id === selectedId ? '#246BFD' : '#22C55E'}
            onPress={() => setSelectedId(p.id)}
          />
        ))}
      </MapView>
      <View style={s.card}>
        <Text style={s.cardTitle}>
          {selected ? selected.nombre : 'Selecciona un punto de encuentro'}
        </Text>
        {selected && <Text style={s.cardSub}>{selected.universidad}</Text>}
        <TouchableOpacity
          style={[s.btn, !selected && s.btnOff]}
          disabled={!selected}
          onPress={() => router.back()}
        >
          <Text style={s.btnTxt}>Confirmar punto</Text>
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
  btn: { marginTop: 6, backgroundColor: '#0A1525', paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
  btnOff: { opacity: 0.5 },
  btnTxt: { color: '#fff', fontWeight: '700' },
});
