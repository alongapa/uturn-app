import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useUser } from '@/contexts/UserContext';
import { useAppState } from '@/store/appState';
import { TIER_COLORS, TIER_LABELS, TIER_MIN_TRIPS, type ReputationTier, type Benefit } from '@/models/types';
import { COLORS, RADII, SPACING, TYPE } from '@/constants/designSystem';
import { Card } from '@/components/ui/Card';

const TIERS: ReputationTier[] = ['novato', 'habitual', 'confiable', 'elite'];

const CATEGORY_ICON: Record<Benefit['category'], keyof typeof Ionicons.glyphMap> = {
  eventos: 'sparkles',
  comida: 'restaurant',
  academico: 'book',
  entretenimiento: 'musical-notes',
  deporte: 'barbell',
};

export default function RewardsScreen() {
  const { user } = useUser();
  const { state } = useAppState();
  const [filter, setFilter] = useState<Benefit['category'] | 'todos'>('todos');

  if (!user) return null;

  const currentTierIdx = TIERS.indexOf(user.tier);
  const nextTier = TIERS[currentTierIdx + 1] as ReputationTier | undefined;
  const currentMinTrips = TIER_MIN_TRIPS[user.tier];
  const nextMinTrips = nextTier ? TIER_MIN_TRIPS[nextTier] : null;
  const progress = nextMinTrips
    ? Math.min((user.completedTripsAsDriver - currentMinTrips) / (nextMinTrips - currentMinTrips), 1)
    : 1;

  const filtered = filter === 'todos' ? state.benefits : state.benefits.filter((b) => b.category === filter);

  const categories: Array<{ id: Benefit['category'] | 'todos'; label: string }> = [
    { id: 'todos', label: 'Todos' },
    { id: 'eventos', label: 'Eventos' },
    { id: 'comida', label: 'Comida' },
    { id: 'academico', label: 'Académico' },
    { id: 'entretenimiento', label: 'Entretención' },
    { id: 'deporte', label: 'Deporte' },
  ];

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        <View>
          <Text style={TYPE.display}>Beneficios</Text>
          <Text style={s.sub}>Mejora tu reputación para desbloquear recompensas</Text>
        </View>

        {/* Tier progress */}
        <Card style={{ gap: SPACING.lg }}>
          <View style={s.tierRow}>
            {TIERS.map((t, i) => {
              const color = TIER_COLORS[t];
              const active = i <= currentTierIdx;
              return (
                <View key={t} style={s.tierStep}>
                  <View style={[s.tierDot, { borderColor: color, backgroundColor: active ? color : 'transparent' }]}>
                    {active && <Ionicons name="checkmark" size={13} color="#fff" />}
                  </View>
                  <Text style={[s.tierStepLabel, { color: active ? color : COLORS.textSubtle }]}>{TIER_LABELS[t]}</Text>
                </View>
              );
            })}
          </View>
          {nextTier ? (
            <View style={{ gap: SPACING.sm }}>
              <View style={s.progressBg}>
                <View style={[s.progressFill, { width: `${progress * 100}%` as any, backgroundColor: TIER_COLORS[user.tier] }]} />
              </View>
              <Text style={s.progressLabel}>{user.completedTripsAsDriver} / {nextMinTrips} viajes para {TIER_LABELS[nextTier]}</Text>
            </View>
          ) : (
            <Text style={s.eliteMsg}>Eres Élite — máximo nivel alcanzado</Text>
          )}
        </Card>

        {/* Créditos */}
        <Card dark style={s.creditsCard}>
          <View>
            <Text style={s.creditsLabel}>Créditos UTurn</Text>
            <Text style={s.creditsVal}>{user.uturnCredits}</Text>
            <Text style={s.creditsSub}>Canjeables en viajes y asesorías</Text>
          </View>
          <View style={s.creditsIcon}>
            <Ionicons name="wallet" size={26} color={COLORS.primary} />
          </View>
        </Card>

        {/* Filtros */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filters} contentContainerStyle={s.filtersContent}>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={[s.filterChip, filter === cat.id && s.filterActive]}
              onPress={() => setFilter(cat.id)}
            >
              <Text style={[s.filterTxt, filter === cat.id && s.filterTxtActive]}>{cat.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Beneficios */}
        <View style={{ gap: SPACING.md }}>
          {filtered.map((b) => {
            const unlocked = TIERS.indexOf(b.requiredTier) <= currentTierIdx;
            const tierColor = TIER_COLORS[b.requiredTier];
            return (
              <Card key={b.id} style={[s.benefit, !unlocked && s.benefitLocked]}>
                <View style={[s.benefitIcon, { backgroundColor: unlocked ? tierColor + '18' : COLORS.surfaceMuted }]}>
                  <Ionicons name={CATEGORY_ICON[b.category]} size={22} color={unlocked ? tierColor : COLORS.textSubtle} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={s.benefitTop}>
                    <Text style={[s.benefitPartner, !unlocked && s.muted]}>{b.partner}</Text>
                    {b.discount && (
                      <View style={[s.discountBadge, { backgroundColor: unlocked ? tierColor + '18' : COLORS.surfaceMuted }]}>
                        <Text style={[s.discountTxt, { color: unlocked ? tierColor : COLORS.textSubtle }]}>{b.discount}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[s.benefitDesc, !unlocked && s.muted]}>{b.description}</Text>
                  <View style={s.benefitFooter}>
                    <View style={[s.tierReq, { borderColor: tierColor }]}>
                      <Text style={[s.tierReqTxt, { color: tierColor }]}>{TIER_LABELS[b.requiredTier]}</Text>
                    </View>
                    {unlocked ? (
                      <View style={s.statusRow}>
                        <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
                        <Text style={s.unlockedTxt}>Disponible</Text>
                      </View>
                    ) : (
                      <View style={s.statusRow}>
                        <Ionicons name="lock-closed" size={13} color={COLORS.textSubtle} />
                        <Text style={s.lockedTxt}>Bloqueado</Text>
                      </View>
                    )}
                  </View>
                </View>
              </Card>
            );
          })}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: SPACING.xl, gap: SPACING.lg, paddingBottom: 40 },
  sub: { ...TYPE.body, marginTop: 4 },
  tierRow: { flexDirection: 'row', justifyContent: 'space-between' },
  tierStep: { alignItems: 'center', gap: 6, flex: 1 },
  tierDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  tierStepLabel: { fontSize: 10, fontWeight: '700', textAlign: 'center' },
  progressBg: { height: 8, backgroundColor: COLORS.surfaceMuted, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  progressLabel: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center' },
  eliteMsg: { fontSize: 14, fontWeight: '700', color: COLORS.warning, textAlign: 'center' },
  creditsCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  creditsLabel: { fontSize: 12, color: COLORS.onDarkMuted, fontWeight: '600' },
  creditsVal: { fontSize: 30, fontWeight: '800', color: '#fff', marginTop: 2 },
  creditsSub: { fontSize: 11, color: COLORS.onDarkMuted, marginTop: 4 },
  creditsIcon: { width: 52, height: 52, borderRadius: RADII.md, backgroundColor: 'rgba(37,99,235,0.18)', alignItems: 'center', justifyContent: 'center' },
  filters: { marginHorizontal: -SPACING.xl },
  filtersContent: { paddingHorizontal: SPACING.xl, gap: SPACING.sm },
  filterChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: RADII.pill, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  filterActive: { backgroundColor: COLORS.ink, borderColor: COLORS.ink },
  filterTxt: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted },
  filterTxtActive: { color: '#fff' },
  benefit: { flexDirection: 'row', gap: SPACING.md },
  benefitLocked: { opacity: 0.65 },
  benefitIcon: { width: 46, height: 46, borderRadius: RADII.md, alignItems: 'center', justifyContent: 'center' },
  benefitTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  benefitPartner: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  discountBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADII.sm },
  discountTxt: { fontSize: 11, fontWeight: '700' },
  benefitDesc: { fontSize: 13, color: COLORS.textMuted },
  muted: { color: COLORS.textSubtle },
  benefitFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  tierReq: { borderWidth: 1, borderRadius: RADII.sm, paddingHorizontal: 8, paddingVertical: 3 },
  tierReqTxt: { fontSize: 11, fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  unlockedTxt: { fontSize: 12, color: COLORS.success, fontWeight: '700' },
  lockedTxt: { fontSize: 12, color: COLORS.textSubtle },
});
