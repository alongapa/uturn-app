import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { usePermissions } from '@/hooks/use-permissions';
import type { ChatPeer, ConversationSummary } from '@/services/api/messages';
import {
  listConversations,
  searchStudents,
  startDm,
  subscribeToInbox,
  supportCategoryLabel,
} from '@/services/api/messages';

/**
 * Tab Mensajes (Sesión 6): bandeja de conversaciones sobre Supabase Realtime.
 * DMs 1-a-1, tickets de "Soporte Unities" y acceso al Q&A por temas. Los
 * no-leídos vienen del servidor (conversation_unread_counts) y la lista se
 * refresca en vivo con la suscripción de la bandeja.
 */

type Filter = 'todos' | 'dm' | 'soporte';

function formatTime(iso?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
}

function Avatar({ peer, kind }: { peer?: ChatPeer; kind: ConversationSummary['kind'] }) {
  if (kind === 'soporte') {
    return (
      <View style={[styles.avatar, styles.avatarSupport]}>
        <Ionicons name="headset" size={22} color="#ffffff" />
      </View>
    );
  }
  if (peer?.avatarUrl) {
    return <Image source={{ uri: peer.avatarUrl }} style={styles.avatar} />;
  }
  const initials = (peer?.name ?? 'E')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <View style={[styles.avatar, styles.avatarFallback]}>
      <Text style={styles.avatarInitials}>{initials || 'E'}</Text>
    </View>
  );
}

