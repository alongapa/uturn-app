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


-- ###################################################################
-- ## 20260706120000_messages_schema.sql
-- ###################################################################
-- Unities — Sesión 6: esquema de Mensajes, tutores y Q&A.
-- Tablas: conversations (dm/soporte) + conversation_members + messages (chat
-- realtime con imagen y leído), topics + topic_assignees (quién responde cada
-- tema: tutores o publishers), questions + question_replies (con respuesta
-- oficial destacada) y guides (material de tutores en Storage).
-- Convención de la Sesión 3: snake_case, uuid, timestamptz created_at/updated_at.

-- ---------------------------------------------------------------------------
-- conversations — hilo de chat. `kind` distingue DMs 1-a-1 de tickets de
-- soporte ("Soporte Unities", atendido por admin/owner). Para DMs, `dm_key`
-- (uuid menor:uuid mayor) garantiza una única conversación por par de
-- usuarios. `last_message_*` se denormaliza vía trigger para ordenar y
-- previsualizar la bandeja sin N+1.
-- ---------------------------------------------------------------------------
create table if not exists public.conversations (
  id                   uuid primary key default gen_random_uuid(),
  kind                 text not null check (kind in ('dm', 'soporte')),
  dm_key               text unique,
  support_category     text check (support_category in ('pagos', 'baneos', 'verificacion', 'otro')),
  support_status       text check (support_status in ('abierto', 'resuelto')),
  created_by           uuid references public.profiles (id) on delete set null,
  last_message_at      timestamptz,
  last_message_preview text,
  last_message_sender  uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (kind <> 'dm' or dm_key is not null),
  check (kind <> 'soporte' or (support_category is not null and support_status is not null))
);

-- Bandeja: conversaciones con actividad más reciente primero.
create index if not exists conversations_last_message_idx
  on public.conversations (last_message_at desc nulls last);
-- Bandeja de soporte de los admins: tickets abiertos primero.
create index if not exists conversations_support_idx
  on public.conversations (support_status, last_message_at desc)
  where kind = 'soporte';

-- ---------------------------------------------------------------------------
-- conversation_members — quién participa. `last_read_at` es el puntero de
-- lectura por miembro: mensajes posteriores cuentan como no leídos y sirven
-- de indicador "visto" en los DMs. Solo se escribe vía RPCs (start_dm,
-- start_support, mark_conversation_read): no hay política de escritura.
-- ---------------------------------------------------------------------------
create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists conversation_members_user_idx
  on public.conversation_members (user_id);

-- ---------------------------------------------------------------------------
-- messages — texto y/o imagen (`image_path`: ruta en el bucket chat-media,
-- `<conversation_id>/<uid>/<archivo>`). Inmutables: no hay UPDATE/DELETE de
-- clientes. El orden estable (created_at, id) pagina el historial.
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id) on delete cascade,
  body            text not null default '' check (char_length(body) <= 2000),
  image_path      text,
  created_at      timestamptz not null default now(),
  check (char_length(btrim(body)) > 0 or image_path is not null)
);

create index if not exists messages_conversation_idx
  on public.messages (conversation_id, created_at desc, id desc);
create index if not exists messages_sender_idx on public.messages (sender_id);

-- ---------------------------------------------------------------------------
-- topics — catálogo de temas del Q&A (mallas, becas, deportes…). id de texto
-- estable para seed y deep links, como redeemables.
-- ---------------------------------------------------------------------------
create table if not exists public.topics (
  id          text primary key,
  name        text not null,
  emoji       text,
  description text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- topic_assignees — responsables oficiales de cada tema: un tutor (user_id) o
-- una federación/publisher (publisher_id), exactamente uno de los dos. La RLS
-- de question_replies exige estar aquí para marcar una respuesta oficial.
-- ---------------------------------------------------------------------------
create table if not exists public.topic_assignees (
  id           uuid primary key default gen_random_uuid(),
  topic_id     text not null references public.topics (id) on delete cascade,
  user_id      uuid references public.profiles (id) on delete cascade,
  publisher_id uuid references public.publishers (id) on delete cascade,
  created_at   timestamptz not null default now(),
  check ((user_id is null) <> (publisher_id is null))
);

create unique index if not exists topic_assignees_user_uq
  on public.topic_assignees (topic_id, user_id) where user_id is not null;
create unique index if not exists topic_assignees_publisher_uq
  on public.topic_assignees (topic_id, publisher_id) where publisher_id is not null;
create index if not exists topic_assignees_topic_idx on public.topic_assignees (topic_id);
create index if not exists topic_assignees_user_idx
  on public.topic_assignees (user_id) where user_id is not null;
create index if not exists topic_assignees_publisher_idx
  on public.topic_assignees (publisher_id) where publisher_id is not null;

-- ---------------------------------------------------------------------------
-- questions — pregunta pública por tema. `reply_count` y `answered_at` los
-- mantiene el trigger de question_replies (el cliente no puede tocarlos:
-- trigger protect_question_columns).
-- ---------------------------------------------------------------------------
create table if not exists public.questions (
  id          uuid primary key default gen_random_uuid(),
  topic_id    text not null references public.topics (id),
  author_id   uuid not null references public.profiles (id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 1 and 200),
  body        text not null default '' check (char_length(body) <= 2000),
  reply_count integer not null default 0 check (reply_count >= 0),
  answered_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists questions_topic_idx on public.questions (topic_id, created_at desc);
create index if not exists questions_author_idx on public.questions (author_id);
create index if not exists questions_feed_idx on public.questions (created_at desc, id desc);

-- ---------------------------------------------------------------------------
-- question_replies — respuestas y comentarios. `is_official = true` solo lo
-- pueden poner los asignados al tema (RLS); si responden a nombre de una
-- federación llevan `publisher_id`. La respuesta oficial queda destacada en
-- la UI y marca `questions.answered_at`.
-- ---------------------------------------------------------------------------
create table if not exists public.question_replies (
  id           uuid primary key default gen_random_uuid(),
  question_id  uuid not null references public.questions (id) on delete cascade,
  author_id    uuid not null references public.profiles (id) on delete cascade,
  publisher_id uuid references public.publishers (id) on delete set null,
  body         text not null check (char_length(btrim(body)) between 1 and 2000),
  is_official  boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists question_replies_question_idx
  on public.question_replies (question_id, created_at);
create index if not exists question_replies_author_idx on public.question_replies (author_id);
create index if not exists question_replies_official_idx
  on public.question_replies (question_id) where is_official;

-- ---------------------------------------------------------------------------
-- guides — guías de estudio de los tutores (PDF o imagen en el bucket
-- privado `guides`, ruta `<uid>/<archivo>`), asociadas a un tema y
-- consultables desde el Q&A.
-- ---------------------------------------------------------------------------
create table if not exists public.guides (
  id          uuid primary key default gen_random_uuid(),
  topic_id    text not null references public.topics (id),
  author_id   uuid not null references public.profiles (id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 1 and 150),
  description text,
  file_path   text not null,
  file_kind   text not null check (file_kind in ('imagen', 'pdf')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists guides_topic_idx on public.guides (topic_id, created_at desc);
create index if not exists guides_author_idx on public.guides (author_id);


-- ###################################################################
-- ## 20260706120001_messages_functions_rls.sql
-- ###################################################################
-- Unities — Sesión 6: funciones, triggers y RLS de mensajería y Q&A.
-- Regla clave: la privacidad del chat ES la política RLS (solo miembros leen
-- y escriben su conversación), no el cliente. Crear conversaciones y mover
-- punteros de lectura pasa por RPCs security definer que garantizan las
-- invariantes (DM único por par, membresías atómicas), igual que reserve_seat
-- en la Sesión 3.

-- ===========================================================================
-- Helpers de autorización (security definer para no recursar la RLS de
-- conversation_members; mismo patrón que is_admin / can_publish)
-- ===========================================================================

create or replace function public.is_conversation_member(p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = p_conversation and user_id = auth.uid()
  );
$$;

grant execute on function public.is_conversation_member(uuid) to authenticated, anon;

-- Acceso a una conversación: sus miembros; los tickets de soporte además los
-- ven los agentes (admin/owner), que atienden "Soporte Unities".
create or replace function public.can_access_conversation(p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_conversation_member(p_conversation)
      or (
        public.is_admin()
        and exists (
          select 1 from public.conversations
          where id = p_conversation and kind = 'soporte'
        )
      );
$$;

grant execute on function public.can_access_conversation(uuid) to authenticated, anon;

-- Storage del chat: primer segmento de la ruta = conversation_id. Cast seguro
-- para que la política de chat-media nunca reviente evaluando objetos con
-- rutas de otro formato.
create or replace function public.conversation_from_path(p_name text)
returns uuid
language plpgsql
immutable
as $$
begin
  return ((string_to_array(p_name, '/'))[1])::uuid;
exception when others then
  return null;
end;
$$;

grant execute on function public.conversation_from_path(text) to authenticated, anon;

-- ¿Puede auth.uid() responder OFICIALMENTE esta pregunta? Solo los asignados
-- al tema: como tutor (topic_assignees.user_id) o a nombre de un publisher
-- asignado del que es miembro (publisher_members, Sesión 5).
create or replace function public.can_answer_question(p_question uuid, p_publisher uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_publisher is null then exists (
      select 1
      from public.questions q
      join public.topic_assignees ta on ta.topic_id = q.topic_id
      where q.id = p_question and ta.user_id = auth.uid()
    )
    else public.is_publisher_member(p_publisher) and exists (
      select 1
      from public.questions q
      join public.topic_assignees ta on ta.topic_id = q.topic_id
      where q.id = p_question and ta.publisher_id = p_publisher
    )
  end;
$$;

grant execute on function public.can_answer_question(uuid, uuid) to authenticated, anon;

-- ===========================================================================
-- RPCs de conversaciones (única vía de creación; el cliente no inserta
-- conversations ni conversation_members directo)
-- ===========================================================================

-- DM 1-a-1: devuelve la conversación existente del par o la crea con ambas
-- membresías. dm_key = '<uuid menor>:<uuid mayor>' evita duplicados (con
-- on conflict para la carrera de dos aperturas simultáneas).
create or replace function public.start_dm(p_other_user uuid)
returns public.conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_key  text;
  v_conv public.conversations;
begin
  if v_uid is null then
    raise exception 'Necesitas iniciar sesión';
  end if;
  if p_other_user is null or p_other_user = v_uid then
    raise exception 'Elige a otra persona para chatear';
  end if;
  if not exists (select 1 from public.profiles where id = p_other_user) then
    raise exception 'El usuario no existe';
  end if;

  v_key := least(v_uid, p_other_user)::text || ':' || greatest(v_uid, p_other_user)::text;

  select * into v_conv from public.conversations where dm_key = v_key;
  if found then
    return v_conv;
  end if;

  insert into public.conversations (kind, dm_key, created_by)
  values ('dm', v_key, v_uid)
  on conflict (dm_key) do nothing
  returning * into v_conv;

  if v_conv.id is null then
    -- Carrera: otro request la creó entre el select y el insert.
    select * into v_conv from public.conversations where dm_key = v_key;
  end if;

  insert into public.conversation_members (conversation_id, user_id)
  values (v_conv.id, v_uid), (v_conv.id, p_other_user)
  on conflict do nothing;

  return v_conv;
end;
$$;

revoke execute on function public.start_dm(uuid) from public, anon;
grant execute on function public.start_dm(uuid) to authenticated;

-- Ticket de "Soporte Unities": reutiliza el ticket abierto del usuario en esa
-- categoría (evita duplicados accidentales) o crea uno nuevo.
create or replace function public.start_support(p_category text)
returns public.conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_conv public.conversations;
begin
  if v_uid is null then
    raise exception 'Necesitas iniciar sesión';
  end if;
  if p_category not in ('pagos', 'baneos', 'verificacion', 'otro') then
    raise exception 'Categoría de soporte inválida';
  end if;

  select c.* into v_conv
  from public.conversations c
  join public.conversation_members m on m.conversation_id = c.id
  where c.kind = 'soporte'
    and c.support_category = p_category
    and c.support_status = 'abierto'
    and c.created_by = v_uid
    and m.user_id = v_uid
  order by c.created_at desc
  limit 1;
  if found then
    return v_conv;
  end if;

  insert into public.conversations (kind, support_category, support_status, created_by)
  values ('soporte', p_category, 'abierto', v_uid)
  returning * into v_conv;

  insert into public.conversation_members (conversation_id, user_id)
  values (v_conv.id, v_uid);

  return v_conv;
end;
$$;

revoke execute on function public.start_support(text) from public, anon;
grant execute on function public.start_support(text) to authenticated;

-- Cambiar estado abierto/resuelto de un ticket: agentes (admin/owner) o el
-- propio miembro (puede marcar resuelto su ticket o reabrirlo).
create or replace function public.set_support_status(p_conversation uuid, p_status text)
returns public.conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv public.conversations;
begin
  if auth.uid() is null then
    raise exception 'Necesitas iniciar sesión';
  end if;
  if p_status not in ('abierto', 'resuelto') then
    raise exception 'Estado inválido';
  end if;

  select * into v_conv from public.conversations where id = p_conversation;
  if not found or v_conv.kind <> 'soporte' then
    raise exception 'La conversación no es de soporte';
  end if;
  if not public.can_access_conversation(p_conversation) then
    raise exception 'Sin acceso a esta conversación';
  end if;

  update public.conversations
  set support_status = p_status, updated_at = now()
  where id = p_conversation
  returning * into v_conv;

  return v_conv;
end;
$$;

revoke execute on function public.set_support_status(uuid, text) from public, anon;
grant execute on function public.set_support_status(uuid, text) to authenticated;

-- Marca la conversación como leída para auth.uid(). Si un agente de soporte
-- (admin) abre un ticket del que aún no es miembro, se une aquí: así gana
-- puntero de lectura y contadores de no-leídos propios.
create or replace function public.mark_conversation_read(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Necesitas iniciar sesión';
  end if;

  update public.conversation_members
  set last_read_at = now()
  where conversation_id = p_conversation and user_id = v_uid;

  if not found then
    if public.is_admin() and exists (
      select 1 from public.conversations where id = p_conversation and kind = 'soporte'
    ) then
      insert into public.conversation_members (conversation_id, user_id)
      values (p_conversation, v_uid)
      on conflict (conversation_id, user_id) do update set last_read_at = now();
    end if;
    -- Si no es miembro ni agente, no hace nada (la RLS ya le impide leer).
  end if;
end;
$$;

revoke execute on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- No-leídos por conversación del usuario actual, en una sola consulta para la
-- bandeja (evita N+1 desde el cliente). SECURITY INVOKER: cuenta solo lo que
-- la RLS de messages le deja ver.
create or replace function public.conversation_unread_counts()
returns table (conversation_id uuid, unread_count bigint)
language sql
stable
set search_path = public
as $$
  select cm.conversation_id, count(m.id)
  from public.conversation_members cm
  left join public.messages m
    on m.conversation_id = cm.conversation_id
   and m.created_at > cm.last_read_at
   and m.sender_id <> cm.user_id
  where cm.user_id = (select auth.uid())
  group by cm.conversation_id;
$$;

revoke execute on function public.conversation_unread_counts() from public, anon;
grant execute on function public.conversation_unread_counts() to authenticated;

-- ===========================================================================
-- Triggers
-- ===========================================================================

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at before update on public.conversations
  for each row execute function public.set_updated_at();

drop trigger if exists questions_set_updated_at on public.questions;
create trigger questions_set_updated_at before update on public.questions
  for each row execute function public.set_updated_at();

drop trigger if exists guides_set_updated_at on public.guides;
create trigger guides_set_updated_at before update on public.guides
  for each row execute function public.set_updated_at();

-- Cada mensaje toca la conversación: actualiza el resumen de la bandeja
-- (last_message_*), reabre tickets resueltos cuando escribe el alumno y deja
-- el mensaje propio como leído para su emisor. SECURITY DEFINER: el emisor no
-- tiene política de UPDATE sobre conversations.
create or replace function public.touch_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_preview text;
begin
  v_preview := nullif(left(btrim(new.body), 120), '');
  if v_preview is null and new.image_path is not null then
    v_preview := '📷 Foto';
  end if;

  update public.conversations
  set last_message_at      = new.created_at,
      last_message_preview = v_preview,
      last_message_sender  = new.sender_id,
      updated_at           = now(),
      -- Un mensaje de un no-agente reabre el ticket resuelto.
      support_status = case
        when kind = 'soporte' and support_status = 'resuelto' and not exists (
          select 1 from public.profiles
          where id = new.sender_id and account_role in ('admin', 'owner')
        ) then 'abierto'
        else support_status
      end
  where id = new.conversation_id;

  update public.conversation_members
  set last_read_at = greatest(last_read_at, new.created_at)
  where conversation_id = new.conversation_id and user_id = new.sender_id;

  return null;  -- after trigger
end;
$$;

revoke execute on function public.touch_conversation_on_message() from public, anon, authenticated;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation after insert on public.messages
  for each row execute function public.touch_conversation_on_message();

-- Contadores y respuesta oficial de questions, mantenidos por el servidor
-- (mismo patrón que bump_post_counters de la Sesión 4).
create or replace function public.bump_question_counters()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_question uuid;
begin
  if tg_op = 'INSERT' then
    update public.questions
    set reply_count = reply_count + 1,
        answered_at = case when new.is_official then coalesce(answered_at, new.created_at) else answered_at end
    where id = new.question_id;
    return null;
  end if;

  v_question := old.question_id;
  update public.questions
  set reply_count = greatest(reply_count - 1, 0)
  where id = v_question;
  -- Si se borró la última respuesta oficial, la pregunta vuelve a "sin responder".
  if old.is_official and not exists (
    select 1 from public.question_replies where question_id = v_question and is_official
  ) then
    update public.questions set answered_at = null where id = v_question;
  end if;
  return null;
end;
$$;

revoke execute on function public.bump_question_counters() from public, anon, authenticated;

drop trigger if exists question_replies_bump_counters on public.question_replies;
create trigger question_replies_bump_counters after insert or delete on public.question_replies
  for each row execute function public.bump_question_counters();

-- El autor puede editar título/cuerpo de su pregunta, pero reply_count y
-- answered_at solo los mueve el servidor (patrón protect_profile_columns).
create or replace function public.protect_question_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;  -- contexto de servidor (triggers definer): confía en el cambio
  end if;
  new.reply_count := old.reply_count;
  new.answered_at := old.answered_at;
  new.author_id   := old.author_id;
  return new;
end;
$$;

revoke execute on function public.protect_question_columns() from public, anon, authenticated;

drop trigger if exists questions_protect_columns on public.questions;
create trigger questions_protect_columns before update on public.questions
  for each row execute function public.protect_question_columns();

-- ===========================================================================
-- Row Level Security
-- ===========================================================================

alter table public.conversations        enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages             enable row level security;
alter table public.topics               enable row level security;
alter table public.topic_assignees      enable row level security;
alter table public.questions            enable row level security;
alter table public.question_replies     enable row level security;
alter table public.guides               enable row level security;

-- --- conversations: solo miembros (o agentes en soporte); sin escritura
-- --- directa de clientes — todo pasa por las RPCs de arriba. -----------------
drop policy if exists conversations_select_member on public.conversations;
create policy conversations_select_member on public.conversations
  for select to authenticated using (public.can_access_conversation(id));

-- --- conversation_members: visibles para quien accede a la conversación
-- --- (lista de participantes y puntero "visto"); sin escritura directa. ------
drop policy if exists conversation_members_select on public.conversation_members;
create policy conversation_members_select on public.conversation_members
  for select to authenticated using (public.can_access_conversation(conversation_id));

-- --- messages: leer y escribir SOLO con acceso a la conversación; el emisor
-- --- siempre es auth.uid(). Sin update/delete: el historial es inmutable. ----
drop policy if exists messages_select_member on public.messages;
create policy messages_select_member on public.messages
  for select to authenticated using (public.can_access_conversation(conversation_id));

drop policy if exists messages_insert_member on public.messages;
create policy messages_insert_member on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.can_access_conversation(conversation_id)
  );

-- --- topics / topic_assignees: catálogo público para autenticados; los
-- --- administra admin/owner (asigna tutores y federaciones a temas). ---------
drop policy if exists topics_select on public.topics;
create policy topics_select on public.topics
  for select to authenticated using (true);

drop policy if exists topics_write_admin on public.topics;
create policy topics_write_admin on public.topics
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists topic_assignees_select on public.topic_assignees;
create policy topic_assignees_select on public.topic_assignees
  for select to authenticated using (true);

drop policy if exists topic_assignees_write_admin on public.topic_assignees;
create policy topic_assignees_write_admin on public.topic_assignees
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- --- questions: públicas para autenticados; cada quien crea/edita/borra las
-- --- suyas (admin modera). protect_question_columns blinda los contadores. ---
drop policy if exists questions_select on public.questions;
create policy questions_select on public.questions
  for select to authenticated using (true);

drop policy if exists questions_insert_own on public.questions;
create policy questions_insert_own on public.questions
  for insert to authenticated with check (author_id = (select auth.uid()));

drop policy if exists questions_update_own on public.questions;
create policy questions_update_own on public.questions
  for update to authenticated
  using (author_id = (select auth.uid()) or public.is_admin())
  with check (author_id = (select auth.uid()) or public.is_admin());

drop policy if exists questions_delete_own on public.questions;
create policy questions_delete_own on public.questions
  for delete to authenticated
  using (author_id = (select auth.uid()) or public.is_admin());

-- --- question_replies: comentar puede cualquiera (a nombre propio); marcar
-- --- is_official o firmar con publisher SOLO los asignados al tema — esta
-- --- política es el criterio de aceptación "un user no responde oficial". ----
drop policy if exists question_replies_select on public.question_replies;
create policy question_replies_select on public.question_replies
  for select to authenticated using (true);

drop policy if exists question_replies_insert on public.question_replies;
create policy question_replies_insert on public.question_replies
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (
      (not is_official and publisher_id is null)
      or (is_official and public.can_answer_question(question_id, publisher_id))
    )
  );

drop policy if exists question_replies_delete_own on public.question_replies;
create policy question_replies_delete_own on public.question_replies
  for delete to authenticated
  using (author_id = (select auth.uid()) or public.is_admin());

-- --- guides: consultables por cualquier autenticado; sube/edita solo tutor+
-- --- (can_publish = tutor/admin/owner, Sesión 4) y siempre a nombre propio. --
drop policy if exists guides_select on public.guides;
create policy guides_select on public.guides
  for select to authenticated using (true);

drop policy if exists guides_insert_tutor on public.guides;
create policy guides_insert_tutor on public.guides
  for insert to authenticated
  with check (public.can_publish() and author_id = (select auth.uid()));

drop policy if exists guides_update_own on public.guides;
create policy guides_update_own on public.guides
  for update to authenticated
  using (public.is_admin() or (public.can_publish() and author_id = (select auth.uid())))
  with check (public.is_admin() or (public.can_publish() and author_id = (select auth.uid())));

drop policy if exists guides_delete_own on public.guides;
create policy guides_delete_own on public.guides
  for delete to authenticated
  using (public.is_admin() or author_id = (select auth.uid()));

-- ===========================================================================
-- Realtime: el chat entra sin recargar. RLS sigue filtrando lo que cada
-- suscriptor recibe (un cliente jamás recibe mensajes de conversaciones
-- ajenas). conversation_members da el "visto" en vivo; questions/replies
-- refrescan el Q&A abierto.
-- ===========================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'conversations', 'conversation_members', 'messages',
    'questions', 'question_replies'
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
-- ## 20260706120002_messages_storage_seed.sql
-- ###################################################################
-- Unities — Sesión 6: buckets de mensajería + seed del Q&A.
-- `guides`: material de tutores (PDF/imagen), privado, ruta `<uid>/<archivo>`;
-- lee cualquier autenticado (URL firmada), escribe solo tutor+ en su carpeta
-- (mismo patrón que feed-media). `chat-media`: fotos del chat, ruta
-- `<conversation_id>/<uid>/<archivo>`; solo quien accede a la conversación
-- puede leerlas — la privacidad del chat aplica también a sus imágenes.

insert into storage.buckets (id, name, public)
values ('guides', 'guides', false), ('chat-media', 'chat-media', false)
on conflict (id) do nothing;

-- --- guides ----------------------------------------------------------------

drop policy if exists guides_files_select on storage.objects;
create policy guides_files_select on storage.objects
  for select to authenticated using (bucket_id = 'guides');

drop policy if exists guides_files_insert_tutor on storage.objects;
create policy guides_files_insert_tutor on storage.objects
  for insert to authenticated with check (
    bucket_id = 'guides'
    and public.can_publish()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- El upsert de Storage necesita INSERT + SELECT + UPDATE (checklist Supabase).
drop policy if exists guides_files_update_tutor on storage.objects;
create policy guides_files_update_tutor on storage.objects
  for update to authenticated
  using (
    bucket_id = 'guides'
    and public.can_publish()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'guides'
    and public.can_publish()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists guides_files_delete_tutor on storage.objects;
create policy guides_files_delete_tutor on storage.objects
  for delete to authenticated using (
    bucket_id = 'guides'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = (select auth.uid())::text
    )
  );

-- --- chat-media ------------------------------------------------------------
-- conversation_from_path castea seguro el primer segmento (null si no es
-- uuid) y can_access_conversation aplica la misma regla que los mensajes.

drop policy if exists chat_media_select_member on storage.objects;
create policy chat_media_select_member on storage.objects
  for select to authenticated using (
    bucket_id = 'chat-media'
    and public.can_access_conversation(public.conversation_from_path(name))
  );

drop policy if exists chat_media_insert_member on storage.objects;
create policy chat_media_insert_member on storage.objects
  for insert to authenticated with check (
    bucket_id = 'chat-media'
    and public.can_access_conversation(public.conversation_from_path(name))
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

-- ===========================================================================
-- Seed: temas del Q&A y responsables oficiales. Los publishers asignados son
-- los de la Sesión 4 (ids estables del seed del feed); los tutores se asignan
-- después vía topic_assignees (política de admin). Idempotente.
-- ===========================================================================

insert into public.topics (id, name, emoji, description, sort_order)
values
  ('mallas',      'Mallas y ramos',      '📚', 'Mallas curriculares, tomas de ramos, convalidaciones y electivos.', 1),
  ('becas',       'Becas y beneficios',  '🎓', 'Becas internas, gratuidad, TNE y beneficios estudiantiles.',        2),
  ('deportes',    'Deportes',            '⚽', 'Selecciones, talleres deportivos y uso de instalaciones.',          3),
  ('fiestas',     'Fiestas y eventos',   '🎉', 'Carretes, fiestas de la federación y eventos del campus.',          4),
  ('intercambio', 'Intercambio',         '✈️', 'Programas de intercambio, requisitos y postulaciones.',             5),
  ('practicas',   'Prácticas y empleo',  '💼', 'Prácticas profesionales, bolsa de trabajo y CV.',                   6),
  ('vida-campus', 'Vida en el campus',   '🏫', 'Casinos, estacionamientos, salas de estudio y vida universitaria.', 7)
on conflict (id) do update set
  name        = excluded.name,
  emoji       = excluded.emoji,
  description = excluded.description,
  sort_order  = excluded.sort_order;

-- Federaciones/departamentos responsables por tema (seed de la Sesión 4):
-- FEUAI → fiestas y vida de campus; DAE → becas e intercambio;
-- Deportes UAI → deportes; CAI Ingeniería → mallas; DAE → prácticas.
insert into public.topic_assignees (topic_id, publisher_id)
values
  ('fiestas',     'c04f0001-0000-4000-8000-000000000001'),
  ('vida-campus', 'c04f0001-0000-4000-8000-000000000001'),
  ('becas',       'c04f0001-0000-4000-8000-000000000003'),
  ('intercambio', 'c04f0001-0000-4000-8000-000000000003'),
  ('practicas',   'c04f0001-0000-4000-8000-000000000003'),
  ('deportes',    'c04f0001-0000-4000-8000-000000000004'),
  ('mallas',      'c04f0001-0000-4000-8000-000000000005')
on conflict (topic_id, publisher_id) where publisher_id is not null do nothing;


-- ###################################################################
-- ## 20260706120003_messages_hardening.sql
-- ###################################################################
-- Unities — Sesión 6: endurecimiento post-advisors (mismo espíritu que la
-- migración ...000005 de la Sesión 3).
-- 1) search_path fijo en conversation_from_path (lint function_search_path_mutable).
-- 2) Los helpers security definer del chat no necesitan EXECUTE para anon:
--    todas las políticas que los evalúan son `to authenticated`.
-- 3) Índices para las FKs nuevas sin cobertura (lint unindexed_foreign_keys).
-- 4) topics/topic_assignees: la política de admin pasa de `for all` a
--    insert/update/delete para no solapar el SELECT (lint multiple_permissive_policies).

-- --- 1) search_path fijo ----------------------------------------------------
create or replace function public.conversation_from_path(p_name text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
begin
  return ((string_to_array(p_name, '/'))[1])::uuid;
exception when others then
  return null;
end;
$$;

-- --- 2) sin EXECUTE para anon (ni el implícito de PUBLIC) en los helpers -----
revoke execute on function public.is_conversation_member(uuid) from public, anon;
revoke execute on function public.can_access_conversation(uuid) from public, anon;
revoke execute on function public.can_answer_question(uuid, uuid) from public, anon;
revoke execute on function public.conversation_from_path(text) from public, anon;

-- --- 3) índices de FKs ------------------------------------------------------
create index if not exists conversations_created_by_idx
  on public.conversations (created_by) where created_by is not null;
create index if not exists conversations_last_sender_idx
  on public.conversations (last_message_sender) where last_message_sender is not null;
create index if not exists question_replies_publisher_idx
  on public.question_replies (publisher_id) where publisher_id is not null;

-- --- 4) políticas de admin sin solapar el SELECT -----------------------------
drop policy if exists topics_write_admin on public.topics;
drop policy if exists topics_insert_admin on public.topics;
create policy topics_insert_admin on public.topics
  for insert to authenticated with check (public.is_admin());
drop policy if exists topics_update_admin on public.topics;
create policy topics_update_admin on public.topics
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists topics_delete_admin on public.topics;
create policy topics_delete_admin on public.topics
  for delete to authenticated using (public.is_admin());

drop policy if exists topic_assignees_write_admin on public.topic_assignees;
drop policy if exists topic_assignees_insert_admin on public.topic_assignees;
create policy topic_assignees_insert_admin on public.topic_assignees
  for insert to authenticated with check (public.is_admin());
drop policy if exists topic_assignees_update_admin on public.topic_assignees;
create policy topic_assignees_update_admin on public.topic_assignees
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists topic_assignees_delete_admin on public.topic_assignees;
create policy topic_assignees_delete_admin on public.topic_assignees
  for delete to authenticated using (public.is_admin());


-- ###################################################################
-- ## 20260707120000_notifications_schema.sql
-- ###################################################################
-- Unities — Sesión 7: esquema de notificaciones push y centro de notificaciones.
-- Tablas: push_tokens (token Expo por dispositivo/usuario), notification_prefs
-- (preferencias por categoría, respetadas en el servidor ANTES de encolar) y
-- notifications (historial por usuario que además actúa de cola de envío push:
-- push_status pending → processing → sent/skipped/failed).
-- Convención de la Sesión 3: snake_case, uuid, timestamptz created_at/updated_at.

-- ---------------------------------------------------------------------------
-- push_tokens — un ExponentPushToken por dispositivo. `token` es único global:
-- si otro usuario inicia sesión en el mismo teléfono, register_push_token
-- reasigna la fila (el dispositivo recibe los push de la cuenta activa).
-- Escritura solo vía RPCs register/unregister_push_token (security definer).
-- ---------------------------------------------------------------------------
create table if not exists public.push_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  token       text not null unique check (char_length(token) between 10 and 400),
  platform    text not null check (platform in ('ios', 'android', 'web')),
  device_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

-- ---------------------------------------------------------------------------
-- notification_prefs — switch por categoría (pagos, viajes, social, mensajes).
-- Sin fila = todo activado (default true); el cliente hace upsert al togglear.
-- El servidor consulta esto en enqueue_notification: lo desactivado ni se
-- encola ni se envía (criterio "verificado server-side").
-- ---------------------------------------------------------------------------
create table if not exists public.notification_prefs (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  pagos      boolean not null default true,
  viajes     boolean not null default true,
  social     boolean not null default true,
  mensajes   boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- notifications — historial del centro de notificaciones Y cola de push.
--   category  → agrupa para preferencias y para el ícono de la UI.
--   type      → evento concreto (pago_24h, strike, reserva_nueva, dm, …).
--   url       → ruta expo-router que abre el deep link al tocar la push.
--   dedupe_key→ '<type>:<referencia>:<user>' evita duplicar recordatorios
--               cuando el cron corre cada pocos minutos (unique parcial).
--   push_*    → estado de la cola: la Edge Function send-push reclama filas
--               'pending' (claim_pending_push), envía vía Expo Push API y
--               marca sent/skipped/failed. processing + push_claimed_at
--               permiten reintentar si una corrida murió a medias.
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  category        text not null check (category in ('pagos', 'viajes', 'social', 'mensajes')),
  type            text not null,
  title           text not null check (char_length(btrim(title)) between 1 and 200),
  body            text not null default '' check (char_length(body) <= 1000),
  url             text,
  data            jsonb not null default '{}'::jsonb,
  dedupe_key      text,
  read_at         timestamptz,
  push_status     text not null default 'pending'
                    check (push_status in ('pending', 'processing', 'sent', 'skipped', 'failed')),
  push_claimed_at timestamptz,
  push_sent_at    timestamptz,
  created_at      timestamptz not null default now()
);

-- Historial del centro: más recientes primero.
create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);
-- Contador de no-leídos (badge del ícono).
create index if not exists notifications_unread_idx
  on public.notifications (user_id) where read_at is null;
