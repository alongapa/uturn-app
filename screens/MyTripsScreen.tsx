import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { router } from 'expo-router';

import { useAppState } from '@/store/appState';

export default function MyTripsScreen() {
  const { bookings, trips, currentUser, cancelBooking, canUserBookOrCancel } = useAppState();
  const [ratingComment, setRatingComment] = useState('');
  const [ratingScore, setRatingScore] = useState(5);
  const [ratingVisible, setRatingVisible] = useState(false);

  const combinedTrips = useMemo(() => {
    const asPassenger = bookings
      .map((booking) => {
        const trip = trips.find((t) => t.id === booking.tripId);
        if (!trip) return null;
        return {
          id: booking.id,
          tripId: trip.id,
          role: 'Pasajero' as const,
          route: `${trip.origenCampus} → ${trip.destinoCampus}`,
          date: new Date(trip.horaSalida),
          estado: booking.estado,
        };
      })
      .filter(Boolean) as TripItem[];

    const asDriver = trips
      .filter((trip) => trip.driverId === currentUser?.id)
      .map((trip) => ({
        id: trip.id,
        tripId: trip.id,
        role: 'Conductor' as const,
        route: `${trip.origenCampus} → ${trip.destinoCampus}`,
        date: new Date(trip.horaSalida),
        estado: 'publicado' as const,
      }));

    return [...asPassenger, ...asDriver].sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [bookings, currentUser?.id, trips]);

  const now = new Date();
  const upcoming = combinedTrips.filter((t) => t.date.getTime() >= now.getTime());
  const past = combinedTrips.filter((t) => t.date.getTime() < now.getTime());

  const handleCancel = (bookingId: string) => {
    const canProceed = canUserBookOrCancel(currentUser, new Date());
    if (!canProceed.allowed) {
      Alert.alert(canProceed.reason ?? 'No puedes cancelar en este momento');
      return;
    }

    const result = cancelBooking(bookingId, new Date());
    if (!result.success && result.reason) {
      Alert.alert(result.reason);
    } else {
      Alert.alert(result.reason ?? 'Reserva cancelada');
    }
  };

  const openRating = () => {
    setRatingVisible(true);
  };

  const submitRating = () => {
    setRatingVisible(false);
    setRatingComment('');
    setRatingScore(5);
    Alert.alert('¡Gracias por valorar!');
  };

  const renderItem = ({ item }: { item: TripItem }) => (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.route}>{item.route}</Text>
        <Text style={styles.role}>{item.role}</Text>
      </View>
      <Text style={styles.meta}>{item.date.toLocaleString('es-CL')}</Text>
      <Text style={styles.meta}>Estado: {item.estado}</Text>
      <View style={styles.actionsRow}>
        {item.date > now ? (
          <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push(`/trip/${item.tripId}`)}>
            <Text style={styles.secondaryText}>Ver detalles</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.primaryButton} onPress={openRating}>
            <Text style={styles.primaryText}>Valorar</Text>
          </TouchableOpacity>
        )}
        {item.role === 'Pasajero' && item.date > now && (
          <TouchableOpacity style={styles.secondaryButton} onPress={() => handleCancel(item.id)}>
            <Text style={styles.secondaryText}>Cancelar</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mis viajes</Text>
      <Text style={styles.sectionTitle}>Próximos viajes</Text>
      <FlatList
        data={upcoming}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No tienes viajes próximos.</Text>}
      />

      <Text style={styles.sectionTitle}>Viajes pasados</Text>
      <FlatList
        data={past}
        keyExtractor={(item) => `${item.id}-past`}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>Aún no tienes viajes completados.</Text>}
      />

      <Modal visible={ratingVisible} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Valorar viaje</Text>
            <TextInput
              style={styles.input}
              value={ratingComment}
              onChangeText={setRatingComment}
              placeholder="Comentario"
            />
            <TextInput
              style={styles.input}
              value={ratingScore.toString()}
              onChangeText={(v) => setRatingScore(Number(v) || 5)}
              placeholder="Puntuación 1-5"
              keyboardType="numeric"
            />
            <TouchableOpacity style={styles.primaryButton} onPress={submitRating}>
              <Text style={styles.primaryText}>Guardar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => setRatingVisible(false)}>
              <Text style={styles.secondaryText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

type TripItem = {
  id: string;
  tripId: string;
  role: 'Conductor' | 'Pasajero';
  route: string;
  date: Date;
  estado: string;
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff', padding: 16 },
  title: { fontSize: 24, fontWeight: '800', color: '#0f172a', marginBottom: 12, textAlign: 'center' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginTop: 12, marginBottom: 8 },
  list: { gap: 12 },
  card: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 8,
  },
  route: { fontSize: 16, fontWeight: '700', color: '#0f172a', flex: 1, marginRight: 8 },
  role: { color: '#2563eb', fontWeight: '700' },
  meta: { color: '#475569', marginTop: 4 },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  secondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  secondaryText: { color: '#0f172a', fontWeight: '700', textAlign: 'center' },
  primaryButton: { backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 },
  primaryText: { color: '#fff', fontWeight: '700', textAlign: 'center' },
  empty: { color: '#475569', marginBottom: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalCard: {
    width: '85%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#fff',
  },
});
