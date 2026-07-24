import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native';

import { useUser } from '@/contexts/UserContext';
import { getProfileRow } from '@/services/api/profiles';
import {
  deleteMyAccount,
  exportMyData,
  setEmergencyContact,
  setProfileVisibility,
} from '@/services/api/privacy';
import { isSupabaseConfigured } from '@/services/supabase';

/**
 * Privacidad y seguridad de la cuenta (Sesión 9): contacto de emergencia (para
 * el SOS), visibilidad del perfil público, reglas de comunidad, lista de
 * bloqueados, exportar datos y eliminar la cuenta. El borrado real pasa por la
 * Edge Function delete-account (verifica el JWT y borra auth.users).
 */
export default function PrivacySecurityScreen() {
  const { user, clearUser } = useUser();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [profilePublic, setProfilePublic] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !user?.id) {
      setLoading(false);
      return;
    }
    try {
      const row = await getProfileRow(user.id);
      if (row) {
        setContactName(row.emergency_contact_name ?? '');
        setContactPhone(row.emergency_contact_phone ?? '');
        setProfilePublic(row.profile_visibility !== 'oculto');
      }
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSaveContact = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      await setEmergencyContact(user.id, contactName.trim(), contactPhone.trim());
      Alert.alert('Guardado', 'Tu contacto de emergencia se usará al activar el SOS.');
    } catch (err) {
      Alert.alert('No se pudo guardar', err instanceof Error ? err.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleVisibility = async (value: boolean) => {
    if (!user?.id) return;
    setProfilePublic(value);
    try {
      await setProfileVisibility(user.id, value ? 'publico' : 'oculto');
    } catch {
      setProfilePublic(!value);
      Alert.alert('No se pudo cambiar la visibilidad del perfil.');
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await exportMyData();
      const json = JSON.stringify(data, null, 2);
      if (Platform.OS === 'web') {
        Alert.alert('Datos exportados', 'Copia tus datos desde la consola del navegador.');
        // eslint-disable-next-line no-console
        console.log('unities-export', json);
      } else {
        await Share.share({ message: json.slice(0, 20000), title: 'Mis datos Unities' });
      }
    } catch (err) {
      Alert.alert('No se pudo exportar', err instanceof Error ? err.message : 'Intenta de nuevo.');
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Eliminar cuenta',
      'Esto borrará tu cuenta y tus datos personales de forma permanente. No se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar definitivamente',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteMyAccount();
              clearUser();
              Alert.alert('Cuenta eliminada', 'Lamentamos verte partir.');
              router.replace('/');
            } catch (err) {
              Alert.alert('No se pudo eliminar', err instanceof Error ? err.message : 'Intenta de nuevo.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#2563eb" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Contacto de emergencia</Text>
      <View style={styles.card}>
        <Text style={styles.cardHint}>Le avisaremos con tu ubicación si activas el botón SOS en un viaje.</Text>
        <TextInput style={styles.input} placeholder="Nombre" value={contactName} onChangeText={setContactName} />
        <TextInput
          style={styles.input}
          placeholder="Teléfono (+56 9 ...)"
          value={contactPhone}
          onChangeText={setContactPhone}
          keyboardType="phone-pad"
        />
        <TouchableOpacity style={styles.primaryButton} onPress={handleSaveContact} disabled={saving}>
          <Text style={styles.primaryButtonText}>{saving ? 'Guardando…' : 'Guardar contacto'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Perfil público</Text>
      <View style={styles.card}>
        <View style={styles.toggleRow}>
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleLabel}>Perfil visible para otros</Text>
            <Text style={styles.toggleDescription}>
              Si lo desactivas, solo tus compañeros de viaje confirmados podrán ver tu perfil.
            </Text>
          </View>
          <Switch value={profilePublic} onValueChange={handleToggleVisibility} trackColor={{ true: '#0EA5E9' }} />
        </View>
      </View>

      <Text style={styles.sectionTitle}>Seguridad y comunidad</Text>
      <View style={styles.card}>
        <LinkRow icon="people-outline" label="Reglas de la comunidad" onPress={() => router.push('/community-rules')} />
        <LinkRow icon="ban-outline" label="Usuarios bloqueados" onPress={() => router.push('/blocked-users')} />
        <LinkRow icon="shield-checkmark-outline" label="Verificación reforzada de conductor" onPress={() => router.push('/driver-verification')} />
      </View>

      <Text style={styles.sectionTitle}>Tus datos</Text>
      <View style={styles.card}>
        <TouchableOpacity style={styles.dataButton} onPress={handleExport} disabled={exporting}>
          <Ionicons name="download-outline" size={18} color="#2563eb" />
          <Text style={styles.dataButtonText}>{exporting ? 'Exportando…' : 'Exportar mis datos'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete} disabled={deleting}>
          <Ionicons name="trash-outline" size={18} color="#dc2626" />
          <Text style={styles.deleteButtonText}>{deleting ? 'Eliminando…' : 'Eliminar mi cuenta'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function LinkRow({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.linkRow} onPress={onPress}>
      <Ionicons name={icon} size={18} color="#475569" />
      <Text style={styles.linkLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginTop: 8 },
  card: { backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 16, gap: 12 },
  cardHint: { color: '#64748b', fontSize: 13 },
  input: { backgroundColor: '#f8fafc', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#0f172a', borderWidth: 1, borderColor: '#e2e8f0' },
  primaryButton: { backgroundColor: '#0A1525', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  primaryButtonText: { color: '#ffffff', fontWeight: '800' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleInfo: { flex: 1, gap: 2 },
  toggleLabel: { color: '#0f172a', fontWeight: '600' },
  toggleDescription: { color: '#94a3b8', fontSize: 12 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  linkLabel: { flex: 1, color: '#0f172a', fontWeight: '600' },
  dataButton: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: '#eff6ff', borderRadius: 10, paddingVertical: 12, justifyContent: 'center' },
  dataButtonText: { color: '#2563eb', fontWeight: '700' },
  deleteButton: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fef2f2', borderRadius: 10, paddingVertical: 12, justifyContent: 'center' },
  deleteButtonText: { color: '#dc2626', fontWeight: '800' },
});
