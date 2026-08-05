import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { PlaceAutocomplete } from '@/components/PlaceAutocomplete';
import { CAMPUSES, type CampusId } from '@/constants/campuses';
import { PLACES, resolveNearestPlace } from '@/constants/places';
import { geocodeAddress, reverseGeocode, type Coordinates } from '@/services/location';
import { useAppState } from '@/store/appState';

const OFFICIAL_ADDRESSES: Record<CampusId, string | undefined> = {
  'udd-las-condes': 'Avenida Plaza 680, Las Condes',
  'uandes-san-carlos': 'Av. Mons. Álvaro del Portillo 12455, Las Condes',
  'uai-penalolen': 'Diagonal Las Torres 2640, Peñalolén',
  'udd-concepcion': 'Ainavillo 456, Concepción',
};

const CAMPUS_OPTIONS = CAMPUSES.filter((campus) => campus.city === 'Santiago');

const HOTSPOTS = PLACES.filter((place) => place.type === 'hotspot');

type TimeOption = { label: string; value: string };

const buildDepartureISO = (time: string) => {
  const [hour, minute] = time.split(':').map(Number);
  const date = new Date();
  date.setHours(hour ?? 0, minute ?? 0, 0, 0);
  return date.toISOString();
};

export default function CreateTripScreen() {
  const { addTrip, currentUser, pushNotification } = useAppState();
  const [originAddress, setOriginAddress] = useState('Diagonal Las Torres 2640, Peñalolén');
  const [originCoords, setOriginCoords] = useState<Coordinates | null>(null);
  const [destinationCampus, setDestinationCampus] = useState<CampusId | null>('udd-las-condes');
  const [meetingPointLabel, setMeetingPointLabel] = useState<string>('');
  const [meetingPointCoords, setMeetingPointCoords] = useState<Coordinates | null>(null);
  const [horaSalida, setHoraSalida] = useState('08:00');
  const [precioCLP, setPrecioCLP] = useState('2500');
  const [asientosDisponibles, setAsientosDisponibles] = useState('3');
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [validatingOrigin, setValidatingOrigin] = useState(false);
  const [pickingMeetingPoint, setPickingMeetingPoint] = useState(false);

  const selectedCampus = useMemo(
    () => CAMPUS_OPTIONS.find((campus) => campus.id === destinationCampus) ?? null,
    [destinationCampus]
  );

  useEffect(() => {
    setMeetingPointCoords(null);
    setMeetingPointLabel('');
  }, [destinationCampus]);

  const routePreview = useMemo(() => {
    if (!originCoords || !selectedCampus) return [];
    const points = [originCoords];
    if (meetingPointCoords) {
      points.push(meetingPointCoords);
    }
    points.push({ latitude: selectedCampus.latitude, longitude: selectedCampus.longitude });
    return points;
  }, [originCoords, selectedCampus, meetingPointCoords]);

  const mapCenter = originCoords ?? (selectedCampus ? { latitude: selectedCampus.latitude, longitude: selectedCampus.longitude } : null);

  const handleMapPress = async (event: { nativeEvent: { coordinate: Coordinates } }) => {
    if (!pickingMeetingPoint) return;
    const coordinate = event.nativeEvent.coordinate;
    setPickingMeetingPoint(false);

    const nearestPlace = resolveNearestPlace(coordinate, 120);
    if (nearestPlace) {
      setMeetingPointLabel(nearestPlace.name);
      setMeetingPointCoords(nearestPlace.coordinates);
      return;
    }

    setMeetingPointCoords(coordinate);
    setMeetingPointLabel('Resolviendo dirección...');
    try {
      const address = await reverseGeocode(coordinate);
      setMeetingPointLabel(address ?? 'Punto seleccionado en el mapa');
    } catch (error) {
      console.error(error);
      setMeetingPointLabel('Punto seleccionado en el mapa');
    }
  };

  const handleValidateOrigin = async () => {
    if (!originAddress.trim()) {
      Alert.alert('Ingresa la dirección de salida');
      return;
    }
    setValidatingOrigin(true);
    try {
      const results = await geocodeAddress(originAddress);
      if (!results.length) {
        Alert.alert('No pudimos ubicar esa dirección. Intenta ser más específico.');
        return;
      }
      setOriginCoords(results[0].coordinates);
      Alert.alert('Origen listo', results[0].address);
    } catch (error) {
      console.error(error);
      Alert.alert('No se pudo validar la dirección.');
    } finally {
      setValidatingOrigin(false);
    }
  };

  const validateDestinationAddress = () => {
    if (!selectedCampus) return true;
    const expected = OFFICIAL_ADDRESSES[selectedCampus.id as CampusId];
    if (expected && expected !== selectedCampus.address) {
      Alert.alert('Dirección inválida', `El campus seleccionado debe tener la dirección exacta: ${expected}`);
      return false;
    }
    return true;
  };

  const createTrip = () => {
    if (!currentUser) {
      Alert.alert('Inicia sesión para publicar un viaje');
      return;
    }
    if (!originCoords) {
      Alert.alert('Valida tu dirección de salida');
      return;
    }
    if (!selectedCampus) {
      Alert.alert('Selecciona un campus de destino');
      return;
    }
    if (!validateDestinationAddress()) return;

    const trip = addTrip({
      driverId: currentUser.id,
      driverReputation: 4.6,
      origenCampus: originAddress,
      destinoCampus: selectedCampus.name,
      destinoCampusId: selectedCampus.id,
      puntoEncuentroId: meetingPointLabel || undefined,
      horaSalida: buildDepartureISO(horaSalida),
      precioCLP: Number(precioCLP) || 0,
      asientosDisponibles: Number(asientosDisponibles) || 0,
      asientosOcupados: 0,
      coordenadasOrigen: originCoords,
      coordenadasDestino: { latitude: selectedCampus.latitude, longitude: selectedCampus.longitude },
      meetingPointCoords: meetingPointCoords ?? undefined,
    });

    pushNotification({
      message: 'Publicaste un viaje con punto de encuentro propuesto',
      targetUserId: currentUser.id,
      type: 'info',
    });

    router.replace({ pathname: '/trip/[id]', params: { id: trip.id } });
  };

  const handlePublish = () => {
    Alert.alert('Publicar viaje', '¿Quieres publicar este viaje para que pasajeros lo reserven?', [
      { text: 'No, volver', style: 'cancel' },
      { text: 'Sí, publicar', style: 'default', onPress: createTrip },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.subtitle}>Define hora, campus y punto de encuentro (propuesto por ti).</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Dirección de salida</Text>
          <PlaceAutocomplete
            value={originAddress}
            onChangeText={(text) => {
              setOriginAddress(text);
              setOriginCoords(null);
            }}
            onSelectPlace={(place) => {
              setOriginAddress(place.name);
              setOriginCoords(place.coordinates);
            }}
            style={styles.input}
            placeholder="Ej: Avenida Apoquindo 4500"
            autoCapitalize="words"
          />
          <TouchableOpacity style={styles.secondaryButton} onPress={handleValidateOrigin} disabled={validatingOrigin}>
            <Text style={styles.secondaryButtonText}>{validatingOrigin ? 'Validando...' : 'Validar dirección'}</Text>
          </TouchableOpacity>

          <Text style={styles.label}>Destino (campus)</Text>
          <View style={styles.chipRow}>
            {CAMPUS_OPTIONS.map((campus) => (
              <TouchableOpacity
                key={campus.id}
                style={[styles.chip, campus.id === destinationCampus ? styles.chipActive : undefined]}
                onPress={() => setDestinationCampus(campus.id)}
              >
                <Text style={[styles.chipText, campus.id === destinationCampus ? styles.chipTextActive : undefined]}>
                  {campus.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {selectedCampus && <Text style={styles.helperText}>Dirección oficial: {selectedCampus.address}</Text>}

          <Text style={styles.sectionDivider}>Hotspots de puntos de encuentro</Text>
          <Text style={styles.helperText}>El pasajero no elige. Propón tu punto de encuentro.</Text>
          <View style={styles.hotspotsList}>
            {HOTSPOTS.map((spot) => {
              const isSelected = meetingPointLabel === spot.name;
              return (
                <TouchableOpacity
                  key={spot.id}
                  style={[styles.hotspotItem, isSelected && styles.hotspotItemActive]}
                  onPress={() => {
                    setMeetingPointLabel(spot.name);
                    setMeetingPointCoords(spot.coordinates);
                  }}
                >
                  <Text style={[styles.hotspotText, isSelected && styles.hotspotTextActive]}>{spot.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.label}>Punto de encuentro personalizado</Text>
          <PlaceAutocomplete
            value={meetingPointLabel}
            onChangeText={(text) => {
              setMeetingPointLabel(text);
              setMeetingPointCoords(null);
            }}
            onSelectPlace={(place) => {
              setMeetingPointLabel(place.name);
              setMeetingPointCoords(place.coordinates);
            }}
            types={['hotspot', 'meeting-point']}
            style={styles.input}
            placeholder="Ej: Frente a Metro Manquehue, salida norte"
          />

          <Text style={styles.label}>Hora de salida (HH:mm)</Text>
          <TouchableOpacity style={styles.input} onPress={() => setTimePickerVisible(true)}>
            <Text style={styles.timeValue}>{horaSalida} hrs</Text>
          </TouchableOpacity>

          <View style={styles.row}>
            <View style={[styles.half, styles.inputGroup]}>
              <Text style={styles.label}>Precio (CLP)</Text>
              <TextInput value={precioCLP} onChangeText={setPrecioCLP} style={styles.input} keyboardType="number-pad" />
            </View>
            <View style={[styles.half, styles.inputGroup]}>
              <Text style={styles.label}>Asientos</Text>
              <TextInput
                value={asientosDisponibles}
                onChangeText={setAsientosDisponibles}
                style={styles.input}
                keyboardType="number-pad"
              />
            </View>
          </View>
        </View>

        <View style={styles.previewCard}>
          <Text style={styles.previewTitle}>Ruta previa a publicar</Text>
          <TouchableOpacity
            style={[styles.secondaryButton, pickingMeetingPoint && styles.secondaryButtonActive]}
            onPress={() => setPickingMeetingPoint((prev) => !prev)}
            disabled={!mapCenter}
          >
            <Text style={styles.secondaryButtonText}>
              {pickingMeetingPoint ? 'Toca el mapa para elegir el punto de encuentro' : 'Elegir punto de encuentro en el mapa'}
            </Text>
          </TouchableOpacity>
          <View style={styles.previewMap}>
            {mapCenter ? (
              <MapView
                style={styles.miniMap}
                initialRegion={{
                  latitude: mapCenter.latitude,
                  longitude: mapCenter.longitude,
                  latitudeDelta: 0.05,
                  longitudeDelta: 0.05,
                }}
                onPress={handleMapPress}
              >
                {originCoords && <Marker coordinate={originCoords} pinColor="#E11D48" title="Origen" />}
                {meetingPointCoords && <Marker coordinate={meetingPointCoords} pinColor="#16A34A" title="Punto de encuentro" />}
                <Marker
                  coordinate={{
                    latitude: selectedCampus?.latitude ?? mapCenter.latitude,
                    longitude: selectedCampus?.longitude ?? mapCenter.longitude,
                  }}
                  pinColor="#2563EB"
                  title="Destino"
                />
                {routePreview.length >= 2 && <Polyline coordinates={routePreview} strokeColor="#0A1525" strokeWidth={4} />}
              </MapView>
            ) : (
              <Text style={styles.previewHint}>Selecciona un destino para ver el mapa.</Text>
            )}
            <View style={styles.legendRow}>
              <Legend color="#E11D48" label="Origen" />
              <Legend color="#16A34A" label="Encuentro" />
              <Legend color="#2563EB" label="Destino" />
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.primaryButton} onPress={handlePublish}>
          <Text style={styles.primaryButtonText}>Publicar viaje</Text>
        </TouchableOpacity>
      </ScrollView>

      <TimePickerModal
        visible={timePickerVisible}
        onClose={() => setTimePickerVisible(false)}
        onSelect={(value) => {
          setHoraSalida(value);
          setTimePickerVisible(false);
        }}
      />
    </SafeAreaView>
  );
}

function TimePickerModal({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (value: string) => void;
}) {
  const options: TimeOption[] = useMemo(() => {
    const result: TimeOption[] = [];
    for (let hour = 6; hour <= 23; hour += 1) {
      ['00', '15', '30', '45'].forEach((minute) => {
        const label = `${hour.toString().padStart(2, '0')}:${minute}`;
        result.push({ label, value: label });
      });
    }
    return result;
  }, []);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Selecciona hora (Chile)</Text>
          <ScrollView contentContainerStyle={styles.timeList}>
            {options.map((option) => (
              <TouchableOpacity key={option.value} style={styles.timeOption} onPress={() => onSelect(option.value)}>
                <Text style={styles.timeOptionText}>{option.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity style={styles.secondaryButton} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>Cerrar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    padding: 20,
    gap: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#0f172a',
  },
  subtitle: {
    color: '#475569',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 12,
  },
  label: {
    color: '#475569',
    fontWeight: '700',
  },
  helperText: { color: '#475569' },
  sectionDivider: {
    marginTop: 8,
    fontWeight: '800',
    color: '#0f172a',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f8fafc',
    color: '#0f172a',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  half: {
    flex: 1,
  },
  inputGroup: {
    gap: 6,
  },
  primaryButton: {
    backgroundColor: '#0A1525',
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  secondaryButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#0A1525',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#0A1525',
    fontWeight: '700',
  },
  secondaryButtonActive: {
    backgroundColor: '#e6f0ff',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  chipActive: {
    backgroundColor: '#0A1525',
    borderColor: '#0A1525',
  },
  chipText: { color: '#0f172a', fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  hotspotsList: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 6,
  },
  hotspotItem: {
    padding: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  hotspotItemActive: {
    backgroundColor: '#e6f0ff',
  },
  hotspotText: { color: '#0f172a', fontWeight: '600' },
  hotspotTextActive: { color: '#0A1525' },
  timeValue: { color: '#0f172a', fontWeight: '700' },
  previewCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  previewTitle: { fontWeight: '800', color: '#0f172a', fontSize: 16 },
  previewMap: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    backgroundColor: '#f8fafc',
    gap: 8,
  },
  miniMap: { height: 180, borderRadius: 10 },
  previewHint: { color: '#475569' },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendText: { color: '#0f172a', fontWeight: '600' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: '60%',
  },
  modalTitle: { fontWeight: '800', fontSize: 16, color: '#0f172a', marginBottom: 12 },
  timeList: { gap: 8, paddingBottom: 12 },
  timeOption: {
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  timeOptionText: { fontWeight: '700', color: '#0f172a' },
});
