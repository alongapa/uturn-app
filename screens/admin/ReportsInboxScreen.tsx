import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { AdminGuard } from '@/components/admin/admin-guard';
import { usePermissions } from '@/hooks/use-permissions';
import {
  applyModerationAction,
  listReports,
  moderateContent,
  triageReport,
} from '@/services/api/moderation';
import type { ModerationActionKind, ReportListItem, ReportStatus } from '@/types/database';

const REASON_LABEL: Record<string, string> = {
  spam: 'Spam',
  acoso: 'Acoso',
  contenido_inapropiado: 'Contenido inapropiado',
  seguridad: 'Seguridad',
  fraude: 'Fraude',
  otro: 'Otro',
};

const TARGET_LABEL: Record<string, string> = {
  usuario: 'Usuario',
  viaje: 'Viaje',
  mensaje: 'Mensaje',
  post: 'Publicación',
  historia: 'Historia',
  post_respuesta: 'Respuesta',
  pregunta: 'Pregunta',
  qa_respuesta: 'Respuesta Q&A',
};

const STATUS_FILTERS: { key: ReportStatus | 'todos'; label: string }[] = [
  { key: 'pendiente', label: 'Pendientes' },
  { key: 'en_revision', label: 'En revisión' },
  { key: 'resuelto', label: 'Resueltos' },
  { key: 'todos', label: 'Todos' },
];

const CONTENT_TYPES = new Set(['post', 'historia', 'post_respuesta', 'pregunta', 'qa_respuesta']);

const REASON_TAG_BG: Record<string, string> = {
  acoso: '#fee2e2',
  seguridad: '#fee2e2',
  fraude: '#fef3c7',
  contenido_inapropiado: '#fef3c7',
  spam: '#f1f5f9',
  otro: '#f1f5f9',
};

const formatDate = (value: string) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ''
    : new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
};

/**
 * Bandeja de moderación (Sesión 9): tutor+ ve los reportes, los tría y (admin+)
 * aplica sanciones o elimina contenido. El enforcement real está en las RPC
 * (can_moderate / is_admin) y RLS; esta vista solo lo refleja.
 */
