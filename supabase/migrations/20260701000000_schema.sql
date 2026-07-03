-- Uturn — Sesión 3: esquema base + tablas de las Sesiones 1–2.
-- Convención: snake_case, ids uuid (gen_random_uuid()), timestamptz con
-- created_at/updated_at. Mapea models/types.ts, models/uturn.ts y store/appState.tsx.
--
-- Estados canónicos en inglés para el dominio de carpooling (trips/bookings/payments),
-- tal como los define docs/backend.md; la capa services/api/* los mapea a los tokens
-- en español que consumen las pantallas. Las tablas de créditos/canjes conservan los
-- tokens en español de models/uturn.ts para evitar una capa de traducción extra.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- profiles — extiende auth.users (1:1, mismo id). Fuente: User + UserProfile.
-- Lleva denormalizados los contadores de reputación/penalización/rachas que
-- hoy viven en el estado local; las funciones de servidor son su fuente de verdad.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                         uuid primary key references auth.users (id) on delete cascade,
  full_name                  text,
  email                      text not null unique,
  account_role               text not null default 'user'
                               check (account_role in ('user', 'tutor', 'admin', 'owner')),
  travel_mode                text not null default 'rider'
                               check (travel_mode in ('driver', 'rider')),
  university_id              text,
  home_campus_id            text,
  date_of_birth             date,
  avatar_url                text,
  credential_verified       boolean not null default false,
  rating_avg                numeric(3, 2) not null default 0,
  driver_license_number     text,
  driver_license_expiration date,
  bank_details              jsonb,
  -- Reputación / créditos (Sesión 2)
  reward_points             integer not null default 0 check (reward_points >= 0),
  -- Rachas (Sesión 1)
  streak_on_time_payments        integer not null default 0,
  best_streak_on_time_payments   integer not null default 0,
  streak_completed_trips         integer not null default 0,
  best_streak_completed_trips    integer not null default 0,
  -- Cancelaciones tardías → bloqueo (services/penalties.ts)
  late_cancellations_count  integer not null default 0,
  last_late_cancellation_at timestamptz,
  block_until               timestamptz,
  -- Strikes por impago → baneo de turnos (services/penalties.ts)
  payment_strikes_count     integer not null default 0,
  last_payment_strike_at    timestamptz,
  payment_ban_until         timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- vehicles — Fuente: Car / VehicleInfo.
-- ---------------------------------------------------------------------------
create table if not exists public.vehicles (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles (id) on delete cascade,
  brand          text,
  model          text not null,
  year           integer,
  color          text,
  plate          text,
  seat_capacity  integer not null default 4 check (seat_capacity > 0),
  created_at     timestamptz not null default now(),
  unique (owner_id, plate)
);

-- ---------------------------------------------------------------------------
-- trips — Fuente: Trip (store/appState.tsx). Guarda coords e ids/nombres de
-- campus para reconstruir el tipo del cliente sin lookups.
-- ---------------------------------------------------------------------------
create table if not exists public.trips (
  id                       uuid primary key default gen_random_uuid(),
  driver_id                uuid not null references public.profiles (id) on delete cascade,
  vehicle_id               uuid references public.vehicles (id) on delete set null,
  origin_campus_id         text,
  destination_campus_id    text,
  origin_campus_name       text,
  destination_campus_name  text,
  meeting_point_id         text,
  origin_lat               double precision not null,
  origin_lng               double precision not null,
  destination_lat          double precision not null,
  destination_lng          double precision not null,
  meeting_lat              double precision,
  meeting_lng              double precision,
  route_polyline           jsonb,
  departs_at               timestamptz not null,
  price_clp                integer not null default 0 check (price_clp >= 0),
  seats_total              integer not null check (seats_total >= 0),
  seats_taken              integer not null default 0 check (seats_taken >= 0),
  status                   text not null default 'published'
                             check (status in ('published', 'full', 'in_progress', 'completed', 'cancelled')),
  route_notes              text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  check (seats_taken <= seats_total)
);

create index if not exists trips_driver_idx on public.trips (driver_id);
create index if not exists trips_departs_idx on public.trips (departs_at);

-- ---------------------------------------------------------------------------
-- bookings — Fuente: Booking. Una reserva activa por (trip, passenger).
-- ---------------------------------------------------------------------------
create table if not exists public.bookings (
  id                    uuid primary key default gen_random_uuid(),
  trip_id               uuid not null references public.trips (id) on delete cascade,
  passenger_id          uuid not null references public.profiles (id) on delete cascade,
  status                text not null default 'confirmed'
                          check (status in ('pending', 'confirmed', 'cancelled', 'completed')),
  cancelled_at          timestamptz,
  was_late_cancellation boolean not null default false,
  created_at            timestamptz not null default now()
);

create index if not exists bookings_trip_idx on public.bookings (trip_id);
create index if not exists bookings_passenger_idx on public.bookings (passenger_id);

-- Índice parcial: una única reserva no cancelada por pasajero y viaje.
create unique index if not exists bookings_active_unique
  on public.bookings (trip_id, passenger_id)
  where status <> 'cancelled';

-- ---------------------------------------------------------------------------
-- payments — Sesión 1: monto, comisión, plazo de 48 h y estado. 1:1 con booking.
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid not null unique references public.bookings (id) on delete cascade,
  status         text not null default 'pending'
                   check (status in ('pending', 'marked', 'confirmed', 'overdue')),
  price_clp      integer not null default 0 check (price_clp >= 0),
  commission_clp integer not null default 0 check (commission_clp >= 0),
  total_clp      integer not null default 0 check (total_clp >= 0),
  due_at         timestamptz not null,
  marked_at      timestamptz,
  confirmed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists payments_status_due_idx on public.payments (status, due_at);

-- ---------------------------------------------------------------------------
-- ratings — Fuente: Rating. Una calificación por (trip, from, to).
-- ---------------------------------------------------------------------------
create table if not exists public.ratings (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid references public.trips (id) on delete cascade,
  booking_id  uuid references public.bookings (id) on delete set null,
  from_id     uuid not null references public.profiles (id) on delete cascade,
  to_id       uuid references public.profiles (id) on delete cascade,
  stars       integer not null check (stars between 1 and 5),
  note        text,
  created_at  timestamptz not null default now()
);

create unique index if not exists ratings_unique
  on public.ratings (trip_id, from_id, to_id)
  where trip_id is not null and to_id is not null;

-- ---------------------------------------------------------------------------
-- penalties — historial de cancelaciones tardías y bloqueos resultantes.
-- ---------------------------------------------------------------------------
create table if not exists public.penalties (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  booking_id  uuid references public.bookings (id) on delete set null,
  occurred_at timestamptz not null default now(),
  block_until timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists penalties_user_idx on public.penalties (user_id);

-- ---------------------------------------------------------------------------
-- strikes — historial de strikes por impago (Sesión 1).
-- ---------------------------------------------------------------------------
create table if not exists public.strikes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  booking_id  uuid references public.bookings (id) on delete set null,
  kind        text not null default 'payment' check (kind in ('payment')),
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index if not exists strikes_user_idx on public.strikes (user_id);

-- ---------------------------------------------------------------------------
-- credit_transactions — Sesión 2. Saldo = suma(abono) - suma(cargo).
-- Conserva los tokens en español de models/uturn.ts.
-- ---------------------------------------------------------------------------
create table if not exists public.credit_transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  entry_type    text not null check (entry_type in ('abono', 'cargo')),
  source        text not null check (source in ('viaje', 'racha', 'bono', 'canje', 'ajuste')),
  amount        integer not null check (amount > 0),
  description   text not null default '',
  reference_id  text,
  created_at    timestamptz not null default now()
);

create index if not exists credit_tx_user_idx on public.credit_transactions (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- redeemables — catálogo de canjes (lo publican admins en Sesión 4).
-- ---------------------------------------------------------------------------
create table if not exists public.redeemables (
  id                 text primary key,
  title              text not null,
  description        text not null default '',
  category           text not null check (category in ('comida', 'merch', 'eventos', 'servicios')),
  cost_credits       integer not null check (cost_credits >= 0),
  sponsor            text,
  stock              integer,
  validity_days      integer not null default 7 check (validity_days > 0),
  published_by_admin boolean not null default true,
  active             boolean not null default true,
  created_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- redemptions — Sesión 2. Un canje concreto con su código.
-- ---------------------------------------------------------------------------
create table if not exists public.redemptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  item_id       text references public.redeemables (id) on delete set null,
  title         text not null,
  cost_credits  integer not null check (cost_credits >= 0),
  code          text not null,
  status        text not null default 'disponible' check (status in ('disponible', 'canjeado')),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  redeemed_at   timestamptz
);

create index if not exists redemptions_user_idx on public.redemptions (user_id, created_at desc);
