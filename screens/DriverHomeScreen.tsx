import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { router } from 'expo-router';

export default function DriverHomeScreen() {
  const options = [
    { title: 'Crear viaje', description: 'Publica un nuevo viaje para tus pasajeros', path: '/driver/create-trip' },
    { title: 'Gestionar pasajeros', description: 'Confirma, cancela o reporta pasajeros', path: '/driver/manage-passengers' },
    { title: 'Ver rutas en mapa', description: 'Visualiza tus rutas y puntos de encuentro', path: '/driver/routes-map' },
  ];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Panel de Conductor</Text>
      <Text style={styles.subtitle}>Gestiona tus viajes y pasajeros desde aquí.</Text>
      <View style={styles.grid}>
        {options.map((option) => (
          <TouchableOpacity key={option.title} style={styles.card} onPress={() => router.push(option.path)}>
            <Text style={styles.cardTitle}>{option.title}</Text>
            <Text style={styles.cardText}>{option.description}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  subtitle: { color: '#475569', marginBottom: 8 },
  grid: { gap: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  cardText: { color: '#475569', marginTop: 6 },
});
