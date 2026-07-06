-- Unities — Sesión 6: funciones, triggers y RLS de mensajería y Q&A.
-- Regla clave: la privacidad del chat ES la política RLS (solo miembros leen
-- y escriben su conversación), no el cliente. Crear conversaciones y mover
-- punteros de lectura pasa por RPCs security definer que garantizan las
-- invariantes (DM único por par, membresías atómicas), igual que reserve_seat
-- en la Sesión 3.

-- ===========================================================================
-- Helpers de autorización (security definer para no recursar la RLS de
-- conversation_members; mismo patrón que is_admin / can_publish)
-- ===========================================================================

create or replace function public.is_conversation_member(p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = p_conversation and user_id = auth.uid()
  );
$$;

grant execute on function public.is_conversation_member(uuid) to authenticated, anon;

-- Acceso a una conversación: sus miembros; los tickets de soporte además los
-- ven los agentes (admin/owner), que atienden "Soporte Unities".
create or replace function public.can_access_conversation(p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_conversation_member(p_conversation)
      or (
        public.is_admin()
        and exists (
          select 1 from public.conversations
          where id = p_conversation and kind = 'soporte'
        )
      );
$$;

grant execute on function public.can_access_conversation(uuid) to authenticated, anon;

-- Storage del chat: primer segmento de la ruta = conversation_id. Cast seguro
-- para que la política de chat-media nunca reviente evaluando objetos con
-- rutas de otro formato.
create or replace function public.conversation_from_path(p_name text)
returns uuid
language plpgsql
immutable
as $$
begin
  return ((string_to_array(p_name, '/'))[1])::uuid;
exception when others then
  return null;
end;
$$;

grant execute on function public.conversation_from_path(text) to authenticated, anon;

-- ¿Puede auth.uid() responder OFICIALMENTE esta pregunta? Solo los asignados
-- al tema: como tutor (topic_assignees.user_id) o a nombre de un publisher
-- asignado del que es miembro (publisher_members, Sesión 5).
create or replace function public.can_answer_question(p_question uuid, p_publisher uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_publisher is null then exists (
      select 1
      from public.questions q
      join public.topic_assignees ta on ta.topic_id = q.topic_id
      where q.id = p_question and ta.user_id = auth.uid()
    )
    else public.is_publisher_member(p_publisher) and exists (
      select 1
      from public.questions q
      join public.topic_assignees ta on ta.topic_id = q.topic_id
      where q.id = p_question and ta.publisher_id = p_publisher
    )
  end;
$$;

grant execute on function public.can_answer_question(uuid, uuid) to authenticated, anon;

-- ===========================================================================
-- RPCs de conversaciones (única vía de creación; el cliente no inserta
-- conversations ni conversation_members directo)
-- ===========================================================================

-- DM 1-a-1: devuelve la conversación existente del par o la crea con ambas
-- membresías. dm_key = '<uuid menor>:<uuid mayor>' evita duplicados (con
-- on conflict para la carrera de dos aperturas simultáneas).
create or replace function public.start_dm(p_other_user uuid)
returns public.conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_key  text;
  v_conv public.conversations;
begin
  if v_uid is null then
    raise exception 'Necesitas iniciar sesión';
  end if;
  if p_other_user is null or p_other_user = v_uid then
    raise exception 'Elige a otra persona para chatear';
  end if;
  if not exists (select 1 from public.profiles where id = p_other_user) then
    raise exception 'El usuario no existe';
  end if;

  v_key := least(v_uid, p_other_user)::text || ':' || greatest(v_uid, p_other_user)::text;

  select * into v_conv from public.conversations where dm_key = v_key;
  if found then
    return v_conv;
  end if;

  insert into public.conversations (kind, dm_key, created_by)
  values ('dm', v_key, v_uid)
  on conflict (dm_key) do nothing
  returning * into v_conv;

  if v_conv.id is null then
    -- Carrera: otro request la creó entre el select y el insert.
    select * into v_conv from public.conversations where dm_key = v_key;
  end if;

  insert into public.conversation_members (conversation_id, user_id)
  values (v_conv.id, v_uid), (v_conv.id, p_other_user)
  on conflict do nothing;

  return v_conv;
end;
$$;

revoke execute on function public.start_dm(uuid) from public, anon;
grant execute on function public.start_dm(uuid) to authenticated;

-- Ticket de "Soporte Unities": reutiliza el ticket abierto del usuario en esa
-- categoría (evita duplicados accidentales) o crea uno nuevo.
create or replace function public.start_support(p_category text)
returns public.conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_conv public.conversations;
begin
  if v_uid is null then
    raise exception 'Necesitas iniciar sesión';
  end if;
  if p_category not in ('pagos', 'baneos', 'verificacion', 'otro') then
    raise exception 'Categoría de soporte inválida';
  end if;

  select c.* into v_conv
  from public.conversations c
  join public.conversation_members m on m.conversation_id = c.id
  where c.kind = 'soporte'
    and c.support_category = p_category
    and c.support_status = 'abierto'
    and c.created_by = v_uid
    and m.user_id = v_uid
  order by c.created_at desc
  limit 1;
  if found then
    return v_conv;
  end if;

  insert into public.conversations (kind, support_category, support_status, created_by)
  values ('soporte', p_category, 'abierto', v_uid)
  returning * into v_conv;

  insert into public.conversation_members (conversation_id, user_id)
  values (v_conv.id, v_uid);

  return v_conv;
end;
$$;

revoke execute on function public.start_support(text) from public, anon;
grant execute on function public.start_support(text) to authenticated;

-- Cambiar estado abierto/resuelto de un ticket: agentes (admin/owner) o el
-- propio miembro (puede marcar resuelto su ticket o reabrirlo).
create or replace function public.set_support_status(p_conversation uuid, p_status text)
returns public.conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv public.conversations;
begin
  if auth.uid() is null then
    raise exception 'Necesitas iniciar sesión';
  end if;
  if p_status not in ('abierto', 'resuelto') then
    raise exception 'Estado inválido';
  end if;

  select * into v_conv from public.conversations where id = p_conversation;
  if not found or v_conv.kind <> 'soporte' then
    raise exception 'La conversación no es de soporte';
  end if;
  if not public.can_access_conversation(p_conversation) then
    raise exception 'Sin acceso a esta conversación';
  end if;

  update public.conversations
  set support_status = p_status, updated_at = now()
  where id = p_conversation
  returning * into v_conv;

  return v_conv;
end;
$$;

revoke execute on function public.set_support_status(uuid, text) from public, anon;
grant execute on function public.set_support_status(uuid, text) to authenticated;

-- Marca la conversación como leída para auth.uid(). Si un agente de soporte
-- (admin) abre un ticket del que aún no es miembro, se une aquí: así gana
-- puntero de lectura y contadores de no-leídos propios.
create or replace function public.mark_conversation_read(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Necesitas iniciar sesión';
  end if;

  update public.conversation_members
  set last_read_at = now()
  where conversation_id = p_conversation and user_id = v_uid;

  if not found then
    if public.is_admin() and exists (
      select 1 from public.conversations where id = p_conversation and kind = 'soporte'
    ) then
      insert into public.conversation_members (conversation_id, user_id)
      values (p_conversation, v_uid)
      on conflict (conversation_id, user_id) do update set last_read_at = now();
    end if;
    -- Si no es miembro ni agente, no hace nada (la RLS ya le impide leer).
  end if;
end;
$$;

revoke execute on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- No-leídos por conversación del usuario actual, en una sola consulta para la
-- bandeja (evita N+1 desde el cliente). SECURITY INVOKER: cuenta solo lo que
-- la RLS de messages le deja ver.
create or replace function public.conversation_unread_counts()
returns table (conversation_id uuid, unread_count bigint)
language sql
stable
set search_path = public
as $$
  select cm.conversation_id, count(m.id)
  from public.conversation_members cm
  left join public.messages m
    on m.conversation_id = cm.conversation_id
   and m.created_at > cm.last_read_at
   and m.sender_id <> cm.user_id
  where cm.user_id = (select auth.uid())
  group by cm.conversation_id;
$$;

revoke execute on function public.conversation_unread_counts() from public, anon;
grant execute on function public.conversation_unread_counts() to authenticated;

-- ===========================================================================
-- Triggers
-- ===========================================================================

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at before update on public.conversations
  for each row execute function public.set_updated_at();

drop trigger if exists questions_set_updated_at on public.questions;
create trigger questions_set_updated_at before update on public.questions
  for each row execute function public.set_updated_at();

drop trigger if exists guides_set_updated_at on public.guides;
create trigger guides_set_updated_at before update on public.guides
  for each row execute function public.set_updated_at();

-- Cada mensaje toca la conversación: actualiza el resumen de la bandeja
-- (last_message_*), reabre tickets resueltos cuando escribe el alumno y deja
-- el mensaje propio como leído para su emisor. SECURITY DEFINER: el emisor no
-- tiene política de UPDATE sobre conversations.
create or replace function public.touch_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_preview text;
begin
  v_preview := nullif(left(btrim(new.body), 120), '');
  if v_preview is null and new.image_path is not null then
    v_preview := '📷 Foto';
  end if;

  update public.conversations
  set last_message_at      = new.created_at,
      last_message_preview = v_preview,
      last_message_sender  = new.sender_id,
      updated_at           = now(),
      -- Un mensaje de un no-agente reabre el ticket resuelto.
      support_status = case
        when kind = 'soporte' and support_status = 'resuelto' and not exists (
          select 1 from public.profiles
          where id = new.sender_id and account_role in ('admin', 'owner')
        ) then 'abierto'
        else support_status
      end
  where id = new.conversation_id;

  update public.conversation_members
  set last_read_at = greatest(last_read_at, new.created_at)
  where conversation_id = new.conversation_id and user_id = new.sender_id;

  return null;  -- after trigger
end;
$$;

revoke execute on function public.touch_conversation_on_message() from public, anon, authenticated;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation after insert on public.messages
  for each row execute function public.touch_conversation_on_message();

-- Contadores y respuesta oficial de questions, mantenidos por el servidor
-- (mismo patrón que bump_post_counters de la Sesión 4).
create or replace function public.bump_question_counters()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_question uuid;
begin
  if tg_op = 'INSERT' then
    update public.questions
    set reply_count = reply_count + 1,
        answered_at = case when new.is_official then coalesce(answered_at, new.created_at) else answered_at end
    where id = new.question_id;
    return null;
  end if;

  v_question := old.question_id;
  update public.questions
  set reply_count = greatest(reply_count - 1, 0)
  where id = v_question;
  -- Si se borró la última respuesta oficial, la pregunta vuelve a "sin responder".
  if old.is_official and not exists (
    select 1 from public.question_replies where question_id = v_question and is_official
  ) then
    update public.questions set answered_at = null where id = v_question;
  end if;
  return null;
end;
$$;

revoke execute on function public.bump_question_counters() from public, anon, authenticated;

drop trigger if exists question_replies_bump_counters on public.question_replies;
create trigger question_replies_bump_counters after insert or delete on public.question_replies
  for each row execute function public.bump_question_counters();

-- El autor puede editar título/cuerpo de su pregunta, pero reply_count y
-- answered_at solo los mueve el servidor (patrón protect_profile_columns).
create or replace function public.protect_question_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;  -- contexto de servidor (triggers definer): confía en el cambio
  end if;
  new.reply_count := old.reply_count;
  new.answered_at := old.answered_at;
  new.author_id   := old.author_id;
  return new;
end;
$$;

revoke execute on function public.protect_question_columns() from public, anon, authenticated;

drop trigger if exists questions_protect_columns on public.questions;
create trigger questions_protect_columns before update on public.questions
  for each row execute function public.protect_question_columns();

-- ===========================================================================
-- Row Level Security
-- ===========================================================================

alter table public.conversations        enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages             enable row level security;
alter table public.topics               enable row level security;
alter table public.topic_assignees      enable row level security;
alter table public.questions            enable row level security;
alter table public.question_replies     enable row level security;
alter table public.guides               enable row level security;

-- --- conversations: solo miembros (o agentes en soporte); sin escritura
-- --- directa de clientes — todo pasa por las RPCs de arriba. -----------------
drop policy if exists conversations_select_member on public.conversations;
create policy conversations_select_member on public.conversations
  for select to authenticated using (public.can_access_conversation(id));

-- --- conversation_members: visibles para quien accede a la conversación
-- --- (lista de participantes y puntero "visto"); sin escritura directa. ------
drop policy if exists conversation_members_select on public.conversation_members;
create policy conversation_members_select on public.conversation_members
  for select to authenticated using (public.can_access_conversation(conversation_id));

-- --- messages: leer y escribir SOLO con acceso a la conversación; el emisor
-- --- siempre es auth.uid(). Sin update/delete: el historial es inmutable. ----
drop policy if exists messages_select_member on public.messages;
create policy messages_select_member on public.messages
  for select to authenticated using (public.can_access_conversation(conversation_id));

drop policy if exists messages_insert_member on public.messages;
create policy messages_insert_member on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.can_access_conversation(conversation_id)
  );

-- --- topics / topic_assignees: catálogo público para autenticados; los
-- --- administra admin/owner (asigna tutores y federaciones a temas). ---------
drop policy if exists topics_select on public.topics;
create policy topics_select on public.topics
  for select to authenticated using (true);

drop policy if exists topics_write_admin on public.topics;
create policy topics_write_admin on public.topics
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists topic_assignees_select on public.topic_assignees;
create policy topic_assignees_select on public.topic_assignees
  for select to authenticated using (true);

drop policy if exists topic_assignees_write_admin on public.topic_assignees;
create policy topic_assignees_write_admin on public.topic_assignees
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- --- questions: públicas para autenticados; cada quien crea/edita/borra las
-- --- suyas (admin modera). protect_question_columns blinda los contadores. ---
drop policy if exists questions_select on public.questions;
create policy questions_select on public.questions
  for select to authenticated using (true);

drop policy if exists questions_insert_own on public.questions;
create policy questions_insert_own on public.questions
  for insert to authenticated with check (author_id = (select auth.uid()));

drop policy if exists questions_update_own on public.questions;
create policy questions_update_own on public.questions
  for update to authenticated
  using (author_id = (select auth.uid()) or public.is_admin())
  with check (author_id = (select auth.uid()) or public.is_admin());

drop policy if exists questions_delete_own on public.questions;
create policy questions_delete_own on public.questions
  for delete to authenticated
  using (author_id = (select auth.uid()) or public.is_admin());

-- --- question_replies: comentar puede cualquiera (a nombre propio); marcar
-- --- is_official o firmar con publisher SOLO los asignados al tema — esta
-- --- política es el criterio de aceptación "un user no responde oficial". ----
drop policy if exists question_replies_select on public.question_replies;
create policy question_replies_select on public.question_replies
  for select to authenticated using (true);

drop policy if exists question_replies_insert on public.question_replies;
create policy question_replies_insert on public.question_replies
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (
      (not is_official and publisher_id is null)
      or (is_official and public.can_answer_question(question_id, publisher_id))
    )
  );

drop policy if exists question_replies_delete_own on public.question_replies;
create policy question_replies_delete_own on public.question_replies
  for delete to authenticated
  using (author_id = (select auth.uid()) or public.is_admin());

-- --- guides: consultables por cualquier autenticado; sube/edita solo tutor+
-- --- (can_publish = tutor/admin/owner, Sesión 4) y siempre a nombre propio. --
drop policy if exists guides_select on public.guides;
create policy guides_select on public.guides
  for select to authenticated using (true);

drop policy if exists guides_insert_tutor on public.guides;
create policy guides_insert_tutor on public.guides
  for insert to authenticated
  with check (public.can_publish() and author_id = (select auth.uid()));

drop policy if exists guides_update_own on public.guides;
create policy guides_update_own on public.guides
  for update to authenticated
  using (public.is_admin() or (public.can_publish() and author_id = (select auth.uid())))
  with check (public.is_admin() or (public.can_publish() and author_id = (select auth.uid())));

drop policy if exists guides_delete_own on public.guides;
create policy guides_delete_own on public.guides
  for delete to authenticated
  using (public.is_admin() or author_id = (select auth.uid()));

-- ===========================================================================
-- Realtime: el chat entra sin recargar. RLS sigue filtrando lo que cada
-- suscriptor recibe (un cliente jamás recibe mensajes de conversaciones
-- ajenas). conversation_members da el "visto" en vivo; questions/replies
-- refrescan el Q&A abierto.
-- ===========================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'conversations', 'conversation_members', 'messages',
    'questions', 'question_replies'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
exception when undefined_object then
  raise notice 'La publicación supabase_realtime no existe; créala desde el dashboard.';
end;
$$;
