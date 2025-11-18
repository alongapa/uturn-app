import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

const TRIPS = [
  { id: '1', route: 'Campus Peñalolén → Metro Tobalaba', date: 'Hoy, 18:00', driver: 'María González' },
  { id: '2', route: 'Campus Viña → Plaza Vergara', date: 'Mañana, 08:30', driver: 'Carlos Pérez' },
];

export default function MyTripsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mis viajes reservados</Text>
      <FlatList
        data={TRIPS}
        keyExtractor={(trip) => trip.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.route}>{item.route}</Text>
            <Text style={styles.meta}>{item.date}</Text>
            <Text style={styles.meta}>Conductor: {item.driver}</Text>
          </View>
        )}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    padding: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 16,
    textAlign: 'center',
  },
  listContent: {
    gap: 12,
  },
  card: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  route: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 8,
  },
  meta: {
    color: '#475569',
  },
});
