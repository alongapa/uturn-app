import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { TRIP_TIMELINE, UPCOMING_TRIP } from '@/constants/mock-data';
import { useUser } from '@/contexts/UserContext';
import { registerLateCancellation } from '@/services/penalties';

const AMENITIES = ['Pago compartido', 'Wi-Fi', 'Parada flexible', 'Carga USB'];

export default function TripDetailScreen() {
  const [activeStep, setActiveStep] = useState(TRIP_TIMELINE[0].id);
  const focusedStep = useMemo(() => TRIP_TIMELINE.find((step) => step.id === activeStep), [activeStep]);
  const { user, updateUser } = useUser();

  const handleOpenMap = () => {
    router.push({
      pathname: '/meeting-point-map',
      params: { meetingPointId: UPCOMING_TRIP.meetingPointId },
    });
  };

  const handleCancelBooking = () => {
    if (!user) {
      Alert.alert('Inicia sesión', 'Debes iniciar sesión para gestionar tus reservas.');
      return;
    }

    const now = new Date();
    const isLate = isLateCancellation(UPCOMING_TRIP.departAt, now);

    if (!isLate) {
      Alert.alert('Reserva cancelada', 'Cancelaste a tiempo, no se registraron penalizaciones.');
      return;
    }

    const updatedUser = registerLateCancellation(user, now);
    updateUser({ penaltyState: updatedUser.penaltyState });
    const lateCount = updatedUser.penaltyState?.lateCancellationsCount ?? 0;
    const nextThreshold = getNextThreshold(lateCount);
    const statusMessage = nextThreshold
      ? `Tienes ${lateCount} cancelaciones tardías de ${nextThreshold} antes del próximo bloqueo.`
      : `Tienes ${lateCount} cancelaciones tardías registradas.`;
    const blockInfo = updatedUser.penaltyState?.currentBlockUntil
      ? `Bloqueo activo hasta ${new Date(updatedUser.penaltyState.currentBlockUntil).toLocaleString('es-CL', {
          dateStyle: 'long',
          timeStyle: 'short',
        })}.`
      : '';

    const alertLines = blockInfo ? [statusMessage, blockInfo] : [statusMessage];

    Alert.alert('Cancelación tardía registrada', alertLines.join('\n'));
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Detalle del viaje</Text>
        <Text style={styles.subtitle}>Revisa la ruta, condiciones y servicios confirmados.</Text>

        <View style={styles.infoCard}>
          <View style={styles.row}>
            <Text style={styles.label}>Conductora</Text>
            <Text style={styles.value}>{UPCOMING_TRIP.driverName}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Encuentro</Text>
            <Text style={styles.value}>{UPCOMING_TRIP.meetPoint}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Destino</Text>
            <Text style={styles.value}>{UPCOMING_TRIP.dest}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Salida</Text>
            <Text style={styles.value}>
              {new Date(UPCOMING_TRIP.departAt).toLocaleString('es-CL', {
                hour: '2-digit',
                minute: '2-digit',
                weekday: 'long',
              })}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Tarifa</Text>
            <Text style={styles.value}>${UPCOMING_TRIP.price}</Text>
          </View>
        </View>

        <View style={styles.timelineCard}>
          <Text style={styles.sectionTitle}>Ruta planificada</Text>
          {TRIP_TIMELINE.map((step, index) => (
            <TouchableOpacity
              key={step.id}
              style={[styles.timelineRow, activeStep === step.id && styles.timelineRowActive]}
              onPress={() => setActiveStep(step.id)}
            >
              <View style={styles.timelineLeft}>
                <View style={[styles.timelineDot, index === 0 && styles.timelineDotActive]} />
                {index < TRIP_TIMELINE.length - 1 && <View style={styles.timelineConnector} />}
              </View>
              <View style={styles.timelineBody}>
                <Text style={styles.timelineTitle}>{step.title}</Text>
                <Text style={styles.timelineDetail}>{step.detail}</Text>
              </View>
              <Text style={styles.timelineTime}>{step.time}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {focusedStep && (
          <View style={styles.focusCard}>
            <Text style={styles.focusLabel}>Paso seleccionado</Text>
            <Text style={styles.focusTitle}>{focusedStep.title}</Text>
            <Text style={styles.focusDescription}>{focusedStep.detail}</Text>
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Notificar llegada</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryButtonSecondary}>
                <Text style={styles.primaryButtonText}>Compartir ubicación</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Servicios incluidos</Text>
          <View style={styles.badgeRow}>
            {AMENITIES.map((item) => (
              <View key={item} style={styles.badge}>
                <Text style={styles.badgeText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        <TouchableOpacity style={styles.mapButton} onPress={handleOpenMap}>
          <Text style={styles.primaryButtonText}>Ver punto de encuentro en el mapa</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.dangerButton} onPress={handleCancelBooking}>
          <Text style={styles.dangerButtonText}>Cancelar reserva</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Confirmar participación</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#020617',
  },
  content: {
    padding: 24,
    gap: 24,
  },
  title: {
    color: '#f8fafc',
    fontSize: 26,
    fontWeight: '700',
  },
  subtitle: {
    color: '#94a3b8',
  },
  infoCard: {
    backgroundColor: '#0f172a',
    borderRadius: 18,
    padding: 18,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    color: '#94a3b8',
  },
  value: {
    color: '#f8fafc',
    fontWeight: '600',
    maxWidth: '60%',
    textAlign: 'right',
  },
  timelineCard: {
    backgroundColor: '#0f172a',
    borderRadius: 18,
    padding: 18,
    gap: 16,
  },
  sectionTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  timelineRowActive: {
    backgroundColor: 'rgba(56,189,248,0.08)',
  },
  timelineLeft: {
    alignItems: 'center',
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#475569',
  },
  timelineDotActive: {
    backgroundColor: '#38bdf8',
  },
  timelineConnector: {
    width: 2,
    backgroundColor: '#1e293b',
    flex: 1,
    marginTop: 2,
  },
  timelineBody: {
    flex: 1,
    gap: 4,
  },
  timelineTitle: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  timelineDetail: {
    color: '#94a3b8',
  },
  timelineTime: {
    color: '#cbd5f5',
    fontWeight: '600',
  },
  sectionCard: {
    backgroundColor: '#0f172a',
    borderRadius: 18,
    padding: 18,
    gap: 12,
  },
  focusCard: {
    backgroundColor: '#0f172a',
    borderRadius: 18,
    padding: 18,
    gap: 8,
  },
  focusLabel: {
    color: '#94a3b8',
    textTransform: 'uppercase',
    fontSize: 12,
  },
  focusTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '700',
  },
  focusDescription: {
    color: '#cbd5f5',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderColor: '#1e293b',
    borderWidth: 1,
  },
  secondaryButtonText: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  primaryButtonSecondary: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#38bdf8',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  badge: {
    backgroundColor: '#1d4ed8',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  badgeText: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#22d3ee',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  dangerButton: {
    backgroundColor: 'rgba(248,113,113,0.15)',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.8)',
  },
  mapButton: {
    backgroundColor: '#38bdf8',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#0f172a',
    fontWeight: '700',
  },
  dangerButtonText: {
    color: '#f87171',
    fontWeight: '700',
  },
});

const PEAK_START_HOUR = 8;
const PEAK_END_HOUR = 10;

const isLateCancellation = (arrivalIso: string, now: Date) => {
  const arrivalDate = new Date(arrivalIso);
  const hourValue = arrivalDate.getHours() + arrivalDate.getMinutes() / 60;
  const isPeak = hourValue >= PEAK_START_HOUR && hourValue <= PEAK_END_HOUR;
  const allowedHours = isPeak ? 12 : 2;
  const diffHours = (arrivalDate.getTime() - now.getTime()) / (1000 * 60 * 60);
  return diffHours < allowedHours;
};

const getNextThreshold = (count: number) => {
  const thresholds = [3, 6, 9];
  return thresholds.find((threshold) => count < threshold) ?? null;
};
