import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import type { QaTopic } from '@/services/api/qa';
import { askQuestion, listTopics } from '@/services/api/qa';

/**
 * Nueva pregunta del Q&A (Sesión 6): se elige el tema (los responsables
 * asignados a ese tema son quienes responden oficialmente), un título y el
 * detalle opcional.
 */
export default function AskQuestionScreen() {
  const { topicId } = useLocalSearchParams<{ topicId?: string }>();

  const [topics, setTopics] = useState<QaTopic[]>([]);
  const [selected, setSelected] = useState<string | null>(typeof topicId === 'string' ? topicId : null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    listTopics().then(setTopics).catch(() => undefined);
  }, []);

  const canSubmit = Boolean(selected) && title.trim().length > 0 && !submitting;

  const handleSubmit = () => {
    if (!selected || !canSubmit) return;
    setSubmitting(true);
    askQuestion(selected, title, body)
      .then((question) =>
        router.replace({ pathname: '/qa/[id]', params: { id: question.id } })
      )
      .catch(() => {
        Alert.alert('No se pudo publicar la pregunta. Intenta de nuevo.');
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

      <Text style={styles.label}>Tu pregunta</Text>
      <TextInput
        style={styles.input}
        placeholder="¿Qué quieres saber?"
        placeholderTextColor="#94a3b8"
        value={title}
        onChangeText={setTitle}
        maxLength={200}
      />

      <Text style={styles.label}>Detalle (opcional)</Text>
      <TextInput
        style={[styles.input, styles.inputMultiline]}
        placeholder="Agrega contexto para que te respondan mejor"
        placeholderTextColor="#94a3b8"
        value={body}
        onChangeText={setBody}
        multiline
        maxLength={2000}
      />

      <TouchableOpacity
        style={[styles.submit, !canSubmit && styles.submitDisabled]}
        onPress={handleSubmit}
        disabled={!canSubmit}
      >
        {submitting ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <Text style={styles.submitText}>Publicar pregunta</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.note}>
        Tu pregunta es pública para la comunidad. Los responsables del tema pueden marcar su
        respuesta como oficial y quedará destacada.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7fb' },
  content: { padding: 16, gap: 8, paddingBottom: 40 },
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
  inputMultiline: { minHeight: 110, textAlignVertical: 'top' },
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
