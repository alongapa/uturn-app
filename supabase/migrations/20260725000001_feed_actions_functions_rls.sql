-- Unities — Sesión 10: RPCs, triggers y RLS de las acciones sobre
-- publicaciones (eliminar, editar, reportar, silenciar).
--
-- Regla de la casa: cada RPC valida la MISMA condición que su política RLS.
-- La política es la red real (el RPC es security definer y la saltaría); el
-- RPC existe para devolver un mensaje de error decente y para agrupar el
-- efecto en una sola llamada. Si alguien pega SQL crudo con la anon key, la
-- política lo detiene igual.

-- ===========================================================================
-- Helpers de autorización
-- ===========================================================================

-- ¿Puede auth.uid() eliminar este contenido del feed?
--   · su autor, siempre;
--   · el owner, global;
--   · un admin SOLO en los publishers de los que es miembro (patrón de
--     alcance de la Sesión 5: publisher_members).
-- Ojo: es_autor se evalúa contra author_id, que es nullable (on delete set
-- null); un post huérfano solo lo borra owner/admin del publisher.
create or replace function public.can_delete_feed_item(p_author_id uuid, p_publisher_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (p_author_id is not null and p_author_id = auth.uid())
      or public.is_owner()
      or (public.is_admin() and public.is_publisher_member(p_publisher_id));
$$;

grant execute on function public.can_delete_feed_item(uuid, uuid) to authenticated, anon;

-- ===========================================================================
-- Trigger: marca de edición
-- ===========================================================================

-- `edited_at` NO lo escribe edit_post: lo escribe este trigger, para que
-- cualquier vía que cambie el texto quede marcada (RPC, SQL directo desde el
-- dashboard, una futura pantalla admin). Dispara solo cuando cambia `body`:
-- los updates de like_count/repost_count/reply_count (bump_post_counters) y
-- el soft delete no son ediciones y marcarían "editado" en todo el feed.
create or replace function public.mark_post_edited()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.edited_at := now();
  return new;
end;
$$;

revoke execute on function public.mark_post_edited() from public, anon, authenticated;

drop trigger if exists posts_mark_edited on public.posts;
create trigger posts_mark_edited
  before update of body on public.posts
  for each row
  when (old.body is distinct from new.body)
  execute function public.mark_post_edited();

-- El filtro de palabras de la Sesión 9 estaba montado solo `before insert`:
-- editar un post sería un bypass trivial. Se recrea como insert-or-update en
-- posts (el rate limit sigue siendo insert-only: editar no es publicar).
-- `update of body` y no `update` a secas: si no, cada like dispararía el
-- escaneo de blocked_words vía bump_post_counters.
drop trigger if exists posts_word_filter on public.posts;
create trigger posts_word_filter
  before insert or update of body on public.posts
  for each row execute function public.enforce_word_filter();

-- ===========================================================================
-- Eliminar (borrado lógico)
-- ===========================================================================

create or replace function public.delete_post(p_post_id uuid)
returns public.posts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_post public.posts;
begin
  if v_uid is null then
    raise exception 'Necesitas iniciar sesión';
  end if;

  select * into v_post from public.posts where id = p_post_id;
  if not found then
    raise exception 'Publicación no encontrada' using errcode = 'no_data_found';
  end if;
  if v_post.deleted_at is not null then
    return v_post;  -- idempotente: borrar dos veces no es un error
  end if;

  if not public.can_delete_feed_item(v_post.author_id, v_post.publisher_id) then
    raise exception 'No puedes eliminar esta publicación' using errcode = 'insufficient_privilege';
  end if;

  update public.posts
  set deleted_at = now(), deleted_by = v_uid
  where id = p_post_id
  returning * into v_post;

  return v_post;
end;
$$;

create or replace function public.delete_story(p_story_id uuid)
returns public.stories
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_story public.stories;
begin
  if v_uid is null then
    raise exception 'Necesitas iniciar sesión';
  end if;

  select * into v_story from public.stories where id = p_story_id;
  if not found then
    raise exception 'Historia no encontrada' using errcode = 'no_data_found';
  end if;
  if v_story.deleted_at is not null then
    return v_story;
  end if;

  if not public.can_delete_feed_item(v_story.author_id, v_story.publisher_id) then
    raise exception 'No puedes eliminar esta historia' using errcode = 'insufficient_privilege';
  end if;

  update public.stories
  set deleted_at = now(), deleted_by = v_uid
  where id = p_story_id
  returning * into v_story;

  return v_story;
end;
$$;

-- ===========================================================================
-- Editar — SOLO el autor. Un admin modera borrando u ocultando, nunca
-- reescribiendo el texto de otro (decisión de sesión).
-- ===========================================================================

create or replace function public.edit_post(p_post_id uuid, p_content text)
returns public.posts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_post public.posts;
  v_body text := btrim(coalesce(p_content, ''));
begin
  if v_uid is null then
    raise exception 'Necesitas iniciar sesión';
  end if;

  select * into v_post from public.posts where id = p_post_id;
  if not found then
    raise exception 'Publicación no encontrada' using errcode = 'no_data_found';
  end if;
  if v_post.deleted_at is not null then
    raise exception 'No puedes editar una publicación eliminada' using errcode = 'check_violation';
  end if;
  if v_post.author_id is null or v_post.author_id <> v_uid then
    raise exception 'Solo el autor puede editar la publicación' using errcode = 'insufficient_privilege';
  end if;

  -- Texto vacío solo se permite si el post se sostiene con su media
  -- (un carrete sin bajada es válido; un post de texto vacío no).
  if v_body = '' and jsonb_array_length(v_post.media) = 0 then
    raise exception 'La publicación no puede quedar vacía' using errcode = 'check_violation';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'La publicación no puede superar los 2000 caracteres' using errcode = 'check_violation';
  end if;

  -- edited_at lo pone el trigger posts_mark_edited, no este update.
  update public.posts set body = v_body where id = p_post_id returning * into v_post;

  return v_post;
end;
$$;

-- ===========================================================================
-- Reportar — envoltorio delgado sobre report_target (Sesión 9). No estrena
-- tabla ni cola: cae en `reports` y aparece en app/admin/reports.tsx.
-- ===========================================================================

create or replace function public.report_post(
  p_post_id uuid,
  p_reason  text,
  p_detail  text default null
)
returns public.reports
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_post   public.posts;
  v_report public.reports;
begin
  if v_uid is null then
    raise exception 'Necesitas iniciar sesión';
  end if;

  -- Se lee saltando RLS a propósito: un post ya borrado por su autor todavía
  -- se puede reportar (el reporte es justamente lo que lo hace auditable).
  select * into v_post from public.posts where id = p_post_id;
  if not found then
    raise exception 'Publicación no encontrada' using errcode = 'no_data_found';
  end if;
  if v_post.author_id is not null and v_post.author_id = v_uid then
    raise exception 'No puedes reportar tu propia publicación' using errcode = 'check_violation';
  end if;

  begin
    v_report := public.report_target(
      p_target_type   => 'post',
      p_reason        => p_reason,
      p_target_user_id => v_post.author_id,
      p_target_id     => p_post_id,
      p_description   => p_detail
    );
  exception when unique_violation then
    raise exception 'Ya reportaste esta publicación' using errcode = 'unique_violation';
  end;

  return v_report;
end;
$$;

-- ===========================================================================
-- Silenciar un publisher — preferencia personal del usuario.
-- ===========================================================================

create or replace function public.mute_publisher(p_publisher_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Necesitas iniciar sesión';
  end if;
  if not exists (select 1 from public.publishers where id = p_publisher_id) then
    raise exception 'Cuenta no encontrada' using errcode = 'no_data_found';
  end if;

  insert into public.muted_publishers (user_id, publisher_id)
  values (v_uid, p_publisher_id)
  on conflict (user_id, publisher_id) do nothing;
end;
$$;

create or replace function public.unmute_publisher(p_publisher_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Necesitas iniciar sesión';
  end if;
  delete from public.muted_publishers where user_id = v_uid and publisher_id = p_publisher_id;
end;
$$;

-- ===========================================================================
-- moderate_content: migrado a borrado lógico.
-- No pueden convivir dos vías, una borrando en duro y otra en blando: si la
-- moderación siguiera haciendo `delete`, el caso que MÁS interesa auditar
-- (contenido retirado por un admin) sería el único que no deja rastro, y se
-- llevaría por cascada los likes/respuestas del post.
-- post_replies / questions / question_replies no tienen deleted_at (no son
-- parte de esta sesión) y siguen con borrado físico, igual que antes.
-- ===========================================================================

create or replace function public.moderate_content(p_report_id uuid, p_delete boolean, p_note text default null)
returns public.reports
language plpgsql
security definer
set search_path = public
as $$
declare v_report public.reports;
begin
  if not public.is_admin() then
    raise exception 'Solo admin/owner moderan contenido' using errcode = 'insufficient_privilege';
  end if;

  select * into v_report from public.reports where id = p_report_id;
  if not found then
    raise exception 'Reporte no encontrado' using errcode = 'no_data_found';
  end if;

  if p_delete and v_report.target_id is not null then
    case v_report.target_type
      when 'post' then
        update public.posts
        set deleted_at = coalesce(deleted_at, now()), deleted_by = coalesce(deleted_by, auth.uid())
        where id = v_report.target_id;
      when 'historia' then
        update public.stories
        set deleted_at = coalesce(deleted_at, now()), deleted_by = coalesce(deleted_by, auth.uid())
        where id = v_report.target_id;
      when 'post_respuesta' then delete from public.post_replies where id = v_report.target_id;
      when 'pregunta' then delete from public.questions where id = v_report.target_id;
      when 'qa_respuesta' then delete from public.question_replies where id = v_report.target_id;
      else null;
    end case;
  end if;

  update public.reports
  set status = 'resuelto',
      resolution = case when p_delete then 'contenido_eliminado' else 'sin_accion' end,
      resolved_by = auth.uid(), resolved_at = coalesce(resolved_at, now())
  where id = p_report_id
  returning * into v_report;

  return v_report;
end;
$$;

-- ===========================================================================
-- purge_expired_stories: no purga historias con un reporte abierto, si no el
-- cron destruiría la evidencia antes de que alcance a revisarse.
-- ===========================================================================

create or replace function public.purge_expired_stories()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  delete from public.stories s
  where s.expires_at < now()
    and not exists (
      select 1 from public.reports r
      where r.target_type = 'historia'
        and r.target_id = s.id
        and r.status in ('pendiente', 'en_revision')
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.purge_expired_stories() from public, anon, authenticated;

-- ===========================================================================
-- Row Level Security
-- ===========================================================================

alter table public.muted_publishers enable row level security;

-- --- posts ------------------------------------------------------------------
-- Lectura: lo borrado desaparece para todos, salvo moderadores (tutor+), que
-- lo siguen viendo para poder investigar un reporte.
drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts
  for select to authenticated
  using (deleted_at is null or public.can_moderate());

-- Edición: SOLO el autor, y solo sobre un post vivo. Se le quita el
-- public.is_admin() que traía la Sesión 4: moderar es borrar, no reescribir.
drop policy if exists posts_update_own on public.posts;
create policy posts_update_own on public.posts
  for update to authenticated
  using (deleted_at is null and public.can_publish() and author_id = (select auth.uid()))
  with check (public.can_publish() and author_id = (select auth.uid()));

-- Borrado FÍSICO: solo el owner, como escotilla de emergencia (p. ej. una
-- solicitud legal de eliminación). La vía normal es delete_post (lógico).
drop policy if exists posts_delete_own on public.posts;
create policy posts_delete_own on public.posts
  for delete to authenticated
  using (public.is_owner());

-- --- stories ----------------------------------------------------------------
drop policy if exists stories_select_active on public.stories;
create policy stories_select_active on public.stories
  for select to authenticated
  using (expires_at > now() and (deleted_at is null or public.can_moderate()));

drop policy if exists stories_delete_own on public.stories;
create policy stories_delete_own on public.stories
  for delete to authenticated
  using (public.is_owner());

-- --- post_replies -----------------------------------------------------------
-- Las respuestas de un post borrado se ocultan CON él: no tiene sentido dejar
-- colgando un hilo cuyo contexto ya no existe, y evita que se lea el contenido
-- retirado a través de las respuestas que lo citan. Los moderadores las siguen
-- viendo, por el mismo motivo que ven el post.
drop policy if exists post_replies_select on public.post_replies;
create policy post_replies_select on public.post_replies
  for select to authenticated
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_replies.post_id
        and (p.deleted_at is null or public.can_moderate())
    )
  );

-- --- muted_publishers: cada quien administra solo sus silencios -------------
drop policy if exists muted_publishers_select_own on public.muted_publishers;
create policy muted_publishers_select_own on public.muted_publishers
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists muted_publishers_insert_own on public.muted_publishers;
create policy muted_publishers_insert_own on public.muted_publishers
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists muted_publishers_delete_own on public.muted_publishers;
create policy muted_publishers_delete_own on public.muted_publishers
  for delete to authenticated using (user_id = (select auth.uid()));

-- Sin política de UPDATE: silenciar es alta/baja, no hay nada que modificar.

-- ===========================================================================
-- Grants
-- ===========================================================================

revoke execute on function public.delete_post(uuid)          from public, anon;
revoke execute on function public.delete_story(uuid)         from public, anon;
revoke execute on function public.edit_post(uuid, text)      from public, anon;
revoke execute on function public.report_post(uuid, text, text) from public, anon;
revoke execute on function public.mute_publisher(uuid)       from public, anon;
revoke execute on function public.unmute_publisher(uuid)     from public, anon;

grant execute on function public.delete_post(uuid)           to authenticated;
grant execute on function public.delete_story(uuid)          to authenticated;
grant execute on function public.edit_post(uuid, text)       to authenticated;
grant execute on function public.report_post(uuid, text, text) to authenticated;
grant execute on function public.mute_publisher(uuid)        to authenticated;
grant execute on function public.unmute_publisher(uuid)      to authenticated;
