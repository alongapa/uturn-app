import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { COLORS, RADII, SPACING, TYPE } from '@/constants/designSystem';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { TierBadge } from '@/components/ui/TierBadge';
import { TUTORS, getAllSubjects } from '@/constants/tutors';

export default function TutoringScreen() {
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState<string | null>(null);

  const subjects = useMemo(() => getAllSubjects(), []);

  const results = useMemo(() => {
    return TUTORS.filter((t) => {
      const matchesSubject = subject ? t.subjects.some((s) => s.name === subject) : true;
      const q = query.trim().toLowerCase();
      const matchesQuery = q
        ? t.name.toLowerCase().includes(q) || t.subjects.some((s) => s.name.toLowerCase().includes(q))
        : true;
      return matchesSubject && matchesQuery;
    });
  }, [query, subject]);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <View>
          <Text style={TYPE.display}>Asesorías</Text>
          <Text style={s.sub}>Tutores que aprobaron el ramo con nota 6 o más</Text>
        </View>
        <View style={s.searchBar}>
          <Ionicons name="search" size={18} color={COLORS.textSubtle} />
          <TextInput
            style={s.searchInput}
            placeholder="Buscar ramo o tutor..."
            value={query}
            onChangeText={setQuery}
            placeholderTextColor={COLORS.textSubtle}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          <TouchableOpacity style={[s.chip, !subject && s.chipActive]} onPress={() => setSubject(null)}>
            <Text style={[s.chipTxt, !subject && s.chipTxtActive]}>Todos</Text>
          </TouchableOpacity>
          {subjects.map((sub) => {
            const active = subject === sub;
            return (
              <TouchableOpacity key={sub} style={[s.chip, active && s.chipActive]} onPress={() => setSubject(active ? null : sub)}>
                <Text style={[s.chipTxt, active && s.chipTxtActive]}>{sub}</Text>
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
            <Ionicons name="school-outline" size={44} color={COLORS.textSubtle} />
            <Text style={s.emptyTxt}>No hay tutores para ese ramo todavía</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => router.push({ pathname: '/asesorias/[id]', params: { id: item.id } } as never)} activeOpacity={0.9}>
            <Card style={{ gap: SPACING.md }}>
              <View style={s.cardTop}>
                <Avatar name={item.name} size={48} />
                <View style={{ flex: 1 }}>
                  <View style={s.nameRow}>
                    <Text style={s.name}>{item.name}</Text>
                    <TierBadge tier={item.tier} size="sm" />
                  </View>
                  <View style={s.metaRow}>
                    <Ionicons name="star" size={12} color={COLORS.warning} />
                    <Text style={s.meta}>{item.rating.toFixed(1)} · {item.sessionCount} asesorías · {item.approvalRate}% aprobó</Text>
                  </View>
                </View>
                <Text style={s.price}>${item.pricePerHour.toLocaleString('es-CL')}<Text style={s.priceUnit}>/h</Text></Text>
              </View>

              <View style={s.subjectsRow}>
                {item.subjects.map((sub) => (
                  <View key={sub.name} style={s.subjectChip}>
                    <Text style={s.subjectTxt}>{sub.name}</Text>
                    <View style={s.gradeBadge}>
                      <Text style={s.gradeTxt}>{sub.grade.toFixed(1)}</Text>
                    </View>
                  </View>
                ))}
              </View>

              <View style={s.cardBottom}>
                <View style={s.modalityRow}>
                  <Ionicons name={item.modality === 'online' ? 'videocam-outline' : 'location-outline'} size={14} color={COLORS.textMuted} />
                  <Text style={s.modality}>{item.modality === 'ambas' ? 'Presencial u online' : item.modality}</Text>
                </View>
                <View style={s.viewBtn}>
                  <Text style={s.viewTxt}>Ver y reservar</Text>
                  <Ionicons name="chevron-forward" size={14} color="#fff" />
                </View>
              </View>
            </Card>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: { padding: SPACING.xl, gap: SPACING.md },
  sub: { ...TYPE.body, marginTop: 4 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: RADII.md, paddingHorizontal: 14, borderWidth: 1, borderColor: COLORS.border },
  searchInput: { flex: 1, height: 48, fontSize: 15, color: COLORS.text },
  chips: { gap: SPACING.sm, paddingRight: SPACING.xl },
  chip: { backgroundColor: COLORS.surface, borderRadius: RADII.pill, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.ink, borderColor: COLORS.ink },
  chipTxt: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted },
  chipTxtActive: { color: '#fff' },
  list: { paddingHorizontal: SPACING.xl, paddingBottom: 24, gap: SPACING.md },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  name: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  meta: { fontSize: 12, color: COLORS.textMuted },
  price: { fontSize: 16, fontWeight: '800', color: COLORS.primary },
  priceUnit: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted },
  subjectsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  subjectChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.surfaceMuted, borderRadius: RADII.sm, paddingLeft: 10, paddingRight: 5, paddingVertical: 5 },
  subjectTxt: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  gradeBadge: { backgroundColor: COLORS.successSoft, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  gradeTxt: { fontSize: 11, fontWeight: '800', color: COLORS.success },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalityRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  modality: { fontSize: 12, color: COLORS.textMuted, textTransform: 'capitalize' },
  viewBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.ink, paddingHorizontal: 14, paddingVertical: 9, borderRadius: RADII.sm },
  viewTxt: { fontSize: 13, fontWeight: '700', color: '#fff' },
  empty: { alignItems: 'center', paddingTop: 60, gap: SPACING.md },
  emptyTxt: { fontSize: 15, color: COLORS.textMuted, textAlign: 'center' },
});
