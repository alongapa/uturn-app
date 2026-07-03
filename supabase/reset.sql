-- =====================================================================
-- Uturn — RESET del esquema (⚠️ DESTRUCTIVO).
-- Borra SOLO los objetos que crea Uturn (tablas, funciones y triggers de
-- este repo) para poder re-aplicar apply_all.sql desde cero.
--
-- Úsalo si `apply_all.sql` falló porque en `public` ya existía una tabla
-- previa (p. ej. `trips` de una plantilla) con otra estructura, y ESAS
-- tablas NO tienen datos que quieras conservar (proyecto nuevo).
--
-- Flujo: 1) ejecuta este archivo   2) ejecuta apply_all.sql   3) verify.sql
-- No toca auth.users ni los buckets de Storage (esos son idempotentes).
-- =====================================================================

-- Triggers propios sobre auth.users (la tabla auth.users NO se borra).
drop trigger if exists enforce_university_email on auth.users;
drop trigger if exists on_auth_user_created on auth.users;

-- Job de pg_cron, si existe.
do $$
begin
  perform cron.unschedule('expire-overdue-payments')
  where exists (select 1 from cron.job where jobname = 'expire-overdue-payments');
exception when others then null;
end;
$$;

-- Tablas de Uturn (CASCADE arrastra sus políticas RLS, índices y triggers).
drop table if exists public.redemptions          cascade;
drop table if exists public.redeemables          cascade;
drop table if exists public.credit_transactions  cascade;
drop table if exists public.strikes              cascade;
drop table if exists public.penalties            cascade;
drop table if exists public.ratings              cascade;
drop table if exists public.payments             cascade;
drop table if exists public.bookings             cascade;
drop table if exists public.trips                cascade;
drop table if exists public.vehicles             cascade;
drop table if exists public.profiles             cascade;

-- Funciones de servidor.
drop function if exists public.reserve_seat(uuid, integer)      cascade;
drop function if exists public.cancel_booking(uuid)             cascade;
drop function if exists public.mark_payment_sent(uuid)          cascade;
drop function if exists public.confirm_payment_received(uuid)   cascade;
drop function if exists public.complete_booking(uuid)           cascade;
drop function if exists public.expire_overdue_payments()        cascade;
drop function if exists public.redeem_item(text)                cascade;
drop function if exists public.gen_redemption_code()            cascade;
drop function if exists public.credit_balance(uuid)             cascade;
drop function if exists public.is_admin()                       cascade;
drop function if exists public.is_university_email(text)        cascade;
drop function if exists public.set_updated_at()                 cascade;
drop function if exists public.enforce_university_email()       cascade;
drop function if exists public.handle_new_user()                cascade;
drop function if exists public.recompute_rating_avg()           cascade;
drop function if exists public.protect_profile_columns()        cascade;
