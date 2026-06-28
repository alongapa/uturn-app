import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useUser } from '@/contexts/UserContext';
import { useAppState } from '@/store/appState';
import { TIER_COLORS, TIER_LABELS, TIER_MIN_TRIPS, type ReputationTier, type Benefit } from '@/models/types';

const TIERS: ReputationTier[] = ['novato', 'habitual', 'confiable', 'elite'];

const CATEGORY_ICONS: Record<Benefit['category'], string> = {
  eventos: '🎉',
  comida: '🍽️',
  academico: '📚',
  entretenimiento: '🎵',
  deporte: '🏋️',
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

  const filtered = filter === 'todos'
    ? state.benefits
    : state.benefits.filter((b) => b.category === filter);

  const categories: Array<{ id: Benefit['category'] | 'todos'; label: string }> = [
    { id: 'todos', label: 'Todos' },
    { id: 'eventos', label: 'Eventos' },
    { id: 'comida', label: 'Comida' },
    { id: 'academico', label: 'Académico' },
    { id: 'entretenimiento', label: 'Entretención' },
    { id: 'deporte', label: 'Deporte' },
  ];

  function isBenefitUnlocked(b: Benefit) {
    return TIERS.indexOf(b.requiredTier) <= currentTierIdx;
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <Text style={s.title}>Beneficios</Text>
        <Text style={s.sub}>Sube de tier mejorando tu reputación como conductor y pasajero</Text>

        {/* Tier progress */}
        <View style={s.tierCard}>
          <View style={s.tierRow}>
            {TIERS.map((t, i) => {
              const color = TIER_COLORS[t];
              const active = i <= currentTierIdx;
              return (
                <View key={t} style={s.tierStep}>
                  <View style={[s.tierDot, { borderColor: color, backgroundColor: active ? color : 'transparent' }]}>
                    {i <= currentTierIdx && <Text style={s.tierCheck}>✓</Text>}
                  </View>
                  <Text style={[s.tierStepLabel, { color: active ? color : '#94A3B8' }]}>
                    {TIER_LABELS[t]}
                  </Text>
                </View>
              );
            })}
          </View>

          {nextTier && (
            <>
              <View style={s.progressBg}>
                <View style={[s.progressFill, { width: `${progress * 100}%` as any, backgroundColor: TIER_COLORS[user.tier] }]} />
              </View>
              <Text style={s.progressLabel}>
                {user.completedTripsAsDriver} / {nextMinTrips} viajes para {TIER_LABELS[nextTier]}
              </Text>
            </>
          )}

          {!nextTier && (
            <Text style={s.eliteMsg}>🏆 Eres Élite — máximo nivel</Text>
          )}
        </View>

        {/* Créditos */}
        <View style={s.creditsCard}>
          <View>
            <Text style={s.creditsLabel}>Créditos UTurn</Text>
            <Text style={s.creditsVal}>{user.uturnCredits} créditos</Text>
            <Text style={s.creditsSub}>Canjeables como descuento en viajes y asesorías</Text>
          </View>
          <Text style={s.creditsIcon}>💰</Text>
        </View>

        {/* Filtros categoría */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filters}>
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
        {filtered.map((b) => {
          const unlocked = isBenefitUnlocked(b);
          const tierColor = TIER_COLORS[b.requiredTier];
          return (
            <View key={b.id} style={[s.benefitCard, !unlocked && s.benefitLocked]}>
              <View style={s.benefitLeft}>
                <Text style={s.benefitEmoji}>{b.icon}</Text>
              </View>
              <View style={s.benefitBody}>
                <View style={s.benefitTop}>
                  <Text style={[s.benefitPartner, !unlocked && s.textMuted]}>{b.partner}</Text>
                  {b.discount && (
                    <View style={[s.discountBadge, { backgroundColor: unlocked ? tierColor + '22' : '#F1F5F9' }]}>
                      <Text style={[s.discountTxt, { color: unlocked ? tierColor : '#94A3B8' }]}>{b.discount}</Text>
                    </View>
                  )}
                </View>
                <Text style={[s.benefitDesc, !unlocked && s.textMuted]}>{b.description}</Text>
                <Text style={[s.benefitDetail, !unlocked && s.textMuted]} numberOfLines={2}>{b.detail}</Text>
                <View style={s.benefitFooter}>
                  <View style={[s.tierReqBadge, { borderColor: tierColor }]}>
                    <Text style={[s.tierReqTxt, { color: tierColor }]}>
                      {CATEGORY_ICONS[b.category]} Requiere {TIER_LABELS[b.requiredTier]}
                    </Text>
                  </View>
                  {!unlocked && <Text style={s.lockedTxt}>🔒 Bloqueado</Text>}
                  {unlocked && <Text style={s.unlockedTxt}>✓ Disponible</Text>}
                </View>
              </View>
            </View>
          );
        })}

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll: { padding: 20, gap: 14 },
  title: { fontSize: 26, fontWeight: '800', color: '#0A1525' },
  sub: { fontSize: 14, color: '#64748B' },

  tierCard: { backgroundColor: '#fff', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#E2E8F0', gap: 14 },
  tierRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  tierStep: { alignItems: 'center', gap: 6, flex: 1 },
  tierDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  tierCheck: { fontSize: 12, color: '#fff', fontWeight: '800' },
  tierStepLabel: { fontSize: 10, fontWeight: '700', textAlign: 'center' },
  progressBg: { height: 8, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  progressLabel: { fontSize: 12, color: '#64748B', textAlign: 'center' },
  eliteMsg: { fontSize: 14, fontWeight: '700', color: '#F59E0B', textAlign: 'center' },

  creditsCard: { backgroundColor: '#0A1525', borderRadius: 16, padding: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  creditsLabel: { fontSize: 12, color: '#7BA7CC', fontWeight: '600' },
  creditsVal: { fontSize: 28, fontWeight: '800', color: '#fff', marginTop: 2 },
  creditsSub: { fontSize: 11, color: '#94A3B8', marginTop: 4 },
  creditsIcon: { fontSize: 40 },

  filters: { marginHorizontal: -20, paddingHorizontal: 20 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F1F5F9', marginRight: 8 },
  filterActive: { backgroundColor: '#0A1525' },
  filterTxt: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  filterTxtActive: { color: '#fff' },

  benefitCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, flexDirection: 'row', gap: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  benefitLocked: { opacity: 0.7 },
  benefitLeft: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },
  benefitEmoji: { fontSize: 24 },
  benefitBody: { flex: 1, gap: 4 },
  benefitTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  benefitPartner: { fontSize: 15, fontWeight: '800', color: '#0A1525' },
  discountBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  discountTxt: { fontSize: 11, fontWeight: '700' },
  benefitDesc: { fontSize: 13, color: '#374151', fontWeight: '600' },
  benefitDetail: { fontSize: 12, color: '#64748B' },
  textMuted: { color: '#94A3B8' },
  benefitFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  tierReqBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  tierReqTxt: { fontSize: 11, fontWeight: '700' },
  lockedTxt: { fontSize: 12, color: '#94A3B8' },
  unlockedTxt: { fontSize: 12, color: '#15803D', fontWeight: '700' },
});
