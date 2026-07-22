import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { getTutorTopicBot, setTutorTopicBot, type AiBot } from '@/services/api/bots';
import { getTutorProfile, type QaTopic } from '@/services/api/qa';

type TopicBotDraft = {
  topic: QaTopic;
  bot: AiBot | null;
  personaName: string;
  systemPrompt: string;
  enabled: boolean;
  saving: boolean;
};

/**
 * Configuración del bot de IA de un tutor, por cada asignatura que tiene
 * asignada (topic_assignees, Sesión 6). El bot responde por DM en nombre del
 * tutor usando sus guías recientes como contexto; el tutor escribe el
 * nombre visible y una FAQ/instrucciones adicionales.
 */
export default function TutorBotsScreen() {
  const { user } = useUser();
  const [drafts, setDrafts] = useState<TopicBotDraft[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const profile = await getTutorProfile(user.id);
    const topics = profile?.topics ?? [];
    const bots = await Promise.all(topics.map((t) => getTutorTopicBot(user.id, t.id)));
    setDrafts(
      topics.map((topic, i) => {
        const bot = bots[i];
        return {
          topic,
          bot,
          personaName: bot?.personaName ?? `Bot de ${topic.name}`,
          systemPrompt: bot?.systemPrompt ?? '',
          enabled: bot?.enabled ?? false,
          saving: false,
        };
      })
    );
  }, [user]);

  useEffect(() => {
    setLoading(true);
    load()
      .catch(() => Alert.alert('No se pudieron cargar tus asignaturas'))
      .finally(() => setLoading(false));
  }, [load]);

  const updateDraft = (topicId: string, patch: Partial<TopicBotDraft>) => {
    setDrafts((prev) => prev.map((d) => (d.topic.id === topicId ? { ...d, ...patch } : d)));
  };

  const handleSave = async (draft: TopicBotDraft) => {
    if (!draft.personaName.trim()) {
      Alert.alert('Ponle un nombre al bot antes de guardar.');
      return;
    }
    updateDraft(draft.topic.id, { saving: true });
    try {
      const bot = await setTutorTopicBot(draft.topic.id, draft.personaName, draft.systemPrompt, draft.enabled);
      updateDraft(draft.topic.id, { bot, saving: false });
      Alert.alert(draft.enabled ? 'Bot activado' : 'Bot guardado', 'Los alumnos ya pueden verlo en tu mini-perfil.');
    } catch (err) {
      updateDraft(draft.topic.id, { saving: false });
      Alert.alert('No se pudo guardar', err instanceof Error ? err.message : 'Intenta de nuevo.');
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#246BFD" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Bots de tutoría</Text>
      <Text style={styles.hint}>
        Un bot de IA por asignatura responde preguntas frecuentes por chat, usando tus guías subidas
        como contexto. Siempre puede fallar o no saber algo — anímales a escribirte directo si necesitan
        más ayuda.
      </Text>

      {drafts.length === 0 ? (
        <Text style={styles.empty}>Todavía no tienes asignaturas asignadas (topic_assignees).</Text>
      ) : (
        drafts.map((draft) => (
          <View key={draft.topic.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>
                {draft.topic.emoji ? `${draft.topic.emoji} ` : ''}
                {draft.topic.name}
              </Text>
              <Switch
                value={draft.enabled}
                onValueChange={(v) => updateDraft(draft.topic.id, { enabled: v })}
                trackColor={{ true: '#0EA5E9' }}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Nombre visible en el chat</Text>
              <TextInput
                value={draft.personaName}
                onChangeText={(v) => updateDraft(draft.topic.id, { personaName: v })}
                style={styles.input}
                placeholder={`Bot de ${draft.topic.name}`}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Instrucciones / preguntas frecuentes (opcional)</Text>
              <TextInput
                value={draft.systemPrompt}
                onChangeText={(v) => updateDraft(draft.topic.id, { systemPrompt: v })}
                style={[styles.input, styles.textarea]}
                placeholder="Ej: Las ayudantías son los martes 18h en sala B12. El certamen 2 es en la semana 9…"
                multiline
                numberOfLines={4}
              />
            </View>
            <TouchableOpacity
              style={[styles.saveButton, draft.saving && styles.disabled]}
              onPress={() => handleSave(draft)}
              disabled={draft.saving}
            >
              {draft.saving ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="sparkles-outline" size={16} color="#ffffff" />
                  <Text style={styles.saveButtonText}>Guardar</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7fb' },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4f7fb' },
  title: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  hint: { color: '#64748b', fontSize: 13, lineHeight: 18, marginTop: -6 },
  empty: { color: '#94a3b8' },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    gap: 10,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  field: { gap: 6 },
  fieldLabel: { color: '#475569', fontWeight: '600', fontSize: 13 },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0f172a',
  },
  textarea: { minHeight: 90, textAlignVertical: 'top' },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#0A1525',
    borderRadius: 10,
    paddingVertical: 12,
  },
  saveButtonText: { color: '#ffffff', fontWeight: '800' },
  disabled: { opacity: 0.6 },
});
