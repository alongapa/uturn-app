import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useUser } from '@/contexts/UserContext';
import type { DriverBankInfo } from '@/models/uturn';
import { useAppState } from '@/store/appState';

const ACCOUNT_TYPES: { id: DriverBankInfo['tipoCuenta']; label: string }[] = [
  { id: 'corriente', label: 'Cuenta corriente' },
  { id: 'vista', label: 'Cuenta vista' },
  { id: 'ahorro', label: 'Ahorro' },
];

export default function SettingsScreen() {
  const {
    settings,
    updateNotificationPrefs,
    updatePrivacyPrefs,
    setBankInfo,
    setCurrentUser,
  } = useAppState();
  const { clearUser } = useUser();

  const bank = settings.datosBancarios;
  const [banco, setBanco] = useState(bank?.banco ?? '');
  const [tipoCuenta, setTipoCuenta] = useState<DriverBankInfo['tipoCuenta']>(bank?.tipoCuenta ?? 'corriente');
  const [numeroCuenta, setNumeroCuenta] = useState(bank?.numeroCuenta ?? '');
  const [titular, setTitular] = useState(bank?.titular ?? '');
  const [rut, setRut] = useState(bank?.rut ?? '');

  const handleSaveBank = () => {
    if (!banco.trim() || !numeroCuenta.trim() || !titular.trim() || !rut.trim()) {
      Alert.alert('Completa todos los datos bancarios antes de guardar.');
      return;
    }
    setBankInfo({
      banco: banco.trim(),
      tipoCuenta,
      numeroCuenta: numeroCuenta.trim(),
      titular: titular.trim(),
      rut: rut.trim(),
    });
    Alert.alert('Datos bancarios guardados', 'Usaremos esta cuenta para transferirte los pagos de tus viajes.');
  };

  const handleSignOut = () => {
    Alert.alert('Cerrar sesión', '¿Seguro que quieres salir de Uturn?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión',
        style: 'destructive',
        onPress: () => {
          clearUser();
          setCurrentUser(null);
          router.replace('/');
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Notificaciones</Text>
      <View style={styles.card}>
        <ToggleRow
          label="Recordatorios de pago"
          description="Avisos antes de que venza el plazo de 48 horas."
          value={settings.notificaciones.recordatoriosPago}
          onChange={(value) => updateNotificationPrefs({ recordatoriosPago: value })}
        />
        <ToggleRow
          label="Mensajes"
          description="Notificaciones de conductores y pasajeros."
          value={settings.notificaciones.mensajes}
          onChange={(value) => updateNotificationPrefs({ mensajes: value })}
        />
        <ToggleRow
          label="Novedades semanales"
          description="Eventos, activaciones y nuevos canjes de la semana."
          value={settings.notificaciones.novedadesSemanales}
          onChange={(value) => updateNotificationPrefs({ novedadesSemanales: value })}
        />
      </View>

      <Text style={styles.sectionTitle}>Privacidad</Text>
      <View style={styles.card}>
        <ToggleRow
          label="Mostrar foto de perfil"
          description="Otros usuarios verán tu foto en viajes y reservas."
          value={settings.privacidad.mostrarFotoPerfil}
          onChange={(value) => updatePrivacyPrefs({ mostrarFotoPerfil: value })}
        />
        <ToggleRow
          label="Mostrar universidad y campus"
          description="Se muestra en tu perfil público."
          value={settings.privacidad.mostrarUniversidad}
          onChange={(value) => updatePrivacyPrefs({ mostrarUniversidad: value })}
        />
        <ToggleRow
          label="Perfil visible en viajes"
          description="Permite que te encuentren al buscar viajes."
          value={settings.privacidad.perfilVisibleEnViajes}
          onChange={(value) => updatePrivacyPrefs({ perfilVisibleEnViajes: value })}
        />
      </View>

      <Text style={styles.sectionTitle}>Datos bancarios (conductor)</Text>
      <View style={styles.card}>
        <Text style={styles.cardHint}>
          Cuenta donde recibirás los pagos de tus pasajeros.
        </Text>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Banco</Text>
          <TextInput value={banco} onChangeText={setBanco} style={styles.input} placeholder="Banco de Chile" />
        </View>
        <Text style={styles.label}>Tipo de cuenta</Text>
        <View style={styles.chipRow}>
          {ACCOUNT_TYPES.map((option) => {
            const selected = tipoCuenta === option.id;
            return (
              <TouchableOpacity
                key={option.id}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => setTipoCuenta(option.id)}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Número de cuenta</Text>
          <TextInput
            value={numeroCuenta}
            onChangeText={setNumeroCuenta}
            style={styles.input}
            placeholder="000123456789"
            keyboardType="number-pad"
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Titular</Text>
          <TextInput value={titular} onChangeText={setTitular} style={styles.input} placeholder="Nombre del titular" />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>RUT</Text>
          <TextInput value={rut} onChangeText={setRut} style={styles.input} placeholder="12.345.678-9" />
        </View>
        <TouchableOpacity style={styles.primaryButton} onPress={handleSaveBank}>
          <Text style={styles.primaryButtonText}>Guardar datos bancarios</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleInfo}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleDescription}>{description}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: '#0EA5E9' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginTop: 8 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    gap: 12,
  },
  cardHint: { color: '#64748b' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleInfo: { flex: 1, gap: 2 },
  toggleLabel: { color: '#0f172a', fontWeight: '600' },
  toggleDescription: { color: '#94a3b8', fontSize: 12 },
  inputGroup: { gap: 6 },
  label: { color: '#475569', fontWeight: '600' },
  input: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0f172a',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
  },
  chipSelected: { backgroundColor: '#0A1525', borderColor: '#0A1525' },
  chipText: { color: '#0f172a', fontWeight: '600' },
  chipTextSelected: { color: '#ffffff' },
  primaryButton: {
    backgroundColor: '#0A1525',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryButtonText: { color: '#ffffff', fontWeight: '800' },
  signOutButton: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    paddingVertical: 14,
    alignItems: 'center',
  },
  signOutText: { color: '#dc2626', fontWeight: '800' },
});
