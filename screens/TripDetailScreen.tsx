import React, { useCallback, useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { router, useLocalSearchParams } from 'expo-router';

// Representa un viaje básico que llega desde la navegación o props del componente
export type Trip = {
  id: string;
  origin: string;
  destination: string;
  departureTime?: string;
  price: number;
  driverName?: string;
};

interface TripDetailScreenProps {
  trip?: Trip;
}

export default function TripDetailScreen({ trip }: TripDetailScreenProps) {
  const params = useLocalSearchParams<{
    id?: string;
    origin?: string;
    destination?: string;
    price?: string;
    departureTime?: string;
    driverName?: string;
  }>();

  const currentTrip = useMemo<Trip>(() => {
    if (trip) {
      return trip; // Usa los datos entregados explícitamente por la pantalla anterior
    }

    // Ensambla un viaje a partir de los parámetros recibidos por la navegación
    return {
      id: params.id ?? 'sin-id',
      origin: params.origin ?? 'Origen no disponible',
      destination: params.destination ?? 'Destino no disponible',
      departureTime: params.departureTime,
      price: Number(params.price ?? 0),
      driverName: params.driverName,
    };
  }, [params, trip]);

  const normalizedPrice = Number.isFinite(currentTrip.price) ? currentTrip.price : 0; // Asegura un número válido para mostrar

  const handleReserve = useCallback(() => {
    console.log('Reserva confirmada para el viaje', currentTrip.id); // Mock simple de reserva

    router.push({
      pathname: '/payment',
      params: {
        amount: String(normalizedPrice),
        paymentUrl: 'https://www.google.com',
      },
    }); // Redirige a la pantalla de pago con la información necesaria
  }, [currentTrip.id, normalizedPrice]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{currentTrip.origin} → {currentTrip.destination}</Text>
      {currentTrip.departureTime ? (
        <Text style={styles.detail}>Sale a las {currentTrip.departureTime}</Text>
      ) : null}
      {currentTrip.driverName ? (
        <Text style={styles.detail}>Conductor: {currentTrip.driverName}</Text>
      ) : null}
      <Text style={styles.price}>Precio: ${normalizedPrice.toFixed(0)}</Text>

      <TouchableOpacity style={styles.reserveButton} onPress={handleReserve}>
        <Text style={styles.reserveButtonText}>Reservar asiento</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 12,
    textAlign: 'center',
  },
  detail: {
    fontSize: 16,
    color: '#4B5563',
    marginBottom: 8,
    textAlign: 'center',
  },
  price: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 24,
    textAlign: 'center',
  },
  reserveButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  reserveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
