import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Modal, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { useUser } from '@/contexts/UserContext';
import { getProfileRow } from '@/services/api/profiles';
import { buildLiveShareUrl, startTripShare, stopTripShare, triggerSos, updateTripShareLocation } from '@/services/api/safety';
import { getTripDriverAndVehicle, type TripDriverAndVehicle } from '@/services/api/trips';
import { getCurrentPosition, watchPosition } from '@/services/location';

type Props = {
  tripId: string;
};

const LOCATION_UPDATE_MS = 15000;

/**
 * Seguridad en viaje (Sesión 9): datos del conductor/vehículo siempre
 * visibles, compartir viaje en vivo con un contacto de confianza (link +
 * posición, se actualiza sola mientras está activo) y botón SOS. Reutiliza
 * services/location.ts para la posición del dispositivo.
 */
export function TripSafetyPanel({ tripId }: Props) {
  const { user } = useUser();
  const [vehicle, setVehicle] = useState<TripDriverAndVehicle | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [starting, setStarting] = useState(false);
  const [sosSending, setSosSending] = useState(false);
  const watchRef = useRef<{ remove: () => void } | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCoordsRef = useRef<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    getTripDriverAndVehicle(tripId).then(setVehicle).catch(() => undefined);
  }, [tripId]);

  useEffect(() => {
    if (!user?.id) return;
    getProfileRow(user.id)
      .then((row) => {
        if (row?.emergency_contact_name) setContactName(row.emergency_contact_name);
        if (row?.emergency_contact_phone) setContactPhone(row.emergency_contact_phone);
      })
      .catch(() => undefined);
  }, [user?.id]);

  const stopSharing = useCallback(async () => {
    watchRef.current?.remove();
    watchRef.current = null;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setSharing(false);
    try {
      await stopTripShare(tripId);
    } catch {
      // Ya no hay compartir activo o falló la red; el estado local ya se limpió.
    }
  }, [tripId]);

  useEffect(() => () => {
    watchRef.current?.remove();
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  const handleStartShare = async () => {
    if (!contactName.trim() || !contactPhone.trim()) {
      Alert.alert('Falta el contacto', 'Ingresa nombre y teléfono de tu contacto de confianza.');
      return;
    }
    setStarting(true);
    try {
      const share = await startTripShare(tripId, contactName.trim(), contactPhone.trim());
      const url = buildLiveShareUrl(share.share_token);
      const sub = await watchPosition((coords) => {
        lastCoordsRef.current = coords;
      });
      watchRef.current = sub;
      intervalRef.current = setInterval(() => {
        const coords = lastCoordsRef.current;
        if (coords) updateTripShareLocation(tripId, coords.latitude, coords.longitude).catch(() => undefined);
      }, LOCATION_UPDATE_MS);

      setSharing(true);
      setShareModalVisible(false);
      try {
        await Share.share({
          message:
            `Voy en un viaje de Unities. Puedes seguir mi ubicación en vivo aquí: ${url}\n` +
            `Conductor: ${vehicle?.driverName ?? 'Unities'}${vehicle?.vehiclePlate ? ` · Patente ${vehicle.vehiclePlate}` : ''}`,
        });
      } catch {
        Alert.alert('Compartiendo viaje', `Envía este link a tu contacto: ${url}`);
      }
    } catch (err) {
      Alert.alert('No se pudo compartir el viaje', err instanceof Error ? err.message : 'Intenta de nuevo.');
    } finally {
      setStarting(false);
    }
  };

  const handleSos = () => {
    Alert.alert(
      '¿Activar SOS?',
      'Se avisará de inmediato al equipo Unities y, si tienes un contacto de emergencia configurado, se preparará un aviso con tu ubicación.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Activar SOS',
          style: 'destructive',
          onPress: async () => {
            setSosSending(true);
            try {
              const position = await getCurrentPosition();
              const lat = position?.coords.latitude ?? null;
              const lng = position?.coords.longitude ?? null;
              await triggerSos(tripId, lat, lng);

              if (contactPhone.trim()) {
                const mapsUrl = lat != null && lng != null ? `https://maps.google.com/?q=${lat},${lng}` : '';
                const smsBody = encodeURIComponent(`Necesito ayuda en mi viaje de Unities. Mi ubicación: ${mapsUrl}`);
                Alert.alert('SOS enviado', 'El equipo Unities fue notificado.', [
                  { text: 'Listo' },
                  {
                    text: 'Avisar a mi contacto (SMS)',
                    onPress: () => Linking.openURL(`sms:${contactPhone}?body=${smsBody}`).catch(() => undefined),
                  },
                  {
                    text: 'Llamar a mi contacto',
                    onPress: () => Linking.openURL(`tel:${contactPhone}`).catch(() => undefined),
                  },
                ]);
              } else {
                Alert.alert('SOS enviado', 'El equipo Unities fue notificado de inmediato.');
              }
            } catch (err) {
              Alert.alert('No se pudo enviar el SOS', err instanceof Error ? err.message : 'Intenta de nuevo.');
            } finally {
              setSosSending(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {vehicle && (
        <View style={styles.vehicleCard}>
          <View style={styles.vehicleRow}>
            <Ionicons name="person-circle-outline" size={20} color="#0f172a" />
            <Text style={styles.vehicleText}>
              {vehicle.driverName} · ★ {vehicle.driverRating.toFixed(1)}
              {vehicle.credentialVerified ? ' · Credencial verificada' : ''}
            </Text>
          </View>
          {(vehicle.vehicleBrand || vehicle.vehiclePlate) && (
            <View style={styles.vehicleRow}>
              <Ionicons name="car-outline" size={20} color="#0f172a" />
              <Text style={styles.vehicleText}>
                {[vehicle.vehicleBrand, vehicle.vehicleModel, vehicle.vehicleColor].filter(Boolean).join(' ')}
                {vehicle.vehiclePlate ? ` · Patente ${vehicle.vehiclePlate}` : ''}
              </Text>
            </View>
          )}
        </View>
      )}

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.shareButton, sharing && styles.shareButtonActive]}
          onPress={() => (sharing ? stopSharing() : setShareModalVisible(true))}
        >
          <Ionicons name="location-outline" size={16} color={sharing ? '#ffffff' : '#2563eb'} />
          <Text style={[styles.shareButtonText, sharing && styles.shareButtonTextActive]}>
            {sharing ? 'Dejar de compartir' : 'Compartir viaje en vivo'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.sosButton} onPress={handleSos} disabled={sosSending}>
          <Text style={styles.sosButtonText}>{sosSending ? '…' : 'SOS'}</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={shareModalVisible} transparent animationType="fade" onRequestClose={() => setShareModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Contacto de confianza</Text>
            <Text style={styles.modalSubtitle}>Le enviaremos un link para seguir tu viaje en vivo.</Text>
            <TextInput
              style={styles.input}
              placeholder="Nombre"
              value={contactName}
              onChangeText={setContactName}
            />
            <TextInput
              style={styles.input}
              placeholder="Teléfono (+56 9 ...)"
              value={contactPhone}
              onChangeText={setContactPhone}
              keyboardType="phone-pad"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShareModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={handleStartShare} disabled={starting}>
                <Text style={styles.modalConfirmText}>{starting ? 'Iniciando…' : 'Compartir'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  vehicleCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    gap: 6,
  },
  vehicleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  vehicleText: { color: '#0f172a', fontWeight: '600', fontSize: 13, flexShrink: 1 },
  actionsRow: { flexDirection: 'row', gap: 10 },
  shareButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 12,
  },
  shareButtonActive: { backgroundColor: '#2563eb' },
  shareButtonText: { color: '#2563eb', fontWeight: '700', fontSize: 13 },
  shareButtonTextActive: { color: '#ffffff' },
  sosButton: {
    backgroundColor: '#dc2626',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosButtonText: { color: '#ffffff', fontWeight: '800', fontSize: 15 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#ffffff', borderRadius: 16, padding: 20, gap: 10, width: '100%' },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  modalSubtitle: { color: '#64748b', fontSize: 13, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0f172a',
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  modalCancel: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: '#cbd5e1', paddingVertical: 12, alignItems: 'center' },
  modalCancelText: { color: '#0f172a', fontWeight: '700' },
  modalConfirm: { flex: 1, borderRadius: 10, backgroundColor: '#2563eb', paddingVertical: 12, alignItems: 'center' },
  modalConfirmText: { color: '#ffffff', fontWeight: '800' },
});
