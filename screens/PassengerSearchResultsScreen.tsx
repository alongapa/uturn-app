import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { useAppState } from '@/store/appState';
import { TIER_COLORS, TIER_LABELS } from '@/models/types';

type SortMode = 'precio' | 'rating' | 'hora';

export default function PassengerSearchResultsScreen() {
  const { state } = useAppState();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortMode>('hora');

  const results = useMemo(() => {
    let list = state.trips.filter((t) => t.status !== 'cancelled' && t.seats > 0);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((t) => t.dest.toLowerCase().includes(q) || t.meetPoint.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      if (sort === 'precio') return a.price - b.price;
      if (sort === 'rating') return (b.driverRating ?? 0) - (a.driverRating ?? 0);
      return new Date(a.departAt).getTime() - new Date(b.departAt).getTime();
    });
  }, [state.trips, query, sort]);

  const sortOptions: Array<{ id: SortMode; label: string }> = [
    { id: 'hora', label: '🕐 Más próximo' },
    { id: 'precio', label: '💰 Menor precio' },
    { id: 'rating', label: '⭐ Mejor rating' },
  ];

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.title}>Viajes disponibles</Text>
        <View style={s.searchBar}>
          <Text style={s.searchIcon}>🔍</Text>
          <TextInput
            style={s.searchInput}
            placeholder="Filtrar por destino..."
            value={query}
            onChangeText={setQuery}
            placeholderTextColor="#94A3B8"
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.sorts}>
          {sortOptions.map((opt) => (
            <TouchableOpacity
              key={opt.id}
              style={[s.sortChip, sort === opt.id && s.sortActive]}
              onPress={() => setSort(opt.id)}
            >
              <Text style={[s.sortTxt, sort === opt.id && s.sortTxtActive]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={results}
        keyExtractor={(t) => t.id}
        contentContainerStyle={s.list}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyIcon}>🔍</Text>
            <Text style={s.emptyTxt}>No hay viajes que coincidan</Text>
          </View>
        }
        renderItem={({ item }) => {
          const tier = item.driverTier ?? 'novato';
          return (
            <TouchableOpacity
              style={s.card}
              onPress={() => router.push({ pathname: '/trip/[id]', params: { id: item.id } })}
              activeOpacity={0.85}
            >
              <View style={s.cardTop}>
                <View style={s.avatar}>
                  <Text style={s.avatarTxt}>{item.driverName[0]}</Text>
                </View>
                <View style={s.info}>
                  <View style={s.nameRow}>
                    <Text style={s.driver}>{item.driverName}</Text>
                    <View style={[s.tierBadge, { backgroundColor: TIER_COLORS[tier] + '22' }]}>
                      <Text style={[s.tierTxt, { color: TIER_COLORS[tier] }]}>{TIER_LABELS[tier]}</Text>
                    </View>
                  </View>
                  <Text style={s.rating}>⭐ {(item.driverRating ?? 4.5).toFixed(1)}</Text>
                </View>
                <Text style={s.price}>${item.price.toLocaleString('es-CL')}</Text>
              </View>

              <View style={s.routeBox}>
                <Text style={s.route}>{item.meetPoint} → {item.dest}</Text>
                {item.routeNotes ? <Text style={s.notes}>{item.routeNotes}</Text> : null}
              </View>

              <View style={s.cardBottom}>
                <Text style={s.meta}>
                  🕐 {new Date(item.departAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                </Text>
                <Text style={s.meta}>💺 {item.seats} disponibles</Text>
                <View style={s.reserveBtn}>
                  <Text style={s.reserveTxt}>Ver detalle</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { padding: 20, gap: 12 },
  title: { fontSize: 24, fontWeight: '800', color: '#0A1525' },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, borderWidth: 1.5, borderColor: '#E2E8F0' },
  searchIcon: { fontSize: 16 },
  searchInput: { flex: 1, height: 46, fontSize: 15, color: '#0A1525' },
  sorts: { flexDirection: 'row' },
  sortChip: { backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  sortActive: { backgroundColor: '#0A1525', borderColor: '#0A1525' },
  sortTxt: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  sortTxtActive: { color: '#fff' },
  list: { paddingHorizontal: 20, paddingBottom: 24, gap: 12 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E2E8F0', gap: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 18, fontWeight: '800', color: '#246BFD' },
  info: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  driver: { fontSize: 15, fontWeight: '700', color: '#0A1525' },
  tierBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  tierTxt: { fontSize: 10, fontWeight: '700' },
  rating: { fontSize: 12, color: '#64748B' },
  price: { fontSize: 18, fontWeight: '800', color: '#246BFD' },
  routeBox: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, gap: 2 },
  route: { fontSize: 14, fontWeight: '600', color: '#0A1525' },
  notes: { fontSize: 12, color: '#94A3B8', fontStyle: 'italic' },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  meta: { fontSize: 12, color: '#64748B' },
  reserveBtn: { marginLeft: 'auto', backgroundColor: '#0A1525', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  reserveTxt: { fontSize: 13, fontWeight: '700', color: '#fff' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyIcon: { fontSize: 48 },
  emptyTxt: { fontSize: 15, color: '#64748B' },
});
