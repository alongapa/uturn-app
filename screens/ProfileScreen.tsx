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

import { PAYMENT_STRIKES_FOR_BAN, getPaymentBanRemainingMs, isPaymentBanned } from '@/services/penalties';
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
  const [anio, setAnio] = useState(primaryCar?.anio?.toString() ?? '');
  const [patente, setPatente] = useState(primaryCar?.patente ?? '');
  const [capacidad, setCapacidad] = useState(primaryCar?.capacidadAsientos?.toString() ?? '');
  const [banco, setBanco] = useState(currentUser?.datosBancarios?.banco ?? '');
  const [tipoCuenta, setTipoCuenta] = useState(currentUser?.datosBancarios?.tipoCuenta ?? '');
  const [numeroCuenta, setNumeroCuenta] = useState(currentUser?.datosBancarios?.numeroCuenta ?? '');
  const [titular, setTitular] = useState(currentUser?.datosBancarios?.titular ?? '');

  const now = new Date();
  const paymentPenalty = currentUser?.paymentPenalty;
  const paymentBanned = isPaymentBanned(paymentPenalty, now);
  const paymentBanHours = Math.ceil(getPaymentBanRemainingMs(paymentPenalty, now) / (1000 * 60 * 60));
  const cancelBlockedUntil =
    currentUser?.blockedUntil && new Date(currentUser.blockedUntil) > now
      ? new Date(currentUser.blockedUntil)
      : null;

  useEffect(() => {
    setNombre(currentUser?.nombre ?? '');
    setEmail(currentUser?.email ?? '');
    setUniversidad(currentUser?.universidad ?? '');
    setCampus(currentUser?.campus ?? '');
    setFechaNacimiento(currentUser?.fechaNacimiento ?? '');
    setBanco(currentUser?.datosBancarios?.banco ?? '');
    setTipoCuenta(currentUser?.datosBancarios?.tipoCuenta ?? '');
    setNumeroCuenta(currentUser?.datosBancarios?.numeroCuenta ?? '');
    setTitular(currentUser?.datosBancarios?.titular ?? '');
  }, [currentUser]);

  useEffect(() => {
    if (primaryCar) {
      setModelo(primaryCar.modelo);
      setAnio(primaryCar.anio.toString());
      setPatente(primaryCar.patente);
      setCapacidad(primaryCar.capacidadAsientos.toString());
    }
  }, [primaryCar]);

  const handleSave = () => {
    if (!currentUser) return;

    const datosBancarios =
      banco || tipoCuenta || numeroCuenta || titular
        ? { banco, tipoCuenta, numeroCuenta, titular }
        : undefined;

    setCurrentUser({
      ...currentUser,
      nombre,
      email,
      universidad,
      campus,
      fechaNacimiento,
      datosBancarios,
    });

    if (primaryCar) {
      updateCar(primaryCar.id, {
        modelo,
        anio: Number(anio) || primaryCar.anio,
        patente,
        capacidadAsientos: Number(capacidad) || primaryCar.capacidadAsientos,
      });
    } else {
      addCar({
        id: `car-${Date.now()}`,
        modelo,
        anio: Number(anio) || new Date().getFullYear(),
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
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Datos bancarios (para recibir pagos)</Text>
          <Text style={styles.helper}>
            Los pasajeros verán estos datos al reservar un cupo en tus viajes.
          </Text>
          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.half]}>
              <Text style={styles.label}>Banco</Text>
              <TextInput value={banco} onChangeText={setBanco} style={styles.input} placeholder="Banco de Chile" />
            </View>
            <View style={[styles.inputGroup, styles.half]}>
              <Text style={styles.label}>Tipo de cuenta</Text>
              <TextInput
                value={tipoCuenta}
                onChangeText={setTipoCuenta}
                style={styles.input}
                placeholder="Cuenta Corriente"
              />
            </View>
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Número de cuenta</Text>
            <TextInput
              value={numeroCuenta}
              onChangeText={setNumeroCuenta}
              style={styles.input}
              placeholder="00-000-00000-0"
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Titular</Text>
            <TextInput value={titular} onChangeText={setTitular} style={styles.input} placeholder="Nombre del titular" />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Penalizaciones</Text>
          <View style={styles.penaltyRow}>
            <Text style={styles.label}>Strikes por impago</Text>
            <Text style={styles.penaltyValue}>
              {paymentPenalty?.paymentStrikesCount ?? 0}/{PAYMENT_STRIKES_FOR_BAN}
            </Text>
          </View>
          <View style={styles.penaltyRow}>
            <Text style={styles.label}>Cancelaciones tardías</Text>
            <Text style={styles.penaltyValue}>{currentUser?.lateCancellationsCount ?? 0}</Text>
          </View>
          {paymentBanned && paymentPenalty?.paymentBanUntil ? (
            <Text style={styles.banText}>
              Baneado de los turnos por impago hasta el{' '}
              {new Date(paymentPenalty.paymentBanUntil).toLocaleString('es-CL')} (quedan ~{paymentBanHours} h).
            </Text>
          ) : cancelBlockedUntil ? (
            <Text style={styles.banText}>
              Bloqueado por cancelaciones tardías hasta el {cancelBlockedUntil.toLocaleString('es-CL')}.
            </Text>
          ) : (
            <Text style={styles.helper}>Sin baneos activos. 3 strikes por impago = 2 días sin poder reservar.</Text>
          )}
        </View>

        <TouchableOpacity style={styles.primaryButton} onPress={handleSave}>
          <Text style={styles.primaryText}>Guardar cambios</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0B1220',
  },
  content: {
    padding: 16,
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#E2E8F0',
  },
  subtitle: {
    color: '#94A3B8',
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    gap: 12,
  },
  cardTitle: {
    color: '#E2E8F0',
    fontWeight: '700',
    fontSize: 16,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 64,
    height: 64,
    borderRadius: 16,
  },
  avatarInitials: {
    color: '#E2E8F0',
    fontWeight: '800',
    fontSize: 18,
  },
  statusPill: {
    backgroundColor: '#0EA5E9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusPillText: {
    color: '#0B1220',
    fontWeight: '700',
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    color: '#94A3B8',
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#0B1220',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#E2E8F0',
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  half: {
    flex: 1,
  },
  primaryButton: {
    backgroundColor: '#0EA5E9',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  primaryText: {
    color: '#0B1220',
    fontWeight: '800',
  },
  helper: {
    color: '#94A3B8',
    fontSize: 13,
  },
  penaltyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  penaltyValue: {
    color: '#E2E8F0',
    fontWeight: '800',
    fontSize: 16,
  },
  banText: {
    color: '#FCA5A5',
    fontWeight: '600',
  },
});
