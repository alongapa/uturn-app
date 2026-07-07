import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { AdminGuard } from '@/components/admin/admin-guard';
import {
  listDisputes,
  resolveDispute,
  subscribeDisputes,
  type DisputeInboxItem,
} from '@/services/api/payments';
import { formatCLP } from '@/services/payments';

const formatDateCL = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
};

/**
 * Bandeja de disputas (Sesión 8): admin/owner revisan los reclamos "yo sí pagué",
 * abren el comprobante en el ticket de soporte y aprueban (verifica el pago,
 * revierte el strike) o rechazan (reactiva el strike). El enforcement es RLS +
 * resolve_dispute (security definer): esta vista solo lo refleja.
 */
export default function DisputesInboxScreen() {
  const [disputes, setDisputes] = useState<DisputeInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await listDisputes(true);
      setDisputes(rows);
    } catch {
      Alert.alert('No se pudo cargar la bandeja de disputas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const channel = subscribeDisputes(() => load());
    return () => {
      channel.unsubscribe();
    };
  }, [load]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  const handleResolve = (item: DisputeInboxItem, approve: boolean) => {
    Alert.alert(
      approve ? 'Aprobar disputa' : 'Rechazar disputa',
      approve
        ? 'Se marcará el pago como verificado y se anulará el strike del pasajero.'
        : 'Se mantendrá el strike del pasajero (no se verificó el pago).',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: approve ? 'Aprobar' : 'Rechazar',
          style: approve ? 'default' : 'destructive',
          onPress: async () => {
            setBusyId(item.id);
            try {
              await resolveDispute(item.id, approve);
              await load();
            } catch (err) {
              Alert.alert('No se pudo resolver', err instanceof Error ? err.message : 'Intenta de nuevo.');
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  };

  return (
    <AdminGuard>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <Text style={styles.title}>Disputas de pago</Text>
        <Text style={styles.caption}>
          Reclamos "yo sí pagué". El strike queda congelado hasta que resuelvas.
        </Text>

        {loading ? (
          <ActivityIndicator color="#2563eb" style={{ marginTop: 24 }} />
        ) : disputes.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="checkmark-done-outline" size={28} color="#16a34a" />
            <Text style={styles.emptyText}>No hay disputas abiertas. ¡Todo al día!</Text>
          </View>
        ) : (
          disputes.map((item) => (
            <View key={item.id} style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.route} numberOfLines={1}>
                  {item.route}
                </Text>
                <Text style={styles.amount}>{formatCLP(item.totalClp)}</Text>
              </View>
              <Text style={styles.meta}>
                {item.passenger} · {formatDateCL(item.createdAt)}
              </Text>
              {item.reason ? <Text style={styles.reason}>“{item.reason}”</Text> : null}

              <View style={styles.linksRow}>
                {item.conversationId && (
                  <TouchableOpacity
                    style={styles.linkButton}
                    onPress={() =>
                      router.push({ pathname: '/chat/[id]', params: { id: item.conversationId! } })
                    }
                  >
                    <Ionicons name="chatbubbles-outline" size={16} color="#1d4ed8" />
                    <Text style={styles.linkText}>Ver ticket</Text>
                  </TouchableOpacity>
                )}
                {item.evidencePath && (
                  <View style={styles.evidenceTag}>
                    <Ionicons name="document-attach-outline" size={16} color="#475569" />
                    <Text style={styles.evidenceTagText}>Con comprobante</Text>
                  </View>
                )}
              </View>

              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={[styles.rejectButton, busyId === item.id && styles.disabled]}
                  disabled={busyId === item.id}
                  onPress={() => handleResolve(item, false)}
                >
                  <Text style={styles.rejectText}>Rechazar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.approveButton, busyId === item.id && styles.disabled]}
                  disabled={busyId === item.id}
                  onPress={() => handleResolve(item, true)}
                >
                  {busyId === item.id ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.approveText}>Aprobar pago</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </AdminGuard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7fb' },
  content: { padding: 16, paddingBottom: 40, gap: 10 },
  title: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  caption: { color: '#64748b', marginBottom: 6 },
  emptyBox: { alignItems: 'center', gap: 8, padding: 32 },
  emptyText: { color: '#64748b' },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    gap: 8,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  route: { color: '#0f172a', fontWeight: '700', flexShrink: 1 },
  amount: { color: '#b45309', fontWeight: '800' },
  meta: { color: '#64748b', fontSize: 12 },
  reason: { color: '#334155', fontStyle: 'italic' },
  linksRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  linkButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  linkText: { color: '#1d4ed8', fontWeight: '700', fontSize: 13 },
  evidenceTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  evidenceTagText: { color: '#475569', fontSize: 13 },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  rejectButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  rejectText: { color: '#b91c1c', fontWeight: '800' },
  approveButton: {
    flex: 1,
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  approveText: { color: '#ffffff', fontWeight: '800' },
  disabled: { opacity: 0.6 },
});
