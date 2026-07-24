import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ReportSheet } from '@/components/safety/report-sheet';
import { startDm } from '@/services/api/messages';
import { useAppState } from '@/store/appState';

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { trips, canUserBookOrCancel, currentUser } = useAppState();
  const [openingChat, setOpeningChat] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);

  const trip = useMemo(() => trips.find((t) => t.id === id), [trips, id]);
  const isOwnTrip = currentUser?.id === trip?.driverId;

  // Chat con el conductor para coordinar el viaje (Sesión 6). El DM se crea
  // en el servidor (start_dm) y la conversación es privada por RLS.
  const handleMessageDriver = () => {
    if (!trip || openingChat) return;
    setOpeningChat(true);
    startDm(trip.driverId)
      .then((conversation) =>
        router.push({ pathname: '/chat/[id]', params: { id: conversation.id } })
      )
      .catch((err) => Alert.alert(err?.message ?? 'No se pudo abrir el chat con el conductor.'))
      .finally(() => setOpeningChat(false));
  };

  const handleReserve = () => {
    const check = canUserBookOrCancel(currentUser, new Date());
    if (!check.allowed) {
      Alert.alert(check.reason ?? 'No puedes reservar en este momento');
      return;
    }

    if (!trip) return;

    Alert.alert('¿Seguro que deseas reservar?', 'Confirmarás tu cupo en este viaje.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Confirmar',
        onPress: () =>
          router.push({
            pathname: '/payment',
            params: { price: trip.precioCLP.toString(), destination: trip.destinoCampus, tripId: trip.id },
          }),
      },
    ]);
  };

  if (!trip) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.card}>
          <Text style={styles.title}>Viaje no encontrado</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.title}>{trip.origenCampus} → {trip.destinoCampus}</Text>
          <Text style={styles.meta}>Punto de encuentro: {trip.puntoEncuentroId}</Text>
          <Text style={styles.meta}>Salida: {new Date(trip.horaSalida).toLocaleString('es-CL')}</Text>
          <Text style={styles.price}>${trip.precioCLP}</Text>
          <Text style={styles.meta}>Asientos disponibles: {trip.asientosDisponibles}</Text>
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => router.push({ pathname: '/map', params: { tripId: trip.id } })}
            >
              <Text style={styles.secondaryText}>Ver en mapa</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryButton} onPress={handleReserve}>
              <Text style={styles.primaryText}>Reservar</Text>
            </TouchableOpacity>
          </View>
          {currentUser?.id !== trip.driverId && (
            <TouchableOpacity
              style={styles.chatButton}
              onPress={handleMessageDriver}
              disabled={openingChat}
            >
              <Text style={styles.chatText}>
                {openingChat ? 'Abriendo chat…' : '💬 Mensaje al conductor'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {!isOwnTrip && (
          <TouchableOpacity style={styles.reportLink} onPress={() => setReportVisible(true)}>
            <Text style={styles.reportLinkText}>Reportar este viaje o al conductor</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <ReportSheet
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
        targetType="viaje"
        targetId={trip.id}
        targetUserId={trip.driverId}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    padding: 20,
    gap: 12,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  reportLink: { alignItems: 'center', paddingVertical: 8 },
  reportLinkText: { color: '#b45309', fontWeight: '600', fontSize: 13 },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
  },
  meta: {
    color: '#475569',
  },
  price: {
    fontSize: 28,
    fontWeight: '800',
    color: '#2563eb',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryText: {
    color: '#0f172a',
    fontWeight: '700',
  },
  chatButton: {
    marginTop: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
    paddingVertical: 12,
    alignItems: 'center',
  },
  chatText: {
    color: '#2563eb',
    fontWeight: '700',
  },
});
