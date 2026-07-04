-- Uturn — Sesión 3: Row Level Security.
-- Sigue el bosquejo de docs/backend.md. Regla clave: payments, strikes y
-- credit_transactions NO tienen políticas de escritura para clientes — solo se
-- modifican vía funciones de servidor (security definer). Reservar/cancelar y
-- confirmar pagos pasan por RPC; el cliente nunca inserta esas filas directo.

alter table public.profiles            enable row level security;
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
-- protección de columnas sensibles y de `account_role` la hace el trigger de
-- abajo, ya que RLS es a nivel de fila.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (auth.role() = 'authenticated');

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());

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

drop trigger if exists profiles_protect_columns on public.profiles;
create trigger profiles_protect_columns before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- ---------------------------------------------------------------------------
-- vehicles — CRUD solo del dueño
-- ---------------------------------------------------------------------------
drop policy if exists vehicles_all_own on public.vehicles;
create policy vehicles_all_own on public.vehicles
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- trips — lectura autenticada; insert/update/delete del conductor (o admin)
-- ---------------------------------------------------------------------------
drop policy if exists trips_select on public.trips;
create policy trips_select on public.trips
  for select using (auth.role() = 'authenticated');

drop policy if exists trips_insert_driver on public.trips;
create policy trips_insert_driver on public.trips
  for insert with check (driver_id = auth.uid());

drop policy if exists trips_update_driver on public.trips;
create policy trips_update_driver on public.trips
  for update using (driver_id = auth.uid() or public.is_admin())
  with check (driver_id = auth.uid() or public.is_admin());

drop policy if exists trips_delete_driver on public.trips;
create policy trips_delete_driver on public.trips
  for delete using (driver_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- bookings — el pasajero y el conductor del viaje ven; escritura solo vía RPC
-- ---------------------------------------------------------------------------
drop policy if exists bookings_select on public.bookings;
create policy bookings_select on public.bookings
  for select using (
    passenger_id = auth.uid()
    or exists (select 1 from public.trips t where t.id = trip_id and t.driver_id = auth.uid())
    or public.is_admin()
  );
-- Sin políticas de insert/update/delete: reserve_seat / cancel_booking /
-- complete_booking (security definer) son la única vía de escritura.

-- ---------------------------------------------------------------------------
-- payments — visibles para pasajero y conductor; escritura solo servidor
-- ---------------------------------------------------------------------------
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments
  for select using (
    exists (
      select 1 from public.bookings b
      join public.trips t on t.id = b.trip_id
      where b.id = booking_id
        and (b.passenger_id = auth.uid() or t.driver_id = auth.uid() or public.is_admin())
    )
  );
-- Sin insert/update/delete: solo funciones de servidor.

-- ---------------------------------------------------------------------------
-- ratings — lectura autenticada; cada quien inserta sus propias calificaciones
-- ---------------------------------------------------------------------------
drop policy if exists ratings_select on public.ratings;
create policy ratings_select on public.ratings
  for select using (auth.role() = 'authenticated');

drop policy if exists ratings_insert_own on public.ratings;
create policy ratings_insert_own on public.ratings
  for insert with check (from_id = auth.uid());

-- ---------------------------------------------------------------------------
-- penalties / strikes — lectura del propio usuario; escritura solo servidor
-- ---------------------------------------------------------------------------
drop policy if exists penalties_select_own on public.penalties;
create policy penalties_select_own on public.penalties
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists strikes_select_own on public.strikes;
create policy strikes_select_own on public.strikes
  for select using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- credit_transactions — lectura del propio usuario; escritura solo servidor
-- ---------------------------------------------------------------------------
drop policy if exists credit_tx_select_own on public.credit_transactions;
create policy credit_tx_select_own on public.credit_transactions
  for select using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- redeemables — catálogo público para autenticados; escritura admin (Sesión 4)
-- ---------------------------------------------------------------------------
drop policy if exists redeemables_select on public.redeemables;
create policy redeemables_select on public.redeemables
  for select using (auth.role() = 'authenticated');

drop policy if exists redeemables_write_admin on public.redeemables;
create policy redeemables_write_admin on public.redeemables
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- redemptions — el usuario ve las suyas; crear vía RPC. Marcar usado sí directo.
-- ---------------------------------------------------------------------------
drop policy if exists redemptions_select_own on public.redemptions;
create policy redemptions_select_own on public.redemptions
  for select using (user_id = auth.uid() or public.is_admin());

-- Permite marcar un canje propio como usado (status -> 'canjeado'); la creación
-- pasa por redeem_item (security definer) porque también carga créditos.
drop policy if exists redemptions_update_own on public.redemptions;
create policy redemptions_update_own on public.redemptions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
