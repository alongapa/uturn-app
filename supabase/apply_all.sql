-- =====================================================================
-- Uturn — Sesión 3: bundle de migraciones para aplicar SIN CLI.
-- Pega TODO este archivo en el SQL Editor de Supabase
-- (Dashboard → SQL Editor → New query) y ejecútalo una sola vez.
-- Corre como rol `postgres`, así que crea triggers en auth.users,
-- políticas de storage y pg_cron sin credenciales extra.
--
-- Es la concatenación en orden de supabase/migrations/*.sql (la fuente
-- de verdad versionada). Si usas la CLI (`supabase db push`) NO necesitas
-- este archivo. Idempotente: se puede re-ejecutar.
-- =====================================================================


-- ###################################################################
-- ## 20260701000000_schema.sql
-- ###################################################################
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
-- bank_details — datos bancarios del conductor (BankDetails de models/types).
-- Tabla aparte de profiles para que RLS pueda dejarlos fuera de la lectura
-- comunitaria del perfil: solo el dueño los lee directo; un pasajero con
-- reserva vigente los obtiene vía RPC get_driver_bank_details.
-- ---------------------------------------------------------------------------
create table if not exists public.bank_details (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  details    jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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

-- Los códigos de canje son vales: no pueden repetirse.
create unique index if not exists redemptions_code_unique on public.redemptions (code);

-- ###################################################################
-- ## 20260701000001_functions.sql
-- ###################################################################
-- Uturn — Sesión 3: funciones de servidor, triggers y RPCs.
-- Porta la lógica de negocio hoy en store/appState.tsx y services/penalties.ts
-- para que el servidor sea la fuente de verdad (imposible de burlar desde el cliente).

-- ===========================================================================
-- Helpers de autorización y utilitarios
-- ===========================================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and account_role in ('admin', 'owner')
  );
$$;

-- Dominios institucionales aceptados en el registro (Sesión 0).
create or replace function public.is_university_email(email text)
returns boolean
language sql
immutable
as $$
  select lower(coalesce(email, '')) ~ '@(alumnos\.uai\.cl|udd\.cl|miuandes\.cl)$';
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trips_set_updated_at on public.trips;
create trigger trips_set_updated_at before update on public.trips
  for each row execute function public.set_updated_at();

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- Auth: validación de dominio + creación automática del profile
-- ===========================================================================

-- Rechaza el alta de usuarios con correo no institucional (OTP/magic link incluido).
create or replace function public.enforce_university_email()
returns trigger
language plpgsql
as $$
begin
  if not public.is_university_email(new.email) then
    raise exception 'El registro está limitado a correos institucionales (@alumnos.uai.cl, @udd.cl, @miuandes.cl)'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_university_email on auth.users;
create trigger enforce_university_email before insert on auth.users
  for each row execute function public.enforce_university_email();

-- Crea el profile 1:1 al registrarse, tomando metadatos del sign-up si existen.
-- La universidad NO se toma de los metadatos (raw_user_meta_data es editable
-- por el usuario): se deriva del dominio del correo ya validado.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_university text := case
    when lower(new.email) like '%@alumnos.uai.cl' then 'uai'
    when lower(new.email) like '%@udd.cl' then 'udd'
    when lower(new.email) like '%@miuandes.cl' then 'uandes'
    else null
  end;
begin
  insert into public.profiles (id, email, full_name, university_id, home_campus_id, date_of_birth)
  values (
    new.id,
    new.email,
    nullif(meta->>'full_name', ''),
    v_university,
    nullif(meta->>'home_campus_id', ''),
    (nullif(meta->>'date_of_birth', ''))::date
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===========================================================================
-- Reputación: rating_avg denormalizado desde ratings
-- ===========================================================================

create or replace function public.recompute_rating_avg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.to_id, old.to_id);
begin
  if target is null then
    return coalesce(new, old);
  end if;
  update public.profiles p
    set rating_avg = coalesce((
      select round(avg(stars)::numeric, 2) from public.ratings where to_id = target
    ), 0)
  where p.id = target;
  return coalesce(new, old);
end;
$$;

drop trigger if exists ratings_recompute_avg on public.ratings;
create trigger ratings_recompute_avg after insert or update or delete on public.ratings
  for each row execute function public.recompute_rating_avg();

-- ===========================================================================
-- Créditos: saldo agregado
-- ===========================================================================

-- Solo el propio usuario (o un admin) puede consultar un saldo.
create or replace function public.credit_balance(target uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(case when entry_type = 'abono' then amount else -amount end), 0)::integer
  from public.credit_transactions
  where user_id = target
    and (target = auth.uid() or public.is_admin());
$$;

-- ===========================================================================
-- Datos bancarios del conductor: solo visibles para él mismo y para pasajeros
-- con una reserva no cancelada en alguno de sus viajes. Devuelve null si el
-- caller no tiene derecho (la tabla bank_details tiene RLS de solo-dueño).
-- ===========================================================================

create or replace function public.get_driver_bank_details(p_driver_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select bd.details
  from public.bank_details bd
  where bd.user_id = p_driver_id
    and (
      p_driver_id = auth.uid()
      or public.is_admin()
      or exists (
        select 1
        from public.bookings b
        join public.trips t on t.id = b.trip_id
        where t.driver_id = p_driver_id
          and b.passenger_id = auth.uid()
          and b.status <> 'cancelled'
      )
    );
$$;

-- ===========================================================================
-- Reserva de asiento (RPC): valida bloqueo/ban y asientos, crea booking + payment.
-- Reemplaza addBooking + reglas de canUserBookOrCancel del cliente.
-- ===========================================================================

create or replace function public.reserve_seat(p_trip_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  -- La comisión la fija el servidor (services/payments.ts UTURN_COMMISSION_CLP);
  -- si fuera parámetro, el cliente podría reservar con comisión 0.
  c_commission_clp constant integer := 300;
  v_uid uuid := auth.uid();
  v_trip public.trips;
  v_profile public.profiles;
  v_booking public.bookings;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = 'insufficient_privilege';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if v_profile.payment_ban_until is not null and v_profile.payment_ban_until > now() then
    raise exception 'Baneado de los turnos por impago hasta %', v_profile.payment_ban_until
      using errcode = 'check_violation';
  end if;
  if v_profile.block_until is not null and v_profile.block_until > now() then
    raise exception 'Usuario bloqueado por cancelaciones tardías hasta %', v_profile.block_until
      using errcode = 'check_violation';
  end if;

  -- Bloquea la fila del viaje para evitar sobreventa de asientos.
  select * into v_trip from public.trips where id = p_trip_id for update;
  if not found then
    raise exception 'Viaje no encontrado' using errcode = 'no_data_found';
  end if;
  if v_trip.status = 'cancelled' then
    raise exception 'El viaje fue cancelado' using errcode = 'check_violation';
  end if;
  if v_trip.driver_id = v_uid then
    raise exception 'No puedes reservar tu propio viaje' using errcode = 'check_violation';
  end if;
  if v_trip.seats_taken >= v_trip.seats_total then
    raise exception 'No quedan asientos disponibles' using errcode = 'check_violation';
  end if;

  insert into public.bookings (trip_id, passenger_id, status)
  values (p_trip_id, v_uid, 'confirmed')
  returning * into v_booking;

  insert into public.payments (booking_id, status, price_clp, commission_clp, total_clp, due_at)
  values (
    v_booking.id,
    'pending',
    v_trip.price_clp,
    c_commission_clp,
    v_trip.price_clp + c_commission_clp,
    now() + interval '48 hours'
  );

  update public.trips
    set seats_taken = seats_taken + 1,
        status = case when seats_taken + 1 >= seats_total then 'full' else status end
  where id = p_trip_id;

  return v_booking;
end;
$$;

-- ===========================================================================
-- Cancelar reserva (RPC): libera asiento y aplica penalización si es tardía.
-- Porta cancelBooking + applyLateCancellation (3/6/9 → 1/3/7 días, ventana 30 días).
-- ===========================================================================

create or replace function public.cancel_booking(p_booking_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_booking public.bookings;
  v_trip public.trips;
  v_profile public.profiles;
  v_departure timestamptz;
  v_hour int;
  v_free_window numeric;
  v_diff_hours numeric;
  v_is_late boolean;
  v_next_count int;
  v_block_ms interval;
  v_block_until timestamptz;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = 'insufficient_privilege';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Reserva no encontrada' using errcode = 'no_data_found';
  end if;
  if v_booking.passenger_id <> v_uid and not public.is_admin() then
    raise exception 'Solo el pasajero puede cancelar su reserva' using errcode = 'insufficient_privilege';
  end if;
  if v_booking.status = 'cancelled' then
    return v_booking;
  end if;
  if v_booking.status = 'completed' then
    raise exception 'No puedes cancelar un viaje ya completado' using errcode = 'check_violation';
  end if;

  select * into v_trip from public.trips where id = v_booking.trip_id for update;
  v_departure := v_trip.departs_at;
  v_hour := extract(hour from v_departure);
  -- Llegadas de mañana (08–10) tienen ventana libre de 12 h; el resto, 2 h.
  v_free_window := case when v_hour >= 8 and v_hour < 10 then 12 else 2 end;
  v_diff_hours := extract(epoch from (v_departure - now())) / 3600.0;
  v_is_late := v_diff_hours < v_free_window;

  update public.bookings
    set status = 'cancelled',
        cancelled_at = now(),
        was_late_cancellation = v_is_late
  where id = p_booking_id
  returning * into v_booking;

  -- Libera el asiento y revierte 'full' si corresponde.
  update public.trips
    set seats_taken = greatest(0, seats_taken - 1),
        status = case when status = 'full' then 'published' else status end
  where id = v_trip.id;

  if v_is_late then
    select * into v_profile from public.profiles where id = v_booking.passenger_id for update;

    -- Reset por ventana móvil de 30 días.
    if v_profile.last_late_cancellation_at is not null
       and now() - v_profile.last_late_cancellation_at > interval '30 days' then
      v_profile.late_cancellations_count := 0;
    end if;

    v_next_count := v_profile.late_cancellations_count + 1;
    v_block_ms := case v_next_count
      when 3 then interval '1 day'
      when 6 then interval '3 days'
      when 9 then interval '7 days'
      else null
    end;
    if v_block_ms is not null then
      v_block_until := now() + v_block_ms;
    elsif v_profile.block_until is not null and v_profile.block_until > now() then
      v_block_until := v_profile.block_until;
    else
      v_block_until := null;
    end if;

    update public.profiles
      set late_cancellations_count = v_next_count,
          last_late_cancellation_at = now(),
          block_until = v_block_until
    where id = v_booking.passenger_id;

    insert into public.penalties (user_id, booking_id, occurred_at, block_until)
    values (v_booking.passenger_id, p_booking_id, now(), v_block_until);
  end if;

  return v_booking;
end;
$$;

-- ===========================================================================
-- Pagos (RPC): marcar enviado (pasajero) y confirmar recibido (conductor).
-- Porta markPaymentSent / confirmPaymentReceived, incluyendo créditos y rachas.
-- ===========================================================================

create or replace function public.mark_payment_sent(p_booking_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_booking public.bookings;
  v_payment public.payments;
begin
  -- El guard de null es imprescindible: `x <> null` evalúa a null (falsy) y
  -- saltaría silenciosamente la comprobación de autorización.
  if v_uid is null then
    raise exception 'No autenticado' using errcode = 'insufficient_privilege';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'Reserva no encontrada' using errcode = 'no_data_found';
  end if;
  if v_booking.passenger_id <> v_uid then
    raise exception 'Solo el pasajero puede marcar su pago' using errcode = 'insufficient_privilege';
  end if;

  select * into v_payment from public.payments where booking_id = p_booking_id for update;
  if v_payment.status = 'marked' then
    raise exception 'Ya marcaste este pago; espera la confirmación del conductor' using errcode = 'check_violation';
  end if;
  if v_payment.status = 'confirmed' then
    raise exception 'Este pago ya fue confirmado' using errcode = 'check_violation';
  end if;

  update public.payments
    set status = 'marked', marked_at = now()
  where booking_id = p_booking_id
  returning * into v_payment;

  return v_payment;
end;
$$;

create or replace function public.confirm_payment_received(p_booking_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_booking public.bookings;
  v_trip public.trips;
  v_payment public.payments;
  v_paid_at timestamptz;
  v_on_time boolean;
  v_next_streak int;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = 'insufficient_privilege';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'Reserva no encontrada' using errcode = 'no_data_found';
  end if;
  select * into v_trip from public.trips where id = v_booking.trip_id;
  if v_trip.driver_id <> v_uid and not public.is_admin() then
    raise exception 'Solo el conductor puede confirmar el pago' using errcode = 'insufficient_privilege';
  end if;

  select * into v_payment from public.payments where booking_id = p_booking_id for update;
  if v_payment.status = 'confirmed' then
    raise exception 'Este pago ya estaba confirmado' using errcode = 'check_violation';
  end if;

  v_paid_at := coalesce(v_payment.marked_at, now());
  v_on_time := v_paid_at <= v_payment.due_at;

  update public.payments
    set status = 'confirmed',
        marked_at = coalesce(marked_at, v_paid_at),
        confirmed_at = now()
  where booking_id = p_booking_id
  returning * into v_payment;

  if v_on_time then
    update public.profiles
      set streak_on_time_payments = streak_on_time_payments + 1,
          best_streak_on_time_payments = greatest(best_streak_on_time_payments, streak_on_time_payments + 1),
          reward_points = reward_points + 5
    where id = v_booking.passenger_id
    returning streak_on_time_payments into v_next_streak;

    -- Crédito por pago a tiempo (CREDITS_PER_PAID_TRIP = 25).
    insert into public.credit_transactions (user_id, entry_type, source, amount, description, reference_id)
    values (v_booking.passenger_id, 'abono', 'viaje', 25, 'Pago confirmado a tiempo', p_booking_id::text);

    -- Bono de racha cada 3 pagos a tiempo (STREAK_BONUS_CREDITS = 50, +25 pts).
    if v_next_streak % 3 = 0 then
      update public.profiles set reward_points = reward_points + 25 where id = v_booking.passenger_id;
      insert into public.credit_transactions (user_id, entry_type, source, amount, description)
      values (v_booking.passenger_id, 'abono', 'racha', 50, 'Racha de ' || v_next_streak || ' pagos a tiempo');
    end if;
  else
    update public.profiles set streak_on_time_payments = 0 where id = v_booking.passenger_id;
  end if;

  return v_payment;
end;
$$;

-- ===========================================================================
-- Completar viaje (RPC): marca la reserva y acredita puntos/racha de viajes.
-- ===========================================================================

create or replace function public.complete_booking(p_booking_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_booking public.bookings;
  v_trip public.trips;
  v_next_streak int;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = 'insufficient_privilege';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Reserva no encontrada' using errcode = 'no_data_found';
  end if;
  select * into v_trip from public.trips where id = v_booking.trip_id;
  if v_booking.passenger_id <> v_uid and v_trip.driver_id <> v_uid and not public.is_admin() then
    raise exception 'No autorizado' using errcode = 'insufficient_privilege';
  end if;
  if v_booking.status = 'completed' then
    raise exception 'Este viaje ya fue completado' using errcode = 'check_violation';
  end if;
  if v_booking.status = 'cancelled' then
    raise exception 'No puedes completar un viaje cancelado' using errcode = 'check_violation';
  end if;

  update public.bookings set status = 'completed' where id = p_booking_id returning * into v_booking;

  update public.profiles
    set streak_completed_trips = streak_completed_trips + 1,
        best_streak_completed_trips = greatest(best_streak_completed_trips, streak_completed_trips + 1),
        reward_points = reward_points + 2
  where id = v_booking.passenger_id
  returning streak_completed_trips into v_next_streak;

  if v_next_streak % 5 = 0 then
    update public.profiles set reward_points = reward_points + 20 where id = v_booking.passenger_id;
  end if;

  return v_booking;
end;
$$;

-- ===========================================================================
-- Expirar pagos vencidos a las 48 h y emitir strikes (3 → baneo 2 días).
-- Fuente de verdad del servidor: la llama pg_cron y la Edge Function.
-- Porta expireOverduePayments + registerPaymentStrike.
-- ===========================================================================

create or replace function public.expire_overdue_payments()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec record;
  v_count int := 0;
  v_next int;
begin
  for v_rec in
    select pay.id as payment_id, b.id as booking_id, b.passenger_id
    from public.payments pay
    join public.bookings b on b.id = pay.booking_id
    where pay.status = 'pending'
      and pay.due_at < now()
      and b.status <> 'cancelled'
    for update of pay
  loop
    update public.payments set status = 'overdue' where id = v_rec.payment_id;

    insert into public.strikes (user_id, booking_id, kind, occurred_at)
    values (v_rec.passenger_id, v_rec.booking_id, 'payment', now());

    -- Suma strike; al 3.º banea 2 días y reinicia el contador.
    update public.profiles
      set payment_strikes_count = payment_strikes_count + 1,
          last_payment_strike_at = now(),
          streak_on_time_payments = 0
    where id = v_rec.passenger_id
    returning payment_strikes_count into v_next;

    if v_next >= 3 then
      update public.profiles
        set payment_strikes_count = 0,
            payment_ban_until = now() + interval '2 days'
      where id = v_rec.passenger_id;
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ===========================================================================
-- Canjes (RPC): validar saldo, crear redemption y cargar créditos.
-- Porta redeemItem. El código sigue el formato UT-XXXX-XXXX.
-- ===========================================================================

create or replace function public.gen_redemption_code()
returns text
language sql
volatile
as $$
  select 'UT-'
    || (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (floor(random() * 32) + 1)::int, 1), '')
        from generate_series(1, 4))
    || '-'
    || (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (floor(random() * 32) + 1)::int, 1), '')
        from generate_series(1, 4));
$$;

create or replace function public.redeem_item(p_item_id text)
returns public.redemptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_item public.redeemables;
  v_redemption public.redemptions;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = 'insufficient_privilege';
  end if;

  -- Serializa los canjes del mismo usuario: sin esto, dos canjes concurrentes
  -- pasarían ambos la validación de saldo (doble gasto).
  perform pg_advisory_xact_lock(hashtext('redeem:' || v_uid::text));

  -- FOR UPDATE: el control de stock también debe ser serializado.
  select * into v_item from public.redeemables where id = p_item_id and active for update;
  if not found then
    raise exception 'Canje no disponible' using errcode = 'no_data_found';
  end if;
  if v_item.stock is not null and v_item.stock <= 0 then
    raise exception 'Este canje está agotado' using errcode = 'check_violation';
  end if;
  if public.credit_balance(v_uid) < v_item.cost_credits then
    raise exception 'No tienes créditos suficientes para este canje' using errcode = 'check_violation';
  end if;

  if v_item.stock is not null then
    update public.redeemables set stock = stock - 1 where id = v_item.id;
  end if;

  insert into public.redemptions (user_id, item_id, title, cost_credits, code, status, expires_at)
  values (
    v_uid, v_item.id, v_item.title, v_item.cost_credits, public.gen_redemption_code(),
    'disponible', now() + (v_item.validity_days || ' days')::interval
  )
  returning * into v_redemption;

  insert into public.credit_transactions (user_id, entry_type, source, amount, description, reference_id)
  values (v_uid, 'cargo', 'canje', v_item.cost_credits, 'Canje: ' || v_item.title, v_redemption.id::text);

  return v_redemption;
end;
$$;

-- ===========================================================================
-- Permisos de ejecución. Postgres concede EXECUTE a PUBLIC por defecto en cada
-- función nueva, así que primero se revoca TODO y luego se concede lo mínimo:
-- los RPC de cliente solo a `authenticated` (nunca a `anon`).
-- ===========================================================================

revoke execute on function public.reserve_seat(uuid)               from public, anon;
revoke execute on function public.cancel_booking(uuid)             from public, anon;
revoke execute on function public.mark_payment_sent(uuid)          from public, anon;
revoke execute on function public.confirm_payment_received(uuid)   from public, anon;
revoke execute on function public.complete_booking(uuid)           from public, anon;
revoke execute on function public.redeem_item(text)                from public, anon;
revoke execute on function public.credit_balance(uuid)             from public, anon;
revoke execute on function public.get_driver_bank_details(uuid)    from public, anon;
revoke execute on function public.gen_redemption_code()            from public, anon, authenticated;
revoke execute on function public.handle_new_user()                from public, anon, authenticated;
revoke execute on function public.enforce_university_email()       from public, anon, authenticated;
revoke execute on function public.recompute_rating_avg()           from public, anon, authenticated;
revoke execute on function public.set_updated_at()                 from public, anon, authenticated;

grant execute on function public.reserve_seat(uuid) to authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;
grant execute on function public.mark_payment_sent(uuid) to authenticated;
grant execute on function public.confirm_payment_received(uuid) to authenticated;
grant execute on function public.complete_booking(uuid) to authenticated;
grant execute on function public.redeem_item(text) to authenticated;
grant execute on function public.credit_balance(uuid) to authenticated;
grant execute on function public.get_driver_bank_details(uuid) to authenticated;
-- is_admin / is_university_email se usan dentro de políticas RLS y triggers,
-- así que deben poder ejecutarlas los roles de cliente.
grant execute on function public.is_admin() to authenticated, anon;
grant execute on function public.is_university_email(text) to authenticated, anon;
-- expire_overdue_payments NO se concede a clientes: solo cron / service_role.
revoke execute on function public.expire_overdue_payments() from public, anon, authenticated;

-- ###################################################################
-- ## 20260701000002_rls.sql
-- ###################################################################
-- Uturn — Sesión 3: Row Level Security.
-- Sigue el bosquejo de docs/backend.md. Regla clave: payments, strikes y
-- credit_transactions NO tienen políticas de escritura para clientes — solo se
-- modifican vía funciones de servidor (security definer). Reservar/cancelar y
-- confirmar pagos pasan por RPC; el cliente nunca inserta esas filas directo.

alter table public.profiles            enable row level security;
alter table public.bank_details        enable row level security;
alter table public.vehicles            enable row level security;
alter table public.trips               enable row level security;
alter table public.bookings            enable row level security;
alter table public.payments            enable row level security;
alter table public.ratings             enable row level security;
alter table public.penalties           enable row level security;
alter table public.strikes             enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.redeemables         enable row level security;
alter table public.redemptions         enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
-- Lectura para autenticados (perfil visible: nombre, rating, avatar…). La
-- protección de columnas server-managed (`account_role`, contadores) la hace el
-- trigger de abajo, ya que RLS es a nivel de fila. Los datos bancarios viven en
-- la tabla aparte `bank_details` (solo-dueño + RPC get_driver_bank_details).
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id or public.is_admin())
  with check ((select auth.uid()) = id or public.is_admin());

-- Evita que un usuario se auto-asigne roles o toque contadores server-managed.
-- IMPORTANTE: es SECURITY INVOKER a propósito, para que `current_user` refleje
-- el rol que ejecuta el UPDATE. Las funciones de servidor (security definer,
-- propiedad de un rol privilegiado) corren con current_user = owner y quedan
-- exentas; un cliente corre como 'authenticated'/'anon' y sí se sanea. Los
-- admins/owner pueden gestionar roles y perfiles.
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Contexto de servidor (RPC/trigger definer): confía en el cambio.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if public.is_admin() then
    return new;  -- admin/owner pueden gestionar roles y perfiles
  end if;
  -- Un usuario normal no puede modificar estas columnas de su propio perfil.
  new.email                       := old.email;  -- identidad: debe calzar con auth.users
  new.account_role                := old.account_role;
  new.rating_avg                  := old.rating_avg;
  new.reward_points               := old.reward_points;
  new.streak_on_time_payments     := old.streak_on_time_payments;
  new.best_streak_on_time_payments:= old.best_streak_on_time_payments;
  new.streak_completed_trips      := old.streak_completed_trips;
  new.best_streak_completed_trips := old.best_streak_completed_trips;
  new.late_cancellations_count    := old.late_cancellations_count;
  new.last_late_cancellation_at   := old.last_late_cancellation_at;
  new.block_until                 := old.block_until;
  new.payment_strikes_count       := old.payment_strikes_count;
  new.last_payment_strike_at      := old.last_payment_strike_at;
  new.payment_ban_until           := old.payment_ban_until;
  return new;
end;
$$;

revoke execute on function public.protect_profile_columns() from public, anon, authenticated;

drop trigger if exists profiles_protect_columns on public.profiles;
create trigger profiles_protect_columns before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- ---------------------------------------------------------------------------
-- bank_details — solo el dueño; los pasajeros con reserva los obtienen vía
-- RPC get_driver_bank_details (security definer).
-- ---------------------------------------------------------------------------
drop policy if exists bank_details_select_own on public.bank_details;
create policy bank_details_select_own on public.bank_details
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists bank_details_insert_own on public.bank_details;
create policy bank_details_insert_own on public.bank_details
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists bank_details_update_own on public.bank_details;
create policy bank_details_update_own on public.bank_details
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists bank_details_delete_own on public.bank_details;
create policy bank_details_delete_own on public.bank_details
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- vehicles — lectura para autenticados (los pasajeros identifican el auto);
-- escritura solo del dueño.
-- ---------------------------------------------------------------------------
drop policy if exists vehicles_select on public.vehicles;
create policy vehicles_select on public.vehicles
  for select to authenticated using (true);

drop policy if exists vehicles_all_own on public.vehicles;
drop policy if exists vehicles_insert_own on public.vehicles;
create policy vehicles_insert_own on public.vehicles
  for insert to authenticated with check (owner_id = (select auth.uid()));

drop policy if exists vehicles_update_own on public.vehicles;
create policy vehicles_update_own on public.vehicles
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists vehicles_delete_own on public.vehicles;
create policy vehicles_delete_own on public.vehicles
  for delete to authenticated using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- trips — lectura autenticada; insert/update/delete del conductor (o admin)
-- ---------------------------------------------------------------------------
drop policy if exists trips_select on public.trips;
create policy trips_select on public.trips
  for select to authenticated using (true);

drop policy if exists trips_insert_driver on public.trips;
create policy trips_insert_driver on public.trips
  for insert to authenticated with check (driver_id = (select auth.uid()));

drop policy if exists trips_update_driver on public.trips;
create policy trips_update_driver on public.trips
  for update to authenticated
  using (driver_id = (select auth.uid()) or public.is_admin())
  with check (driver_id = (select auth.uid()) or public.is_admin());

drop policy if exists trips_delete_driver on public.trips;
create policy trips_delete_driver on public.trips
  for delete to authenticated using (driver_id = (select auth.uid()) or public.is_admin());

-- ---------------------------------------------------------------------------
-- bookings — el pasajero y el conductor del viaje ven; escritura solo vía RPC
-- ---------------------------------------------------------------------------
drop policy if exists bookings_select on public.bookings;
create policy bookings_select on public.bookings
  for select to authenticated using (
    passenger_id = (select auth.uid())
    or exists (select 1 from public.trips t where t.id = trip_id and t.driver_id = (select auth.uid()))
    or public.is_admin()
  );
-- Sin políticas de insert/update/delete: reserve_seat / cancel_booking /
-- complete_booking (security definer) son la única vía de escritura.

-- ---------------------------------------------------------------------------
-- payments — visibles para pasajero y conductor; escritura solo servidor
-- ---------------------------------------------------------------------------
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments
  for select to authenticated using (
    exists (
      select 1 from public.bookings b
      join public.trips t on t.id = b.trip_id
      where b.id = booking_id
        and (b.passenger_id = (select auth.uid()) or t.driver_id = (select auth.uid()) or public.is_admin())
    )
  );
-- Sin insert/update/delete: solo funciones de servidor.

-- ---------------------------------------------------------------------------
-- ratings — lectura autenticada; cada quien inserta sus propias calificaciones
-- ---------------------------------------------------------------------------
drop policy if exists ratings_select on public.ratings;
create policy ratings_select on public.ratings
  for select to authenticated using (true);

drop policy if exists ratings_insert_own on public.ratings;
create policy ratings_insert_own on public.ratings
  for insert to authenticated with check (from_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- penalties / strikes — lectura del propio usuario; escritura solo servidor
-- ---------------------------------------------------------------------------
drop policy if exists penalties_select_own on public.penalties;
create policy penalties_select_own on public.penalties
  for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());

drop policy if exists strikes_select_own on public.strikes;
create policy strikes_select_own on public.strikes
  for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());

-- ---------------------------------------------------------------------------
-- credit_transactions — lectura del propio usuario; escritura solo servidor
-- ---------------------------------------------------------------------------
drop policy if exists credit_tx_select_own on public.credit_transactions;
create policy credit_tx_select_own on public.credit_transactions
  for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());

-- ---------------------------------------------------------------------------
-- redeemables — catálogo público para autenticados; escritura admin (Sesión 4)
-- ---------------------------------------------------------------------------
drop policy if exists redeemables_select on public.redeemables;
create policy redeemables_select on public.redeemables
  for select to authenticated using (true);

drop policy if exists redeemables_write_admin on public.redeemables;
create policy redeemables_write_admin on public.redeemables
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- redemptions — el usuario ve las suyas; crear vía RPC. Marcar usado sí directo.
-- ---------------------------------------------------------------------------
drop policy if exists redemptions_select_own on public.redemptions;
create policy redemptions_select_own on public.redemptions
  for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());

-- Permite marcar un canje propio como usado (status -> 'canjeado'); la creación
-- pasa por redeem_item (security definer) porque también carga créditos.
drop policy if exists redemptions_update_own on public.redemptions;
create policy redemptions_update_own on public.redemptions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- La política anterior deja actualizar la fila completa; este trigger acota lo
-- que un CLIENTE puede tocar a la única transición legítima:
-- disponible → canjeado (fijando redeemed_at), y solo si el canje no expiró.
create or replace function public.protect_redemption_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Contexto de servidor (funciones definer, service_role): confía en el cambio.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.id <> old.id
     or new.user_id <> old.user_id
     or new.item_id is distinct from old.item_id
     or new.title <> old.title
     or new.cost_credits <> old.cost_credits
     or new.code <> old.code
     or new.created_at <> old.created_at
     or new.expires_at <> old.expires_at then
    raise exception 'Solo puedes marcar el canje como usado' using errcode = 'check_violation';
  end if;
  if new.status = old.status and new.redeemed_at is not distinct from old.redeemed_at then
    return new;  -- no-op
  end if;
  if old.status <> 'disponible' or new.status <> 'canjeado' then
    raise exception 'Transición de canje no permitida' using errcode = 'check_violation';
  end if;
  if old.expires_at < now() then
    raise exception 'Este canje ya expiró' using errcode = 'check_violation';
  end if;
  new.redeemed_at := coalesce(new.redeemed_at, now());
  return new;
end;
$$;

revoke execute on function public.protect_redemption_columns() from public, anon, authenticated;

drop trigger if exists redemptions_protect_columns on public.redemptions;
create trigger redemptions_protect_columns before update on public.redemptions
  for each row execute function public.protect_redemption_columns();

-- ###################################################################
-- ## 20260701000003_storage.sql
-- ###################################################################
-- Uturn — Sesión 3: Storage.
-- Dos buckets privados; el acceso siempre por URL firmada (createSignedUrl).
-- Convención de rutas: `<uid>/<archivo>` — la primera carpeta es el id del dueño.
--   avatars/<uid>/avatar.jpg
--   credentials/<uid>/intranet.jpg

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('credentials', 'credentials', false)
on conflict (id) do nothing;

-- --- avatars ---------------------------------------------------------------
-- Cualquier autenticado puede ver avatares (fotos de conductores/pasajeros),
-- pero solo el dueño escribe en su carpeta.
drop policy if exists avatars_select on storage.objects;
create policy avatars_select on storage.objects
  for select to authenticated using (bucket_id = 'avatars');

drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own on storage.objects
  for insert to authenticated with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects
  for delete to authenticated using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- --- credentials -----------------------------------------------------------
-- Privado de verdad: solo el dueño (y admin/owner para moderar) puede leer las
-- capturas de credencial universitaria.
drop policy if exists credentials_select_own on storage.objects;
create policy credentials_select_own on storage.objects
  for select to authenticated using (
    bucket_id = 'credentials'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin())
  );

drop policy if exists credentials_insert_own on storage.objects;
create policy credentials_insert_own on storage.objects
  for insert to authenticated with check (
    bucket_id = 'credentials' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists credentials_update_own on storage.objects;
create policy credentials_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'credentials' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'credentials' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists credentials_delete_own on storage.objects;
create policy credentials_delete_own on storage.objects
  for delete to authenticated using (
    bucket_id = 'credentials' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ###################################################################
-- ## 20260701000004_cron_seed.sql
-- ###################################################################
-- Uturn — Sesión 3: pg_cron (expiración de pagos server-side) + seed del catálogo.

-- ===========================================================================
-- pg_cron: expira pagos vencidos y emite strikes cada 15 minutos, sin que
-- nadie abra la app. Si tu proyecto usa la Edge Function `expire-payments`
-- en su lugar, puedes omitir este bloque (o dejar ambos: son idempotentes).
-- ===========================================================================
create extension if not exists pg_cron with schema extensions;

-- Reprograma de forma idempotente.
do $$
begin
  perform cron.unschedule('expire-overdue-payments')
  where exists (select 1 from cron.job where jobname = 'expire-overdue-payments');
exception when others then
  null;  -- pg_cron no disponible en algunos entornos locales; se ignora.
end;
$$;

do $$
begin
  perform cron.schedule(
    'expire-overdue-payments',
    '*/15 * * * *',
    $cron$ select public.expire_overdue_payments(); $cron$
  );
