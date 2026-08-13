/**
 * Banderas de módulos (Sesión 10) y su valor por defecto.
 *
 * Los defaults viven acá y no en la base de datos a propósito: si la consulta
 * falla —sin red, Supabase caído, sesión aún sin abrir— la app tiene que
 * arrancar con un estado conocido en vez de quedarse en blanco. La tabla
 * `feature_flags` solo puede APAGAR algo que acá está encendido; nunca es la
 * única fuente de la respuesta.
 */
export const FEATURE_FLAG_DEFAULTS = {
  /** Verificación automática de transferencias con Fintoc. */
  pagos_fintoc: true,
  /** Pagar parte del cupo con créditos Unities. */
  pagos_creditos: true,
  feed: true,
  mensajes: true,
  /** Bots de tutoría con IA (apagarlo corta el gasto por token de inmediato). */
  bots_ia: true,
  canjes: true,
  tutorias: true,
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAG_DEFAULTS;

export type FeatureFlags = Record<FeatureFlag, boolean>;
