import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { AdminGuard } from '@/components/admin/admin-guard';
import { PostComposer } from '@/components/feed/post-composer';
import { PublisherAvatar } from '@/components/feed/publisher-avatar';
import { usePermissions } from '@/hooks/use-permissions';
import { listMyPublishers, listPendingProposals } from '@/services/api/admin';
import { listDisputes } from '@/services/api/payments';
import type { FeedPublisher } from '@/services/api/feed';

type ActionRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  caption: string;
  onPress: () => void;
  badge?: number;
};

function ActionRow({ icon, title, caption, onPress, badge }: ActionRowProps) {
  return (
    <TouchableOpacity style={styles.actionRow} onPress={onPress}>
      <View style={styles.actionIcon}>
        <Ionicons name={icon} size={20} color="#246BFD" />
      </View>
      <View style={styles.actionText}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionCaption}>{caption}</Text>
      </View>
      {badge != null && badge > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
    </TouchableOpacity>
  );
}

/**
 * Home del panel (Sesión 5): publishers del usuario, composer y accesos a
 * widget, carpetas, marcas y canjeables; el owner suma aprobaciones y gestión
 * de publishers. Visible solo para admin/owner (RLS respalda cada acción).
 */
export default function AdminPanelScreen() {
  const permissions = usePermissions();
  const [publishers, setPublishers] = useState<FeedPublisher[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [disputesCount, setDisputesCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [composerVisible, setComposerVisible] = useState(false);

  const load = useCallback(async () => {
    const mine = await listMyPublishers();
    setPublishers(mine);
    // Disputas de pago abiertas: las revisan admin y owner (Sesión 8).
    const disputes = await listDisputes(true).catch(() => []);
    setDisputesCount(disputes.length);
    if (permissions.isOwner) {
      const pending = await listPendingProposals();
      setPendingCount(pending.length);
    }
  }, [permissions.isOwner]);

  useEffect(() => {
    if (!permissions.isAdmin) return;
    load().catch(() => Alert.alert('No se pudo cargar el panel'));
  }, [load, permissions.isAdmin]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    load()
      .catch(() => undefined)
      .finally(() => setRefreshing(false));
  }, [load]);

  return (
    <AdminGuard>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <Text style={styles.sectionTitle}>Publicas como</Text>
        {publishers.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>
              {permissions.isOwner
                ? 'Aún no hay entidades publicadoras.'
                : 'El owner todavía no te asigna a ningún publisher. Pídele acceso para publicar.'}
            </Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.publisherRow}
          >
            {publishers.map((pub) => (
              <View key={pub.id} style={styles.publisherChip}>
                <PublisherAvatar publisher={pub} size={26} />
                <Text style={styles.publisherChipText} numberOfLines={1}>
                  {pub.name}
                </Text>
              </View>
            ))}
          </ScrollView>
        )}

        <Text style={styles.sectionTitle}>Contenido</Text>
        <View style={styles.card}>
          <ActionRow
            icon="create-outline"
            title="Publicar"
            caption="Post o historia al feed de Inicio"
            onPress={() => setComposerVisible(true)}
          />
          <ActionRow
            icon="calendar-outline"
            title="Widget de eventos"
            caption="Ordenar, fijar y destacar la semana"
            onPress={() => router.push('/admin/widget')}
          />
          <ActionRow
            icon="folder-open-outline"
            title="Carpetas de contenido"
            caption="Colecciones de fotos integrables al feed"
            onPress={() => router.push('/admin/folders')}
          />
          <ActionRow
            icon="ribbon-outline"
            title="Marcas asociadas"
            caption="Logos que co-firman promociones"
            onPress={() => router.push('/admin/brands')}
          />
        </View>

        <Text style={styles.sectionTitle}>Créditos</Text>
        <View style={styles.card}>
          <ActionRow
            icon="gift-outline"
            title="Postular canjeables"
            caption="Propuestas que aprueba el owner"
            onPress={() => router.push('/admin/redeemables')}
          />
        </View>

        <Text style={styles.sectionTitle}>Pagos</Text>
        <View style={styles.card}>
          <ActionRow
            icon="shield-checkmark-outline"
            title="Disputas de pago"
            caption='Reclamos "yo sí pagué" por revisar'
            badge={disputesCount}
            onPress={() => router.push('/admin/disputes')}
          />
        </View>

        {permissions.isOwner && (
          <>
            <Text style={styles.sectionTitle}>Owner</Text>
            <View style={styles.card}>
              <ActionRow
                icon="bar-chart-outline"
                title="Panel financiero"
                caption="Comisiones, volumen por campus y morosidad"
                onPress={() => router.push('/admin/finance')}
              />
              <ActionRow
                icon="checkmark-done-outline"
                title="Aprobaciones"
                caption="Canjeables postulados por admins"
                badge={pendingCount}
                onPress={() => router.push('/admin/approvals')}
              />
              <ActionRow
                icon="people-outline"
                title="Publishers y miembros"
                caption="Crear entidades y asignar admins"
                onPress={() => router.push('/admin/publishers')}
              />
            </View>
          </>
        )}

        <PostComposer
          visible={composerVisible}
          onClose={() => setComposerVisible(false)}
          onPublished={() => Alert.alert('Publicado', 'Ya está visible en el feed de Inicio.')}
        />
      </ScrollView>
    </AdminGuard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7fb' },
  content: { padding: 16, paddingBottom: 40, gap: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a', marginTop: 6 },
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
  publisherChipText: { color: '#475569', fontWeight: '600', fontSize: 13, flexShrink: 1 },
  emptyBox: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 12,
    padding: 12,
  },
  emptyText: { color: '#92400e', fontSize: 13, lineHeight: 18 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 4,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f1f5f9',
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { flex: 1, gap: 2 },
  actionTitle: { fontSize: 14.5, fontWeight: '700', color: '#0f172a' },
  actionCaption: { fontSize: 12, color: '#64748b' },
  badge: {
    backgroundColor: '#dc2626',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { color: '#ffffff', fontSize: 11, fontWeight: '800' },
});
