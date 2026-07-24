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

import { useNotifications } from '@/contexts/NotificationsContext';
import { useUser } from '@/contexts/UserContext';
import { useAppState } from '@/store/appState';

// Tipos de cuenta sugeridos; BankDetails (Sesión 1) acepta cualquier string.
const ACCOUNT_TYPES = ['Cuenta Corriente', 'Cuenta Vista', 'CuentaRUT', 'Ahorro'];

export default function SettingsScreen() {
  const {
    settings,
    updatePrivacyPrefs,
    currentUser,
    setCurrentUser,
  } = useAppState();
  const { clearUser } = useUser();
  // Sesión 7: las preferencias de notificación viven en el servidor
  // (notification_prefs) y se respetan antes de encolar cualquier push.
  const { prefs, setPref } = useNotifications();

  const bank = currentUser?.datosBancarios;
  const [banco, setBanco] = useState(bank?.banco ?? '');
  const [tipoCuenta, setTipoCuenta] = useState(bank?.tipoCuenta ?? 'Cuenta Corriente');
  const [numeroCuenta, setNumeroCuenta] = useState(bank?.numeroCuenta ?? '');
  const [titular, setTitular] = useState(bank?.titular ?? '');
  const [rut, setRut] = useState(bank?.rut ?? '');

  const handleSaveBank = () => {
    if (!currentUser) return;
    if (!banco.trim() || !numeroCuenta.trim() || !titular.trim()) {
      Alert.alert('Completa banco, número de cuenta y titular antes de guardar.');
      return;
    }
    setCurrentUser({
      ...currentUser,
      datosBancarios: {
        banco: banco.trim(),
        tipoCuenta,
        numeroCuenta: numeroCuenta.trim(),
        titular: titular.trim(),
        rut: rut.trim() || undefined,
      },
    });
    Alert.alert(
      'Datos bancarios guardados',
      'Los pasajeros verán esta cuenta al reservar un cupo en tus viajes.'
    );
  };

  const handleSignOut = () => {
    Alert.alert('Cerrar sesión', '¿Seguro que quieres salir de Unities?', [
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
          label="Pagos"
          description="Recordatorios del plazo de 48 h (24 h y 4 h antes), strikes y confirmaciones."
          value={prefs.pagos}
          onChange={(value) => setPref('pagos', value)}
        />
        <ToggleRow
          label="Viajes"
          description="Reservas en tus viajes y recordatorio 1 h antes de salir."
          value={prefs.viajes}
          onChange={(value) => setPref('viajes', value)}
        />
        <ToggleRow
          label="Social"
          description="Respuestas en Q&A, historias y eventos destacados."
          value={prefs.social}
          onChange={(value) => setPref('social', value)}
        />
        <ToggleRow
          label="Mensajes"
          description="Mensajes de conductores, pasajeros y soporte."
          value={prefs.mensajes}
          onChange={(value) => setPref('mensajes', value)}
        />
        <TouchableOpacity onPress={() => router.push('/notifications')}>
          <Text style={styles.linkText}>Ver historial de notificaciones →</Text>
        </TouchableOpacity>
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
        <TouchableOpacity onPress={() => router.push('/privacy')}>
          <Text style={styles.linkText}>Privacidad, seguridad y datos de tu cuenta →</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Datos bancarios (conductor)</Text>
      <View style={styles.card}>
        <Text style={styles.cardHint}>
          Cuenta donde recibirás los pagos de tus pasajeros. Se muestra al reservar un cupo.
        </Text>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Banco</Text>
          <TextInput value={banco} onChangeText={setBanco} style={styles.input} placeholder="Banco de Chile" />
        </View>
        <Text style={styles.label}>Tipo de cuenta</Text>
        <View style={styles.chipRow}>
          {ACCOUNT_TYPES.map((option) => {
            const selected = tipoCuenta === option;
            return (
              <TouchableOpacity
                key={option}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => setTipoCuenta(option)}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option}</Text>
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
  linkText: { color: '#2563eb', fontWeight: '700', fontSize: 13 },
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