-- Cola de la Edge Function: solo lo pendiente/en proceso.
create index if not exists notifications_push_queue_idx
  on public.notifications (created_at) where push_status in ('pending', 'processing');
-- Idempotencia de recordatorios programados.
create unique index if not exists notifications_dedupe_uq
  on public.notifications (dedupe_key) where dedupe_key is not null;


-- ###################################################################
-- ## 20260707120001_notifications_functions_rls.sql
-- ###################################################################
-- Unities — Sesión 7: funciones, triggers, RLS y cron de notificaciones.
-- Diseño: cada evento de dominio (mensaje, respuesta Q&A, reserva, pago
-- confirmado, strike, baneo, historia, evento destacado) encola una fila en
-- public.notifications vía triggers de servidor. Las preferencias por
-- categoría se verifican AQUÍ (server-side) antes de encolar: lo desactivado
-- ni siquiera entra al historial. Los recordatorios con horario (pago 24 h/4 h,
-- viaje 1 h) los encola pg_cron; el envío push lo hace la Edge Function
-- send-push (Expo Push API), invocada cada minuto vía pg_net.

-- ===========================================================================
-- Helpers: preferencias y encolado
-- ===========================================================================

-- ¿Tiene el usuario activada esta categoría? Sin fila en notification_prefs =
-- todo activado. SECURITY DEFINER: lo consultan triggers sobre tablas ajenas.
create or replace function public.notification_category_enabled(p_user uuid, p_category text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select case p_category
        when 'pagos'    then np.pagos
        when 'viajes'   then np.viajes
        when 'social'   then np.social
        when 'mensajes' then np.mensajes
        else true
      end
      from public.notification_prefs np
      where np.user_id = p_user),
    true
  );
$$;

