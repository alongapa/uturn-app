import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
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

import { CAMPUS_LOCATIONS, DRIVER_SPOTLIGHT } from '@/constants/mock-data';
import { useAppState } from '@/store/appState';

const FILTER_TAGS = ['Viajes hoy', 'Mascotas', 'Equipaje', 'Express'];

export default function SearchTripsScreen() {
  const { trips, canUserBookOrCancel, currentUser } = useAppState();
  const [selectedCampus, setSelectedCampus] = useState(CAMPUS_LOCATIONS[0]);
  const [activeFilter, setActiveFilter] = useState<string>('Viajes hoy');
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [puntoEncuentro, setPuntoEncuentro] = useState('');

  const handleReserve = (tripId: string, price: number, destination: string) => {
    const check = canUserBookOrCancel(currentUser, new Date());
    if (!check.allowed) {
      Alert.alert(check.reason ?? 'No puedes reservar en este momento');
      return;
    }

    router.push({
      pathname: '/payment',
      params: { price: price.toString(), destination, tripId },
    });
  };

  const filteredTrips = useMemo(() => {
    return trips.filter((trip) => {
      const matchCampus = selectedCampus ? trip.origenCampus === selectedCampus : true;
      const matchOrigen = origen ? trip.origenCampus.toLowerCase().includes(origen.toLowerCase()) : true;
      const matchDestino = destino ? trip.destinoCampus.toLowerCase().includes(destino.toLowerCase()) : true;
      const matchMeeting = puntoEncuentro
        ? trip.puntoEncuentroId.toLowerCase().includes(puntoEncuentro.toLowerCase())
        : true;

      if (activeFilter === 'Mascotas') {
        return matchCampus && matchOrigen && matchDestino && matchMeeting && trip.puntoEncuentroId.toLowerCase().includes('metro');
      }

      return matchCampus && matchOrigen && matchDestino && matchMeeting;
    });
  }, [trips, selectedCampus, origen, destino, puntoEncuentro, activeFilter]);
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>UTURN commute</Text>
          <Text style={styles.heroTitle}>Coordina tu viaje compartido</Text>
          <Text style={styles.heroSubtitle}>
            Explora conductores disponibles por campus y confirma tu cupo en segundos.
          </Text>
          <View style={styles.heroRow}>
            <View>
              <Text style={styles.heroStatLabel}>Conductores activos</Text>
              <Text style={styles.heroStatValue}>32</Text>
            </View>
            <View>
              <Text style={styles.heroStatLabel}>Cupos libres</Text>
              <Text style={styles.heroStatValue}>74</Text>
            </View>
            <View>
              <Text style={styles.heroStatLabel}>Tiempo promedio</Text>
              <Text style={styles.heroStatValue}>12 min</Text>
            </View>
          </View>
        </View>

        <View style={styles.searchCard}>
          <Text style={styles.sectionTitle}>Buscar viajes</Text>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Origen</Text>
            <TextInput
              placeholder="Campus Peñalolén"
              style={styles.input}
              placeholderTextColor="#94a3b8"
              value={origen}
              onChangeText={setOrigen}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Destino</Text>
            <TextInput
              placeholder="¿Hacia dónde vamos?"
              style={styles.input}
              placeholderTextColor="#94a3b8"
              value={destino}
              onChangeText={setDestino}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Punto de encuentro</Text>
            <TextInput
              placeholder="Metro Grecia"
              style={styles.input}
              placeholderTextColor="#94a3b8"
              value={puntoEncuentro}
              onChangeText={setPuntoEncuentro}
            />
          </View>
          <TouchableOpacity style={styles.primaryButton} onPress={() => setActiveFilter('Viajes hoy')}>
            <Text style={styles.primaryButtonText}>Ver conductores</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push('/create-trip')}>
            <Text style={styles.secondaryButtonText}>Publicar viaje</Text>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagsRow}>
          {FILTER_TAGS.map((tag) => (
            <TouchableOpacity
              key={tag}
              style={[styles.tagChip, activeFilter === tag && styles.tagChipActive]}
              onPress={() => setActiveFilter(tag)}
            >
              <Text style={[styles.tagText, activeFilter === tag && styles.tagTextActive]}>{tag}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Campus disponibles</Text>
          <Text style={styles.sectionDescription}>Selecciona el punto base para filtrar viajes y conductores.</Text>
          <View style={styles.campusGrid}>
            {CAMPUS_LOCATIONS.map((campus) => (
              <TouchableOpacity
                key={campus}
                style={[styles.campusCard, campus === selectedCampus && styles.campusCardActive]}
                onPress={() => setSelectedCampus(campus)}
              >
                <View style={styles.campusBadge}>
                  <Text style={styles.campusBadgeText}>{campus.split(' ')[0]}</Text>
                </View>
                <Text style={styles.campusName}>{campus}</Text>
                <Text style={styles.campusMeta}>
                  {campus === selectedCampus ? 'Seleccionado para coordinación' : 'Ver rutas y cupos'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Viajes recomendados</Text>
            <Text style={styles.sectionAction}>Ver todo</Text>
          </View>
          {filteredTrips.map((trip) => (
            <View key={trip.id} style={styles.tripCard}>
              <View style={styles.tripCardHeader}>
                <Text style={styles.tripTitle}>{trip.puntoEncuentroId}</Text>
                <Text style={styles.tripPrice}>${trip.precioCLP}</Text>
              </View>
              <Text style={styles.tripRoute}>→ {trip.destinoCampus}</Text>
              <View style={styles.tripMeta}>
                <Text style={styles.tripMetaText}>{trip.driverId}</Text>
                <View style={styles.metaDot} />
                <Text style={styles.tripMetaText}>{new Date(trip.horaSalida).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</Text>
                <View style={styles.metaDot} />
                <Text style={styles.tripMetaText}>{trip.asientosDisponibles} asientos</Text>
              </View>
              <View style={styles.tripActions}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => router.push({ pathname: '/trip/[id]', params: { id: trip.id } })}
                >
                  <Text style={styles.secondaryButtonText}>Detalle</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.primaryButtonSmall}
                  onPress={() => handleReserve(trip.id, trip.precioCLP, trip.destinoCampus)}
                >
                  <Text style={styles.primaryButtonText}>Reservar</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Conductores destacados</Text>
            <Text style={styles.sectionAction}>Contactar</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {DRIVER_SPOTLIGHT.map((driver) => (
              <View key={driver.id} style={styles.driverCard}>
                <Text style={styles.driverName}>{driver.name}</Text>
                <Text style={styles.driverCar}>{driver.car}</Text>
                <View style={styles.driverMetaRow}>
                  <Text style={styles.driverMeta}>{driver.completedTrips} viajes</Text>
                  <View style={styles.metaDot} />
                  <Text style={styles.driverMeta}>{driver.rating?.toFixed(1)} ★</Text>
                </View>
                <View style={styles.driverTagRow}>
                  {driver.expertise.map((tag) => (
                    <View key={tag} style={styles.driverTag}>
                      <Text style={styles.driverTagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity style={styles.driverButton}>
                  <Text style={styles.driverButtonText}>Conectar</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  content: {
    paddingBottom: 48,
  },
  hero: {
    paddingTop: 32,
    paddingHorizontal: 24,
    paddingBottom: 24,
    backgroundColor: '#0F172A',
    gap: 12,
  },
  heroKicker: {
    color: '#94a3b8',
    fontSize: 14,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  heroSubtitle: {
    color: '#cbd5f5',
    fontSize: 16,
    lineHeight: 22,
  },
  heroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  heroStatLabel: {
    color: '#94a3b8',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  heroStatValue: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '700',
  },
  searchCard: {
    marginHorizontal: 24,
    marginTop: -32,
    padding: 20,
    borderRadius: 20,
    backgroundColor: '#1F2937',
    gap: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    color: '#cbd5f5',
    fontSize: 13,
  },
  input: {
    backgroundColor: '#111827',
    padding: 14,
    borderRadius: 12,
    color: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  primaryButton: {
    marginTop: 8,
    backgroundColor: '#6366F1',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#F8FAFC',
    fontWeight: '600',
  },
  tagsRow: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    gap: 12,
  },
  tagChip: {
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 12,
  },
  tagText: {
    color: '#E2E8F0',
    fontWeight: '500',
  },
  tagChipActive: {
    backgroundColor: '#38BDF8',
    borderColor: '#38BDF8',
  },
  tagTextActive: {
    color: '#0f172a',
  },
  section: {
    paddingHorizontal: 24,
    marginBottom: 32,
  },
  sectionDescription: {
    color: '#94a3b8',
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionAction: {
    color: '#38BDF8',
    fontSize: 13,
  },
  tripCard: {
    backgroundColor: '#111827',
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    gap: 6,
  },
  tripCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tripTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '600',
  },
  tripPrice: {
    color: '#22d3ee',
    fontWeight: '700',
    fontSize: 16,
  },
  tripRoute: {
    color: '#94a3b8',
    fontSize: 14,
  },
  tripMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tripMetaText: {
    color: '#cbd5f5',
    fontSize: 13,
  },
  metaDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#475569',
  },
  tripNotes: {
    color: '#94a3b8',
    fontSize: 13,
  },
  tripActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  driverCard: {
    backgroundColor: '#111827',
    borderRadius: 18,
    padding: 16,
    marginRight: 16,
    width: 240,
    gap: 8,
  },
  driverName: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '600',
  },
  driverCar: {
    color: '#94a3b8',
  },
  driverMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  driverMeta: {
    color: '#cbd5f5',
    fontSize: 13,
  },
  driverTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  driverTag: {
    backgroundColor: '#1D4ED8',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  driverTagText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '600',
  },
  driverButton: {
    marginTop: 4,
    backgroundColor: '#22d3ee',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  driverButtonText: {
    color: '#0f172a',
    fontWeight: '600',
  },
  campusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  campusCard: {
    flexBasis: '48%',
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    gap: 6,
  },
  campusCardActive: {
    borderColor: '#38BDF8',
    backgroundColor: '#0f172a',
  },
  campusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(99,102,241,0.2)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  campusBadgeText: {
    color: '#a5b4fc',
    fontSize: 12,
    fontWeight: '600',
  },
  campusName: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '600',
  },
  campusMeta: {
    color: '#94a3b8',
    fontSize: 12,
  },
  secondaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  secondaryButtonText: {
    color: '#E2E8F0',
  },
  primaryButtonSmall: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: '#6366F1',
  },
});
