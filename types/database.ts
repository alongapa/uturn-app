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
export type PaymentStatus = 'pending' | 'marked' | 'confirmed' | 'overdue' | 'disputed';
// Sesión 8 — pagos avanzados.
export type PaymentProvider = 'fintoc' | 'manual' | 'credits';
export type StrikeStatus = 'active' | 'frozen' | 'reverted';
export type DisputeStatus = 'abierta' | 'resuelta_pagada' | 'resuelta_rechazada';
export type PayoutStatus = 'pendiente' | 'pagada';
export type CreditEntryType = 'abono' | 'cargo';
export type CreditSource = 'viaje' | 'racha' | 'bono' | 'canje' | 'ajuste';
export type RedeemableCategory = 'comida' | 'merch' | 'eventos' | 'servicios';
export type RedemptionStatus = 'disponible' | 'canjeado';
export type PublisherKind = 'federacion' | 'departamento' | 'centro_alumnos' | 'universidad' | 'marca';
export type PostType = 'noticia' | 'evento' | 'activacion' | 'descuento';
export type RedeemableStatus = 'pendiente' | 'aprobado' | 'rechazado';
export type WidgetKind = 'eventos_semana';
export type LinkedWidget = 'galeria';
export type ConversationKind = 'dm' | 'soporte';
export type SupportCategory = 'pagos' | 'baneos' | 'verificacion' | 'otro';
export type SupportStatus = 'abierto' | 'resuelto';
export type GuideFileKind = 'imagen' | 'pdf';
export type NotificationCategory = 'pagos' | 'viajes' | 'social' | 'mensajes';
export type NotificationPushStatus = 'pending' | 'processing' | 'sent' | 'skipped' | 'failed';
export type PushPlatform = 'ios' | 'android' | 'web';
// Sesión "Perfil novedades jóvenes" — gamificación y referidos.
export type BadgeCategory = 'buen_pagador' | 'viajero';
export type ReferralStatus = 'pendiente' | 'completado';
// Sesión Bots de IA.
export type AiBotOwnerKind = 'publisher' | 'tutor_topic';
// Sesión 9 — seguridad, confianza y moderación.
export type ModerationStatus = 'activo' | 'suspendido' | 'baneado';
export type ReportTargetType =
  | 'usuario' | 'viaje' | 'mensaje' | 'post' | 'historia' | 'post_respuesta' | 'pregunta' | 'qa_respuesta';
export type ReportReason = 'spam' | 'acoso' | 'contenido_inapropiado' | 'seguridad' | 'fraude' | 'otro';
export type ReportStatus = 'pendiente' | 'en_revision' | 'resuelto' | 'descartado';
export type ReportResolution = 'advertencia' | 'suspension' | 'baneo' | 'contenido_eliminado' | 'sin_accion';
export type ModerationActionKind = 'advertencia' | 'suspension' | 'baneo' | 'levantar_sancion';
export type CredentialReviewStatus = 'pendiente' | 'en_revision' | 'aprobado' | 'rechazado';
export type DriverVerificationStatus = 'pendiente' | 'en_revision' | 'aprobado' | 'rechazado';
export type ProfileVisibility = 'publico' | 'oculto';
export type SosAlertStatus = 'activa' | 'atendida' | 'falsa_alarma';

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
  // Sesión "Perfil novedades jóvenes" — código propio para invitar amigos.
  referral_code: string | null;
  // Sesión Bots de IA — marca los perfiles "de servicio" que representan un bot.
  is_bot: boolean;
  // Sesión 9 — seguridad, confianza y moderación.
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  moderation_status: ModerationStatus;
  moderation_until: string | null;
  warnings_count: number;
  credential_review_status: CredentialReviewStatus;
  credential_submitted_at: string | null;
  credential_reviewed_by: string | null;
  credential_reviewed_at: string | null;
  credential_review_note: string | null;
  credential_expires_at: string | null;
  profile_visibility: ProfileVisibility;
  deletion_requested_at: string | null;
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
  // Sesión 8: proveedor/verificación, pago con créditos y liquidación.
  provider: PaymentProvider | null;
  provider_intent_id: string | null;
  provider_status: string | null;
  verified_at: string | null;
  credits_applied: number;
  credits_clp: number;
  cash_clp: number | null;
  payout_id: string | null;
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
  // Sesión 8: estado del strike para congelar/revertir en una disputa.
  status: StrikeStatus;
  dispute_id: string | null;
  created_at: string;
}

