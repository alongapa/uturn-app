import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { useAppState } from '@/store/appState';
import { CAMPUSES } from '@/constants/campuses';

export default function PassengerHomeScreen() {
  const { state } = useAppState();
  const [query, setQuery] = useState('');

  const recentDestinations = ['Providencia', 'Ñuñoa', 'Las Condes', 'La Reina'];

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        <Text style={s.title}>¿A dónde vas?</Text>
        <Text style={s.sub}>Encuentra compañeros que van a tu destino</Text>

        <View style={s.searchBar}>
          <Text style={s.searchIcon}>🔍</Text>
          <TextInput
            style={s.searchInput}
            placeholder="Buscar destino..."
            value={query}
            onChangeText={setQuery}
            placeholderTextColor="#94A3B8"
            onSubmitEditing={() => router.push('/passenger/search-results')}
          />
        </View>

        <Text style={s.sectionTitle}>Destinos frecuentes</Text>
        <View style={s.chips}>
          {recentDestinations.map((d) => (
            <TouchableOpacity key={d} style={s.chip} onPress={() => router.push('/passenger/search-results')}>
              <Text style={s.chipTxt}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.sectionTitle}>Campus disponibles</Text>
        {CAMPUSES.map((c) => (
          <TouchableOpacity key={c.id} style={s.campusCard} onPress={() => router.push('/passenger/search-results')}>
            <View style={s.campusIcon}>
              <Text style={s.campusEmoji}>🎓</Text>
            </View>
            <View style={s.campusInfo}>
              <Text style={s.campusName}>{c.name}</Text>
              <Text style={s.campusMeta}>{c.commune} · {c.universityId.toUpperCase()}</Text>
            </View>
            <Text style={s.chevron}>›</Text>
          </TouchableOpacity>
        ))}

        <Text style={s.sectionTitle}>Viajes disponibles ahora</Text>
        {state.trips.slice(0, 4).map((trip) => (
          <TouchableOpacity
            key={trip.id}
            style={s.tripCard}
            onPress={() => router.push({ pathname: '/trip/[id]', params: { id: trip.id } })}
          >
            <View style={s.tripTop}>
              <View style={s.tripInfo}>
                <Text style={s.tripDriver}>{trip.driverName}</Text>
                <Text style={s.tripRoute}>{trip.meetPoint} → {trip.dest}</Text>
                <Text style={s.tripTime}>
                  🕐 {new Date(trip.departAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} · 💺 {trip.seats}
                </Text>
              </View>
              <Text style={s.tripPrice}>${trip.price.toLocaleString('es-CL')}</Text>
            </View>
          </TouchableOpacity>
        ))}

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll: { padding: 20, gap: 12 },
  title: { fontSize: 28, fontWeight: '800', color: '#0A1525' },
  sub: { fontSize: 14, color: '#64748B', marginBottom: 8 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 14, borderWidth: 1.5, borderColor: '#E2E8F0' },
  searchIcon: { fontSize: 16 },
  searchInput: { flex: 1, height: 50, fontSize: 15, color: '#0A1525' },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#0A1525', marginTop: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  chipTxt: { fontSize: 14, fontWeight: '600', color: '#374151' },
  campusCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  campusIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  campusEmoji: { fontSize: 20 },
  campusInfo: { flex: 1 },
  campusName: { fontSize: 15, fontWeight: '700', color: '#0A1525' },
  campusMeta: { fontSize: 12, color: '#64748B', marginTop: 2 },
  chevron: { fontSize: 24, color: '#CBD5E1' },
  tripCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  tripTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  tripInfo: { flex: 1, gap: 2 },
  tripDriver: { fontSize: 14, fontWeight: '700', color: '#0A1525' },
  tripRoute: { fontSize: 13, color: '#64748B' },
  tripTime: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  tripPrice: { fontSize: 18, fontWeight: '800', color: '#246BFD' },
});
