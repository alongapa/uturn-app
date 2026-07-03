// Servicio de reservas y pagos sobre Supabase. Toda escritura pasa por RPCs de
// servidor (reserve_seat, cancel_booking, mark/confirm payment, complete_booking):
// el cliente nunca inserta bookings/payments directo (lo impide RLS).

import type { RealtimeChannel } from '@supabase/supabase-js';

import { UTURN_COMMISSION_CLP } from '@/services/payments';
import { supabase } from '@/services/supabase';
import type { Booking } from '@/store/appState';
import type { BookingRow, PaymentRow } from '@/types/database';
import { mapBookingRowToBooking } from './mappers';

async function fetchPaymentsFor(bookingIds: string[]): Promise<Map<string, PaymentRow>> {
  const byBooking = new Map<string, PaymentRow>();
  if (bookingIds.length === 0) return byBooking;
  const { data, error } = await supabase.from('payments').select('*').in('booking_id', bookingIds);
  if (error) throw error;
  (data ?? []).forEach((p) => byBooking.set(p.booking_id, p));
  return byBooking;
}

/** Reservas visibles para el usuario (propias como pasajero + las de sus viajes). */
export async function listBookings(): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = data ?? [];
  const payments = await fetchPaymentsFor(rows.map((r) => r.id));
  return rows.map((row) => mapBookingRowToBooking(row, payments.get(row.id) ?? null));
}

async function bookingWithPayment(row: BookingRow): Promise<Booking> {
  const { data } = await supabase.from('payments').select('*').eq('booking_id', row.id).maybeSingle();
  return mapBookingRowToBooking(row, data ?? null);
}

export async function reserve(tripId: string): Promise<Booking> {
  const { data, error } = await supabase.rpc('reserve_seat', {
    p_trip_id: tripId,
    p_commission_clp: UTURN_COMMISSION_CLP,
  });
  if (error) throw error;
  return bookingWithPayment(data);
}

export async function cancelBooking(bookingId: string): Promise<Booking> {
  const { data, error } = await supabase.rpc('cancel_booking', { p_booking_id: bookingId });
  if (error) throw error;
  return bookingWithPayment(data);
}

export async function markPaymentSent(bookingId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_payment_sent', { p_booking_id: bookingId });
  if (error) throw error;
}

export async function confirmPaymentReceived(bookingId: string): Promise<void> {
  const { error } = await supabase.rpc('confirm_payment_received', { p_booking_id: bookingId });
  if (error) throw error;
}

export async function completeBooking(bookingId: string): Promise<void> {
  const { error } = await supabase.rpc('complete_booking', { p_booking_id: bookingId });
  if (error) throw error;
}

/** Suscribe a cambios en bookings/payments; devuelve el canal para desuscribir. */
export function subscribeBookings(onChange: () => void): RealtimeChannel {
  return supabase
    .channel('public:bookings')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, onChange)
    .subscribe();
}
