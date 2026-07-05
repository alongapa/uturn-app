import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { router } from 'expo-router';

import { CAMPUSES, type CampusId } from '@/constants/campuses';
import type { GeocodedAddress } from '@/services/location';
import { geocodeAddress } from '@/services/location';
import passengersIcon from '../assets/icons/unities-passengers.png';

const CAMPUS_OPTIONS = CAMPUSES.filter((campus) => campus.city === 'Santiago');

export default function PassengerHomeScreen() {
  const [originQuery, setOriginQuery] = useState('');
  const [originSelection, setOriginSelection] = useState<GeocodedAddress | null>(null);
  const [suggestions, setSuggestions] = useState<GeocodedAddress[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [destinationCampus, setDestinationCampus] = useState<CampusId | null>(null);

  const canSearch = originSelection && destinationCampus;

  useEffect(() => {
    const controller = setTimeout(async () => {
      if (originQuery.trim().length < 3) {
        setSuggestions([]);
        return;
      }
      setLoadingSuggestions(true);
      try {
        const results = await geocodeAddress(originQuery);
        setSuggestions(results.slice(0, 5));
      } catch (error) {
        console.error('Geocoding error', error);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 350);

    return () => clearTimeout(controller);
  }, [originQuery]);

  const selectedDestinationName = useMemo(() => {
    const selected = CAMPUS_OPTIONS.find((campus) => campus.id === destinationCampus);
    return selected?.name ?? '';
  }, [destinationCampus]);

  const handleSearch = () => {
    if (!originSelection) {
      Alert.alert('Falta origen', 'Ingresa y selecciona tu dirección exacta.');
      return;
    }
    if (!destinationCampus) {
      Alert.alert('Falta destino', 'Selecciona el campus al que quieres ir.');
      return;
    }

    router.push({
      pathname: '/passenger/search-results',
      params: {
        originLat: originSelection.coordinates.latitude.toString(),
        originLng: originSelection.coordinates.longitude.toString(),
        originLabel: originSelection.address,
        destino: destinationCampus,
      },
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Buscar viajes</Text>
      <Text style={styles.subtitle}>El pasajero ingresa su origen exacto, el conductor define el punto de encuentro.</Text>

      <View style={styles.field}>
        <Text style={styles.label}>Origen exacto</Text>
        <TextInput
          value={originQuery}
          onChangeText={(text) => {
            setOriginQuery(text);
            setOriginSelection(null);
          }}
          placeholder="Ej: Avenida Apoquindo 4500, Las Condes"
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {loadingSuggestions && (
          <View style={styles.inline}>
            <ActivityIndicator size="small" color="#0A1525" />
            <Text style={styles.helper}>Buscando direcciones...</Text>
          </View>
        )}
        {!loadingSuggestions && suggestions.length > 0 && (
          <View style={styles.suggestions}>
            {suggestions.map((suggestion) => (
              <TouchableOpacity
                key={`${suggestion.address}-${suggestion.coordinates.latitude}`}
                style={[
                  styles.suggestion,
                  originSelection?.address === suggestion.address ? styles.suggestionActive : undefined,
                ]}
                onPress={() => setOriginSelection(suggestion)}
              >
                <Text style={styles.suggestionText}>{suggestion.address}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {originSelection && (
          <Text style={styles.helper}>Origen listo: {originSelection.address}</Text>
        )}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Destino (campus)</Text>
        <View style={styles.campusList}>
          {CAMPUS_OPTIONS.map((campus) => (
            <TouchableOpacity
              key={campus.id}
              style={[styles.campusPill, campus.id === destinationCampus ? styles.campusPillActive : undefined]}
              onPress={() => setDestinationCampus(campus.id)}
            >
              <Text style={[styles.campusText, campus.id === destinationCampus ? styles.campusTextActive : undefined]}>
                {campus.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {selectedDestinationName ? (
          <Text style={styles.helper}>{selectedDestinationName}</Text>
        ) : (
          <Text style={styles.helper}>Elige tu campus de destino</Text>
        )}
      </View>

      <TouchableOpacity style={[styles.primaryButton, !canSearch && styles.primaryButtonDisabled]} onPress={handleSearch}>
        <Text style={styles.primaryText}>Buscar viajes</Text>
      </TouchableOpacity>

      <View style={styles.exploreCard}>
        <View style={styles.exploreRow}>
          <View style={styles.iconWrapper}>
            <Image source={passengersIcon} style={styles.icon} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.exploreTitle}>Explora rutas disponibles</Text>
            <Text style={styles.exploreSubtitle}>Descubre conductores y hotspots cercanos a tu origen.</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push({ pathname: '/passenger/search-results', params: { originLabel: originQuery } })}
        >
          <Text style={styles.secondaryButtonText}>Ir a explorar</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12, backgroundColor: '#f8fafc' },
  title: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  subtitle: { color: '#475569', marginBottom: 4 },
  field: { gap: 6 },
  label: { color: '#334155', fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#fff',
  },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  helper: { color: '#475569' },
  suggestions: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    overflow: 'hidden',
  },
  suggestion: {
    padding: 10,
    backgroundColor: '#fff',
  },
  suggestionActive: {
    backgroundColor: '#e6f0ff',
  },
  suggestionText: { color: '#0f172a' },
  campusList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  campusPill: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  campusPillActive: {
    backgroundColor: '#0A1525',
    borderColor: '#0A1525',
  },
  campusText: { color: '#0f172a', fontWeight: '600' },
  campusTextActive: { color: '#fff' },
  primaryButton: {
    backgroundColor: '#0A1525',
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryText: { textAlign: 'center', color: '#fff', fontWeight: '700' },
  exploreCard: {
    marginTop: 16,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 10,
  },
  exploreRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  exploreTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  exploreSubtitle: { color: '#475569' },
  iconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { width: 48, height: 48, resizeMode: 'contain' },
  secondaryButton: {
    backgroundColor: '#0A1525',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryButtonText: { color: '#fff', fontWeight: '700' },
});
