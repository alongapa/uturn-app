// Servicio de analítica (Sesión Analítica de tendencias): registra eventos de
// interacción en lote, agregados y anonimizados server-side (docs/backend.md
// → "Analítica de tendencias"). El cliente nunca LEE analytics_events —
// escribe los suyos y ya; los reportes salen de university_trends()/
// publisher_engagement() (RPC agregados, con supresión k-anónima).
//
// Respeta el opt-out de profiles.analytics_opt_out en el propio cliente (no
// encola nada si el usuario optó por salir), pero la garantía real es la RLS:
// si este caché quedó desactualizado, el INSERT lo rechaza igual el servidor.

import { supabase } from '@/services/supabase';
import type { AnalyticsEntityType, AnalyticsEventType, AnalyticsTrendRow, Json } from '@/types/database';

export type AnalyticsEvent = {
  eventType: AnalyticsEventType;
  entityType: AnalyticsEntityType;
  entityId?: string;
  publisherId?: string;
  category?: string;
  metadata?: Record<string, Json>;
};

const FLUSH_INTERVAL_MS = 4000;
const MAX_BATCH_SIZE = 20;

let queue: AnalyticsEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let optedOut = false;
let optOutLoaded = false;

function ensureFlushTimer() {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    flush().catch(() => undefined);
  }, FLUSH_INTERVAL_MS);
}

/**
 * Fija el caché de opt-out sin ir a la red (lo llama UserContext con el valor
 * que ya trajo al cargar el profile, para no duplicar la consulta).
 */
export function primeAnalyticsOptOut(value: boolean): void {
  optedOut = value;
  optOutLoaded = true;
  if (value) queue = [];
}

/** Trae el opt-out del propio perfil y lo cachea. Llamar al iniciar sesión. */
export async function loadAnalyticsOptOut(): Promise<boolean> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) {
    optedOut = false;
    optOutLoaded = true;
    return false;
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('analytics_opt_out')
    .eq('id', uid)
    .maybeSingle();
  optedOut = profile?.analytics_opt_out ?? false;
  optOutLoaded = true;
  return optedOut;
}

/** Actualiza el switch en el servidor y el caché local (lo llama SettingsScreen). */
export async function setAnalyticsOptOut(value: boolean): Promise<void> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) throw new Error('Necesitas iniciar sesión');
  const { error } = await supabase
    .from('profiles')
    .update({ analytics_opt_out: value })
    .eq('id', uid);
  if (error) throw error;
  optedOut = value;
  optOutLoaded = true;
  if (value) queue = []; // no envía lo que quedó pendiente en cola tras optar por salir
}

/**
 * Encola un evento para envío en lote. Fire-and-forget: nunca lanza ni
 * bloquea la UI — una analítica que rompe una pantalla sería peor que no
 * tenerla. university_id/campus_id/actor_id los fija el servidor; el cliente
 * solo describe QUÉ pasó.
 */
export function track(event: AnalyticsEvent): void {
  if (optOutLoaded && optedOut) return;
  queue.push(event);
  ensureFlushTimer();
  if (queue.length >= MAX_BATCH_SIZE) {
    flush().catch(() => undefined);
  }
}

async function flush(): Promise<void> {
  if (queue.length === 0) return;
  if (!optOutLoaded) {
    await loadAnalyticsOptOut().catch(() => undefined);
  }
  if (optedOut) {
    queue = [];
    return;
  }

  const batch = queue;
  queue = [];

  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) return; // sin sesión: la RLS exige actor_id = auth.uid(), no hay a quién atribuirlo

  const rows = batch.map((event) => ({
    actor_id: uid,
    event_type: event.eventType,
    entity_type: event.entityType,
    entity_id: event.entityId ?? null,
    publisher_id: event.publisherId ?? null,
    category: event.category ?? null,
    metadata: event.metadata ?? {},
  }));

  // Silencioso a propósito: un fallo de red no debe reintentar sin límite ni
  // interrumpir al usuario (los eventos perdidos degradan la métrica, no la app).
  await supabase.from('analytics_events').insert(rows).then(
    () => undefined,
    () => undefined
  );
}

/** Vacía la cola de inmediato (p. ej. al pasar la app a background). */
export function flushAnalytics(): void {
  flush().catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Reportes agregados (Sesión Analítica de tendencias): university_trends() y
// publisher_engagement() son SECURITY DEFINER — ya vienen con la supresión
// k-anónima aplicada (nunca traen actor_id ni listas de personas). El owner
// usa el primero (bandeja global); un admin/owner de un publisher, el segundo.
// ---------------------------------------------------------------------------

export type TrendRow = {
  weekStart: string;
  universityId?: string | null;
  campusId: string | null;
  entityType: AnalyticsEntityType;
  eventType: AnalyticsEventType;
  category: string | null;
  publisherId?: string | null;
  events: number;
  distinctActors: number;
  growthWowPct: number | null;
};

function mapTrendRow(row: AnalyticsTrendRow): TrendRow {
  return {
    weekStart: row.week_start,
    universityId: row.university_id ?? undefined,
    campusId: row.campus_id,
    entityType: row.entity_type,
    eventType: row.event_type,
    category: row.category,
    publisherId: row.publisher_id ?? undefined,
    events: row.events,
    distinctActors: row.distinct_actors,
    growthWowPct: row.growth_wow_pct,
  };
}

/** Bandeja de tendencias del owner (o de un university_analyst de esa universidad). */
export async function getUniversityTrends(
  universityId: string,
  from?: string,
  to?: string
): Promise<TrendRow[]> {
  const { data, error } = await supabase.rpc('university_trends', {
    p_university_id: universityId,
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  return (data ?? []).map(mapTrendRow);
}

/** Engagement agregado de un publisher (solo quien lo administra, ver can_manage_publisher). */
export async function getPublisherEngagement(
  publisherId: string,
  from?: string,
  to?: string
): Promise<TrendRow[]> {
  const { data, error } = await supabase.rpc('publisher_engagement', {
    p_publisher_id: publisherId,
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  return (data ?? []).map(mapTrendRow);
}

// ---------------------------------------------------------------------------
// Configuración (owner): umbral de k-anonimato y retención de crudos.
// ---------------------------------------------------------------------------

export type AnalyticsConfig = { kAnonymity: number; retentionDays: number };

export async function getAnalyticsConfig(): Promise<AnalyticsConfig> {
  const { data, error } = await supabase
    .from('analytics_config')
    .select('*')
    .eq('id', 'default')
    .maybeSingle();
  if (error) throw error;
  return { kAnonymity: data?.k_anonymity ?? 20, retentionDays: data?.retention_days ?? 90 };
}

export async function updateAnalyticsConfig(input: {
  kAnonymity?: number;
  retentionDays?: number;
}): Promise<AnalyticsConfig> {
  const { data, error } = await supabase.rpc('update_analytics_config', {
    p_k_anonymity: input.kAnonymity ?? null,
    p_retention_days: input.retentionDays ?? null,
  });
  if (error) throw error;
  return { kAnonymity: data.k_anonymity, retentionDays: data.retention_days };
}
