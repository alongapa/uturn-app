import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { User, Trip, Booking, ReputationTier } from '@/models/types';

export { isSupabaseConfigured };

/* ------------------------------------------------------------------ *
 * Filas tal como vienen de Postgres (snake_case)
 * ------------------------------------------------------------------ */
interface ProfileRow {
  id: string;
  name: string;
  email: string;
  university_id: string;
  role: 'user' | 'admin';
  rating: number;
  tier: ReputationTier;
  completed_trips_driver: number;
  completed_trips_passenger: number;
  completed_tutoring: number;
  uturn_credits: number;
  car_model: string | null;
  bio: string | null;
  verification_status: User['verificationStatus'];
}

interface TripRow {
  id: string;
  driver_id: string;
  dest: string;
  meet_point: string;
  price: number;
  seats: number;
  depart_at: string;
  route_notes: string | null;
  origin_campus_id: string;
  destination_campus_id: string | null;
  meeting_point_id: string;
  status: Trip['status'];
  driver?: { name: string; rating: number; tier: ReputationTier } | null;
}

/* ------------------------------------------------------------------ *
 * Mapeo fila → modelo de dominio
 * ------------------------------------------------------------------ */
function mapProfile(r: ProfileRow): User {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    university: r.university_id,
    role: 'both',
    rating: Number(r.rating),
    reputationScore: {
      overall: Number(r.rating), punctuality: Number(r.rating), drivingQuality: Number(r.rating),
      price: Number(r.rating), disposition: Number(r.rating), asPassenger: Number(r.rating), asTutor: 0,
    },
    tier: r.tier,
    completedTripsAsDriver: r.completed_trips_driver,
    completedTripsAsPassenger: r.completed_trips_passenger,
    completedTutoringSessions: r.completed_tutoring,
    badges: [],
    uturnCredits: r.uturn_credits,
    carModel: r.car_model ?? undefined,
    bio: r.bio ?? undefined,
    verificationStatus: r.verification_status,
  };
}

function mapTrip(r: TripRow): Trip {
  return {
    id: r.id,
    driverId: r.driver_id,
    driverName: r.driver?.name ?? '',
    driverRating: r.driver?.rating,
    driverTier: r.driver?.tier,
    dest: r.dest,
    meetPoint: r.meet_point,
    price: r.price,
    seats: r.seats,
    departAt: r.depart_at,
    routeNotes: r.route_notes ?? undefined,
    originCampusId: r.origin_campus_id as Trip['originCampusId'],
    destinationCampusId: (r.destination_campus_id ?? undefined) as Trip['destinationCampusId'],
    meetingPointId: r.meeting_point_id,
    status: r.status,
  };
}

/* ------------------------------------------------------------------ *
 * Auth
 * ------------------------------------------------------------------ */
export async function signUp(email: string, password: string, name: string, universityId: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, university_id: universityId } },
  });
  if (error) throw error;
  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getMyProfile(): Promise<User | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', auth.user.id).single();
  if (error) throw error;
  return data ? mapProfile(data as ProfileRow) : null;
}

export async function updateMyProfile(updates: Partial<User>) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('No autenticado');
  const patch: Record<string, unknown> = {};
  if (updates.carModel !== undefined) patch.car_model = updates.carModel;
  if (updates.bio !== undefined) patch.bio = updates.bio;
  if (updates.uturnCredits !== undefined) patch.uturn_credits = updates.uturnCredits;
  if (updates.verificationStatus !== undefined) patch.verification_status = updates.verificationStatus;
  const { error } = await supabase.from('profiles').update(patch).eq('id', auth.user.id);
  if (error) throw error;
}

/* ------------------------------------------------------------------ *
 * Viajes
 * ------------------------------------------------------------------ */
export async function listTrips(): Promise<Trip[]> {
  const { data, error } = await supabase
    .from('trips')
    .select('*, driver:profiles!trips_driver_id_fkey(name, rating, tier)')
    .eq('status', 'active')
    .order('depart_at', { ascending: true });
  if (error) throw error;
  return (data as TripRow[]).map(mapTrip);
}

export async function createTrip(t: Omit<Trip, 'id' | 'driverName'>): Promise<string> {
  const { data, error } = await supabase
    .from('trips')
    .insert({
      driver_id: t.driverId,
      dest: t.dest,
      meet_point: t.meetPoint,
      price: t.price,
      seats: t.seats,
      depart_at: t.departAt,
      route_notes: t.routeNotes ?? null,
      origin_campus_id: t.originCampusId,
      destination_campus_id: t.destinationCampusId ?? null,
      meeting_point_id: t.meetingPointId,
      status: 'active',
    })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

/* ------------------------------------------------------------------ *
 * Reservas
 * ------------------------------------------------------------------ */
export async function createBooking(tripId: string): Promise<Booking> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('No autenticado');
  const { data, error } = await supabase
    .from('bookings')
    .insert({ trip_id: tripId, passenger_id: auth.user.id, status: 'reserved' })
    .select('*')
    .single();
  if (error) throw error;
  const row = data as { id: string; trip_id: string; passenger_id: string; status: Booking['status']; created_at: string };
  return {
    id: row.id, tripId: row.trip_id, passengerId: row.passenger_id,
    passengerName: '', status: row.status, createdAt: row.created_at,
  };
}

/* ------------------------------------------------------------------ *
 * Verificación
 * ------------------------------------------------------------------ */
export async function isEmailRegistered(email: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_email_registered', { p_email: email });
  if (error) throw error;
  return Boolean(data);
}

/** Sube el screenshot al bucket privado y crea la solicitud de verificación. */
export async function submitVerification(universityId: string, fileUri: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('No autenticado');

  const path = `${auth.user.id}/${Date.now()}.jpg`;
  const res = await fetch(fileUri);
  const blob = await res.blob();
  const up = await supabase.storage.from('intranet-screenshots').upload(path, blob, { contentType: 'image/jpeg' });
  if (up.error) throw up.error;

  const { error } = await supabase
    .from('verification_requests')
    .insert({ user_id: auth.user.id, university_id: universityId, screenshot_path: path, status: 'pending' });
  if (error) throw error;

  // Dispara el OCR + match de nombre en el servidor (no bloquea la UI).
  await supabase.functions.invoke('verify-intranet', { body: { screenshot_path: path } }).catch(() => {});
}
