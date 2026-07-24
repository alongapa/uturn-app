// Servicio de viajes sobre Supabase + realtime. Mantiene la forma Trip que
// consumen las pantallas y la firma de addTrip de store/appState.

import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '@/services/supabase';
import type { Trip } from '@/store/appState';
import type { Json, TripRow } from '@/types/database';
import { mapTripRowToTrip } from './mappers';

export type NewTripInput = Omit<Trip, 'id' | 'asientosOcupados' | 'routePolyline'> & {
  asientosOcupados?: number;
};

async function attachDriverRatings(rows: TripRow[]): Promise<Trip[]> {
  const driverIds = [...new Set(rows.map((r) => r.driver_id))];
  const ratingById = new Map<string, number>();
  if (driverIds.length > 0) {
    const { data } = await supabase.from('profiles').select('id, rating_avg').in('id', driverIds);
    (data ?? []).forEach((p) => ratingById.set(p.id, p.rating_avg));
  }
  return rows.map((row) => mapTripRowToTrip({ ...row, driver: { rating_avg: ratingById.get(row.driver_id) ?? null } }));
}

export async function listTrips(): Promise<Trip[]> {
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .order('departs_at', { ascending: true });
  if (error) throw error;
  return attachDriverRatings(data ?? []);
}

export async function createTrip(input: NewTripInput): Promise<Trip> {
  const seatsTaken = input.asientosOcupados ?? 0;
  const seatsTotal = input.asientosDisponibles + seatsTaken;
  const polyline: Json = [
    input.coordenadasOrigen,
    ...(input.meetingPointCoords ? [input.meetingPointCoords] : []),
    input.coordenadasDestino,
  ] as unknown as Json;

  const { data, error } = await supabase
    .from('trips')
    .insert({
      driver_id: input.driverId,
      origin_campus_id: input.origenCampusId ?? null,
      destination_campus_id: input.destinoCampusId ?? null,
      origin_campus_name: input.origenCampus,
      destination_campus_name: input.destinoCampus,
      meeting_point_id: input.puntoEncuentroId ?? null,
      origin_lat: input.coordenadasOrigen.latitude,
      origin_lng: input.coordenadasOrigen.longitude,
      destination_lat: input.coordenadasDestino.latitude,
      destination_lng: input.coordenadasDestino.longitude,
      meeting_lat: input.meetingPointCoords?.latitude ?? null,
      meeting_lng: input.meetingPointCoords?.longitude ?? null,
      route_polyline: polyline,
      departs_at: input.horaSalida,
      price_clp: input.precioCLP,
      seats_total: seatsTotal,
      seats_taken: seatsTaken,
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapTripRowToTrip(data);
}

export async function updateTrip(id: string, patch: Partial<Trip>): Promise<void> {
  const row: Partial<TripRow> = {};
  if (patch.horaSalida !== undefined) row.departs_at = patch.horaSalida;
  if (patch.precioCLP !== undefined) row.price_clp = patch.precioCLP;
  if (patch.origenCampus !== undefined) row.origin_campus_name = patch.origenCampus;
  if (patch.destinoCampus !== undefined) row.destination_campus_name = patch.destinoCampus;
  if (patch.puntoEncuentroId !== undefined) row.meeting_point_id = patch.puntoEncuentroId;
  if (patch.asientosDisponibles !== undefined && patch.asientosOcupados !== undefined) {
    row.seats_total = patch.asientosDisponibles + patch.asientosOcupados;
    row.seats_taken = patch.asientosOcupados;
  }
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase.from('trips').update(row).eq('id', id);
  if (error) throw error;
}

export async function cancelTrip(id: string): Promise<void> {
  const { error } = await supabase.from('trips').update({ status: 'cancelled' }).eq('id', id);
  if (error) throw error;
}

export type TripDriverAndVehicle = {
  driverName: string;
  driverRating: number;
  credentialVerified: boolean;
  vehicleBrand: string | null;
  vehicleModel: string | null;
  vehicleColor: string | null;
  vehiclePlate: string | null;
};

/**
 * Datos del conductor y del vehículo de un viaje (Sesión 9: "detalles del
 * auto/conductor siempre visibles antes de subir"). Lectura autenticada
 * simple (profiles/vehicles ya son legibles para cualquier autenticado).
 */
export async function getTripDriverAndVehicle(tripId: string): Promise<TripDriverAndVehicle | null> {
  const { data: trip, error } = await supabase
    .from('trips')
    .select('driver_id, vehicle_id')
    .eq('id', tripId)
    .maybeSingle();
  if (error || !trip) return null;

  const [{ data: driver }, vehicleResult] = await Promise.all([
    supabase.from('profiles').select('full_name, rating_avg, credential_verified').eq('id', trip.driver_id).maybeSingle(),
    trip.vehicle_id
      ? supabase.from('vehicles').select('brand, model, color, plate').eq('id', trip.vehicle_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    driverName: driver?.full_name ?? 'Conductor Unities',
    driverRating: driver?.rating_avg ?? 0,
    credentialVerified: driver?.credential_verified ?? false,
    vehicleBrand: vehicleResult.data?.brand ?? null,
    vehicleModel: vehicleResult.data?.model ?? null,
    vehicleColor: vehicleResult.data?.color ?? null,
    vehiclePlate: vehicleResult.data?.plate ?? null,
  };
}

/** Suscribe a cambios en trips; devuelve el canal para desuscribir. */
export function subscribeTrips(onChange: () => void): RealtimeChannel {
  return supabase
    .channel('public:trips')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, onChange)
    .subscribe();
}
