-- Unities — Sesión Analítica de tendencias: triggers, RLS, RPCs y pg_cron.
-- La garantía de privacidad es la política del servidor, no el cliente:
-- 1) university_id/campus_id de cada evento los fija un trigger desde el
--    perfil del actor (el cliente no puede falsear su cohorte).
-- 2) Nadie lee analytics_events crudo salvo el owner; el resto del acceso
--    pasa por RPCs SECURITY DEFINER que solo devuelven cohortes agregadas
--    con distinct_actors >= k (nunca actor_id, nunca una lista de personas).
-- 3) El opt-out (profiles.analytics_opt_out) se aplica en la propia política
--    de INSERT: un usuario que se excluyó no puede generar eventos nuevos
--    aunque el cliente falle en respetarlo localmente.

-- ===========================================================================
-- Trigger: origen del evento fijado server-side (defensa en profundidad,
-- mismo patrón que protect_profile_columns / protect_notification_columns).
-- ===========================================================================

create or replace function public.set_analytics_event_origin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  -- Contexto de cliente: el actor y la fecha siempre son los reales (nunca lo
  -- que el payload diga) — evita tanto suplantar a otro actor como "adelantar"
  -- o "atrasar" un evento para escapar de la retención o mover su semana de
  -- cohorte. Contexto de servidor (seed/backfill/tests): se respeta tal cual.
  if current_user in ('authenticated', 'anon') then
    new.actor_id   := auth.uid();
    new.created_at := now();
  end if;

  select * into v_profile from public.profiles where id = new.actor_id;
  new.university_id := v_profile.university_id;
  new.campus_id      := v_profile.home_campus_id;
  return new;
end;
$$;

drop trigger if exists analytics_events_set_origin on public.analytics_events;
create trigger analytics_events_set_origin before insert on public.analytics_events
  for each row execute function public.set_analytics_event_origin();

revoke execute on function public.set_analytics_event_origin() from public, anon, authenticated;

-- ===========================================================================
-- Helper de autorización: analista de una universidad (patrón is_publisher_member).
-- ===========================================================================

create or replace function public.is_university_analyst(p_university_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.university_analysts
    where university_id = p_university_id and user_id = auth.uid()
  );
$$;

revoke execute on function public.is_university_analyst(text) from public, anon;
grant execute on function public.is_university_analyst(text) to authenticated;

-- ===========================================================================
-- update_analytics_config — owner únicamente. Actualiza solo los campos
-- pasados (patrón update_platform_config, Sesión 8).
-- ===========================================================================

create or replace function public.update_analytics_config(
  p_k_anonymity    integer default null,
  p_retention_days integer default null
)
returns public.analytics_config
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.analytics_config;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = 'insufficient_privilege';
  end if;
  if not public.is_owner() then
    raise exception 'Solo el owner configura la analítica' using errcode = 'insufficient_privilege';
  end if;
  if p_k_anonymity is not null and p_k_anonymity < 5 then
    raise exception 'El umbral mínimo de k-anonimato es 5' using errcode = 'check_violation';
  end if;
  if p_retention_days is not null and p_retention_days < 7 then
    raise exception 'La retención mínima es de 7 días' using errcode = 'check_violation';
  end if;

  update public.analytics_config
     set k_anonymity    = coalesce(p_k_anonymity, k_anonymity),
         retention_days = coalesce(p_retention_days, retention_days),
         updated_by      = v_uid,
         updated_at      = now()
   where id = 'default'
   returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.update_analytics_config(integer, integer) from public, anon;
grant execute on function public.update_analytics_config(integer, integer) to authenticated;

-- ===========================================================================
-- university_trends — bandeja del owner (y de university_analysts para su
-- propia universidad). Lee la vista semanal, nunca la tabla cruda; suprime
-- cualquier cohorte con menos de k cuentas distintas.
-- ===========================================================================

