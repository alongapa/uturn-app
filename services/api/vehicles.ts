// Servicio de vehículos sobre Supabase. Mapea Car (store/appState) ⇄ vehicles.

import type { Car } from '@/store/appState';
import { supabase } from '@/services/supabase';
import type { VehicleRow } from '@/types/database';

export function mapVehicleRowToCar(row: VehicleRow): Car {
  return {
    id: row.id,
    modelo: row.model,
    anio: row.year ?? 0,
    patente: row.plate ?? '',
    color: row.color ?? '',
    capacidadAsientos: row.seat_capacity,
  };
}

export async function listMyVehicles(ownerId: string): Promise<Car[]> {
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapVehicleRowToCar);
}

export async function addVehicle(ownerId: string, car: Omit<Car, 'id'>): Promise<Car> {
  const { data, error } = await supabase
    .from('vehicles')
    .insert({
      owner_id: ownerId,
      model: car.modelo,
      year: car.anio,
      plate: car.patente,
      color: car.color,
      seat_capacity: car.capacidadAsientos,
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapVehicleRowToCar(data);
}

export async function updateVehicle(id: string, patch: Partial<Car>): Promise<Car> {
  const { data, error } = await supabase
    .from('vehicles')
    .update({
      model: patch.modelo,
      year: patch.anio,
      plate: patch.patente,
      color: patch.color,
      seat_capacity: patch.capacidadAsientos,
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return mapVehicleRowToCar(data);
}

export async function removeVehicle(id: string): Promise<void> {
  const { error } = await supabase.from('vehicles').delete().eq('id', id);
  if (error) throw error;
}
