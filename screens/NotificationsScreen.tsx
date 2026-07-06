import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useNotifications } from '@/contexts/NotificationsContext';
import { useUser } from '@/contexts/UserContext';
import type { NotificationPrefs } from '@/models/unities';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeToNotifications,
  type AppNotification,
  type NotificationCategory,
} from '@/services/api/notifications';
import { isSupabaseConfigured } from '@/services/supabase';

/**
 * Centro de notificaciones (Sesión 7): historial por usuario (tabla
 * notifications, en vivo por realtime) + preferencias por categoría. Las
 * preferencias se guardan en el servidor y se respetan ANTES de encolar
 * cualquier push (enqueue_notification): lo desactivado no llega ni al
 * historial. El permiso del sistema se pide aquí, en contexto y con
 * explicación (banner superior), nunca al arrancar la app.
 */

const CATEGORY_META: Record<
  NotificationCategory,
  { label: string; description: string; icon: keyof typeof Ionicons.glyphMap; color: string }
> = {
  pagos: {
    label: 'Pagos',
    description: 'Plazos de 48 h, recordatorios (24 h y 4 h), strikes y confirmaciones.',
    icon: 'card-outline',
    color: '#2563eb',
  },
  viajes: {
    label: 'Viajes',
    description: 'Reservas en tus viajes y recordatorio 1 h antes de salir.',
    icon: 'car-outline',
    color: '#16a34a',
  },
  social: {
    label: 'Social',
    description: 'Respuestas en Q&A, historias y eventos destacados.',
    icon: 'megaphone-outline',
    color: '#d97706',
  },
  mensajes: {
    label: 'Mensajes',
    description: 'Mensajes nuevos con la app en segundo plano.',
    icon: 'chatbubble-ellipses-outline',
    color: '#7c3aed',
  },
};

const PREF_ORDER: (keyof NotificationPrefs)[] = ['pagos', 'viajes', 'social', 'mensajes'];

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
}

