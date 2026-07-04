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
