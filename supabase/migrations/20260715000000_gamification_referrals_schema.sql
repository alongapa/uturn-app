-- Unities — Sesión "Perfil novedades jóvenes": gamificación (insignias) y referidos.
-- Reutiliza los contadores server-authoritative de las Sesiones 1–2
-- (profiles.reward_points, streak_on_time_payments, streak_completed_trips y
-- sus best_streak_*): no se duplica esa lógica, solo se lee para desbloquear
-- insignias y para el bono de referidos.

-- ---------------------------------------------------------------------------
-- badge_definitions — catálogo de insignias (lo mantiene el owner). Cada una
-- se desbloquea cuando el best_streak_* correspondiente alcanza `threshold`.
--   category 'buen_pagador' → profiles.best_streak_on_time_payments (paga a
--     tiempo de forma consistente: "buen pagador" y "puntual" son la misma
--     racha vista desde dos ángulos, no se inventa un segundo contador).
--   category 'viajero'      → profiles.best_streak_completed_trips.
-- ---------------------------------------------------------------------------
create table if not exists public.badge_definitions (
  id          text primary key,
  category    text not null check (category in ('buen_pagador', 'viajero')),
  title       text not null,
  description text not null,
  threshold   integer not null check (threshold > 0),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

insert into public.badge_definitions (id, category, title, description, threshold, sort_order) values
  ('pagador-confiable',  'buen_pagador', 'Pagador confiable',        'Racha de 3 pagos a tiempo seguidos.',        3,  1),
  ('puntualidad-oro',    'buen_pagador', 'Puntualidad de oro',       'Racha de 10 pagos a tiempo seguidos.',       10, 2),
  ('leyenda-puntual',    'buen_pagador', 'Leyenda de la puntualidad','Racha de 25 pagos a tiempo seguidos.',       25, 3),
  ('racha-viajera',      'viajero',      'Racha viajera',            'Racha de 5 viajes completados seguidos.',    5,  4),
  ('ruta-frecuente',     'viajero',      'Ruta frecuente',           'Racha de 15 viajes completados seguidos.',   15, 5),
  ('piloto-unities',     'viajero',      'Piloto Unities',           'Racha de 30 viajes completados seguidos.',   30, 6)
on conflict (id) do update set
  category = excluded.category, title = excluded.title, description = excluded.description,
  threshold = excluded.threshold, sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- user_badges — desbloqueos persistidos (no se revocan: son un logro). Los
-- otorga únicamente el trigger sync_user_badges (Sesión de funciones), nunca
-- el cliente.
-- ---------------------------------------------------------------------------
create table if not exists public.user_badges (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  badge_id    text not null references public.badge_definitions (id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

create index if not exists user_badges_user_idx on public.user_badges (user_id);

-- ---------------------------------------------------------------------------
-- Código de referido por usuario. Se asigna una sola vez al crear el profile
-- (handle_new_user, ver migración de funciones); es inmutable desde el
-- cliente (protect_profile_columns lo protege).
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists referral_code text unique;

-- ---------------------------------------------------------------------------
-- referrals — un invitado (referred_user_id) solo puede aparecer una vez
-- (unique = "1 por invitado", antiabuso #1). status pasa a 'completado' y se
-- otorgan créditos SOLO cuando el invitado confirma su primer viaje pagado
-- (ver award_referral_on_first_payment); nunca antes.
-- ---------------------------------------------------------------------------
create table if not exists public.referrals (
  id               uuid primary key default gen_random_uuid(),
  referrer_id      uuid not null references public.profiles (id) on delete cascade,
  referred_user_id uuid not null unique references public.profiles (id) on delete cascade,
  code_used        text not null,
  status           text not null default 'pendiente' check (status in ('pendiente', 'completado')),
  created_at       timestamptz not null default now(),
  credited_at      timestamptz,
  check (referrer_id <> referred_user_id)
);

create index if not exists referrals_referrer_idx on public.referrals (referrer_id);
