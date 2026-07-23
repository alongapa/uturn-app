-- Unities — Sesión "Perfil novedades jóvenes": funciones, triggers y RLS de
-- insignias y referidos. Todo lo que otorga créditos/puntos corre server-side
-- (security definer); el cliente solo lee.

-- ===========================================================================
-- Insignias: se sincronizan solas cuando cambian los best_streak_* de
-- profiles (Sesiones 1–2). No se otorgan créditos por desbloquear una
-- insignia: es un logro visual sobre datos que ya son la fuente de verdad.
-- ===========================================================================

create or replace function public.sync_user_badges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_badges (user_id, badge_id)
  select new.id, bd.id
  from public.badge_definitions bd
  where (bd.category = 'buen_pagador' and bd.threshold <= new.best_streak_on_time_payments)
     or (bd.category = 'viajero'      and bd.threshold <= new.best_streak_completed_trips)
  on conflict (user_id, badge_id) do nothing;
  return null;
end;
$$;

revoke execute on function public.sync_user_badges() from public, anon, authenticated;

drop trigger if exists profiles_sync_badges on public.profiles;
create trigger profiles_sync_badges after update on public.profiles
  for each row
  when (
    new.best_streak_on_time_payments is distinct from old.best_streak_on_time_payments
    or new.best_streak_completed_trips is distinct from old.best_streak_completed_trips
  )
  execute function public.sync_user_badges();

-- Backfill: otorga a los perfiles existentes las insignias que ya calificaban
-- antes de que existiera esta tabla (no depende del trigger, que solo mira
-- cambios futuros).
insert into public.user_badges (user_id, badge_id)
select p.id, bd.id
from public.profiles p
join public.badge_definitions bd
  on (bd.category = 'buen_pagador' and bd.threshold <= p.best_streak_on_time_payments)
  or (bd.category = 'viajero'      and bd.threshold <= p.best_streak_completed_trips)
on conflict (user_id, badge_id) do nothing;

-- ===========================================================================
-- Código de referido: se asigna una sola vez, en el alta del profile.
-- ===========================================================================

create or replace function public.gen_referral_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_code text;
begin
  loop
    v_code := (
      select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (floor(random() * 32) + 1)::int, 1), '')
      from generate_series(1, 6)
    );
    exit when not exists (select 1 from public.profiles where referral_code = v_code);
  end loop;
  return v_code;
end;
$$;

revoke execute on function public.gen_referral_code() from public, anon, authenticated;

-- handle_new_user (Sesión 3): se reemplaza completo para agregar la
-- asignación de referral_code; el resto es idéntico.
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
  insert into public.profiles (id, email, full_name, university_id, home_campus_id, date_of_birth, referral_code)
  values (
    new.id,
    new.email,
    nullif(meta->>'full_name', ''),
    v_university,
    nullif(meta->>'home_campus_id', ''),
    (nullif(meta->>'date_of_birth', ''))::date,
    public.gen_referral_code()
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Perfiles creados antes de esta migración no tienen código: se completan.
update public.profiles set referral_code = public.gen_referral_code() where referral_code is null;

-- ===========================================================================
-- Redimir un código de invitación (lo llama el invitado recién registrado).
-- Antiabuso:
--  - referred_user_id es unique en `referrals`: un invitado solo canjea 1 vez.
--  - no puedes canjear tu propio código (check referrer_id <> referred_user_id
--    + validación explícita abajo).
--  - solo se puede canjear ANTES de tu primer viaje pagado: si ya pagaste
--    algún viaje, ya no calificas como "invitado nuevo" (y de todos modos el
--    bono nunca dispararía, porque award_referral_on_first_payment exige que
--    sea tu primer pago confirmado).
-- ===========================================================================
create or replace function public.redeem_referral_code(p_code text)
returns public.referrals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_referrer uuid;
  v_referral public.referrals;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = 'insufficient_privilege';
  end if;

  select id into v_referrer from public.profiles where referral_code = upper(btrim(p_code));
  if v_referrer is null then
    raise exception 'Código de invitación no válido' using errcode = 'no_data_found';
  end if;
  if v_referrer = v_uid then
    raise exception 'No puedes usar tu propio código' using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.payments p
    join public.bookings b on b.id = p.booking_id
    where b.passenger_id = v_uid and p.status = 'confirmed'
  ) then
    raise exception 'Ya realizaste tu primer viaje pagado; el código debe canjearse antes' using errcode = 'check_violation';
  end if;

  begin
    insert into public.referrals (referrer_id, referred_user_id, code_used, status)
    values (v_referrer, v_uid, upper(btrim(p_code)), 'pendiente')
    returning * into v_referral;
  exception
    when unique_violation then
      raise exception 'Ya usaste un código de invitación' using errcode = 'check_violation';
  end;

  return v_referral;
