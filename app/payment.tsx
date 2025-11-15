import React, { useCallback } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { startWebCheckout } from '@/services/payment-web';

export default function PaymentScreen() {
  const { amount = '0', paymentUrl = 'https://www.google.com' } = useLocalSearchParams<{
    amount?: string;
    paymentUrl?: string;
  }>();

  const handlePay = useCallback(() => {
    startWebCheckout(paymentUrl); // Dispara el checkout web con la URL recibida en la navegación
  }, [paymentUrl]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pago del viaje</Text>
      <Text style={styles.amountLabel}>Total a pagar</Text>
      <Text style={styles.amount}>${amount}</Text>

      <TouchableOpacity style={styles.payButton} onPress={handlePay}>
        <Text style={styles.payButtonText}>Pagar ahora</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 24,
    color: '#1F2937',
  },
  amountLabel: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 8,
  },
  amount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 32,
  },
  payButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  payButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
