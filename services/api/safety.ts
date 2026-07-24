// Seguridad en viaje (Sesión 9): compartir viaje en vivo + botón SOS.
// Reutiliza services/location.ts para la posición del dispositivo; el servidor
// es quien decide qué puede ver el contacto de emergencia (get_live_share).

import { supabase } from '@/services/supabase';
import type { SosAlertListItem, SosAlertRow, TripLiveShareRow } from '@/types/database';

export async function startTripShare(
  tripId: string,
  contactName: string,
  contactPhone: string
): Promise<TripLiveShareRow> {
  const { data, error } = await supabase.rpc('start_trip_share', {
    p_trip_id: tripId,
    p_contact_name: contactName,
    p_contact_phone: contactPhone,
  });
  if (error) throw error;
  return data;
}

export async function updateTripShareLocation(tripId: string, lat: number, lng: number): Promise<void> {
  const { error } = await supabase.rpc('update_trip_share_location', {
    p_trip_id: tripId,
    p_lat: lat,
    p_lng: lng,
  });
  if (error) throw error;
}

export async function stopTripShare(tripId: string): Promise<void> {
  const { error } = await supabase.rpc('stop_trip_share', { p_trip_id: tripId });
  if (error) throw error;
}

export type LiveShareInfo = {
  active: boolean;
  sharerName: string | null;
  driverName: string | null;
  driverRating: number | null;
  vehiclePlate: string | null;
  vehicleBrand: string | null;
  vehicleModel: string | null;
  vehicleColor: string | null;
  originCampus: string | null;
  destinationCampus: string | null;
  lastLat: number | null;
  lastLng: number | null;
  lastUpdateAt: string | null;
  startedAt: string | null;
};

/** Lectura pública por token: no requiere sesión (el contacto no tiene cuenta Unities). */
export async function getLiveShare(token: string): Promise<LiveShareInfo | null> {
  const { data, error } = await supabase.rpc('get_live_share', { p_token: token });
  if (error) throw error;
  if (!data) return null;
  return data as unknown as LiveShareInfo;
}

export function buildLiveShareUrl(token: string): string {
  // Ruta pública de expo-router (app/live/[token].tsx); construye una URL
  // relativa que funciona igual en el build web y como deep link.
  return `/live/${token}`;
}

export async function triggerSos(
  tripId: string | null,
  lat: number | null,
  lng: number | null
): Promise<SosAlertRow> {
  const { data, error } = await supabase.rpc('trigger_sos', {
    p_trip_id: tripId,
    p_lat: lat,
    p_lng: lng,
  });
  if (error) throw error;
  return data;
}

export async function resolveSos(alertId: string, status: 'atendida' | 'falsa_alarma', note?: string): Promise<SosAlertRow> {
  const { data, error } = await supabase.rpc('resolve_sos', {
    p_alert_id: alertId,
    p_status: status,
    p_note: note ?? null,
  });
  if (error) throw error;
  return data;
}

export async function listSosAlerts(onlyActive = true): Promise<SosAlertListItem[]> {
  const { data, error } = await supabase.rpc('list_sos_alerts', { p_only_active: onlyActive });
  if (error) throw error;
  return data ?? [];
}
