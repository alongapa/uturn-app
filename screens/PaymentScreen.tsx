import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function PaymentScreen() {
  const { price, destination } = useLocalSearchParams<{ price?: string; destination?: string }>();

  const handleConfirm = () => {
    Alert.alert('Reserva confirmada. ¡Buen viaje!');
    router.replace('/(tabs)/index');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Resumen de pago</Text>
      <Text style={styles.detailLabel}>Destino</Text>
      <Text style={styles.detailValue}>{destination ?? 'Destino no especificado'}</Text>
      <Text style={styles.detailLabel}>Total a pagar</Text>
      <Text style={styles.amount}>${price ?? '0'}</Text>

      <TouchableOpacity style={styles.button} onPress={handleConfirm}>
        <Text style={styles.buttonText}>Confirmar reserva</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 24,
    color: '#0f172a',
  },
  detailLabel: {
    fontSize: 14,
    color: '#475569',
    marginTop: 12,
  },
  detailValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
  },
  amount: {
    fontSize: 32,
    fontWeight: '800',
    marginVertical: 16,
    color: '#1d4ed8',
  },
  button: {
    marginTop: 24,
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
