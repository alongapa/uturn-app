import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { AdminGuard } from '@/components/admin/admin-guard';
import { listSosAlerts, resolveSos } from '@/services/api/safety';
import { supabase } from '@/services/supabase';
import type { SosAlertListItem } from '@/types/database';

const formatDate = (value: string) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ''
    : new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
};

/**
 * Bandeja de alertas SOS (Sesión 9): admin/owner ven las alertas de seguridad
 * en vivo (realtime sobre sos_alerts), abren la ubicación y las resuelven o las
 * marcan como falsa alarma. trigger_sos avisa a todo admin/owner sin pasar por
 * notification_prefs (una alerta de seguridad no se puede silenciar).
 */
export default function SafetyInboxScreen() {
  const [alerts, setAlerts] = useState<SosAlertListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await listSosAlerts(!showResolved);
      setAlerts(rows);
    } catch {
      Alert.alert('No se pudieron cargar las alertas SOS.');
    } finally {
      setLoading(false);
    }
  }, [showResolved]);

  useEffect(() => {
    setLoading(true);
    load();
    const channel = supabase
      .channel('public:sos_alerts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_alerts' }, () => load())
      .subscribe();
    return () => {
      channel.unsubscribe();
    };
  }, [load]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  const handleResolve = (item: SosAlertListItem, status: 'atendida' | 'falsa_alarma') => {
    setBusyId(item.id);
    resolveSos(item.id, status)
      .then(() => load())
      .catch((err) => Alert.alert('No se pudo actualizar', err instanceof Error ? err.message : 'Intenta de nuevo.'))
      .finally(() => setBusyId(null));
  };

  const openLocation = (item: SosAlertListItem) => {
    if (item.lat == null || item.lng == null) return;
    Linking.openURL(`https://maps.google.com/?q=${item.lat},${item.lng}`).catch(() => undefined);
  };

  return (
    <AdminGuard>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <Text style={styles.title}>Alertas SOS</Text>
        <Text style={styles.caption}>Avisos de seguridad de usuarios durante sus viajes.</Text>

        <TouchableOpacity style={styles.toggle} onPress={() => setShowResolved((v) => !v)}>
          <Ionicons name={showResolved ? 'checkbox' : 'square-outline'} size={18} color="#2563eb" />
          <Text style={styles.toggleText}>Mostrar resueltas también</Text>
        </TouchableOpacity>

        {loading ? (
          <ActivityIndicator color="#2563eb" style={{ marginTop: 24 }} />
        ) : alerts.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="shield-checkmark-outline" size={28} color="#16a34a" />
            <Text style={styles.emptyText}>No hay alertas SOS activas.</Text>
          </View>
        ) : (
          alerts.map((item) => (
            <View key={item.id} style={[styles.card, item.status === 'activa' && styles.cardActive]}>
              <View style={styles.rowBetween}>
                <View style={styles.userRow}>
                  <Ionicons name="warning" size={18} color={item.status === 'activa' ? '#dc2626' : '#94a3b8'} />
                  <Text style={styles.userName}>{item.user_name ?? 'Usuario'}</Text>
                </View>
                <Text style={styles.date}>{formatDate(item.created_at)}</Text>
              </View>

              <View style={[styles.statusPill, item.status === 'activa' ? styles.statusActive : styles.statusResolved]}>
                <Text style={styles.statusText}>
                  {item.status === 'activa' ? 'ACTIVA' : item.status === 'atendida' ? 'Atendida' : 'Falsa alarma'}
                </Text>
              </View>

              {item.contact_phone ? (
                <Text style={styles.contact}>
                  Contacto de emergencia: {item.contact_name ?? '—'} · {item.contact_phone}
                </Text>
              ) : (
                <Text style={styles.contactMuted}>Sin contacto de emergencia configurado.</Text>
              )}

              <View style={styles.actionsRow}>
                {item.lat != null && item.lng != null && (
                  <TouchableOpacity style={styles.mapButton} onPress={() => openLocation(item)}>
                    <Ionicons name="location" size={15} color="#1d4ed8" />
                    <Text style={styles.mapText}>Ver ubicación</Text>
                  </TouchableOpacity>
                )}
                {item.contact_phone && (
                  <TouchableOpacity
                    style={styles.callButton}
                    onPress={() => Linking.openURL(`tel:${item.contact_phone}`).catch(() => undefined)}
                  >
                    <Ionicons name="call" size={15} color="#15803d" />
                    <Text style={styles.callText}>Llamar contacto</Text>
                  </TouchableOpacity>
                )}
              </View>

              {item.status === 'activa' && (
                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={styles.falseButton}
                    disabled={busyId === item.id}
                    onPress={() => handleResolve(item, 'falsa_alarma')}
                  >
                    <Text style={styles.falseText}>Falsa alarma</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.resolveButton}
                    disabled={busyId === item.id}
                    onPress={() => handleResolve(item, 'atendida')}
                  >
                    {busyId === item.id ? (
                      <ActivityIndicator color="#ffffff" size="small" />
                    ) : (
                      <Text style={styles.resolveText}>Marcar atendida</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
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
  caption: { color: '#64748b' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  toggleText: { color: '#2563eb', fontWeight: '600', fontSize: 13 },
  emptyBox: { alignItems: 'center', gap: 8, padding: 32 },
  emptyText: { color: '#64748b' },
  card: { backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 14, gap: 8 },
  cardActive: { borderColor: '#fca5a5', backgroundColor: '#fef2f2' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  userName: { color: '#0f172a', fontWeight: '800', fontSize: 15 },
  date: { color: '#94a3b8', fontSize: 12 },
  statusPill: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusActive: { backgroundColor: '#dc2626' },
  statusResolved: { backgroundColor: '#e2e8f0' },
  statusText: { color: '#ffffff', fontWeight: '800', fontSize: 11 },
  contact: { color: '#334155', fontSize: 13 },
  contactMuted: { color: '#94a3b8', fontSize: 13, fontStyle: 'italic' },
  actionsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  mapButton: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  mapText: { color: '#1d4ed8', fontWeight: '700', fontSize: 12 },
  callButton: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#bbf7d0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  callText: { color: '#15803d', fontWeight: '700', fontSize: 12 },
  falseButton: { flex: 1, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  falseText: { color: '#475569', fontWeight: '700', fontSize: 12 },
  resolveButton: { flex: 1, backgroundColor: '#16a34a', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  resolveText: { color: '#ffffff', fontWeight: '800', fontSize: 12 },
});
