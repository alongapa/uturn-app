import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAppState } from '@/store/appState';

export default function DriverRoutesMapScreenWeb() {
  const { trips, currentUser } = useAppState();
  const hasTrips = trips.some((trip) => trip.driverId === currentUser?.id);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>El mapa de rutas no está disponible en la web.</Text>
      <Text style={styles.body}>
        {hasTrips
          ? 'Abre la app móvil para ver y gestionar tus rutas en el mapa.'
          : 'No tienes rutas publicadas todavía.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#f8fafc',
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    color: '#334155',
    textAlign: 'center',
  },
});
