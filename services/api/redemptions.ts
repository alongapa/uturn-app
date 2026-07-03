// Servicio de canjes sobre Supabase. Crear un canje pasa por redeem_item (valida
// saldo y carga créditos en el servidor); marcar como usado sí es update directo.

import type { RedeemableCategory, RedeemableItem, Redemption } from '@/models/uturn';
import { supabase } from '@/services/supabase';
import type { RedeemableRow } from '@/types/database';
import { mapRedemptionRowToRedemption } from './mappers';

function mapRedeemableRowToItem(row: RedeemableRow): RedeemableItem {
  return {
    id: row.id,
    titulo: row.title,
    descripcion: row.description,
    categoria: row.category as RedeemableCategory,
    costoCreditos: row.cost_credits,
    patrocinador: row.sponsor ?? undefined,
    stock: row.stock ?? undefined,
    vigenciaDias: row.validity_days,
    publicadoPorAdmin: row.published_by_admin,
  };
}

export async function listCatalog(): Promise<RedeemableItem[]> {
  const { data, error } = await supabase
    .from('redeemables')
    .select('*')
    .eq('active', true)
    .order('cost_credits', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapRedeemableRowToItem);
}

export async function listRedemptions(userId: string): Promise<Redemption[]> {
  const { data, error } = await supabase
    .from('redemptions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRedemptionRowToRedemption);
}

export async function redeem(itemId: string): Promise<Redemption> {
  const { data, error } = await supabase.rpc('redeem_item', { p_item_id: itemId });
  if (error) throw error;
  return mapRedemptionRowToRedemption(data);
}

export async function markRedemptionUsed(redemptionId: string): Promise<void> {
  const { error } = await supabase
    .from('redemptions')
    .update({ status: 'canjeado', redeemed_at: new Date().toISOString() })
    .eq('id', redemptionId);
  if (error) throw error;
}