create or replace function public.university_trends(
  p_university_id text,
  p_from date default (current_date - 84),
  p_to   date default current_date
)
returns table (
  week_start       date,
  campus_id        text,
  entity_type      text,
  event_type       text,
  category         text,
  publisher_id     uuid,
  events           bigint,
  distinct_actors  bigint,
  growth_wow_pct   numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_k   integer;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = 'insufficient_privilege';
  end if;
  if not (public.is_owner() or public.is_university_analyst(p_university_id)) then
    raise exception 'No tienes acceso a las tendencias de esta universidad'
      using errcode = 'insufficient_privilege';
  end if;

  select k_anonymity into v_k from public.analytics_config where id = 'default';
  v_k := coalesce(v_k, 20);

  return query
    select t.week_start, t.campus_id, t.entity_type, t.event_type, t.category,
           t.publisher_id, t.events, t.distinct_actors, t.growth_wow_pct
    from public.analytics_trends_weekly t
    where t.university_id = p_university_id
      and t.week_start between p_from and p_to
      and t.distinct_actors >= v_k
    order by t.week_start desc, t.events desc;
end;
$$;

revoke execute on function public.university_trends(text, date, date) from public, anon;
grant execute on function public.university_trends(text, date, date) to authenticated;

-- ===========================================================================
-- publisher_engagement — vista de engagement por federación para su admin
-- (o el owner): solo los publishers que administra (can_manage_publisher,
-- Sesión 5), misma supresión k-anónima.
-- ===========================================================================

create or replace function public.publisher_engagement(
  p_publisher_id uuid,
  p_from date default (current_date - 84),
  p_to   date default current_date
)
returns table (
  week_start       date,
  university_id    text,
  campus_id        text,
  entity_type      text,
  event_type       text,
  category         text,
  events           bigint,
  distinct_actors  bigint,
  growth_wow_pct   numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_k   integer;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = 'insufficient_privilege';
  end if;
  if not public.can_manage_publisher(p_publisher_id) then
    raise exception 'No administras este publisher' using errcode = 'insufficient_privilege';
  end if;

  select k_anonymity into v_k from public.analytics_config where id = 'default';
  v_k := coalesce(v_k, 20);

  return query
    select t.week_start, t.university_id, t.campus_id, t.entity_type, t.event_type,
           t.category, t.events, t.distinct_actors, t.growth_wow_pct
    from public.analytics_trends_weekly t
    where t.publisher_id = p_publisher_id
      and t.week_start between p_from and p_to
      and t.distinct_actors >= v_k
    order by t.week_start desc, t.events desc;
end;
$$;

revoke execute on function public.publisher_engagement(uuid, date, date) from public, anon;
grant execute on function public.publisher_engagement(uuid, date, date) to authenticated;

-- ===========================================================================
-- Agregación nightly (pg_cron): refresca ambas materialized views. CONCURRENTLY
-- evita bloquear las RPC mientras corre; si falla (p. ej. primer refresco en
-- un entorno sin ANALYZE previo) cae a un refresco simple.
-- ===========================================================================

create or replace function public.refresh_analytics_trends()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  refresh materialized view concurrently public.analytics_trends_daily;
  refresh materialized view concurrently public.analytics_trends_weekly;
exception when others then
  refresh materialized view public.analytics_trends_daily;
  refresh materialized view public.analytics_trends_weekly;
end;
$$;

revoke execute on function public.refresh_analytics_trends() from public, anon, authenticated;

-- ===========================================================================
-- Retención: purga eventos crudos más viejos que analytics_config.retention_days.
-- Corre DESPUÉS del refresco nightly para que los agregados ya capturaron esos
-- días antes de borrarlos (política documentada en docs/backend.md).
-- ===========================================================================

create or replace function public.purge_old_analytics_events()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days    integer;
  v_deleted integer;
begin
  select retention_days into v_days from public.analytics_config where id = 'default';
  v_days := coalesce(v_days, 90);

  delete from public.analytics_events
  where created_at < now() - (v_days || ' days')::interval;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function public.purge_old_analytics_events() from public, anon, authenticated;

-- ===========================================================================
-- Row Level Security
-- ===========================================================================

alter table public.analytics_events      enable row level security;
alter table public.analytics_config      enable row level security;
alter table public.university_analysts   enable row level security;

-- --- analytics_events: insertar solo el propio actor autenticado, y solo si
-- --- no optó por salir (verificado server-side, no confía en el cliente).
-- --- Sin política de UPDATE/DELETE: log inmutable; el derecho al borrado
-- --- llega por cascade al eliminar el profile. Sin SELECT para clientes
-- --- salvo el owner (auditoría de crudos); el resto pasa por los RPC.
drop policy if exists analytics_events_insert_own on public.analytics_events;
create policy analytics_events_insert_own on public.analytics_events
  for insert to authenticated
  with check (
    actor_id = (select auth.uid())
    and not exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and analytics_opt_out
    )
  );

drop policy if exists analytics_events_select_owner on public.analytics_events;
create policy analytics_events_select_owner on public.analytics_events
  for select to authenticated using (public.is_owner());

-- --- analytics_config: el owner lee y edita (edita solo vía RPC, ver arriba).
drop policy if exists analytics_config_select_owner on public.analytics_config;
create policy analytics_config_select_owner on public.analytics_config
  for select to authenticated using (public.is_owner());

-- --- university_analysts: cada quien ve su propia membresía; el owner ve y
-- --- administra todo (asigna/quita analistas).
drop policy if exists university_analysts_select on public.university_analysts;
create policy university_analysts_select on public.university_analysts
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_owner());

drop policy if exists university_analysts_insert_owner on public.university_analysts;
create policy university_analysts_insert_owner on public.university_analysts
  for insert to authenticated with check (public.is_owner());

drop policy if exists university_analysts_delete_owner on public.university_analysts;
create policy university_analysts_delete_owner on public.university_analysts
  for delete to authenticated using (public.is_owner());

-- ===========================================================================
-- pg_cron: refresco nightly de las vistas + purga por retención justo después.
-- ===========================================================================

do $$
declare
  v_job text;
begin
  foreach v_job in array array['analytics-refresh-trends', 'analytics-purge-old-events']
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
    'analytics-refresh-trends',
    '10 3 * * *',
    $cron$ select public.refresh_analytics_trends(); $cron$
  );
  perform cron.schedule(
    'analytics-purge-old-events',
    '40 3 * * *',
    $cron$ select public.purge_old_analytics_events(); $cron$
  );
exception when others then
  raise notice 'pg_cron no disponible; programa refresh_analytics_trends()/purge_old_analytics_events() por Edge Function/scheduler externo.';
end;
$$;
