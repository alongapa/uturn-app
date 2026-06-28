import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useAppState } from '@/store/appState';
import { COLORS, RADII, SPACING, TYPE } from '@/constants/designSystem';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { TierBadge } from '@/components/ui/TierBadge';

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

  const sortOptions: Array<{ id: SortMode; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
    { id: 'hora', label: 'Más próximo', icon: 'time-outline' },
    { id: 'precio', label: 'Menor precio', icon: 'pricetag-outline' },
    { id: 'rating', label: 'Mejor rating', icon: 'star-outline' },
  ];

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Text style={TYPE.title}>Viajes disponibles</Text>
        <View style={s.searchBar}>
          <Ionicons name="search" size={18} color={COLORS.textSubtle} />
          <TextInput
            style={s.searchInput}
            placeholder="Filtrar por destino..."
            value={query} onChangeText={setQuery} placeholderTextColor={COLORS.textSubtle}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.sorts}>
          {sortOptions.map((opt) => {
            const active = sort === opt.id;
            return (
              <TouchableOpacity key={opt.id} style={[s.sortChip, active && s.sortActive]} onPress={() => setSort(opt.id)}>
                <Ionicons name={opt.icon} size={14} color={active ? '#fff' : COLORS.textMuted} />
                <Text style={[s.sortTxt, active && s.sortTxtActive]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={results}
        keyExtractor={(t) => t.id}
        contentContainerStyle={s.list}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="car-outline" size={44} color={COLORS.textSubtle} />
            <Text style={s.emptyTxt}>No hay viajes que coincidan</Text>
          </View>
        }
        renderItem={({ item }) => {
          const tier = item.driverTier ?? 'novato';
          return (
            <TouchableOpacity onPress={() => router.push({ pathname: '/trip/[id]', params: { id: item.id } })} activeOpacity={0.9}>
              <Card style={{ gap: SPACING.md }}>
                <View style={s.cardTop}>
                  <Avatar name={item.driverName} size={44} />
                  <View style={{ flex: 1 }}>
                    <View style={s.nameRow}>
                      <Text style={s.driver}>{item.driverName}</Text>
                      <TierBadge tier={tier} size="sm" />
                    </View>
                    <View style={s.ratingRow}>
                      <Ionicons name="star" size={12} color={COLORS.warning} />
                      <Text style={s.rating}>{(item.driverRating ?? 4.5).toFixed(1)}</Text>
                    </View>
                  </View>
                  <Text style={s.price}>${item.price.toLocaleString('es-CL')}</Text>
                </View>

                <View style={s.routeBox}>
                  <Text style={s.route}>{item.meetPoint} → {item.dest}</Text>
                  {item.routeNotes ? <Text style={s.notes}>{item.routeNotes}</Text> : null}
                </View>

                <View style={s.cardBottom}>
                  <View style={s.meta}>
                    <Ionicons name="time-outline" size={14} color={COLORS.textMuted} />
                    <Text style={s.metaTxt}>
                      {new Date(item.departAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <View style={s.meta}>
                    <Ionicons name="people-outline" size={14} color={COLORS.textMuted} />
                    <Text style={s.metaTxt}>{item.seats} disponibles</Text>
                  </View>
                  <View style={s.detailBtn}>
                    <Text style={s.detailTxt}>Ver detalle</Text>
                    <Ionicons name="chevron-forward" size={14} color="#fff" />
                  </View>
                </View>
              </Card>
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: { padding: SPACING.xl, gap: SPACING.md },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: RADII.md, paddingHorizontal: 14, borderWidth: 1, borderColor: COLORS.border },
  searchInput: { flex: 1, height: 48, fontSize: 15, color: COLORS.text },
  sorts: { gap: SPACING.sm },
  sortChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.surface, borderRadius: RADII.pill, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: COLORS.border },
  sortActive: { backgroundColor: COLORS.ink, borderColor: COLORS.ink },
  sortTxt: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted },
  sortTxtActive: { color: '#fff' },
  list: { paddingHorizontal: SPACING.xl, paddingBottom: 24, gap: SPACING.md },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  driver: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  rating: { fontSize: 12, color: COLORS.textMuted },
  price: { fontSize: 18, fontWeight: '800', color: COLORS.primary },
  routeBox: { backgroundColor: COLORS.surfaceMuted, borderRadius: RADII.md, padding: SPACING.md, gap: 2 },
  route: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  notes: { fontSize: 12, color: COLORS.textSubtle, fontStyle: 'italic' },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaTxt: { fontSize: 12, color: COLORS.textMuted },
  detailBtn: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.ink, paddingHorizontal: 14, paddingVertical: 9, borderRadius: RADII.sm },
  detailTxt: { fontSize: 13, fontWeight: '700', color: '#fff' },
  empty: { alignItems: 'center', paddingTop: 60, gap: SPACING.md },
  emptyTxt: { fontSize: 15, color: COLORS.textMuted },
});
