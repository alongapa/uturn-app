import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import type { OfficialAbility, QaQuestion, QaReply } from '@/services/api/qa';
import {
  addQuestionReply,
  getOfficialAbility,
  getQuestion,
  listQuestionReplies,
  subscribeToQuestion,
} from '@/services/api/qa';

/**
 * Detalle de pregunta (Sesión 6): la respuesta oficial (federación o tutor
 * asignado, RLS del servidor) queda destacada arriba; el resto de la
 * comunidad comenta abajo. Las respuestas entran en vivo (realtime).
 */
export default function QuestionDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const questionId = typeof id === 'string' ? id : undefined;

  const [question, setQuestion] = useState<QaQuestion | null>(null);
  const [replies, setReplies] = useState<QaReply[]>([]);
  const [ability, setAbility] = useState<OfficialAbility>({ canAnswer: false });
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [official, setOfficial] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!questionId) return;
    const q = await getQuestion(questionId);
    setQuestion(q);
    if (q) {
      const [replyList, officialAbility] = await Promise.all([
        listQuestionReplies(questionId),
        getOfficialAbility(q.topicId).catch(() => ({ canAnswer: false }) as OfficialAbility),
      ]);
      setReplies(replyList);
      setAbility(officialAbility);
    }
  }, [questionId]);

  useEffect(() => {
    let active = true;
    load()
      .catch(() => undefined)
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [load]);

  // Respuestas nuevas en vivo.
  useEffect(() => {
    if (!questionId) return;
    const channel = subscribeToQuestion(questionId, () => {
      load().catch(() => undefined);
    });
    return () => {
      channel.unsubscribe();
    };
  }, [questionId, load]);

  const officialReplies = useMemo(() => replies.filter((r) => r.isOfficial), [replies]);
  const comments = useMemo(() => replies.filter((r) => !r.isOfficial), [replies]);

  const handleSend = useCallback(() => {
    if (!questionId || sending) return;
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    addQuestionReply(questionId, body, {
      official: official && ability.canAnswer,
      publisherId: ability.publisherId,
    })
      .then(() => {
        setDraft('');
        setOfficial(false);
        return load();
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : 'No se pudo publicar la respuesta.';
        Alert.alert(message);
      })
      .finally(() => setSending(false));
  }, [questionId, draft, official, ability, sending, load]);

  const renderReply = useCallback(
    ({ item }: { item: QaReply }) => (
      <View style={[styles.replyCard, item.isOfficial && styles.replyOfficial]}>
        {item.isOfficial && (
          <View style={styles.officialBadge}>
            <Ionicons name="shield-checkmark" size={12} color="#ffffff" />
            <Text style={styles.officialBadgeText}>
              Respuesta oficial · {item.publisherName ?? item.authorName}
            </Text>
          </View>
        )}
        <Text style={styles.replyBody}>{item.body}</Text>
        <Text style={styles.replyMeta}>
          {item.isOfficial && item.publisherName
            ? `${item.authorName} por ${item.publisherName}`
            : item.authorName}{' '}
          · {new Date(item.createdAt).toLocaleDateString('es-CL')}
        </Text>
      </View>
    ),
    []
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator style={styles.loader} size="large" color="#246BFD" />
      </View>
    );
  }

  if (!question) {
    return (
      <View style={styles.container}>
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>Pregunta no encontrada.</Text>
        </View>
      </View>
    );
  }

  const header = (
    <View style={styles.headerWrap}>
      <View style={styles.questionCard}>
        <Text style={styles.questionTopic}>
          {question.topicEmoji ? `${question.topicEmoji} ` : ''}
          {question.topicName}
        </Text>
        <Text style={styles.questionTitle}>{question.title}</Text>
        {question.body ? <Text style={styles.questionBody}>{question.body}</Text> : null}
        <Text style={styles.questionMeta}>Preguntó {question.authorName}</Text>
      </View>

      {officialReplies.length > 0 && (
        <View style={styles.officialSection}>
          {officialReplies.map((reply) => (
            <View key={reply.id}>{renderReply({ item: reply })}</View>
          ))}
        </View>
      )}

      <Text style={styles.sectionTitle}>
        {comments.length === 0
          ? 'Comentarios'
          : `Comentarios (${comments.length})`}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={comments}
        keyExtractor={(item) => item.id}
        renderItem={renderReply}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {officialReplies.length > 0
              ? 'Nadie ha comentado todavía.'
              : 'Aún no hay respuestas. Los responsables del tema recibirán tu pregunta.'}
          </Text>
        }
        contentContainerStyle={styles.listContent}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        {ability.canAnswer && (
          <View style={styles.officialToggle}>
            <View style={styles.officialToggleInfo}>
              <Ionicons name="shield-checkmark" size={14} color="#246BFD" />
              <Text style={styles.officialToggleText}>
                Responder oficialmente
                {ability.publisherName ? ` como ${ability.publisherName}` : ''}
              </Text>
            </View>
            <Switch
              value={official}
              onValueChange={setOfficial}
              trackColor={{ true: '#246BFD', false: '#cbd5e1' }}
              thumbColor="#ffffff"
            />
          </View>
        )}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder={official ? 'Escribe la respuesta oficial' : 'Escribe un comentario'}
            placeholderTextColor="#94a3b8"
            value={draft}
            onChangeText={setDraft}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendButton, (sending || !draft.trim()) && styles.sendDisabled]}
            onPress={handleSend}
            disabled={sending || !draft.trim()}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Ionicons name="send" size={17} color="#ffffff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7fb' },
  loader: { marginTop: 48 },
  errorBox: { alignItems: 'center', marginTop: 48, paddingHorizontal: 24 },
  errorText: { color: '#475569', textAlign: 'center' },
  listContent: { padding: 12, paddingBottom: 20 },
  headerWrap: { gap: 10 },
  questionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    gap: 6,
  },
  questionTopic: { color: '#246BFD', fontWeight: '700', fontSize: 12 },
  questionTitle: { fontWeight: '800', color: '#0f172a', fontSize: 17 },
  questionBody: { color: '#475569', fontSize: 14, lineHeight: 20 },
  questionMeta: { color: '#94a3b8', fontSize: 12, marginTop: 4 },
  officialSection: { gap: 8 },
  sectionTitle: { fontWeight: '800', color: '#0f172a', fontSize: 14, marginTop: 4, marginBottom: 2 },
  replyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginBottom: 8,
    gap: 6,
  },
  replyOfficial: { borderColor: '#246BFD', borderWidth: 1.5, backgroundColor: '#f5f9ff' },
  officialBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#246BFD',
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  officialBadgeText: { color: '#ffffff', fontWeight: '800', fontSize: 11 },
  replyBody: { color: '#0f172a', fontSize: 14, lineHeight: 20 },
  replyMeta: { color: '#94a3b8', fontSize: 12 },
  empty: { color: '#94a3b8', textAlign: 'center', marginTop: 16, paddingHorizontal: 24 },
  officialToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#eef4ff',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  officialToggleInfo: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  officialToggleText: { color: '#246BFD', fontWeight: '700', fontSize: 13 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 10,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  input: {
    flex: 1,
    maxHeight: 110,
    backgroundColor: '#f1f5f9',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    color: '#0f172a',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#246BFD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.5 },
});