-- Punto único de encolado: respeta las preferencias del destinatario y
-- deduplica recordatorios por dedupe_key. Devuelve el id creado (o null si
-- se silenció / dedupe). Server-only: lo llaman triggers y funciones cron.
create or replace function public.enqueue_notification(
  p_user       uuid,
  p_category   text,
  p_type       text,
  p_title      text,
  p_body       text,
  p_url        text default null,
  p_data       jsonb default '{}'::jsonb,
  p_dedupe_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_user is null then
    return null;
  end if;
  -- Preferencias respetadas en el servidor ANTES de encolar/enviar.
  if not public.notification_category_enabled(p_user, p_category) then
    return null;
  end if;

  insert into public.notifications (user_id, category, type, title, body, url, data, dedupe_key)
  values (p_user, p_category, p_type, p_title, coalesce(p_body, ''), p_url,
          coalesce(p_data, '{}'::jsonb), p_dedupe_key)
  on conflict do nothing
  returning id into v_id;

  return v_id;
end;
$$;

-- ===========================================================================
-- RPCs de cliente: registro de push tokens
-- ===========================================================================

-- Upsert por token: si otro usuario inicia sesión en el mismo dispositivo, la
-- fila se reasigna (el teléfono recibe los push de la cuenta activa, nunca de
-- la anterior). Por eso es RPC definer y no un INSERT directo con RLS.
create or replace function public.register_push_token(
  p_token       text,
  p_platform    text,
  p_device_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = 'insufficient_privilege';
  end if;
  if p_platform not in ('ios', 'android', 'web') then
    raise exception 'Plataforma inválida' using errcode = 'check_violation';
  end if;
  if p_token is null or btrim(p_token) = '' then
    raise exception 'Token vacío' using errcode = 'check_violation';
  end if;

  insert into public.push_tokens (user_id, token, platform, device_name)
  values (v_uid, btrim(p_token), p_platform, nullif(btrim(coalesce(p_device_name, '')), ''))
  on conflict (token) do update
    set user_id     = excluded.user_id,
        platform    = excluded.platform,
        device_name = excluded.device_name,
        updated_at  = now();
end;
$$;

-- Al cerrar sesión el cliente da de baja el token del dispositivo (se llama
-- ANTES de signOut, con la sesión aún viva).
create or replace function public.unregister_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = 'insufficient_privilege';
  end if;
  delete from public.push_tokens
  where token = btrim(coalesce(p_token, '')) and user_id = auth.uid();
end;
$$;

-- ===========================================================================
-- Cola de envío: la Edge Function send-push reclama filas pendientes de forma
-- atómica (FOR UPDATE SKIP LOCKED evita corridas concurrentes duplicando push;
-- 'processing' con claim viejo se reintenta si una corrida murió a medias).
-- ===========================================================================

create or replace function public.claim_pending_push(p_limit integer default 100)
returns setof public.notifications
language sql
security definer
set search_path = public
as $$
  update public.notifications n
  set push_status = 'processing', push_claimed_at = now()
  where n.id in (
    select id from public.notifications
    where push_status = 'pending'
       or (push_status = 'processing' and push_claimed_at < now() - interval '5 minutes')
    order by created_at
    limit greatest(coalesce(p_limit, 100), 1)
    for update skip locked
  )
  returning n.*;
$$;

-- ===========================================================================
-- Triggers de eventos de dominio
-- ===========================================================================

-- Mensaje nuevo → notifica a los demás miembros de la conversación. El
-- cliente en primer plano suprime el banner (el chat ya es realtime); con la
-- app en segundo plano llega como push. Deep link: /chat/<conversación>.
create or replace function public.notify_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv    public.conversations;
  v_sender  text;
  v_preview text;
  v_title   text;
  v_member  record;
begin
  select * into v_conv from public.conversations where id = new.conversation_id;

  select coalesce(nullif(btrim(full_name), ''), 'Estudiante') into v_sender
  from public.profiles where id = new.sender_id;

  v_preview := coalesce(nullif(left(btrim(new.body), 120), ''),
                        case when new.image_path is not null then '📷 Foto' else '' end);
  v_title := case
    when v_conv.kind = 'soporte' then 'Soporte Unities · ' || v_sender
    else v_sender
  end;

  for v_member in
    select user_id from public.conversation_members
    where conversation_id = new.conversation_id and user_id <> new.sender_id
  loop
    perform public.enqueue_notification(
      v_member.user_id, 'mensajes', v_conv.kind, v_title, v_preview,
      '/chat/' || new.conversation_id,
      jsonb_build_object('conversationId', new.conversation_id, 'senderId', new.sender_id)
    );
  end loop;

  return null;
end;
$$;

drop trigger if exists messages_notify on public.messages;
create trigger messages_notify after insert on public.messages
  for each row execute function public.notify_on_message();

-- Respuesta en Q&A → notifica al autor de la pregunta (respuesta oficial de
-- tutor/federación destacada como tal). Deep link: /qa/<pregunta>.
create or replace function public.notify_on_question_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_question public.questions;
  v_replier  text;
begin
  select * into v_question from public.questions where id = new.question_id;
  if v_question.author_id is null or v_question.author_id = new.author_id then
    return null;
  end if;

  select coalesce(nullif(btrim(full_name), ''), 'Alguien') into v_replier
  from public.profiles where id = new.author_id;

  perform public.enqueue_notification(
    v_question.author_id,
    'social',
    case when new.is_official then 'qa_oficial' else 'qa_respuesta' end,
    case when new.is_official
      then '✅ Respuesta oficial a tu pregunta'
      else v_replier || ' respondió tu pregunta' end,
    left(btrim(new.body), 140),
    '/qa/' || new.question_id,
    jsonb_build_object('questionId', new.question_id, 'official', new.is_official)
  );
  return null;
end;
$$;

drop trigger if exists question_replies_notify on public.question_replies;
create trigger question_replies_notify after insert on public.question_replies
  for each row execute function public.notify_on_question_reply();

-- Reserva nueva → notifica al conductor. Deep link: /trip/<viaje>.
create or replace function public.notify_on_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip      public.trips;
  v_passenger text;
begin
  if new.status = 'cancelled' then
    return null;
  end if;

  select * into v_trip from public.trips where id = new.trip_id;
  select coalesce(nullif(btrim(full_name), ''), 'Un estudiante') into v_passenger
  from public.profiles where id = new.passenger_id;

  perform public.enqueue_notification(
    v_trip.driver_id, 'viajes', 'reserva_nueva',
    '🎟️ Nueva reserva en tu viaje',
    v_passenger || ' reservó un cupo ' ||
      coalesce(v_trip.origin_campus_name, 'origen') || ' → ' ||
      coalesce(v_trip.destination_campus_name, 'destino') || '.',
    '/trip/' || v_trip.id,
    jsonb_build_object('tripId', v_trip.id, 'bookingId', new.id)
  );
  return null;
end;
$$;

drop trigger if exists bookings_notify on public.bookings;
create trigger bookings_notify after insert on public.bookings
  for each row execute function public.notify_on_booking();

-- Pago confirmado por el conductor → avisa al pasajero.
create or replace function public.notify_on_payment_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
begin
  if new.status = 'confirmed' and old.status <> 'confirmed' then
    select * into v_booking from public.bookings where id = new.booking_id;
    perform public.enqueue_notification(
      v_booking.passenger_id, 'pagos', 'pago_confirmado',
      '✅ Pago confirmado',
      'El conductor confirmó tu pago de $' || new.total_clp || '. ¡Buen viaje!',
      '/my-trips',
      jsonb_build_object('bookingId', new.booking_id, 'paymentId', new.id)
    );
  end if;
  return null;
end;
$$;

drop trigger if exists payments_notify on public.payments;
create trigger payments_notify after update on public.payments
  for each row execute function public.notify_on_payment_update();

-- Strike por impago (los emite expire_overdue_payments, Sesión 3).
create or replace function public.notify_on_strike()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.enqueue_notification(
    new.user_id, 'pagos', 'strike',
    '⚠️ Recibiste un strike por pago vencido',
    'Se venció el plazo de 48 h de un pago. Al tercer strike quedas 2 días fuera de los turnos.',
    '/my-trips',
    jsonb_build_object('strikeId', new.id, 'bookingId', new.booking_id)
  );
  return null;
end;
$$;

drop trigger if exists strikes_notify on public.strikes;
create trigger strikes_notify after insert on public.strikes
  for each row execute function public.notify_on_strike();

-- Baneo de turnos (3.er strike): profiles.payment_ban_until avanza.
create or replace function public.notify_on_ban()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payment_ban_until is not null
     and new.payment_ban_until > now()
     and (old.payment_ban_until is null or new.payment_ban_until > old.payment_ban_until) then
    perform public.enqueue_notification(
      new.id, 'pagos', 'baneo',
      '🚫 Quedaste fuera de los turnos por 2 días',
      'Acumulaste 3 strikes por impago. Podrás volver a reservar el ' ||
        to_char(new.payment_ban_until at time zone 'America/Santiago', 'DD/MM "a las" HH24:MI') || '.',
      '/my-trips',
      jsonb_build_object('banUntil', new.payment_ban_until)
    );
  end if;
  return null;
end;
$$;

drop trigger if exists profiles_notify_ban on public.profiles;
create trigger profiles_notify_ban after update on public.profiles
  for each row execute function public.notify_on_ban();

-- Historia nueva de un publisher → notifica a la comunidad (no hay tabla de
-- follows todavía: va a todos los alumnos con la categoría social activa;
-- inserción masiva en un solo INSERT..SELECT). Deep link: feed.
create or replace function public.notify_on_story()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_publisher text;
begin
  select name into v_publisher from public.publishers where id = new.publisher_id;

  insert into public.notifications (user_id, category, type, title, body, url, data)
  select p.id, 'social', 'historia',
         '📸 ' || coalesce(v_publisher, 'Un publisher') || ' subió una historia',
         coalesce(nullif(btrim(new.caption), ''), 'Toca para verla antes de que expire.'),
         '/',
         jsonb_build_object('storyId', new.id, 'publisherId', new.publisher_id)
  from public.profiles p
  where p.id is distinct from new.author_id
    and public.notification_category_enabled(p.id, 'social');

  return null;
end;
$$;

drop trigger if exists stories_notify on public.stories;
create trigger stories_notify after insert on public.stories
  for each row execute function public.notify_on_story();

-- Evento destacado en el widget semanal (widget_config.featured, Sesión 5) →
-- notifica a la comunidad una sola vez por post (dedupe por usuario).
create or replace function public.notify_on_featured_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post      public.posts;
  v_publisher text;
begin
  if not new.featured or (tg_op = 'UPDATE' and old.featured) then
    return null;
  end if;

  select * into v_post from public.posts where id = new.post_id;
  if v_post.id is null then
    return null;
  end if;
  select name into v_publisher from public.publishers where id = v_post.publisher_id;

  insert into public.notifications (user_id, category, type, title, body, url, data, dedupe_key)
  select p.id, 'social', 'evento_destacado',
         '⭐ Evento destacado de ' || coalesce(v_publisher, 'la semana'),
         coalesce(nullif(left(btrim(v_post.body), 140), ''), 'Revisa el evento destacado de la semana.') ||
           coalesce(' · ' || to_char(v_post.event_starts_at at time zone 'America/Santiago', 'DD/MM HH24:MI'), ''),
         '/',
         jsonb_build_object('postId', v_post.id, 'publisherId', v_post.publisher_id),
         'evento_destacado:' || v_post.id || ':' || p.id
  from public.profiles p
  where public.notification_category_enabled(p.id, 'social')
  on conflict do nothing;

  return null;
end;
$$;

drop trigger if exists widget_config_notify on public.widget_config;
create trigger widget_config_notify after insert or update on public.widget_config
  for each row execute function public.notify_on_featured_event();

-- ===========================================================================
-- Recordatorios programados (pg_cron cada 5 min): son idempotentes gracias a
-- dedupe_key, así que da igual cuántas veces corran dentro de la ventana.
-- ===========================================================================

-- Pago por vencer: recordatorio a las 24 h y a las 4 h del plazo de 48 h.
create or replace function public.enqueue_payment_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_rec   record;
begin
  for v_rec in
    select pay.id as payment_id, pay.total_clp, pay.due_at, b.id as booking_id, b.passenger_id,
           case when pay.due_at <= now() + interval '4 hours' then '4h' else '24h' end as window
    from public.payments pay
    join public.bookings b on b.id = pay.booking_id
    where pay.status = 'pending'
      and b.status <> 'cancelled'
      and pay.due_at > now()
      and pay.due_at <= now() + interval '24 hours'
  loop
    if v_rec.window = '4h' then
      if public.enqueue_notification(
        v_rec.passenger_id, 'pagos', 'pago_4h',
        '🚨 Últimas 4 horas para pagar',
        'Tu pago de $' || v_rec.total_clp || ' vence a las ' ||
          to_char(v_rec.due_at at time zone 'America/Santiago', 'HH24:MI') ||
          '. Si no pagas recibirás un strike.',
        '/payment?bookingId=' || v_rec.booking_id,
        jsonb_build_object('bookingId', v_rec.booking_id, 'paymentId', v_rec.payment_id),
        'pago_4h:' || v_rec.payment_id
      ) is not null then
        v_count := v_count + 1;
      end if;
    else
      if public.enqueue_notification(
        v_rec.passenger_id, 'pagos', 'pago_24h',
        '⏳ Tu pago vence en menos de 24 horas',
        'Paga $' || v_rec.total_clp || ' de tu viaje antes del ' ||
          to_char(v_rec.due_at at time zone 'America/Santiago', 'DD/MM "a las" HH24:MI') ||
          ' para mantener tu racha y evitar strikes.',
        '/payment?bookingId=' || v_rec.booking_id,
        jsonb_build_object('bookingId', v_rec.booking_id, 'paymentId', v_rec.payment_id),
        'pago_24h:' || v_rec.payment_id
      ) is not null then
        v_count := v_count + 1;
      end if;
    end if;
  end loop;

  return v_count;
end;
$$;

-- Viaje que sale en 1 h: recordatorio a pasajeros confirmados y al conductor,
-- con el punto de encuentro en el cuerpo y deep link al detalle del viaje.
create or replace function public.enqueue_trip_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_rec   record;
  v_place text;
begin
  for v_rec in
    select t.id as trip_id, t.departs_at, t.origin_campus_name, t.meeting_point_id,
           t.driver_id, b.passenger_id
    from public.trips t
    join public.bookings b on b.trip_id = t.id and b.status = 'confirmed'
    where t.status in ('published', 'full')
      and t.departs_at > now()
      and t.departs_at <= now() + interval '1 hour'
  loop
    v_place := coalesce(v_rec.origin_campus_name, 'el punto de encuentro acordado');

    -- Pasajero
    if public.enqueue_notification(
      v_rec.passenger_id, 'viajes', 'viaje_1h',
      '🚗 Tu viaje sale en 1 hora',
      'Sale a las ' || to_char(v_rec.departs_at at time zone 'America/Santiago', 'HH24:MI') ||
        ' desde ' || v_place || '. Revisa el punto de encuentro en el detalle.',
      '/trip/' || v_rec.trip_id,
      jsonb_build_object('tripId', v_rec.trip_id, 'meetingPointId', v_rec.meeting_point_id),
      'viaje_1h:' || v_rec.trip_id || ':' || v_rec.passenger_id
    ) is not null then
      v_count := v_count + 1;
    end if;

    -- Conductor (dedupe por viaje: aunque haya varios pasajeros, un solo aviso)
    if public.enqueue_notification(
      v_rec.driver_id, 'viajes', 'viaje_1h',
      '🚗 Tu viaje como conductor sale en 1 hora',
      'Sale a las ' || to_char(v_rec.departs_at at time zone 'America/Santiago', 'HH24:MI') ||
        ' desde ' || v_place || '. Tus pasajeros ya fueron avisados.',
      '/trip/' || v_rec.trip_id,
      jsonb_build_object('tripId', v_rec.trip_id, 'meetingPointId', v_rec.meeting_point_id),
      'viaje_1h:' || v_rec.trip_id || ':' || v_rec.driver_id
    ) is not null then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

-- ===========================================================================
-- Protección de columnas: el cliente solo puede tocar read_at (marcar leído);
-- todo lo demás es del servidor (patrón protect_question_columns, Sesión 6).
-- ===========================================================================

create or replace function public.protect_notification_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;  -- contexto de servidor: confía en el cambio
  end if;
  new.user_id         := old.user_id;
  new.category        := old.category;
  new.type            := old.type;
  new.title           := old.title;
  new.body            := old.body;
  new.url             := old.url;
  new.data            := old.data;
  new.dedupe_key      := old.dedupe_key;
  new.push_status     := old.push_status;
  new.push_claimed_at := old.push_claimed_at;
  new.push_sent_at    := old.push_sent_at;
  new.created_at      := old.created_at;
  return new;
end;
$$;

drop trigger if exists notifications_protect_columns on public.notifications;
create trigger notifications_protect_columns before update on public.notifications
  for each row execute function public.protect_notification_columns();

drop trigger if exists push_tokens_set_updated_at on public.push_tokens;
create trigger push_tokens_set_updated_at before update on public.push_tokens
  for each row execute function public.set_updated_at();

drop trigger if exists notification_prefs_set_updated_at on public.notification_prefs;
create trigger notification_prefs_set_updated_at before update on public.notification_prefs
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- Row Level Security
-- ===========================================================================

alter table public.push_tokens        enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.notifications      enable row level security;

-- push_tokens: cada quien ve/borra los suyos; alta y reasignación SOLO por RPC.
drop policy if exists push_tokens_select_own on public.push_tokens;
create policy push_tokens_select_own on public.push_tokens
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists push_tokens_delete_own on public.push_tokens;
create policy push_tokens_delete_own on public.push_tokens
  for delete to authenticated using (user_id = (select auth.uid()));

-- notification_prefs: el dueño lee y hace upsert de sus switches.
drop policy if exists notification_prefs_select_own on public.notification_prefs;
create policy notification_prefs_select_own on public.notification_prefs
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists notification_prefs_insert_own on public.notification_prefs;
create policy notification_prefs_insert_own on public.notification_prefs
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists notification_prefs_update_own on public.notification_prefs;
create policy notification_prefs_update_own on public.notification_prefs
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- notifications: el dueño lee su historial y marca leído (protect trigger
-- limita el UPDATE a read_at); insertar es exclusivo del servidor.
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ===========================================================================
-- Permisos de ejecución (patrón Sesión 3: revocar todo, conceder lo mínimo)
-- ===========================================================================

revoke execute on function public.notification_category_enabled(uuid, text) from public, anon, authenticated;
revoke execute on function public.enqueue_notification(uuid, text, text, text, text, text, jsonb, text) from public, anon, authenticated;
revoke execute on function public.register_push_token(text, text, text)   from public, anon;
revoke execute on function public.unregister_push_token(text)             from public, anon;
revoke execute on function public.claim_pending_push(integer)             from public, anon, authenticated;
revoke execute on function public.enqueue_payment_reminders()             from public, anon, authenticated;
revoke execute on function public.enqueue_trip_reminders()                from public, anon, authenticated;
revoke execute on function public.notify_on_message()                     from public, anon, authenticated;
revoke execute on function public.notify_on_question_reply()              from public, anon, authenticated;
revoke execute on function public.notify_on_booking()                     from public, anon, authenticated;
revoke execute on function public.notify_on_payment_update()              from public, anon, authenticated;
revoke execute on function public.notify_on_strike()                      from public, anon, authenticated;
revoke execute on function public.notify_on_ban()                         from public, anon, authenticated;
revoke execute on function public.notify_on_story()                       from public, anon, authenticated;
revoke execute on function public.notify_on_featured_event()              from public, anon, authenticated;
revoke execute on function public.protect_notification_columns()          from public, anon, authenticated;

grant execute on function public.register_push_token(text, text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;
-- La Edge Function send-push (service role) reclama la cola.
grant execute on function public.claim_pending_push(integer) to service_role;

-- ===========================================================================
-- Realtime: el centro de notificaciones y el badge se actualizan en vivo.
-- La RLS filtra: cada cliente solo recibe sus propias notificaciones.
-- ===========================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
exception when undefined_object then
  raise notice 'La publicación supabase_realtime no existe; créala desde el dashboard.';
end;
$$;

-- ===========================================================================
-- pg_cron: encolar recordatorios cada 5 min y disparar el envío push cada
-- minuto. El envío HTTP usa pg_net → Edge Function send-push (Expo Push API).
-- ===========================================================================

create extension if not exists pg_net;

-- Invoca la Edge Function send-push. La URL del proyecto no es secreta (vive
-- en el .env del app como EXPO_PUBLIC_SUPABASE_URL); send-push se despliega
-- sin verify_jwt (como expire-payments): solo procesa la cola interna y
-- responde contadores, sin exponer datos.
create or replace function public.invoke_send_push()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url     := 'https://jkqzuddxahoamoygdrrb.supabase.co/functions/v1/send-push',
    body    := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 10000
  );
exception when others then
  raise notice 'pg_net no disponible (%): invoca send-push desde un scheduler externo.', sqlerrm;
end;
$$;

revoke execute on function public.invoke_send_push() from public, anon, authenticated;

-- Reprograma de forma idempotente (patrón 20260701000004_cron_seed.sql).
do $$
declare
  v_job text;
begin
  foreach v_job in array array['notifications-reminders', 'notifications-send-push']
  loop
    perform cron.unschedule(v_job)
    where exists (select 1 from cron.job where jobname = v_job);
  end loop;
exception when others then
  null;  -- pg_cron no disponible en algunos entornos locales; se ignora.
end;
$$;

do $$
begin
  perform cron.schedule(
    'notifications-reminders',
    '*/5 * * * *',
    $cron$ select public.enqueue_payment_reminders(), public.enqueue_trip_reminders(); $cron$
  );
  perform cron.schedule(
    'notifications-send-push',
    '* * * * *',
    $cron$ select public.invoke_send_push(); $cron$
  );
exception when others then
  raise notice 'pg_cron no disponible; programa los recordatorios y send-push con un scheduler externo.';
end;
$$;




-- ###################################################################
-- ## 20260708120000_payments_schema.sql
-- ###################################################################
-- Unities — Sesión 8: pagos avanzados.
-- Pasarela/verificador chileno (Fintoc) + verificación automática por webhook,
-- disputas ("yo sí pagué"), liquidaciones al conductor, pago parcial con créditos
-- y configuración financiera del owner.
--
-- Cambio de fuente de verdad (docs/backend.md): la protección frente al strike de
-- 48 h deja de ser la palabra del pasajero (marcar pagado) y pasa a ser el estado
-- VERIFICADO ('confirmed', que fija el webhook del proveedor o el conductor). Un
-- pago sin verificar al vencer el plazo → strike; una disputa lo congela.
--
-- Convención de la Sesión 3: snake_case, uuid, timestamptz created_at/updated_at.

-- ---------------------------------------------------------------------------
-- platform_config — parámetros financieros que ajusta el owner (fila única).
--   commission_clp          → comisión de Unities por cupo (la fija reserve_seat).
--   credit_clp_rate         → cuántos CLP cubre 1 crédito al pagar parcialmente.
--   max_credit_discount_pct → tope del precio del cupo pagable con créditos.
-- Solo el owner escribe (RPC update_platform_config); lectura autenticada.
-- ---------------------------------------------------------------------------
create table if not exists public.platform_config (
  id                      text primary key default 'default' check (id = 'default'),
  commission_clp          integer not null default 300 check (commission_clp >= 0),
  credit_clp_rate         integer not null default 5   check (credit_clp_rate >= 1),
  max_credit_discount_pct integer not null default 50  check (max_credit_discount_pct between 0 and 100),
  updated_by              uuid references public.profiles (id) on delete set null,
  updated_at              timestamptz not null default now()
);

insert into public.platform_config (id) values ('default') on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- payments — columnas de proveedor, verificación y pago con créditos.
--   provider           → 'fintoc' | 'manual' | 'credits'.
--   provider_intent_id → id de la intención de pago del proveedor (webhook lo busca).
--   verified_at        → cuándo el webhook (o los créditos) verificaron el pago.
--   credits_applied    → créditos Unities aplicados; credits_clp su valor en CLP.
--   cash_clp           → parte a cobrar por la pasarela (total - credits_clp).
--   payout_id          → liquidación en la que se incluyó (null = aún sin liquidar).
-- ---------------------------------------------------------------------------
alter table public.payments
  add column if not exists provider           text
    check (provider is null or provider in ('fintoc', 'manual', 'credits')),
  add column if not exists provider_intent_id text,
  add column if not exists provider_status    text,
  add column if not exists verified_at        timestamptz,
  add column if not exists credits_applied    integer not null default 0 check (credits_applied >= 0),
  add column if not exists credits_clp        integer not null default 0 check (credits_clp >= 0),
  add column if not exists cash_clp           integer;

-- Se suma el estado 'disputed' (pago congelado mientras se revisa una disputa).
alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status in ('pending', 'marked', 'confirmed', 'overdue', 'disputed'));

-- El webhook resuelve el pago por su provider_intent_id: debe ser único.
create unique index if not exists payments_provider_intent_uq
  on public.payments (provider_intent_id)
  where provider_intent_id is not null;

-- ---------------------------------------------------------------------------
-- strikes — estado del strike para poder congelarlo/revertirlo en una disputa.
--   active  → cuenta para el baneo.
--   frozen  → congelado mientras se revisa la disputa (no cuenta).
--   reverted→ anulado porque la disputa dio la razón al pasajero.
-- ---------------------------------------------------------------------------
alter table public.strikes
  add column if not exists status     text not null default 'active'
    check (status in ('active', 'frozen', 'reverted')),
  add column if not exists dispute_id uuid;

-- ---------------------------------------------------------------------------
-- payment_events — bitácora de eventos del proveedor (auditoría + idempotencia).
-- El webhook inserta antes de procesar; el unique (provider, provider_event_id)
-- descarta reintentos/duplicados. Sin acceso de cliente (solo service_role/owner).
-- ---------------------------------------------------------------------------
create table if not exists public.payment_events (
  id                uuid primary key default gen_random_uuid(),
  payment_id        uuid references public.payments (id) on delete set null,
  provider          text not null,
  provider_event_id text not null,
  event_type        text not null,
  payload           jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create index if not exists payment_events_payment_idx on public.payment_events (payment_id);

-- ---------------------------------------------------------------------------
-- disputes — flujo "yo sí pagué": comprobante que congela el strike hasta que
-- admin/owner resuelva. Enlazada a un ticket de Soporte Unities (Sesión 6).
-- ---------------------------------------------------------------------------
create table if not exists public.disputes (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null references public.bookings (id) on delete cascade,
  payment_id      uuid references public.payments (id) on delete set null,
  opened_by       uuid not null references public.profiles (id) on delete cascade,
  reason          text not null default '',
  evidence_path   text,
  status          text not null default 'abierta'
                    check (status in ('abierta', 'resuelta_pagada', 'resuelta_rechazada')),
  conversation_id uuid references public.conversations (id) on delete set null,
  resolved_by     uuid references public.profiles (id) on delete set null,
  resolution_note text,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Una única disputa abierta por reserva.
create unique index if not exists disputes_open_unique
  on public.disputes (booking_id) where status = 'abierta';
create index if not exists disputes_status_idx on public.disputes (status, created_at desc);
create index if not exists disputes_opened_by_idx on public.disputes (opened_by);

-- Ahora que existe disputes, la FK del strike congelado.
alter table public.strikes drop constraint if exists strikes_dispute_fk;
alter table public.strikes add constraint strikes_dispute_fk
  foreign key (dispute_id) references public.disputes (id) on delete set null;

-- ---------------------------------------------------------------------------
-- payouts — liquidaciones al conductor. Agrupa pagos confirmados en un periodo:
-- bruto (lo que pagaron los pasajeros), comisión Unities y neto (lo que recibe
-- el conductor). El owner las crea/marca pagadas; el conductor las consulta.
-- ---------------------------------------------------------------------------
create table if not exists public.payouts (
  id             uuid primary key default gen_random_uuid(),
  driver_id      uuid not null references public.profiles (id) on delete cascade,
  period_start   timestamptz not null,
  period_end     timestamptz not null,
  gross_clp      integer not null default 0,
  commission_clp integer not null default 0,
  net_clp        integer not null default 0,
  payment_count  integer not null default 0,
  status         text not null default 'pendiente' check (status in ('pendiente', 'pagada')),
  note           text,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  paid_at        timestamptz
);

create index if not exists payouts_driver_idx on public.payouts (driver_id, created_at desc);

alter table public.payments
  add column if not exists payout_id uuid references public.payouts (id) on delete set null;


-- ###################################################################
-- ## 20260708120001_payments_functions_rls.sql
-- ###################################################################
-- Unities — Sesión 8: funciones de servidor, triggers y RLS de pagos avanzados.
-- La lógica crítica vive en Postgres (imposible de burlar desde el cliente):
-- verificación por webhook, disputas, liquidaciones, pago con créditos y el
-- cambio de fuente de verdad del strike (verificado, no "palabra del pasajero").

-- ===========================================================================
-- updated_at para las tablas nuevas
-- ===========================================================================
drop trigger if exists platform_config_set_updated_at on public.platform_config;
create trigger platform_config_set_updated_at before update on public.platform_config
  for each row execute function public.set_updated_at();

drop trigger if exists disputes_set_updated_at on public.disputes;
create trigger disputes_set_updated_at before update on public.disputes
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- reserve_seat: la comisión pasa a leerse de platform_config (la ajusta el
-- owner). Reemplaza la constante fija de la Sesión 3; el resto es idéntico.
-- ===========================================================================
create or replace function public.reserve_seat(p_trip_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_commission_clp integer;
  v_uid uuid := auth.uid();
  v_trip public.trips;
  v_profile public.profiles;
  v_booking public.bookings;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = 'insufficient_privilege';
  end if;

  select commission_clp into v_commission_clp from public.platform_config where id = 'default';
  v_commission_clp := coalesce(v_commission_clp, 300);

  select * into v_profile from public.profiles where id = v_uid;
  if v_profile.payment_ban_until is not null and v_profile.payment_ban_until > now() then
    raise exception 'Baneado de los turnos por impago hasta %', v_profile.payment_ban_until
      using errcode = 'check_violation';
  end if;
  if v_profile.block_until is not null and v_profile.block_until > now() then
    raise exception 'Usuario bloqueado por cancelaciones tardías hasta %', v_profile.block_until
      using errcode = 'check_violation';
  end if;

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

  insert into public.payments (booking_id, status, price_clp, commission_clp, total_clp, cash_clp, due_at)
  values (
    v_booking.id,
    'pending',
    v_trip.price_clp,
    v_commission_clp,
    v_trip.price_clp + v_commission_clp,
    v_trip.price_clp + v_commission_clp,
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
-- Recompensas al confirmar un pago (créditos + racha + descuento de créditos
-- aplicados). Se centraliza en un trigger para que TODAS las vías de "pago
-- verificado" (webhook, conductor, disputa aprobada) recompensen igual, sin
-- duplicar la lógica ni el premio.
-- ===========================================================================
create or replace function public.award_on_payment_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_passenger uuid;
  v_paid_at timestamptz;
  v_on_time boolean;
  v_next_streak int;
begin
  if not (new.status = 'confirmed' and old.status <> 'confirmed') then
    return null;
  end if;

  select passenger_id into v_passenger from public.bookings where id = new.booking_id;
  if v_passenger is null then
    return null;
  end if;

  -- Descuenta del saldo los créditos aplicados a este pago (pago parcial).
  if coalesce(new.credits_applied, 0) > 0 then
    insert into public.credit_transactions (user_id, entry_type, source, amount, description, reference_id)
    values (v_passenger, 'cargo', 'ajuste', new.credits_applied,
            'Créditos aplicados al pago del viaje', new.booking_id::text);
  end if;

  v_paid_at := coalesce(new.verified_at, new.marked_at, new.confirmed_at, now());
  v_on_time := v_paid_at <= new.due_at;

  if v_on_time then
    update public.profiles
      set streak_on_time_payments = streak_on_time_payments + 1,
          best_streak_on_time_payments = greatest(best_streak_on_time_payments, streak_on_time_payments + 1),
          reward_points = reward_points + 5
    where id = v_passenger
    returning streak_on_time_payments into v_next_streak;

    insert into public.credit_transactions (user_id, entry_type, source, amount, description, reference_id)
    values (v_passenger, 'abono', 'viaje', 25, 'Pago confirmado a tiempo', new.booking_id::text);

    if v_next_streak % 3 = 0 then
      update public.profiles set reward_points = reward_points + 25 where id = v_passenger;
      insert into public.credit_transactions (user_id, entry_type, source, amount, description)
      values (v_passenger, 'abono', 'racha', 50, 'Racha de ' || v_next_streak || ' pagos a tiempo');
    end if;
  else
    update public.profiles set streak_on_time_payments = 0 where id = v_passenger;
  end if;

  return null;
end;
$$;

revoke execute on function public.award_on_payment_confirmed() from public, anon, authenticated;

drop trigger if exists payments_award_confirmed on public.payments;
create trigger payments_award_confirmed after update on public.payments
  for each row execute function public.award_on_payment_confirmed();

-- confirm_payment_received se simplifica: solo marca 'confirmed'; el trigger
-- de arriba entrega créditos/racha (antes vivían aquí, ahora compartidos).
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
  if v_payment.status = 'disputed' then
    raise exception 'Este pago está en disputa; resuélvela primero' using errcode = 'check_violation';
  end if;

  update public.payments
    set status = 'confirmed',
        provider = coalesce(provider, 'manual'),
        marked_at = coalesce(marked_at, now()),
        verified_at = coalesce(verified_at, now()),
        confirmed_at = now()
  where booking_id = p_booking_id
  returning * into v_payment;

  return v_payment;
end;
$$;

-- ===========================================================================
-- Strike por impago (helper reutilizable): suma strike, resetea racha y banea
-- 2 días al tercero. Lo usan expire_overdue_payments y resolve_dispute.
-- ===========================================================================
create or replace function public._register_payment_strike(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next int;
begin
  update public.profiles
    set payment_strikes_count = payment_strikes_count + 1,
        last_payment_strike_at = now(),
        streak_on_time_payments = 0
  where id = p_user
  returning payment_strikes_count into v_next;

  if v_next >= 3 then
    update public.profiles
      set payment_strikes_count = 0,
          payment_ban_until = now() + interval '2 days'
    where id = p_user;
  end if;
end;
$$;

revoke execute on function public._register_payment_strike(uuid) from public, anon, authenticated;

-- expire_overdue_payments: cambia la fuente de verdad. Ahora también strikea los
-- pagos 'marked' (marcar pagado es solo la palabra del pasajero, no protege);
-- solo el pago VERIFICADO ('confirmed') o en disputa se salva.
create or replace function public.expire_overdue_payments()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec record;
  v_count int := 0;
begin
  for v_rec in
    select pay.id as payment_id, b.id as booking_id, b.passenger_id
    from public.payments pay
    join public.bookings b on b.id = pay.booking_id
    where pay.status in ('pending', 'marked')
      and pay.due_at < now()
      and b.status <> 'cancelled'
    for update of pay
  loop
    update public.payments set status = 'overdue' where id = v_rec.payment_id;

    insert into public.strikes (user_id, booking_id, kind, occurred_at, status)
    values (v_rec.passenger_id, v_rec.booking_id, 'payment', now(), 'active');

    perform public._register_payment_strike(v_rec.passenger_id);

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.expire_overdue_payments() from public, anon, authenticated;

-- ===========================================================================
-- Intención de pago (service_role). La crea la Edge Function create-payment-intent
-- tras autenticar al pasajero por su JWT. Valida la reserva, calcula el pago
-- parcial con créditos (sin descontarlos aún: se descuentan al verificar) y deja
-- el pago listo para la pasarela. Si los créditos cubren todo, confirma directo.
-- ===========================================================================
create or replace function public.prepare_payment_intent(
  p_user      uuid,
  p_booking_id uuid,
  p_credits    integer default 0
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bk public.bookings;
  v_payment public.payments;
  v_cfg public.platform_config;
  v_balance integer;
  v_max_credits_clp integer;
  v_credits int;
  v_credits_clp int;
  v_cash int;
begin
  select * into v_bk from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'Reserva no encontrada' using errcode = 'no_data_found';
  end if;
  if v_bk.passenger_id <> p_user then
    raise exception 'Solo el pasajero puede iniciar su pago' using errcode = 'insufficient_privilege';
  end if;
  if v_bk.status = 'cancelled' then
    raise exception 'La reserva está cancelada' using errcode = 'check_violation';
  end if;

  select * into v_payment from public.payments where booking_id = p_booking_id for update;
  if v_payment.status = 'confirmed' then
    raise exception 'Este pago ya fue verificado' using errcode = 'check_violation';
  end if;
  if v_payment.status = 'disputed' then
    raise exception 'Este pago está en disputa' using errcode = 'check_violation';
  end if;

  select * into v_cfg from public.platform_config where id = 'default';

  -- Saldo directo (no via credit_balance: esta corre como service_role).
  select coalesce(sum(case when entry_type = 'abono' then amount else -amount end), 0)::int
    into v_balance
  from public.credit_transactions where user_id = p_user;

  -- Tope de créditos por el % del precio del cupo (la comisión siempre va en efectivo).
  v_max_credits_clp := (v_payment.price_clp * coalesce(v_cfg.max_credit_discount_pct, 50)) / 100;
  v_credits := greatest(0, coalesce(p_credits, 0));
  v_credits := least(v_credits, v_balance);
  v_credits_clp := least(v_credits * coalesce(v_cfg.credit_clp_rate, 5), v_max_credits_clp, v_payment.price_clp);
  -- Redondea los créditos al valor efectivamente aplicado (evita cobrar de más).
  v_credits := v_credits_clp / coalesce(v_cfg.credit_clp_rate, 5);
  v_cash := v_payment.total_clp - v_credits_clp;

  if v_cash <= 0 then
    -- Cubierto por completo con créditos: se verifica sin pasar por la pasarela.
    update public.payments
      set provider = 'credits',
          provider_status = 'succeeded',
          credits_applied = v_credits,
          credits_clp = v_credits_clp,
          cash_clp = 0,
          status = 'confirmed',
          verified_at = now(),
          marked_at = coalesce(marked_at, now()),
          confirmed_at = now()
    where booking_id = p_booking_id
    returning * into v_payment;
    return v_payment;
  end if;

  update public.payments
    set provider = 'fintoc',
        provider_status = 'intent_pending',
        credits_applied = v_credits,
        credits_clp = v_credits_clp,
        cash_clp = v_cash
  where booking_id = p_booking_id
  returning * into v_payment;

  return v_payment;
end;
$$;

revoke execute on function public.prepare_payment_intent(uuid, uuid, integer) from public, anon, authenticated;
-- La llama la Edge Function create-payment-intent con la service role key.
grant execute on function public.prepare_payment_intent(uuid, uuid, integer) to service_role;

-- Guarda el id de la intención del proveedor una vez creada (service_role).
create or replace function public.attach_provider_intent(
  p_payment_id uuid,
  p_intent_id  text,
  p_status     text default 'intent_pending'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.payments
    set provider_intent_id = p_intent_id,
        provider_status = p_status
  where id = p_payment_id and status <> 'confirmed';
end;
$$;

revoke execute on function public.attach_provider_intent(uuid, text, text) from public, anon, authenticated;
grant execute on function public.attach_provider_intent(uuid, text, text) to service_role;

-- ===========================================================================
-- Verificación automática (service_role): el webhook del proveedor la invoca al
-- confirmarse la transferencia. Marca 'confirmed' (el trigger dispara push +
-- créditos). Idempotente. Si había una disputa abierta, la resuelve a favor del
-- pasajero (el banco confirma que pagó).
-- ===========================================================================
create or replace function public.apply_payment_verification(
  p_intent_id   text,
  p_provider    text default 'fintoc',
  p_verified_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments;
  v_dispute public.disputes;
begin
  select * into v_payment from public.payments
  where provider_intent_id = p_intent_id for update;
  if not found then
    return null;  -- intención desconocida (evento no relacionado): se ignora
  end if;
  if v_payment.status = 'confirmed' then
    return v_payment.id;  -- ya verificado: no-op idempotente
  end if;

  -- Si estaba en disputa, el banco le da la razón al pasajero.
  select * into v_dispute from public.disputes
  where booking_id = v_payment.booking_id and status = 'abierta' for update;
  if found then
    update public.disputes
      set status = 'resuelta_pagada',
          resolution_note = 'Verificado automáticamente por el proveedor',
          resolved_at = now(),
          updated_at = now()
    where id = v_dispute.id;
    update public.strikes set status = 'reverted'
    where dispute_id = v_dispute.id and status = 'frozen';
  end if;

  update public.payments
    set status = 'confirmed',
        provider = coalesce(provider, p_provider),
        provider_status = 'succeeded',
        verified_at = p_verified_at,
        marked_at = coalesce(marked_at, p_verified_at),
        confirmed_at = now()
  where id = v_payment.id
  returning * into v_payment;

  return v_payment.id;
end;
$$;

revoke execute on function public.apply_payment_verification(text, text, timestamptz) from public, anon, authenticated;
-- La llama el webhook fintoc-webhook con la service role key.
grant execute on function public.apply_payment_verification(text, text, timestamptz) to service_role;

-- ===========================================================================
-- Disputas: "yo sí pagué". Congela el strike y abre un ticket de soporte.
-- ===========================================================================
create or replace function public.open_dispute(
  p_booking_id    uuid,
  p_reason        text default '',
  p_evidence_path text default null
)
returns public.disputes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_bk public.bookings;
  v_payment public.payments;
  v_conv public.conversations;
  v_dispute public.disputes;
  v_frozen int;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = 'insufficient_privilege';
  end if;

  select * into v_bk from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'Reserva no encontrada' using errcode = 'no_data_found';
  end if;
  if v_bk.passenger_id <> v_uid then
    raise exception 'Solo el pasajero puede abrir una disputa' using errcode = 'insufficient_privilege';
  end if;

  select * into v_payment from public.payments where booking_id = p_booking_id for update;
  if v_payment.status = 'confirmed' then
    raise exception 'Este pago ya está verificado; no hay nada que disputar' using errcode = 'check_violation';
  end if;
  if v_payment.status = 'disputed' then
    raise exception 'Ya hay una disputa abierta para este pago' using errcode = 'check_violation';
  end if;

  -- Ticket de Soporte Unities (categoría pagos), reutiliza el abierto si existe.
  select public.start_support('pagos') into v_conv;

  insert into public.disputes (booking_id, payment_id, opened_by, reason, evidence_path, conversation_id)
  values (p_booking_id, v_payment.id, v_uid, coalesce(p_reason, ''), p_evidence_path, v_conv.id)
  returning * into v_dispute;

  -- Si el pago ya estaba vencido (con strike), lo congela mientras se revisa.
  if v_payment.status = 'overdue' then
    update public.strikes
      set status = 'frozen', dispute_id = v_dispute.id
    where booking_id = p_booking_id and status = 'active';
    get diagnostics v_frozen = row_count;
    if v_frozen > 0 then
      update public.profiles
        set payment_strikes_count = greatest(0, payment_strikes_count - v_frozen),
            payment_ban_until = case
              when payment_ban_until is not null and payment_ban_until > now() then null
              else payment_ban_until end
      where id = v_uid;
    end if;
  end if;

  update public.payments set status = 'disputed' where booking_id = p_booking_id;

  -- Avisa al pasajero (confirmación) y a la bandeja de admin/owner.
  perform public.enqueue_notification(
    v_uid, 'pagos', 'disputa_abierta',
    '🧾 Recibimos tu comprobante',
    'Congelamos el strike mientras revisamos tu pago. Te avisaremos la resolución.',
    '/my-trips',
    jsonb_build_object('disputeId', v_dispute.id, 'bookingId', p_booking_id)
  );

  insert into public.notifications (user_id, category, type, title, body, url, data)
  select p.id, 'pagos', 'disputa_nueva',
         '⚖️ Nueva disputa de pago',
         'Un pasajero envió un comprobante "yo sí pagué". Revísala en la bandeja de disputas.',
         '/admin/disputes',
         jsonb_build_object('disputeId', v_dispute.id, 'bookingId', p_booking_id)
  from public.profiles p
  left join public.notification_prefs np on np.user_id = p.id
  where p.account_role in ('admin', 'owner') and coalesce(np.pagos, true);

  return v_dispute;
end;
$$;

revoke execute on function public.open_dispute(uuid, text, text) from public, anon;
grant execute on function public.open_dispute(uuid, text, text) to authenticated;

-- Resolver disputa (admin/owner). Aprobar = el pasajero pagó (verifica el pago y
-- revierte el strike). Rechazar = no hubo pago (reactiva/aplica el strike).
create or replace function public.resolve_dispute(
  p_dispute_id uuid,
  p_approve    boolean,
  p_note       text default null
)
returns public.disputes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_dispute public.disputes;
  v_payment public.payments;
  v_reactivated int;
begin
  if not public.is_admin() then
    raise exception 'Solo admin/owner puede resolver disputas' using errcode = 'insufficient_privilege';
  end if;

  select * into v_dispute from public.disputes where id = p_dispute_id for update;
  if not found then
    raise exception 'Disputa no encontrada' using errcode = 'no_data_found';
  end if;
  if v_dispute.status <> 'abierta' then
    raise exception 'La disputa ya fue resuelta' using errcode = 'check_violation';
  end if;

  select * into v_payment from public.payments where id = v_dispute.payment_id for update;

  if p_approve then
    update public.disputes
      set status = 'resuelta_pagada', resolved_by = v_uid, resolved_at = now(),
          resolution_note = p_note, updated_at = now()
    where id = p_dispute_id
    returning * into v_dispute;

    update public.strikes set status = 'reverted'
    where dispute_id = p_dispute_id and status = 'frozen';

    -- Verifica el pago tratándolo como a tiempo (el pasajero sí pagó).
    if v_payment.id is not null then
      update public.payments
        set status = 'confirmed',
            provider = coalesce(provider, 'manual'),
            verified_at = coalesce(verified_at, v_payment.due_at),
            marked_at = coalesce(marked_at, v_payment.due_at),
            confirmed_at = now()
      where id = v_payment.id;
    end if;

    perform public.enqueue_notification(
      v_dispute.opened_by, 'pagos', 'disputa_resuelta',
      '✅ Disputa aprobada',
      'Verificamos tu pago y anulamos el strike. ¡Gracias por tu paciencia!',
      '/my-trips',
      jsonb_build_object('disputeId', p_dispute_id)
    );
  else
    update public.disputes
      set status = 'resuelta_rechazada', resolved_by = v_uid, resolved_at = now(),
          resolution_note = p_note, updated_at = now()
    where id = p_dispute_id
    returning * into v_dispute;

    -- Reactiva el strike congelado; si no había (disputa previa a las 48 h) y el
    -- plazo ya venció, emite uno nuevo. En ambos casos se recalcula el baneo.
    update public.strikes set status = 'active'
    where dispute_id = p_dispute_id and status = 'frozen';
    get diagnostics v_reactivated = row_count;

    if v_payment.id is not null then
      if v_reactivated = 0 and v_payment.due_at < now() then
        insert into public.strikes (user_id, booking_id, kind, occurred_at, status, dispute_id)
        values (v_dispute.opened_by, v_dispute.booking_id, 'payment', now(), 'active', p_dispute_id);
        v_reactivated := 1;
      end if;

      if v_reactivated > 0 then
        perform public._register_payment_strike(v_dispute.opened_by);
      end if;

      update public.payments
        set status = case when due_at < now() then 'overdue' else 'pending' end
      where id = v_payment.id;
    end if;

    perform public.enqueue_notification(
      v_dispute.opened_by, 'pagos', 'disputa_resuelta',
      '❌ Disputa rechazada',
      'No pudimos verificar el pago. El strike sigue vigente. Escríbenos por soporte si tienes dudas.',
      '/my-trips',
      jsonb_build_object('disputeId', p_dispute_id)
    );
  end if;

  return v_dispute;
end;
$$;

revoke execute on function public.resolve_dispute(uuid, boolean, text) from public, anon;
grant execute on function public.resolve_dispute(uuid, boolean, text) to authenticated;

-- ===========================================================================
-- Liquidaciones: ganancias del conductor (bruto / comisión Unities / neto).
-- ===========================================================================
create or replace function public.driver_earnings()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
    'gross_clp',      coalesce(sum(p.total_clp), 0),
    'commission_clp', coalesce(sum(p.commission_clp), 0),
    'net_clp',        coalesce(sum(p.price_clp), 0),
    'payment_count',  count(*),
    'pending_gross_clp',      coalesce(sum(p.total_clp) filter (where p.payout_id is null), 0),
    'pending_commission_clp', coalesce(sum(p.commission_clp) filter (where p.payout_id is null), 0),
    'pending_net_clp',        coalesce(sum(p.price_clp) filter (where p.payout_id is null), 0),
    'items', coalesce((
      select jsonb_agg(item order by item->>'confirmed_at' desc)
      from (
        select jsonb_build_object(
          'booking_id',   b2.id,
          'route',        coalesce(t2.origin_campus_name, 'Origen') || ' → ' || coalesce(t2.destination_campus_name, 'Destino'),
          'gross_clp',    p2.total_clp,
          'commission_clp', p2.commission_clp,
          'net_clp',      p2.price_clp,
          'confirmed_at', p2.confirmed_at,
          'settled',      (p2.payout_id is not null)
        ) as item
        from public.payments p2
        join public.bookings b2 on b2.id = p2.booking_id
        join public.trips t2 on t2.id = b2.trip_id
        where t2.driver_id = v_uid and p2.status = 'confirmed'
        order by p2.confirmed_at desc nulls last
        limit 30
      ) recent
    ), '[]'::jsonb)
  )
  into v_result
  from public.payments p
  join public.bookings b on b.id = p.booking_id
  join public.trips t on t.id = b.trip_id
  where t.driver_id = v_uid and p.status = 'confirmed';

  return v_result;
end;
$$;

revoke execute on function public.driver_earnings() from public, anon;
grant execute on function public.driver_earnings() to authenticated;

-- Crear una liquidación (owner): agrupa los pagos confirmados sin liquidar del
-- conductor en el periodo y los marca como incluidos.
create or replace function public.create_payout(
  p_driver_id    uuid,
  p_period_start timestamptz,
  p_period_end   timestamptz
)
returns public.payouts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gross int; v_commission int; v_net int; v_count int;
  v_payout public.payouts;
begin
  if not public.is_owner() then
    raise exception 'Solo el owner puede liquidar' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(sum(p.total_clp), 0), coalesce(sum(p.commission_clp), 0),
         coalesce(sum(p.price_clp), 0), count(*)
    into v_gross, v_commission, v_net, v_count
  from public.payments p
  join public.bookings b on b.id = p.booking_id
  join public.trips t on t.id = b.trip_id
  where t.driver_id = p_driver_id
    and p.status = 'confirmed'
    and p.payout_id is null
    and p.confirmed_at >= p_period_start
    and p.confirmed_at < p_period_end;

  if v_count = 0 then
    raise exception 'No hay pagos por liquidar en el periodo' using errcode = 'no_data_found';
  end if;

  insert into public.payouts (driver_id, period_start, period_end, gross_clp, commission_clp, net_clp, payment_count, created_by)
  values (p_driver_id, p_period_start, p_period_end, v_gross, v_commission, v_net, v_count, auth.uid())
  returning * into v_payout;

  update public.payments p
    set payout_id = v_payout.id
  from public.bookings b, public.trips t
  where p.booking_id = b.id and b.trip_id = t.id
    and t.driver_id = p_driver_id
    and p.status = 'confirmed'
    and p.payout_id is null
    and p.confirmed_at >= p_period_start
    and p.confirmed_at < p_period_end;

  return v_payout;
end;
$$;

revoke execute on function public.create_payout(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.create_payout(uuid, timestamptz, timestamptz) to authenticated;

create or replace function public.mark_payout_paid(p_payout_id uuid)
returns public.payouts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payout public.payouts;
begin
  if not public.is_owner() then
    raise exception 'Solo el owner puede marcar liquidaciones' using errcode = 'insufficient_privilege';
  end if;
  update public.payouts set status = 'pagada', paid_at = now()
  where id = p_payout_id
  returning * into v_payout;
  return v_payout;
end;
$$;

revoke execute on function public.mark_payout_paid(uuid) from public, anon;
grant execute on function public.mark_payout_paid(uuid) to authenticated;

-- ===========================================================================
-- Panel financiero del owner: comisiones, volumen por campus, morosidad.
-- ===========================================================================
create or replace function public.owner_finance_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_owner() then
    raise exception 'Solo el owner ve el panel financiero' using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
    'total_commission_clp', coalesce((select sum(commission_clp) from public.payments where status = 'confirmed'), 0),
    'total_volume_clp',     coalesce((select sum(total_clp) from public.payments where status = 'confirmed'), 0),
    'confirmed_count',      (select count(*) from public.payments where status = 'confirmed'),
    'by_campus', coalesce((
      select jsonb_agg(c_row order by (c_row->>'volume_clp')::int desc)
      from (
        select jsonb_build_object(
          'campus',        coalesce(t.destination_campus_name, 'Sin campus'),
          'volume_clp',    sum(p.total_clp),
          'commission_clp', sum(p.commission_clp),
          'count',         count(*)
        ) as c_row
        from public.payments p
        join public.bookings b on b.id = p.booking_id
        join public.trips t on t.id = b.trip_id
        where p.status = 'confirmed'
        group by coalesce(t.destination_campus_name, 'Sin campus')
      ) g
    ), '[]'::jsonb),
    'morosidad', jsonb_build_object(
      'overdue_count',  (select count(*) from public.payments where status = 'overdue'),
      'overdue_clp',    coalesce((select sum(total_clp) from public.payments where status = 'overdue'), 0),
      'disputed_count', (select count(*) from public.payments where status = 'disputed'),
      'open_disputes',  (select count(*) from public.disputes where status = 'abierta'),
      'active_strikes', (select count(*) from public.strikes where status = 'active'),
      'active_bans',    (select count(*) from public.profiles where payment_ban_until is not null and payment_ban_until > now())
    ),
    'payouts_pending_net_clp', coalesce((select sum(net_clp) from public.payouts where status = 'pendiente'), 0)
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.owner_finance_summary() from public, anon;
grant execute on function public.owner_finance_summary() to authenticated;

-- ===========================================================================
-- Configuración financiera del owner (comisión, tasa de créditos, tope).
-- ===========================================================================
create or replace function public.update_platform_config(
  p_commission_clp          integer default null,
  p_credit_clp_rate         integer default null,
  p_max_credit_discount_pct integer default null
)
returns public.platform_config
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg public.platform_config;
begin
  if not public.is_owner() then
    raise exception 'Solo el owner ajusta la configuración' using errcode = 'insufficient_privilege';
  end if;

  update public.platform_config
    set commission_clp = coalesce(p_commission_clp, commission_clp),
        credit_clp_rate = coalesce(p_credit_clp_rate, credit_clp_rate),
        max_credit_discount_pct = coalesce(p_max_credit_discount_pct, max_credit_discount_pct),
        updated_by = auth.uid()
  where id = 'default'
  returning * into v_cfg;

  return v_cfg;
end;
$$;

revoke execute on function public.update_platform_config(integer, integer, integer) from public, anon;
grant execute on function public.update_platform_config(integer, integer, integer) to authenticated;

-- ===========================================================================
-- RLS de las tablas nuevas
-- ===========================================================================
alter table public.platform_config enable row level security;
alter table public.payment_events  enable row level security;
alter table public.disputes        enable row level security;
alter table public.payouts         enable row level security;

-- platform_config: lectura autenticada (el cliente calcula el pago con créditos);
-- escritura solo por RPC (update_platform_config, security definer).
drop policy if exists platform_config_select on public.platform_config;
create policy platform_config_select on public.platform_config
  for select to authenticated using (true);

-- payment_events: bitácora interna; solo el owner la audita (service_role la escribe).
drop policy if exists payment_events_select_owner on public.payment_events;
create policy payment_events_select_owner on public.payment_events
  for select to authenticated using (public.is_owner());

-- disputes: el pasajero ve las suyas; admin/owner ven todas (bandeja). Escritura
-- solo por RPC (open_dispute / resolve_dispute).
drop policy if exists disputes_select on public.disputes;
create policy disputes_select on public.disputes
  for select to authenticated using (opened_by = (select auth.uid()) or public.is_admin());

-- payouts: el conductor ve las suyas; el owner todas. Escritura solo por RPC.
drop policy if exists payouts_select on public.payouts;
create policy payouts_select on public.payouts
  for select to authenticated using (driver_id = (select auth.uid()) or public.is_owner());

-- Bandeja de disputas para admin/owner con el detalle que necesita la UI
-- (ruta, monto, pasajero, ticket de soporte) en una sola llamada.
create or replace function public.list_disputes(p_only_open boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Solo admin/owner ve la bandeja de disputas' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(jsonb_agg(entry order by entry->>'created_at' desc), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'id',              d.id,
      'booking_id',      d.booking_id,
      'status',          d.status,
      'reason',          d.reason,
      'evidence_path',   d.evidence_path,
      'conversation_id', d.conversation_id,
      'created_at',      d.created_at,
      'resolution_note', d.resolution_note,
      'passenger',       coalesce(nullif(btrim(pr.full_name), ''), 'Estudiante'),
      'route',           coalesce(t.origin_campus_name, 'Origen') || ' → ' || coalesce(t.destination_campus_name, 'Destino'),
      'total_clp',       pay.total_clp,
      'payment_status',  pay.status,
      'due_at',          pay.due_at
    ) as entry
    from public.disputes d
    left join public.profiles pr on pr.id = d.opened_by
    left join public.payments pay on pay.id = d.payment_id
    left join public.bookings b on b.id = d.booking_id
    left join public.trips t on t.id = b.trip_id
    where (not p_only_open) or d.status = 'abierta'
  ) rows;

  return v_result;
end;
$$;

revoke execute on function public.list_disputes(boolean) from public, anon;
grant execute on function public.list_disputes(boolean) to authenticated;

-- ===========================================================================
-- Realtime: la bandeja de disputas se actualiza en vivo.
-- ===========================================================================
do $$
begin
  alter publication supabase_realtime add table public.disputes;
exception when duplicate_object then null;
end;
$$;


-- ###################################################################
-- ## 20260708120002_payments_storage.sql
-- ###################################################################
-- Unities — Sesión 8: Storage para comprobantes de disputa.
-- Bucket privado; ruta `<uid>/<archivo>`. Lo lee el dueño (pasajero) y admin/owner
-- (para revisar la disputa); lo escribe solo el dueño. Mismo patrón que credentials.

insert into storage.buckets (id, name, public)
values ('dispute-evidence', 'dispute-evidence', false)
on conflict (id) do nothing;

drop policy if exists dispute_evidence_select on storage.objects;
create policy dispute_evidence_select on storage.objects
  for select to authenticated using (
    bucket_id = 'dispute-evidence'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin())
  );

drop policy if exists dispute_evidence_insert_own on storage.objects;
create policy dispute_evidence_insert_own on storage.objects
  for insert to authenticated with check (
    bucket_id = 'dispute-evidence' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists dispute_evidence_update_own on storage.objects;
create policy dispute_evidence_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'dispute-evidence' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'dispute-evidence' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists dispute_evidence_delete_own on storage.objects;
create policy dispute_evidence_delete_own on storage.objects
  for delete to authenticated using (
    bucket_id = 'dispute-evidence' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ###################################################################
-- ## 20260711200427_dm_hibrido.sql
-- ###################################################################
-- Unities — Sesión DM híbrido (anti-bullying).
-- Regla: un alumno solo puede ABRIR un DM con alguien si (a) comparten un
-- viaje con reserva CONFIRMADA (conductor↔pasajero en cualquier dirección, o
-- copasajeros del mismo trip) o (b) alguno de los dos es cuenta oficial
-- (tutor/admin/owner). Cero DM libre alumno↔alumno.
--
-- Piezas:
-- 1) can_start_dm(a, b) — la regla en un solo lugar (+ helpers).
-- 2) start_dm la exige antes de CREAR la conversación (las existentes se
--    devuelven tal cual: cerrar hilos históricos no es objetivo).
-- 3) Defensa en profundidad: triggers de INSERT en conversations y
--    conversation_members re-validan cualquier escritura de origen usuario
--    (auth.uid() presente), venga por el RPC o por cualquier vía futura.
--    conversations/messages siguen SIN políticas de INSERT/UPDATE/DELETE
--    directas para clientes: crear pasa únicamente por el RPC.
-- 4) list_dm_contacts() — directorio mínimo del composer "nuevo mensaje":
--    cuentas oficiales + compañeros de viaje confirmados. El resto del
--    alumnado no se expone (reemplaza la búsqueda libre sobre profiles).

-- ===========================================================================
-- 1) Helpers de la regla
-- ===========================================================================

create or replace function public.is_official_account(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = p_user and account_role in ('tutor', 'admin', 'owner')
  );
$$;

revoke execute on function public.is_official_account(uuid) from public, anon, authenticated;

create or replace function public.shares_confirmed_trip(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bookings b
    join public.trips t on t.id = b.trip_id
    where b.status = 'confirmed'
      and ((t.driver_id = p_a and b.passenger_id = p_b)
        or (t.driver_id = p_b and b.passenger_id = p_a))
  ) or exists (
    select 1
    from public.bookings ba
    join public.bookings bb on bb.trip_id = ba.trip_id
    where ba.status = 'confirmed' and ba.passenger_id = p_a
      and bb.status = 'confirmed' and bb.passenger_id = p_b
  );
$$;

revoke execute on function public.shares_confirmed_trip(uuid, uuid) from public, anon, authenticated;

create or replace function public.can_start_dm(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_a is not null and p_b is not null and p_a <> p_b and (
    public.is_official_account(p_a)
    or public.is_official_account(p_b)
    or public.shares_confirmed_trip(p_a, p_b)
  );
$$;

revoke execute on function public.can_start_dm(uuid, uuid) from public, anon, authenticated;

create or replace function public.dm_key_users(p_key text)
returns uuid[]
language plpgsql
immutable
set search_path = public
as $$
declare
  v_parts text[] := string_to_array(coalesce(p_key, ''), ':');
begin
  if coalesce(array_length(v_parts, 1), 0) <> 2 then
    return null;
  end if;
  return array[v_parts[1]::uuid, v_parts[2]::uuid];
exception when others then
  return null;
end;
$$;

revoke execute on function public.dm_key_users(text) from public, anon, authenticated;

-- ===========================================================================
-- 2) start_dm valida la regla antes de crear
-- ===========================================================================

create or replace function public.start_dm(p_other_user uuid)
returns public.conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_key  text;
  v_conv public.conversations;
begin
  if v_uid is null then
    raise exception 'Necesitas iniciar sesión';
  end if;
  if p_other_user is null or p_other_user = v_uid then
    raise exception 'Elige a otra persona para chatear';
  end if;
  if not exists (select 1 from public.profiles where id = p_other_user) then
    raise exception 'El usuario no existe';
  end if;

  v_key := least(v_uid, p_other_user)::text || ':' || greatest(v_uid, p_other_user)::text;

  select * into v_conv from public.conversations where dm_key = v_key;
  if found then
    return v_conv;
  end if;

  if not public.can_start_dm(v_uid, p_other_user) then
    raise exception 'Solo puedes chatear con compañeros de un viaje confirmado o con cuentas oficiales (tutores y equipo Unities)'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.conversations (kind, dm_key, created_by)
  values ('dm', v_key, v_uid)
  on conflict (dm_key) do nothing
  returning * into v_conv;

  if v_conv.id is null then
    select * into v_conv from public.conversations where dm_key = v_key;
  end if;

  insert into public.conversation_members (conversation_id, user_id)
  values (v_conv.id, v_uid), (v_conv.id, p_other_user)
  on conflict do nothing;

  return v_conv;
end;
$$;

revoke execute on function public.start_dm(uuid) from public, anon;
grant execute on function public.start_dm(uuid) to authenticated;

-- ===========================================================================
-- 3) Defensa en profundidad: la regla también se exige a nivel de fila
-- ===========================================================================

create or replace function public.enforce_dm_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_pair uuid[];
begin
  if new.kind <> 'dm' then
    return new;
  end if;

  v_pair := public.dm_key_users(new.dm_key);
  if v_pair is null or v_pair[1] >= v_pair[2] then
    raise exception 'dm_key inválido' using errcode = 'check_violation';
  end if;

  if v_uid is not null then
    if v_uid <> v_pair[1] and v_uid <> v_pair[2] then
      raise exception 'Solo puedes abrir DMs de los que formas parte'
        using errcode = 'insufficient_privilege';
    end if;
    if new.created_by is distinct from v_uid then
      raise exception 'created_by debe ser quien abre el DM'
        using errcode = 'check_violation';
    end if;
    if not public.can_start_dm(v_pair[1], v_pair[2]) then
      raise exception 'Solo puedes chatear con compañeros de un viaje confirmado o con cuentas oficiales (tutores y equipo Unities)'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_dm_conversation() from public, anon, authenticated;

drop trigger if exists conversations_enforce_dm on public.conversations;
create trigger conversations_enforce_dm before insert on public.conversations
  for each row execute function public.enforce_dm_conversation();

create or replace function public.enforce_dm_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv public.conversations;
  v_pair uuid[];
begin
  select * into v_conv from public.conversations where id = new.conversation_id;
  if not found or v_conv.kind <> 'dm' then
    return new;
  end if;

  v_pair := public.dm_key_users(v_conv.dm_key);
  if v_pair is null or (new.user_id <> v_pair[1] and new.user_id <> v_pair[2]) then
    raise exception 'En un DM solo participan los dos usuarios del par'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_dm_membership() from public, anon, authenticated;

drop trigger if exists conversation_members_enforce_dm on public.conversation_members;
create trigger conversation_members_enforce_dm before insert on public.conversation_members
  for each row execute function public.enforce_dm_membership();

-- ===========================================================================
-- 4) Directorio mínimo del composer "nuevo mensaje"
-- ===========================================================================

create or replace function public.list_dm_contacts()
returns table (id uuid, full_name text, avatar_url text, is_official boolean)
language sql
stable
security definer
set search_path = public
as $$
  with companions as (
    select t.driver_id as user_id
    from public.bookings b
    join public.trips t on t.id = b.trip_id
    where b.passenger_id = auth.uid() and b.status = 'confirmed'
    union
    select b.passenger_id
    from public.bookings b
    join public.trips t on t.id = b.trip_id
    where t.driver_id = auth.uid() and b.status = 'confirmed'
    union
    select b2.passenger_id
    from public.bookings b1
    join public.bookings b2 on b2.trip_id = b1.trip_id
    where b1.passenger_id = auth.uid()
      and b1.status = 'confirmed' and b2.status = 'confirmed'
  )
  select p.id, p.full_name, p.avatar_url,
         (p.account_role in ('tutor', 'admin', 'owner')) as is_official
  from public.profiles p
  where p.id <> auth.uid()
    and (
      p.account_role in ('tutor', 'admin', 'owner')
      or p.id in (select user_id from companions)
    )
  order by (p.account_role in ('tutor', 'admin', 'owner')) desc,
           lower(coalesce(p.full_name, p.email)) asc;
$$;

revoke execute on function public.list_dm_contacts() from public, anon;
grant execute on function public.list_dm_contacts() to authenticated;

-- ###################################################################
-- ## 20260712120000_ai_bots_schema.sql
-- ###################################################################
-- Unities — Sesión Bots de IA: esquema.
-- Cada federación/centro de alumnos/marca (publisher) y cada tutor por
-- asignatura (topic) puede tener un bot con el que cualquier alumno chatea
-- por DM normal, igual que con una persona. El bot ES una fila de
-- profiles/auth.users (perfil "de servicio", sin credenciales reales: nadie
-- puede iniciar sesión como él) para reutilizar 100% de la mensajería de la
-- Sesión 6 — start_dm, conversation_members, RLS, realtime — sin tocarla.
-- Convención de las Sesiones 3+: snake_case, uuid, timestamptz.

-- ---------------------------------------------------------------------------
-- profiles — marca los perfiles de bot (para no confundirlos con alumnos en
-- el resto de la app: búsquedas, listados, analítica, etc.).
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists is_bot boolean not null default false;

create index if not exists profiles_is_bot_idx on public.profiles (is_bot) where is_bot;

-- ---------------------------------------------------------------------------
-- ai_bots — configuración del bot: a quién representa, su nombre visible en
-- el chat, y el prompt/FAQ que edita quien lo administra. exactamente uno de
-- (publisher_id) o (tutor_id + topic_id) según owner_kind.
-- ---------------------------------------------------------------------------
create table if not exists public.ai_bots (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null unique references public.profiles (id) on delete cascade,
  owner_kind     text not null check (owner_kind in ('publisher', 'tutor_topic')),
  publisher_id   uuid references public.publishers (id) on delete cascade,
  tutor_id       uuid references public.profiles (id) on delete cascade,
  topic_id       text references public.topics (id) on delete cascade,
  persona_name   text not null check (char_length(btrim(persona_name)) between 1 and 80),
  system_prompt  text not null default '' check (char_length(system_prompt) <= 4000),
  enabled        boolean not null default false,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (
    (owner_kind = 'publisher'   and publisher_id is not null and tutor_id is null     and topic_id is null)
    or
    (owner_kind = 'tutor_topic' and publisher_id is null     and tutor_id is not null and topic_id is not null)
  )
);

-- Un bot por publisher; un bot por (tutor, asignatura) — mismo grano que
-- topic_assignees.
create unique index if not exists ai_bots_publisher_uq
  on public.ai_bots (publisher_id) where publisher_id is not null;
create unique index if not exists ai_bots_tutor_topic_uq
  on public.ai_bots (tutor_id, topic_id) where tutor_id is not null;
create index if not exists ai_bots_profile_idx on public.ai_bots (profile_id);
create index if not exists ai_bots_enabled_idx on public.ai_bots (enabled) where enabled;

-- ---------------------------------------------------------------------------
-- _create_bot_profile — crea el auth.users + profiles "de servicio" de un
-- bot. Server-only (la llaman set_publisher_bot/set_tutor_topic_bot, nunca
-- el cliente). El email es sintético pero con dominio institucional válido
-- (enforce_university_email, Sesión 3, no tiene excepción para triggers) —
-- nadie puede completar login con él (no hay OTP a esa casilla), así que el
-- bot nunca tiene sesión propia; todas sus respuestas las escribe la Edge
-- Function ai-bot-reply con la service key.
-- ---------------------------------------------------------------------------
create or replace function public._create_bot_profile(p_display_name text, p_university_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id     uuid := gen_random_uuid();
  v_domain text := case p_university_id
    when 'uai'    then 'alumnos.uai.cl'
    when 'udd'    then 'udd.cl'
    when 'uandes' then 'miuandes.cl'
    else 'alumnos.uai.cl'
  end;
  v_email  text := 'bot-' || replace(v_id::text, '-', '') || '@' || v_domain;
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at, email_confirmed_at)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_email, now(), now(), now());

  -- handle_new_user (Sesión 3) ya creó la fila de profiles; la completamos.
  update public.profiles
     set full_name    = p_display_name,
         is_bot        = true,
         account_role  = 'tutor', -- cuenta "oficial" (nunca inicia sesión: es cosmético)
         updated_at    = now()
   where id = v_id;

  return v_id;
end;
$$;

revoke execute on function public._create_bot_profile(text, text) from public, anon, authenticated;

-- ###################################################################
-- ## 20260712120001_ai_bots_functions_rls.sql
-- ###################################################################
-- Unities — Sesión Bots de IA: RPCs de configuración, disparo de la
-- respuesta automática y RLS.
-- La regla de administración es la misma que ya rige el resto de la app:
-- can_manage_publisher() (Sesión 5) para el bot de un publisher, y "ser el
-- tutor asignado al tema" (topic_assignees, Sesión 6) para el bot de una
-- asignatura. Ninguna de las dos pasa por el cliente: las RPC las verifican
-- en el servidor.

-- ===========================================================================
-- set_publisher_bot — crea/actualiza el bot de un publisher. Solo quien lo
-- administra (owner, o admin miembro del publisher).
-- ===========================================================================

create or replace function public.set_publisher_bot(
  p_publisher_id  uuid,
  p_persona_name  text,
  p_system_prompt text default '',
  p_enabled       boolean default true
)
returns public.ai_bots
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_bot        public.ai_bots;
  v_profile_id uuid;
  v_university text;
  v_avatar     text;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = 'insufficient_privilege';
  end if;
  if not public.can_manage_publisher(p_publisher_id) then
    raise exception 'No administras este publisher' using errcode = 'insufficient_privilege';
  end if;
  if char_length(btrim(coalesce(p_persona_name, ''))) = 0 then
    raise exception 'El bot necesita un nombre' using errcode = 'check_violation';
  end if;

  select * into v_bot from public.ai_bots where publisher_id = p_publisher_id;
  if found then
    update public.ai_bots
       set persona_name  = btrim(p_persona_name),
           system_prompt = coalesce(p_system_prompt, ''),
           enabled       = p_enabled,
           updated_at    = now()
     where id = v_bot.id
     returning * into v_bot;
    return v_bot;
  end if;

  select university_id, avatar_url into v_university, v_avatar
  from public.publishers where id = p_publisher_id;

  v_profile_id := public._create_bot_profile(btrim(p_persona_name), v_university);
  -- El bot "hereda" la foto del publisher: en el chat se ve como la propia
  -- federación/centro de alumnos hablando, no como una cuenta aparte.
  if v_avatar is not null then
    update public.profiles set avatar_url = v_avatar where id = v_profile_id;
  end if;

  insert into public.ai_bots (profile_id, owner_kind, publisher_id, persona_name, system_prompt, enabled, created_by)
  values (v_profile_id, 'publisher', p_publisher_id, btrim(p_persona_name), coalesce(p_system_prompt, ''), p_enabled, v_uid)
  returning * into v_bot;

  return v_bot;
end;
$$;

revoke execute on function public.set_publisher_bot(uuid, text, text, boolean) from public, anon;
grant execute on function public.set_publisher_bot(uuid, text, text, boolean) to authenticated;

-- ===========================================================================
-- set_tutor_topic_bot — crea/actualiza el bot de un tutor para una
-- asignatura. Solo el propio tutor asignado a ese tema (topic_assignees).
-- ===========================================================================

create or replace function public.set_tutor_topic_bot(
  p_topic_id      text,
  p_persona_name  text,
  p_system_prompt text default '',
  p_enabled       boolean default true
)
returns public.ai_bots
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_bot        public.ai_bots;
  v_profile_id uuid;
  v_university text;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = 'insufficient_privilege';
  end if;
  if not exists (
    select 1 from public.topic_assignees where topic_id = p_topic_id and user_id = v_uid
  ) then
    raise exception 'Solo el tutor asignado a este tema puede configurar su bot'
      using errcode = 'insufficient_privilege';
  end if;
  if char_length(btrim(coalesce(p_persona_name, ''))) = 0 then
    raise exception 'El bot necesita un nombre' using errcode = 'check_violation';
  end if;

  select * into v_bot from public.ai_bots where tutor_id = v_uid and topic_id = p_topic_id;
  if found then
    update public.ai_bots
       set persona_name  = btrim(p_persona_name),
           system_prompt = coalesce(p_system_prompt, ''),
           enabled       = p_enabled,
           updated_at    = now()
     where id = v_bot.id
     returning * into v_bot;
    return v_bot;
  end if;

  select university_id into v_university from public.profiles where id = v_uid;
  v_profile_id := public._create_bot_profile(btrim(p_persona_name), v_university);

  insert into public.ai_bots (profile_id, owner_kind, tutor_id, topic_id, persona_name, system_prompt, enabled, created_by)
  values (v_profile_id, 'tutor_topic', v_uid, p_topic_id, btrim(p_persona_name), coalesce(p_system_prompt, ''), p_enabled, v_uid)
  returning * into v_bot;

  return v_bot;
end;
$$;

revoke execute on function public.set_tutor_topic_bot(text, text, text, boolean) from public, anon;
grant execute on function public.set_tutor_topic_bot(text, text, text, boolean) to authenticated;

drop trigger if exists ai_bots_set_updated_at on public.ai_bots;
create trigger ai_bots_set_updated_at before update on public.ai_bots
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- Disparo de la respuesta automática: cada mensaje nuevo en una conversación
-- donde el otro miembro es un bot habilitado, y que NO lo escribió el propio
-- bot (evita loops), invoca la Edge Function ai-bot-reply vía pg_net. Mismo
-- patrón que invoke_send_push (Sesión 7).
-- ===========================================================================

create extension if not exists pg_net;

create or replace function public.notify_ai_bot_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bot record;
begin
  select b.id, b.profile_id into v_bot
  from public.ai_bots b
  join public.conversation_members cm on cm.user_id = b.profile_id
  where cm.conversation_id = new.conversation_id and b.enabled
  limit 1;

  if v_bot.id is null or new.sender_id = v_bot.profile_id then
    return null;
  end if;

  perform net.http_post(
    url     := 'https://jkqzuddxahoamoygdrrb.supabase.co/functions/v1/ai-bot-reply',
    body    := jsonb_build_object('conversationId', new.conversation_id, 'botId', v_bot.id),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 20000
  );
  return null;
exception when others then
  raise notice 'pg_net no disponible (%): invoca ai-bot-reply desde un scheduler externo.', sqlerrm;
  return null;
end;
$$;

revoke execute on function public.notify_ai_bot_on_message() from public, anon, authenticated;

drop trigger if exists messages_notify_ai_bot on public.messages;
create trigger messages_notify_ai_bot after insert on public.messages
  for each row execute function public.notify_ai_bot_on_message();

-- ===========================================================================
-- Row Level Security — ai_bots
-- ===========================================================================

alter table public.ai_bots enable row level security;

-- Catálogo visible para todo autenticado (así el cliente puede mostrar "Bot
-- de <asignatura>" o "Bot de <federación>" y ofrecer el botón de chat).
-- Sin políticas de insert/update/delete: toda escritura pasa por
-- set_publisher_bot / set_tutor_topic_bot (SECURITY DEFINER).
drop policy if exists ai_bots_select on public.ai_bots;
create policy ai_bots_select on public.ai_bots
  for select to authenticated using (true);


-- ===========================================================================
-- SESIÓN 9 — Seguridad, confianza y moderación (20260723000000..02)
-- ===========================================================================

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


-- Unities — Sesión 9: funciones, triggers, RLS y endurecimiento de seguridad,
-- reportes/bloqueos, moderación de contenido, identidad, privacidad y anti-abuso.

-- ===========================================================================
-- Helpers de autorización
-- ===========================================================================

-- Moderar reportes/credenciales: tutor o superior (docs/sesiones/09, hooks
-- use-permissions.ts: canModerate / canVerifyUsers). Sanciones y borrado de
-- contenido exigen is_admin() (canManageUsers), un escalón más arriba.
create or replace function public.can_moderate()
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

grant execute on function public.can_moderate() to authenticated, anon;

-- ¿a y b se tienen bloqueados (en cualquier dirección)? Simétrico a propósito:
-- el bloqueo es mutuo (docs/sesiones/09).
create or replace function public.are_blocked(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_blocks
    where (blocker_id = p_a and blocked_id = p_b) or (blocker_id = p_b and blocked_id = p_a)
  );
$$;

grant execute on function public.are_blocked(uuid, uuid) to authenticated, anon;

-- ¿Puede auth.uid() operar con normalidad? false si está baneado, o suspendido
-- y la suspensión sigue vigente. Gatea reservar viajes, publicar y mensajear.
create or replace function public.is_active_account()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles
    where id = auth.uid()
      and (moderation_status = 'baneado'
        or (moderation_status = 'suspendido' and moderation_until is not null and moderation_until > now()))
  );
$$;

grant execute on function public.is_active_account() to authenticated, anon;

-- ===========================================================================
-- 1) Seguridad en viaje: compartir en vivo + SOS
-- ===========================================================================

