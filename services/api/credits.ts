// Servicio de créditos Uturn sobre Supabase. El saldo se agrega desde
// credit_transactions (que el cliente solo puede leer: las altas las hacen las
// funciones de servidor confirm_payment_received / redeem_item).

import type { RealtimeChannel } from '@supabase/supabase-js';

import type { CreditTransaction } from '@/models/uturn';
import { supabase } from '@/services/supabase';
import { mapCreditRowToTransaction } from './mappers';

export async function listTransactions(userId: string): Promise<CreditTransaction[]> {
  const { data, error } = await supabase
    .from('credit_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapCreditRowToTransaction);
}

export async function getBalance(userId: string): Promise<number> {
  const { data, error } = await supabase.rpc('credit_balance', { target: userId });
  if (error) throw error;
  return data ?? 0;
}

export function subscribeCredits(userId: string, onChange: () => void): RealtimeChannel {
  return supabase
    .channel('public:credit_transactions')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'credit_transactions', filter: `user_id=eq.${userId}` },
      onChange
    )
    .subscribe();
}
