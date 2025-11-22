import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAppState } from '@/store/appState';
const CAMPUS_OPTIONS = ['Campus Peñalolén', 'Campus San Carlos', 'Campus Viña del Mar'];
const DESTINO_OPTIONS = ['Providencia', 'Ñuñoa', 'La Reina'];
const MEETING_POINTS = [
    { id: 'mp-1', label: 'Metro Grecia' },
    { id: 'mp-2', label: 'Entrada principal' },
    { id: 'mp-3', label: 'Acceso Biblioteca' },
];
export default function CreateTripScreen() {
    const { addTrip, currentUser } = useAppState();
    const [origenCampus, setOrigenCampus] = useState(CAMPUS_OPTIONS[0]);
    const [destinoCampus, setDestinoCampus] = useState(DESTINO_OPTIONS[0]);
    const [puntoEncuentroId, setPuntoEncuentroId] = useState(MEETING_POINTS[0].id);
    const [horaSalida, setHoraSalida] = useState(new Date().toISOString());
    const [precioCLP, setPrecioCLP] = useState('2500');
    const [asientosDisponibles, setAsientosDisponibles] = useState('3');
    const handlePublish = () => {
        if (!currentUser) {
            Alert.alert('Inicia sesión para publicar un viaje');
            return;
        }
        const trip = addTrip({
            driverId: currentUser.id,
            origenCampus,
            destinoCampus,
            puntoEncuentroId,
            horaSalida,
            precioCLP: Number(precioCLP) || 0,
            asientosDisponibles: Number(asientosDisponibles) || 0,
            asientosOcupados: 0,
            coordenadasOrigen: { latitude: -33.45, longitude: -70.66 },
            coordenadasDestino: { latitude: -33.44, longitude: -70.58 },
        });
        Alert.alert('Viaje publicado');
        router.replace({ pathname: '/trip/[id]', params: { id: trip.id } });
    };
    return (<SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Publicar viaje</Text>
        <Text style={styles.subtitle}>Define origen, destino y cupos disponibles.</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Campus de origen</Text>
          <TextInput value={origenCampus} onChangeText={setOrigenCampus} style={styles.input}/>

          <Text style={styles.label}>Destino</Text>
          <TextInput value={destinoCampus} onChangeText={setDestinoCampus} style={styles.input}/>

          <Text style={styles.label}>Punto de encuentro</Text>
          <TextInput value={puntoEncuentroId} onChangeText={setPuntoEncuentroId} style={styles.input}/>

          <Text style={styles.label}>Hora de salida (ISO)</Text>
          <TextInput value={horaSalida} onChangeText={setHoraSalida} style={styles.input}/>

          <View style={styles.row}>
            <View style={[styles.half, styles.inputGroup]}>
              <Text style={styles.label}>Precio (CLP)</Text>
              <TextInput value={precioCLP} onChangeText={setPrecioCLP} style={styles.input} keyboardType="number-pad"/>
            </View>
            <View style={[styles.half, styles.inputGroup]}>
              <Text style={styles.label}>Asientos</Text>
              <TextInput value={asientosDisponibles} onChangeText={setAsientosDisponibles} style={styles.input} keyboardType="number-pad"/>
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.primaryButton} onPress={handlePublish}>
          <Text style={styles.primaryButtonText}>Publicar viaje</Text>
        </TouchableOpacity>
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
        fontWeight: '600',
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
        backgroundColor: '#2563eb',
        paddingVertical: 14,
        alignItems: 'center',
        borderRadius: 12,
    },
    primaryButtonText: {
        color: '#ffffff',
        fontWeight: '700',
        fontSize: 16,
    },
});
