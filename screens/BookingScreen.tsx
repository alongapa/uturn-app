import React, { useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { BOOKINGS_SUMMARY } from '@/constants/mock-data';

const STATUS_FILTERS = ['todas', 'confirmado', 'pendiente', 'completado'];

const getBookingStatusBackground = (state: string) => {
  if (state === 'confirmado') {
    return 'rgba(34,197,94,0.15)';
  }

  if (state === 'pendiente') {
    return 'rgba(251,191,36,0.15)';
  }

  if (state === 'completado') {
    return 'rgba(96,165,250,0.2)';
  }

  return 'rgba(248,113,113,0.2)';
};

export default function BookingScreen() {
  const [selectedFilter, setSelectedFilter] = useState<string>('todas');

  const filteredBookings = useMemo(() => {
    if (selectedFilter === 'todas') {
      return BOOKINGS_SUMMARY;
    }

    return BOOKINGS_SUMMARY.filter((booking) => booking.status === selectedFilter);
  }, [selectedFilter]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Mis reservas</Text>
        <Text style={styles.subtitle}>Estado en tiempo real y recordatorios automáticos.</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {STATUS_FILTERS.map((filter) => (
            <TouchableOpacity
              key={filter}
              onPress={() => setSelectedFilter(filter)}
              style={[styles.filterChip, selectedFilter === filter && styles.filterChipActive]}
            >
              <Text style={[styles.filterText, selectedFilter === filter && styles.filterTextActive]}>
                {filter === 'todas' ? 'Todas' : filter}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {filteredBookings.map((booking) => (
          <View key={booking.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{booking.title}</Text>
              <View style={[styles.statusPill, { backgroundColor: getBookingStatusBackground(booking.status) }]}>
                <Text style={styles.statusText}>{booking.status}</Text>
              </View>
            </View>
            <Text style={styles.cardMeta}>{booking.driverName}</Text>
            <Text style={styles.cardMeta}>{booking.date}</Text>
            <View style={styles.cardFooter}>
              <Text style={styles.cardFooterText}>Asientos: {booking.seats}</Text>
              <Text style={styles.cardFooterText}>ID #{booking.id}</Text>
            </View>
            <View style={styles.reminderRow}>
              <View>
                <Text style={styles.reminderLabel}>Recordatorio</Text>
                <Text style={styles.reminderValue}>15 minutos antes</Text>
              </View>
              <TouchableOpacity style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Enviar</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.cardActions}>
              <TouchableOpacity style={styles.actionGhost}>
                <Text style={styles.actionGhostText}>Compartir viaje</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionPrimary}>
                <Text style={styles.actionPrimaryText}>Confirmar pago</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  },
  filterRow: {
    gap: 12,
    paddingVertical: 12,
  },
  filterChip: {
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 12,
  },
  filterChipActive: {
    backgroundColor: '#22d3ee',
    borderColor: '#22d3ee',
  },
  filterText: {
    color: '#f8fafc',
    textTransform: 'capitalize',
  },
  filterTextActive: {
    color: '#0f172a',
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 18,
    padding: 18,
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '600',
  },
  statusPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusText: {
    color: '#f8fafc',
    textTransform: 'capitalize',
    fontWeight: '600',
  },
  cardMeta: {
    color: '#94a3b8',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  cardFooterText: {
    color: '#cbd5f5',
    fontWeight: '600',
  },
  reminderRow: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#020617',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reminderLabel: {
    color: '#94a3b8',
    fontSize: 12,
  },
  reminderValue: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  secondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
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
    backgroundColor: '#38bdf8',
  },
  actionPrimaryText: {
    color: '#0f172a',
    fontWeight: '700',
  },
});
