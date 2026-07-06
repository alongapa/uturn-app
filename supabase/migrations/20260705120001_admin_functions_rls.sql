-- Unities — Sesión 5: funciones, triggers y RLS del panel de administración.
-- Regla clave: "cada admin opera solo en nombre de sus publishers" es política
-- RLS sobre publisher_members, no el cliente. La aprobación de canjeables es
-- una función de servidor que verifica el rol owner; la RLS impide que una
-- cuenta no-owner cambie el status por UPDATE directo.

-- ===========================================================================
-- Helpers de autorización (mismo patrón security definer que is_admin /
-- can_publish: leen profiles/publisher_members saltando RLS, solo devuelven
-- boolean y se evalúan dentro de políticas).
-- ===========================================================================

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and account_role = 'owner'
  );
$$;

grant execute on function public.is_owner() to authenticated, anon;

create or replace function public.is_publisher_member(p_publisher uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.publisher_members
    where publisher_id = p_publisher and user_id = auth.uid()
  );
$$;

grant execute on function public.is_publisher_member(uuid) to authenticated, anon;

-- Publicar contenido en nombre de un publisher: el owner siempre; tutor/admin
-- solo si además son miembros de ese publisher.
create or replace function public.can_publish_as(p_publisher uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_owner()
      or (public.can_publish() and public.is_publisher_member(p_publisher));
$$;

grant execute on function public.can_publish_as(uuid) to authenticated, anon;

-- Administrar recursos del publisher (marcas, carpetas, widget, canjeables):
-- owner siempre; si no, rol admin + membresía (los tutores publican pero no
-- administran el panel).
create or replace function public.can_manage_publisher(p_publisher uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_owner()
      or (public.is_admin() and public.is_publisher_member(p_publisher));
$$;

grant execute on function public.can_manage_publisher(uuid) to authenticated, anon;

-- Configurar el widget para un post: owner, o admin del publisher del post.
create or replace function public.can_configure_widget(p_post uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_owner()
      or exists (
        select 1 from public.posts p
        where p.id = p_post and public.can_manage_publisher(p.publisher_id)
      );
$$;

grant execute on function public.can_configure_widget(uuid) to authenticated, anon;

-- Gestionar items de una carpeta: quien administra el publisher de la carpeta.
create or replace function public.can_manage_folder(p_folder uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.content_folders f
    where f.id = p_folder and public.can_manage_publisher(f.publisher_id)
  );
$$;

grant execute on function public.can_manage_folder(uuid) to authenticated, anon;

-- ===========================================================================
-- Triggers de updated_at (set_updated_at existe desde la Sesión 3)
-- ===========================================================================

drop trigger if exists brands_set_updated_at on public.brands;
create trigger brands_set_updated_at before update on public.brands
  for each row execute function public.set_updated_at();

drop trigger if exists widget_config_set_updated_at on public.widget_config;
create trigger widget_config_set_updated_at before update on public.widget_config
  for each row execute function public.set_updated_at();

drop trigger if exists content_folders_set_updated_at on public.content_folders;
create trigger content_folders_set_updated_at before update on public.content_folders
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- review_redeemable — aprobación/rechazo ejecutados en el servidor.
-- SECURITY DEFINER a propósito: la RLS de redeemables no permite a nadie más
-- que el owner tocar status; esta función verifica el rol owner ella misma
-- (un admin no puede aprobarse: no es owner).
-- ===========================================================================

create or replace function public.review_redeemable(
  p_item_id text,
  p_approve boolean,
  p_note text default null
)
returns public.redeemables
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_item public.redeemables;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = 'insufficient_privilege';
  end if;
  if not exists (
    select 1 from public.profiles where id = v_uid and account_role = 'owner'
  ) then
    raise exception 'Solo el owner puede aprobar o rechazar canjeables'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_item from public.redeemables where id = p_item_id for update;
  if not found then
    raise exception 'Canjeable no encontrado' using errcode = 'no_data_found';
  end if;
  if v_item.status <> 'pendiente' then
    raise exception 'Este canjeable ya fue revisado' using errcode = 'check_violation';
  end if;

  update public.redeemables
     set status      = case when p_approve then 'aprobado' else 'rechazado' end,
         reviewed_by = v_uid,
         reviewed_at = now(),
         review_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_item_id
   returning * into v_item;

  return v_item;
end;
$$;

revoke execute on function public.review_redeemable(text, boolean, text) from public, anon;
grant execute on function public.review_redeemable(text, boolean, text) to authenticated;

-- ===========================================================================
-- redeem_item — endurecido: solo canjeables aprobados entran al catálogo.
-- Mismo cuerpo de la Sesión 3 + condición status = 'aprobado' + soporte para
-- canjeables gratis (costo 0 no inserta cargo: credit_transactions exige
-- amount > 0).
-- ===========================================================================

create or replace function public.redeem_item(p_item_id text)
returns public.redemptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_item public.redeemables;
  v_redemption public.redemptions;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = 'insufficient_privilege';
  end if;

  -- Serializa los canjes del mismo usuario: sin esto, dos canjes concurrentes
  -- pasarían ambos la validación de saldo (doble gasto).
  perform pg_advisory_xact_lock(hashtext('redeem:' || v_uid::text));

  -- FOR UPDATE: el control de stock también debe ser serializado.
  select * into v_item from public.redeemables
  where id = p_item_id and active and status = 'aprobado'
  for update;
  if not found then
    raise exception 'Canje no disponible' using errcode = 'no_data_found';
  end if;
  if v_item.stock is not null and v_item.stock <= 0 then
    raise exception 'Este canje está agotado' using errcode = 'check_violation';
  end if;
  if public.credit_balance(v_uid) < v_item.cost_credits then
    raise exception 'No tienes créditos suficientes para este canje' using errcode = 'check_violation';
  end if;

  if v_item.stock is not null then
    update public.redeemables set stock = stock - 1 where id = v_item.id;
  end if;

  insert into public.redemptions (user_id, item_id, title, cost_credits, code, status, expires_at)
  values (
    v_uid, v_item.id, v_item.title, v_item.cost_credits, public.gen_redemption_code(),
    'disponible', now() + (v_item.validity_days || ' days')::interval
  )
  returning * into v_redemption;

  if v_item.cost_credits > 0 then
    insert into public.credit_transactions (user_id, entry_type, source, amount, description, reference_id)
    values (v_uid, 'cargo', 'canje', v_item.cost_credits, 'Canje: ' || v_item.title, v_redemption.id::text);
  end if;

  return v_redemption;
end;
$$;

-- ===========================================================================
-- Row Level Security — tablas nuevas
-- ===========================================================================

alter table public.publisher_members enable row level security;
alter table public.brands            enable row level security;
alter table public.widget_config     enable row level security;
alter table public.content_folders   enable row level security;
alter table public.content_items     enable row level security;

-- --- publisher_members: veo mis membresías (y las de mis publishers); solo el
-- --- owner asigna/quita miembros -------------------------------------------
drop policy if exists publisher_members_select on public.publisher_members;
create policy publisher_members_select on public.publisher_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_owner()
    or public.is_publisher_member(publisher_id)
  );

drop policy if exists publisher_members_insert_owner on public.publisher_members;
create policy publisher_members_insert_owner on public.publisher_members
  for insert to authenticated with check (public.is_owner());

drop policy if exists publisher_members_delete_owner on public.publisher_members;
create policy publisher_members_delete_owner on public.publisher_members
  for delete to authenticated using (public.is_owner());

-- --- brands: catálogo visible (el feed muestra la co-firma); escribe quien
-- --- administra el publisher ------------------------------------------------
drop policy if exists brands_select on public.brands;
create policy brands_select on public.brands
  for select to authenticated using (true);

drop policy if exists brands_insert_manager on public.brands;
create policy brands_insert_manager on public.brands
  for insert to authenticated with check (public.can_manage_publisher(publisher_id));

drop policy if exists brands_update_manager on public.brands;
create policy brands_update_manager on public.brands
  for update to authenticated
  using (public.can_manage_publisher(publisher_id))
  with check (public.can_manage_publisher(publisher_id));

drop policy if exists brands_delete_manager on public.brands;
create policy brands_delete_manager on public.brands
  for delete to authenticated using (public.can_manage_publisher(publisher_id));

-- --- widget_config: lo lee todo autenticado (el feed ordena con esto);
-- --- escribe el owner o el admin del publisher del post ---------------------
drop policy if exists widget_config_select on public.widget_config;
create policy widget_config_select on public.widget_config
  for select to authenticated using (true);

drop policy if exists widget_config_insert_manager on public.widget_config;
create policy widget_config_insert_manager on public.widget_config
  for insert to authenticated with check (public.can_configure_widget(post_id));

drop policy if exists widget_config_update_manager on public.widget_config;
create policy widget_config_update_manager on public.widget_config
  for update to authenticated
  using (public.can_configure_widget(post_id))
  with check (public.can_configure_widget(post_id));

drop policy if exists widget_config_delete_manager on public.widget_config;
create policy widget_config_delete_manager on public.widget_config
  for delete to authenticated using (public.can_configure_widget(post_id));

-- --- content_folders / content_items: lectura autenticada (el feed integra
-- --- las carpetas enlazadas); escribe quien administra el publisher ---------
drop policy if exists content_folders_select on public.content_folders;
create policy content_folders_select on public.content_folders
  for select to authenticated using (true);

drop policy if exists content_folders_insert_manager on public.content_folders;
create policy content_folders_insert_manager on public.content_folders
  for insert to authenticated with check (public.can_manage_publisher(publisher_id));

drop policy if exists content_folders_update_manager on public.content_folders;
create policy content_folders_update_manager on public.content_folders
  for update to authenticated
  using (public.can_manage_publisher(publisher_id))
  with check (public.can_manage_publisher(publisher_id));

drop policy if exists content_folders_delete_manager on public.content_folders;
create policy content_folders_delete_manager on public.content_folders
  for delete to authenticated using (public.can_manage_publisher(publisher_id));

drop policy if exists content_items_select on public.content_items;
create policy content_items_select on public.content_items
  for select to authenticated using (true);

drop policy if exists content_items_insert_manager on public.content_items;
create policy content_items_insert_manager on public.content_items
  for insert to authenticated with check (public.can_manage_folder(folder_id));

drop policy if exists content_items_update_manager on public.content_items;
create policy content_items_update_manager on public.content_items
  for update to authenticated
  using (public.can_manage_folder(folder_id))
  with check (public.can_manage_folder(folder_id));

drop policy if exists content_items_delete_manager on public.content_items;
create policy content_items_delete_manager on public.content_items
  for delete to authenticated using (public.can_manage_folder(folder_id));

-- ===========================================================================
-- RLS — endurecimiento de tablas existentes
-- ===========================================================================

-- --- posts / stories: de can_publish() global a can_publish_as(publisher) --
-- En la Sesión 4 cualquier tutor/admin publicaba a nombre de cualquier
-- publisher; ahora requiere membresía (el owner conserva alcance global).
drop policy if exists posts_insert_publisher on public.posts;
create policy posts_insert_publisher on public.posts
  for insert to authenticated
  with check (public.can_publish_as(publisher_id) and author_id = (select auth.uid()));

drop policy if exists posts_update_own on public.posts;
create policy posts_update_own on public.posts
  for update to authenticated
  using (
    public.is_owner()
    or (public.can_publish_as(publisher_id) and author_id = (select auth.uid()))
  )
  with check (
    public.is_owner()
    or (public.can_publish_as(publisher_id) and author_id = (select auth.uid()))
  );

drop policy if exists posts_delete_own on public.posts;
create policy posts_delete_own on public.posts
  for delete to authenticated
  using (
    public.is_owner()
    or (public.can_publish_as(publisher_id) and author_id = (select auth.uid()))
  );

drop policy if exists stories_insert_publisher on public.stories;
create policy stories_insert_publisher on public.stories
  for insert to authenticated
  with check (public.can_publish_as(publisher_id) and author_id = (select auth.uid()));

drop policy if exists stories_delete_own on public.stories;
create policy stories_delete_own on public.stories
  for delete to authenticated
  using (
    public.is_owner()
    or (public.can_publish_as(publisher_id) and author_id = (select auth.uid()))
  );

-- --- publishers: crear/editar/borrar entidades es del owner (antes cualquier
-- --- admin vía publishers_write_admin) --------------------------------------
drop policy if exists publishers_write_admin on public.publishers;

drop policy if exists publishers_insert_owner on public.publishers;
create policy publishers_insert_owner on public.publishers
  for insert to authenticated with check (public.is_owner());

drop policy if exists publishers_update_owner on public.publishers;
create policy publishers_update_owner on public.publishers
  for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists publishers_delete_owner on public.publishers;
create policy publishers_delete_owner on public.publishers
  for delete to authenticated using (public.is_owner());

-- --- redeemables: postulación con aprobación del owner ----------------------
-- Antes: redeemables_write_admin (for all, is_admin). Ahora:
--  * select: el catálogo solo muestra aprobados; el proponente ve los suyos y
--    los admins/owner ven todo (bandeja).
--  * insert: owner libre; admin solo 'pendiente', a su nombre y para un
--    publisher suyo.
--  * update/delete: owner libre; el proponente solo mientras siga 'pendiente'
--    y el WITH CHECK le impide sacar la fila de ese estado (aprobar/rechazar
--    queda imposible para no-owners por RLS: review_redeemable es la vía).
drop policy if exists redeemables_write_admin on public.redeemables;

drop policy if exists redeemables_select on public.redeemables;
create policy redeemables_select on public.redeemables
  for select to authenticated
  using (
    status = 'aprobado'
    or public.is_admin()
    or proposed_by = (select auth.uid())
  );

drop policy if exists redeemables_insert_proposal on public.redeemables;
create policy redeemables_insert_proposal on public.redeemables
  for insert to authenticated
  with check (
    public.is_owner()
    or (
      public.is_admin()
      and status = 'pendiente'
      and proposed_by = (select auth.uid())
      and (publisher_id is null or public.is_publisher_member(publisher_id))
    )
  );

drop policy if exists redeemables_update_proposal on public.redeemables;
create policy redeemables_update_proposal on public.redeemables
  for update to authenticated
  using (
    public.is_owner()
    or (proposed_by = (select auth.uid()) and status = 'pendiente')
  )
  with check (
    public.is_owner()
    or (proposed_by = (select auth.uid()) and status = 'pendiente')
  );

drop policy if exists redeemables_delete_proposal on public.redeemables;
create policy redeemables_delete_proposal on public.redeemables
  for delete to authenticated
  using (
    public.is_owner()
    or (proposed_by = (select auth.uid()) and status = 'pendiente')
  );
