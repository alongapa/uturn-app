import React from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BOOKINGS_SUMMARY, DRIVER_SPOTLIGHT, UPCOMING_TRIP } from '@/constants/mock-data';

export default function DashboardScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>Hola, Daniela</Text>
            <Text style={styles.title}>Tu resumen diario</Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeLabel}>Nivel</Text>
            <Text style={styles.badgeValue}>Gold</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>5</Text>
            <Text style={styles.statLabel}>Reservas activas</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>18</Text>
            <Text style={styles.statLabel}>Conductores de confianza</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>4.9★</Text>
            <Text style={styles.statLabel}>Tu reputación</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Próximo viaje</Text>
          <View style={styles.upcomingCard}>
            <View style={styles.upcomingRow}>
              <Text style={styles.tripLabel}>Salida</Text>
              <Text style={styles.tripValue}>
                {new Date(UPCOMING_TRIP.departAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
            <View style={styles.upcomingRow}>
              <Text style={styles.tripLabel}>Punto de encuentro</Text>
              <Text style={styles.tripValue}>{UPCOMING_TRIP.meetPoint}</Text>
            </View>
            <View style={styles.upcomingRow}>
              <Text style={styles.tripLabel}>Destino</Text>
              <Text style={styles.tripValue}>{UPCOMING_TRIP.dest}</Text>
            </View>
            <View style={styles.upcomingRow}>
              <Text style={styles.tripLabel}>Conductora</Text>
              <Text style={styles.tripValue}>{UPCOMING_TRIP.driverName}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Reservas</Text>
          {BOOKINGS_SUMMARY.map((booking) => (
            <View key={booking.id} style={styles.bookingCard}>
              <View>
                <Text style={styles.bookingTitle}>{booking.title}</Text>
                <Text style={styles.bookingMeta}>
                  {booking.driverName} · {booking.date}
                </Text>
              </View>
              <View style={styles.statusPill(booking.status)}>
                <Text style={styles.statusText}>{booking.status}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top conductores</Text>
          {DRIVER_SPOTLIGHT.map((driver) => (
            <View key={driver.id} style={styles.driverRow}>
              <View>
                <Text style={styles.driverName}>{driver.name}</Text>
                <Text style={styles.driverMeta}>{driver.car}</Text>
              </View>
              <Text style={styles.driverScore}>{driver.rating?.toFixed(1)} ★</Text>
            </View>
          ))}
        </View>
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
    gap: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  kicker: {
    color: '#cbd5f5',
    fontSize: 14,
  },
  title: {
    color: '#f8fafc',
    fontSize: 28,
    fontWeight: '700',
  },
  badge: {
    backgroundColor: '#1d4ed8',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  badgeLabel: {
    color: '#cbd5f5',
    fontSize: 12,
  },
  badgeValue: {
    color: '#f8fafc',
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#0f172a',
    padding: 16,
    borderRadius: 16,
    gap: 4,
  },
  statValue: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '700',
  },
  statLabel: {
    color: '#94a3b8',
    fontSize: 12,
  },
  section: {
    gap: 16,
  },
  sectionTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '600',
  },
  upcomingCard: {
    backgroundColor: '#0f172a',
    borderRadius: 18,
    padding: 18,
    gap: 12,
  },
  upcomingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tripLabel: {
    color: '#94a3b8',
    fontSize: 13,
  },
  tripValue: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '600',
    maxWidth: '60%',
    textAlign: 'right',
  },
  bookingCard: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bookingTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '600',
  },
  bookingMeta: {
    color: '#94a3b8',
    fontSize: 13,
  },
  statusPill: (status: string) => ({
    backgroundColor:
      status === 'confirmado'
        ? 'rgba(45,212,191,0.15)'
        : status === 'pendiente'
          ? 'rgba(251,191,36,0.15)'
          : status === 'completado'
            ? 'rgba(96,165,250,0.2)'
            : 'rgba(248,113,113,0.2)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  }),
  statusText: {
    color: '#f8fafc',
    textTransform: 'capitalize',
    fontWeight: '600',
  },
  driverRow: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  driverName: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '600',
  },
  driverMeta: {
    color: '#94a3b8',
  },
  driverScore: {
    color: '#38bdf8',
    fontSize: 16,
    fontWeight: '700',
  },
});
