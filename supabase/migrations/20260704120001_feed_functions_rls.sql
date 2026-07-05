-- Unities — Sesión 4: funciones, triggers y RLS del feed.
-- Regla clave (igual que en la Sesión 3): el enforcement de quién publica es
-- la política RLS sobre el rol en profiles, no el cliente. Los contadores de
-- posts solo los mueven triggers (security definer); no hay política de
-- UPDATE de posts para usuarios normales.

-- ===========================================================================
-- Helpers de autorización
-- ===========================================================================

-- Publican contenidos: tutor, admin y owner (docs/sesiones/04-inicio-feed.md).
-- security definer para leer profiles saltando RLS, como public.is_admin().
create or replace function public.can_publish()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and account_role in ('tutor', 'admin', 'owner')
  );
$$;

-- Se evalúa dentro de políticas RLS; mismos grants que is_admin.
grant execute on function public.can_publish() to authenticated, anon;

-- ===========================================================================
-- Triggers
-- ===========================================================================

drop trigger if exists publishers_set_updated_at on public.publishers;
create trigger publishers_set_updated_at before update on public.publishers
  for each row execute function public.set_updated_at();

drop trigger if exists posts_set_updated_at on public.posts;
create trigger posts_set_updated_at before update on public.posts
  for each row execute function public.set_updated_at();

-- Contadores denormalizados de posts. SECURITY DEFINER a propósito: quien da
-- like es un usuario normal sin política de UPDATE sobre posts; el trigger
-- corre con privilegios del owner para poder mover el contador (y solo eso).
create or replace function public.bump_post_counters()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post  uuid;
  v_delta integer;
begin
  if tg_op = 'INSERT' then
    v_post := new.post_id; v_delta := 1;
  else
    v_post := old.post_id; v_delta := -1;
  end if;
  if tg_table_name = 'post_likes' then
    update public.posts set like_count = greatest(like_count + v_delta, 0) where id = v_post;
  elsif tg_table_name = 'post_reposts' then
    update public.posts set repost_count = greatest(repost_count + v_delta, 0) where id = v_post;
  elsif tg_table_name = 'post_replies' then
    update public.posts set reply_count = greatest(reply_count + v_delta, 0) where id = v_post;
  end if;
  return null;  -- after trigger
end;
$$;

revoke execute on function public.bump_post_counters() from public, anon, authenticated;

drop trigger if exists post_likes_bump_counters on public.post_likes;
create trigger post_likes_bump_counters after insert or delete on public.post_likes
  for each row execute function public.bump_post_counters();

drop trigger if exists post_reposts_bump_counters on public.post_reposts;
create trigger post_reposts_bump_counters after insert or delete on public.post_reposts
  for each row execute function public.bump_post_counters();

drop trigger if exists post_replies_bump_counters on public.post_replies;
create trigger post_replies_bump_counters after insert or delete on public.post_replies
  for each row execute function public.bump_post_counters();

-- ===========================================================================
-- Expiración de historias (24 h) server-side
-- La RLS de lectura (expires_at > now()) las oculta al instante; este purge
-- borra las filas vencidas. Mismo patrón pg_cron que expire_overdue_payments.
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
  delete from public.stories where expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.purge_expired_stories() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('purge-expired-stories')
  where exists (select 1 from cron.job where jobname = 'purge-expired-stories');
exception when others then
  null;  -- pg_cron no disponible en algunos entornos locales; se ignora.
end;
$$;

do $$
begin
  perform cron.schedule(
    'purge-expired-stories',
    '13 * * * *',
    $cron$ select public.purge_expired_stories(); $cron$
  );
exception when others then
  raise notice 'pg_cron no disponible; programa purge_expired_stories por scheduler externo.';
end;
$$;

-- ===========================================================================
-- Row Level Security
-- ===========================================================================

alter table public.publishers   enable row level security;
alter table public.posts        enable row level security;
alter table public.stories      enable row level security;
alter table public.post_likes   enable row level security;
alter table public.post_reposts enable row level security;
alter table public.post_replies enable row level security;

-- --- publishers: catálogo visible; solo admin/owner lo administra ----------
drop policy if exists publishers_select on public.publishers;
create policy publishers_select on public.publishers
  for select to authenticated using (true);

drop policy if exists publishers_write_admin on public.publishers;
create policy publishers_write_admin on public.publishers
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- --- posts: leen autenticados; publican solo roles con can_publish() -------
drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts
  for select to authenticated using (true);

drop policy if exists posts_insert_publisher on public.posts;
create policy posts_insert_publisher on public.posts
  for insert to authenticated
  with check (public.can_publish() and author_id = (select auth.uid()));

drop policy if exists posts_update_own on public.posts;
create policy posts_update_own on public.posts
  for update to authenticated
  using (public.is_admin() or (public.can_publish() and author_id = (select auth.uid())))
  with check (public.is_admin() or (public.can_publish() and author_id = (select auth.uid())));

drop policy if exists posts_delete_own on public.posts;
create policy posts_delete_own on public.posts
  for delete to authenticated
  using (public.is_admin() or (public.can_publish() and author_id = (select auth.uid())));

-- --- stories: la lectura exige que no hayan expirado (server-side) ---------
drop policy if exists stories_select_active on public.stories;
create policy stories_select_active on public.stories
  for select to authenticated using (expires_at > now());

drop policy if exists stories_insert_publisher on public.stories;
create policy stories_insert_publisher on public.stories
  for insert to authenticated
  with check (public.can_publish() and author_id = (select auth.uid()));

drop policy if exists stories_delete_own on public.stories;
create policy stories_delete_own on public.stories
  for delete to authenticated
  using (public.is_admin() or (public.can_publish() and author_id = (select auth.uid())));

-- --- interacciones: cualquiera autenticado, solo a nombre propio -----------
drop policy if exists post_likes_select on public.post_likes;
create policy post_likes_select on public.post_likes
  for select to authenticated using (true);

drop policy if exists post_likes_insert_own on public.post_likes;
create policy post_likes_insert_own on public.post_likes
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists post_likes_delete_own on public.post_likes;
create policy post_likes_delete_own on public.post_likes
  for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists post_reposts_select on public.post_reposts;
create policy post_reposts_select on public.post_reposts
  for select to authenticated using (true);

drop policy if exists post_reposts_insert_own on public.post_reposts;
create policy post_reposts_insert_own on public.post_reposts
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists post_reposts_delete_own on public.post_reposts;
create policy post_reposts_delete_own on public.post_reposts
  for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists post_replies_select on public.post_replies;
create policy post_replies_select on public.post_replies
  for select to authenticated using (true);

drop policy if exists post_replies_insert_own on public.post_replies;
create policy post_replies_insert_own on public.post_replies
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists post_replies_delete_own on public.post_replies;
create policy post_replies_delete_own on public.post_replies
  for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- ===========================================================================
-- Realtime: agrega las tablas a la publicación supabase_realtime.
-- La publicación existía vacía, así que las suscripciones postgres_changes de
-- la Sesión 3 (trips/bookings/payments/credit_transactions) nunca emitieron
-- eventos; se agregan aquí junto con las del feed. RLS sigue aplicando a lo
-- que cada cliente recibe.
-- ===========================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'posts', 'stories',
    'trips', 'bookings', 'payments', 'credit_transactions'
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
