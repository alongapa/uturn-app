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
import type { RedeemableProposal } from '@/services/api/admin';
import { listPendingProposals, reviewProposal } from '@/services/api/admin';

/**
 * Bandeja del owner: canjeables postulados por admins. Aprobar/rechazar corre
 * en el servidor (review_redeemable verifica el rol owner); un admin no puede
 * aprobarse a sí mismo ni por API directa.
 */
export default function ApprovalsScreen() {
  const [proposals, setProposals] = useState<RedeemableProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setProposals(await listPendingProposals());
  }, []);

  useEffect(() => {
    let active = true;
    load()
      .catch(() => active && Alert.alert('No se pudo cargar la bandeja'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [load]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    load()
      .catch(() => undefined)
      .finally(() => setRefreshing(false));
  }, [load]);

  const review = useCallback(
    async (proposal: RedeemableProposal, approve: boolean) => {
      setReviewing(proposal.id);
      try {
        await reviewProposal(proposal.id, approve);
        setProposals((prev) => prev.filter((p) => p.id !== proposal.id));
        Alert.alert(
          approve ? 'Canjeable aprobado' : 'Canjeable rechazado',
          approve ? 'Ya aparece en el catálogo de canjes.' : 'No entrará al catálogo.'
        );
      } catch (error) {
        Alert.alert(
          'No se pudo revisar',
          error instanceof Error ? error.message : 'Solo el owner puede aprobar o rechazar.'
        );
      } finally {
        setReviewing(null);
      }
    },
    []
  );

  const handleReject = useCallback(
    (proposal: RedeemableProposal) => {
      Alert.alert('Rechazar postulación', `¿Rechazar "${proposal.titulo}"?`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Rechazar', style: 'destructive', onPress: () => review(proposal, false) },
      ]);
    },
    [review]
  );

  return (
    <AdminGuard ownerOnly>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {loading ? (
          <ActivityIndicator style={styles.loader} size="large" color="#246BFD" />
        ) : proposals.length === 0 ? (
          <Text style={styles.empty}>No hay postulaciones pendientes. 🎉</Text>
        ) : (
          proposals.map((proposal) => (
            <View key={proposal.id} style={styles.card}>
              <Text style={styles.title}>{proposal.titulo}</Text>
              <Text style={styles.description}>{proposal.descripcion}</Text>
              <Text style={styles.meta}>
                {proposal.costoCreditos} créditos · {proposal.categoria}
                {proposal.stock != null ? ` · stock ${proposal.stock}` : ' · sin límite de stock'}
                {` · vigencia ${proposal.vigenciaDias} días`}
              </Text>
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.approveButton, reviewing === proposal.id && styles.disabled]}
                  onPress={() => review(proposal, true)}
                  disabled={reviewing === proposal.id}
                >
                  <Text style={styles.approveText}>
                    {reviewing === proposal.id ? '…' : 'Aprobar'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.rejectButton, reviewing === proposal.id && styles.disabled]}
                  onPress={() => handleReject(proposal)}
                  disabled={reviewing === proposal.id}
                >
                  <Text style={styles.rejectText}>Rechazar</Text>
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
  loader: { marginTop: 48 },
  empty: { color: '#64748b', textAlign: 'center', marginTop: 40, fontSize: 15 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    gap: 6,
  },
  title: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  description: { color: '#475569', fontSize: 13, lineHeight: 18 },
  meta: { color: '#64748b', fontSize: 12 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  approveButton: {
    flex: 1,
    backgroundColor: '#15803d',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  approveText: { color: '#ffffff', fontWeight: '800' },
  rejectButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#dc2626',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  rejectText: { color: '#dc2626', fontWeight: '800' },
  disabled: { opacity: 0.5 },
});
