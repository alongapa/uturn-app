import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
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
  listCredentialReviews,
  listDriverVerifications,
  reviewCredential,
  reviewDriverVerification,
} from '@/services/api/identity';
import { getSignedUrl } from '@/services/api/storage';
import type { CredentialReviewItem, DriverVerificationListItem } from '@/types/database';

type Tab = 'credenciales' | 'conductores';

/**
 * Bandeja de identidad (Sesión 9): tutor+ revisa las credenciales
 * universitarias (antes automáticas por captura) y las verificaciones
 * reforzadas de conductor (cédula + licencia). Aprobar una credencial la marca
 * verificada por un semestre; rechazar pide re-subir. Enforcement: RPC
 * can_moderate + RLS.
 */
export default function IdentityReviewScreen() {
  const [tab, setTab] = useState<Tab>('credenciales');
  const [credentials, setCredentials] = useState<CredentialReviewItem[]>([]);
  const [drivers, setDrivers] = useState<DriverVerificationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      // La verificación de credencial es automática por coincidencia
      // nombre↔correo institucional; esta bandeja lista a quienes NO quedaron
      // verificados (nombre no coincide) para revisión/aprobación manual.
      const [creds, drv] = await Promise.all([
        listCredentialReviews('pendiente'),
        listDriverVerifications('en_revision'),
      ]);
      setCredentials(creds);
      setDrivers(drv);
    } catch {
      Alert.alert('No se pudo cargar la bandeja de identidad.');
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

  const reviewCred = (item: CredentialReviewItem, approve: boolean) => {
    setBusyId(item.id);
    reviewCredential(item.id, approve)
      .then(() => load())
      .catch((err) => Alert.alert('No se pudo revisar', err instanceof Error ? err.message : 'Intenta de nuevo.'))
      .finally(() => setBusyId(null));
  };

  const reviewDriver = (item: DriverVerificationListItem, approve: boolean) => {
    setBusyId(item.user_id);
    reviewDriverVerification(item.user_id, approve)
      .then(() => load())
      .catch((err) => Alert.alert('No se pudo revisar', err instanceof Error ? err.message : 'Intenta de nuevo.'))
      .finally(() => setBusyId(null));
  };

  return (
    <AdminGuard moderatorOnly>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <Text style={styles.title}>Revisión de identidad</Text>

        <View style={styles.tabsRow}>
          <TouchableOpacity style={[styles.tab, tab === 'credenciales' && styles.tabActive]} onPress={() => setTab('credenciales')}>
            <Text style={[styles.tabText, tab === 'credenciales' && styles.tabTextActive]}>
              Credenciales ({credentials.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, tab === 'conductores' && styles.tabActive]} onPress={() => setTab('conductores')}>
            <Text style={[styles.tabText, tab === 'conductores' && styles.tabTextActive]}>
              Conductores ({drivers.length})
            </Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color="#2563eb" style={{ marginTop: 24 }} />
        ) : tab === 'credenciales' ? (
          credentials.length === 0 ? (
            <Empty />
          ) : (
            credentials.map((item) => (
              <CredentialCard
                key={item.id}
                item={item}
                busy={busyId === item.id}
                onApprove={() => reviewCred(item, true)}
                onReject={() => reviewCred(item, false)}
              />
            ))
          )
        ) : drivers.length === 0 ? (
          <Empty />
        ) : (
          drivers.map((item) => (
            <DriverCard
              key={item.user_id}
              item={item}
              busy={busyId === item.user_id}
              onApprove={() => reviewDriver(item, true)}
              onReject={() => reviewDriver(item, false)}
            />
          ))
        )}
      </ScrollView>
    </AdminGuard>
  );
}

function Empty() {
  return (
    <View style={styles.emptyBox}>
      <Ionicons name="checkmark-done-outline" size={28} color="#16a34a" />
      <Text style={styles.emptyText}>No hay nada por revisar aquí.</Text>
    </View>
  );
}

