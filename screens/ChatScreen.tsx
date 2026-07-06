import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useUser } from '@/contexts/UserContext';
import { usePermissions } from '@/hooks/use-permissions';
import type { ChatMessage, ConversationDetail } from '@/services/api/messages';
import {
  getConversation,
  listMessages,
  mapMessageRow,
  markConversationRead,
  sendMessage,
  setSupportStatus,
  subscribeToConversation,
  supportCategoryLabel,
} from '@/services/api/messages';

/**
 * Chat (Sesión 6): DM 1-a-1 o ticket de soporte, en tiempo real. Los mensajes
 * entran por la suscripción a `messages` sin recargar; el "visto" sale del
 * puntero last_read_at del otro miembro (conversation_members, también en
 * vivo). La privacidad la garantiza la RLS del servidor.
 */
export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const conversationId = typeof id === 'string' ? id : undefined;
  const { user } = useUser();
  const permissions = usePermissions();
  const uid = user?.id;

  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [attachment, setAttachment] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const listRef = useRef<FlatList<ChatMessage>>(null);

  const loadAll = useCallback(async () => {
    if (!conversationId) return;
    const [detail, history] = await Promise.all([
      getConversation(conversationId),
      listMessages(conversationId),
    ]);
    setConversation(detail);
    setMessages(history);
  }, [conversationId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadAll()
      .then(() => active && setLoadError(false))
      .catch(() => active && setLoadError(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [loadAll]);

  // Al abrir (y con cada mensaje entrante) se marca leído: el otro lado ve el
  // "visto" moverse en vivo por la suscripción a conversation_members.
  useEffect(() => {
    if (!conversationId || loading) return;
    markConversationRead(conversationId).catch(() => undefined);
  }, [conversationId, loading, messages.length]);

  useEffect(() => {
    if (!conversationId) return;
    const channel = subscribeToConversation(conversationId, {
      onMessage: (row) => {
        mapMessageRow(row)
          .then((message) => {
            setMessages((prev) =>
              prev.some((m) => m.id === message.id) ? prev : [...prev, message]
            );
          })
          .catch(() => undefined);
      },
      onMembersChange: () => {
        // Refresca los punteros de lectura (indicador "visto").
        getConversation(conversationId)
          .then((detail) => detail && setConversation(detail))
          .catch(() => undefined);
      },
    });
    return () => {
      channel.unsubscribe();
    };
  }, [conversationId]);

  useEffect(() => {
    // El chat siempre pega el scroll al último mensaje.
    if (messages.length > 0) {
      const timer = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
      return () => clearTimeout(timer);
    }
  }, [messages.length]);

  const pickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setAttachment(result.assets[0].uri);
    }
  }, []);

  const handleSend = useCallback(() => {
    if (!conversationId || sending) return;
    const body = draft.trim();
    if (!body && !attachment) return;
    setSending(true);
    sendMessage(conversationId, { body, imageUri: attachment ?? undefined })
      .then((message) => {
        setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
        setDraft('');
        setAttachment(null);
      })
      .catch(() => Alert.alert('No se pudo enviar el mensaje. Revisa tu conexión.'))
      .finally(() => setSending(false));
  }, [conversationId, draft, attachment, sending]);

  const handleToggleStatus = useCallback(() => {
    if (!conversationId || !conversation || updatingStatus) return;
    const next = conversation.supportStatus === 'resuelto' ? 'abierto' : 'resuelto';
    setUpdatingStatus(true);
    setSupportStatus(conversationId, next)
      .then(() =>
        setConversation((prev) => (prev ? { ...prev, supportStatus: next } : prev))
      )
      .catch(() => Alert.alert('No se pudo cambiar el estado del ticket.'))
      .finally(() => setUpdatingStatus(false));
  }, [conversationId, conversation, updatingStatus]);

  // "Visto": timestamp de lectura más antiguo del resto de los miembros; mi
  // último mensaje anterior a ese punto ya fue leído por todos.
  const othersReadAt = useMemo(() => {
    if (!conversation || !uid) return null;
    const others = conversation.readPointers.filter((p) => p.userId !== uid);
    if (others.length === 0) return null;
    return others.map((p) => p.lastReadAt).sort()[0];
  }, [conversation, uid]);

  const lastMineId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].senderId === uid) return messages[i].id;
    }
    return null;
  }, [messages, uid]);

  const isSupport = conversation?.kind === 'soporte';

  const renderItem = useCallback(
    ({ item }: { item: ChatMessage }) => {
      const mine = item.senderId === uid;
      const seen = mine && othersReadAt !== null && item.createdAt <= othersReadAt;
      const senderName =
        !mine && isSupport ? conversation?.memberNames.get(item.senderId) : undefined;
      return (
        <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
          <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
            {senderName ? <Text style={styles.senderName}>{senderName}</Text> : null}
            {item.imageUrl ? (
              <Image source={{ uri: item.imageUrl }} style={styles.bubbleImage} />
            ) : null}
            {item.body ? (
              <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.body}</Text>
            ) : null}
            <View style={styles.bubbleMeta}>
              <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>
                {new Date(item.createdAt).toLocaleTimeString('es-CL', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
              {mine && item.id === lastMineId && (
                <Text style={[styles.seenText, seen ? styles.seenTextSeen : null]}>
                  {seen ? 'Visto ✓✓' : 'Enviado ✓'}
                </Text>
              )}
            </View>
          </View>
        </View>
      );
    },
    [uid, othersReadAt, lastMineId, isSupport, conversation]
  );

  const title = conversation?.title ?? 'Chat';

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title, headerShown: true }} />

      {isSupport && conversation && (
        <View style={styles.supportBar}>
          <View style={styles.supportInfo}>
            <Ionicons name="headset" size={14} color="#0A1525" />
            <Text style={styles.supportText}>
              {supportCategoryLabel(conversation.supportCategory)} ·{' '}
              {conversation.supportStatus === 'resuelto' ? 'Resuelto' : 'Abierto'}
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.statusButton,
              conversation.supportStatus === 'resuelto' && styles.statusButtonReopen,
            ]}
            onPress={handleToggleStatus}
            disabled={updatingStatus}
          >
            <Text style={styles.statusButtonText}>
              {conversation.supportStatus === 'resuelto' ? 'Reabrir' : 'Marcar resuelto'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {isSupport && permissions.isAdmin && (
        <View style={styles.agentBanner}>
          <Text style={styles.agentBannerText}>
            Estás respondiendo como Soporte Unities
          </Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={styles.loader} size="large" color="#246BFD" />
      ) : loadError && !conversation ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>No se pudo abrir la conversación.</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {isSupport
                ? 'Cuéntanos tu problema: el equipo Unities te responderá aquí.'
                : 'Escribe el primer mensaje para coordinar.'}
            </Text>
          }
        />
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        {attachment && (
          <View style={styles.attachmentPreview}>
            <Image source={{ uri: attachment }} style={styles.attachmentImage} />
            <TouchableOpacity style={styles.attachmentRemove} onPress={() => setAttachment(null)}>
              <Ionicons name="close" size={14} color="#ffffff" />
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.inputBar}>
          <TouchableOpacity style={styles.attachButton} onPress={pickImage} disabled={sending}>
            <Ionicons name="image" size={20} color="#246BFD" />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            placeholder="Escribe un mensaje"
            placeholderTextColor="#94a3b8"
            value={draft}
            onChangeText={setDraft}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendButton, (sending || (!draft.trim() && !attachment)) && styles.sendDisabled]}
            onPress={handleSend}
            disabled={sending || (!draft.trim() && !attachment)}
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
  supportBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  supportInfo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  supportText: { fontWeight: '700', color: '#0A1525', fontSize: 13 },
  statusButton: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusButtonReopen: { backgroundColor: '#246BFD' },
  statusButtonText: { color: '#ffffff', fontWeight: '700', fontSize: 12 },
  agentBanner: { backgroundColor: '#eef4ff', paddingVertical: 5, alignItems: 'center' },
  agentBannerText: { color: '#246BFD', fontSize: 12, fontWeight: '700' },
  listContent: { padding: 14, gap: 8, flexGrow: 1 },
  empty: { color: '#94a3b8', textAlign: 'center', marginTop: 32, paddingHorizontal: 24 },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubbleRowTheirs: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '80%',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
  },
  bubbleMine: { backgroundColor: '#246BFD', borderBottomRightRadius: 4 },
  bubbleTheirs: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderBottomLeftRadius: 4,
  },
  senderName: { fontSize: 11, fontWeight: '800', color: '#246BFD' },
  bubbleText: { color: '#0f172a', fontSize: 15 },
  bubbleTextMine: { color: '#ffffff' },
  bubbleImage: { width: 200, height: 150, borderRadius: 10, backgroundColor: '#e2e8f0' },
  bubbleMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  bubbleTime: { fontSize: 10, color: '#94a3b8' },
  bubbleTimeMine: { color: '#dbeafe' },
  seenText: { fontSize: 10, color: '#dbeafe' },
  seenTextSeen: { fontWeight: '800', color: '#ffffff' },
  attachmentPreview: { paddingHorizontal: 14, paddingTop: 6, alignSelf: 'flex-start' },
  attachmentImage: { width: 72, height: 72, borderRadius: 10 },
  attachmentRemove: {
    position: 'absolute',
    top: 0,
    right: 8,
    backgroundColor: '#0A1525',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 10,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  attachButton: { padding: 8 },
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