-- Empieza (o reinicia) el compartir en vivo de un viaje. Solo el conductor o
-- un pasajero con reserva no cancelada de ESE viaje puede compartirlo.
create or replace function public.start_trip_share(
  p_trip_id uuid,
  p_contact_name text,
  p_contact_phone text
)
returns public.trip_live_shares
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_trip  public.trips;
  v_share public.trip_live_shares;
begin
  if v_uid is null then
    raise exception 'Necesitas iniciar sesión';
  end if;
  if btrim(coalesce(p_contact_name, '')) = '' or btrim(coalesce(p_contact_phone, '')) = '' then
    raise exception 'Ingresa nombre y teléfono del contacto de confianza' using errcode = 'check_violation';
  end if;

  select * into v_trip from public.trips where id = p_trip_id;
  if not found then
    raise exception 'Viaje no encontrado' using errcode = 'no_data_found';
  end if;
  if v_trip.driver_id <> v_uid and not exists (
    select 1 from public.bookings where trip_id = p_trip_id and passenger_id = v_uid and status <> 'cancelled'
  ) then
    raise exception 'Solo el conductor o un pasajero del viaje pueden compartirlo' using errcode = 'insufficient_privilege';
  end if;

  update public.trip_live_shares set active = false, stopped_at = now()
  where trip_id = p_trip_id and sharer_id = v_uid and active;

  -- Token opaco sin depender de pgcrypto (gen_random_bytes vive en el schema
  -- extensions, fuera del search_path fijo): dos uuid sin guiones = 64 hex.
  insert into public.trip_live_shares (trip_id, sharer_id, share_token, contact_name, contact_phone)
  values (p_trip_id, v_uid,
          replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
          btrim(p_contact_name), btrim(p_contact_phone))
  returning * into v_share;

  return v_share;