// --- Pagos avanzados (Sesión 8) ---

export type PlatformConfigRow = {
  id: string;
  commission_clp: number;
  credit_clp_rate: number;
  max_credit_discount_pct: number;
  // Sesión 9: exige verificación reforzada (cédula + licencia) para publicar viajes.
  require_reinforced_driver_verification: boolean;
  updated_by: string | null;
  updated_at: string;
}

export type PaymentEventRow = {
  id: string;
  payment_id: string | null;
  provider: string;
  provider_event_id: string;
  event_type: string;
  payload: Json;
  created_at: string;
}

export type DisputeRow = {
  id: string;
  booking_id: string;
  payment_id: string | null;
  opened_by: string;
  reason: string;
  evidence_path: string | null;
  status: DisputeStatus;
  conversation_id: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export type PayoutRow = {
  id: string;
  driver_id: string;
  period_start: string;
  period_end: string;
  gross_clp: number;
  commission_clp: number;
  net_clp: number;
  payment_count: number;
  status: PayoutStatus;
  note: string | null;
  created_by: string | null;
  created_at: string;
  paid_at: string | null;
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

/**
 * Sesión 5: los admins proponen canjeables (status 'pendiente') y solo el
 * owner los aprueba/rechaza vía review_redeemable; el catálogo y redeem_item
 * solo consideran 'aprobado'.
 */
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
  status: RedeemableStatus;
  proposed_by: string | null;
  publisher_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
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
  brand_id: string | null;
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

// --- Panel de administración (Sesión 5) ---

/** Membresía: qué usuarios operan en nombre de qué publisher (RLS). */
export type PublisherMemberRow = {
  publisher_id: string;
  user_id: string;
  created_at: string;
}

/** Marca asociada a un publisher; co-firma posts vía posts.brand_id. */
export type BrandRow = {
  id: string;
  publisher_id: string;
  name: string;
  logo_path: string | null;
  created_at: string;
  updated_at: string;
}

/** Configuración editorial del widget de eventos: orden/fijado/destacado. */
export type WidgetConfigRow = {
  id: string;
  widget: WidgetKind;
  post_id: string;
  sort_order: number;
  pinned: boolean;
  featured: boolean;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Carpeta de contenido por publisher; linked_widget la integra al feed. */
export type ContentFolderRow = {
  id: string;
  publisher_id: string;
  name: string;
  description: string | null;
  linked_widget: LinkedWidget | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ContentItemRow = {
  id: string;
  folder_id: string;
  media_path: string;
  caption: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
}

// --- Mensajes, tutores y Q&A (Sesión 6) ---

/**
 * Conversación de chat: DM 1-a-1 (dm_key único por par de usuarios) o ticket
 * de "Soporte Unities" (categoría + estado abierto/resuelto). Los campos
 * last_message_* los denormaliza el trigger para la bandeja.
 */
export type ConversationRow = {
  id: string;
  kind: ConversationKind;
  dm_key: string | null;
  support_category: SupportCategory | null;
  support_status: SupportStatus | null;
  created_by: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_sender: string | null;
  created_at: string;
  updated_at: string;
}

/** Miembro de conversación; last_read_at es el puntero de lectura ("visto"). */
export type ConversationMemberRow = {
  conversation_id: string;
  user_id: string;
  last_read_at: string;
  created_at: string;
}

/** Mensaje de chat: texto y/o imagen (ruta en el bucket chat-media). */
export type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  image_path: string | null;
  created_at: string;
}

/** Tema del Q&A (mallas, becas, deportes…); id de texto estable como redeemables. */
export type TopicRow = {
  id: string;
  name: string;
  emoji: string | null;
  description: string | null;
  sort_order: number;
  created_at: string;
}

/** Responsable oficial de un tema: tutor (user_id) o publisher, exactamente uno. */
export type TopicAssigneeRow = {
  id: string;
  topic_id: string;
  user_id: string | null;
  publisher_id: string | null;
  created_at: string;
}

/** Pregunta pública por tema; reply_count/answered_at los mantiene el servidor. */
export type QuestionRow = {
  id: string;
  topic_id: string;
  author_id: string;
  title: string;
  body: string;
  reply_count: number;
  answered_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Respuesta/comentario de una pregunta. is_official solo lo pueden poner los
 * asignados al tema (RLS); publisher_id cuando responden a nombre de una
 * federación.
 */
export type QuestionReplyRow = {
  id: string;
  question_id: string;
  author_id: string;
  publisher_id: string | null;
  body: string;
  is_official: boolean;
  created_at: string;
}

/** Guía de un tutor: PDF o imagen en el bucket guides, asociada a un tema. */
export type GuideRow = {
  id: string;
  topic_id: string;
  author_id: string;
  title: string;
  description: string | null;
  file_path: string;
  file_kind: GuideFileKind;
  created_at: string;
  updated_at: string;
}

// --- Notificaciones push y centro de notificaciones (Sesión 7) ---

/** Un ExponentPushToken por dispositivo; se reasigna al usuario activo vía RPC. */
export type PushTokenRow = {
  id: string;
  user_id: string;
  token: string;
  platform: PushPlatform;
  device_name: string | null;
  created_at: string;
  updated_at: string;
}

/** Switch por categoría; sin fila = todo activado. El servidor lo respeta al encolar. */
export type NotificationPrefsRow = {
  user_id: string;
  pagos: boolean;
  viajes: boolean;
  social: boolean;
  mensajes: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Historial del centro de notificaciones y cola de push. `url` es la ruta
 * expo-router del deep link; push_* lo gestiona la Edge Function send-push.
 * El cliente solo puede tocar read_at (trigger protect_notification_columns).
 */
export type NotificationRow = {
  id: string;
  user_id: string;
  category: NotificationCategory;
  type: string;
  title: string;
  body: string;
  url: string | null;
  data: Json;
  dedupe_key: string | null;
  read_at: string | null;
  push_status: NotificationPushStatus;
  push_claimed_at: string | null;
  push_sent_at: string | null;
  created_at: string;
}

// --- Bots de IA -------------------------------------------------------------
// El bot ES una fila de profiles (perfil "de servicio", is_bot = true, sin
// credenciales reales) para reutilizar la mensajería de la Sesión 6 tal
// cual: se le abre un DM normal con start_dm(profile_id).
export type AiBotRow = {
  id: string;
  profile_id: string;
  owner_kind: AiBotOwnerKind;
  publisher_id: string | null;
  tutor_id: string | null;
  topic_id: string | null;
  persona_name: string;
  system_prompt: string;
  enabled: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// --- Gamificación y referidos (Sesión "Perfil novedades jóvenes") ----------

/**
 * Catálogo de insignias. category 'buen_pagador' lee profiles.best_streak_
 * on_time_payments; 'viajero' lee best_streak_completed_trips — reutiliza
 * los contadores de las Sesiones 1–2, no duplica su cálculo.
 */
export type BadgeDefinitionRow = {
  id: string;
  category: BadgeCategory;
  title: string;
  description: string;
  threshold: number;
  sort_order: number;
  created_at: string;
}

/** Desbloqueo persistido (no se revoca); lo escribe solo el trigger sync_user_badges. */
export type UserBadgeRow = {
  user_id: string;
  badge_id: string;
  unlocked_at: string;
}

/**
 * Un invitado (referred_user_id) solo puede aparecer una vez. status pasa a
 * 'completado' cuando confirma su primer viaje pagado (award_referral_on_
 * first_payment), momento en que se acreditan los créditos a ambos lados.
 */
export type ReferralRow = {
  id: string;
  referrer_id: string;
  referred_user_id: string;
  code_used: string;
  status: ReferralStatus;
  created_at: string;
  credited_at: string | null;
}

// --- Seguridad, confianza y moderación (Sesión 9) --------------------------

/** Compartir viaje en vivo: solo se guarda la última posición (retención limitada). */
export type TripLiveShareRow = {
  id: string;
  trip_id: string;
  sharer_id: string;
  share_token: string;
  contact_name: string;
  contact_phone: string;
  active: boolean;
  last_lat: number | null;
  last_lng: number | null;
  last_update_at: string | null;
  started_at: string;
  stopped_at: string | null;
}

export type SosAlertRow = {
  id: string;
  trip_id: string | null;
  user_id: string;
  lat: number | null;
  lng: number | null;
  contact_name: string | null;
  contact_phone: string | null;
  status: SosAlertStatus;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
}

/** Reporte polimórfico: de usuario, viaje, mensaje o contenido del feed/Q&A. */
export type ReportRow = {
  id: string;
  reporter_id: string;
  target_type: ReportTargetType;
  target_user_id: string | null;
  target_id: string | null;
  reason: ReportReason;
  description: string | null;
  evidence_path: string | null;
  status: ReportStatus;
  resolution: ReportResolution | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export type UserBlockRow = {
  blocker_id: string;
  blocked_id: string;
  created_at: string;
}

/** Auditoría de sanciones; el estado vigente vive denormalizado en profiles. */
export type ModerationActionRow = {
  id: string;
  target_user_id: string;
  moderator_id: string;
  action: ModerationActionKind;
  report_id: string | null;
  reason: string;
  suspended_until: string | null;
  created_at: string;
}

export type BlockedWordRow = {
  id: string;
  word: string;
  created_by: string | null;
  created_at: string;
}

/** Verificación reforzada opcional de conductor (cédula + licencia), 1:1 con profiles. */
export type DriverVerificationRow = {
  user_id: string;
  id_document_path: string | null;
  license_document_path: string | null;
  status: DriverVerificationStatus;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
}

/** Bitácora de solo-inserción (señal de cuentas duplicadas); push_tokens se reasigna y la pierde. */
export type DeviceTokenSeenRow = {
  id: string;
  token: string;
  user_id: string;
  platform: string;
  seen_at: string;
}

// Formas de retorno de funciones `returns table(...)` de la Sesión 9.
export type ReportListItem = {
  id: string;
  reporter_id: string;
  reporter_name: string | null;
  target_type: ReportTargetType;
  target_user_id: string | null;
  target_user_name: string | null;
  target_id: string | null;
  reason: ReportReason;
  description: string | null;
  evidence_path: string | null;
  status: ReportStatus;
  resolution: ReportResolution | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export type SosAlertListItem = {
  id: string;
  trip_id: string | null;
  user_id: string;
  user_name: string | null;
  lat: number | null;
  lng: number | null;
  contact_name: string | null;
  contact_phone: string | null;
  status: SosAlertStatus;
  created_at: string;
  resolved_at: string | null;
}

export type CredentialReviewItem = {
  id: string;
  full_name: string | null;
  email: string;
  university_id: string | null;
  credential_review_status: CredentialReviewStatus;
  credential_submitted_at: string | null;
  credential_expires_at: string | null;
}

export type DriverVerificationListItem = {
  user_id: string;
  full_name: string | null;
  status: DriverVerificationStatus;
  submitted_at: string | null;
  id_document_path: string | null;
  license_document_path: string | null;
}

export type DuplicateAccountSignal = {
  token: string;
  user_ids: string[];
  user_names: (string | null)[];
  distinct_users: number;
  last_seen_at: string;
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
      profiles: TableDef<ProfileRow, Insertable<ProfileRow, 'created_at' | 'updated_at' | 'account_role' | 'travel_mode' | 'credential_verified' | 'rating_avg' | 'reward_points' | 'streak_on_time_payments' | 'best_streak_on_time_payments' | 'streak_completed_trips' | 'best_streak_completed_trips' | 'late_cancellations_count' | 'payment_strikes_count' | 'full_name' | 'university_id' | 'home_campus_id' | 'date_of_birth' | 'avatar_url' | 'driver_license_number' | 'driver_license_expiration' | 'last_late_cancellation_at' | 'block_until' | 'last_payment_strike_at' | 'payment_ban_until' | 'referral_code' | 'is_bot' | 'emergency_contact_name' | 'emergency_contact_phone' | 'moderation_status' | 'moderation_until' | 'warnings_count' | 'credential_review_status' | 'credential_submitted_at' | 'credential_reviewed_by' | 'credential_reviewed_at' | 'credential_review_note' | 'credential_expires_at' | 'profile_visibility' | 'deletion_requested_at'>>;
      bank_details: TableDef<BankDetailsRow, Insertable<BankDetailsRow, 'created_at' | 'updated_at'>>;
      vehicles: TableDef<VehicleRow, Insertable<VehicleRow, 'id' | 'created_at' | 'seat_capacity' | 'brand' | 'year' | 'color' | 'plate'>>;
      trips: TableDef<TripRow, Insertable<TripRow, 'id' | 'created_at' | 'updated_at' | 'seats_taken' | 'status' | 'price_clp' | 'vehicle_id' | 'origin_campus_id' | 'destination_campus_id' | 'origin_campus_name' | 'destination_campus_name' | 'meeting_point_id' | 'meeting_lat' | 'meeting_lng' | 'route_polyline' | 'route_notes'>>;
      bookings: TableDef<BookingRow, Insertable<BookingRow, 'id' | 'created_at' | 'status' | 'cancelled_at' | 'was_late_cancellation'>>;
      payments: TableDef<PaymentRow, Insertable<PaymentRow, 'id' | 'created_at' | 'updated_at' | 'status' | 'price_clp' | 'commission_clp' | 'total_clp' | 'marked_at' | 'confirmed_at'>>;
      ratings: TableDef<RatingRow, Insertable<RatingRow, 'id' | 'created_at' | 'trip_id' | 'booking_id' | 'to_id' | 'note'>>;
      penalties: TableDef<PenaltyRow, Insertable<PenaltyRow, 'id' | 'created_at' | 'occurred_at' | 'booking_id' | 'block_until'>>;
      strikes: TableDef<StrikeRow, Insertable<StrikeRow, 'id' | 'created_at' | 'occurred_at' | 'booking_id' | 'kind'>>;
      credit_transactions: TableDef<CreditTransactionRow, Insertable<CreditTransactionRow, 'id' | 'created_at' | 'description' | 'reference_id'>>;
      redeemables: TableDef<RedeemableRow, Insertable<RedeemableRow, 'created_at' | 'description' | 'sponsor' | 'stock' | 'validity_days' | 'published_by_admin' | 'active' | 'status' | 'proposed_by' | 'publisher_id' | 'reviewed_by' | 'reviewed_at' | 'review_note'>>;
      redemptions: TableDef<RedemptionRow, Insertable<RedemptionRow, 'id' | 'created_at' | 'status' | 'item_id' | 'redeemed_at'>>;
      publishers: TableDef<PublisherRow, Insertable<PublisherRow, 'id' | 'created_at' | 'updated_at' | 'university_id' | 'avatar_url' | 'description'>>;
      posts: TableDef<PostRow, Insertable<PostRow, 'id' | 'created_at' | 'updated_at' | 'author_id' | 'post_type' | 'body' | 'media' | 'event_starts_at' | 'event_location' | 'discount_code' | 'discount_terms' | 'redeemable_id' | 'brand_id' | 'like_count' | 'repost_count' | 'reply_count'>>;
      stories: TableDef<StoryRow, Insertable<StoryRow, 'id' | 'created_at' | 'expires_at' | 'author_id' | 'caption'>>;
      post_likes: TableDef<PostLikeRow, Insertable<PostLikeRow, 'created_at'>>;
      post_reposts: TableDef<PostRepostRow, Insertable<PostRepostRow, 'created_at'>>;
      post_replies: TableDef<PostReplyRow, Insertable<PostReplyRow, 'id' | 'created_at'>>;
      publisher_members: TableDef<PublisherMemberRow, Insertable<PublisherMemberRow, 'created_at'>>;
      brands: TableDef<BrandRow, Insertable<BrandRow, 'id' | 'created_at' | 'updated_at' | 'logo_path'>>;
      widget_config: TableDef<WidgetConfigRow, Insertable<WidgetConfigRow, 'id' | 'created_at' | 'updated_at' | 'widget' | 'sort_order' | 'pinned' | 'featured' | 'updated_by'>>;
      content_folders: TableDef<ContentFolderRow, Insertable<ContentFolderRow, 'id' | 'created_at' | 'updated_at' | 'description' | 'linked_widget' | 'sort_order' | 'created_by'>>;
      content_items: TableDef<ContentItemRow, Insertable<ContentItemRow, 'id' | 'created_at' | 'caption' | 'sort_order' | 'created_by'>>;
      conversations: TableDef<ConversationRow, Insertable<ConversationRow, 'id' | 'created_at' | 'updated_at' | 'dm_key' | 'support_category' | 'support_status' | 'created_by' | 'last_message_at' | 'last_message_preview' | 'last_message_sender'>>;
      conversation_members: TableDef<ConversationMemberRow, Insertable<ConversationMemberRow, 'created_at' | 'last_read_at'>>;
      messages: TableDef<MessageRow, Insertable<MessageRow, 'id' | 'created_at' | 'body' | 'image_path'>>;
      topics: TableDef<TopicRow, Insertable<TopicRow, 'created_at' | 'emoji' | 'description' | 'sort_order'>>;
      topic_assignees: TableDef<TopicAssigneeRow, Insertable<TopicAssigneeRow, 'id' | 'created_at' | 'user_id' | 'publisher_id'>>;
      questions: TableDef<QuestionRow, Insertable<QuestionRow, 'id' | 'created_at' | 'updated_at' | 'body' | 'reply_count' | 'answered_at'>>;
      question_replies: TableDef<QuestionReplyRow, Insertable<QuestionReplyRow, 'id' | 'created_at' | 'publisher_id' | 'is_official'>>;
      guides: TableDef<GuideRow, Insertable<GuideRow, 'id' | 'created_at' | 'updated_at' | 'description'>>;
      push_tokens: TableDef<PushTokenRow, Insertable<PushTokenRow, 'id' | 'created_at' | 'updated_at' | 'device_name'>>;
      notification_prefs: TableDef<NotificationPrefsRow, Insertable<NotificationPrefsRow, 'created_at' | 'updated_at' | 'pagos' | 'viajes' | 'social' | 'mensajes'>>;
      notifications: TableDef<NotificationRow, Insertable<NotificationRow, 'id' | 'created_at' | 'body' | 'url' | 'data' | 'dedupe_key' | 'read_at' | 'push_status' | 'push_claimed_at' | 'push_sent_at'>>;
      platform_config: TableDef<PlatformConfigRow, Insertable<PlatformConfigRow, 'id' | 'commission_clp' | 'credit_clp_rate' | 'max_credit_discount_pct' | 'require_reinforced_driver_verification' | 'updated_by' | 'updated_at'>>;
      payment_events: TableDef<PaymentEventRow, Insertable<PaymentEventRow, 'id' | 'created_at' | 'payload' | 'payment_id'>>;
      disputes: TableDef<DisputeRow, Insertable<DisputeRow, 'id' | 'created_at' | 'updated_at' | 'reason' | 'evidence_path' | 'status' | 'payment_id' | 'conversation_id' | 'resolved_by' | 'resolution_note' | 'resolved_at'>>;
      payouts: TableDef<PayoutRow, Insertable<PayoutRow, 'id' | 'created_at' | 'gross_clp' | 'commission_clp' | 'net_clp' | 'payment_count' | 'status' | 'note' | 'created_by' | 'paid_at'>>;
      badge_definitions: TableDef<BadgeDefinitionRow, Insertable<BadgeDefinitionRow, 'created_at' | 'sort_order'>>;
      user_badges: TableDef<UserBadgeRow, Insertable<UserBadgeRow, 'unlocked_at'>>;
      referrals: TableDef<ReferralRow, Insertable<ReferralRow, 'id' | 'created_at' | 'status' | 'credited_at'>>;
      ai_bots: TableDef<AiBotRow, Insertable<AiBotRow, 'id' | 'created_at' | 'updated_at' | 'publisher_id' | 'tutor_id' | 'topic_id' | 'system_prompt' | 'enabled' | 'created_by'>>;
      // --- Sesión 9: seguridad, confianza y moderación ---
      trip_live_shares: TableDef<TripLiveShareRow, Insertable<TripLiveShareRow, 'id' | 'active' | 'last_lat' | 'last_lng' | 'last_update_at' | 'started_at' | 'stopped_at' | 'share_token'>>;
      sos_alerts: TableDef<SosAlertRow, Insertable<SosAlertRow, 'id' | 'created_at' | 'status' | 'resolved_at' | 'resolved_by' | 'resolution_note' | 'trip_id' | 'lat' | 'lng' | 'contact_name' | 'contact_phone'>>;
      reports: TableDef<ReportRow, Insertable<ReportRow, 'id' | 'created_at' | 'status' | 'resolution' | 'resolved_by' | 'resolved_at' | 'target_user_id' | 'target_id' | 'description' | 'evidence_path'>>;
      user_blocks: TableDef<UserBlockRow, Insertable<UserBlockRow, 'created_at'>>;
      moderation_actions: TableDef<ModerationActionRow, Insertable<ModerationActionRow, 'id' | 'created_at' | 'report_id' | 'suspended_until'>>;
      blocked_words: TableDef<BlockedWordRow, Insertable<BlockedWordRow, 'id' | 'created_at' | 'created_by'>>;
      driver_verifications: TableDef<DriverVerificationRow, Insertable<DriverVerificationRow, 'status' | 'submitted_at' | 'reviewed_by' | 'reviewed_at' | 'review_note' | 'created_at' | 'updated_at' | 'id_document_path' | 'license_document_path'>>;
      device_token_seen: TableDef<DeviceTokenSeenRow, Insertable<DeviceTokenSeenRow, 'id' | 'seen_at'>>;
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
      review_redeemable: {
        Args: { p_item_id: string; p_approve: boolean; p_note?: string | null };
        Returns: RedeemableRow;
      };
      credit_balance: {
        Args: { target: string };
        Returns: number;
      };
      get_driver_bank_details: {
        Args: { p_driver_id: string };
        Returns: Json;
      };
      start_dm: {
        Args: { p_other_user: string };
        Returns: ConversationRow;
      };
      start_support: {
        Args: { p_category: string };
        Returns: ConversationRow;
      };
      set_support_status: {
        Args: { p_conversation: string; p_status: string };
        Returns: ConversationRow;
      };
      mark_conversation_read: {
        Args: { p_conversation: string };
        Returns: undefined;
      };
      conversation_unread_counts: {
        Args: Record<string, never>;
        Returns: { conversation_id: string; unread_count: number }[];
      };
      list_dm_contacts: {
        Args: Record<string, never>;
        Returns: { id: string; full_name: string | null; avatar_url: string | null; is_official: boolean }[];
      };
      register_push_token: {
        Args: { p_token: string; p_platform: string; p_device_name?: string | null };
        Returns: undefined;
      };
      unregister_push_token: {
        Args: { p_token: string };
        Returns: undefined;
      };
      claim_pending_push: {
        Args: { p_limit?: number };
        Returns: NotificationRow[];
      };
      open_dispute: {
        Args: { p_booking_id: string; p_reason?: string; p_evidence_path?: string | null };
        Returns: DisputeRow;
      };
      resolve_dispute: {
        Args: { p_dispute_id: string; p_approve: boolean; p_note?: string | null };
        Returns: DisputeRow;
      };
      list_disputes: {
        Args: { p_only_open?: boolean };
        Returns: Json;
      };
      driver_earnings: {
        Args: Record<string, never>;
        Returns: Json;
      };
      create_payout: {
        Args: { p_driver_id: string; p_period_start: string; p_period_end: string };
        Returns: PayoutRow;
      };
      mark_payout_paid: {
        Args: { p_payout_id: string };
        Returns: PayoutRow;
      };
      owner_finance_summary: {
        Args: Record<string, never>;
        Returns: Json;
      };
      update_platform_config: {
        Args: {
          p_commission_clp?: number | null;
          p_credit_clp_rate?: number | null;
          p_max_credit_discount_pct?: number | null;
          p_require_reinforced_driver_verification?: boolean | null;
        };
        Returns: PlatformConfigRow;
      };
      redeem_referral_code: {
        Args: { p_code: string };
        Returns: ReferralRow;
      };
      set_publisher_bot: {
        Args: {
          p_publisher_id: string;
          p_persona_name: string;
          p_system_prompt?: string | null;
          p_enabled?: boolean | null;
        };
        Returns: AiBotRow;
      };
      set_tutor_topic_bot: {
        Args: {
          p_topic_id: string;
          p_persona_name: string;
          p_system_prompt?: string | null;
          p_enabled?: boolean | null;
        };
        Returns: AiBotRow;
      };
      // --- Sesión 9: seguridad, confianza y moderación ---
      start_trip_share: {
        Args: { p_trip_id: string; p_contact_name: string; p_contact_phone: string };
        Returns: TripLiveShareRow;
      };
      update_trip_share_location: {
        Args: { p_trip_id: string; p_lat: number; p_lng: number };
        Returns: undefined;
      };
      stop_trip_share: {
        Args: { p_trip_id: string };
        Returns: undefined;
      };
      get_live_share: {
        Args: { p_token: string };
        Returns: Json;
      };
      trigger_sos: {
        Args: { p_trip_id?: string | null; p_lat?: number | null; p_lng?: number | null };
        Returns: SosAlertRow;
      };
      resolve_sos: {
        Args: { p_alert_id: string; p_status: string; p_note?: string | null };
        Returns: SosAlertRow;
      };
      list_sos_alerts: {
        Args: { p_only_active?: boolean | null };
        Returns: SosAlertListItem[];
      };
      report_target: {
        Args: {
          p_target_type: string;
          p_reason: string;
          p_target_user_id?: string | null;
          p_target_id?: string | null;
          p_description?: string | null;
          p_evidence_path?: string | null;
        };
        Returns: ReportRow;
      };
      list_reports: {
        Args: { p_status?: string | null; p_target_type?: string | null };
        Returns: ReportListItem[];
      };
      triage_report: {
        Args: { p_report_id: string; p_status: string };
        Returns: ReportRow;
      };
      apply_moderation_action: {
        Args: {
          p_target_user_id: string;
          p_action: string;
          p_reason: string;
          p_suspend_days?: number | null;
          p_report_id?: string | null;
        };
        Returns: ProfileRow;
      };
      moderate_content: {
        Args: { p_report_id: string; p_delete: boolean; p_note?: string | null };
        Returns: ReportRow;
      };
      submit_credential_review: {
        Args: Record<string, never>;
        Returns: ProfileRow;
      };
      verify_credential_by_email_match: {
        Args: Record<string, never>;
        Returns: Json;
      };
      name_email_match_score: {
        Args: { p_name: string; p_email: string };
        Returns: number;
      };
      name_matches_email: {
        Args: { p_name: string; p_email: string };
        Returns: boolean;
      };
      review_credential: {
        Args: { p_user_id: string; p_approve: boolean; p_note?: string | null };
        Returns: ProfileRow;
      };
      list_credential_reviews: {
        Args: { p_status?: string | null };
        Returns: CredentialReviewItem[];
      };
      submit_driver_verification: {
        Args: { p_id_path: string; p_license_path: string };
        Returns: DriverVerificationRow;
      };
      review_driver_verification: {
        Args: { p_user_id: string; p_approve: boolean; p_note?: string | null };
        Returns: DriverVerificationRow;
      };
      list_driver_verifications: {
        Args: { p_status?: string | null };
        Returns: DriverVerificationListItem[];
      };
      get_public_profile: {
        Args: { p_user_id: string };
        Returns: Json;
      };
      export_my_data: {
        Args: Record<string, never>;
        Returns: Json;
      };
      list_duplicate_account_signals: {
        Args: { p_days?: number | null };
        Returns: DuplicateAccountSignal[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
