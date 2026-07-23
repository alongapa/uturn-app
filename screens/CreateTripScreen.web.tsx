import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function CreateTripScreenWeb() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Publicar un viaje no está disponible en la web.</Text>
      <Text style={styles.body}>
        Elegir el punto de encuentro y trazar la ruta requiere el mapa nativo. Abre la app móvil (Expo
        Go o el build de Unities) para publicar un viaje.
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
