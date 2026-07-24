-- Unities — Sesión 9: esquema de seguridad, confianza y moderación.
-- Seis frentes en un solo esquema: seguridad en viaje (compartir en vivo, SOS),
-- reportes y bloqueos, moderación de contenido, identidad reforzada,
-- privacidad/datos y anti-abuso. Convención de siempre: snake_case, uuid,
-- timestamptz created_at/updated_at.

-- ===========================================================================
-- 1) Seguridad en viaje
-- ===========================================================================

-- Compartir viaje en vivo: quien comparte (conductor o pasajero con reserva)
-- genera un token; get_live_share(token) (Sesión 9, funciones) es pública
-- (grant a anon) para que el contacto de emergencia vea la posición sin tener
-- cuenta Unities. Solo la posición MÁS RECIENTE se guarda (retención limitada:
-- no hay historial de ubicaciones, ver purge_expired_trip_shares).
create table if not exists public.trip_live_shares (
  id               uuid primary key default gen_random_uuid(),
  trip_id          uuid not null references public.trips (id) on delete cascade,
  sharer_id        uuid not null references public.profiles (id) on delete cascade,
  share_token      text not null unique,
  contact_name     text not null check (char_length(btrim(contact_name)) between 1 and 120),
  contact_phone    text not null check (char_length(btrim(contact_phone)) between 3 and 30),
  active           boolean not null default true,
  last_lat         double precision,
  last_lng         double precision,
  last_update_at   timestamptz,
  started_at       timestamptz not null default now(),
  stopped_at       timestamptz
);

create index if not exists trip_live_shares_trip_idx on public.trip_live_shares (trip_id);
create index if not exists trip_live_shares_sharer_idx on public.trip_live_shares (sharer_id);
-- Un único compartir activo por (viaje, quien comparte).
create unique index if not exists trip_live_shares_active_uq
  on public.trip_live_shares (trip_id, sharer_id) where active;

-- Alertas SOS disparadas durante un viaje. Se conservan como bitácora de
-- auditoría (igual que strikes/reports): no se purgan automáticamente.
create table if not exists public.sos_alerts (
  id              uuid primary key default gen_random_uuid(),
  trip_id         uuid references public.trips (id) on delete set null,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  lat             double precision,
  lng             double precision,
  contact_name    text,
  contact_phone   text,
  status          text not null default 'activa' check (status in ('activa', 'atendida', 'falsa_alarma')),
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  resolved_by     uuid references public.profiles (id),
  resolution_note text
);

create index if not exists sos_alerts_user_idx on public.sos_alerts (user_id);
create index if not exists sos_alerts_status_idx on public.sos_alerts (status) where status = 'activa';

-- Contacto de emergencia: dato propio, autoeditable (no está en la lista de
-- columnas server-managed de protect_profile_columns).
alter table public.profiles
  add column if not exists emergency_contact_name  text,
  add column if not exists emergency_contact_phone text;

-- ===========================================================================
-- 2) Reportes y bloqueos
-- ===========================================================================

-- Reporte polimórfico: de usuario, viaje, mensaje o contenido del feed/Q&A.
-- target_id no lleva FK (apunta a distintas tablas según target_type); la
-- integridad la valida report_target (RPC) antes de insertar.
create table if not exists public.reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid not null references public.profiles (id) on delete cascade,
  target_type      text not null check (target_type in
                     ('usuario', 'viaje', 'mensaje', 'post', 'historia', 'post_respuesta', 'pregunta', 'qa_respuesta')),
  target_user_id   uuid references public.profiles (id) on delete cascade,
  target_id        uuid,
  reason           text not null check (reason in
                     ('spam', 'acoso', 'contenido_inapropiado', 'seguridad', 'fraude', 'otro')),
  description      text check (char_length(coalesce(description, '')) <= 1000),
  evidence_path    text,
  status           text not null default 'pendiente'
                     check (status in ('pendiente', 'en_revision', 'resuelto', 'descartado')),
  resolution       text check (resolution in ('advertencia', 'suspension', 'baneo', 'contenido_eliminado', 'sin_accion')),
  resolved_by      uuid references public.profiles (id),
  resolved_at      timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists reports_status_idx on public.reports (status, created_at desc);
create index if not exists reports_target_user_idx on public.reports (target_user_id);
create index if not exists reports_reporter_idx on public.reports (reporter_id);

-- Bloqueo mutuo: el bloqueado no puede abrir/escribir DM con el bloqueador (ni
-- viceversa) y sus respuestas de feed/Q&A se ocultan entre ambos (ver RLS).
create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_id);

