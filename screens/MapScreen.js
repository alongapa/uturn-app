var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import * as Location from 'expo-location';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { meetingPoints } from '@/constants/meetingPoints';
import { useAppState } from '@/store/appState';
import { useLocalSearchParams } from 'expo-router';
const DEFAULT_REGION = {
    latitude: -33.4489,
    longitude: -70.6693,
    latitudeDelta: 0.2,
    longitudeDelta: 0.2,
};
export default function MapScreen() {
    const { tripId, meetingPointId } = useLocalSearchParams();
    const { trips } = useAppState();
    const [region, setRegion] = useState(DEFAULT_REGION);
    const [loadingLocation, setLoadingLocation] = useState(true);
    const trip = useMemo(() => trips.find((t) => t.id === tripId), [trips, tripId]);
    const targetPoint = useMemo(() => meetingPoints.find((point) => point.id === meetingPointId || point.id === (trip === null || trip === void 0 ? void 0 : trip.puntoEncuentroId)), [meetingPointId, trip === null || trip === void 0 ? void 0 : trip.puntoEncuentroId]);
    useEffect(() => {
        if (targetPoint) {
            setRegion(Object.assign(Object.assign({}, targetPoint.coordenadas), { latitudeDelta: 0.05, longitudeDelta: 0.05 }));
            setLoadingLocation(false);
            return;
        }
        if (trip) {
            setRegion({
                latitude: trip.coordenadasOrigen.latitude,
                longitude: trip.coordenadasOrigen.longitude,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
            });
            setLoadingLocation(false);
            return;
        }
        (() => __awaiter(this, void 0, void 0, function* () {
            const { status } = yield Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                setLoadingLocation(false);
                return;
            }
            const location = yield Location.getCurrentPositionAsync({});
            setRegion({
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
            });
            setLoadingLocation(false);
        }))().catch((error) => {
            console.error(error);
            setLoadingLocation(false);
            Alert.alert('No se pudo obtener tu ubicación');
        });
    }, [trip, targetPoint]);
    return (<SafeAreaView style={styles.safeArea}>
      {loadingLocation ? (<View style={styles.loader}>
          <ActivityIndicator size="large" color="#2563eb"/>
          <Text style={styles.loaderText}>Buscando ubicación...</Text>
        </View>) : (<MapView style={styles.map} region={region}>
          {meetingPoints.map((point) => (<Marker key={point.id} coordinate={point.coordenadas} title={point.nombre} description={point.tipo === 'campus' ? 'Campus' : 'Punto de encuentro'} pinColor={point.tipo === 'campus' ? '#2563eb' : '#22c55e'}/>))}
          {trip && (<Marker coordinate={trip.coordenadasDestino} title={`Destino: ${trip.destinoCampus}`} description="Destino del viaje" pinColor="#f97316"/>)}
        </MapView>)}
      <View style={styles.floatingCard}>
        <Text style={styles.cardTitle}>Región Metropolitana</Text>
        <Text style={styles.cardMeta}>Puntos de encuentro y campus activos</Text>
        <TouchableOpacity style={styles.button} onPress={() => setRegion(DEFAULT_REGION)}>
          <Text style={styles.buttonText}>Recentrar</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>);
}
const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
    },
    map: {
        flex: 1,
    },
    loader: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#ffffff',
    },
    loaderText: {
        marginTop: 12,
        color: '#0f172a',
    },
    floatingCard: {
        position: 'absolute',
        bottom: 20,
        left: 20,
        right: 20,
        backgroundColor: '#ffffff',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        gap: 8,
    },
    cardTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#0f172a',
    },
    cardMeta: {
        color: '#475569',
    },
    button: {
        marginTop: 8,
        backgroundColor: '#2563eb',
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 10,
    },
    buttonText: {
        color: '#ffffff',
        fontWeight: '700',
    },
});
