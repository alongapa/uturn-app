import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import {
  Alert,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { blockUser, reportTarget } from '@/services/api/moderation';
import { uploadReportEvidence } from '@/services/api/storage';
import { useUser } from '@/contexts/UserContext';
import type { ReportReason, ReportTargetType } from '@/types/database';

const REASON_LABEL: Record<ReportReason, string> = {
  spam: 'Spam',
  acoso: 'Acoso',
  contenido_inapropiado: 'Contenido inapropiado',
  seguridad: 'Seguridad',
  fraude: 'Fraude',
  otro: 'Otro',
};

const REASONS = Object.keys(REASON_LABEL) as ReportReason[];

type Props = {
  visible: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetUserId?: string | null;
  targetId?: string | null;
  /** Muestra la opción "bloquear también" (solo tiene sentido si hay targetUserId). */
  allowBlock?: boolean;
  onReported?: () => void;
};

/**
 * Hoja de reporte reutilizable (Sesión 9): perfil, viaje, chat, post o
 * respuesta. El servidor valida motivo/tipo (report_target, RPC); la bandeja
 * de moderación (tutor+) la revisa después.
 */
export function ReportSheet({
  visible,
  onClose,
  targetType,
  targetUserId,
  targetId,
  allowBlock = true,
  onReported,
}: Props) {
  const { user } = useUser();
  const [reason, setReason] = useState<ReportReason>('otro');
  const [description, setDescription] = useState('');
  const [evidenceUri, setEvidenceUri] = useState<string | null>(null);
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setReason('otro');
    setDescription('');
    setEvidenceUri(null);
    setAlsoBlock(false);
  };

  const handlePickEvidence = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería para adjuntar evidencia.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (asset?.uri) setEvidenceUri(asset.uri);
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      let evidencePath: string | undefined;
      if (evidenceUri && user?.id) {
        try {
          const uploaded = await uploadReportEvidence(user.id, evidenceUri);
          evidencePath = uploaded.path;
        } catch {
          // La evidencia es opcional; el reporte sigue sin ella si la subida falla.
        }
      }

      await reportTarget({
        targetType,
        reason,
        targetUserId: targetUserId ?? null,
        targetId: targetId ?? null,
        description: description.trim() || null,
        evidencePath,
      });

      if (alsoBlock && targetUserId) {
        await blockUser(targetUserId).catch(() => undefined);
      }

      Alert.alert('Reporte enviado', 'El equipo de moderación lo revisará pronto.');
      reset();
      onReported?.();
      onClose();
    } catch (err) {
      Alert.alert('No se pudo enviar el reporte', err instanceof Error ? err.message : 'Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Reportar</Text>
          <Text style={styles.subtitle}>Cuéntanos qué pasó; tu reporte es confidencial.</Text>

          <Text style={styles.label}>Motivo</Text>
          <View style={styles.chipGroup}>
            {REASONS.map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.chip, reason === r && styles.chipSelected]}
                onPress={() => setReason(r)}
              >
                <Text style={[styles.chipText, reason === r && styles.chipTextSelected]}>{REASON_LABEL[r]}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Detalles (opcional)</Text>
          <TextInput
            style={styles.textArea}
            value={description}
            onChangeText={setDescription}
            placeholder="Describe lo ocurrido"
            multiline
            numberOfLines={3}
            maxLength={1000}
          />

          <TouchableOpacity style={styles.evidenceButton} onPress={handlePickEvidence}>
            <Text style={styles.evidenceButtonText}>
              {evidenceUri ? 'Evidencia adjunta ✓' : 'Adjuntar captura (opcional)'}
            </Text>
          </TouchableOpacity>

          {allowBlock && targetUserId && (
            <TouchableOpacity style={styles.blockRow} onPress={() => setAlsoBlock((v) => !v)}>
              <View style={[styles.checkbox, alsoBlock && styles.checkboxChecked]} />
              <Text style={styles.blockText}>Bloquear también a esta persona</Text>
            </TouchableOpacity>
          )}

          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose} disabled={submitting}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitButton, submitting && styles.disabled]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              <Text style={styles.submitText}>{submitting ? 'Enviando…' : 'Enviar reporte'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 10,
    maxHeight: '85%',
  },
  title: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  subtitle: { color: '#64748b', marginBottom: 4 },
  label: { color: '#334155', fontWeight: '700', fontSize: 13, marginTop: 4 },
  chipGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#ffffff',
  },
  chipSelected: { backgroundColor: '#dc2626', borderColor: '#dc2626' },
  chipText: { color: '#334155', fontWeight: '600', fontSize: 13 },
  chipTextSelected: { color: '#ffffff' },
  textArea: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 10,
    minHeight: 70,
    textAlignVertical: 'top',
    color: '#0f172a',
  },
  evidenceButton: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  evidenceButtonText: { color: '#334155', fontWeight: '600', fontSize: 13 },
  blockRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: '#94a3b8' },
  checkboxChecked: { backgroundColor: '#dc2626', borderColor: '#dc2626' },
  blockText: { color: '#334155', fontSize: 13 },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  cancelButton: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: '#cbd5e1', paddingVertical: 12, alignItems: 'center' },
  cancelText: { color: '#0f172a', fontWeight: '700' },
  submitButton: { flex: 1, borderRadius: 10, backgroundColor: '#dc2626', paddingVertical: 12, alignItems: 'center' },
  submitText: { color: '#ffffff', fontWeight: '800' },
  disabled: { opacity: 0.6 },
});
