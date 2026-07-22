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
