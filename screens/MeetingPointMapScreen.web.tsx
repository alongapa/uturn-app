import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { getMeetingPointById } from '@/constants/campuses';
import { getCurrentPosition, requestLocationPermission, type Coordinates } from '@/services/location';

export default function MeetingPointMapScreenWeb() {
  const params = useLocalSearchParams<{ meetingPointId?: string }>();
  const meetingPointId = Array.isArray(params.meetingPointId) ? params.meetingPointId[0] : params.meetingPointId;
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [userCoords, setUserCoords] = useState<Coordinates | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const meetingPoint = useMemo(() => getMeetingPointById(meetingPointId), [meetingPointId]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const granted = await requestLocationPermission();
      if (!isMounted) return;
      setPermissionGranted(granted);

      if (granted) {
        try {
          const position = await getCurrentPosition();
          if (!isMounted) return;
          if (position) {
            setUserCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
          } else {
            setErrorMessage('No pudimos obtener tu ubicación actual.');
          }
        } catch {
          if (!isMounted) return;
          setErrorMessage('No pudimos obtener tu ubicación actual.');
        }
      } else {
        setErrorMessage('Permisos de ubicación denegados.');
      }

      if (isMounted) {
        setLoadingLocation(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  if (!meetingPoint) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.title}>No encontramos el punto de encuentro solicitado.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <View style={styles.infoCard}>
          <Text style={styles.title}>{meetingPoint.name}</Text>
          <Text style={styles.subtitle}>{meetingPoint.campusName}</Text>
          {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
          {!permissionGranted && !loadingLocation && (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={async () => {
                setLoadingLocation(true);
                setErrorMessage(null);
                const granted = await requestLocationPermission();
                setPermissionGranted(granted);
                if (!granted) {
                  setErrorMessage('Permisos de ubicación denegados.');
                  setLoadingLocation(false);
                  return;
                }
                try {
                  const position = await getCurrentPosition();
                  if (position) {
                    setUserCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
                  } else {
                    setErrorMessage('No pudimos obtener tu ubicación actual.');
                  }
                } catch {
                  setErrorMessage('No pudimos obtener tu ubicación actual.');
                }
                setLoadingLocation(false);
              }}
            >
              <Text style={styles.secondaryButtonText}>Intentar nuevamente</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.mapContainer}>
          <View style={styles.mapFallback}>
            <Text style={styles.subtitle}>El mapa no está disponible en web.</Text>
            <Text style={styles.subtitle}>
              Coordenadas del punto: {meetingPoint.latitude.toFixed(4)}, {meetingPoint.longitude.toFixed(4)}
            </Text>
            {userCoords && (
              <Text style={styles.subtitle}>
                Tu ubicación: {userCoords.latitude.toFixed(4)}, {userCoords.longitude.toFixed(4)}
              </Text>
            )}
            {loadingLocation && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator color="#22d3ee" />
              </View>
            )}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#020617',
  },
  content: {
    flex: 1,
    padding: 16,
    gap: 16,
  },
  infoCard: {
    backgroundColor: '#0f172a',
    borderRadius: 18,
    padding: 18,
    gap: 8,
  },
  title: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    color: '#94a3b8',
  },
  errorText: {
    color: '#f87171',
  },
  mapContainer: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  mapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0b1221',
    gap: 8,
    padding: 16,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingOverlay: {
    marginTop: 8,
    alignItems: 'center',
  },
  secondaryButton: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#f8fafc',
    fontWeight: '600',
  },
});
