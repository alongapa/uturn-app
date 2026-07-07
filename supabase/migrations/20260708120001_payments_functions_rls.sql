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
