import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { useUser } from '@/contexts/UserContext';
import { useAppState } from '@/store/appState';
import { CAMPUSES, getCampusById, type CampusId } from '@/constants/campuses';
import type { Trip } from '@/models/types';

export default function CreateTripScreen() {
  const { user } = useUser();
  const { dispatch } = useAppState();

  const [originCampusId, setOriginCampusId] = useState<CampusId>('uai-penalolen');
  const [meetingPointId, setMeetingPointId] = useState('');
  const [dest, setDest] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [seats, setSeats] = useState('3');
  const [price, setPrice] = useState('2500');
  const [notes, setNotes] = useState('');

  const originCampus = getCampusById(originCampusId);
  const meetingPoints = originCampus?.meetingPoints ?? [];

  function handlePublish() {
    if (!user) { Alert.alert('Inicia sesión'); return; }
    if (!dest.trim()) { Alert.alert('Ingresa el destino'); return; }
    if (!date || !time) { Alert.alert('Ingresa la fecha y hora de salida'); return; }
    if (!meetingPointId) { Alert.alert('Selecciona un punto de encuentro'); return; }

    const departAt = new Date(`${date}T${time}:00`).toISOString();
    const selectedPoint = meetingPoints.find((mp) => mp.id === meetingPointId);

    const trip: Trip = {
      id: 'trip_' + Date.now(),
      driverId: user.id,
      driverName: user.name,
      driverRating: user.rating,
      driverTier: user.tier,
      dest: dest.trim(),
      meetPoint: selectedPoint?.name ?? '',
      price: Number(price) || 2500,
      seats: Number(seats) || 3,
      departAt,
      routeNotes: notes.trim() || undefined,
      originCampusId,
      meetingPointId,
      status: 'active',
    };

    dispatch({ type: 'ADD_TRIP', payload: trip });
    Alert.alert('¡Viaje publicado!', 'Los pasajeros ya pueden encontrarte.', [
      { text: 'OK', onPress: () => router.replace('/(tabs)') },
    ]);
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        <Text style={s.title}>Publicar viaje</Text>
        <Text style={s.sub}>Define origen, destino y cupos disponibles</Text>

        {/* Campus origen */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Campus de origen</Text>
          {CAMPUSES.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={[s.optionRow, originCampusId === c.id && s.optionActive]}
              onPress={() => { setOriginCampusId(c.id); setMeetingPointId(''); }}
            >
              <View style={[s.optionDot, originCampusId === c.id && s.optionDotActive]} />
              <View>
                <Text style={[s.optionLabel, originCampusId === c.id && s.optionLabelActive]}>{c.name}</Text>
                <Text style={s.optionSub}>{c.universityId.toUpperCase()}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Punto de encuentro */}
        {meetingPoints.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Punto de encuentro</Text>
            {meetingPoints.map((mp) => (
              <TouchableOpacity
                key={mp.id}
                style={[s.optionRow, meetingPointId === mp.id && s.optionActive]}
                onPress={() => setMeetingPointId(mp.id)}
              >
                <View style={[s.optionDot, meetingPointId === mp.id && s.optionDotActive]} />
                <Text style={[s.optionLabel, meetingPointId === mp.id && s.optionLabelActive]}>{mp.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Destino */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Destino y horario</Text>

          <Text style={s.label}>Destino</Text>
          <TextInput style={s.input} placeholder="Ej: Providencia, Ñuñoa..." value={dest} onChangeText={setDest} placeholderTextColor="#94A3B8" />

          <View style={s.row}>
            <View style={s.half}>
              <Text style={s.label}>Fecha (AAAA-MM-DD)</Text>
              <TextInput style={s.input} placeholder="2025-04-15" value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" placeholderTextColor="#94A3B8" />
            </View>
            <View style={s.half}>
              <Text style={s.label}>Hora (HH:MM)</Text>
              <TextInput style={s.input} placeholder="07:30" value={time} onChangeText={setTime} keyboardType="numbers-and-punctuation" placeholderTextColor="#94A3B8" />
            </View>
          </View>
        </View>

        {/* Cupos y precio */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Cupos y precio</Text>
          <View style={s.row}>
            <View style={s.half}>
              <Text style={s.label}>Asientos disponibles</Text>
              <TextInput style={s.input} value={seats} onChangeText={setSeats} keyboardType="number-pad" placeholderTextColor="#94A3B8" />
            </View>
            <View style={s.half}>
              <Text style={s.label}>Precio por pasajero (CLP)</Text>
              <TextInput style={s.input} value={price} onChangeText={setPrice} keyboardType="number-pad" placeholderTextColor="#94A3B8" />
            </View>
          </View>

          <Text style={s.label}>Notas de ruta (opcional)</Text>
          <TextInput
            style={[s.input, s.textArea]}
            placeholder="Ej: Hago parada en Metro Tobalaba..."
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholderTextColor="#94A3B8"
          />
        </View>

        <TouchableOpacity style={s.publishBtn} onPress={handlePublish} activeOpacity={0.85}>
          <Text style={s.publishTxt}>Publicar viaje</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll: { padding: 20, gap: 16, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '800', color: '#0A1525' },
  sub: { fontSize: 14, color: '#64748B' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E2E8F0', gap: 12 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#0A1525' },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: 'transparent' },
  optionActive: { borderColor: '#246BFD', backgroundColor: '#EFF6FF' },
  optionDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#CBD5E1' },
  optionDotActive: { borderColor: '#246BFD', backgroundColor: '#246BFD' },
  optionLabel: { fontSize: 14, fontWeight: '600', color: '#374151' },
  optionLabelActive: { color: '#1D4ED8' },
  optionSub: { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151' },
  input: { borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#0A1525', backgroundColor: '#F8FAFC' },
  textArea: { minHeight: 72, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1, gap: 4 },
  publishBtn: { backgroundColor: '#0A1525', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  publishTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
