import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { CAMPUSES, UNIVERSITIES } from '@/constants/campuses';
import { BOOKINGS_SUMMARY } from '@/constants/mock-data';
import { useUser } from '@/contexts/UserContext';
import type { Trip } from '@/models/types';

const STATUS_FILTERS = ['todas', 'confirmado', 'pendiente', 'completado'];

const getBookingStatusBackground = (state: string) => {
  if (state === 'confirmado') {
    return 'rgba(34,197,94,0.15)';
  }

  if (state === 'pendiente') {
    return 'rgba(251,191,36,0.15)';
  }

  if (state === 'completado') {
    return 'rgba(96,165,250,0.2)';
  }

  return 'rgba(248,113,113,0.2)';
};

export default function BookingScreen() {
  const [selectedFilter, setSelectedFilter] = useState<string>('todas');
  const [selectedUniversity, setSelectedUniversity] = useState(UNIVERSITIES[0]?.id ?? 'uai');
  const [originCampusId, setOriginCampusId] = useState(CAMPUSES[0]?.id ?? '');
  const [destinationCampusId, setDestinationCampusId] = useState(CAMPUSES[1]?.id ?? '');
  const [meetingPointId, setMeetingPointId] = useState('');
  const [tripDestination, setTripDestination] = useState('');
  const [tripPrice, setTripPrice] = useState('');
  const [tripSeats, setTripSeats] = useState('');
  const [departAt, setDepartAt] = useState('');
  const [createdTrips, setCreatedTrips] = useState<Trip[]>([]);
  const { user } = useUser();

  useEffect(() => {
    const nextOrigin = CAMPUSES.find((campus) => campus.universityId === selectedUniversity);
    if (nextOrigin) {
      setOriginCampusId(nextOrigin.id);
      setDestinationCampusId(nextOrigin.id);
      setMeetingPointId(nextOrigin.meetingPoints[0]?.id ?? '');
    }
  }, [selectedUniversity]);

  useEffect(() => {
    const originCampus = CAMPUSES.find((campus) => campus.id === originCampusId);
    if (originCampus && !originCampus.meetingPoints.find((point) => point.id === meetingPointId)) {
      setMeetingPointId(originCampus.meetingPoints[0]?.id ?? '');
    }
  }, [originCampusId, meetingPointId]);

  const filteredBookings = useMemo(() => {
    if (selectedFilter === 'todas') {
      return BOOKINGS_SUMMARY;
    }

    return BOOKINGS_SUMMARY.filter((booking) => booking.status === selectedFilter);
  }, [selectedFilter]);

  const originCampus = CAMPUSES.find((campus) => campus.id === originCampusId);
  const meetingPointOptions = originCampus?.meetingPoints ?? [];

  const handleCreateTrip = () => {
    if (!user) {
      Alert.alert('Inicia sesión', 'Debes iniciar sesión para publicar un viaje.');
      return;
    }

    const hasVehicleInfo = Boolean(user.vehicle?.brand && user.vehicle?.model && user.vehicle?.year);
    const hasLicense = Boolean(user.driverLicenseNumber);

    if (!hasVehicleInfo || !hasLicense) {
      Alert.alert(
        'Completa tu perfil de conductor',
        'Necesitas registrar tu vehículo y licencia antes de publicar viajes.',
        [
          {
            text: 'Ir al perfil',
            onPress: () => router.push('/profile'),
          },
          { text: 'Cancelar', style: 'cancel' },
        ]
      );
      return;
    }

    if (!tripDestination.trim() || !originCampusId || !destinationCampusId || !meetingPointId) {
      Alert.alert('Faltan datos', 'Completa los campos obligatorios para continuar.');
      return;
    }

    const meetingPoint = meetingPointOptions.find((point) => point.id === meetingPointId);
    const newTrip: Trip = {
      id: `custom-${Date.now()}`,
      driverId: user.id,
      driverName: user.name,
      dest: tripDestination,
      meetPoint: meetingPoint?.name ?? 'Punto coordinado',
      price: Number(tripPrice) || 0,
      seats: Number(tripSeats) || 1,
      departAt: departAt || new Date().toISOString(),
      routeNotes: `Coordinado desde ${originCampus?.name ?? 'campus'}`,
      originCampusId,
      destinationCampusId,
      meetingPointId,
    };

    setCreatedTrips((prev) => [newTrip, ...prev]);
    setTripDestination('');
    setTripPrice('');
    setTripSeats('');
    setDepartAt('');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Gestión de viajes</Text>
        <Text style={styles.subtitle}>Publica nuevas rutas y sigue tus reservas confirmadas.</Text>

        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>Publicar nuevo viaje</Text>
          <Text style={styles.subtitle}>Selecciona universidad, campus y punto de encuentro.</Text>
          <SelectField
            label="Universidad"
            value={selectedUniversity}
            onSelect={setSelectedUniversity}
            options={UNIVERSITIES.map((item) => ({ label: item.name, value: item.id }))}
            placeholder="Selecciona universidad"
          />
          <SelectField
            label="Campus de origen"
            value={originCampusId}
            onSelect={setOriginCampusId}
            options={CAMPUSES.filter((campus) => campus.universityId === selectedUniversity).map((campus) => ({
              label: campus.name,
              value: campus.id,
            }))}
            placeholder="Selecciona campus"
          />
          <SelectField
            label="Campus destino"
            value={destinationCampusId}
            onSelect={setDestinationCampusId}
            options={CAMPUSES.map((campus) => ({ label: campus.name, value: campus.id }))}
            placeholder="Selecciona campus"
          />
          <SelectField
            label="Punto de encuentro"
            value={meetingPointId}
            onSelect={setMeetingPointId}
            options={meetingPointOptions.map((point) => ({ label: point.name, value: point.id }))}
            placeholder="Selecciona punto"
          />
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Destino final</Text>
            <TextInput
              value={tripDestination}
              onChangeText={setTripDestination}
              placeholder="Providencia, Ñuñoa..."
              style={styles.input}
              placeholderTextColor="#94a3b8"
            />
          </View>
          <View style={styles.rowInputs}>
            <View style={styles.rowItem}>
              <Text style={styles.label}>Tarifa (CLP)</Text>
              <TextInput
                value={tripPrice}
                onChangeText={setTripPrice}
                placeholder="2500"
                style={styles.input}
                keyboardType="numeric"
                placeholderTextColor="#94a3b8"
              />
            </View>
            <View style={styles.rowItem}>
              <Text style={styles.label}>Asientos</Text>
              <TextInput
                value={tripSeats}
                onChangeText={setTripSeats}
                placeholder="3"
                style={styles.input}
                keyboardType="numeric"
                placeholderTextColor="#94a3b8"
              />
            </View>
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Salida (ISO)</Text>
            <TextInput
              value={departAt}
              onChangeText={setDepartAt}
              placeholder="2024-10-31T07:45:00-03:00"
              style={styles.input}
              placeholderTextColor="#94a3b8"
            />
          </View>
          <TouchableOpacity style={styles.actionPrimary} onPress={handleCreateTrip}>
            <Text style={styles.actionPrimaryText}>Publicar viaje</Text>
          </TouchableOpacity>
        </View>

        {createdTrips.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Viajes publicados</Text>
            {createdTrips.map((trip) => (
              <View key={trip.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{trip.meetPoint}</Text>
                  <Text style={styles.cardFooterText}>${trip.price}</Text>
                </View>
                <Text style={styles.cardMeta}>→ {trip.dest}</Text>
                <Text style={styles.cardMeta}>
                  {new Date(trip.departAt).toLocaleString('es-CL', {
                    hour: '2-digit',
                    minute: '2-digit',
                    day: '2-digit',
                    month: 'short',
                  })}
                </Text>
                <Text style={styles.cardMeta}>Punto: {trip.meetPoint}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.sectionTitle}>Mis reservas</Text>
        <Text style={styles.subtitle}>Estado en tiempo real y recordatorios automáticos.</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {STATUS_FILTERS.map((filter) => (
            <TouchableOpacity
              key={filter}
              onPress={() => setSelectedFilter(filter)}
              style={[styles.filterChip, selectedFilter === filter && styles.filterChipActive]}
            >
              <Text style={[styles.filterText, selectedFilter === filter && styles.filterTextActive]}>
                {filter === 'todas' ? 'Todas' : filter}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {filteredBookings.map((booking) => (
          <View key={booking.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{booking.title}</Text>
              <View style={[styles.statusPill, { backgroundColor: getBookingStatusBackground(booking.status) }]}>
                <Text style={styles.statusText}>{booking.status}</Text>
              </View>
            </View>
            <Text style={styles.cardMeta}>{booking.driverName}</Text>
            <Text style={styles.cardMeta}>{booking.date}</Text>
            <View style={styles.cardFooter}>
              <Text style={styles.cardFooterText}>Asientos: {booking.seats}</Text>
              <Text style={styles.cardFooterText}>ID #{booking.id}</Text>
            </View>
            <View style={styles.reminderRow}>
              <View>
                <Text style={styles.reminderLabel}>Recordatorio</Text>
                <Text style={styles.reminderValue}>15 minutos antes</Text>
              </View>
              <TouchableOpacity style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Enviar</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.cardActions}>
              <TouchableOpacity style={styles.actionGhost}>
                <Text style={styles.actionGhostText}>Compartir viaje</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionPrimary}>
                <Text style={styles.actionPrimaryText}>Confirmar pago</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

type SelectFieldProps<T extends string> = {
  label: string;
  value: T;
  placeholder: string;
  options: { label: string; value: T }[];
  onSelect: (value: T) => void;
};

function SelectField<T extends string>({ label, value, placeholder, options, onSelect }: SelectFieldProps<T>) {
  const [open, setOpen] = useState(false);
  const selectedLabel = options.find((option) => option.value === value)?.label;

  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity style={styles.input} onPress={() => setOpen((prev) => !prev)}>
        <Text style={selectedLabel ? styles.inputValue : styles.placeholderText}>
          {selectedLabel ?? placeholder}
        </Text>
      </TouchableOpacity>
      {open && (
        <View style={styles.dropdown}>
          {options.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={styles.dropdownOption}
              onPress={() => {
                onSelect(option.value);
                setOpen(false);
              }}
            >
              <Text style={styles.dropdownOptionText}>{option.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#020617',
  },
  content: {
    padding: 24,
    gap: 20,
  },
  title: {
    color: '#f8fafc',
    fontSize: 26,
    fontWeight: '700',
  },
  subtitle: {
    color: '#94a3b8',
  },
  label: {
    color: '#cbd5f5',
    fontSize: 13,
  },
  formCard: {
    backgroundColor: '#0f172a',
    borderRadius: 18,
    padding: 18,
    gap: 14,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '600',
  },
  filterRow: {
    gap: 12,
    paddingVertical: 12,
  },
  filterChip: {
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 12,
  },
  filterChipActive: {
    backgroundColor: '#22d3ee',
    borderColor: '#22d3ee',
  },
  filterText: {
    color: '#f8fafc',
    textTransform: 'capitalize',
  },
  filterTextActive: {
    color: '#0f172a',
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 18,
    padding: 18,
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '600',
  },
  statusPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusText: {
    color: '#f8fafc',
    textTransform: 'capitalize',
    fontWeight: '600',
  },
  cardMeta: {
    color: '#94a3b8',
  },
  inputGroup: {
    gap: 6,
  },
  input: {
    backgroundColor: '#020617',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#f8fafc',
  },
  inputValue: {
    color: '#f8fafc',
  },
  placeholderText: {
    color: '#475569',
  },
  dropdown: {
    marginTop: 6,
    backgroundColor: '#020617',
    borderRadius: 12,
    borderColor: '#1e293b',
    borderWidth: 1,
  },
  dropdownOption: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  dropdownOptionText: {
    color: '#f8fafc',
  },
  rowInputs: {
    flexDirection: 'row',
    gap: 12,
  },
  rowItem: {
    flex: 1,
    gap: 6,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  cardFooterText: {
    color: '#cbd5f5',
    fontWeight: '600',
  },
  reminderRow: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#020617',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reminderLabel: {
    color: '#94a3b8',
    fontSize: 12,
  },
  reminderValue: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  secondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    gap: 12,
  },
  actionGhost: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
    paddingVertical: 12,
    alignItems: 'center',
  },
  actionGhostText: {
    color: '#cbd5f5',
    fontWeight: '600',
  },
  actionPrimary: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#38bdf8',
  },
  actionPrimaryText: {
    color: '#0f172a',
    fontWeight: '700',
  },
});
