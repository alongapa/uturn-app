import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppState } from '@/store/appState';

export default function RewardsScreen() {
  const { rewardSummary } = useAppState();

  const levelCards = useMemo(() => {
    const levels = [];
    const current = rewardSummary.currentLevel;
    const maxLevel = Math.max(current + 2, rewardSummary.nextLevel ?? current + 1);
    for (let level = 1; level <= maxLevel; level += 1) {
      const status = level === current ? 'actual' : level < current ? 'completado' : 'pendiente';
      const missing =
        level === rewardSummary.nextLevel && rewardSummary.pointsToNext !== null ? rewardSummary.pointsToNext : null;
      levels.push({ level, status, missing });
    }
    return levels;
  }, [rewardSummary.currentLevel, rewardSummary.nextLevel, rewardSummary.pointsToNext]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.levelCard}>
        <Text style={styles.levelLabel}>Nivel actual</Text>
        <Text style={styles.points}>Nivel {rewardSummary.currentLevel}</Text>
        {rewardSummary.pointsToNext !== null && rewardSummary.nextLevel !== null ? (
          <Text style={styles.progressText}>
            Te faltan {rewardSummary.pointsToNext} pts para llegar al nivel {rewardSummary.nextLevel}
          </Text>
        ) : (
          <Text style={styles.progressText}>Sigue sumando viajes para subir de nivel.</Text>
        )}
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${Math.round(rewardSummary.progressToNext * 100)}%` }]} />
        </View>
        <Text style={styles.progressCaption}>
          {Math.round(rewardSummary.progressToNext * 100)}% hacia el siguiente nivel
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Próximos niveles</Text>
        <View style={styles.levelRow}>
          {levelCards.map((card) => (
            <View
              key={card.level}
              style={[
                styles.levelBadge,
                card.status === 'actual' ? styles.levelBadgeCurrent : undefined,
                card.status === 'completado' ? styles.levelBadgeDone : undefined,
              ]}
            >
              <Text style={styles.levelNumber}>Nivel {card.level}</Text>
              <Text style={styles.levelStatus}>
                {card.status === 'actual' ? 'En curso' : card.status === 'completado' ? 'Completado' : 'Por alcanzar'}
              </Text>
              {card.missing !== null && <Text style={styles.levelMissing}>{card.missing} pts faltantes</Text>}
            </View>
          ))}
        </View>
      </View>

      <Text style={styles.sectionTitle}>Tu avance</Text>
      <View style={styles.statsGrid}>
        <StatCard label="Viajes completados" value={rewardSummary.stats.completedTrips} />
        <StatCard label="Viajes totales" value={rewardSummary.stats.totalTrips} />
        <StatCard label="Calificación promedio" value={rewardSummary.stats.averageRating.toFixed(1)} />
        <StatCard label="Faltan para próximo nivel" value={rewardSummary.pointsToNext ?? 0} />
      </View>

      <Text style={styles.sectionTitle}>Insignias por desbloquear</Text>
      <View style={styles.badges}>
        {rewardSummary.badgesLocked.map((badge) => (
          <View key={badge.title} style={styles.badgeCard}>
            <Text style={styles.badgeTitle}>{badge.title}</Text>
            <Text style={styles.badgeDesc}>{badge.description}</Text>
            <Text style={styles.badgePending}>Pendiente</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Reglas de progreso</Text>
      <View style={styles.earnRules}>
        {rewardSummary.earnRules.map((rule) => (
          <View key={rule.title} style={styles.ruleRow}>
            <Text style={styles.ruleTitle}>{rule.title}</Text>
            <Text style={styles.ruleValue}>{rule.value}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, gap: 16 },
  levelCard: {
    backgroundColor: '#e0f2fe',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    gap: 6,
  },
  levelLabel: { fontSize: 14, fontWeight: '700', color: '#0ea5e9' },
  points: { fontSize: 28, fontWeight: '800', color: '#0f172a' },
  progressText: { color: '#334155' },
  progressCaption: { color: '#475569', fontSize: 12 },
  progressBar: {
    height: 10,
    backgroundColor: '#e2e8f0',
    borderRadius: 999,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#0A1525',
  },
  section: { gap: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginTop: 8 },
  levelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  levelBadge: {
    flexBasis: '48%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 4,
  },
  levelBadgeCurrent: { borderColor: '#0A1525', backgroundColor: '#e2e8f0' },
  levelBadgeDone: { borderColor: '#38bdf8', backgroundColor: '#ecfeff' },
  levelNumber: { fontWeight: '800', color: '#0f172a' },
  levelStatus: { color: '#475569' },
  levelMissing: { color: '#0A1525', fontWeight: '700' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCard: {
    flexBasis: '48%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  statValue: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  statLabel: { color: '#475569', marginTop: 4 },
  badges: { gap: 12 },
  badgeCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 4,
  },
  badgeTitle: { fontWeight: '700', color: '#0f172a' },
  badgeDesc: { color: '#475569' },
  badgePending: { color: '#0A1525', fontWeight: '700' },
  earnRules: { gap: 8 },
  ruleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  ruleTitle: { color: '#0f172a', fontWeight: '600' },
  ruleValue: { color: '#2563eb', fontWeight: '700' },
});
