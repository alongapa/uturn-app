// Servicio de canjes sobre Supabase. Crear un canje pasa por redeem_item (valida
// saldo y carga créditos en el servidor); marcar como usado sí es update directo.

import type { RedeemableCategory, RedeemableItem, Redemption, WeeklyHighlight } from '@/models/unities';
import { supabase } from '@/services/supabase';
import type { RedeemableRow } from '@/types/database';
import { mapRedemptionRowToRedemption } from './mappers';

const NEW_WITHIN_DAYS = 7;
const LOW_STOCK_THRESHOLD = 5;

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
  // Solo lo aprobado por el owner entra al catálogo (Sesión 5); redeem_item
  // aplica el mismo filtro en el servidor.
  const { data, error } = await supabase
    .from('redeemables')
    .select('*')
    .eq('active', true)
    .eq('status', 'aprobado')
    .order('cost_credits', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapRedeemableRowToItem);
}

// Vista previa semanal: en vez del mock estático, toma los canjeables reales
// del catálogo (activos y aprobados), priorizando lo recién publicado y lo
// que está por agotarse. Reutiliza `redeemables`, no crea una tabla nueva.
export async function listWeeklyHighlights(limit = 6): Promise<WeeklyHighlight[]> {
  const { data, error } = await supabase
    .from('redeemables')
    .select('*')
    .eq('active', true)
    .eq('status', 'aprobado')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;

  const nowMs = Date.now();
  return ((data ?? []) as RedeemableRow[]).map((row) => ({
    id: `redeemable-${row.id}`,
    tipo: 'canjeable',
    titulo: row.title,
    descripcion: row.description,
    fecha: row.created_at,
    lugar: row.sponsor ?? undefined,
    canjeableId: row.id,
    costoCreditos: row.cost_credits,
    isNuevo: nowMs - new Date(row.created_at).getTime() <= NEW_WITHIN_DAYS * 24 * 60 * 60 * 1000,
    isUltimosCupos: row.stock !== null && row.stock <= LOW_STOCK_THRESHOLD,
  }));
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