end;
$$;

revoke execute on function public.redeem_referral_code(text) from public, anon;
grant execute on function public.redeem_referral_code(text) to authenticated;

-- ===========================================================================
-- Bono de referido: se dispara cuando el INVITADO confirma su primer pago
-- (mismo evento que reparte créditos/racha en award_on_payment_confirmed,
-- trigger separado para no tocar esa función crítica). +100 créditos para
-- cada lado, una sola vez por referral (status pendiente → completado).
-- ===========================================================================
create or replace function public.award_referral_on_first_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c_bonus constant integer := 100;
  v_passenger uuid;
  v_prior_confirmed int;
  v_referral public.referrals;
begin
  if not (new.status = 'confirmed' and old.status <> 'confirmed') then
    return null;
  end if;

  select passenger_id into v_passenger from public.bookings where id = new.booking_id;
  if v_passenger is null then
    return null;
  end if;

  select count(*) into v_prior_confirmed
  from public.payments p
  join public.bookings b on b.id = p.booking_id
  where b.passenger_id = v_passenger and p.status = 'confirmed';

  -- Solo el primer viaje pagado del invitado dispara el bono (el conteo ya
  -- incluye esta misma fila, recién puesta en 'confirmed').
  if v_prior_confirmed <> 1 then
    return null;
  end if;

  select * into v_referral from public.referrals
  where referred_user_id = v_passenger and status = 'pendiente'
  for update;
  if not found then
    return null;
  end if;

  update public.referrals set status = 'completado', credited_at = now() where id = v_referral.id;

  insert into public.credit_transactions (user_id, entry_type, source, amount, description, reference_id)
  values
    (v_referral.referred_user_id, 'abono', 'bono', c_bonus, 'Bono de bienvenida: primer viaje pagado', v_referral.id::text),
    (v_referral.referrer_id,      'abono', 'bono', c_bonus, 'Bono por invitar a un amigo',              v_referral.id::text);

  perform public.enqueue_notification(
    v_referral.referrer_id, 'social', 'referido_completado',
    '🎉 Ganaste créditos por invitar',
    'Tu invitado completó su primer viaje pagado. +' || c_bonus || ' créditos para ti.',
    '/credits',
    jsonb_build_object('referralId', v_referral.id)
  );
  perform public.enqueue_notification(
    v_referral.referred_user_id, 'social', 'referido_completado',
    '🎉 Bono de bienvenida',
    'Completaste tu primer viaje pagado. +' || c_bonus || ' créditos por venir invitado.',
    '/credits',
    jsonb_build_object('referralId', v_referral.id)
  );

  return null;
end;
$$;

revoke execute on function public.award_referral_on_first_payment() from public, anon, authenticated;

drop trigger if exists payments_award_referral on public.payments;
create trigger payments_award_referral after update on public.payments
  for each row execute function public.award_referral_on_first_payment();

-- ===========================================================================
-- protect_profile_columns (Sesión 3): se reemplaza completo para blindar
-- también referral_code (inmutable desde el cliente una vez asignado).
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
  new.referral_code                := old.referral_code;
  return new;
end;
$$;

-- ===========================================================================
-- RLS
-- ===========================================================================
alter table public.badge_definitions enable row level security;
alter table public.user_badges       enable row level security;
alter table public.referrals         enable row level security;

drop policy if exists badge_definitions_select on public.badge_definitions;
create policy badge_definitions_select on public.badge_definitions
  for select to authenticated using (true);

drop policy if exists badge_definitions_write_admin on public.badge_definitions;
create policy badge_definitions_write_admin on public.badge_definitions
  for all using (public.is_admin()) with check (public.is_admin());

-- Sin políticas de insert/update/delete: solo el trigger sync_user_badges
-- (security definer, corre como dueño de la tabla) escribe user_badges.
drop policy if exists user_badges_select_own on public.user_badges;
create policy user_badges_select_own on public.user_badges
  for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());

-- Sin políticas de insert/update/delete: solo redeem_referral_code y
-- award_referral_on_first_payment (security definer) escriben referrals.
drop policy if exists referrals_select_own on public.referrals;
create policy referrals_select_own on public.referrals
  for select to authenticated using (
    referrer_id = (select auth.uid()) or referred_user_id = (select auth.uid()) or public.is_admin()
  );
