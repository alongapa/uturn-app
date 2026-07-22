-- Unities — Sesión Analítica de tendencias: esquema.
-- Modelo DECIDIDO: agregado y anonimizado. Nunca se vende ni expone
-- comportamiento de un alumno identificado; toda métrica vendible respeta
-- k-anonimato (mínimo de cuentas distintas por cohorte antes de mostrar una
-- cifra). actor_id existe SOLO para dos usos internos: COUNT(DISTINCT) al
-- agregar y el derecho al borrado (on delete cascade desde profiles); nunca
-- sale en un reporte ni en un export — los RPC expuestos (más abajo) jamás
-- seleccionan esa columna.
-- Convención de las Sesiones 3+: snake_case, uuid, timestamptz.

-- ---------------------------------------------------------------------------
-- profiles — switch de opt-out (respetado en el servidor: ver RLS de
-- analytics_events más abajo, mismo criterio "verificado server-side" que
-- notification_prefs de la Sesión 7).
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists analytics_opt_out boolean not null default false;

-- ---------------------------------------------------------------------------
-- analytics_events — log crudo de interacciones. university_id/campus_id se
-- fijan server-side desde el perfil del actor (trigger set_analytics_event_origin,
-- ver …_functions_rls.sql), nunca desde lo que envía el cliente: así la
-- cohorte de una métrica nunca puede falsearse. entity_id es texto porque
-- referencia distintos catálogos (uuid de post/story/redeemable, o el nombre
-- de ruta de un tab); sin FK a propósito, es un log de eventos, no una
-- relación de dominio.
-- ---------------------------------------------------------------------------
create table if not exists public.analytics_events (
  id            uuid primary key default gen_random_uuid(),
  actor_id      uuid not null references public.profiles (id) on delete cascade,
  university_id text,
  campus_id     text,
  event_type    text not null check (event_type in ('view', 'click', 'open')),
  entity_type   text not null check (entity_type in ('post', 'story', 'widget', 'redeemable', 'tab')),
  entity_id     text,
  publisher_id  uuid references public.publishers (id) on delete set null,
  category      text,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

-- FKs indexadas (schema-foreign-key-indexes): actor_id y publisher_id.
create index if not exists analytics_events_actor_idx
  on public.analytics_events (actor_id);
create index if not exists analytics_events_publisher_idx
  on public.analytics_events (publisher_id) where publisher_id is not null;
-- Cohorte principal de agregación (universidad × campus × categoría × tipo).
create index if not exists analytics_events_cohort_idx
  on public.analytics_events (university_id, campus_id, entity_type, event_type, created_at);
-- Ventana temporal: la agregación nightly y la purga por retención barren por fecha.
create index if not exists analytics_events_created_idx
  on public.analytics_events (created_at);

-- ---------------------------------------------------------------------------
-- analytics_config — fila única 'default' (mismo patrón que platform_config,
-- Sesión 8): umbral de k-anonimato y días de retención de crudos, editables
-- solo por el owner vía update_analytics_config (RPC).
-- ---------------------------------------------------------------------------
create table if not exists public.analytics_config (
  id              text primary key default 'default' check (id = 'default'),
  k_anonymity     integer not null default 20 check (k_anonymity >= 5),
  retention_days  integer not null default 90 check (retention_days >= 7),
  updated_by      uuid references public.profiles (id) on delete set null,
  updated_at      timestamptz not null default now()
);

insert into public.analytics_config (id, k_anonymity, retention_days)
values ('default', 20, 90)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- university_analysts — rol de solo-lectura por universidad, sin tocar
-- profiles.account_role (los roles reales siguen siendo user/tutor/admin/owner).
-- Mismo patrón que publisher_members (Sesión 5): membresía = autorización.
-- El owner asigna/quita analistas; university_trends() la consulta.
-- ---------------------------------------------------------------------------
create table if not exists public.university_analysts (
  university_id text not null,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (university_id, user_id)
);

create index if not exists university_analysts_user_idx
  on public.university_analysts (user_id);

-- ---------------------------------------------------------------------------
-- Materialized views — agregación nightly (pg_cron, ver …_functions_rls.sql).
-- Nunca se exponen directas a clientes (revoke all más abajo): la única
-- lectura autorizada pasa por university_trends()/publisher_engagement()
-- (SECURITY DEFINER), que además suprimen cohortes bajo el umbral de
-- k-anonimato. distinct_actors nunca se expone como lista, solo como conteo.
-- ---------------------------------------------------------------------------
create materialized view if not exists public.analytics_trends_daily as
select
  date_trunc('day', created_at)::date as day,
  university_id,
  campus_id,
  entity_type,
  event_type,
  category,
  publisher_id,
  count(*)                    as events,
  count(distinct actor_id)    as distinct_actors
from public.analytics_events
group by 1, 2, 3, 4, 5, 6, 7;

-- Único por combinación de cohorte: requerido para REFRESH ... CONCURRENTLY.
-- El GROUP BY de arriba ya garantiza una sola fila por combinación (incluso
-- con columnas NULL: GROUP BY agrupa NULLs entre sí), así que nunca choca.
create unique index if not exists analytics_trends_daily_uq
  on public.analytics_trends_daily (day, university_id, campus_id, entity_type, event_type, category, publisher_id);

create materialized view if not exists public.analytics_trends_weekly as
with weekly as (
  select
    date_trunc('week', created_at)::date as week_start,
    university_id,
    campus_id,
    entity_type,
    event_type,
    category,
    publisher_id,
    count(*)                 as events,
    count(distinct actor_id) as distinct_actors
  from public.analytics_events
  group by 1, 2, 3, 4, 5, 6, 7
),
with_lag as (
  select
    weekly.*,
    lag(events) over (
      partition by university_id, campus_id, entity_type, event_type, category, publisher_id
      order by week_start
    ) as prev_week_events
  from weekly
)
select
  week_start,
  university_id,
  campus_id,
  entity_type,
  event_type,
  category,
  publisher_id,
  events,
  distinct_actors,
  case when prev_week_events > 0
    then round((events - prev_week_events)::numeric / prev_week_events * 100, 1)
    else null
  end as growth_wow_pct
from with_lag;

create unique index if not exists analytics_trends_weekly_uq
  on public.analytics_trends_weekly (week_start, university_id, campus_id, entity_type, event_type, category, publisher_id);

-- Ninguna de las dos vistas es legible por clientes; solo por las funciones
-- SECURITY DEFINER (que corren como el dueño de la función, no como el
-- llamador) y por el refresco de pg_cron.
revoke all on public.analytics_trends_daily  from public, anon, authenticated;
revoke all on public.analytics_trends_weekly from public, anon, authenticated;
