// Servicio de calificaciones sobre Supabase. from_id = usuario autenticado.

import type { Rating } from '@/store/appState';
import { supabase } from '@/services/supabase';
import { mapRatingRowToRating } from './mappers';

export async function listRatings(): Promise<Rating[]> {
  const { data, error } = await supabase
    .from('ratings')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRatingRowToRating);
}

export async function addRating(input: {
  fromId: string;
  bookingId?: string;
  tripId?: string;
  toId?: string;
  stars: number;
  comment?: string;
}): Promise<Rating> {
  const { data, error } = await supabase
    .from('ratings')
    .insert({
      from_id: input.fromId,
      booking_id: input.bookingId ?? null,
      trip_id: input.tripId ?? null,
      to_id: input.toId ?? null,
      stars: input.stars,
      note: input.comment ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapRatingRowToRating(data);
}
