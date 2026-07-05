// Tipos de la base de datos Supabase (Sesión 3). Escritos a mano a partir de
// supabase/migrations/*. Regenerables con:
//   supabase gen types typescript --project-id <ref> > types/database.ts
//
// Estados canónicos en inglés para trips/bookings/payments (docs/backend.md);
// la capa services/api/* los mapea a los tokens en español de las pantallas.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type AccountRole = 'user' | 'tutor' | 'admin' | 'owner';
export type TravelMode = 'driver' | 'rider';
export type TripStatus = 'published' | 'full' | 'in_progress' | 'completed' | 'cancelled';
export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';
export type PaymentStatus = 'pending' | 'marked' | 'confirmed' | 'overdue';
export type CreditEntryType = 'abono' | 'cargo';
export type CreditSource = 'viaje' | 'racha' | 'bono' | 'canje' | 'ajuste';
export type RedeemableCategory = 'comida' | 'merch' | 'eventos' | 'servicios';
export type RedemptionStatus = 'disponible' | 'canjeado';
export type PublisherKind = 'federacion' | 'departamento' | 'centro_alumnos' | 'universidad' | 'marca';
export type PostType = 'noticia' | 'evento' | 'activacion' | 'descuento';

export type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string;
  account_role: AccountRole;
  travel_mode: TravelMode;
  university_id: string | null;
  home_campus_id: string | null;
  date_of_birth: string | null;
  avatar_url: string | null;
  credential_verified: boolean;
  rating_avg: number;
  driver_license_number: string | null;
  driver_license_expiration: string | null;
  reward_points: number;
  streak_on_time_payments: number;
  best_streak_on_time_payments: number;
  streak_completed_trips: number;
  best_streak_completed_trips: number;
  late_cancellations_count: number;
  last_late_cancellation_at: string | null;
  block_until: string | null;
  payment_strikes_count: number;
  last_payment_strike_at: string | null;
  payment_ban_until: string | null;
  created_at: string;
  updated_at: string;
}

/** Datos bancarios del conductor: tabla aparte de profiles, RLS de solo-dueño. */
export type BankDetailsRow = {
  user_id: string;
  details: Json;
  created_at: string;
  updated_at: string;
}

export type VehicleRow = {
  id: string;
  owner_id: string;
  brand: string | null;
  model: string;
  year: number | null;
  color: string | null;
  plate: string | null;
  seat_capacity: number;
  created_at: string;
}

export type TripRow = {
  id: string;
  driver_id: string;
  vehicle_id: string | null;
  origin_campus_id: string | null;
  destination_campus_id: string | null;
  origin_campus_name: string | null;
  destination_campus_name: string | null;
  meeting_point_id: string | null;
  origin_lat: number;
  origin_lng: number;
  destination_lat: number;
  destination_lng: number;
  meeting_lat: number | null;
  meeting_lng: number | null;
  route_polyline: Json | null;
  departs_at: string;
  price_clp: number;
  seats_total: number;
  seats_taken: number;
  status: TripStatus;
  route_notes: string | null;
  created_at: string;
  updated_at: string;
}

export type BookingRow = {
  id: string;
  trip_id: string;
  passenger_id: string;
  status: BookingStatus;
  cancelled_at: string | null;
  was_late_cancellation: boolean;
  created_at: string;
}

