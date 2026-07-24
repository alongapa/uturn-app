import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useUser } from '@/contexts/UserContext';
import { getMyDriverVerification, submitDriverVerification } from '@/services/api/identity';
import type { DriverVerificationStatus } from '@/types/database';

const STATUS_COPY: Record<DriverVerificationStatus, { label: string; color: string; bg: string }> = {
  pendiente: { label: 'No enviada', color: '#64748b', bg: '#f1f5f9' },
  en_revision: { label: 'En revisión', color: '#b45309', bg: '#fef3c7' },
  aprobado: { label: 'Aprobada', color: '#15803d', bg: '#dcfce7' },
  rechazado: { label: 'Rechazada', color: '#b91c1c', bg: '#fee2e2' },
};

/**
 * Verificación reforzada de conductor (Sesión 9): sube cédula + licencia para
 * revisión humana. Si el owner activa require_reinforced_driver_verification,
 * publicar viajes exige que esté 'aprobado' (lo enforcea el trigger en el
 * servidor). Los documentos van al bucket privado driver-documents.
 */
export default function DriverVerificationScreen() {
  const { user } = useUser();
  const [status, setStatus] = useState<DriverVerificationStatus>('pendiente');
  const [reviewNote, setReviewNote] = useState<string | null>(null);
  const [idUri, setIdUri] = useState<string | null>(null);
  const [licenseUri, setLicenseUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      const row = await getMyDriverVerification(user.id);
      if (row) {
        setStatus(row.status);
        setReviewNote(row.review_note);
      }
    } catch {
      // Sin verificación previa: queda en 'pendiente'.
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const pickImage = async (setter: (uri: string) => void) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!result.canceled && result.assets[0]?.uri) setter(result.assets[0].uri);
  };

  const handleSubmit = async () => {
    if (!user?.id) return;
    if (!idUri || !licenseUri) {
      Alert.alert('Faltan documentos', 'Sube una foto de tu cédula y de tu licencia de conducir.');
      return;
    }
    setSubmitting(true);
    try {
      await submitDriverVerification(idUri, licenseUri, user.id);
      Alert.alert('Enviado', 'Tu verificación quedó en revisión. Te avisaremos cuando esté lista.');
      router.back();
    } catch (err) {
      Alert.alert('No se pudo enviar', err instanceof Error ? err.message : 'Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#2563eb" />
      </View>
    );
  }

  const statusCopy = STATUS_COPY[status];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Verificación reforzada de conductor</Text>
      <Text style={styles.subtitle}>
        Sube tu cédula de identidad y tu licencia de conducir. Un revisor las validará para reforzar la confianza
        de tus pasajeros.
      </Text>

      <View style={[styles.statusPill, { backgroundColor: statusCopy.bg }]}>
        <Text style={[styles.statusText, { color: statusCopy.color }]}>Estado: {statusCopy.label}</Text>
      </View>
      {status === 'rechazado' && reviewNote ? <Text style={styles.rejectNote}>Motivo: {reviewNote}</Text> : null}

      {status !== 'aprobado' && (
        <>
          <DocPicker label="Cédula de identidad" uri={idUri} onPick={() => pickImage(setIdUri)} />
          <DocPicker label="Licencia de conducir" uri={licenseUri} onPick={() => pickImage(setLicenseUri)} />

          <TouchableOpacity style={[styles.submitButton, submitting && styles.disabled]} onPress={handleSubmit} disabled={submitting}>
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.submitText}>{status === 'en_revision' ? 'Reenviar documentos' : 'Enviar a revisión'}</Text>
            )}
          </TouchableOpacity>
        </>
      )}

      {status === 'aprobado' && (
        <View style={styles.approvedBox}>
          <Ionicons name="shield-checkmark" size={28} color="#16a34a" />
          <Text style={styles.approvedText}>Tu verificación reforzada está aprobada.</Text>
        </View>
      )}
    </ScrollView>
  );
}

function DocPicker({ label, uri, onPick }: { label: string; uri: string | null; onPick: () => void }) {
  return (
    <View style={styles.docBlock}>
      <Text style={styles.docLabel}>{label}</Text>
      <TouchableOpacity style={styles.docButton} onPress={onPick}>
        {uri ? (
          <Image source={{ uri }} style={styles.docImage} contentFit="cover" />
        ) : (
          <View style={styles.docPlaceholder}>
            <Ionicons name="camera-outline" size={26} color="#94a3b8" />
            <Text style={styles.docPlaceholderText}>Subir foto</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 20, gap: 14, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  subtitle: { color: '#475569', lineHeight: 20 },
  statusPill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  statusText: { fontWeight: '800', fontSize: 13 },
  rejectNote: { color: '#b91c1c' },
  docBlock: { gap: 6 },
  docLabel: { color: '#334155', fontWeight: '700' },
  docButton: { borderRadius: 12, overflow: 'hidden' },
  docImage: { width: '100%', height: 180, borderRadius: 12, backgroundColor: '#f1f5f9' },
  docPlaceholder: { height: 120, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: '#f8fafc' },
  docPlaceholderText: { color: '#94a3b8', fontWeight: '600' },
  submitButton: { backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 6 },
  submitText: { color: '#ffffff', fontWeight: '800' },
  disabled: { opacity: 0.6 },
  approvedBox: { alignItems: 'center', gap: 8, padding: 20 },
  approvedText: { color: '#16a34a', fontWeight: '700' },
});
