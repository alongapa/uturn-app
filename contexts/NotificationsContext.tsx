// Contexto de notificaciones (Sesión 7). Orquesta:
//  - registro silencioso del push token cuando hay sesión y permiso concedido,
//  - permiso pedido EN CONTEXTO (enablePush/maybeAskPushPermission con
//    explicación previa, nunca al arrancar la app),
//  - no-leídos en vivo (centro + chat de la Sesión 6) → badge del ícono,
//  - preferencias por categoría (servidor; fallback local sin Supabase),
//  - deep links: tocar una push abre su pantalla vía expo-router.

import * as Notifications from 'expo-notifications';
import { router, useRootNavigationState } from 'expo-router';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, AppState, Platform } from 'react-native';

import { useUser } from '@/contexts/UserContext';
import type { NotificationPrefs } from '@/models/unities';
import {
  DEFAULT_NOTIFICATION_PREFS,
  chatUnreadCount,
  getNotificationPrefs,
  markNotificationRead,
  subscribeToNotifications,
  unreadNotificationCount,
  updateNotificationPrefs as updateServerPrefs,
} from '@/services/api/notifications';
import {
  configureNotificationHandling,
  getPushPermissionStatus,
  registerDeviceForPush,
  requestPushPermission,
  setAppBadgeCount,
  type PushPermissionStatus,
} from '@/services/push';
import { isSupabaseConfigured, supabase } from '@/services/supabase';
import { useAppState } from '@/store/appState';

interface NotificationsContextValue {
  /** No-leídos del centro de notificaciones. */
  unreadCount: number;
  /** No-leídos del chat (Sesión 6); el badge del ícono suma ambos. */
  chatUnread: number;
  refreshUnread: () => void;
  prefs: NotificationPrefs;
  setPref: (category: keyof NotificationPrefs, value: boolean) => void;
  pushStatus: PushPermissionStatus;
  /** Pide el permiso del sistema y registra el token. Llamar tras explicar. */
  enablePush: () => Promise<boolean>;
  /** Ofrece activar push con explicación, solo si aún no se ha decidido. */
  maybeAskPushPermission: (reason: string) => void;
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

// El handler de primer plano debe quedar instalado antes de que llegue
// cualquier push (módulo, no efecto: sobrevive a remounts del provider).
configureNotificationHandling();

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useUser();
  const { settings, updateNotificationPrefs: updateLocalPrefs } = useAppState();

  const [unreadCount, setUnreadCount] = useState(0);
  const [chatUnread, setChatUnread] = useState(0);
  const [serverPrefs, setServerPrefs] = useState<NotificationPrefs | null>(null);
  const [pushStatus, setPushStatus] = useState<PushPermissionStatus>('unavailable');

  const userId = isAuthenticated ? user?.id ?? null : null;

  // ---------------------------------------------------------------------
  // No-leídos y badge
  // ---------------------------------------------------------------------

  const refreshUnread = useCallback(() => {
    if (!userId || !isSupabaseConfigured) {
      setUnreadCount(0);
      setChatUnread(0);
      return;
    }
    unreadNotificationCount()
      .then(setUnreadCount)
      .catch(() => undefined);
    chatUnreadCount()
      .then(setChatUnread)
      .catch(() => undefined);
  }, [userId]);