end;
$$;

-- Actualiza la última posición del compartir activo de auth.uid() en ese viaje
-- (services/location.ts watchPosition la llama periódicamente).
create or replace function public.update_trip_share_location(
  p_trip_id uuid, p_lat double precision, p_lng double precision
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Necesitas iniciar sesión';
  end if;
  update public.trip_live_shares
  set last_lat = p_lat, last_lng = p_lng, last_update_at = now()
  where trip_id = p_trip_id and sharer_id = auth.uid() and active;
end;
$$;

create or replace function public.stop_trip_share(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Necesitas iniciar sesión';
  end if;
  update public.trip_live_shares set active = false, stopped_at = now()
  where trip_id = p_trip_id and sharer_id = auth.uid() and active;
end;
$$;

-- Lectura PÚBLICA (grant a anon) por token: el contacto de emergencia no
-- necesita cuenta Unities. Solo entrega lo necesario para identificar el auto
-- y ver la posición; nada si el token no existe, ya no está activo o es viejo.
create or replace function public.get_live_share(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'active', s.active,
    'sharerName', sp.full_name,
    'driverName', dp.full_name,
    'driverRating', dp.rating_avg,
    'vehiclePlate', v.plate,
    'vehicleBrand', v.brand,
    'vehicleModel', v.model,
    'vehicleColor', v.color,
    'originCampus', t.origin_campus_name,
    'destinationCampus', t.destination_campus_name,
    'lastLat', s.last_lat,
    'lastLng', s.last_lng,
    'lastUpdateAt', s.last_update_at,
    'startedAt', s.started_at
  )
  from public.trip_live_shares s
  join public.trips t on t.id = s.trip_id
  join public.profiles dp on dp.id = t.driver_id
  join public.profiles sp on sp.id = s.sharer_id
  left join public.vehicles v on v.id = t.vehicle_id
  where s.share_token = p_token
    and s.started_at > now() - interval '18 hours';
$$;

-- SOS: registra la alerta y avisa a TODO admin/owner sin pasar por
-- notification_prefs (una alerta de seguridad no debe poder silenciarse).
create or replace function public.trigger_sos(
  p_trip_id uuid default null, p_lat double precision default null, p_lng double precision default null
)
returns public.sos_alerts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_alert public.sos_alerts;
  v_name text;
  v_contact_name text;
  v_contact_phone text;
begin
  if v_uid is null then
    raise exception 'Necesitas iniciar sesión';
  end if;

  select full_name, emergency_contact_name, emergency_contact_phone
    into v_name, v_contact_name, v_contact_phone
  from public.profiles where id = v_uid;

  insert into public.sos_alerts (trip_id, user_id, lat, lng, contact_name, contact_phone)
  values (p_trip_id, v_uid, p_lat, p_lng, v_contact_name, v_contact_phone)
  returning * into v_alert;

  insert into public.notifications (user_id, category, type, title, body, url, data)
  select p.id, 'viajes', 'sos_alerta',
         '🆘 Alerta SOS activa',
         coalesce(v_name, 'Un usuario') || ' activó el botón SOS' ||
           case when p_trip_id is not null then ' durante un viaje' else '' end || '.',
         '/admin/safety',
         jsonb_build_object('alertId', v_alert.id, 'tripId', p_trip_id, 'userId', v_uid)
  from public.profiles p
  where p.account_role in ('admin', 'owner');

  return v_alert;
end;
$$;

create or replace function public.resolve_sos(p_alert_id uuid, p_status text, p_note text default null)
returns public.sos_alerts
language plpgsql
security definer
set search_path = public
as $$
declare v_alert public.sos_alerts;
begin
  if not public.is_admin() then
    raise exception 'Solo admin/owner resuelven alertas SOS' using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('atendida', 'falsa_alarma') then
    raise exception 'Estado inválido' using errcode = 'check_violation';
  end if;

  update public.sos_alerts
  set status = p_status, resolved_at = now(), resolved_by = auth.uid(), resolution_note = p_note
  where id = p_alert_id
  returning * into v_alert;
  if not found then
    raise exception 'Alerta no encontrada' using errcode = 'no_data_found';
  end if;
  return v_alert;
end;
$$;

create or replace function public.list_sos_alerts(p_only_active boolean default true)
returns table (
  id uuid, trip_id uuid, user_id uuid, user_name text, lat double precision, lng double precision,
  contact_name text, contact_phone text, status text, created_at timestamptz, resolved_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.trip_id, a.user_id, p.full_name, a.lat, a.lng, a.contact_name, a.contact_phone,
         a.status, a.created_at, a.resolved_at
  from public.sos_alerts a
  join public.profiles p on p.id = a.user_id
  where public.is_admin() and (not p_only_active or a.status = 'activa')
  order by a.created_at desc;
$$;

-- Retención limitada de ubicaciones: auto-detiene compartidos abandonados y
-- borra los ya detenidos hace más de 24 h (no se guarda historial de rutas).
create or replace function public.purge_expired_trip_shares()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  update public.trip_live_shares
  set active = false, stopped_at = now()
  where active and coalesce(last_update_at, started_at) < now() - interval '6 hours';

  delete from public.trip_live_shares
  where not active and coalesce(stopped_at, started_at) < now() - interval '24 hours';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ===========================================================================
-- 2) Reportes y bloqueos
-- ===========================================================================

create or replace function public.report_target(
  p_target_type text,
  p_reason text,
  p_target_user_id uuid default null,
  p_target_id uuid default null,
  p_description text default null,
  p_evidence_path text default null
)
returns public.reports
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_report public.reports;
begin
  if v_uid is null then
    raise exception 'Necesitas iniciar sesión';
  end if;
  if p_target_type not in ('usuario', 'viaje', 'mensaje', 'post', 'historia', 'post_respuesta', 'pregunta', 'qa_respuesta') then
    raise exception 'Tipo de reporte inválido' using errcode = 'check_violation';
  end if;
  if p_reason not in ('spam', 'acoso', 'contenido_inapropiado', 'seguridad', 'fraude', 'otro') then
    raise exception 'Motivo inválido' using errcode = 'check_violation';
  end if;
  if p_target_user_id = v_uid then
    raise exception 'No puedes reportarte a ti mismo' using errcode = 'check_violation';
  end if;

  insert into public.reports (reporter_id, target_type, target_user_id, target_id, reason, description, evidence_path)
  values (v_uid, p_target_type, p_target_user_id, p_target_id, p_reason,
          nullif(btrim(coalesce(p_description, '')), ''), p_evidence_path)
  returning * into v_report;

  return v_report;
end;
$$;

create or replace function public.list_reports(p_status text default null, p_target_type text default null)
returns table (
  id uuid, reporter_id uuid, reporter_name text, target_type text, target_user_id uuid,
  target_user_name text, target_id uuid, reason text, description text, evidence_path text,
  status text, resolution text, resolved_by uuid, resolved_at timestamptz, created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.reporter_id, rp.full_name, r.target_type, r.target_user_id, tp.full_name,
         r.target_id, r.reason, r.description, r.evidence_path, r.status, r.resolution,
         r.resolved_by, r.resolved_at, r.created_at
  from public.reports r
  left join public.profiles rp on rp.id = r.reporter_id
  left join public.profiles tp on tp.id = r.target_user_id
  where public.can_moderate()
    and (p_status is null or r.status = p_status)
    and (p_target_type is null or r.target_type = p_target_type)
  order by r.created_at desc;
$$;

-- Triaje ligero (tutor+): marcar en revisión o descartar sin sanción.
create or replace function public.triage_report(p_report_id uuid, p_status text)
returns public.reports
language plpgsql
security definer
set search_path = public
as $$
declare v_report public.reports;
begin
  if not public.can_moderate() then
    raise exception 'Sin permiso para moderar' using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('en_revision', 'descartado') then
    raise exception 'Estado inválido' using errcode = 'check_violation';
  end if;

  update public.reports
  set status = p_status,
      resolved_by = case when p_status = 'descartado' then auth.uid() else resolved_by end,
      resolved_at = case when p_status = 'descartado' then now() else resolved_at end
  where id = p_report_id
  returning * into v_report;
  if not found then
    raise exception 'Reporte no encontrado' using errcode = 'no_data_found';
  end if;
  return v_report;
end;
$$;

-- Sanciones sobre usuarios (admin+): advertencia, suspensión temporal, baneo o
-- levantar una sanción vigente. Deja auditoría en moderation_actions y cierra
-- el reporte de origen si se pasó uno.
create or replace function public.apply_moderation_action(
  p_target_user_id uuid,
  p_action text,
  p_reason text,
  p_suspend_days integer default null,
  p_report_id uuid default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_until timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Solo admin/owner aplican sanciones' using errcode = 'insufficient_privilege';
  end if;
  if p_action not in ('advertencia', 'suspension', 'baneo', 'levantar_sancion') then
    raise exception 'Acción inválida' using errcode = 'check_violation';
  end if;
  if p_target_user_id = auth.uid() then
    raise exception 'No puedes sancionarte a ti mismo' using errcode = 'check_violation';
  end if;

  if p_action = 'advertencia' then
    update public.profiles set warnings_count = warnings_count + 1
    where id = p_target_user_id returning * into v_profile;
  elsif p_action = 'suspension' then
    v_until := now() + (greatest(coalesce(p_suspend_days, 3), 1) || ' days')::interval;
    update public.profiles set moderation_status = 'suspendido', moderation_until = v_until
    where id = p_target_user_id returning * into v_profile;
  elsif p_action = 'baneo' then
    update public.profiles set moderation_status = 'baneado', moderation_until = null
    where id = p_target_user_id returning * into v_profile;
  elsif p_action = 'levantar_sancion' then
    update public.profiles set moderation_status = 'activo', moderation_until = null
    where id = p_target_user_id returning * into v_profile;
  end if;
  if not found then
    raise exception 'Usuario no encontrado' using errcode = 'no_data_found';
  end if;

  insert into public.moderation_actions (target_user_id, moderator_id, action, report_id, reason, suspended_until)
  values (p_target_user_id, auth.uid(), p_action, p_report_id,
          coalesce(nullif(btrim(p_reason), ''), 'Sin motivo especificado'), v_until);

  if p_report_id is not null then
    update public.reports
    set status = 'resuelto', resolution = p_action, resolved_by = auth.uid(), resolved_at = now()
    where id = p_report_id;
  end if;

  perform public.enqueue_notification(
    p_target_user_id, 'social', 'sancion_' || p_action,
    case p_action
      when 'advertencia' then '⚠️ Recibiste una advertencia'
      when 'suspension' then '🚫 Tu cuenta quedó suspendida temporalmente'
      when 'baneo' then '🚫 Tu cuenta fue baneada'
      else 'ℹ️ Se levantó una sanción de tu cuenta'
    end,
    coalesce(nullif(btrim(p_reason), ''), 'Revisa las reglas de la comunidad Unities.'),
    '/community-rules', jsonb_build_object('action', p_action)
  );

  return v_profile;
end;
$$;

-- Modera contenido reportado (admin+): elimina la fila referida (si aplica) y
-- cierra el reporte. Reutiliza las políticas DELETE ya existentes de
-- posts/stories/questions/question_replies (is_admin() ya puede borrar ahí).
create or replace function public.moderate_content(p_report_id uuid, p_delete boolean, p_note text default null)
returns public.reports
language plpgsql
security definer
set search_path = public
as $$
declare v_report public.reports;
begin
  if not public.is_admin() then
    raise exception 'Solo admin/owner moderan contenido' using errcode = 'insufficient_privilege';
  end if;

  select * into v_report from public.reports where id = p_report_id;
  if not found then
    raise exception 'Reporte no encontrado' using errcode = 'no_data_found';
  end if;

  if p_delete and v_report.target_id is not null then
    case v_report.target_type
      when 'post' then delete from public.posts where id = v_report.target_id;
      when 'historia' then delete from public.stories where id = v_report.target_id;
      when 'post_respuesta' then delete from public.post_replies where id = v_report.target_id;
      when 'pregunta' then delete from public.questions where id = v_report.target_id;
      when 'qa_respuesta' then delete from public.question_replies where id = v_report.target_id;
      else null;
    end case;
  end if;

  update public.reports
  set status = 'resuelto',
      resolution = case when p_delete then 'contenido_eliminado' else 'sin_accion' end,
      resolved_by = auth.uid(), resolved_at = coalesce(resolved_at, now())
  where id = p_report_id
  returning * into v_report;

  return v_report;
end;
$$;

-- ===========================================================================
-- 3) Moderación de contenido: filtro de palabras + rate limiting
-- ===========================================================================

create or replace function public.contains_blocked_word(p_text text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.blocked_words w
    where p_text is not null and p_text ilike '%' || w.word || '%'
  );
$$;

grant execute on function public.contains_blocked_word(text) to authenticated, anon;

create or replace function public.enforce_word_filter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_text text; v_row jsonb;
begin
  -- to_jsonb(new) evita referenciar columnas que no existen en cada tabla
  -- (posts no tiene caption, stories no tiene title): ->> devuelve null si falta.
  -- Un solo trigger sirve a posts/stories/post_replies/questions/question_replies.
  v_row := to_jsonb(new);
  v_text := concat_ws(' ', v_row->>'body', v_row->>'caption', v_row->>'title');
  if public.contains_blocked_word(v_text) then
    raise exception 'Tu publicación contiene palabras no permitidas por las reglas de la comunidad Unities'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_word_filter() from public, anon, authenticated;

-- Rate limiting básico anti-spam: máximo N publicaciones por autor en una
-- ventana de tiempo, por tabla. Umbrales pensados para uso humano normal.
create or replace function public.enforce_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_window interval;
  v_max integer;
  v_count integer;
  v_column text;
begin
  -- El autor se lee vía to_jsonb (post_replies usa user_id; el resto author_id),
  -- evitando el mismo problema de columnas ausentes que enforce_word_filter.
  case tg_table_name
    when 'posts'            then v_window := interval '10 minutes'; v_max := 5;  v_column := 'author_id';
    when 'stories'          then v_window := interval '1 hour';      v_max := 10; v_column := 'author_id';
    when 'post_replies'     then v_window := interval '5 minutes';   v_max := 10; v_column := 'user_id';
    when 'questions'        then v_window := interval '10 minutes';  v_max := 5;  v_column := 'author_id';
    when 'question_replies' then v_window := interval '5 minutes';   v_max := 15; v_column := 'author_id';
    else return new;
  end case;

  v_author := (to_jsonb(new)->>v_column)::uuid;

  execute format('select count(*) from public.%I where %I = $1 and created_at > now() - $2', tg_table_name, v_column)
    into v_count using v_author, v_window;

  if v_count >= v_max then
    raise exception 'Estás publicando muy rápido. Espera unos minutos e inténtalo de nuevo.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_rate_limit() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['posts', 'stories', 'post_replies', 'questions', 'question_replies']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_word_filter', t);
    execute format(
      'create trigger %I before insert on public.%I for each row execute function public.enforce_word_filter()',
      t || '_word_filter', t
    );
    execute format('drop trigger if exists %I on public.%I', t || '_rate_limit', t);
    execute format(
      'create trigger %I before insert on public.%I for each row execute function public.enforce_rate_limit()',
      t || '_rate_limit', t
    );
  end loop;
end;
$$;

drop trigger if exists driver_verifications_set_updated_at on public.driver_verifications;
create trigger driver_verifications_set_updated_at before update on public.driver_verifications
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- 4) Identidad: revisión de credenciales + verificación reforzada de conductor
-- ===========================================================================

-- El propio usuario ya subió su captura (uploadCredential, Storage); esto solo
-- avisa a la cola que hay algo nuevo por revisar. credential_verified/estado
-- quedan blindados por protect_profile_columns (más abajo).
create or replace function public.submit_credential_review()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_profile public.profiles;
begin
  if v_uid is null then
    raise exception 'Necesitas iniciar sesión';
  end if;
  update public.profiles
  set credential_review_status = 'en_revision', credential_submitted_at = now(), credential_review_note = null
  where id = v_uid
  returning * into v_profile;
  return v_profile;
end;
$$;

create or replace function public.review_credential(p_user_id uuid, p_approve boolean, p_note text default null)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare v_profile public.profiles;
begin
  if not public.can_moderate() then
    raise exception 'Sin permiso para revisar credenciales' using errcode = 'insufficient_privilege';
  end if;

  update public.profiles
  set credential_review_status = case when p_approve then 'aprobado' else 'rechazado' end,
      credential_verified = p_approve,
      credential_reviewed_by = auth.uid(),
      credential_reviewed_at = now(),
      credential_review_note = p_note,
      credential_expires_at = case when p_approve then now() + interval '6 months' else null end
  where id = p_user_id
  returning * into v_profile;
  if not found then
    raise exception 'Usuario no encontrado' using errcode = 'no_data_found';
  end if;

  perform public.enqueue_notification(
    p_user_id, 'social', 'credencial_revisada',
    case when p_approve then '✅ Tu credencial fue verificada' else '❌ Tu credencial fue rechazada' end,
    coalesce(nullif(btrim(p_note), ''),
      case when p_approve then 'Válida por un semestre.' else 'Vuelve a subir una captura clara de tu intranet.' end),
    '/', jsonb_build_object('approved', p_approve)
  );

  return v_profile;
end;
$$;

create or replace function public.list_credential_reviews(p_status text default 'en_revision')
returns table (
  id uuid, full_name text, email text, university_id text, credential_review_status text,
  credential_submitted_at timestamptz, credential_expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.email, p.university_id, p.credential_review_status,
         p.credential_submitted_at, p.credential_expires_at
  from public.profiles p
  where public.can_moderate() and (p_status is null or p.credential_review_status = p_status)
  order by p.credential_submitted_at nulls last;
$$;

-- Vencimiento semestral: si expiró, vuelve a pedir verificación (no se
-- auto-renueva sola).
create or replace function public.expire_credential_verifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  update public.profiles
  set credential_verified = false, credential_review_status = 'pendiente'
  where credential_review_status = 'aprobado'
    and credential_expires_at is not null
    and credential_expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Verificación reforzada de conductor: cédula + licencia (Storage privado
-- driver-documents), 1:1 con profiles vía upsert.
create or replace function public.submit_driver_verification(p_id_path text, p_license_path text)
returns public.driver_verifications
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_row public.driver_verifications;
begin
  if v_uid is null then
    raise exception 'Necesitas iniciar sesión';
  end if;
  if btrim(coalesce(p_id_path, '')) = '' or btrim(coalesce(p_license_path, '')) = '' then
    raise exception 'Sube ambos documentos: cédula y licencia' using errcode = 'check_violation';
  end if;

  insert into public.driver_verifications (user_id, id_document_path, license_document_path, status, submitted_at)
  values (v_uid, p_id_path, p_license_path, 'en_revision', now())
  on conflict (user_id) do update
    set id_document_path = excluded.id_document_path,
        license_document_path = excluded.license_document_path,
        status = 'en_revision',
        submitted_at = now(),
        reviewed_by = null, reviewed_at = null, review_note = null,
        updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.review_driver_verification(p_user_id uuid, p_approve boolean, p_note text default null)
returns public.driver_verifications
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.driver_verifications;
begin
  if not public.can_moderate() then
    raise exception 'Sin permiso para revisar verificaciones de conductor' using errcode = 'insufficient_privilege';
  end if;

  update public.driver_verifications
  set status = case when p_approve then 'aprobado' else 'rechazado' end,
      reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note, updated_at = now()
  where user_id = p_user_id
  returning * into v_row;
  if not found then
    raise exception 'No hay una verificación pendiente de este usuario' using errcode = 'no_data_found';
  end if;

  perform public.enqueue_notification(
    p_user_id, 'social', 'verificacion_conductor',
    case when p_approve then '✅ Verificación reforzada aprobada' else '❌ Verificación reforzada rechazada' end,
    coalesce(nullif(btrim(p_note), ''), 'Revisa el estado en tu perfil.'),
    '/', jsonb_build_object('approved', p_approve)
  );

  return v_row;
end;
$$;

create or replace function public.list_driver_verifications(p_status text default 'en_revision')
returns table (
  user_id uuid, full_name text, status text, submitted_at timestamptz,
  id_document_path text, license_document_path text
)
language sql
stable
security definer
set search_path = public
as $$
  select d.user_id, p.full_name, d.status, d.submitted_at, d.id_document_path, d.license_document_path
  from public.driver_verifications d
  join public.profiles p on p.id = d.user_id
  where public.can_moderate() and (p_status is null or d.status = p_status)
  order by d.submitted_at nulls last;
$$;

-- Si el owner activa require_reinforced_driver_verification, publicar un
-- viaje exige driver_verifications.status = 'aprobado'.
create or replace function public.enforce_driver_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_required boolean; v_status text;
begin
  select require_reinforced_driver_verification into v_required
  from public.platform_config where id = 'default';
  if not coalesce(v_required, false) then
    return new;
  end if;

  select status into v_status from public.driver_verifications where user_id = new.driver_id;
  if coalesce(v_status, 'pendiente') <> 'aprobado' then
    raise exception 'Necesitas completar la verificación reforzada de conductor (cédula + licencia) antes de publicar viajes'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists trips_enforce_driver_verification on public.trips;
create trigger trips_enforce_driver_verification before insert on public.trips
  for each row execute function public.enforce_driver_verification();

-- Extiende update_platform_config (Sesión 8) con el nuevo interruptor. Se
-- reemplaza la función completa (firma nueva) para no dejar dos overloads.
drop function if exists public.update_platform_config(integer, integer, integer);

create or replace function public.update_platform_config(
  p_commission_clp integer default null,
  p_credit_clp_rate integer default null,
  p_max_credit_discount_pct integer default null,
  p_require_reinforced_driver_verification boolean default null
)
returns public.platform_config
language plpgsql
security definer
set search_path = public
as $$
declare v_cfg public.platform_config;
begin
  if not public.is_owner() then
    raise exception 'Solo el owner ajusta la configuración' using errcode = 'insufficient_privilege';
  end if;

  update public.platform_config
    set commission_clp = coalesce(p_commission_clp, commission_clp),
        credit_clp_rate = coalesce(p_credit_clp_rate, credit_clp_rate),
        max_credit_discount_pct = coalesce(p_max_credit_discount_pct, max_credit_discount_pct),
        require_reinforced_driver_verification =
          coalesce(p_require_reinforced_driver_verification, require_reinforced_driver_verification),
        updated_by = auth.uid()
  where id = 'default'
  returning * into v_cfg;

  return v_cfg;
end;
$$;

-- ===========================================================================
-- 5) Privacidad y datos
-- ===========================================================================

-- Perfil público de un tercero, respetando profile_visibility y bloqueo.
-- Los companions de viaje (shares_confirmed_trip) siempre pueden verlo, igual
-- que en la regla de mensajería (Sesión DM híbrido).
create or replace function public.get_public_profile(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p.id = auth.uid() or public.is_admin() or p.profile_visibility = 'publico'
         or public.shares_confirmed_trip(auth.uid(), p.id) then
      jsonb_build_object(
        'id', p.id, 'fullName', p.full_name, 'avatarUrl', p.avatar_url,
        'ratingAvg', p.rating_avg, 'universityId', p.university_id,
        'credentialVerified', p.credential_verified,
        'completedTrips', p.best_streak_completed_trips,
        'memberSince', p.created_at,
        'isBlocked', public.are_blocked(auth.uid(), p.id)
      )
    else jsonb_build_object('id', p.id, 'hidden', true)
  end
  from public.profiles p
  where p.id = p_user_id;
$$;

grant execute on function public.get_public_profile(uuid) to authenticated;

-- Exporta TODOS los datos propios de auth.uid() en un solo jsonb (derecho de
-- portabilidad). SECURITY INVOKER a propósito (sin "security definer"): solo
-- puede leer lo que la RLS ya le permite ver de sus propias filas.
create or replace function public.export_my_data()
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'vehicles', (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) from public.vehicles v where v.owner_id = auth.uid()),
    'tripsAsDriver', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.trips t where t.driver_id = auth.uid()),
    'bookings', (select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) from public.bookings b where b.passenger_id = auth.uid()),
    'payments', (select coalesce(jsonb_agg(to_jsonb(pay)), '[]'::jsonb)
                 from public.payments pay join public.bookings b on b.id = pay.booking_id
                 where b.passenger_id = auth.uid()),
    'ratingsGiven', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from public.ratings r where r.from_id = auth.uid()),
    'ratingsReceived', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from public.ratings r where r.to_id = auth.uid()),
    'creditTransactions', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from public.credit_transactions c where c.user_id = auth.uid()),
    'redemptions', (select coalesce(jsonb_agg(to_jsonb(rd)), '[]'::jsonb) from public.redemptions rd where rd.user_id = auth.uid()),
    'reportsFiled', (select coalesce(jsonb_agg(to_jsonb(rp)), '[]'::jsonb) from public.reports rp where rp.reporter_id = auth.uid()),
    'exportedAt', now()
  );
