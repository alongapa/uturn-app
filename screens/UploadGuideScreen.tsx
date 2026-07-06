import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
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

import { usePermissions } from '@/hooks/use-permissions';
import { uploadGuide } from '@/services/api/guides';
import type { QaTopic } from '@/services/api/qa';
import { listTopics } from '@/services/api/qa';
import type { GuideFileKind } from '@/types/database';

/**
 * Subir guía (Sesión 6): solo tutor+ (la RLS del bucket y de la tabla lo
 * re-verifican en el servidor; esta pantalla solo refleja el permiso).
 * Acepta imagen (image picker) o PDF (document picker) con título y tema.
 */
export default function UploadGuideScreen() {
  const { topicId } = useLocalSearchParams<{ topicId?: string }>();
  const permissions = usePermissions();

  const [topics, setTopics] = useState<QaTopic[]>([]);
  const [selected, setSelected] = useState<string | null>(typeof topicId === 'string' ? topicId : null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [fileKind, setFileKind] = useState<GuideFileKind>('imagen');
  const [fileName, setFileName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    listTopics().then(setTopics).catch(() => undefined);
  }, []);

  if (!permissions.isAtLeast('tutor')) {
    return (
      <View style={styles.container}>
        <View style={styles.errorBox}>
          <Ionicons name="lock-closed" size={28} color="#94a3b8" />
          <Text style={styles.errorText}>Solo los tutores pueden subir guías.</Text>
        </View>
      </View>
    );
  }

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setFileUri(result.assets[0].uri);
      setFileKind('imagen');
      setFileName(result.assets[0].fileName ?? 'imagen');
    }
  };

  const pickPdf = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setFileUri(result.assets[0].uri);
      setFileKind('pdf');
      setFileName(result.assets[0].name ?? 'documento.pdf');
    }
  };

  const canSubmit = Boolean(selected) && title.trim().length > 0 && Boolean(fileUri) && !submitting;

  const handleSubmit = () => {
    if (!selected || !fileUri || !canSubmit) return;
    setSubmitting(true);
    uploadGuide({
      topicId: selected,
      title,
      description: description || undefined,
      fileUri,
      fileKind,
    })
      .then(() => {
        Alert.alert('Guía publicada', 'Ya está disponible en el Q&A de su tema.');
        router.back();
      })
      .catch(() => {
        Alert.alert('No se pudo subir la guía. Intenta de nuevo.');
        setSubmitting(false);
      });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Tema</Text>
      <View style={styles.topicsWrap}>
        {topics.map((topic) => (
          <TouchableOpacity
            key={topic.id}
            style={[styles.topicChip, selected === topic.id && styles.topicChipActive]}
            onPress={() => setSelected(topic.id)}
          >
            <Text style={[styles.topicText, selected === topic.id && styles.topicTextActive]}>
              {topic.emoji ? `${topic.emoji} ` : ''}
              {topic.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Título</Text>
      <TextInput
        style={styles.input}
        placeholder="Ej: Resumen certamen 1 — Cálculo"
        placeholderTextColor="#94a3b8"
        value={title}
        onChangeText={setTitle}
        maxLength={150}
      />

      <Text style={styles.label}>Descripción (opcional)</Text>
      <TextInput
        style={[styles.input, styles.inputMultiline]}
        placeholder="¿Qué incluye la guía?"
        placeholderTextColor="#94a3b8"
        value={description}
        onChangeText={setDescription}
        multiline
      />

      <Text style={styles.label}>Archivo</Text>
      <View style={styles.pickers}>
        <TouchableOpacity style={styles.pickerButton} onPress={pickImage}>
          <Ionicons name="image" size={18} color="#246BFD" />
          <Text style={styles.pickerText}>Imagen</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.pickerButton} onPress={pickPdf}>
          <Ionicons name="document-text" size={18} color="#246BFD" />
          <Text style={styles.pickerText}>PDF</Text>
        </TouchableOpacity>
      </View>

      {fileUri && (
        <View style={styles.filePreview}>
          {fileKind === 'imagen' ? (
            <Image source={{ uri: fileUri }} style={styles.previewImage} />
          ) : (
            <Ionicons name="document-text" size={34} color="#246BFD" />
          )}
          <Text style={styles.fileName} numberOfLines={1}>
            {fileName}
          </Text>
          <TouchableOpacity onPress={() => setFileUri(null)}>
            <Ionicons name="close-circle" size={20} color="#94a3b8" />
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity
        style={[styles.submit, !canSubmit && styles.submitDisabled]}
        onPress={handleSubmit}
        disabled={!canSubmit}
      >
        {submitting ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <Text style={styles.submitText}>Publicar guía</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.note}>
        La guía queda visible para toda la comunidad desde el Q&A del tema y tu mini-perfil de tutor.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7fb' },
  content: { padding: 16, gap: 8, paddingBottom: 40 },
  errorBox: { alignItems: 'center', marginTop: 64, gap: 10, paddingHorizontal: 24 },
  errorText: { color: '#475569', textAlign: 'center' },
  label: { fontWeight: '800', color: '#0f172a', marginTop: 8 },
  topicsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  topicChip: {
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 7,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  topicChipActive: { backgroundColor: '#246BFD', borderColor: '#246BFD' },
  topicText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  topicTextActive: { color: '#ffffff' },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#0f172a',
  },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  pickers: { flexDirection: 'row', gap: 10 },
  pickerButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 12,
  },
  pickerText: { color: '#246BFD', fontWeight: '700' },
  filePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 10,
  },
  previewImage: { width: 48, height: 48, borderRadius: 8 },
  fileName: { flex: 1, color: '#0f172a', fontWeight: '600' },
  submit: {
    backgroundColor: '#246BFD',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 12,
  },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: '#ffffff', fontWeight: '800' },
  note: { color: '#94a3b8', fontSize: 12, textAlign: 'center', marginTop: 6 },
});