function CredentialCard({
  item,
  busy,
  onApprove,
  onReject,
}: {
  item: CredentialReviewItem;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  // La identidad se verifica automáticamente por coincidencia nombre↔correo;
  // aquí llegan quienes no coincidieron. El admin compara nombre vs correo y
  // decide (verifica manualmente casos legítimos: apellidos cortos, etc.).
  return (
    <View style={styles.card}>
      <Text style={styles.name}>{item.full_name ?? 'Estudiante'}</Text>
      <Text style={styles.meta}>{item.email} · {(item.university_id ?? '').toUpperCase()}</Text>
      <Text style={styles.hint}>Su nombre no coincidió automáticamente con el correo institucional.</Text>
      <ReviewActions busy={busy} onApprove={onApprove} onReject={onReject} approveLabel="Verificar" />
    </View>
  );
}

function DriverCard({
  item,
  busy,
  onApprove,
  onReject,
}: {
  item: DriverVerificationListItem;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [idUrl, setIdUrl] = useState<string | null>(null);
  const [licenseUrl, setLicenseUrl] = useState<string | null>(null);
  useEffect(() => {
    if (item.id_document_path) getSignedUrl('driver-documents', item.id_document_path).then(setIdUrl).catch(() => undefined);
    if (item.license_document_path) getSignedUrl('driver-documents', item.license_document_path).then(setLicenseUrl).catch(() => undefined);
  }, [item.id_document_path, item.license_document_path]);

  return (
    <View style={styles.card}>
      <Text style={styles.name}>{item.full_name ?? 'Conductor'}</Text>
      <Text style={styles.meta}>Cédula + licencia de conducir</Text>
      <View style={styles.docsRow}>
        <View style={styles.docCol}>
          <Text style={styles.docLabel}>Cédula</Text>
          {idUrl ? <Image source={{ uri: idUrl }} style={styles.docImage} contentFit="cover" /> : <View style={styles.docPlaceholder} />}
        </View>
        <View style={styles.docCol}>
          <Text style={styles.docLabel}>Licencia</Text>
          {licenseUrl ? <Image source={{ uri: licenseUrl }} style={styles.docImage} contentFit="cover" /> : <View style={styles.docPlaceholder} />}
        </View>
      </View>
      <ReviewActions busy={busy} onApprove={onApprove} onReject={onReject} approveLabel="Aprobar" />
    </View>
  );
}

function ReviewActions({
  busy,
  onApprove,
  onReject,
  approveLabel,
}: {
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  approveLabel: string;
}) {
  return (
    <View style={styles.actionsRow}>
      <TouchableOpacity style={styles.rejectButton} disabled={busy} onPress={onReject}>
        <Text style={styles.rejectText}>Rechazar</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.approveButton} disabled={busy} onPress={onApprove}>
        {busy ? <ActivityIndicator color="#ffffff" size="small" /> : <Text style={styles.approveText}>{approveLabel}</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7fb' },
  content: { padding: 16, paddingBottom: 40, gap: 10 },
  title: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  tabsRow: { flexDirection: 'row', gap: 8 },
  tab: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: '#cbd5e1', paddingVertical: 10, alignItems: 'center' },
  tabActive: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  tabText: { color: '#475569', fontWeight: '700', fontSize: 13 },
  tabTextActive: { color: '#ffffff' },
  emptyBox: { alignItems: 'center', gap: 8, padding: 32 },
  emptyText: { color: '#64748b' },
  card: { backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 14, gap: 8 },
  name: { color: '#0f172a', fontWeight: '800', fontSize: 15 },
  meta: { color: '#64748b', fontSize: 12 },
  hint: { color: '#b45309', fontSize: 12 },
  docsRow: { flexDirection: 'row', gap: 10 },
  docCol: { flex: 1, gap: 4 },
  docLabel: { color: '#475569', fontWeight: '600', fontSize: 12 },
  docImage: { width: '100%', height: 130, borderRadius: 10, backgroundColor: '#f1f5f9' },
  docPlaceholder: { width: '100%', height: 130, borderRadius: 10, backgroundColor: '#f1f5f9' },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  rejectButton: { flex: 1, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fef2f2', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  rejectText: { color: '#b91c1c', fontWeight: '800' },
  approveButton: { flex: 1, backgroundColor: '#16a34a', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  approveText: { color: '#ffffff', fontWeight: '800' },
});
