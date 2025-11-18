import React, { useEffect, useMemo, useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { CAMPUSES, UNIVERSITIES } from '@/constants/campuses';
import { useUser } from '@/contexts/UserContext';

export default function ProfileScreen() {
  const { user, updateUser } = useUser();
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [driverLicenseNumber, setDriverLicenseNumber] = useState('');
  const [driverLicenseExpiration, setDriverLicenseExpiration] = useState('');
  const [vehicleBrand, setVehicleBrand] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleYear, setVehicleYear] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');

  useEffect(() => {
    if (!user) {
      return;
    }

    setDateOfBirth(user.dateOfBirth ?? '');
    setDriverLicenseNumber(user.driverLicenseNumber ?? '');
    setDriverLicenseExpiration(user.driverLicenseExpiration ?? '');
    setVehicleBrand(user.vehicle?.brand ?? '');
    setVehicleModel(user.vehicle?.model ?? '');
    setVehicleYear(user.vehicle?.year ? String(user.vehicle.year) : '');
    setVehicleColor(user.vehicle?.color ?? '');
    setVehiclePlate(user.vehicle?.plate ?? '');
  }, [user]);

  const universityName = useMemo(() => {
    if (!user?.universityId) {
      return 'Sin asignar';
    }

    return UNIVERSITIES.find((item) => item.id === user.universityId)?.name ?? 'Sin asignar';
  }, [user?.universityId]);

  const homeCampusName = useMemo(() => {
    if (!user?.homeCampusId) {
      return 'Sin campus';
    }

    return CAMPUSES.find((campus) => campus.id === user.homeCampusId)?.name ?? 'Sin campus';
  }, [user?.homeCampusId]);

  const handleSave = () => {
    if (!user) {
      return;
    }

    const parsedYear = vehicleYear ? Number(vehicleYear) : undefined;

    updateUser({
      dateOfBirth: dateOfBirth || undefined,
      driverLicenseNumber: driverLicenseNumber || undefined,
      driverLicenseExpiration: driverLicenseExpiration || undefined,
      vehicle:
        vehicleBrand && vehicleModel && parsedYear
          ? {
              brand: vehicleBrand,
              model: vehicleModel,
              year: parsedYear,
              color: vehicleColor || undefined,
              plate: vehiclePlate || undefined,
            }
          : undefined,
    });

    Alert.alert('Perfil actualizado', 'Tu información se guardó correctamente.');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Perfil del conductor</Text>
        <Text style={styles.subtitle}>Actualiza tus datos para publicar viajes con seguridad.</Text>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Datos personales</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Nombre</Text>
            <Text style={styles.rowValue}>{user?.name ?? 'Sin nombre'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Correo institucional</Text>
            <Text style={styles.rowValue}>{user?.email ?? 'Sin correo'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Universidad</Text>
            <Text style={styles.rowValue}>{universityName}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Campus base</Text>
            <Text style={styles.rowValue}>{homeCampusName}</Text>
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Fecha de nacimiento (AAAA-MM-DD)</Text>
            <TextInput
              value={dateOfBirth}
              onChangeText={setDateOfBirth}
              placeholder="1999-08-15"
              style={styles.input}
              placeholderTextColor="#94a3b8"
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Licencia y vehículo</Text>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Número de licencia</Text>
            <TextInput
              value={driverLicenseNumber}
              onChangeText={setDriverLicenseNumber}
              placeholder="12345678"
              style={styles.input}
              placeholderTextColor="#94a3b8"
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Vencimiento de licencia (AAAA-MM-DD)</Text>
            <TextInput
              value={driverLicenseExpiration}
              onChangeText={setDriverLicenseExpiration}
              placeholder="2026-05-30"
              style={styles.input}
              placeholderTextColor="#94a3b8"
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Marca del vehículo</Text>
            <TextInput
              value={vehicleBrand}
              onChangeText={setVehicleBrand}
              placeholder="Mazda"
              style={styles.input}
              placeholderTextColor="#94a3b8"
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Modelo</Text>
            <TextInput
              value={vehicleModel}
              onChangeText={setVehicleModel}
              placeholder="3 Touring"
              style={styles.input}
              placeholderTextColor="#94a3b8"
            />
          </View>
          <View style={styles.rowInputs}>
            <View style={[styles.inputGroup, styles.rowItem]}>
              <Text style={styles.inputLabel}>Año</Text>
              <TextInput
                value={vehicleYear}
                onChangeText={setVehicleYear}
                placeholder="2022"
                style={styles.input}
                keyboardType="numeric"
                placeholderTextColor="#94a3b8"
              />
            </View>
            <View style={[styles.inputGroup, styles.rowItem]}>
              <Text style={styles.inputLabel}>Color</Text>
              <TextInput
                value={vehicleColor}
                onChangeText={setVehicleColor}
                placeholder="Azul"
                style={styles.input}
                placeholderTextColor="#94a3b8"
              />
            </View>
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Patente</Text>
            <TextInput
              value={vehiclePlate}
              onChangeText={setVehiclePlate}
              placeholder="AA-BB-11"
              style={styles.input}
              autoCapitalize="characters"
              placeholderTextColor="#94a3b8"
            />
          </View>
        </View>

        <TouchableOpacity style={styles.primaryButton} onPress={handleSave}>
          <Text style={styles.primaryButtonText}>Guardar cambios</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
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
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 20,
    padding: 20,
    gap: 16,
  },
  sectionLabel: {
    color: '#f8fafc',
    fontWeight: '600',
    fontSize: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rowLabel: {
    color: '#94a3b8',
  },
  rowValue: {
    color: '#f8fafc',
    fontWeight: '600',
    maxWidth: '60%',
    textAlign: 'right',
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    color: '#cbd5f5',
    fontSize: 13,
  },
  input: {
    backgroundColor: '#020617',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#f8fafc',
  },
  rowInputs: {
    flexDirection: 'row',
    gap: 12,
  },
  rowItem: {
    flex: 1,
  },
  primaryButton: {
    backgroundColor: '#22d3ee',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#0f172a',
    fontWeight: '700',
  },
});
