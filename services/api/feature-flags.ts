// Lectura de las banderas de módulos (Sesión 10).
//
// El servidor solo puede APAGAR: se parte de los defaults del cliente y se
// aplica encima lo que diga la tabla. Una bandera que no existe en la tabla
// mantiene su default, así que agregar una nueva no exige migración inmediata.

import {
  FEATURE_FLAG_DEFAULTS,
  type FeatureFlag,
  type FeatureFlags,
} from '@/constants/feature-flags';
import { supabase } from '@/services/supabase';

export type FeatureFlagRow = {
  key: string;
  enabled: boolean;
  description: string;
  updated_at: string;
};

/**
 * Trae las banderas vigentes.
 *
 * Nunca lanza: si la consulta falla devuelve los defaults. Es la diferencia
 * entre "Supabase está lento" y "la app no abre".
 */
export async function getFeatureFlags(): Promise<FeatureFlags> {
  const flags: FeatureFlags = { ...FEATURE_FLAG_DEFAULTS };
  try {
    const { data, error } = await supabase.from('feature_flags').select('key, enabled');
    if (error || !data) return flags;

    for (const row of data as { key: string; enabled: boolean }[]) {
      if (row.key in flags) flags[row.key as FeatureFlag] = row.enabled;
    }
  } catch {
    // Sin red: los defaults ya están puestos.
  }
  return flags;
}

/** Listado completo para el panel de owner (incluye la descripción). */
export async function listFeatureFlags(): Promise<FeatureFlagRow[]> {
  const { data, error } = await supabase
    .from('feature_flags')
    .select('key, enabled, description, updated_at')
    .order('key');
  if (error) throw error;
  return (data ?? []) as FeatureFlagRow[];
}

/** Enciende o apaga una bandera. Solo el owner pasa la RLS. */
export async function setFeatureFlag(key: FeatureFlag, enabled: boolean): Promise<void> {
  const { error } = await supabase.from('feature_flags').update({ enabled }).eq('key', key);
  if (error) throw error;
}
