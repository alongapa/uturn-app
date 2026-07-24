// Anti-abuso (Sesión 9): señales básicas de cuentas duplicadas por dispositivo.
// Los límites de canje viven en la RPC redeem_item (servidor); no hay nada
// que envolver aquí para esa parte.

import { supabase } from '@/services/supabase';
import type { DuplicateAccountSignal } from '@/types/database';

/** Solo el owner puede verla (gate dentro de la RPC). */
export async function listDuplicateAccountSignals(days = 90): Promise<DuplicateAccountSignal[]> {
  const { data, error } = await supabase.rpc('list_duplicate_account_signals', { p_days: days });
  if (error) throw error;
  return data ?? [];
}
