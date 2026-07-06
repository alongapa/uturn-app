import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { usePermissions } from '@/hooks/use-permissions';
import type { Guide } from '@/services/api/guides';
import { listGuides } from '@/services/api/guides';
import type { QaQuestion, QaTopic, TopicAssignees } from '@/services/api/qa';
import { listQuestions, listTopicAssignees, listTopics } from '@/services/api/qa';

/**
 * Q&A por temas (Sesión 6): preguntas públicas de la comunidad, respondidas
 * oficialmente por la federación o los tutores asignados a cada tema. Al
 * elegir un tema se muestran además sus responsables y las guías subidas por
 * los tutores (bucket guides).
 */
export default function QAScreen() {
  const permissions = usePermissions();
  const canUploadGuides = permissions.isAtLeast('tutor');

  const [topics, setTopics] = useState<QaTopic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QaQuestion[]>([]);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [assignees, setAssignees] = useState<TopicAssignees | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [topicList, questionList] = await Promise.all([
      listTopics(),
      listQuestions({ topicId: selectedTopic ?? undefined, search: search || undefined }),
    ]);
    setTopics(topicList);
    setQuestions(questionList);
    if (selectedTopic) {
      const [topicGuides, topicAssignees] = await Promise.all([
        listGuides({ topicId: selectedTopic }).catch(() => [] as Guide[]),
        listTopicAssignees(selectedTopic).catch(() => null),
      ]);
      setGuides(topicGuides);
      setAssignees(topicAssignees);
    } else {
      setGuides([]);
      setAssignees(null);
    }
  }, [selectedTopic, search]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      load()
        .then(() => active && setLoadError(false))
        .catch(() => active && setLoadError(true))
        .finally(() => active && setLoading(false));
      return () => {
        active = false;
      };
    }, [load])
  );

  // Búsqueda con debounce sobre el servidor.
  useEffect(() => {
    const timer = setTimeout(() => {
      listQuestions({ topicId: selectedTopic ?? undefined, search: search || undefined })
        .then(setQuestions)
        .catch(() => undefined);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, selectedTopic]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    load()
      .then(() => setLoadError(false))
      .catch(() => setLoadError(true))
      .finally(() => setRefreshing(false));
  }, [load]);

  const openGuide = useCallback((guide: Guide) => {
    if (guide.fileUrl) Linking.openURL(guide.fileUrl).catch(() => undefined);
  }, []);

  const header = (
    <View>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color="#64748b" />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar preguntas"
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.topicsRow}>
        <TouchableOpacity
          style={[styles.topicChip, selectedTopic === null && styles.topicChipActive]}
          onPress={() => setSelectedTopic(null)}
        >
          <Text style={[styles.topicText, selectedTopic === null && styles.topicTextActive]}>
            Todos
          </Text>
        </TouchableOpacity>
        {topics.map((topic) => (
          <TouchableOpacity
            key={topic.id}
            style={[styles.topicChip, selectedTopic === topic.id && styles.topicChipActive]}
            onPress={() => setSelectedTopic((prev) => (prev === topic.id ? null : topic.id))}
          >
            <Text style={[styles.topicText, selectedTopic === topic.id && styles.topicTextActive]}>
              {topic.emoji ? `${topic.emoji} ` : ''}
              {topic.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Responsables del tema: federaciones y tutores (mini-perfil) */}
      {assignees && (assignees.tutors.length > 0 || assignees.publishers.length > 0) && (
        <View style={styles.assigneesCard}>
          <Text style={styles.sectionTitle}>Responden este tema</Text>
          <View style={styles.assigneesRow}>
            {assignees.publishers.map((publisher) => (
              <View key={publisher.id} style={styles.assigneeChip}>
                <Ionicons name="school" size={13} color="#246BFD" />
                <Text style={styles.assigneeText}>{publisher.name}</Text>
              </View>
            ))}
            {assignees.tutors.map((tutor) => (
              <TouchableOpacity
                key={tutor.id}
                style={styles.assigneeChip}
                onPress={() => router.push({ pathname: '/tutor/[id]', params: { id: tutor.id } })}
              >
                <Ionicons name="person" size={13} color="#246BFD" />
                <Text style={styles.assigneeText}>{tutor.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Guías del tema subidas por tutores */}
      {selectedTopic && (guides.length > 0 || canUploadGuides) && (
        <View style={styles.guidesCard}>
          <View style={styles.guidesHeader}>
            <Text style={styles.sectionTitle}>Guías del tema</Text>
            {canUploadGuides && (
              <TouchableOpacity
                style={styles.uploadButton}
                onPress={() =>
                  router.push({ pathname: '/guides/upload', params: { topicId: selectedTopic } })
                }
              >
                <Ionicons name="cloud-upload" size={14} color="#ffffff" />
                <Text style={styles.uploadButtonText}>Subir guía</Text>
              </TouchableOpacity>
            )}
          </View>
          {guides.length === 0 ? (
            <Text style={styles.emptyInline}>Aún no hay guías para este tema.</Text>
          ) : (
            guides.map((guide) => (
              <TouchableOpacity key={guide.id} style={styles.guideRow} onPress={() => openGuide(guide)}>
                <Ionicons
                  name={guide.fileKind === 'pdf' ? 'document-text' : 'image'}
                  size={20}
                  color="#246BFD"
                />
                <View style={styles.guideBody}>
                  <Text style={styles.guideTitle} numberOfLines={1}>
                    {guide.title}
                  </Text>
                  <Text style={styles.guideMeta} numberOfLines={1}>
                    {guide.fileKind.toUpperCase()} · {guide.authorName}
                  </Text>
                </View>
                <Ionicons name="open-outline" size={16} color="#94a3b8" />
              </TouchableOpacity>
            ))
          )}
        </View>
      )}

      <Text style={styles.sectionTitleList}>Preguntas de la comunidad</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator style={styles.loader} size="large" color="#246BFD" />
      ) : loadError && questions.length === 0 ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>No se pudo cargar el Q&A. Revisa tu conexión.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRefresh}>
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={questions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.questionCard}
              onPress={() => router.push({ pathname: '/qa/[id]', params: { id: item.id } })}
            >
              <View style={styles.questionTop}>
                <Text style={styles.questionTopic}>
                  {item.topicEmoji ? `${item.topicEmoji} ` : ''}
                  {item.topicName}
                </Text>
                {item.answered && (
                  <View style={styles.answeredBadge}>
                    <Ionicons name="checkmark-circle" size={12} color="#16a34a" />
                    <Text style={styles.answeredText}>Respondida</Text>
                  </View>
                )}
              </View>
              <Text style={styles.questionTitle}>{item.title}</Text>
              {item.body ? (
                <Text style={styles.questionBody} numberOfLines={2}>
                  {item.body}
                </Text>
              ) : null}
              <Text style={styles.questionMeta}>
                {item.authorName} · {item.replyCount}{' '}
                {item.replyCount === 1 ? 'respuesta' : 'respuestas'}
              </Text>
            </TouchableOpacity>
          )}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <Text style={styles.empty}>
              Nadie ha preguntado sobre esto todavía. ¡Haz la primera pregunta!
            </Text>
          }
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() =>
          router.push({ pathname: '/qa/ask', params: selectedTopic ? { topicId: selectedTopic } : {} })
        }
        accessibilityLabel="Hacer una pregunta"
      >
        <Ionicons name="add" size={28} color="#ffffff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7fb' },
  loader: { marginTop: 48 },
  errorBox: { alignItems: 'center', marginTop: 48, gap: 12, paddingHorizontal: 24 },
  errorText: { color: '#475569', textAlign: 'center' },
  retryButton: { backgroundColor: '#0A1525', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 9 },
  retryText: { color: '#ffffff', fontWeight: '700' },
  listContent: { padding: 12, paddingBottom: 90 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: { flex: 1, color: '#0f172a', padding: 0 },
  topicsRow: { marginTop: 10, marginBottom: 4 },
  topicChip: {
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 7,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginRight: 8,
  },
  topicChipActive: { backgroundColor: '#246BFD', borderColor: '#246BFD' },
  topicText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  topicTextActive: { color: '#ffffff' },
  sectionTitle: { fontWeight: '800', color: '#0f172a', fontSize: 14 },
  sectionTitleList: { fontWeight: '800', color: '#0f172a', fontSize: 15, marginTop: 12, marginBottom: 6 },
  assigneesCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginTop: 10,
    gap: 8,
  },
  assigneesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  assigneeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#eef4ff',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  assigneeText: { color: '#246BFD', fontWeight: '700', fontSize: 12 },
  guidesCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginTop: 10,
    gap: 8,
  },
  guidesHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#0A1525',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  uploadButtonText: { color: '#ffffff', fontWeight: '700', fontSize: 12 },
  emptyInline: { color: '#94a3b8', fontSize: 13 },
  guideRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  guideBody: { flex: 1 },
  guideTitle: { fontWeight: '700', color: '#0f172a', fontSize: 14 },
  guideMeta: { color: '#94a3b8', fontSize: 12 },
  questionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    marginBottom: 8,
    gap: 5,
  },
  questionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  questionTopic: { color: '#246BFD', fontWeight: '700', fontSize: 12 },
  answeredBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  answeredText: { color: '#16a34a', fontWeight: '700', fontSize: 11 },
  questionTitle: { fontWeight: '800', color: '#0f172a', fontSize: 15 },
  questionBody: { color: '#475569', fontSize: 13 },
  questionMeta: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  empty: { color: '#94a3b8', textAlign: 'center', marginTop: 24, paddingHorizontal: 24 },
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0A1525',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
});
