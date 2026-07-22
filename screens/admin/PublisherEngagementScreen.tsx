import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { AdminGuard } from '@/components/admin/admin-guard';
import { PublisherAvatar } from '@/components/feed/publisher-avatar';
import { listMyPublishers } from '@/services/api/admin';
import { getPublisherEngagement, type TrendRow } from '@/services/api/analytics';
import type { FeedPublisher } from '@/services/api/feed';

const ENTITY_LABEL: Record<string, string> = {
  post: 'Publicaciones',
  story: 'Historias',
  widget: 'Widgets',
  redeemable: 'Canjes',
  tab: 'Tabs',
};

/**
 * Engagement agregado por federación (Sesión Analítica de tendencias): cada
 * admin/tutor ve solo sus publishers (listMyPublishers ya filtra por
 * publisher_members) y las cifras vienen de publisher_engagement() —
 * agregadas y con supresión k-anónima aplicada en el servidor.
 */
export default function PublisherEngagementScreen() {
  const [publishers, setPublishers] = useState<FeedPublisher[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [rows, setRows] = useState<TrendRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadPublishers = useCallback(async () => {
    const mine = await listMyPublishers();
    setPublishers(mine);
    setSelected((prev) => prev ?? mine[0]?.id ?? null);
    return mine;
  }, []);

  const loadEngagement = useCallback(async (publisherId: string | null) => {
    if (!publisherId) {
      setRows([]);
      return;
    }
    const data = await getPublisherEngagement(publisherId).catch(() => [] as TrendRow[]);
    setRows(data);
  }, []);

  useEffect(() => {
    setLoading(true);
    loadPublishers()
      .then((mine) => loadEngagement(mine[0]?.id ?? null))
      .catch(() => Alert.alert('No se pudo cargar el engagement'))
      .finally(() => setLoading(false));
  }, [loadPublishers, loadEngagement]);

  const handleSelect = (publisherId: string) => {
    setSelected(publisherId);
    setLoading(true);
    loadEngagement(publisherId).finally(() => setLoading(false));
  };

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadEngagement(selected)
      .catch(() => undefined)
      .finally(() => setRefreshing(false));
  }, [loadEngagement, selected]);

  return (
    <AdminGuard>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <Text style={styles.hint}>
          Agregado y anonimizado: cada cifra representa a un mínimo de cuentas distintas. No se
          muestra a ningún alumno identificado.
        </Text>

        {publishers.length === 0 ? (
          <Text style={styles.muted}>Todavía no administras ningún publisher.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.publisherRow}>
            {publishers.map((pub) => (
              <TouchableOpacity
                key={pub.id}
                style={[styles.publisherChip, selected === pub.id && styles.publisherChipSelected]}
                onPress={() => handleSelect(pub.id)}
              >
                <PublisherAvatar publisher={pub} size={22} />
                <Text
                  style={[styles.publisherChipText, selected === pub.id && styles.publisherChipTextSelected]}
                  numberOfLines={1}
                >
                  {pub.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {loading ? (
          <ActivityIndicator style={styles.loader} color="#2563eb" />
        ) : rows.length === 0 ? (
          <Text style={styles.muted}>
            Aún no hay suficientes cuentas distintas interactuando con este publisher para mostrar
            una cifra (protege la privacidad de los pocos alumnos involucrados).
          </Text>
        ) : (
          rows.map((r, i) => (
            <View key={`${r.weekStart}-${r.entityType}-${r.category}-${i}`} style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>
                  {ENTITY_LABEL[r.entityType] ?? r.entityType}
                  {r.category ? ` · ${r.category}` : ''}
                </Text>
                <Text style={styles.rowMeta}>
                  Semana {r.weekStart} · {r.universityId ?? 'todas'} / {r.campusId ?? 'todos los campus'}
                </Text>
              </View>
              <View style={styles.rowStats}>
                <Text style={styles.rowEvents}>{r.events} eventos</Text>
                <Text style={styles.rowActors}>{r.distinctActors} cuentas</Text>
                {r.growthWowPct != null && (
                  <Text style={[styles.rowGrowth, r.growthWowPct < 0 && styles.rowGrowthNegative]}>
                    {r.growthWowPct > 0 ? '+' : ''}
                    {r.growthWowPct}% WoW
                  </Text>
                )}
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
  hint: { color: '#64748b', fontSize: 12, lineHeight: 17 },
  muted: { color: '#94a3b8', fontSize: 13 },
  loader: { marginTop: 24 },
  publisherRow: { gap: 8 },
  publisherChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 20,
    paddingVertical: 5,
    paddingLeft: 5,
    paddingRight: 12,
    maxWidth: 230,
    backgroundColor: '#ffffff',
  },
  publisherChipSelected: { backgroundColor: '#0A1525', borderColor: '#0A1525' },
  publisherChipText: { color: '#475569', fontWeight: '600', fontSize: 13, flexShrink: 1 },
  publisherChipTextSelected: { color: '#ffffff' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    gap: 8,
  },
  rowInfo: { flexShrink: 1, gap: 2 },
  rowTitle: { color: '#0f172a', fontWeight: '700', fontSize: 13 },
  rowMeta: { color: '#64748b', fontSize: 11 },
  rowStats: { alignItems: 'flex-end', gap: 1 },
  rowEvents: { color: '#0f172a', fontWeight: '800', fontSize: 13 },
  rowActors: { color: '#64748b', fontSize: 11 },
  rowGrowth: { color: '#16a34a', fontSize: 11, fontWeight: '700' },
  rowGrowthNegative: { color: '#dc2626' },
});
