import React, { useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';

import { PASSENGER_MANIFEST, type PassengerManifest } from '@/constants/mock-data';

type Styles = {
  safeArea: ViewStyle;
  content: ViewStyle;
  title: TextStyle;
  subtitle: TextStyle;
  card: ViewStyle;
  cardActive: ViewStyle;
  cardHeader: ViewStyle;
  cardName: TextStyle;
  cardFaculty: TextStyle;
  status: ViewStyle;
  statusConfirmed: ViewStyle;
  statusPending: ViewStyle;
  statusCompleted: ViewStyle;
  statusText: TextStyle;
  cardRow: ViewStyle;
  cardLabel: TextStyle;
  cardValue: TextStyle;
  insightRow: ViewStyle;
  insightLabel: TextStyle;
  insightValue: TextStyle;
  badgeRow: ViewStyle;
  badge: ViewStyle;
  badgeText: TextStyle;
  cardActions: ViewStyle;
  actionGhost: ViewStyle;
  actionGhostText: TextStyle;
  actionPrimary: ViewStyle;
  actionPrimaryText: TextStyle;
};

export default function ManagePassengersScreen() {
  const [selectedPassenger, setSelectedPassenger] = useState<PassengerManifest['id']>(
    PASSENGER_MANIFEST[0]?.id ?? ''
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Pasajeros confirmados</Text>
        <Text style={styles.subtitle}>Gestiona check-in, pagos y ubicaciones en tiempo real.</Text>

        {PASSENGER_MANIFEST.map((passenger) => (
          <TouchableOpacity
            key={passenger.id}
            style={[styles.card, selectedPassenger === passenger.id ? styles.cardActive : undefined]}
            onPress={() => setSelectedPassenger(passenger.id)}
            activeOpacity={0.9}
          >
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardName}>{passenger.name}</Text>
                <Text style={styles.cardFaculty}>{passenger.faculty}</Text>
              </View>
              <View
                style={[
                  styles.status,
                  passenger.status === 'confirmado'
                    ? styles.statusConfirmed
                    : passenger.status === 'pendiente'
                      ? styles.statusPending
                      : styles.statusCompleted,
                ]}
              >
                <Text style={styles.statusText}>{passenger.status}</Text>
              </View>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Pickup</Text>
              <Text style={styles.cardValue}>{passenger.pickup}</Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Asiento</Text>
              <Text style={styles.cardValue}>{passenger.seat}</Text>
            </View>
            {passenger.badges && (
              <View style={styles.badgeRow}>
                {passenger.badges.map((badge) => (
                  <View key={badge} style={styles.badge}>
                    <Text style={styles.badgeText}>{badge}</Text>
                  </View>
                ))}
              </View>
            )}
            <View style={styles.insightRow}>
              <View>
                <Text style={styles.insightLabel}>Última actualización</Text>
                <Text style={styles.insightValue}>{passenger.status === 'confirmado' ? 'En campus' : 'En espera'}</Text>
              </View>
              <View>
                <Text style={styles.insightLabel}>Pago</Text>
                <Text style={styles.insightValue}>
                  {passenger.badges?.includes('Pago verificado') ? 'Verificado' : 'Pendiente'}
                </Text>
              </View>
            </View>
            <View style={styles.cardActions}>
              <TouchableOpacity style={styles.actionGhost}>
                <Text style={styles.actionGhostText}>Enviar mensaje</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionPrimary}>
                <Text style={styles.actionPrimaryText}>Marcar check-in</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create<Styles>({
  safeArea: {
    flex: 1,
    backgroundColor: '#020617',
  },
  content: {
    padding: 24,
    gap: 20,
  },
  title: {
    color: '#f8fafc',
    fontSize: 26,
    fontWeight: '700',
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 15,
  },
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 18,
    padding: 18,
    gap: 12,
  },
  cardActive: {
    borderWidth: 1,
    borderColor: '#38bdf8',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardName: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '600',
  },
  cardFaculty: {
    color: '#94a3b8',
  },
  status: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  statusConfirmed: {
    backgroundColor: 'rgba(34,197,94,0.15)',
  },
  statusPending: {
    backgroundColor: 'rgba(251,191,36,0.15)',
  },
  statusCompleted: {
    backgroundColor: 'rgba(148,163,184,0.2)',
  },
  statusText: {
    color: '#f8fafc',
    textTransform: 'capitalize',
    fontWeight: '600',
    fontSize: 12,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardLabel: {
    color: '#94a3b8',
  },
  cardValue: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  insightRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#020617',
    borderRadius: 14,
    padding: 12,
  },
  insightLabel: {
    color: '#94a3b8',
    fontSize: 12,
  },
  insightValue: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  badge: {
    backgroundColor: '#1d4ed8',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  badgeText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '600',
  },
  cardActions: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 12,
  },
  actionGhost: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
    paddingVertical: 12,
    alignItems: 'center',
  },
  actionGhostText: {
    color: '#cbd5f5',
    fontWeight: '600',
  },
  actionPrimary: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#22d3ee',
  },
  actionPrimaryText: {
    color: '#0f172a',
    fontWeight: '700',
  },
});
