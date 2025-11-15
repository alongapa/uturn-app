import React from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';

const MOCK_TRIPS = [
  { id: '1', origen: 'Campus Peñalolén', destino: 'Plaza Italia', horario: '08:00' },
  { id: '2', origen: 'Campus San Carlos', destino: 'Providencia', horario: '09:15' },
  { id: '3', origen: 'Campus Viña del Mar', destino: 'Valparaíso', horario: '07:45' },
];

export default function SearchTripsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Buscar viajes</Text>
      <Text style={styles.subtitle}>Encuentra viajes compartidos cerca de ti</Text>

      <View style={styles.searchSection}>
        <Text style={styles.label}>Destino</Text>
        <TextInput style={styles.input} placeholder="¿A dónde vas?" />
      </View>

      <FlatList
        data={MOCK_TRIPS}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.origen} → {item.destino}</Text>
            <Text style={styles.cardDetail}>Sale a las {item.horario}</Text>
          </View>
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: '#F3F4F6',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#4B5563',
    marginBottom: 24,
  },
  searchSection: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  listContent: {
    gap: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  cardDetail: {
    fontSize: 14,
    color: '#6B7280',
  },
});

