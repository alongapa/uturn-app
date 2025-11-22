import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppState } from '@/store/appState';

export default function RewardsScreen() {
  const { rewardSummary } = useAppState();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.levelCard}>
        <Text style={styles.levelLabel}>Nivel {rewardSummary.currentLevel}</Text>
        <Text style={styles.points}>{rewardSummary.totalPoints} pts</Text>
        {rewardSummary.nextLevel && rewardSummary.pointsToNext !== null ? (
          <Text style={styles.progressText}>
            Te faltan {rewardSummary.pointsToNext} puntos para alcanzar el nivel {rewardSummary.nextLevel}
          </Text>
        ) : (
          <Text style={styles.progressText}>¡Has alcanzado el máximo nivel!</Text>
        )}
      </View>

      <Text style={styles.sectionTitle}>Tus estadísticas</Text>
      <View style={styles.statsGrid}>
        {Object.entries(rewardSummary.stats).map(([key, value]) => (
          <View key={key} style={styles.statCard}>
            <Text style={styles.statValue}>{value}</Text>
            <Text style={styles.statLabel}>{labels[key as keyof typeof rewardSummary.stats]}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Insignias ganadas</Text>
      <View style={styles.badges}> 
        {rewardSummary.badgesUnlocked.map((badge) => (
          <View key={badge.title} style={styles.badgeCard}>
            <Text style={styles.badgeTitle}>{badge.title}</Text>
            <Text style={styles.badgeDesc}>{badge.description}</Text>
            <Text style={styles.unlocked}>Desbloqueado</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Insignias por desbloquear</Text>
      <View style={styles.badges}> 
        {rewardSummary.badgesLocked.map((badge) => (
          <View key={badge.title} style={[styles.badgeCard, styles.lockedCard]}>
            <Text style={styles.badgeTitle}>{badge.title}</Text>
            <Text style={styles.badgeDesc}>{badge.description}</Text>
            <Text style={styles.locked}>Pendiente</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>¿Cómo ganar puntos?</Text>
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

const labels = {
  completedTrips: 'Viajes completados',
  averageRating: 'Calificación promedio',
  punctuality: 'Puntualidad (%)',
  monthsActive: 'Meses activo',
  totalTrips: 'Total de viajes',
  cancellations: 'Cancelaciones',
};

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
  levelLabel: { fontSize: 18, fontWeight: '800', color: '#0ea5e9' },
  points: { fontSize: 28, fontWeight: '800', color: '#0f172a' },
  progressText: { color: '#334155' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginTop: 8 },
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
  unlocked: { color: '#16a34a', fontWeight: '700' },
  locked: { color: '#94a3b8', fontWeight: '700' },
  lockedCard: { backgroundColor: '#f8fafc' },
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
