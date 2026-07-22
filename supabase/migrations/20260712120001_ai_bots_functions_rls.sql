-- Unities — Sesión Bots de IA: RPCs de configuración, disparo de la
-- respuesta automática y RLS.
-- La regla de administración es la misma que ya rige el resto de la app:
-- can_manage_publisher() (Sesión 5) para el bot de un publisher, y "ser el
-- tutor asignado al tema" (topic_assignees, Sesión 6) para el bot de una
-- asignatura. Ninguna de las dos pasa por el cliente: las RPC las verifican
-- en el servidor.

-- ===========================================================================
-- set_publisher_bot — crea/actualiza el bot de un publisher. Solo quien lo
-- administra (owner, o admin miembro del publisher).
-- ===========================================================================

create or replace function public.set_publisher_bot(
  p_publisher_id  uuid,
  p_persona_name  text,
  p_system_prompt text default '',
  p_enabled       boolean default true
)
returns public.ai_bots
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_bot        public.ai_bots;
  v_profile_id uuid;
  v_university text;
  v_avatar     text;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = 'insufficient_privilege';
  end if;
  if not public.can_manage_publisher(p_publisher_id) then
    raise exception 'No administras este publisher' using errcode = 'insufficient_privilege';
  end if;
  if char_length(btrim(coalesce(p_persona_name, ''))) = 0 then
    raise exception 'El bot necesita un nombre' using errcode = 'check_violation';
  end if;

  select * into v_bot from public.ai_bots where publisher_id = p_publisher_id;
  if found then
    update public.ai_bots
       set persona_name  = btrim(p_persona_name),
           system_prompt = coalesce(p_system_prompt, ''),
           enabled       = p_enabled,
           updated_at    = now()
     where id = v_bot.id
     returning * into v_bot;
    return v_bot;
  end if;

  select university_id, avatar_url into v_university, v_avatar
  from public.publishers where id = p_publisher_id;

  v_profile_id := public._create_bot_profile(btrim(p_persona_name), v_university);
  -- El bot "hereda" la foto del publisher: en el chat se ve como la propia
  -- federación/centro de alumnos hablando, no como una cuenta aparte.
  if v_avatar is not null then
    update public.profiles set avatar_url = v_avatar where id = v_profile_id;
  end if;

  insert into public.ai_bots (profile_id, owner_kind, publisher_id, persona_name, system_prompt, enabled, created_by)
  values (v_profile_id, 'publisher', p_publisher_id, btrim(p_persona_name), coalesce(p_system_prompt, ''), p_enabled, v_uid)
  returning * into v_bot;

  return v_bot;
end;
$$;

revoke execute on function public.set_publisher_bot(uuid, text, text, boolean) from public, anon;
grant execute on function public.set_publisher_bot(uuid, text, text, boolean) to authenticated;

-- ===========================================================================
-- set_tutor_topic_bot — crea/actualiza el bot de un tutor para una
-- asignatura. Solo el propio tutor asignado a ese tema (topic_assignees).
-- ===========================================================================

create or replace function public.set_tutor_topic_bot(
  p_topic_id      text,
  p_persona_name  text,
  p_system_prompt text default '',
  p_enabled       boolean default true
)
returns public.ai_bots
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_bot        public.ai_bots;
  v_profile_id uuid;
  v_university text;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = 'insufficient_privilege';
  end if;
  if not exists (
    select 1 from public.topic_assignees where topic_id = p_topic_id and user_id = v_uid
  ) then
    raise exception 'Solo el tutor asignado a este tema puede configurar su bot'
      using errcode = 'insufficient_privilege';
  end if;
  if char_length(btrim(coalesce(p_persona_name, ''))) = 0 then
    raise exception 'El bot necesita un nombre' using errcode = 'check_violation';
  end if;

  select * into v_bot from public.ai_bots where tutor_id = v_uid and topic_id = p_topic_id;
  if found then
    update public.ai_bots
       set persona_name  = btrim(p_persona_name),
           system_prompt = coalesce(p_system_prompt, ''),
           enabled       = p_enabled,
           updated_at    = now()
     where id = v_bot.id
     returning * into v_bot;
    return v_bot;
  end if;

  select university_id into v_university from public.profiles where id = v_uid;
  v_profile_id := public._create_bot_profile(btrim(p_persona_name), v_university);

  insert into public.ai_bots (profile_id, owner_kind, tutor_id, topic_id, persona_name, system_prompt, enabled, created_by)
  values (v_profile_id, 'tutor_topic', v_uid, p_topic_id, btrim(p_persona_name), coalesce(p_system_prompt, ''), p_enabled, v_uid)
  returning * into v_bot;

  return v_bot;
end;
$$;

revoke execute on function public.set_tutor_topic_bot(text, text, text, boolean) from public, anon;
grant execute on function public.set_tutor_topic_bot(text, text, text, boolean) to authenticated;

drop trigger if exists ai_bots_set_updated_at on public.ai_bots;
create trigger ai_bots_set_updated_at before update on public.ai_bots
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- Disparo de la respuesta automática: cada mensaje nuevo en una conversación
-- donde el otro miembro es un bot habilitado, y que NO lo escribió el propio
-- bot (evita loops), invoca la Edge Function ai-bot-reply vía pg_net. Mismo
-- patrón que invoke_send_push (Sesión 7).
-- ===========================================================================

create extension if not exists pg_net;

create or replace function public.notify_ai_bot_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bot record;
begin
  select b.id, b.profile_id into v_bot
  from public.ai_bots b
  join public.conversation_members cm on cm.user_id = b.profile_id
  where cm.conversation_id = new.conversation_id and b.enabled
  limit 1;

  if v_bot.id is null or new.sender_id = v_bot.profile_id then
    return null;
  end if;

  perform net.http_post(
    url     := 'https://jkqzuddxahoamoygdrrb.supabase.co/functions/v1/ai-bot-reply',
    body    := jsonb_build_object('conversationId', new.conversation_id, 'botId', v_bot.id),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 20000
  );
  return null;
exception when others then
  raise notice 'pg_net no disponible (%): invoca ai-bot-reply desde un scheduler externo.', sqlerrm;
  return null;
end;
$$;

revoke execute on function public.notify_ai_bot_on_message() from public, anon, authenticated;

drop trigger if exists messages_notify_ai_bot on public.messages;
create trigger messages_notify_ai_bot after insert on public.messages
  for each row execute function public.notify_ai_bot_on_message();

-- ===========================================================================
-- Row Level Security — ai_bots
-- ===========================================================================

alter table public.ai_bots enable row level security;

-- Catálogo visible para todo autenticado (así el cliente puede mostrar "Bot
-- de <asignatura>" o "Bot de <federación>" y ofrecer el botón de chat).
-- Sin políticas de insert/update/delete: toda escritura pasa por
-- set_publisher_bot / set_tutor_topic_bot (SECURITY DEFINER).
drop policy if exists ai_bots_select on public.ai_bots;
create policy ai_bots_select on public.ai_bots
  for select to authenticated using (true);
