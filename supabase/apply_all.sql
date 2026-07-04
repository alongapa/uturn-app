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
