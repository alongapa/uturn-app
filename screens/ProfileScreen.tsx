import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useAppState } from '@/store/appState';

export default function ProfileScreen() {
  const { currentUser, setCurrentUser, cars, updateCar, addCar } = useAppState();
  const primaryCar = cars[0];

  const [nombre, setNombre] = useState(currentUser?.nombre ?? '');
  const [email, setEmail] = useState(currentUser?.email ?? '');
  const [universidad, setUniversidad] = useState(currentUser?.universidad ?? '');
  const [campus, setCampus] = useState(currentUser?.campus ?? '');
  const [fechaNacimiento, setFechaNacimiento] = useState(currentUser?.fechaNacimiento ?? '');
  const [modelo, setModelo] = useState(primaryCar?.modelo ?? '');
  const [anio, setAnio] = useState(primaryCar?.año?.toString() ?? '');
  const [patente, setPatente] = useState(primaryCar?.patente ?? '');
  const [capacidad, setCapacidad] = useState(primaryCar?.capacidadAsientos?.toString() ?? '');

  useEffect(() => {
    setNombre(currentUser?.nombre ?? '');
    setEmail(currentUser?.email ?? '');
    setUniversidad(currentUser?.universidad ?? '');
    setCampus(currentUser?.campus ?? '');
    setFechaNacimiento(currentUser?.fechaNacimiento ?? '');
  }, [currentUser]);

  useEffect(() => {
    if (primaryCar) {
      setModelo(primaryCar.modelo);
      setAnio(primaryCar.año.toString());
      setPatente(primaryCar.patente);
      setCapacidad(primaryCar.capacidadAsientos.toString());
    }
  }, [primaryCar]);

  const handleSave = () => {
    if (!currentUser) return;

    setCurrentUser({
      ...currentUser,
      nombre,
      email,
      universidad,
      campus,
      fechaNacimiento,
    });

    if (primaryCar) {
      updateCar(primaryCar.id, {
        modelo,
        año: Number(anio) || primaryCar.año,
        patente,
        capacidadAsientos: Number(capacidad) || primaryCar.capacidadAsientos,
      });
    } else {
      addCar({
        id: `car-${Date.now()}`,
        modelo,
        año: Number(anio) || new Date().getFullYear(),
        patente,
        color: 'Sin especificar',
        capacidadAsientos: Number(capacidad) || 4,
      });
    }

    Alert.alert('Perfil actualizado');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Perfil</Text>
        <Text style={styles.subtitle}>Actualiza tus datos y credenciales de conductor.</Text>

        <View style={styles.card}>
          <View style={styles.avatarRow}>
            <View style={styles.avatarPlaceholder}>
              {currentUser?.urlFotoPerfil ? (
                <Image source={{ uri: currentUser.urlFotoPerfil }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarInitials}>{nombre?.slice(0, 2).toUpperCase()}</Text>
              )}
            </View>
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>Credencial verificada</Text>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nombre completo</Text>
            <TextInput value={nombre} onChangeText={setNombre} style={styles.input} placeholder="Nombre" />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email institucional</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              style={styles.input}
              placeholder="correo@alumnos.uai.cl"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.half]}>
              <Text style={styles.label}>Universidad</Text>
              <TextInput value={universidad} onChangeText={setUniversidad} style={styles.input} placeholder="UAI" />
            </View>
            <View style={[styles.inputGroup, styles.half]}>
              <Text style={styles.label}>Campus principal</Text>
              <TextInput value={campus} onChangeText={setCampus} style={styles.input} placeholder="Peñalolén" />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Fecha de nacimiento</Text>
            <TextInput
              value={fechaNacimiento}
              onChangeText={setFechaNacimiento}
              style={styles.input}
              placeholder="YYYY-MM-DD"
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Auto principal</Text>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Modelo</Text>
            <TextInput value={modelo} onChangeText={setModelo} style={styles.input} placeholder="Mazda 3" />
          </View>
          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.half]}>
              <Text style={styles.label}>Año</Text>
              <TextInput value={anio} onChangeText={setAnio} style={styles.input} keyboardType="number-pad" />
            </View>
            <View style={[styles.inputGroup, styles.half]}>
              <Text style={styles.label}>Patente</Text>
              <TextInput value={patente} onChangeText={setPatente} style={styles.input} autoCapitalize="characters" />
            </View>
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Capacidad de asientos</Text>
            <TextInput
              value={capacidad}
              onChangeText={setCapacidad}
              style={styles.input}
              keyboardType="number-pad"
              placeholder="4"
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
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarInitials: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  statusPill: {
    backgroundColor: 'rgba(34,197,94,0.15)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusPillText: {
    color: '#16a34a',
    fontWeight: '700',
  },
  inputGroup: {
    gap: 6,
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