export default function ReportsInboxScreen() {
  const permissions = usePermissions();
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<ReportStatus | 'todos'>('pendiente');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Modal de sanción.
  const [sanctionTarget, setSanctionTarget] = useState<ReportListItem | null>(null);
  const [sanctionReason, setSanctionReason] = useState('');
  const [suspendDays, setSuspendDays] = useState('3');

  const load = useCallback(async () => {
    try {
      const rows = await listReports(filter === 'todos' ? null : filter);
      setReports(rows);
    } catch {
      Alert.alert('No se pudo cargar la bandeja de reportes.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  const runAction = async (fn: () => Promise<unknown>, reportId: string) => {
    setBusyId(reportId);
    try {
      await fn();
      await load();
    } catch (err) {
      Alert.alert('No se pudo completar', err instanceof Error ? err.message : 'Intenta de nuevo.');
    } finally {
      setBusyId(null);
    }
  };

  const handleTriage = (item: ReportListItem, status: 'en_revision' | 'descartado') =>
    runAction(() => triageReport(item.id, status), item.id);

  const handleDeleteContent = (item: ReportListItem) => {
    Alert.alert('Eliminar contenido', 'Se eliminará la publicación reportada y se cerrará el reporte.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => runAction(() => moderateContent(item.id, true), item.id),
      },
    ]);
  };

  const openSanction = (item: ReportListItem) => {
    setSanctionTarget(item);
    setSanctionReason('');
    setSuspendDays('3');
  };

  const applySanction = async (action: ModerationActionKind) => {
    if (!sanctionTarget?.target_user_id) return;
    const targetUserId = sanctionTarget.target_user_id;
    const reportId = sanctionTarget.id;
    setSanctionTarget(null);
    await runAction(
      () =>
        applyModerationAction({
          targetUserId,
          action,
          reason: sanctionReason.trim() || 'Incumplimiento de las reglas de la comunidad',
          suspendDays: action === 'suspension' ? Math.max(1, Number(suspendDays) || 3) : undefined,
          reportId,
        }),
      reportId
    );
  };

  return (
    <AdminGuard moderatorOnly>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <Text style={styles.title}>Reportes de la comunidad</Text>
        <Text style={styles.caption}>Revisa denuncias de usuarios, viajes, chats y contenido.</Text>

        <View style={styles.filterRow}>
          {STATUS_FILTERS.map((f) => (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator color="#2563eb" style={{ marginTop: 24 }} />
        ) : reports.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="shield-checkmark-outline" size={28} color="#16a34a" />
            <Text style={styles.emptyText}>No hay reportes en esta vista.</Text>
          </View>
        ) : (
          reports.map((item) => {
            const isContent = CONTENT_TYPES.has(item.target_type);
            const closed = item.status === 'resuelto' || item.status === 'descartado';
            return (
              <View key={item.id} style={styles.card}>
                <View style={styles.rowBetween}>
                  <View style={styles.tagRow}>
                    <View style={styles.typeTag}>
                      <Text style={styles.typeTagText}>{TARGET_LABEL[item.target_type] ?? item.target_type}</Text>
                    </View>
                    <View style={[styles.reasonTag, { backgroundColor: REASON_TAG_BG[item.reason] ?? '#f1f5f9' }]}>
                      <Text style={styles.reasonTagText}>{REASON_LABEL[item.reason] ?? item.reason}</Text>
                    </View>
                  </View>
                  <Text style={styles.date}>{formatDate(item.created_at)}</Text>
                </View>

                {item.target_user_name && (
                  <Text style={styles.targetName}>Reportado: {item.target_user_name}</Text>
                )}
                {item.reporter_name && (
                  <Text style={styles.reporter}>Por: {item.reporter_name}</Text>
                )}
                {item.description ? <Text style={styles.description}>“{item.description}”</Text> : null}
                {item.evidence_path ? (
                  <View style={styles.evidenceTag}>
                    <Ionicons name="document-attach-outline" size={14} color="#475569" />
                    <Text style={styles.evidenceText}>Con evidencia adjunta</Text>
                  </View>
                ) : null}

                {closed ? (
                  <Text style={styles.resolved}>
                    {item.status === 'resuelto' ? `Resuelto${item.resolution ? ` · ${item.resolution}` : ''}` : 'Descartado'}
                  </Text>
                ) : (
                  <>
                    {item.status === 'pendiente' && (
                      <View style={styles.actionsRow}>
                        <TouchableOpacity
                          style={styles.ghostButton}
                          disabled={busyId === item.id}
                          onPress={() => handleTriage(item, 'en_revision')}
                        >
                          <Text style={styles.ghostText}>Marcar en revisión</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.ghostButton}
                          disabled={busyId === item.id}
                          onPress={() => handleTriage(item, 'descartado')}
                        >
                          <Text style={styles.ghostText}>Descartar</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {permissions.isAdmin && (
                      <View style={styles.actionsRow}>
                        {isContent && item.target_id && (
                          <TouchableOpacity
                            style={styles.deleteButton}
                            disabled={busyId === item.id}
                            onPress={() => handleDeleteContent(item)}
                          >
                            <Text style={styles.deleteText}>Eliminar contenido</Text>
                          </TouchableOpacity>
                        )}
                        {item.target_user_id && (
                          <TouchableOpacity
                            style={styles.sanctionButton}
                            disabled={busyId === item.id}
                            onPress={() => openSanction(item)}
                          >
                            {busyId === item.id ? (
                              <ActivityIndicator color="#ffffff" size="small" />
                            ) : (
                              <Text style={styles.sanctionText}>Sancionar usuario</Text>
                            )}
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      <Modal visible={!!sanctionTarget} transparent animationType="fade" onRequestClose={() => setSanctionTarget(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Sancionar a {sanctionTarget?.target_user_name ?? 'usuario'}</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Motivo (se le notifica al usuario)"
              value={sanctionReason}
              onChangeText={setSanctionReason}
              multiline
            />
            <View style={styles.suspendRow}>
              <Text style={styles.suspendLabel}>Días de suspensión</Text>
              <TextInput
                style={styles.suspendInput}
                value={suspendDays}
                onChangeText={setSuspendDays}
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.sanctionOptions}>
              <TouchableOpacity style={[styles.optionButton, styles.warnOption]} onPress={() => applySanction('advertencia')}>
                <Text style={styles.warnText}>Advertencia</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.optionButton, styles.suspendOption]} onPress={() => applySanction('suspension')}>
                <Text style={styles.suspendText}>Suspender</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.optionButton, styles.banOption]} onPress={() => applySanction('baneo')}>
                <Text style={styles.banText}>Banear</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setSanctionTarget(null)}>
              <Text style={styles.modalCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </AdminGuard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7fb' },
  content: { padding: 16, paddingBottom: 40, gap: 10 },
  title: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  caption: { color: '#64748b' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 4 },
  filterChip: { borderRadius: 999, borderWidth: 1, borderColor: '#cbd5e1', paddingHorizontal: 12, paddingVertical: 6 },
  filterChipActive: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  filterText: { color: '#475569', fontWeight: '600', fontSize: 12 },
  filterTextActive: { color: '#ffffff' },
  emptyBox: { alignItems: 'center', gap: 8, padding: 32 },
  emptyText: { color: '#64748b' },
  card: { backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 14, gap: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  tagRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', flexShrink: 1 },
  typeTag: { backgroundColor: '#eff6ff', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  typeTagText: { color: '#2563eb', fontWeight: '700', fontSize: 11 },
  reasonTag: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  reasonTagText: { color: '#0f172a', fontWeight: '700', fontSize: 11 },
  date: { color: '#94a3b8', fontSize: 12 },
  targetName: { color: '#0f172a', fontWeight: '700' },
  reporter: { color: '#64748b', fontSize: 12 },
  description: { color: '#334155', fontStyle: 'italic' },
  evidenceTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  evidenceText: { color: '#475569', fontSize: 12 },
  resolved: { color: '#16a34a', fontWeight: '700', fontSize: 13 },
  actionsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 2 },
  ghostButton: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  ghostText: { color: '#475569', fontWeight: '700', fontSize: 12 },
  deleteButton: { borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fef2f2', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  deleteText: { color: '#b91c1c', fontWeight: '700', fontSize: 12 },
  sanctionButton: { backgroundColor: '#dc2626', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14 },
  sanctionText: { color: '#ffffff', fontWeight: '800', fontSize: 12 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#ffffff', borderRadius: 16, padding: 20, gap: 12, width: '100%' },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  modalInput: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 10, minHeight: 60, textAlignVertical: 'top', color: '#0f172a' },
  suspendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  suspendLabel: { color: '#475569', fontWeight: '600' },
  suspendInput: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, width: 70, textAlign: 'center', color: '#0f172a' },
  sanctionOptions: { flexDirection: 'row', gap: 8 },
  optionButton: { flex: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  warnOption: { backgroundColor: '#fef3c7' },
  warnText: { color: '#b45309', fontWeight: '800', fontSize: 12 },
  suspendOption: { backgroundColor: '#fed7aa' },
  suspendText: { color: '#c2410c', fontWeight: '800', fontSize: 12 },
  banOption: { backgroundColor: '#dc2626' },
  banText: { color: '#ffffff', fontWeight: '800', fontSize: 12 },
  modalCancel: { alignItems: 'center', paddingVertical: 8 },
  modalCancelText: { color: '#64748b', fontWeight: '700' },
});