$$;

-- Borrado de cuenta: anonimiza datos personales y deja la fila lista para que
-- la Edge Function delete-account borre auth.users (cascada sobre profiles).
-- Server-only: SOLO service_role la ejecuta (la llama la Edge Function tras
-- verificar el JWT del usuario), nunca el cliente directo.
create or replace function public.admin_delete_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set full_name = 'Usuario eliminado',
      avatar_url = null,
      emergency_contact_name = null,
      emergency_contact_phone = null,
      profile_visibility = 'oculto',
      deletion_requested_at = now()
  where id = p_user_id;

  delete from public.bank_details where user_id = p_user_id;
  delete from public.push_tokens where user_id = p_user_id;
end;
$$;

-- ===========================================================================
-- 6) Anti-abuso
-- ===========================================================================

-- redeem_item (Sesión 3) + límites anti-abuso: máx. 5 canjes/24h y no repetir
-- el mismo beneficio antes de 24h (evita vaciar stock/farmear un descuento).
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

  perform pg_advisory_xact_lock(hashtext('redeem:' || v_uid::text));

  if (select count(*) from public.redemptions where user_id = v_uid and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'Alcanzaste el límite de canjes por día. Intenta mañana.' using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from public.redemptions
    where user_id = v_uid and item_id = p_item_id and created_at > now() - interval '24 hours'
  ) then
    raise exception 'Ya canjeaste este beneficio hoy; espera 24 h para repetirlo.' using errcode = 'check_violation';
  end if;

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

