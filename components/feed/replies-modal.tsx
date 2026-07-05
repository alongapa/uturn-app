import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import type { FeedPost, FeedReply } from '@/services/api/feed';
import { addReply, listReplies } from '@/services/api/feed';
import { timeAgo } from './feed-utils';

type Props = {
  post: FeedPost | null;
  onClose: () => void;
  /** Notifica al feed que hay una respuesta más (actualización optimista). */
  onReplied: (postId: string) => void;
};

/** Hilo simple de respuestas bajo un post. Una respuesta por usuario (constraint). */
export function RepliesModal({ post, onClose, onReplied }: Props) {
  const [replies, setReplies] = useState<FeedReply[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');

  const load = useCallback(async (postId: string) => {
    setLoading(true);
    try {
      setReplies(await listReplies(postId));
    } catch {
      // sin red: se muestra vacío y el usuario puede reintentar cerrando/abriendo
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (post) {
      setDraft('');
      setReplies([]);
      load(post.id);
    }
  }, [post, load]);

  const handleSend = async () => {
    if (!post || !draft.trim() || sending) return;
    setSending(true);
    try {
      const reply = await addReply(post.id, draft);
      setReplies((prev) => [...prev, reply]);
      setDraft('');
      onReplied(post.id);
    } catch (error) {
      Alert.alert(error instanceof Error ? error.message : 'No se pudo enviar la respuesta');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={post !== null} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Respuestas</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityLabel="Cerrar respuestas">
            <Ionicons name="close" size={26} color="#0f172a" />
          </TouchableOpacity>
        </View>

        {post ? (
          <View style={styles.originalPost}>
            <Text style={styles.originalAuthor}>{post.publisher.name}</Text>
            <Text style={styles.originalBody} numberOfLines={3}>
              {post.texto}
            </Text>
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator style={styles.loader} color="#246BFD" />
        ) : (
          <FlatList
            data={replies}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <Text style={styles.empty}>Nadie ha respondido aún. ¡Sé la primera persona!</Text>
            }
            renderItem={({ item }) => (
              <View style={styles.reply}>
                <View style={styles.replyHeader}>
                  <Text style={styles.replyAuthor}>{item.userName}</Text>
                  <Text style={styles.replyTime}>{timeAgo(item.createdAt)}</Text>
                </View>
                <Text style={styles.replyBody}>{item.body}</Text>
              </View>
            )}
          />
        )}

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Escribe tu respuesta…"
            placeholderTextColor="#94a3b8"
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!draft.trim() || sending) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!draft.trim() || sending}
            accessibilityLabel="Enviar respuesta"
          >
            <Ionicons name="send" size={18} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 54,
  },
  title: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  originalPost: {
    marginHorizontal: 16,
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 4,
  },
  originalAuthor: { fontWeight: '800', color: '#0f172a', fontSize: 13 },
  originalBody: { color: '#475569', fontSize: 13, lineHeight: 18 },
  loader: { marginTop: 32 },
  list: { padding: 16, gap: 12 },
  empty: { color: '#94a3b8', textAlign: 'center', marginTop: 24 },
  reply: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  replyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  replyAuthor: { fontWeight: '700', color: '#0f172a', fontSize: 13 },
  replyTime: { color: '#94a3b8', fontSize: 11 },
  replyBody: { color: '#0f172a', fontSize: 14, lineHeight: 19 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxHeight: 110,
    color: '#0f172a',
  },
  sendButton: {
    backgroundColor: '#246BFD',
    borderRadius: 12,
    padding: 11,
  },
  sendButtonDisabled: { opacity: 0.4 },
});
