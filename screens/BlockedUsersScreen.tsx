import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { listMyBlocks, unblockUser, type BlockedUser } from '@/services/api/moderation';

/**
 * Lista de usuarios bloqueados (Sesión 9). Un usuario bloqueado no puede
 * abrirte un DM ni ver sus respuestas cruzadas contigo; el bloqueo es mutuo y
 * lo enforcea la RLS (are_blocked). Aquí puedes desbloquear.
 */
export default function BlockedUsersScreen() {
  const [blocks, setBlocks] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setBlocks(await listMyBlocks());
    } catch {
      Alert.alert('No se pudo cargar tu lista de bloqueados.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  const handleUnblock = (item: BlockedUser) => {
    setBusyId(item.blockedId);
    unblockUser(item.blockedId)
      .then(() => load())
      .catch(() => Alert.alert('No se pudo desbloquear.'))
      .finally(() => setBusyId(null));
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#2563eb" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      {blocks.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="checkmark-circle-outline" size={28} color="#16a34a" />
          <Text style={styles.emptyText}>No tienes usuarios bloqueados.</Text>
        </View>
      ) : (
        blocks.map((item) => (
          <View key={item.blockedId} style={styles.row}>
            <View style={styles.avatar}>
              <Text style={styles.avatarInitials}>{(item.fullName ?? '?').slice(0, 2).toUpperCase()}</Text>
            </View>
            <Text style={styles.name}>{item.fullName ?? 'Estudiante'}</Text>
            <TouchableOpacity style={styles.unblockButton} onPress={() => handleUnblock(item)} disabled={busyId === item.blockedId}>
              <Text style={styles.unblockText}>{busyId === item.blockedId ? '…' : 'Desbloquear'}</Text>
            </TouchableOpacity>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, gap: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyBox: { alignItems: 'center', gap: 8, padding: 40 },
  emptyText: { color: '#64748b' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { color: '#475569', fontWeight: '800' },
  name: { flex: 1, color: '#0f172a', fontWeight: '700' },
  unblockButton: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  unblockText: { color: '#0f172a', fontWeight: '700', fontSize: 13 },
});