export default function MessagesScreen() {
  const permissions = usePermissions();

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('todos');

  // Modal "nuevo mensaje": buscador de estudiantes para abrir un DM.
  const [newDmVisible, setNewDmVisible] = useState(false);
  const [peerQuery, setPeerQuery] = useState('');
  const [peerResults, setPeerResults] = useState<ChatPeer[]>([]);
  const [searchingPeers, setSearchingPeers] = useState(false);
  const [openingDm, setOpeningDm] = useState(false);

  const load = useCallback(async () => {
    const list = await listConversations();
    setConversations(list);
  }, []);

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

  // La bandeja se mueve en vivo: mensajes nuevos y cambios de estado.
  useEffect(() => {
    const channel = subscribeToInbox(() => {
      load().catch(() => undefined);
    });
    return () => {
      channel.unsubscribe();
    };
  }, [load]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    load()
      .then(() => setLoadError(false))
      .catch(() => setLoadError(true))
      .finally(() => setRefreshing(false));
  }, [load]);

  // Búsqueda de estudiantes con debounce para el nuevo DM.
  useEffect(() => {
    if (!newDmVisible) return;
    const term = peerQuery.trim();
    if (!term) {
      setPeerResults([]);
      return;
    }
    setSearchingPeers(true);
    const timer = setTimeout(() => {
      searchStudents(term)
        .then(setPeerResults)
        .catch(() => setPeerResults([]))
        .finally(() => setSearchingPeers(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [peerQuery, newDmVisible]);

  const openDmWith = useCallback(
    (peer: ChatPeer) => {
      if (openingDm) return;
      setOpeningDm(true);
      startDm(peer.id)
        .then((conversation) => {
          setNewDmVisible(false);
          setPeerQuery('');
          router.push({ pathname: '/chat/[id]', params: { id: conversation.id } });
        })
        .catch(() => Alert.alert('No se pudo abrir el chat. Intenta de nuevo.'))
        .finally(() => setOpeningDm(false));
    },
    [openingDm]
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return conversations.filter((c) => {
      if (filter !== 'todos' && c.kind !== filter) return false;
      if (!term) return true;
      return (
        c.title.toLowerCase().includes(term) ||
        (c.lastMessagePreview ?? '').toLowerCase().includes(term) ||
        supportCategoryLabel(c.supportCategory).toLowerCase().includes(term)
      );
    });
  }, [conversations, filter, search]);

  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + c.unreadCount, 0),
    [conversations]
  );

  const renderItem = useCallback(
    ({ item }: { item: ConversationSummary }) => (
      <TouchableOpacity
        style={styles.row}
        onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.id } })}
      >
        <Avatar peer={item.peer} kind={item.kind} />
        <View style={styles.rowBody}>
          <View style={styles.rowTop}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.rowTime}>{formatTime(item.lastMessageAt)}</Text>
          </View>
          <View style={styles.rowBottom}>
            <Text
              style={[styles.rowPreview, item.unreadCount > 0 && styles.rowPreviewUnread]}
              numberOfLines={1}
            >
              {item.lastMessageMine && item.lastMessagePreview ? 'Tú: ' : ''}
              {item.lastMessagePreview ?? 'Sin mensajes aún'}
            </Text>
            {item.kind === 'soporte' && (
              <View
                style={[
                  styles.statusChip,
                  item.supportStatus === 'resuelto' ? styles.statusResolved : styles.statusOpen,
                ]}
              >
                <Text style={styles.statusChipText}>
                  {item.supportStatus === 'resuelto' ? 'Resuelto' : 'Abierto'}
                </Text>
              </View>
            )}
            {item.unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    ),
    []
  );

  const header = (
    <View>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color="#64748b" />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar conversaciones"
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color="#94a3b8" />
          </TouchableOpacity>
        )}
      </View>

      {/* Accesos: Soporte Unities y Q&A por temas */}
      <View style={styles.shortcuts}>
        <TouchableOpacity style={styles.shortcut} onPress={() => router.push('/support')}>
          <View style={[styles.shortcutIcon, { backgroundColor: '#0A1525' }]}>
            <Ionicons name="headset" size={18} color="#ffffff" />
          </View>
          <Text style={styles.shortcutText}>Soporte Unities</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.shortcut} onPress={() => router.push('/qa')}>
          <View style={[styles.shortcutIcon, { backgroundColor: '#246BFD' }]}>
            <Ionicons name="help-circle" size={20} color="#ffffff" />
          </View>
          <Text style={styles.shortcutText}>Preguntas y temas</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filters}>
        {(
          [
            { id: 'todos', label: 'Todos' },
            { id: 'dm', label: 'Chats' },
            { id: 'soporte', label: permissions.isAdmin ? 'Soporte (bandeja)' : 'Soporte' },
          ] as { id: Filter; label: string }[]
        ).map((f) => (
          <TouchableOpacity
            key={f.id}
            style={[styles.filterChip, filter === f.id && styles.filterChipActive]}
            onPress={() => setFilter(f.id)}
          >
            <Text style={[styles.filterText, filter === f.id && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.screenTitle}>Mensajes</Text>
        {totalUnread > 0 && (
          <View style={styles.topBadge}>
            <Text style={styles.topBadgeText}>{totalUnread > 99 ? '99+' : totalUnread}</Text>
          </View>
        )}
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} size="large" color="#246BFD" />
      ) : loadError && conversations.length === 0 ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>No se pudieron cargar tus mensajes. Revisa tu conexión.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRefresh}>
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {conversations.length === 0
                ? 'Aún no tienes conversaciones. Escríbele a alguien de tu viaje o abre un ticket de soporte.'
                : 'Nada calza con tu búsqueda.'}
            </Text>
          }
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setNewDmVisible(true)}
        accessibilityLabel="Nuevo mensaje"
      >
        <Ionicons name="chatbubble-ellipses" size={24} color="#ffffff" />
      </TouchableOpacity>

      {/* Nuevo DM: busca a un estudiante por nombre */}
      <Modal visible={newDmVisible} animationType="slide" transparent onRequestClose={() => setNewDmVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nuevo mensaje</Text>
              <TouchableOpacity onPress={() => setNewDmVisible(false)}>
                <Ionicons name="close" size={22} color="#0f172a" />
              </TouchableOpacity>
            </View>
            <View style={styles.searchBoxModal}>
              <Ionicons name="search" size={16} color="#64748b" />
              <TextInput
                style={styles.searchInput}
                placeholder="Busca por nombre"
                placeholderTextColor="#94a3b8"
                value={peerQuery}
                onChangeText={setPeerQuery}
                autoFocus
              />
            </View>
            {searchingPeers ? (
              <ActivityIndicator style={{ marginTop: 18 }} color="#246BFD" />
            ) : (
              <FlatList
                data={peerResults}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.peerRow} onPress={() => openDmWith(item)} disabled={openingDm}>
                    <Avatar peer={item} kind="dm" />
                    <Text style={styles.peerName}>{item.name}</Text>
                    <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  peerQuery.trim().length > 0 ? (
                    <Text style={styles.empty}>Sin resultados para “{peerQuery.trim()}”.</Text>
                  ) : (
                    <Text style={styles.empty}>Escribe un nombre para buscar estudiantes.</Text>
                  )
                }
                style={{ maxHeight: 380 }}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7fb' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  screenTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  topBadge: {
    backgroundColor: '#246BFD',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  topBadgeText: { color: '#ffffff', fontSize: 11, fontWeight: '800' },
  loader: { marginTop: 48 },
  errorBox: { alignItems: 'center', marginTop: 48, gap: 12, paddingHorizontal: 24 },
  errorText: { color: '#475569', textAlign: 'center' },
  retryButton: { backgroundColor: '#0A1525', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 9 },
  retryText: { color: '#ffffff', fontWeight: '700' },
  listContent: { paddingBottom: 90, paddingHorizontal: 12 },
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
    marginTop: 6,
  },
  searchBoxModal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 12,
  },
  searchInput: { flex: 1, color: '#0f172a', padding: 0 },
  shortcuts: { flexDirection: 'row', gap: 10, marginTop: 12 },
  shortcut: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  shortcutIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutText: { flex: 1, fontWeight: '700', color: '#0f172a', fontSize: 13 },
  filters: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 8 },
  filterChip: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  filterChipActive: { backgroundColor: '#246BFD', borderColor: '#246BFD' },
  filterText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  filterTextActive: { color: '#ffffff' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginBottom: 8,
  },
  rowBody: { flex: 1, gap: 3 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rowTitle: { flex: 1, fontWeight: '700', color: '#0f172a', fontSize: 15 },
  rowTime: { color: '#94a3b8', fontSize: 12 },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowPreview: { flex: 1, color: '#64748b', fontSize: 13 },
  rowPreviewUnread: { color: '#0f172a', fontWeight: '600' },
  statusChip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  statusOpen: { backgroundColor: '#dbeafe' },
  statusResolved: { backgroundColor: '#dcfce7' },
  statusChipText: { fontSize: 11, fontWeight: '700', color: '#0f172a' },
  unreadBadge: {
    backgroundColor: '#246BFD',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  unreadText: { color: '#ffffff', fontSize: 11, fontWeight: '800' },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  avatarFallback: { backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center' },
  avatarSupport: { backgroundColor: '#0A1525', alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { color: '#246BFD', fontWeight: '800', fontSize: 16 },
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
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    minHeight: 320,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  peerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  peerName: { flex: 1, fontWeight: '600', color: '#0f172a' },
});
