import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppState } from '@/store/appState';
export default function TripDetailScreen() {
    const { id } = useLocalSearchParams();
    const { trips, canUserBookOrCancel, currentUser } = useAppState();
    const trip = useMemo(() => trips.find((t) => t.id === id), [trips, id]);
    const handleReserve = () => {
        var _a;
        const check = canUserBookOrCancel(currentUser, new Date());
        if (!check.allowed) {
            Alert.alert((_a = check.reason) !== null && _a !== void 0 ? _a : 'No puedes reservar en este momento');
            return;
        }
        router.push({
            pathname: '/payment',
            params: { price: trip === null || trip === void 0 ? void 0 : trip.precioCLP.toString(), destination: trip === null || trip === void 0 ? void 0 : trip.destinoCampus, tripId: trip === null || trip === void 0 ? void 0 : trip.id },
        });
    };
    if (!trip) {
        return (<SafeAreaView style={styles.safeArea}>
        <View style={styles.card}>
          <Text style={styles.title}>Viaje no encontrado</Text>
        </View>
      </SafeAreaView>);
    }
    return (<SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.title}>{trip.origenCampus} → {trip.destinoCampus}</Text>
          <Text style={styles.meta}>Punto de encuentro: {trip.puntoEncuentroId}</Text>
          <Text style={styles.meta}>Salida: {new Date(trip.horaSalida).toLocaleString('es-CL')}</Text>
          <Text style={styles.price}>${trip.precioCLP}</Text>
          <Text style={styles.meta}>Asientos disponibles: {trip.asientosDisponibles}</Text>
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push({ pathname: '/map', params: { tripId: trip.id } })}>
              <Text style={styles.secondaryText}>Ver en mapa</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryButton} onPress={handleReserve}>
              <Text style={styles.primaryText}>Reservar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>);
}
const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#f8fafc',
    },
    content: {
        padding: 20,
    },
    card: {
        backgroundColor: '#ffffff',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        gap: 8,
    },
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
});