exception when others then
  raise notice 'pg_cron no disponible; programa expire_overdue_payments por Edge Function/scheduler externo.';
end;
$$;

-- ===========================================================================
-- Seed del catálogo de canjes (constants/mock-uturn.ts REDEEMABLE_ITEMS).
-- En la Sesión 4 lo publican los admins; aquí se siembra para el piloto.
-- ===========================================================================
insert into public.redeemables (id, title, description, category, cost_credits, sponsor, stock, validity_days, published_by_admin, active)
values
  ('redeem-cafe',            'Café gratis en Cafetería Central',       'Un café de especialidad a elección en la cafetería del campus.', 'comida',    80,  'Cafetería Central', 20, 7,  true, true),
  ('redeem-snack',           'Snack + bebida',                          'Combo de snack y bebida en los kioscos adheridos.',              'comida',    40,  null,                50, 5,  true, true),
  ('redeem-bencina',         'Descuento $3.000 en bencina',             'Descuento directo para conductores en estaciones adheridas.',    'servicios', 120, 'Copec',             null, 14, true, true),
  ('redeem-evento',          'Entrada Fiesta Mechona',                  'Una entrada general para la fiesta de bienvenida del semestre.', 'eventos',   150, null,                10, 3,  true, true),
  ('redeem-polera',          'Polera Uturn edición limitada',           'Merch oficial Uturn, retiro en punto de encuentro del campus.',  'merch',     250, null,                15, 30, true, true),
  ('redeem-estacionamiento', 'Semana de estacionamiento preferente',    'Estacionamiento reservado cerca del punto de encuentro por una semana.', 'servicios', 100, null,        null, 7,  true, true)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  cost_credits = excluded.cost_credits,
  sponsor = excluded.sponsor,
  stock = excluded.stock,
  validity_days = excluded.validity_days,
  published_by_admin = excluded.published_by_admin,
  active = excluded.active;

