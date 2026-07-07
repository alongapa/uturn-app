import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useUser } from '@/contexts/UserContext';
import { openDispute } from '@/services/api/payments';
import { uploadDisputeEvidence } from '@/services/api/storage';
import { isSupabaseConfigured } from '@/services/supabase';

/**
 * Flujo "yo sí pagué" (Sesión 8): el pasajero adjunta un comprobante y explica el
 * caso. Al enviar, el servidor congela el strike y abre un ticket de Soporte
 * Unities hasta que admin/owner resuelva. El strike no cuenta mientras se revisa.
 */
export default function DisputeScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId?: string }>();
  const { user, isAuthenticated } = useUser();
  const online = isSupabaseConfigured && isAuthenticated;

  const [reason, setReason] = useState('');
  const [evidenceUri, setEvidenceUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handlePickEvidence = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería para adjuntar el comprobante.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (result.canceled) return;
    const uri = result.assets?.[0]?.uri;
    if (uri) setEvidenceUri(uri);
  };

  const handleSubmit = async () => {
    if (!bookingId) {
      Alert.alert('No encontramos la reserva de esta disputa.');
      return;
    }
    if (!online || !user) {
      Alert.alert('Necesitas iniciar sesión para abrir una disputa.');
      return;
    }
    setSubmitting(true);
    try {
      let evidencePath: string | undefined;
      if (evidenceUri) {
        const uploaded = await uploadDisputeEvidence(user.id, evidenceUri);
        evidencePath = uploaded.path;
      }
      const dispute = await openDispute(bookingId, reason.trim(), evidencePath);
      Alert.alert(
        'Disputa enviada',
        'Congelamos el strike mientras revisamos tu comprobante. Puedes seguir el caso en Soporte Unities.',
        [
          {
            text: 'Ir a soporte',
            onPress: () =>
              dispute.conversationId
                ? router.replace({ pathname: '/chat/[id]', params: { id: dispute.conversationId } })
                : router.replace('/(tabs)/my-trips'),
          },
          { text: 'Cerrar', style: 'cancel', onPress: () => router.replace('/(tabs)/my-trips') },
        ]
      );
    } catch (err) {
      Alert.alert('No se pudo abrir la disputa', err instanceof Error ? err.message : 'Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerCard}>
        <Ionicons name="shield-checkmark-outline" size={28} color="#1d4ed8" />
        <Text style={styles.title}>Yo sí pagué</Text>
        <Text style={styles.subtitle}>
          Si transferiste y aun así aparece un strike, envíanos el comprobante. Congelaremos el strike
          hasta que un moderador revise tu caso.
        </Text>
      </View>

      <Text style={styles.label}>Cuéntanos qué pasó</Text>
      <TextInput
        value={reason}
        onChangeText={setReason}
        style={styles.input}
        placeholder="Ej: transferí a tiempo pero el pago no se verificó automáticamente."
        multiline
        numberOfLines={4}
      />

      <Text style={styles.label}>Comprobante de transferencia</Text>
      <TouchableOpacity style={styles.evidenceButton} onPress={handlePickEvidence}>
        <Ionicons name="image-outline" size={18} color="#1d4ed8" />
        <Text style={styles.evidenceButtonText}>
          {evidenceUri ? 'Cambiar comprobante' : 'Adjuntar comprobante'}
        </Text>
      </TouchableOpacity>
      {evidenceUri && <Image source={{ uri: evidenceUri }} style={styles.preview} />}

      <TouchableOpacity
        style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.submitButtonText}>Enviar disputa</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.hint}>
        Enviar un comprobante falso puede derivar en sanciones. La revisión la hace el equipo de
        Unities.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 20, gap: 10 },
  headerCard: { backgroundColor: '#eff6ff', borderRadius: 14, padding: 16, gap: 6, marginBottom: 6 },
  title: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  subtitle: { color: '#475569', lineHeight: 20 },
  label: { color: '#0f172a', fontWeight: '700', marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    minHeight: 96,
    textAlignVertical: 'top',
    color: '#0f172a',
  },
  evidenceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    paddingVertical: 12,
  },
  evidenceButtonText: { color: '#1d4ed8', fontWeight: '700' },
  preview: { width: '100%', height: 220, borderRadius: 12, marginTop: 8, resizeMode: 'cover' },
  submitButton: {
    marginTop: 12,
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: '#ffffff', fontWeight: '800', fontSize: 16 },
  hint: { color: '#94a3b8', fontSize: 12, marginTop: 8, lineHeight: 17 },
});
