// Servicio de insignias sobre Supabase. El catálogo (badge_definitions) es de
// solo lectura para el cliente; los desbloqueos (user_badges) los escribe
// únicamente el trigger sync_user_badges cuando cambian los best_streak_* de
// profiles (Sesiones 1–2) — el cliente nunca inserta en user_badges.

import type { Badge, BadgeCategory } from '@/models/unities';
import { supabase } from '@/services/supabase';
import type { BadgeDefinitionRow } from '@/types/database';

export async function listBadges(userId: string): Promise<Badge[]> {
  const [{ data: defs, error: defsError }, { data: unlocked, error: unlockedError }] = await Promise.all([
    supabase.from('badge_definitions').select('*').order('sort_order', { ascending: true }),
    supabase.from('user_badges').select('badge_id, unlocked_at').eq('user_id', userId),
  ]);
  if (defsError) throw defsError;
  if (unlockedError) throw unlockedError;

  const unlockedAtByBadge = new Map((unlocked ?? []).map((row) => [row.badge_id, row.unlocked_at]));

  return ((defs ?? []) as BadgeDefinitionRow[]).map((row) => ({
    id: row.id,
    categoria: row.category as BadgeCategory,
    titulo: row.title,
    descripcion: row.description,
    umbral: row.threshold,
    desbloqueadaAt: unlockedAtByBadge.get(row.id) ?? undefined,
  }));
}
