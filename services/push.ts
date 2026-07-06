// Capa de dispositivo para push (Sesión 7): expo-notifications.
// Aquí vive todo lo nativo — permisos, ExponentPushToken, canal Android,
// handler de primer plano y badge del ícono. La persistencia del token y el
// historial van por services/api/notifications.ts; la orquestación (cuándo
// pedir permiso, deep links al tocar) por contexts/NotificationsContext.
//
// Limitaciones conocidas (documentadas en docs/sesiones/07):
//  - Expo Go (SDK 53+) ya no soporta push remoto: se necesita un development
//    build (npx expo run:ios|android o EAS).
//  - El simulador de iOS no recibe push: probar en dispositivo real.
//  - getExpoPushTokenAsync exige un projectId de EAS (extra.eas.projectId).

import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { registerPushToken, unregisterPushToken } from '@/services/api/notifications';
import { isSupabaseConfigured } from '@/services/supabase';
import type { PushPlatform } from '@/types/database';

export type PushPermissionStatus = 'granted' | 'denied' | 'undetermined' | 'unavailable';

// Token registrado en esta sesión de app: permite darlo de baja al cerrar sesión.
let currentToken: string | null = null;

/** true solo donde el push remoto puede funcionar (dispositivo real, no Expo Go). */
export function isPushSupported(): boolean {
  if (Platform.OS === 'web') return false;
  if (!Device.isDevice) return false; // simulador/emulador
  // Expo Go no soporta push remoto desde SDK 53.
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return false;
  return true;
}

/**
 * Handler de primer plano: los push de 'mensajes' se suprimen (el chat ya es
 * realtime y en vivo, Sesión 6) — con la app en segundo plano el sistema los
 * muestra igual. El resto (pagos, viajes, social) sí se muestra como banner.
 */
export function configureNotificationHandling(): void {
  if (Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const category = notification.request.content.data?.category;
      const suppress = category === 'mensajes';
      return {
        shouldShowBanner: !suppress,
        shouldShowList: !suppress,
        shouldPlaySound: !suppress,
        shouldSetBadge: false, // el badge lo maneja el contexto (no-leídos reales)
      };
    },
  });
}

/** Canal Android por defecto (obligatorio para que el push suene/vibre). */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'General',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#246BFD',
  });
}

export async function getPushPermissionStatus(): Promise<PushPermissionStatus> {
  if (!isPushSupported()) return 'unavailable';
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return 'granted';
  if (status === 'denied') return 'denied';
  return 'undetermined';
}

/**
 * Muestra el diálogo del sistema. Llamar SIEMPRE desde un contexto con
 * explicación previa (banner del centro de notificaciones, post-reserva…):
 * el permiso se pide cuando el usuario entiende para qué sirve.
 */
export async function requestPushPermission(): Promise<PushPermissionStatus> {
  if (!isPushSupported()) return 'unavailable';
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
}

/** ExponentPushToken del dispositivo, o null donde no aplica. */
async function getExpoPushToken(): Promise<string | null> {
  if (!isPushSupported()) return null;
  const projectId: string | undefined =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    undefined;
  if (!projectId) {
    if (__DEV__) {
      console.warn(
        'Push: falta extra.eas.projectId en app.json (corre `eas init`); no se puede obtener el token.'
      );
    }
    return null;
  }
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return data;
}

/**
 * Registra el dispositivo para la cuenta activa: canal Android + token Expo →
 * push_tokens en Supabase. Silencioso: si el permiso no está concedido o el
 * entorno no soporta push, simplemente no hace nada (devuelve false).
 */
export async function registerDeviceForPush(): Promise<boolean> {
  if (!isSupabaseConfigured || !isPushSupported()) return false;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return false;
    await ensureAndroidChannel();
    const token = await getExpoPushToken();
    if (!token) return false;
    const platform: PushPlatform = Platform.OS === 'ios' ? 'ios' : 'android';
    await registerPushToken(token, platform, Device.modelName ?? undefined);
    currentToken = token;
    return true;
  } catch (error) {
    if (__DEV__) console.warn('Push: no se pudo registrar el token', error);
    return false;
  }
}

/** Da de baja el token del dispositivo. Llamar ANTES de signOut. */
export async function unregisterCurrentDeviceToken(): Promise<void> {
  if (!currentToken || !isSupabaseConfigured) return;
  const token = currentToken;
  currentToken = null;
  try {
    await unregisterPushToken(token);
  } catch (error) {
    if (__DEV__) console.warn('Push: no se pudo dar de baja el token', error);
  }
}

/** Badge del ícono de la app (no-leídos de notificaciones + chat). */
export async function setAppBadgeCount(count: number): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, count));
  } catch {
    // Algunos launchers de Android no soportan badge; se ignora.
  }
}