-- register_push_token (Sesión 7) + bitácora de solo-inserción para detección
-- de cuentas duplicadas (push_tokens se reasigna y pierde el historial).
create or replace function public.register_push_token(
  p_token text, p_platform text, p_device_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = 'insufficient_privilege';
  end if;
  if p_platform not in ('ios', 'android', 'web') then
    raise exception 'Plataforma inválida' using errcode = 'check_violation';
  end if;
  if p_token is null or btrim(p_token) = '' then
    raise exception 'Token vacío' using errcode = 'check_violation';
  end if;

  insert into public.push_tokens (user_id, token, platform, device_name)
  values (v_uid, btrim(p_token), p_platform, nullif(btrim(coalesce(p_device_name, '')), ''))
  on conflict (token) do update
    set user_id     = excluded.user_id,
        platform    = excluded.platform,
        device_name = excluded.device_name,
        updated_at  = now();

  insert into public.device_token_seen (token, user_id, platform)
  values (btrim(p_token), v_uid, p_platform);
end;
$$;

create or replace function public.list_duplicate_account_signals(p_days integer default 90)
returns table (
  token text, user_ids uuid[], user_names text[], distinct_users bigint, last_seen_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select d.token,
         array_agg(distinct d.user_id) as user_ids,
         array_agg(distinct coalesce(p.full_name, p.email)) as user_names,
         count(distinct d.user_id) as distinct_users,
         max(d.seen_at) as last_seen_at
  from public.device_token_seen d
  join public.profiles p on p.id = d.user_id
  where public.is_owner() and d.seen_at > now() - (greatest(coalesce(p_days, 90), 1) || ' days')::interval
  group by d.token
  having count(distinct d.user_id) > 1
  order by max(d.seen_at) desc;
$$;

-- ===========================================================================
-- Bloqueo: endurece el DM híbrido (Sesión "DM híbrido") y el directorio
-- ===========================================================================

create or replace function public.can_start_dm(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_a is not null and p_b is not null and p_a <> p_b
    and not public.are_blocked(p_a, p_b)
    and (
      public.is_official_account(p_a)
      or public.is_official_account(p_b)
      or public.shares_confirmed_trip(p_a, p_b)
    );
$$;

revoke execute on function public.can_start_dm(uuid, uuid) from public, anon, authenticated;

create or replace function public.list_dm_contacts()
returns table (id uuid, full_name text, avatar_url text, is_official boolean)
language sql
stable
security definer
set search_path = public
as $$
  with companions as (
    select t.driver_id as user_id
    from public.bookings b
    join public.trips t on t.id = b.trip_id
    where b.passenger_id = auth.uid() and b.status = 'confirmed'
    union
    select b.passenger_id
    from public.bookings b
    join public.trips t on t.id = b.trip_id
    where t.driver_id = auth.uid() and b.status = 'confirmed'
    union
    select b2.passenger_id
    from public.bookings b1
    join public.bookings b2 on b2.trip_id = b1.trip_id
    where b1.passenger_id = auth.uid()
      and b1.status = 'confirmed' and b2.status = 'confirmed'
  )
  select p.id, p.full_name, p.avatar_url,
         (p.account_role in ('tutor', 'admin', 'owner')) as is_official
  from public.profiles p
  where p.id <> auth.uid()
    and not public.are_blocked(auth.uid(), p.id)
    and (
      p.account_role in ('tutor', 'admin', 'owner')
      or p.id in (select user_id from companions)
    )
  order by (p.account_role in ('tutor', 'admin', 'owner')) desc,
           lower(coalesce(p.full_name, p.email)) asc;
$$;

revoke execute on function public.list_dm_contacts() from public, anon;
grant execute on function public.list_dm_contacts() to authenticated;

-- Enviar mensajes exige, además del acceso a la conversación, no estar
-- sancionado y (en un DM) no tener bloqueo mutuo con la contraparte.
create or replace function public.can_send_message(p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_access_conversation(p_conversation)
    and public.is_active_account()
    and not exists (
      select 1 from public.conversations c
      where c.id = p_conversation
        and c.kind = 'dm'
        and public.are_blocked((public.dm_key_users(c.dm_key))[1], (public.dm_key_users(c.dm_key))[2])
    );
$$;

grant execute on function public.can_send_message(uuid) to authenticated, anon;

-- ===========================================================================
-- reserve_seat (Sesión 3) + gate de moderation_status (baneo/suspensión)
-- ===========================================================================

create or replace function public.reserve_seat(p_trip_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
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
  if v_profile.moderation_status = 'baneado' then
    raise exception 'Tu cuenta está baneada' using errcode = 'check_violation';
  end if;
  if v_profile.moderation_status = 'suspendido' and v_profile.moderation_until is not null
     and v_profile.moderation_until > now() then
    raise exception 'Tu cuenta está suspendida hasta %', v_profile.moderation_until
      using errcode = 'check_violation';
  end if;
  if v_profile.payment_ban_until is not null and v_profile.payment_ban_until > now() then
    raise exception 'Baneado de los turnos por impago hasta %', v_profile.payment_ban_until
      using errcode = 'check_violation';
  end if;
  if v_profile.block_until is not null and v_profile.block_until > now() then
    raise exception 'Usuario bloqueado por cancelaciones tardías hasta %', v_profile.block_until
      using errcode = 'check_violation';
  end if;

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
    v_booking.id, 'pending', v_trip.price_clp, c_commission_clp,
    v_trip.price_clp + c_commission_clp, now() + interval '48 hours'
  );

  update public.trips
    set seats_taken = seats_taken + 1,
        status = case when seats_taken + 1 >= seats_total then 'full' else status end
  where id = p_trip_id;

  return v_booking;
end;
$$;

-- ===========================================================================
-- protect_profile_columns (Sesión 3) + nuevas columnas server-managed
-- ===========================================================================

create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if public.is_admin() then
    return new;
  end if;
  new.email                       := old.email;
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
  -- Sesión 9: nadie se auto-verifica, auto-levanta una sanción ni se cambia
  -- la visibilidad de moderación desde el cliente. Enviar a revisión pasa por
  -- submit_credential_review (RPC definer, exento por el chequeo de arriba).
  new.credential_verified         := old.credential_verified;
  new.credential_review_status    := old.credential_review_status;
  new.credential_submitted_at     := old.credential_submitted_at;
  new.credential_reviewed_by      := old.credential_reviewed_by;
  new.credential_reviewed_at      := old.credential_reviewed_at;
  new.credential_review_note      := old.credential_review_note;
  new.credential_expires_at       := old.credential_expires_at;
  new.moderation_status           := old.moderation_status;
  new.moderation_until            := old.moderation_until;
  new.warnings_count              := old.warnings_count;
  return new;
end;
$$;

-- ===========================================================================
-- Endurece posts/stories/guides/questions/question_replies/post_replies:
-- exigir is_active_account() además de can_publish()/autoría propia.
-- ===========================================================================

drop policy if exists posts_insert_publisher on public.posts;
create policy posts_insert_publisher on public.posts
  for insert to authenticated
  with check (public.can_publish() and public.is_active_account() and author_id = (select auth.uid()));

drop policy if exists stories_insert_publisher on public.stories;
create policy stories_insert_publisher on public.stories
  for insert to authenticated
  with check (public.can_publish() and public.is_active_account() and author_id = (select auth.uid()));

drop policy if exists guides_insert_tutor on public.guides;
create policy guides_insert_tutor on public.guides
  for insert to authenticated
  with check (public.can_publish() and public.is_active_account() and author_id = (select auth.uid()));

drop policy if exists questions_insert_own on public.questions;
create policy questions_insert_own on public.questions
  for insert to authenticated
  with check (public.is_active_account() and author_id = (select auth.uid()));

drop policy if exists question_replies_insert on public.question_replies;
create policy question_replies_insert on public.question_replies
  for insert to authenticated
  with check (
    public.is_active_account()
    and author_id = (select auth.uid())
    and (
      (not is_official and publisher_id is null)
      or (is_official and public.can_answer_question(question_id, publisher_id))
    )
  );

drop policy if exists post_replies_insert_own on public.post_replies;
create policy post_replies_insert_own on public.post_replies
  for insert to authenticated
  with check (public.is_active_account() and user_id = (select auth.uid()));

-- Oculta respuestas entre usuarios bloqueados (mutuo, en ambos sentidos).
drop policy if exists post_replies_select on public.post_replies;
create policy post_replies_select on public.post_replies
  for select to authenticated using (not public.are_blocked((select auth.uid()), user_id));

drop policy if exists question_replies_select on public.question_replies;
create policy question_replies_select on public.question_replies
  for select to authenticated using (not public.are_blocked((select auth.uid()), author_id));

-- trips: publicar exige cuenta activa (no baneada/suspendida), además de ser
-- el propio conductor.
drop policy if exists trips_insert_driver on public.trips;
create policy trips_insert_driver on public.trips
  for insert to authenticated
  with check (driver_id = (select auth.uid()) and public.is_active_account());

-- messages: enviar exige acceso a la conversación, cuenta activa y no bloqueo
-- mutuo en un DM (can_send_message reemplaza can_access_conversation aquí).
drop policy if exists messages_insert_member on public.messages;
create policy messages_insert_member on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.can_send_message(conversation_id)
  );

-- ===========================================================================
-- RLS de las tablas nuevas
-- ===========================================================================

alter table public.trip_live_shares  enable row level security;
alter table public.sos_alerts        enable row level security;
alter table public.reports           enable row level security;
alter table public.user_blocks       enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.blocked_words     enable row level security;
alter table public.driver_verifications enable row level security;
alter table public.device_token_seen enable row level security;

-- trip_live_shares: el dueño del compartir (y admin, auditoría). El contacto
-- externo entra por get_live_share (security definer), no por esta tabla.
drop policy if exists trip_live_shares_select_own on public.trip_live_shares;
create policy trip_live_shares_select_own on public.trip_live_shares
  for select to authenticated using (sharer_id = (select auth.uid()) or public.is_admin());
-- Sin insert/update/delete: solo start/update/stop_trip_share (RPC).

-- sos_alerts: quien la disparó, y admin/owner (bandeja de seguridad).
drop policy if exists sos_alerts_select on public.sos_alerts;
create policy sos_alerts_select on public.sos_alerts
  for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
-- Sin insert/update: solo trigger_sos / resolve_sos (RPC).

-- reports: el reportante ve los suyos; tutor+ ve todos (bandeja de moderación).
drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports
  for select to authenticated using (reporter_id = (select auth.uid()) or public.can_moderate());
-- Sin insert/update: solo report_target / triage_report / apply_moderation_action / moderate_content (RPC).

-- user_blocks: cada quien administra los suyos directamente (sin RPC: es
-- simple, como ratings_insert_own).
drop policy if exists user_blocks_select_own on public.user_blocks;
create policy user_blocks_select_own on public.user_blocks
  for select to authenticated using (blocker_id = (select auth.uid()) or public.is_admin());

drop policy if exists user_blocks_insert_own on public.user_blocks;
create policy user_blocks_insert_own on public.user_blocks
  for insert to authenticated with check (blocker_id = (select auth.uid()));

drop policy if exists user_blocks_delete_own on public.user_blocks;
create policy user_blocks_delete_own on public.user_blocks
  for delete to authenticated using (blocker_id = (select auth.uid()));

-- moderation_actions: el sancionado ve su propio historial; admin/owner ven todo.
drop policy if exists moderation_actions_select on public.moderation_actions;
create policy moderation_actions_select on public.moderation_actions
  for select to authenticated using (target_user_id = (select auth.uid()) or public.is_admin());
-- Sin insert/update/delete: solo apply_moderation_action (RPC).

-- blocked_words: tutor+ puede ver la lista (para saber qué se filtra);
-- administrarla (crear/borrar) es admin+.
drop policy if exists blocked_words_select on public.blocked_words;
create policy blocked_words_select on public.blocked_words
  for select to authenticated using (public.can_moderate());

drop policy if exists blocked_words_write_admin on public.blocked_words;
create policy blocked_words_write_admin on public.blocked_words
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- driver_verifications: el propio conductor y tutor+ (revisión).
drop policy if exists driver_verifications_select on public.driver_verifications;
create policy driver_verifications_select on public.driver_verifications
  for select to authenticated using (user_id = (select auth.uid()) or public.can_moderate());
-- Sin insert/update: solo submit_driver_verification / review_driver_verification (RPC).

-- device_token_seen: señal de anti-abuso, solo admin/owner la audita.
drop policy if exists device_token_seen_select on public.device_token_seen;
create policy device_token_seen_select on public.device_token_seen
  for select to authenticated using (public.is_admin());
-- Sin insert: solo register_push_token (RPC).

-- ===========================================================================
-- Permisos de ejecución
-- ===========================================================================

revoke execute on function public.start_trip_share(uuid, text, text)              from public, anon;
revoke execute on function public.update_trip_share_location(uuid, double precision, double precision) from public, anon;
revoke execute on function public.stop_trip_share(uuid)                           from public, anon;
revoke execute on function public.get_live_share(text)                            from public;
revoke execute on function public.trigger_sos(uuid, double precision, double precision) from public, anon;
revoke execute on function public.resolve_sos(uuid, text, text)                   from public, anon;
revoke execute on function public.list_sos_alerts(boolean)                        from public, anon;
revoke execute on function public.purge_expired_trip_shares()                     from public, anon, authenticated;
revoke execute on function public.report_target(text, text, uuid, uuid, text, text) from public, anon;
revoke execute on function public.list_reports(text, text)                        from public, anon;
revoke execute on function public.triage_report(uuid, text)                       from public, anon;
revoke execute on function public.apply_moderation_action(uuid, text, text, integer, uuid) from public, anon;
revoke execute on function public.moderate_content(uuid, boolean, text)           from public, anon;
revoke execute on function public.submit_credential_review()                     from public, anon;
revoke execute on function public.review_credential(uuid, boolean, text)          from public, anon;
revoke execute on function public.list_credential_reviews(text)                   from public, anon;
revoke execute on function public.expire_credential_verifications()               from public, anon, authenticated;
revoke execute on function public.submit_driver_verification(text, text)          from public, anon;
revoke execute on function public.review_driver_verification(uuid, boolean, text) from public, anon;
revoke execute on function public.list_driver_verifications(text)                 from public, anon;
revoke execute on function public.enforce_driver_verification()                   from public, anon, authenticated;
revoke execute on function public.update_platform_config(integer, integer, integer, boolean) from public, anon;
revoke execute on function public.export_my_data()                               from public, anon;
revoke execute on function public.admin_delete_account(uuid)                      from public, anon, authenticated;
revoke execute on function public.redeem_item(text)                              from public, anon;
revoke execute on function public.register_push_token(text, text, text)          from public, anon;
revoke execute on function public.list_duplicate_account_signals(integer)         from public, anon;
revoke execute on function public.can_send_message(uuid)                          from public;
revoke execute on function public.reserve_seat(uuid)                              from public, anon;
revoke execute on function public.protect_profile_columns()                       from public, anon, authenticated;

grant execute on function public.start_trip_share(uuid, text, text)              to authenticated;
grant execute on function public.update_trip_share_location(uuid, double precision, double precision) to authenticated;
grant execute on function public.stop_trip_share(uuid)                           to authenticated;
grant execute on function public.get_live_share(text)                            to authenticated, anon;
grant execute on function public.trigger_sos(uuid, double precision, double precision) to authenticated;
grant execute on function public.resolve_sos(uuid, text, text)                   to authenticated;
grant execute on function public.list_sos_alerts(boolean)                        to authenticated;
grant execute on function public.report_target(text, text, uuid, uuid, text, text) to authenticated;
grant execute on function public.list_reports(text, text)                        to authenticated;
grant execute on function public.triage_report(uuid, text)                       to authenticated;
grant execute on function public.apply_moderation_action(uuid, text, text, integer, uuid) to authenticated;
grant execute on function public.moderate_content(uuid, boolean, text)           to authenticated;
grant execute on function public.submit_credential_review()                     to authenticated;
grant execute on function public.review_credential(uuid, boolean, text)          to authenticated;
grant execute on function public.list_credential_reviews(text)                   to authenticated;
grant execute on function public.submit_driver_verification(text, text)          to authenticated;
grant execute on function public.review_driver_verification(uuid, boolean, text) to authenticated;
grant execute on function public.list_driver_verifications(text)                 to authenticated;
grant execute on function public.update_platform_config(integer, integer, integer, boolean) to authenticated;
grant execute on function public.export_my_data()                               to authenticated;
grant execute on function public.admin_delete_account(uuid)                      to service_role;
grant execute on function public.redeem_item(text)                              to authenticated;
grant execute on function public.register_push_token(text, text, text)          to authenticated;
grant execute on function public.list_duplicate_account_signals(integer)         to authenticated;
grant execute on function public.reserve_seat(uuid)                              to authenticated;

-- ===========================================================================
-- Realtime: la bandeja de seguridad y las alertas SOS se actualizan en vivo.
-- ===========================================================================

do $$
declare t text;
begin
  foreach t in array array['sos_alerts', 'reports']
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

-- ===========================================================================
-- pg_cron: retención de ubicaciones y vencimiento semestral de credenciales.
-- ===========================================================================

do $$
declare v_job text;
begin
  foreach v_job in array array['safety-purge-trip-shares', 'safety-expire-credentials']
  loop
    perform cron.unschedule(v_job)
    where exists (select 1 from cron.job where jobname = v_job);
  end loop;
exception when others then
  null;
end;
$$;

do $$
begin
  perform cron.schedule(
    'safety-purge-trip-shares',
    '20 * * * *',
    $cron$ select public.purge_expired_trip_shares(); $cron$
  );
  perform cron.schedule(
    'safety-expire-credentials',
    '30 3 * * *',
    $cron$ select public.expire_credential_verifications(); $cron$
  );
exception when others then
  raise notice 'pg_cron no disponible; programa estas funciones con un scheduler externo.';
end;
$$;


-- Unities — Sesión 9: Storage (evidencia de reportes, documentos de conductor)
-- y seed del filtro de palabras. Mismo patrón que dispute-evidence (Sesión 8):
-- bucket privado, ruta `<uid>/<archivo>`, acceso por URL firmada.

insert into storage.buckets (id, name, public)
values ('report-evidence', 'report-evidence', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('driver-documents', 'driver-documents', false)
on conflict (id) do nothing;

-- --- report-evidence ---------------------------------------------------------
-- Quien reporta sube su propia evidencia; tutor+ la revisa (bandeja de reportes).
drop policy if exists report_evidence_select on storage.objects;
create policy report_evidence_select on storage.objects
  for select to authenticated using (
    bucket_id = 'report-evidence'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or public.can_moderate())
  );

drop policy if exists report_evidence_insert_own on storage.objects;
create policy report_evidence_insert_own on storage.objects
  for insert to authenticated with check (
    bucket_id = 'report-evidence' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- --- driver-documents (cédula + licencia, verificación reforzada) -----------
drop policy if exists driver_documents_select on storage.objects;
create policy driver_documents_select on storage.objects
  for select to authenticated using (
    bucket_id = 'driver-documents'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or public.can_moderate())
  );

drop policy if exists driver_documents_insert_own on storage.objects;
create policy driver_documents_insert_own on storage.objects
  for insert to authenticated with check (
    bucket_id = 'driver-documents' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists driver_documents_update_own on storage.objects;
create policy driver_documents_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'driver-documents' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'driver-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- --- credentials (Sesión 3): la revisión ahora es de tutor+, no solo admin --
drop policy if exists credentials_select_own on storage.objects;
create policy credentials_select_own on storage.objects
  for select to authenticated using (
    bucket_id = 'credentials'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or public.can_moderate())
  );

-- --- Seed: filtro de palabras básico (ampliable desde la cola de moderación) --
insert into public.blocked_words (word)
values ('puta'), ('maraco'), ('conchetumadre'), ('ctm'), ('weón culiao')
on conflict (word) do nothing;