-- Auditoría de sanciones aplicadas por admin/owner (advertencia, suspensión,
-- baneo, o levantar una sanción). El estado vigente vive denormalizado en
-- profiles.moderation_status/moderation_until.
create table if not exists public.moderation_actions (
  id               uuid primary key default gen_random_uuid(),
  target_user_id   uuid not null references public.profiles (id) on delete cascade,
  moderator_id     uuid not null references public.profiles (id),
  action           text not null check (action in ('advertencia', 'suspension', 'baneo', 'levantar_sancion')),
  report_id        uuid references public.reports (id) on delete set null,
  reason           text not null check (char_length(btrim(reason)) between 1 and 500),
  suspended_until  timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists moderation_actions_target_idx on public.moderation_actions (target_user_id, created_at desc);

-- Estado de moderación denormalizado (patrón payment_ban_until/block_until):
-- solo lo tocan apply_moderation_action / reinstate_user (server-side).
alter table public.profiles
  add column if not exists moderation_status text not null default 'activo'
    check (moderation_status in ('activo', 'suspendido', 'baneado')),
  add column if not exists moderation_until  timestamptz,
  add column if not exists warnings_count    integer not null default 0;

-- ===========================================================================
-- 3) Moderación de contenido: filtro de palabras
-- ===========================================================================

-- Catálogo de palabras bloqueadas para el filtro básico de publicaciones.
-- Administrado por admin/owner desde la cola de moderación.
create table if not exists public.blocked_words (
  id         uuid primary key default gen_random_uuid(),
  word       text not null unique,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- ===========================================================================
-- 4) Identidad: revisión de credenciales + verificación reforzada de conductor
-- ===========================================================================

-- La verificación hoy es "automática por captura" (credential_verified lo
-- fija el propio cliente vía updateProfile — burlable). Pasa a una cola con
-- revisión humana (tutor+) y vencimiento semestral.
alter table public.profiles
  add column if not exists credential_review_status text not null default 'pendiente'
    check (credential_review_status in ('pendiente', 'en_revision', 'aprobado', 'rechazado')),
  add column if not exists credential_submitted_at timestamptz,
  add column if not exists credential_reviewed_by  uuid references public.profiles (id),
  add column if not exists credential_reviewed_at  timestamptz,
  add column if not exists credential_review_note  text,
  add column if not exists credential_expires_at   timestamptz;

-- Verificación reforzada opcional para conductores: cédula + licencia,
-- revisadas aparte de la credencial universitaria. 1:1 con profiles.
create table if not exists public.driver_verifications (
  user_id             uuid primary key references public.profiles (id) on delete cascade,
  id_document_path    text,
  license_document_path text,
  status              text not null default 'pendiente'
                        check (status in ('pendiente', 'en_revision', 'aprobado', 'rechazado')),
  submitted_at        timestamptz,
  reviewed_by         uuid references public.profiles (id),
  reviewed_at         timestamptz,
  review_note         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Interruptor del owner: exigir verificación reforzada para publicar viajes.
alter table public.platform_config
  add column if not exists require_reinforced_driver_verification boolean not null default false;

-- ===========================================================================
-- 5) Privacidad y datos
-- ===========================================================================

-- Visibilidad del perfil público (get_public_profile respeta esto). No
-- restringe profiles_select (seguiría rompiendo joins de viajes/reservas que
-- necesitan ver el nombre del conductor); solo gobierna la vista de perfil
-- público de un tercero.
alter table public.profiles
  add column if not exists profile_visibility text not null default 'publico'
    check (profile_visibility in ('publico', 'oculto')),
  add column if not exists deletion_requested_at timestamptz;

-- ===========================================================================
-- 6) Anti-abuso: bitácora de dispositivos (señal de cuentas duplicadas)
-- ===========================================================================

-- Cada llamada a register_push_token (Sesión 7) además deja este registro de
-- solo-inserción: si el mismo token de dispositivo aparece con más de un
-- user_id distinto en la ventana reciente, es señal de cuenta duplicada
-- (mismo teléfono, otra sesión). No reemplaza push_tokens (que sí se
-- reasigna); esto es el historial que push_tokens no conserva.
create table if not exists public.device_token_seen (
  id       uuid primary key default gen_random_uuid(),
  token    text not null,
  user_id  uuid not null references public.profiles (id) on delete cascade,
  platform text not null,
  seen_at  timestamptz not null default now()
);

create index if not exists device_token_seen_token_idx on public.device_token_seen (token, seen_at desc);
