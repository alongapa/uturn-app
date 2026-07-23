// Servicio de referidos sobre Supabase. Canjear un código pasa por
// redeem_referral_code (valida antiabuso en el servidor); el bono de créditos
// lo entrega el trigger award_referral_on_first_payment al confirmarse el
// primer viaje pagado del invitado — el cliente solo lee el estado.

import type { Referral } from '@/models/unities';
import { supabase } from '@/services/supabase';
import type { ReferralRow } from '@/types/database';

function mapReferralRow(row: ReferralRow, userId: string): Referral {
  return {
    id: row.id,
    referidoId: row.referred_user_id,
    esComoReferrer: row.referrer_id === userId,
    estado: row.status,
    createdAt: row.created_at,
    creditadoAt: row.credited_at ?? undefined,
  };
}

export async function getMyReferralCode(userId: string): Promise<string | null> {
  const { data, error } = await supabase.from('profiles').select('referral_code').eq('id', userId).single();
  if (error) throw error;
  return data?.referral_code ?? null;
}

export async function redeemReferralCode(code: string): Promise<Referral> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase.rpc('redeem_referral_code', { p_code: code.trim().toUpperCase() });
  if (error) throw error;
  return mapReferralRow(data, user?.id ?? '');
}

export async function listMyReferrals(userId: string): Promise<Referral[]> {
  const { data, error } = await supabase
    .from('referrals')
    .select('*')
    .or(`referrer_id.eq.${userId},referred_user_id.eq.${userId}`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapReferralRow(row, userId));
}
