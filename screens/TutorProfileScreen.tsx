import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useUser } from '@/contexts/UserContext';
import type { Guide } from '@/services/api/guides';
import { listGuides } from '@/services/api/guides';
import { startDm } from '@/services/api/messages';
import type { TutorProfile } from '@/services/api/qa';
import { getTutorProfile } from '@/services/api/qa';

/**
 * Mini-perfil de tutor (Sesión 6): sus temas asignados, sus guías subidas
 * (bucket guides) y un acceso directo para escribirle por DM.
 */
export default function TutorProfileScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const tutorId = typeof id === 'string' ? id : undefined;
  const { user } = useUser();

  const [tutor, setTutor] = useState<TutorProfile | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingDm, setOpeningDm] = useState(false);

  useEffect(() => {
    if (!tutorId) return;
    let active = true;
    Promise.all([getTutorProfile(tutorId), listGuides({ authorId: tutorId })])
      .then(([profile, tutorGuides]) => {
        if (!active) return;
        setTutor(profile);
        setGuides(tutorGuides);
      })
      .catch(() => undefined)
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [tutorId]);

  const handleMessage = () => {
    if (!tutorId || openingDm) return;
    setOpeningDm(true);
    startDm(tutorId)
      .then((conversation) =>
        router.push({ pathname: '/chat/[id]', params: { id: conversation.id } })
      )
      .catch((err) => Alert.alert(err?.message ?? 'No se pudo abrir el chat.'))
      .finally(() => setOpeningDm(false));
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator style={styles.loader} size="large" color="#246BFD" />
      </View>
    );
  }

  if (!tutor) {
    return (
      <View style={styles.container}>
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>Perfil no encontrado.</Text>
        </View>
      </View>
    );
  }

  const initials = tutor.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        {tutor.avatarUrl ? (
          <Image source={{ uri: tutor.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarInitials}>{initials || 'T'}</Text>
          </View>
        )}
        <Text style={styles.name}>{tutor.name}</Text>
        <View style={styles.roleBadge}>
          <Ionicons name="school" size={12} color="#246BFD" />
          <Text style={styles.roleText}>Tutor Unities</Text>
        </View>

        {tutor.topics.length > 0 && (
          <View style={styles.topicsWrap}>
            {tutor.topics.map((topic) => (
              <View key={topic.id} style={styles.topicChip}>
                <Text style={styles.topicText}>
                  {topic.emoji ? `${topic.emoji} ` : ''}
                  {topic.name}
                </Text>
              </View>
            ))}
          </View>
        )}

        {user?.id !== tutor.id && (
          <TouchableOpacity style={styles.messageButton} onPress={handleMessage} disabled={openingDm}>
            <Ionicons name="chatbubble-ellipses" size={16} color="#ffffff" />
            <Text style={styles.messageButtonText}>Enviar mensaje</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.sectionTitle}>
        Guías subidas {guides.length > 0 ? `(${guides.length})` : ''}
      </Text>
      {guides.length === 0 ? (
        <Text style={styles.empty}>Este tutor aún no ha subido guías.</Text>
      ) : (
        guides.map((guide) => (
          <TouchableOpacity
            key={guide.id}
            style={styles.guideRow}
            onPress={() => guide.fileUrl && Linking.openURL(guide.fileUrl).catch(() => undefined)}
          >
            <Ionicons
              name={guide.fileKind === 'pdf' ? 'document-text' : 'image'}
              size={22}
              color="#246BFD"
            />
            <View style={styles.guideBody}>
              <Text style={styles.guideTitle}>{guide.title}</Text>
              {guide.description ? (
                <Text style={styles.guideDescription} numberOfLines={2}>
                  {guide.description}
                </Text>
              ) : null}
              <Text style={styles.guideMeta}>
                {guide.fileKind.toUpperCase()} ·{' '}
                {new Date(guide.createdAt).toLocaleDateString('es-CL')}
              </Text>
            </View>
            <Ionicons name="open-outline" size={16} color="#94a3b8" />
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7fb' },
  content: { padding: 16, paddingBottom: 40, gap: 8 },
  loader: { marginTop: 48 },
  errorBox: { alignItems: 'center', marginTop: 48, paddingHorizontal: 24 },
  errorText: { color: '#475569', textAlign: 'center' },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  avatar: { width: 84, height: 84, borderRadius: 42 },
  avatarFallback: { backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { color: '#246BFD', fontWeight: '800', fontSize: 28 },
  name: { fontSize: 19, fontWeight: '800', color: '#0f172a' },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#eef4ff',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  roleText: { color: '#246BFD', fontWeight: '700', fontSize: 12 },
  topicsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 4 },
  topicChip: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  topicText: { color: '#475569', fontWeight: '600', fontSize: 12 },
  messageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#246BFD',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginTop: 8,
  },
  messageButtonText: { color: '#ffffff', fontWeight: '800' },
  sectionTitle: { fontWeight: '800', color: '#0f172a', fontSize: 15, marginTop: 10 },
  empty: { color: '#94a3b8' },
  guideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
  },
  guideBody: { flex: 1, gap: 2 },
  guideTitle: { fontWeight: '700', color: '#0f172a', fontSize: 14 },
  guideDescription: { color: '#64748b', fontSize: 13 },
  guideMeta: { color: '#94a3b8', fontSize: 11 },
});
