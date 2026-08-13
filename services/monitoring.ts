// Monitoreo de crashes (Sesión 10).
//
// Alcance deliberadamente angosto: **solo errores**. Los eventos de producto
// (reserva creada, pago a tiempo, post publicado, canje) son de la sesión de
// analítica y van a otra herramienta. Mezclarlos acá tiene dos costos: enturbia
// la señal de crashes con ruido de uso, y arrastra datos de comportamiento a un
// proveedor cuyo propósito declarado en la política de privacidad es
// "diagnóstico de fallas".
//
// Regla de privacidad que este archivo hace cumplir: a Sentry no viaja PII. Ni
// correos institucionales, ni nombres, ni patentes, ni datos bancarios, ni el
// contenido de mensajes. Solo el id de usuario (un UUID opaco, necesario para
// saber si un crash afecta a una persona o a mil).

import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';

/** true si hay DSN configurado; sin él, todo esto es no-op. */
export const isMonitoringEnabled = Boolean(dsn);

/**
 * Claves que nunca deben salir del dispositivo. Se limpian de `extra` y de los
 * breadcrumbs antes de enviar. La lista es de bloqueo y no de permiso a
 * propósito: un `extra` nuevo no debería quedar bloqueado por olvido, pero uno
 * llamado `email` sí tiene que irse aunque nadie se acuerde de este archivo.
 */
const PII_KEYS = [
  'email',
  'correo',
  'full_name',
  'fullName',
  'nombre',
  'phone',
  'telefono',
  'emergency_contact_phone',
  'plate',
  'patente',
  'driver_license_number',
  'numeroCuenta',
  'accountNumber',
  'body',
  'message',
  'texto',
  'token',
  'access_token',
  'password',
];

function scrub(data: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!data) return data;
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    clean[key] = PII_KEYS.some((pii) => key.toLowerCase().includes(pii.toLowerCase()))
      ? '[filtrado]'
      : value;
  }
  return clean;
}

/**
 * Arranca Sentry. Se llama una vez desde el layout raíz.
 *
 * Sin DSN no hace nada: en desarrollo local y en los tests no queremos que un
 * error de trabajo aparezca como un crash de producción.
 */
export function initMonitoring(): void {
  if (!isMonitoringEnabled) return;

  Sentry.init({
    dsn,
    // La versión que se ve en el panel tiene que ser la del binario/OTA, no la
    // del package.json, o un crash de una OTA vieja se atribuye a la nueva.
    release: Constants.expoConfig?.version ?? undefined,
    environment: __DEV__ ? 'development' : 'production',

    // Sin trazas de rendimiento por ahora: son la parte cara del plan y lo que
    // este piloto necesita es saber qué se rompe, no cuánto tarda.
    tracesSampleRate: 0,

    // sendDefaultPii activaría IP y datos de usuario automáticos: exactamente
    // lo que la política de privacidad dice que no recolectamos.
    sendDefaultPii: false,

    beforeSend(event) {
      event.extra = scrub(event.extra);
      if (event.user) {
        // Solo el id opaco sobrevive.
        event.user = { id: event.user.id };
      }
      return event;
    },

    beforeBreadcrumb(breadcrumb) {
      breadcrumb.data = scrub(breadcrumb.data);
      return breadcrumb;
    },
  });
}

/**
 * Asocia los crashes a un usuario por su UUID, sin nombre ni correo.
 *
 * Sirve para responder "¿esto le pasa a una persona o a toda la UDD?", que es
 * la pregunta que decide si un bug se arregla hoy o el lunes.
 */
export function identifyUser(userId: string | null): void {
  if (!isMonitoringEnabled) return;
  Sentry.setUser(userId ? { id: userId } : null);
}

/**
 * Reporta un error que la app ya manejó (mostró un mensaje y siguió andando).
 *
 * Los crashes duros llegan solos; estos no, y suelen ser los interesantes: un
 * RPC que falla siempre para cierto rol se ve como "no pasó nada" en la
 * pantalla y como un patrón claro acá.
 */
export function captureHandledError(error: unknown, context?: Record<string, unknown>): void {
  if (!isMonitoringEnabled) {
    if (__DEV__) console.warn('[monitoring]', error, context);
    return;
  }
  Sentry.captureException(error, { extra: scrub(context) });
}

/** Migas para reconstruir qué venía haciendo el usuario antes del crash. */
export function addBreadcrumb(message: string, data?: Record<string, unknown>): void {
  if (!isMonitoringEnabled) return;
  Sentry.addBreadcrumb({ message, data: scrub(data), level: 'info' });
}

/** Envuelve el componente raíz para capturar errores de render. */
export const wrapRootComponent = Sentry.wrap;
