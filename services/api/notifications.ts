// Servicio del centro de notificaciones (Sesión 7) sobre Supabase.
// El historial lo escribe SOLO el servidor (triggers + cron encolan en
// public.notifications); el cliente lee, marca leído (único campo editable,
// trigger protect_notification_columns) y administra sus preferencias por
// categoría y el push token del dispositivo (RPCs register/unregister).

import type { RealtimeChannel } from '@supabase/supabase-js';

import type { NotificationPrefs } from '@/models/unities';
import { supabase } from '@/services/supabase';
import type { Json, NotificationCategory, NotificationRow, PushPlatform } from '@/types/database';

export type { NotificationCategory } from '@/types/database';

export type AppNotification = {
  id: string;
  category: NotificationCategory;
  type: string;
  title: string;
  body: string;
  /** Ruta expo-router que abre el deep link (ej. '/chat/<id>'). */
  url?: string;
  data: Json;
  readAt?: string;
  createdAt: string;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  pagos: true,
  viajes: true,
  social: true,
  mensajes: true,
};

async function requireUid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) throw new Error('Necesitas iniciar sesión');
  return uid;
}

export function mapNotificationRow(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    category: row.category,
    type: row.type,
    title: row.title,
    body: row.body,
    url: row.url ?? undefined,
    data: row.data,
    readAt: row.read_at ?? undefined,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Historial
// ---------------------------------------------------------------------------

export async function listNotifications(limit = 100): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapNotificationRow);
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null);
  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<void> {
  const uid = await requireUid();
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', uid)
    .is('read_at', null);
  if (error) throw error;
}

/** No-leídos del centro (para el badge del ícono junto al chat). */
export async function unreadNotificationCount(): Promise<number> {
  const uid = await requireUid();
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', uid)
    .is('read_at', null);
  if (error) throw error;
  return count ?? 0;
}

/** No-leídos del chat (Sesión 6), sumados al badge del ícono. */
export async function chatUnreadCount(): Promise<number> {
  const { data, error } = await supabase.rpc('conversation_unread_counts');
  if (error) throw error;
  return (data ?? []).reduce((sum, row) => sum + Number(row.unread_count), 0);
}

/** Historial y badge en vivo: INSERT (nueva) y UPDATE (leída) del usuario. */
export function subscribeToNotifications(userId: string, onChange: () => void): RealtimeChannel {
  return supabase
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      onChange
    )
    .subscribe();
}

// ---------------------------------------------------------------------------
// Preferencias por categoría (el servidor las respeta antes de encolar)
// ---------------------------------------------------------------------------

export async function getNotificationPrefs(): Promise<NotificationPrefs> {
  const uid = await requireUid();
  const { data, error } = await supabase
    .from('notification_prefs')
    .select('*')
    .eq('user_id', uid)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ...DEFAULT_NOTIFICATION_PREFS };
  return { pagos: data.pagos, viajes: data.viajes, social: data.social, mensajes: data.mensajes };
}

export async function updateNotificationPrefs(prefs: NotificationPrefs): Promise<void> {
  const uid = await requireUid();
  const { error } = await supabase
    .from('notification_prefs')
    .upsert({ user_id: uid, ...prefs }, { onConflict: 'user_id' });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Push tokens (un ExponentPushToken por dispositivo, RPCs security definer)
// ---------------------------------------------------------------------------

export async function registerPushToken(
  token: string,
  platform: PushPlatform,
  deviceName?: string
): Promise<void> {
  const { error } = await supabase.rpc('register_push_token', {
    p_token: token,
    p_platform: platform,
    p_device_name: deviceName ?? null,
  });
  if (error) throw error;
}

/** Se llama ANTES de signOut (necesita la sesión viva). */
export async function unregisterPushToken(token: string): Promise<void> {
  const { error } = await supabase.rpc('unregister_push_token', { p_token: token });
  if (error) throw error;
}