  useEffect(() => {
    refreshUnread();
    if (!userId || !isSupabaseConfigured) return;

    // Historial propio en vivo (RLS filtra) + movimientos del chat.
    const notifChannel = subscribeToNotifications(userId, refreshUnread);
    const chatChannel = supabase
      .channel(`chat-unread:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, refreshUnread)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversation_members' },
        refreshUnread
      )
      .subscribe();

    // Al volver del background (p. ej. tras tocar una push) se resincroniza.
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshUnread();
    });

    return () => {
      notifChannel.unsubscribe();
      chatChannel.unsubscribe();
      appStateSub.remove();
    };
  }, [userId, refreshUnread]);

  useEffect(() => {
    setAppBadgeCount(unreadCount + chatUnread);
  }, [unreadCount, chatUnread]);

  // ---------------------------------------------------------------------
  // Permiso + registro del token
  // ---------------------------------------------------------------------

  useEffect(() => {
    let active = true;
    getPushPermissionStatus().then((status) => {
      if (active) setPushStatus(status);
    });
    return () => {
      active = false;
    };
  }, []);

  // Registro silencioso: solo si el permiso YA fue concedido antes.
  useEffect(() => {
    if (!userId || pushStatus !== 'granted') return;
    registerDeviceForPush().catch(() => undefined);
  }, [userId, pushStatus]);

  const enablePush = useCallback(async () => {
    const status = await requestPushPermission();
    setPushStatus(status);
    if (status !== 'granted') return false;
    return registerDeviceForPush();
  }, []);

  const askedRef = useRef(false);
  const maybeAskPushPermission = useCallback(
    (reason: string) => {
      if (Platform.OS === 'web' || askedRef.current || pushStatus !== 'undetermined') return;
      askedRef.current = true;
      Alert.alert('Activa las notificaciones', reason, [
        { text: 'Ahora no', style: 'cancel' },
        { text: 'Activar', onPress: () => void enablePush() },
      ]);
    },
    [pushStatus, enablePush]
  );

  // ---------------------------------------------------------------------
  // Preferencias por categoría
  // ---------------------------------------------------------------------

  useEffect(() => {
    if (!userId || !isSupabaseConfigured) {
      setServerPrefs(null);
      return;
    }
    let active = true;
    getNotificationPrefs()
      .then((prefs) => {
        if (active) setServerPrefs(prefs);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [userId]);

  const prefs = serverPrefs ?? settings.notificaciones ?? DEFAULT_NOTIFICATION_PREFS;

  const setPref = useCallback(
    (category: keyof NotificationPrefs, value: boolean) => {
      const next = { ...prefs, [category]: value };
      // Espejo local (persistido en AsyncStorage) + servidor cuando hay sesión.
      updateLocalPrefs({ [category]: value });
      if (!userId || !isSupabaseConfigured) return;
      setServerPrefs(next);
      updateServerPrefs(next).catch(() => {
        setServerPrefs(prefs); // revierte el optimista si el servidor falló
        Alert.alert('No se pudo guardar la preferencia. Intenta de nuevo.');
      });
    },
    [prefs, userId, updateLocalPrefs]
  );

  // ---------------------------------------------------------------------
  // Deep links: tocar una notificación abre su pantalla
  // ---------------------------------------------------------------------

  const navigationState = useRootNavigationState();
  const navReady = Boolean(navigationState?.key);
  const pendingUrlRef = useRef<string | null>(null);
  const handledResponsesRef = useRef<Set<string>>(new Set());

  const openNotificationUrl = useCallback(
    (url: string) => {
      if (navReady) {
        router.push(url as Parameters<typeof router.push>[0]);
      } else {
        pendingUrlRef.current = url; // arranque en frío: navega cuando el router esté listo
      }
    },
    [navReady]
  );

  useEffect(() => {
    if (navReady && pendingUrlRef.current) {
      const url = pendingUrlRef.current;
      pendingUrlRef.current = null;
      router.push(url as Parameters<typeof router.push>[0]);
    }
  }, [navReady]);

  const handleResponse = useCallback(
    (response: Notifications.NotificationResponse) => {
      const key = response.notification.request.identifier;
      if (handledResponsesRef.current.has(key)) return;
      handledResponsesRef.current.add(key);

      const data = response.notification.request.content.data as
        | { url?: unknown; notificationId?: unknown }
        | undefined;
      const notificationId = data?.notificationId;
      if (typeof notificationId === 'string' && isSupabaseConfigured) {
        markNotificationRead(notificationId).catch(() => undefined);
      }
      const url = data?.url;
      if (typeof url === 'string' && url.startsWith('/')) {
        openNotificationUrl(url);
      }
    },
    [openNotificationUrl]
  );

  // Tap con la app viva (foreground/background).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationResponseReceivedListener(handleResponse);
    return () => sub.remove();
  }, [handleResponse]);

  // Tap que ABRIÓ la app (cold start); el Set evita procesarlo dos veces.
  const lastResponse = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (lastResponse) handleResponse(lastResponse);
  }, [lastResponse, handleResponse]);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      unreadCount,
      chatUnread,
      refreshUnread,
      prefs,
      setPref,
      pushStatus,
      enablePush,
      maybeAskPushPermission,
    }),
    [unreadCount, chatUnread, refreshUnread, prefs, setPref, pushStatus, enablePush, maybeAskPushPermission]
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotifications debe usarse dentro de NotificationsProvider');
  }
  return context;
}
