var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { getMeetingPointById } from '@/constants/campuses';
import { getCurrentPosition, requestLocationPermission } from '@/services/location';
export default function MeetingPointMapScreen() {
    const params = useLocalSearchParams();
    const meetingPointId = Array.isArray(params.meetingPointId) ? params.meetingPointId[0] : params.meetingPointId;
    const [loadingLocation, setLoadingLocation] = useState(true);
    const [permissionGranted, setPermissionGranted] = useState(false);
    const [userCoords, setUserCoords] = useState(null);
    const [errorMessage, setErrorMessage] = useState(null);
    const meetingPoint = useMemo(() => getMeetingPointById(meetingPointId), [meetingPointId]);
    useEffect(() => {
        let isMounted = true;
        (() => __awaiter(this, void 0, void 0, function* () {
            const granted = yield requestLocationPermission();
            if (!isMounted)
                return;
            setPermissionGranted(granted);
            if (granted) {
                try {
                    const position = yield getCurrentPosition();
                    if (!isMounted)
                        return;
                    setUserCoords({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                    });
                }
                catch (error) {
                    if (!isMounted)
                        return;
                    setErrorMessage('No pudimos obtener tu ubicación actual.');
                }
            }
            else {
                setErrorMessage('Permisos de ubicación denegados.');
            }
            if (isMounted) {
                setLoadingLocation(false);
            }
        }))();
        return () => {
            isMounted = false;
        };
    }, []);
    const region = useMemo(() => {
        if (!meetingPoint) {
            return undefined;
        }
        if (userCoords) {
            const minLat = Math.min(meetingPoint.latitude, userCoords.latitude);
            const maxLat = Math.max(meetingPoint.latitude, userCoords.latitude);
            const minLng = Math.min(meetingPoint.longitude, userCoords.longitude);
            const maxLng = Math.max(meetingPoint.longitude, userCoords.longitude);
            const latitudeDelta = Math.max(0.01, maxLat - minLat + 0.02);
            const longitudeDelta = Math.max(0.01, maxLng - minLng + 0.02);
            return {
                latitude: (meetingPoint.latitude + userCoords.latitude) / 2,
                longitude: (meetingPoint.longitude + userCoords.longitude) / 2,
                latitudeDelta,
                longitudeDelta,
            };
        }
        return {
            latitude: meetingPoint.latitude,
            longitude: meetingPoint.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
        };
    }, [meetingPoint, userCoords]);
    if (!meetingPoint) {
        return (<SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.title}>No encontramos el punto de encuentro solicitado.</Text>
        </View>
      </SafeAreaView>);
    }
    return (<SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <View style={styles.infoCard}>
          <Text style={styles.title}>{meetingPoint.name}</Text>
          <Text style={styles.subtitle}>{meetingPoint.campusName}</Text>
          {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
          {!permissionGranted && !loadingLocation && (<TouchableOpacity style={styles.secondaryButton} onPress={() => __awaiter(this, void 0, void 0, function* () {
                setLoadingLocation(true);
                setErrorMessage(null);
                const granted = yield requestLocationPermission();
                setPermissionGranted(granted);
                if (!granted) {
                    setErrorMessage('Permisos de ubicación denegados.');
                    setLoadingLocation(false);
                    return;
                }
                try {
                    const position = yield getCurrentPosition();
                    setUserCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
                }
                catch (error) {
                    setErrorMessage('No pudimos obtener tu ubicación actual.');
                }
                setLoadingLocation(false);
            })}>
              <Text style={styles.secondaryButtonText}>Intentar nuevamente</Text>
            </TouchableOpacity>)}
        </View>
        <View style={styles.mapContainer}>
          {loadingLocation && (<View style={styles.loadingOverlay}>
              <ActivityIndicator color="#22d3ee"/>
            </View>)}
          {region ? (<MapView style={styles.map} region={region}>
              <Marker coordinate={{ latitude: meetingPoint.latitude, longitude: meetingPoint.longitude }} title={meetingPoint.name} description="Punto de encuentro"/>
              {userCoords && (<Marker coordinate={userCoords} title="Tu ubicación" pinColor="#22d3ee"/>)}
            </MapView>) : (<View style={styles.centered}>
              <Text style={styles.subtitle}>Cargando mapa…</Text>
            </View>)}
        </View>
      </View>
    </SafeAreaView>);
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
    map: {
        flex: 1,
    },
    centered: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    loadingOverlay: Object.assign(Object.assign({}, StyleSheet.absoluteFillObject), { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(2,6,23,0.6)', zIndex: 2 }),
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