-- ===========================================================================
-- Rebranding Uturn → Unities (espejo de migrations/20260704000000_rebrand_unities.sql).
-- Corrige los textos del seed anterior; idempotente.
-- ===========================================================================
update public.redeemables
set title       = replace(replace(title, 'UTURN', 'UNITIES'), 'Uturn', 'Unities'),
    description = replace(replace(description, 'UTURN', 'UNITIES'), 'Uturn', 'Unities')
where title ilike '%uturn%' or description ilike '%uturn%';


-- ###################################################################
-- ## 20260704120000_feed_schema.sql
-- ###################################################################
-- Unities — Sesión 4: esquema del feed social (Inicio).
-- Tablas: publishers (entidades que publican), posts (noticia/evento/
-- activacion/descuento), stories (expiran a 24 h server-side) e interacciones
-- post_likes/post_reposts/post_replies con constraints de unicidad.
-- Convención de la Sesión 3: snake_case, uuid, timestamptz created_at/updated_at.

-- ---------------------------------------------------------------------------
-- publishers — federaciones, departamentos, centros de alumnos, la propia
-- universidad y marcas auspiciadoras. Los alumnos no publican en el feed:
-- publican estas entidades a través de cuentas admin/owner (y tutor).
-- `slug` es el identificador estable para seed y deep links.
-- ---------------------------------------------------------------------------
create table if not exists public.publishers (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,
  kind          text not null
                  check (kind in ('federacion', 'departamento', 'centro_alumnos', 'universidad', 'marca')),
  university_id text,          -- catálogo constants/campuses.ts ('uai', 'udd', …)
  avatar_url    text,          -- ruta en el bucket feed-media o URL http(s)
  description   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- posts — publicación del feed. `media` es un arreglo jsonb de strings: rutas
-- dentro del bucket feed-media (se firman al leer) o URLs http(s) directas.
-- Un post con varias imágenes es un "carrete" (la tarjeta muestra galería).
-- Los contadores like/repost/reply se denormalizan aquí y los mantienen
-- triggers (misma técnica que los contadores de profiles en la Sesión 3).
-- `redeemable_id` enlaza descuentos con el catálogo de canjes de la Sesión 2.
-- ---------------------------------------------------------------------------
create table if not exists public.posts (
  id              uuid primary key default gen_random_uuid(),
  publisher_id    uuid not null references public.publishers (id) on delete cascade,
  author_id       uuid references public.profiles (id) on delete set null,
  post_type       text not null default 'noticia'
                    check (post_type in ('noticia', 'evento', 'activacion', 'descuento')),
  body            text not null default '',
  media           jsonb not null default '[]'::jsonb,
  event_starts_at timestamptz,  -- obligatorio para evento; opcional para activacion
  event_location  text,
  discount_code   text,
  discount_terms  text,
  redeemable_id   text references public.redeemables (id) on delete set null,
  like_count      integer not null default 0 check (like_count >= 0),
  repost_count    integer not null default 0 check (repost_count >= 0),
  reply_count     integer not null default 0 check (reply_count >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (post_type <> 'evento' or event_starts_at is not null)
);

-- Cursor keyset del feed: orden estable (created_at, id) descendente.
create index if not exists posts_feed_cursor_idx on public.posts (created_at desc, id desc);
-- Widget "Eventos de la semana": posts tipo evento por fecha del evento.
create index if not exists posts_event_week_idx on public.posts (event_starts_at)
  where post_type = 'evento';
create index if not exists posts_publisher_idx on public.posts (publisher_id);

-- ---------------------------------------------------------------------------
-- stories — historias de 24 h. La expiración la aplica el servidor: la
-- política RLS de lectura exige expires_at > now() (nadie ve historias
-- vencidas aunque el cliente mienta) y pg_cron purga las filas vencidas.
-- ---------------------------------------------------------------------------
create table if not exists public.stories (
  id           uuid primary key default gen_random_uuid(),
  publisher_id uuid not null references public.publishers (id) on delete cascade,
  author_id    uuid references public.profiles (id) on delete set null,
  media_path   text not null,   -- ruta en feed-media o URL http(s)
  caption      text,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '24 hours'
);

create index if not exists stories_active_idx on public.stories (expires_at desc);
create index if not exists stories_publisher_idx on public.stories (publisher_id);

-- ---------------------------------------------------------------------------
-- Interacciones — una por usuario por post (PK/unique compuesta).
-- ---------------------------------------------------------------------------
create table if not exists public.post_likes (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists post_likes_user_idx on public.post_likes (user_id);

create table if not exists public.post_reposts (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists post_reposts_user_idx on public.post_reposts (user_id);

-- Respuestas: hilo simple bajo el post. Única por (post, usuario) según la
-- definición de la Sesión 4 ("interacciones una por usuario").
create table if not exists public.post_replies (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create index if not exists post_replies_post_idx on public.post_replies (post_id, created_at);
create index if not exists post_replies_user_idx on public.post_replies (user_id);


-- ###################################################################
-- ## 20260704120001_feed_functions_rls.sql
-- ###################################################################
-- Unities — Sesión 4: funciones, triggers y RLS del feed.
-- Regla clave (igual que en la Sesión 3): el enforcement de quién publica es
-- la política RLS sobre el rol en profiles, no el cliente. Los contadores de
-- posts solo los mueven triggers (security definer); no hay política de
-- UPDATE de posts para usuarios normales.

-- ===========================================================================
-- Helpers de autorización
-- ===========================================================================

-- Publican contenidos: tutor, admin y owner (docs/sesiones/04-inicio-feed.md).
-- security definer para leer profiles saltando RLS, como public.is_admin().
create or replace function public.can_publish()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and account_role in ('tutor', 'admin', 'owner')
  );
$$;

-- Se evalúa dentro de políticas RLS; mismos grants que is_admin.
grant execute on function public.can_publish() to authenticated, anon;

-- ===========================================================================
-- Triggers
-- ===========================================================================

drop trigger if exists publishers_set_updated_at on public.publishers;
create trigger publishers_set_updated_at before update on public.publishers
  for each row execute function public.set_updated_at();

drop trigger if exists posts_set_updated_at on public.posts;
create trigger posts_set_updated_at before update on public.posts
  for each row execute function public.set_updated_at();

-- Contadores denormalizados de posts. SECURITY DEFINER a propósito: quien da
-- like es un usuario normal sin política de UPDATE sobre posts; el trigger
-- corre con privilegios del owner para poder mover el contador (y solo eso).
create or replace function public.bump_post_counters()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post  uuid;
  v_delta integer;
begin
  if tg_op = 'INSERT' then
    v_post := new.post_id; v_delta := 1;
  else
    v_post := old.post_id; v_delta := -1;
  end if;
  if tg_table_name = 'post_likes' then
    update public.posts set like_count = greatest(like_count + v_delta, 0) where id = v_post;
  elsif tg_table_name = 'post_reposts' then
    update public.posts set repost_count = greatest(repost_count + v_delta, 0) where id = v_post;
  elsif tg_table_name = 'post_replies' then
    update public.posts set reply_count = greatest(reply_count + v_delta, 0) where id = v_post;
  end if;
  return null;  -- after trigger
end;
$$;

revoke execute on function public.bump_post_counters() from public, anon, authenticated;

drop trigger if exists post_likes_bump_counters on public.post_likes;
create trigger post_likes_bump_counters after insert or delete on public.post_likes
  for each row execute function public.bump_post_counters();

drop trigger if exists post_reposts_bump_counters on public.post_reposts;
create trigger post_reposts_bump_counters after insert or delete on public.post_reposts
  for each row execute function public.bump_post_counters();

drop trigger if exists post_replies_bump_counters on public.post_replies;
create trigger post_replies_bump_counters after insert or delete on public.post_replies
  for each row execute function public.bump_post_counters();

-- ===========================================================================
-- Expiración de historias (24 h) server-side
-- La RLS de lectura (expires_at > now()) las oculta al instante; este purge
-- borra las filas vencidas. Mismo patrón pg_cron que expire_overdue_payments.
-- ===========================================================================

create or replace function public.purge_expired_stories()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  delete from public.stories where expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.purge_expired_stories() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('purge-expired-stories')
  where exists (select 1 from cron.job where jobname = 'purge-expired-stories');
exception when others then
  null;  -- pg_cron no disponible en algunos entornos locales; se ignora.
end;
$$;

do $$
begin
  perform cron.schedule(
    'purge-expired-stories',
    '13 * * * *',
    $cron$ select public.purge_expired_stories(); $cron$
  );
exception when others then
  raise notice 'pg_cron no disponible; programa purge_expired_stories por scheduler externo.';
end;
$$;

-- ===========================================================================
-- Row Level Security
-- ===========================================================================

alter table public.publishers   enable row level security;
alter table public.posts        enable row level security;
alter table public.stories      enable row level security;
alter table public.post_likes   enable row level security;
alter table public.post_reposts enable row level security;
alter table public.post_replies enable row level security;

-- --- publishers: catálogo visible; solo admin/owner lo administra ----------
drop policy if exists publishers_select on public.publishers;
create policy publishers_select on public.publishers
  for select to authenticated using (true);

drop policy if exists publishers_write_admin on public.publishers;
create policy publishers_write_admin on public.publishers
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- --- posts: leen autenticados; publican solo roles con can_publish() -------
drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts
  for select to authenticated using (true);

drop policy if exists posts_insert_publisher on public.posts;
create policy posts_insert_publisher on public.posts
  for insert to authenticated
  with check (public.can_publish() and author_id = (select auth.uid()));

drop policy if exists posts_update_own on public.posts;
create policy posts_update_own on public.posts
  for update to authenticated
  using (public.is_admin() or (public.can_publish() and author_id = (select auth.uid())))
  with check (public.is_admin() or (public.can_publish() and author_id = (select auth.uid())));

drop policy if exists posts_delete_own on public.posts;
create policy posts_delete_own on public.posts
  for delete to authenticated
  using (public.is_admin() or (public.can_publish() and author_id = (select auth.uid())));

-- --- stories: la lectura exige que no hayan expirado (server-side) ---------
drop policy if exists stories_select_active on public.stories;
create policy stories_select_active on public.stories
  for select to authenticated using (expires_at > now());

drop policy if exists stories_insert_publisher on public.stories;
create policy stories_insert_publisher on public.stories
  for insert to authenticated
  with check (public.can_publish() and author_id = (select auth.uid()));

drop policy if exists stories_delete_own on public.stories;
create policy stories_delete_own on public.stories
  for delete to authenticated
  using (public.is_admin() or (public.can_publish() and author_id = (select auth.uid())));

-- --- interacciones: cualquiera autenticado, solo a nombre propio -----------
drop policy if exists post_likes_select on public.post_likes;
create policy post_likes_select on public.post_likes
  for select to authenticated using (true);

drop policy if exists post_likes_insert_own on public.post_likes;
create policy post_likes_insert_own on public.post_likes
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists post_likes_delete_own on public.post_likes;
create policy post_likes_delete_own on public.post_likes
  for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists post_reposts_select on public.post_reposts;
create policy post_reposts_select on public.post_reposts
  for select to authenticated using (true);

drop policy if exists post_reposts_insert_own on public.post_reposts;
create policy post_reposts_insert_own on public.post_reposts
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists post_reposts_delete_own on public.post_reposts;
create policy post_reposts_delete_own on public.post_reposts
  for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists post_replies_select on public.post_replies;
create policy post_replies_select on public.post_replies
  for select to authenticated using (true);

drop policy if exists post_replies_insert_own on public.post_replies;
create policy post_replies_insert_own on public.post_replies
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists post_replies_delete_own on public.post_replies;
create policy post_replies_delete_own on public.post_replies
  for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- ===========================================================================
-- Realtime: agrega las tablas a la publicación supabase_realtime.
-- La publicación existía vacía, así que las suscripciones postgres_changes de
-- la Sesión 3 (trips/bookings/payments/credit_transactions) nunca emitieron
-- eventos; se agregan aquí junto con las del feed. RLS sigue aplicando a lo
-- que cada cliente recibe.
-- ===========================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'posts', 'stories',
    'trips', 'bookings', 'payments', 'credit_transactions'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
exception when undefined_object then
  raise notice 'La publicación supabase_realtime no existe; créala desde el dashboard.';
end;
$$;


-- ###################################################################
-- ## 20260704120002_feed_storage_seed.sql
-- ###################################################################
-- Unities — Sesión 4: bucket feed-media + seed del feed.
-- Bucket privado (URL firmada al leer, como avatars/credentials). Solo los
-- roles que publican (can_publish) escriben, en su carpeta `<uid>/…`.

insert into storage.buckets (id, name, public)
values ('feed-media', 'feed-media', false)
on conflict (id) do nothing;

drop policy if exists feed_media_select on storage.objects;
create policy feed_media_select on storage.objects
  for select to authenticated using (bucket_id = 'feed-media');

drop policy if exists feed_media_insert_publisher on storage.objects;
create policy feed_media_insert_publisher on storage.objects
  for insert to authenticated with check (
    bucket_id = 'feed-media'
    and public.can_publish()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- El upsert de Storage necesita INSERT + SELECT + UPDATE (checklist Supabase).
drop policy if exists feed_media_update_publisher on storage.objects;
create policy feed_media_update_publisher on storage.objects
  for update to authenticated
  using (
    bucket_id = 'feed-media'
    and public.can_publish()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'feed-media'
    and public.can_publish()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists feed_media_delete_publisher on storage.objects;
create policy feed_media_delete_publisher on storage.objects
  for delete to authenticated using (
    bucket_id = 'feed-media'
    and (
      public.is_admin()
      or (public.can_publish() and (storage.foldername(name))[1] = (select auth.uid())::text)
    )
  );

-- ===========================================================================
-- Seed: entidades publicadoras reales de la UAI + contenido de demo.
-- ids fijos para que el seed sea idempotente. La media del seed usa URLs
-- http(s) (picsum) que la app muestra tal cual; el contenido real subirá
-- rutas del bucket feed-media. Las fechas de eventos son relativas a now()
-- para que el widget semanal siempre tenga datos al aplicar el seed.
-- ===========================================================================

insert into public.publishers (id, slug, name, kind, university_id, description)
values
  ('c04f0001-0000-4000-8000-000000000001', 'feuai',          'FEUAI',                             'federacion',     'uai', 'Federación de Estudiantes de la Universidad Adolfo Ibáñez.'),
  ('c04f0001-0000-4000-8000-000000000002', 'uai',            'Universidad Adolfo Ibáñez',         'universidad',    'uai', 'Cuenta oficial de la UAI.'),
  ('c04f0001-0000-4000-8000-000000000003', 'dae-uai',        'DAE UAI',                           'departamento',   'uai', 'Dirección de Asuntos Estudiantiles.'),
  ('c04f0001-0000-4000-8000-000000000004', 'deportes-uai',   'Deportes UAI',                      'departamento',   'uai', 'Selecciones, talleres y vida deportiva del campus.'),
  ('c04f0001-0000-4000-8000-000000000005', 'cai-ingenieria', 'CAI — Centro de Alumnos Ingeniería','centro_alumnos', 'uai', 'Centro de alumnos de la Facultad de Ingeniería y Ciencias.'),
  ('c04f0001-0000-4000-8000-000000000006', 'ca-derecho',     'CADe — Centro de Alumnos Derecho',  'centro_alumnos', 'uai', 'Centro de alumnos de la Facultad de Derecho.'),
  ('c04f0001-0000-4000-8000-000000000007', 'ca-negocios',    'CAN — Centro de Alumnos Negocios',  'centro_alumnos', 'uai', 'Centro de alumnos de la Escuela de Negocios.'),
  ('c04f0001-0000-4000-8000-000000000008', 'ca-psicologia',  'CAPs — Centro de Alumnos Psicología','centro_alumnos','uai', 'Centro de alumnos de la Escuela de Psicología.'),
  ('c04f0001-0000-4000-8000-000000000009', 'ca-diseno',      'CAD — Centro de Alumnos Diseño',    'centro_alumnos', 'uai', 'Centro de alumnos de Design Lab.'),
  ('c04f0001-0000-4000-8000-00000000000a', 'cafeteria-central', 'Cafetería Central',              'marca',          'uai', 'Café de especialidad en el campus. Auspiciador Unities.'),
  ('c04f0001-0000-4000-8000-00000000000b', 'copec',          'Copec',                             'marca',          null,  'Beneficios en bencina para conductores Unities.')
on conflict (slug) do update set
  name          = excluded.name,
  kind          = excluded.kind,
  university_id = excluded.university_id,
  description   = excluded.description;

insert into public.posts
  (id, publisher_id, post_type, body, media, event_starts_at, event_location, discount_code, discount_terms, redeemable_id, created_at)
values
  -- Noticia simple (FEUAI)
  ('d04f0002-0000-4000-8000-000000000001', 'c04f0001-0000-4000-8000-000000000001', 'noticia',
   '¡Partió el semestre! 📚 Revisa los horarios de atención de la FEUAI en la oficina del piso 2 del edificio C. Te esperamos con café.',
   '[]'::jsonb, null, null, null, null, null, now() - interval '6 hours'),

  -- Evento dentro de la semana (FEUAI) enlazado a un canjeable de la Sesión 2
  ('d04f0002-0000-4000-8000-000000000002', 'c04f0001-0000-4000-8000-000000000001', 'evento',
   'Fiesta Mechona 2026 🎉 La bienvenida oficial del semestre. Entradas limitadas: canjea la tuya con créditos Unities o cómprala en la puerta.',
   '["https://picsum.photos/seed/unities-mechona/900/600"]'::jsonb,
   now() + interval '3 days', 'Quincho Campus Peñalolén', null, null, 'redeem-evento', now() - interval '1 day'),

  -- Evento deportivo dentro de la semana (Deportes UAI)
  ('d04f0002-0000-4000-8000-000000000003', 'c04f0001-0000-4000-8000-000000000004', 'evento',
   'Corrida UAI 5K 🏃 Inscríbete gratis y corre por el parque del campus. Hidratación y frutas para todos los que lleguen a la meta.',
   '["https://picsum.photos/seed/unities-corrida/900/600"]'::jsonb,
   now() + interval '5 days', 'Entrada principal Campus Peñalolén', null, null, null, now() - interval '20 hours'),

  -- Carrete (galería de varias imágenes, CAI)
  ('d04f0002-0000-4000-8000-000000000004', 'c04f0001-0000-4000-8000-000000000005', 'noticia',
   'Así se vivió el Torneo de Programación de Ingeniería 💻 ¡Gracias a todos los equipos! Los resultados completos en nuestra bio.',
   '["https://picsum.photos/seed/unities-hack1/900/600","https://picsum.photos/seed/unities-hack2/900/600","https://picsum.photos/seed/unities-hack3/900/600"]'::jsonb,
   null, null, null, null, null, now() - interval '2 days'),

  -- Activación de marca (Cafetería Central)
  ('d04f0002-0000-4000-8000-000000000005', 'c04f0001-0000-4000-8000-00000000000a', 'activacion',
   'Mañana estaremos en el hall central con degustación gratis de cold brew ☕ Pasa después de clases y llévate un descuento sorpresa.',
   '["https://picsum.photos/seed/unities-cafe/900/600"]'::jsonb,
   now() + interval '1 day', 'Hall central, Campus Peñalolén', null, null, null, now() - interval '10 hours'),

  -- Descuento con código (Cafetería Central → canjeable de café)
  ('d04f0002-0000-4000-8000-000000000006', 'c04f0001-0000-4000-8000-00000000000a', 'descuento',
   '20% de descuento en cualquier café de especialidad para la comunidad Unities.',
   '[]'::jsonb, null, null, 'UNITIES20', 'Muestra este código en caja. Válido de lunes a viernes hasta fin de mes. Un uso por persona al día.',
   'redeem-cafe', now() - interval '3 days'),

  -- Descuento para conductores (Copec → canjeable de bencina)
  ('d04f0002-0000-4000-8000-000000000007', 'c04f0001-0000-4000-8000-00000000000b', 'descuento',
   '⛽ $3.000 de descuento en carga de bencina para conductores Unities con viajes completados este mes.',
   '[]'::jsonb, null, null, 'COPEC3000', 'Canjeable con créditos Unities en estaciones adheridas presentando el código QR de tu canje.',
   'redeem-bencina', now() - interval '4 days'),

  -- Noticia institucional (DAE)
  ('d04f0002-0000-4000-8000-000000000008', 'c04f0001-0000-4000-8000-000000000003', 'noticia',
   'Postulaciones abiertas a las becas de fotocopia y alimentación del semestre. Tienes plazo hasta el viernes en dae.uai.cl.',
   '[]'::jsonb, null, null, null, null, null, now() - interval '30 hours'),

  -- Evento cultural dentro de la semana (CADe)
  ('d04f0002-0000-4000-8000-000000000009', 'c04f0001-0000-4000-8000-000000000006', 'evento',
   'Ciclo de charlas: "Derecho y tecnología" con invitados de la industria. Cupos limitados, inscríbete en el link de la bio.',
   '[]'::jsonb, now() + interval '6 days', 'Auditorio Edificio D', null, null, null, now() - interval '8 hours')
on conflict (id) do nothing;

-- Historias activas (24 h desde que se aplica el seed).
insert into public.stories (id, publisher_id, media_path, caption, created_at, expires_at)
values
  ('e04f0003-0000-4000-8000-000000000001', 'c04f0001-0000-4000-8000-000000000001',
   'https://picsum.photos/seed/unities-story-feuai/720/1280', 'Semana de bienvenida 💙', now(), now() + interval '24 hours'),
  ('e04f0003-0000-4000-8000-000000000002', 'c04f0001-0000-4000-8000-000000000004',
   'https://picsum.photos/seed/unities-story-deportes/720/1280', 'Entrenamiento abierto hoy 18:00', now(), now() + interval '24 hours'),
  ('e04f0003-0000-4000-8000-000000000003', 'c04f0001-0000-4000-8000-000000000005',
   'https://picsum.photos/seed/unities-story-cai/720/1280', 'Resultados del torneo 👀', now(), now() + interval '24 hours')
on conflict (id) do nothing;


-- ###################################################################
-- ## 20260705120000_admin_schema.sql
-- ###################################################################
-- Unities — Sesión 5: esquema del panel de administración.
-- Tablas: publisher_members (qué usuarios administran qué publisher — la
-- restricción "cada admin opera solo sobre sus publishers" es RLS sobre esta
-- tabla), brands (marcas asociadas que co-firman posts), widget_config
-- (orden/fijado/destacado del widget de eventos), content_folders/
-- content_items (carpetas de contenido por publisher, integrables a un widget
-- del feed) y el flujo de postulación de canjeables (columnas de estado en
-- redeemables: el admin propone 'pendiente', solo el owner aprueba).
-- Convención de las Sesiones 3–4: snake_case, uuid, timestamptz.

-- ---------------------------------------------------------------------------
-- publisher_members — membresía: qué usuarios publican/administran en nombre
-- de qué publisher. El owner no necesita membresía (bypass en las políticas);
-- tutor/admin requieren fila aquí para operar sobre ese publisher.
-- ---------------------------------------------------------------------------
create table if not exists public.publisher_members (
  publisher_id uuid not null references public.publishers (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (publisher_id, user_id)
);

create index if not exists publisher_members_user_idx on public.publisher_members (user_id);

-- ---------------------------------------------------------------------------
-- brands — marcas asociadas a un publisher (logo en feed-media o URL http(s))
-- que co-firman promociones y activaciones vía posts.brand_id.
-- ---------------------------------------------------------------------------
create table if not exists public.brands (
  id           uuid primary key default gen_random_uuid(),
  publisher_id uuid not null references public.publishers (id) on delete cascade,
  name         text not null,
  logo_path    text,          -- ruta en el bucket feed-media o URL http(s)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists brands_publisher_idx on public.brands (publisher_id);

-- Co-firma: un post puede ir "junto a" una marca asociada.
alter table public.posts
  add column if not exists brand_id uuid references public.brands (id) on delete set null;

create index if not exists posts_brand_idx on public.posts (brand_id) where brand_id is not null;

-- ---------------------------------------------------------------------------
-- widget_config — configuración editorial del widget "Eventos de la semana":
-- una fila por post configurado. pinned va primero, luego sort_order asc y el
-- resto por fecha del evento; featured muestra el badge "Destacado".
-- El widget de la Sesión 4 (listWeekEvents) pasa a leer esta tabla.
-- ---------------------------------------------------------------------------
create table if not exists public.widget_config (
  id         uuid primary key default gen_random_uuid(),
  widget     text not null default 'eventos_semana' check (widget in ('eventos_semana')),
  post_id    uuid not null references public.posts (id) on delete cascade,
  sort_order integer not null default 0,
  pinned     boolean not null default false,
  featured   boolean not null default false,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (widget, post_id)
);

-- ---------------------------------------------------------------------------
-- content_folders / content_items — carpetas de contenido por publisher.
-- linked_widget integra la carpeta a un widget del feed ('galeria' = carrusel
-- de colecciones en Inicio); null = carpeta interna del panel.
-- ---------------------------------------------------------------------------
create table if not exists public.content_folders (
  id            uuid primary key default gen_random_uuid(),
  publisher_id  uuid not null references public.publishers (id) on delete cascade,
  name          text not null,
  description   text,
  linked_widget text check (linked_widget in ('galeria')),
  sort_order    integer not null default 0,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists content_folders_publisher_idx on public.content_folders (publisher_id);

create table if not exists public.content_items (
  id         uuid primary key default gen_random_uuid(),
  folder_id  uuid not null references public.content_folders (id) on delete cascade,
  media_path text not null,   -- ruta en feed-media o URL http(s)
  caption    text,
  sort_order integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists content_items_folder_idx on public.content_items (folder_id, sort_order);

-- ---------------------------------------------------------------------------
-- redeemables — flujo de postulación (Sesión 5): el admin inserta con estado
-- 'pendiente'; solo el owner aprueba/rechaza (review_redeemable + RLS). El
-- catálogo de canjes y redeem_item solo consideran 'aprobado'.
-- ---------------------------------------------------------------------------
alter table public.redeemables
  add column if not exists status text not null default 'pendiente'
    check (status in ('pendiente', 'aprobado', 'rechazado')),
  add column if not exists proposed_by  uuid references public.profiles (id) on delete set null,
  add column if not exists publisher_id uuid references public.publishers (id) on delete set null,
  add column if not exists reviewed_by  uuid references public.profiles (id) on delete set null,
  add column if not exists reviewed_at  timestamptz,
  add column if not exists review_note  text;

-- El catálogo existente (seed Sesión 3) ya estaba publicado: queda aprobado.
-- Guard proposed_by is null: las propuestas reales siempre llevan proponente,
-- así este UPDATE es re-ejecutable sin aprobar propuestas pendientes.
update public.redeemables set status = 'aprobado'
where status = 'pendiente' and proposed_by is null;

-- Bandeja del owner: solo filas pendientes.
create index if not exists redeemables_pending_idx on public.redeemables (created_at)
  where status = 'pendiente';


-- ###################################################################
-- ## 20260705120001_admin_functions_rls.sql
-- ###################################################################
-- Unities — Sesión 5: funciones, triggers y RLS del panel de administración.
-- Regla clave: "cada admin opera solo en nombre de sus publishers" es política
-- RLS sobre publisher_members, no el cliente. La aprobación de canjeables es
-- una función de servidor que verifica el rol owner; la RLS impide que una
-- cuenta no-owner cambie el status por UPDATE directo.

-- ===========================================================================
-- Helpers de autorización (mismo patrón security definer que is_admin /
-- can_publish: leen profiles/publisher_members saltando RLS, solo devuelven
-- boolean y se evalúan dentro de políticas).
-- ===========================================================================

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and account_role = 'owner'
  );
$$;

grant execute on function public.is_owner() to authenticated, anon;

create or replace function public.is_publisher_member(p_publisher uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.publisher_members
    where publisher_id = p_publisher and user_id = auth.uid()
  );
$$;

grant execute on function public.is_publisher_member(uuid) to authenticated, anon;

-- Publicar contenido en nombre de un publisher: el owner siempre; tutor/admin
-- solo si además son miembros de ese publisher.
create or replace function public.can_publish_as(p_publisher uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_owner()
      or (public.can_publish() and public.is_publisher_member(p_publisher));
$$;

grant execute on function public.can_publish_as(uuid) to authenticated, anon;

-- Administrar recursos del publisher (marcas, carpetas, widget, canjeables):
-- owner siempre; si no, rol admin + membresía (los tutores publican pero no
-- administran el panel).
create or replace function public.can_manage_publisher(p_publisher uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_owner()
      or (public.is_admin() and public.is_publisher_member(p_publisher));
$$;

grant execute on function public.can_manage_publisher(uuid) to authenticated, anon;

-- Configurar el widget para un post: owner, o admin del publisher del post.
create or replace function public.can_configure_widget(p_post uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_owner()
      or exists (
        select 1 from public.posts p
        where p.id = p_post and public.can_manage_publisher(p.publisher_id)
      );
$$;

grant execute on function public.can_configure_widget(uuid) to authenticated, anon;

-- Gestionar items de una carpeta: quien administra el publisher de la carpeta.
create or replace function public.can_manage_folder(p_folder uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.content_folders f
    where f.id = p_folder and public.can_manage_publisher(f.publisher_id)
  );
$$;

grant execute on function public.can_manage_folder(uuid) to authenticated, anon;

-- ===========================================================================
-- Triggers de updated_at (set_updated_at existe desde la Sesión 3)
-- ===========================================================================

drop trigger if exists brands_set_updated_at on public.brands;
create trigger brands_set_updated_at before update on public.brands
  for each row execute function public.set_updated_at();

drop trigger if exists widget_config_set_updated_at on public.widget_config;
create trigger widget_config_set_updated_at before update on public.widget_config
  for each row execute function public.set_updated_at();

drop trigger if exists content_folders_set_updated_at on public.content_folders;
create trigger content_folders_set_updated_at before update on public.content_folders
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- review_redeemable — aprobación/rechazo ejecutados en el servidor.
-- SECURITY DEFINER a propósito: la RLS de redeemables no permite a nadie más
-- que el owner tocar status; esta función verifica el rol owner ella misma
-- (un admin no puede aprobarse: no es owner).
-- ===========================================================================

create or replace function public.review_redeemable(
  p_item_id text,
  p_approve boolean,
  p_note text default null
)
returns public.redeemables
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_item public.redeemables;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = 'insufficient_privilege';
  end if;
  if not exists (
    select 1 from public.profiles where id = v_uid and account_role = 'owner'
  ) then
    raise exception 'Solo el owner puede aprobar o rechazar canjeables'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_item from public.redeemables where id = p_item_id for update;
  if not found then
    raise exception 'Canjeable no encontrado' using errcode = 'no_data_found';
  end if;
  if v_item.status <> 'pendiente' then
    raise exception 'Este canjeable ya fue revisado' using errcode = 'check_violation';
  end if;

  update public.redeemables
     set status      = case when p_approve then 'aprobado' else 'rechazado' end,
         reviewed_by = v_uid,
         reviewed_at = now(),
         review_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_item_id
   returning * into v_item;

  return v_item;
end;
$$;

revoke execute on function public.review_redeemable(text, boolean, text) from public, anon;
grant execute on function public.review_redeemable(text, boolean, text) to authenticated;

-- ===========================================================================
-- redeem_item — endurecido: solo canjeables aprobados entran al catálogo.
-- Mismo cuerpo de la Sesión 3 + condición status = 'aprobado'.
-- ===========================================================================

create or replace function public.redeem_item(p_item_id text)
returns public.redemptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_item public.redeemables;
  v_redemption public.redemptions;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = 'insufficient_privilege';
  end if;

  -- Serializa los canjes del mismo usuario: sin esto, dos canjes concurrentes
  -- pasarían ambos la validación de saldo (doble gasto).
  perform pg_advisory_xact_lock(hashtext('redeem:' || v_uid::text));

  -- FOR UPDATE: el control de stock también debe ser serializado.
  select * into v_item from public.redeemables
  where id = p_item_id and active and status = 'aprobado'
  for update;
  if not found then
    raise exception 'Canje no disponible' using errcode = 'no_data_found';
  end if;
  if v_item.stock is not null and v_item.stock <= 0 then
    raise exception 'Este canje está agotado' using errcode = 'check_violation';
  end if;
  if public.credit_balance(v_uid) < v_item.cost_credits then
    raise exception 'No tienes créditos suficientes para este canje' using errcode = 'check_violation';
  end if;

  if v_item.stock is not null then
    update public.redeemables set stock = stock - 1 where id = v_item.id;
  end if;

  insert into public.redemptions (user_id, item_id, title, cost_credits, code, status, expires_at)
  values (
    v_uid, v_item.id, v_item.title, v_item.cost_credits, public.gen_redemption_code(),
    'disponible', now() + (v_item.validity_days || ' days')::interval
  )
  returning * into v_redemption;

  if v_item.cost_credits > 0 then
    insert into public.credit_transactions (user_id, entry_type, source, amount, description, reference_id)
    values (v_uid, 'cargo', 'canje', v_item.cost_credits, 'Canje: ' || v_item.title, v_redemption.id::text);
  end if;

  return v_redemption;
end;
$;

-- ===========================================================================
-- Row Level Security — tablas nuevas
-- ===========================================================================

alter table public.publisher_members enable row level security;
alter table public.brands            enable row level security;
alter table public.widget_config     enable row level security;
alter table public.content_folders   enable row level security;
alter table public.content_items     enable row level security;

-- --- publisher_members: veo mis membresías (y las de mis publishers); solo el
-- --- owner asigna/quita miembros -------------------------------------------
drop policy if exists publisher_members_select on public.publisher_members;
create policy publisher_members_select on public.publisher_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_owner()
    or public.is_publisher_member(publisher_id)
  );

drop policy if exists publisher_members_insert_owner on public.publisher_members;
create policy publisher_members_insert_owner on public.publisher_members
  for insert to authenticated with check (public.is_owner());

drop policy if exists publisher_members_delete_owner on public.publisher_members;
create policy publisher_members_delete_owner on public.publisher_members
  for delete to authenticated using (public.is_owner());

-- --- brands: catálogo visible (el feed muestra la co-firma); escribe quien
-- --- administra el publisher ------------------------------------------------
drop policy if exists brands_select on public.brands;
create policy brands_select on public.brands
  for select to authenticated using (true);

drop policy if exists brands_insert_manager on public.brands;
create policy brands_insert_manager on public.brands
  for insert to authenticated with check (public.can_manage_publisher(publisher_id));

drop policy if exists brands_update_manager on public.brands;
create policy brands_update_manager on public.brands
  for update to authenticated
  using (public.can_manage_publisher(publisher_id))
  with check (public.can_manage_publisher(publisher_id));

drop policy if exists brands_delete_manager on public.brands;
create policy brands_delete_manager on public.brands
  for delete to authenticated using (public.can_manage_publisher(publisher_id));

-- --- widget_config: lo lee todo autenticado (el feed ordena con esto);
-- --- escribe el owner o el admin del publisher del post ---------------------
drop policy if exists widget_config_select on public.widget_config;
create policy widget_config_select on public.widget_config
  for select to authenticated using (true);

drop policy if exists widget_config_insert_manager on public.widget_config;
create policy widget_config_insert_manager on public.widget_config
  for insert to authenticated with check (public.can_configure_widget(post_id));

drop policy if exists widget_config_update_manager on public.widget_config;
create policy widget_config_update_manager on public.widget_config
  for update to authenticated
  using (public.can_configure_widget(post_id))
  with check (public.can_configure_widget(post_id));

drop policy if exists widget_config_delete_manager on public.widget_config;
create policy widget_config_delete_manager on public.widget_config
  for delete to authenticated using (public.can_configure_widget(post_id));

-- --- content_folders / content_items: lectura autenticada (el feed integra
-- --- las carpetas enlazadas); escribe quien administra el publisher ---------
drop policy if exists content_folders_select on public.content_folders;
create policy content_folders_select on public.content_folders
  for select to authenticated using (true);

drop policy if exists content_folders_insert_manager on public.content_folders;
create policy content_folders_insert_manager on public.content_folders
  for insert to authenticated with check (public.can_manage_publisher(publisher_id));

drop policy if exists content_folders_update_manager on public.content_folders;
create policy content_folders_update_manager on public.content_folders
  for update to authenticated
  using (public.can_manage_publisher(publisher_id))
  with check (public.can_manage_publisher(publisher_id));

drop policy if exists content_folders_delete_manager on public.content_folders;
create policy content_folders_delete_manager on public.content_folders
  for delete to authenticated using (public.can_manage_publisher(publisher_id));

drop policy if exists content_items_select on public.content_items;
create policy content_items_select on public.content_items
  for select to authenticated using (true);

drop policy if exists content_items_insert_manager on public.content_items;
create policy content_items_insert_manager on public.content_items
  for insert to authenticated with check (public.can_manage_folder(folder_id));

drop policy if exists content_items_update_manager on public.content_items;
create policy content_items_update_manager on public.content_items
  for update to authenticated
  using (public.can_manage_folder(folder_id))
  with check (public.can_manage_folder(folder_id));

drop policy if exists content_items_delete_manager on public.content_items;
create policy content_items_delete_manager on public.content_items
  for delete to authenticated using (public.can_manage_folder(folder_id));

-- ===========================================================================
-- RLS — endurecimiento de tablas existentes
-- ===========================================================================

-- --- posts / stories: de can_publish() global a can_publish_as(publisher) --
-- En la Sesión 4 cualquier tutor/admin publicaba a nombre de cualquier
-- publisher; ahora requiere membresía (el owner conserva alcance global).
drop policy if exists posts_insert_publisher on public.posts;
create policy posts_insert_publisher on public.posts
  for insert to authenticated
  with check (public.can_publish_as(publisher_id) and author_id = (select auth.uid()));

drop policy if exists posts_update_own on public.posts;
create policy posts_update_own on public.posts
  for update to authenticated
  using (
    public.is_owner()
    or (public.can_publish_as(publisher_id) and author_id = (select auth.uid()))
  )
  with check (
    public.is_owner()
    or (public.can_publish_as(publisher_id) and author_id = (select auth.uid()))
  );

drop policy if exists posts_delete_own on public.posts;
create policy posts_delete_own on public.posts
  for delete to authenticated
  using (
    public.is_owner()
    or (public.can_publish_as(publisher_id) and author_id = (select auth.uid()))
  );

drop policy if exists stories_insert_publisher on public.stories;
create policy stories_insert_publisher on public.stories
  for insert to authenticated
  with check (public.can_publish_as(publisher_id) and author_id = (select auth.uid()));

drop policy if exists stories_delete_own on public.stories;
create policy stories_delete_own on public.stories
  for delete to authenticated
  using (
    public.is_owner()
    or (public.can_publish_as(publisher_id) and author_id = (select auth.uid()))
  );

-- --- publishers: crear/editar/borrar entidades es del owner (antes cualquier
-- --- admin vía publishers_write_admin) --------------------------------------
drop policy if exists publishers_write_admin on public.publishers;

drop policy if exists publishers_insert_owner on public.publishers;
create policy publishers_insert_owner on public.publishers
  for insert to authenticated with check (public.is_owner());

drop policy if exists publishers_update_owner on public.publishers;
create policy publishers_update_owner on public.publishers
  for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists publishers_delete_owner on public.publishers;
create policy publishers_delete_owner on public.publishers
  for delete to authenticated using (public.is_owner());

-- --- redeemables: postulación con aprobación del owner ----------------------
-- Antes: redeemables_write_admin (for all, is_admin). Ahora:
--  * select: el catálogo solo muestra aprobados; el proponente ve los suyos y
--    los admins/owner ven todo (bandeja).
--  * insert: owner libre; admin solo 'pendiente', a su nombre y para un
--    publisher suyo.
--  * update/delete: owner libre; el proponente solo mientras siga 'pendiente'
--    y el WITH CHECK le impide sacar la fila de ese estado (aprobar/rechazar
--    queda imposible para no-owners por RLS: review_redeemable es la vía).
drop policy if exists redeemables_write_admin on public.redeemables;

drop policy if exists redeemables_select on public.redeemables;
create policy redeemables_select on public.redeemables
  for select to authenticated
  using (
    status = 'aprobado'
    or public.is_admin()
    or proposed_by = (select auth.uid())
  );

drop policy if exists redeemables_insert_proposal on public.redeemables;
create policy redeemables_insert_proposal on public.redeemables
  for insert to authenticated
  with check (
    public.is_owner()
    or (
      public.is_admin()
      and status = 'pendiente'
      and proposed_by = (select auth.uid())
      and (publisher_id is null or public.is_publisher_member(publisher_id))
    )
  );

drop policy if exists redeemables_update_proposal on public.redeemables;
create policy redeemables_update_proposal on public.redeemables
  for update to authenticated
  using (
    public.is_owner()
    or (proposed_by = (select auth.uid()) and status = 'pendiente')
  )
  with check (
    public.is_owner()
    or (proposed_by = (select auth.uid()) and status = 'pendiente')
  );

drop policy if exists redeemables_delete_proposal on public.redeemables;
create policy redeemables_delete_proposal on public.redeemables
  for delete to authenticated
  using (
    public.is_owner()
    or (proposed_by = (select auth.uid()) and status = 'pendiente')
  );


-- ###################################################################
-- ## 20260705120002_admin_seed.sql
-- ###################################################################
-- Unities — Sesión 5: seed del panel de administración.
-- ids fijos para que el seed sea idempotente (mismo patrón de la Sesión 4).
-- No siembra publisher_members ni propuestas de canjeables: dependen de
-- usuarios reales de auth.users (el owner los asigna desde su vista).

-- Marcas asociadas: co-firman promociones y activaciones (posts.brand_id).
insert into public.brands (id, publisher_id, name, logo_path)
values
  -- Red Bull auspicia eventos de la FEUAI ("¡Evento Red Bull!").
  ('b05f0001-0000-4000-8000-000000000001', 'c04f0001-0000-4000-8000-000000000001',
   'Red Bull', 'https://picsum.photos/seed/unities-brand-redbull/200/200'),
  -- La cafetería co-firma sus propias activaciones como marca.
  ('b05f0001-0000-4000-8000-000000000002', 'c04f0001-0000-4000-8000-00000000000a',
   'Cafetería Central', 'https://picsum.photos/seed/unities-brand-cafe/200/200')
on conflict (id) do nothing;

-- Widget "Eventos de la semana": la Fiesta Mechona queda fijada y destacada;
-- la Corrida ordenada después. Los eventos sin fila aquí siguen saliendo,
-- ordenados por fecha tras los configurados.
insert into public.widget_config (id, widget, post_id, sort_order, pinned, featured)
values
  ('a05f0002-0000-4000-8000-000000000001', 'eventos_semana',
   'd04f0002-0000-4000-8000-000000000002', 0, true, true),
  ('a05f0002-0000-4000-8000-000000000002', 'eventos_semana',
   'd04f0002-0000-4000-8000-000000000003', 1, false, false)
on conflict (widget, post_id) do nothing;

-- Carpetas de contenido: la de la FEUAI queda integrada al widget de galería
-- del feed; la de Deportes es interna del panel (linked_widget null).
insert into public.content_folders (id, publisher_id, name, description, linked_widget, sort_order)
values
  ('f05f0003-0000-4000-8000-000000000001', 'c04f0001-0000-4000-8000-000000000001',
   'Semana mechona 2026', 'Las mejores fotos de la bienvenida.', 'galeria', 0),
  ('f05f0003-0000-4000-8000-000000000002', 'c04f0001-0000-4000-8000-000000000004',
   'Selecciones 2026', 'Material interno para difusión deportiva.', null, 1)
on conflict (id) do nothing;

insert into public.content_items (id, folder_id, media_path, caption, sort_order)
values
  ('e05f0004-0000-4000-8000-000000000001', 'f05f0003-0000-4000-8000-000000000001',
   'https://picsum.photos/seed/unities-folder-mechona1/900/600', 'Bienvenida en el quincho', 0),
  ('e05f0004-0000-4000-8000-000000000002', 'f05f0003-0000-4000-8000-000000000001',
   'https://picsum.photos/seed/unities-folder-mechona2/900/600', 'Stands de bienvenida', 1),
  ('e05f0004-0000-4000-8000-000000000003', 'f05f0003-0000-4000-8000-000000000001',
   'https://picsum.photos/seed/unities-folder-mechona3/900/600', 'Tocata de cierre', 2),
  ('e05f0004-0000-4000-8000-000000000004', 'f05f0003-0000-4000-8000-000000000002',
   'https://picsum.photos/seed/unities-folder-deportes1/900/600', 'Selección de fútbol', 0)
on conflict (id) do nothing;