export default function NotificationsScreen() {
  const { user, isAuthenticated } = useUser();
  const { prefs, setPref, pushStatus, enablePush, refreshUnread } = useNotifications();

  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const userId = isAuthenticated ? user?.id : undefined;
  const canLoad = Boolean(userId) && isSupabaseConfigured;

  const load = useCallback(async () => {
    if (!canLoad) {
      setLoading(false);
      return;
    }
    try {
      setItems(await listNotifications());
    } catch {
      // Sin red: se mantiene lo último cargado.
    } finally {
      setLoading(false);
    }
  }, [canLoad]);

  useEffect(() => {
    load();
    if (!canLoad || !userId) return;
    const channel = subscribeToNotifications(userId, load);
    return () => {
      channel.unsubscribe();
    };
  }, [canLoad, userId, load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    refreshUnread();
    setRefreshing(false);
  }, [load, refreshUnread]);

  const handleOpen = useCallback(
    (item: AppNotification) => {
      if (!item.readAt) {
        setItems((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n))
        );
        markNotificationRead(item.id)
          .then(refreshUnread)
          .catch(() => undefined);
      }
      if (item.url) {
        router.push(item.url as Parameters<typeof router.push>[0]);
      }
    },
    [refreshUnread]
  );

  const handleMarkAll = useCallback(() => {
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    markAllNotificationsRead()
      .then(refreshUnread)
      .catch(() => undefined);
  }, [refreshUnread]);

  const unread = items.filter((n) => !n.readAt).length;

  const header = (
    <View style={styles.headerBlock}>
      {/* Permiso pedido en contexto: primero la explicación, después el diálogo. */}
      {pushStatus === 'undetermined' && (
        <View style={styles.permissionCard}>
          <Text style={styles.permissionTitle}>Activa las notificaciones push</Text>
          <Text style={styles.permissionText}>
            Te avisamos antes de que venza un pago (24 h y 4 h), cuando reserven en tu viaje y
            cuando te escriban, aunque no tengas la app abierta.
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={() => void enablePush()}>
            <Text style={styles.permissionButtonText}>Activar</Text>
          </TouchableOpacity>
        </View>
      )}
      {pushStatus === 'denied' && (
        <TouchableOpacity style={styles.permissionCard} onPress={() => Linking.openSettings()}>
          <Text style={styles.permissionTitle}>Las push están desactivadas</Text>
          <Text style={styles.permissionText}>
            Actívalas en los ajustes del sistema para recibir recordatorios de pago y mensajes.
            Toca aquí para abrirlos.
          </Text>
        </TouchableOpacity>
      )}

      <Text style={styles.sectionTitle}>Preferencias</Text>
      <View style={styles.card}>
        {PREF_ORDER.map((category) => {
          const meta = CATEGORY_META[category];
          return (
            <View key={category} style={styles.prefRow}>
              <View style={[styles.prefIcon, { backgroundColor: `${meta.color}1a` }]}>
                <Ionicons name={meta.icon} size={18} color={meta.color} />
              </View>
              <View style={styles.prefInfo}>
                <Text style={styles.prefLabel}>{meta.label}</Text>
                <Text style={styles.prefDescription}>{meta.description}</Text>
              </View>
              <Switch
                value={prefs[category]}
                onValueChange={(value) => setPref(category, value)}
                trackColor={{ true: '#0EA5E9' }}
              />
            </View>
          );
        })}
        <Text style={styles.prefsHint}>
          Lo que desactives se silencia en el servidor: no llega push ni entra al historial.
        </Text>
      </View>

      <View style={styles.historyHeader}>
        <Text style={styles.sectionTitle}>Historial</Text>
        {unread > 0 && (
          <TouchableOpacity onPress={handleMarkAll}>
            <Text style={styles.markAllText}>Marcar todo leído</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  if (!canLoad) {
    return (
      <View style={styles.centered}>
        <Ionicons name="notifications-off-outline" size={40} color="#94a3b8" />
        <Text style={styles.emptyText}>
          Inicia sesión con Supabase configurado para ver tus notificaciones.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator style={styles.loader} size="large" color="#246BFD" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={header}
          renderItem={({ item }) => {
            const meta = CATEGORY_META[item.category];
            const isUnread = !item.readAt;
            return (
              <TouchableOpacity
                style={[styles.row, isUnread && styles.rowUnread]}
                onPress={() => handleOpen(item)}
              >
                <View style={[styles.prefIcon, { backgroundColor: `${meta.color}1a` }]}>
                  <Ionicons name={meta.icon} size={18} color={meta.color} />
                </View>
                <View style={styles.rowInfo}>
                  <Text style={[styles.rowTitle, isUnread && styles.rowTitleUnread]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  {item.body ? (
                    <Text style={styles.rowBody} numberOfLines={2}>
                      {item.body}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.rowMeta}>
                  <Text style={styles.rowWhen}>{formatWhen(item.createdAt)}</Text>
                  {isUnread && <View style={styles.unreadDot} />}
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              Aún no tienes notificaciones. Aquí verás pagos, viajes, mensajes y novedades.
            </Text>
          }
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  centered: {
    flex: 1,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  loader: { marginTop: 40 },
  listContent: { padding: 16, paddingBottom: 40, gap: 8 },
  headerBlock: { gap: 12, marginBottom: 4 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginTop: 4 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    gap: 14,
  },
  permissionCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    padding: 16,
    gap: 8,
  },
  permissionTitle: { fontWeight: '800', color: '#1e3a8a', fontSize: 15 },
  permissionText: { color: '#1e40af', fontSize: 13, lineHeight: 18 },
  permissionButton: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  permissionButtonText: { color: '#ffffff', fontWeight: '800' },
  prefRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  prefIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prefInfo: { flex: 1, gap: 2 },
  prefLabel: { color: '#0f172a', fontWeight: '700' },
  prefDescription: { color: '#94a3b8', fontSize: 12 },
  prefsHint: { color: '#64748b', fontSize: 12 },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  markAllText: { color: '#2563eb', fontWeight: '700', fontSize: 13 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
  },
  rowUnread: { backgroundColor: '#f0f9ff', borderColor: '#bae6fd' },
  rowInfo: { flex: 1, gap: 2 },
  rowTitle: { color: '#334155', fontWeight: '600' },
  rowTitleUnread: { color: '#0f172a', fontWeight: '800' },
  rowBody: { color: '#64748b', fontSize: 13 },
  rowMeta: { alignItems: 'flex-end', gap: 6 },
  rowWhen: { color: '#94a3b8', fontSize: 12 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#0ea5e9' },
  emptyText: { color: '#64748b', textAlign: 'center', marginTop: 24, paddingHorizontal: 12 },
});
