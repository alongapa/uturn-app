import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useTrips } from '@/data/useTrips';
import { CAMPUSES } from '@/constants/campuses';
import { COLORS, RADII, SPACING, TYPE } from '@/constants/designSystem';
import { Card } from '@/components/ui/Card';

export default function PassengerHomeScreen() {
  const { trips } = useTrips();
  const [query, setQuery] = useState('');
  const recentDestinations = ['Providencia', 'Ñuñoa', 'Las Condes', 'La Reina'];

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        <View>
          <Text style={TYPE.display}>¿A dónde vas?</Text>
          <Text style={s.sub}>Encuentra compañeros que van a tu destino</Text>
        </View>

        <View style={s.searchBar}>
          <Ionicons name="search" size={18} color={COLORS.textSubtle} />
          <TextInput
            style={s.searchInput}
            placeholder="Buscar destino..."
            value={query} onChangeText={setQuery} placeholderTextColor={COLORS.textSubtle}
            onSubmitEditing={() => router.push('/passenger/search-results')}
          />
        </View>

        <View style={s.section}>
          <Text style={TYPE.heading}>Destinos frecuentes</Text>
          <View style={s.chips}>
            {recentDestinations.map((d) => (
              <TouchableOpacity key={d} style={s.chip} onPress={() => router.push('/passenger/search-results')}>
                <Ionicons name="location-outline" size={14} color={COLORS.textMuted} />
                <Text style={s.chipTxt}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={s.section}>
          <Text style={TYPE.heading}>Campus disponibles</Text>
          <View style={{ gap: SPACING.sm }}>
            {CAMPUSES.map((c) => (
              <TouchableOpacity key={c.id} onPress={() => router.push('/passenger/search-results')} activeOpacity={0.9}>
                <Card style={s.campusCard}>
                  <View style={s.campusIcon}><Ionicons name="school" size={20} color={COLORS.primary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.campusName}>{c.name}</Text>
                    <Text style={s.campusMeta}>{c.commune} · {c.universityId.toUpperCase()}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.textSubtle} />
                </Card>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={s.section}>
          <Text style={TYPE.heading}>Viajes disponibles ahora</Text>
          <View style={{ gap: SPACING.md }}>
            {trips.slice(0, 4).map((trip) => (
              <TouchableOpacity key={trip.id} onPress={() => router.push({ pathname: '/trip/[id]', params: { id: trip.id } })} activeOpacity={0.9}>
                <Card>
                  <View style={s.tripTop}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={s.tripDriver}>{trip.driverName}</Text>
                      <Text style={s.tripRoute}>{trip.meetPoint} → {trip.dest}</Text>
                      <View style={s.tripMetaRow}>
                        <Ionicons name="time-outline" size={13} color={COLORS.textMuted} />
                        <Text style={s.tripMeta}>
                          {new Date(trip.departAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} · {trip.seats} asientos
                        </Text>
                      </View>
                    </View>
                    <Text style={s.tripPrice}>${trip.price.toLocaleString('es-CL')}</Text>
                  </View>
                </Card>
              </TouchableOpacity>
            ))}
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: SPACING.xl, gap: SPACING.lg },
  sub: { ...TYPE.body, marginTop: 4 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: RADII.md, paddingHorizontal: 14, borderWidth: 1, borderColor: COLORS.border },
  searchInput: { flex: 1, height: 50, fontSize: 15, color: COLORS.text },
  section: { gap: SPACING.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.surface, borderRadius: RADII.pill, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: COLORS.border },
  chipTxt: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  campusCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  campusIcon: { width: 44, height: 44, borderRadius: RADII.md, backgroundColor: COLORS.primarySoft, alignItems: 'center', justifyContent: 'center' },
  campusName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  campusMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  tripTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  tripDriver: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  tripRoute: { fontSize: 13, color: COLORS.textMuted },
  tripMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  tripMeta: { fontSize: 12, color: COLORS.textMuted },
  tripPrice: { fontSize: 18, fontWeight: '800', color: COLORS.primary },
});