export type PaymentRow = {
  id: string;
  booking_id: string;
  status: PaymentStatus;
  price_clp: number;
  commission_clp: number;
  total_clp: number;
  due_at: string;
  marked_at: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type RatingRow = {
  id: string;
  trip_id: string | null;
  booking_id: string | null;
  from_id: string;
  to_id: string | null;
  stars: number;
  note: string | null;
  created_at: string;
}

export type PenaltyRow = {
  id: string;
  user_id: string;
  booking_id: string | null;
  occurred_at: string;
  block_until: string | null;
  created_at: string;
}

export type StrikeRow = {
  id: string;
  user_id: string;
  booking_id: string | null;
  kind: string;
  occurred_at: string;
  created_at: string;
}

export type CreditTransactionRow = {
  id: string;
  user_id: string;
  entry_type: CreditEntryType;
  source: CreditSource;
  amount: number;
  description: string;
  reference_id: string | null;
  created_at: string;
}

export type RedeemableRow = {
  id: string;
  title: string;
  description: string;
  category: RedeemableCategory;
  cost_credits: number;
  sponsor: string | null;
  stock: number | null;
  validity_days: number;
  published_by_admin: boolean;
  active: boolean;
  created_at: string;
}

export type RedemptionRow = {
  id: string;
  user_id: string;
  item_id: string | null;
  title: string;
  cost_credits: number;
  code: string;
  status: RedemptionStatus;
  created_at: string;
  expires_at: string;
  redeemed_at: string | null;
}

// --- Feed (Sesión 4) ---

export type PublisherRow = {
  id: string;
  slug: string;
  name: string;
  kind: PublisherKind;
  university_id: string | null;
  avatar_url: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * `media` es un arreglo de strings: rutas dentro del bucket `feed-media`
 * (se firman al leer) o URLs http(s) directas. Varias imágenes = carrete.
 * Los contadores like/repost/reply los mantienen triggers del servidor.
 */
export type PostRow = {
  id: string;
  publisher_id: string;
  author_id: string | null;
  post_type: PostType;
  body: string;
  media: Json;
  event_starts_at: string | null;
  event_location: string | null;
  discount_code: string | null;
  discount_terms: string | null;
  redeemable_id: string | null;
  like_count: number;
  repost_count: number;
  reply_count: number;
  created_at: string;
  updated_at: string;
}

export type StoryRow = {
  id: string;
  publisher_id: string;
  author_id: string | null;
  media_path: string;
  caption: string | null;
  created_at: string;
  expires_at: string;
}

export type PostLikeRow = {
  post_id: string;
  user_id: string;
  created_at: string;
}

export type PostRepostRow = {
  post_id: string;
  user_id: string;
  created_at: string;
}

export type PostReplyRow = {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
}

// Helper: Insert = Row con opcionales los campos con default o generados.
type Insertable<Row, Optional extends keyof Row> = Omit<Row, Optional> &
  Partial<Pick<Row, Optional>>;

type TableDef<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: TableDef<ProfileRow, Insertable<ProfileRow, 'created_at' | 'updated_at' | 'account_role' | 'travel_mode' | 'credential_verified' | 'rating_avg' | 'reward_points' | 'streak_on_time_payments' | 'best_streak_on_time_payments' | 'streak_completed_trips' | 'best_streak_completed_trips' | 'late_cancellations_count' | 'payment_strikes_count' | 'full_name' | 'university_id' | 'home_campus_id' | 'date_of_birth' | 'avatar_url' | 'driver_license_number' | 'driver_license_expiration' | 'last_late_cancellation_at' | 'block_until' | 'last_payment_strike_at' | 'payment_ban_until'>>;
      bank_details: TableDef<BankDetailsRow, Insertable<BankDetailsRow, 'created_at' | 'updated_at'>>;
      vehicles: TableDef<VehicleRow, Insertable<VehicleRow, 'id' | 'created_at' | 'seat_capacity' | 'brand' | 'year' | 'color' | 'plate'>>;
      trips: TableDef<TripRow, Insertable<TripRow, 'id' | 'created_at' | 'updated_at' | 'seats_taken' | 'status' | 'price_clp' | 'vehicle_id' | 'origin_campus_id' | 'destination_campus_id' | 'origin_campus_name' | 'destination_campus_name' | 'meeting_point_id' | 'meeting_lat' | 'meeting_lng' | 'route_polyline' | 'route_notes'>>;
      bookings: TableDef<BookingRow, Insertable<BookingRow, 'id' | 'created_at' | 'status' | 'cancelled_at' | 'was_late_cancellation'>>;
      payments: TableDef<PaymentRow, Insertable<PaymentRow, 'id' | 'created_at' | 'updated_at' | 'status' | 'price_clp' | 'commission_clp' | 'total_clp' | 'marked_at' | 'confirmed_at'>>;
      ratings: TableDef<RatingRow, Insertable<RatingRow, 'id' | 'created_at' | 'trip_id' | 'booking_id' | 'to_id' | 'note'>>;
      penalties: TableDef<PenaltyRow, Insertable<PenaltyRow, 'id' | 'created_at' | 'occurred_at' | 'booking_id' | 'block_until'>>;
      strikes: TableDef<StrikeRow, Insertable<StrikeRow, 'id' | 'created_at' | 'occurred_at' | 'booking_id' | 'kind'>>;
      credit_transactions: TableDef<CreditTransactionRow, Insertable<CreditTransactionRow, 'id' | 'created_at' | 'description' | 'reference_id'>>;
      redeemables: TableDef<RedeemableRow, Insertable<RedeemableRow, 'created_at' | 'description' | 'sponsor' | 'stock' | 'validity_days' | 'published_by_admin' | 'active'>>;
      redemptions: TableDef<RedemptionRow, Insertable<RedemptionRow, 'id' | 'created_at' | 'status' | 'item_id' | 'redeemed_at'>>;
      publishers: TableDef<PublisherRow, Insertable<PublisherRow, 'id' | 'created_at' | 'updated_at' | 'university_id' | 'avatar_url' | 'description'>>;
      posts: TableDef<PostRow, Insertable<PostRow, 'id' | 'created_at' | 'updated_at' | 'author_id' | 'post_type' | 'body' | 'media' | 'event_starts_at' | 'event_location' | 'discount_code' | 'discount_terms' | 'redeemable_id' | 'like_count' | 'repost_count' | 'reply_count'>>;
      stories: TableDef<StoryRow, Insertable<StoryRow, 'id' | 'created_at' | 'expires_at' | 'author_id' | 'caption'>>;
      post_likes: TableDef<PostLikeRow, Insertable<PostLikeRow, 'created_at'>>;
      post_reposts: TableDef<PostRepostRow, Insertable<PostRepostRow, 'created_at'>>;
      post_replies: TableDef<PostReplyRow, Insertable<PostReplyRow, 'id' | 'created_at'>>;
    };
    Views: Record<string, never>;
    Functions: {
      reserve_seat: {
        Args: { p_trip_id: string };
        Returns: BookingRow;
      };
      cancel_booking: {
        Args: { p_booking_id: string };
        Returns: BookingRow;
      };
      mark_payment_sent: {
        Args: { p_booking_id: string };
        Returns: PaymentRow;
      };
      confirm_payment_received: {
        Args: { p_booking_id: string };
        Returns: PaymentRow;
      };
      complete_booking: {
        Args: { p_booking_id: string };
        Returns: BookingRow;
      };
      expire_overdue_payments: {
        Args: Record<string, never>;
        Returns: number;
      };
      redeem_item: {
        Args: { p_item_id: string };
        Returns: RedemptionRow;
      };
      credit_balance: {
        Args: { target: string };
        Returns: number;
      };
      get_driver_bank_details: {
        Args: { p_driver_id: string };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
