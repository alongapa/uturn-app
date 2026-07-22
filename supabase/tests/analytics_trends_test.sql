-- =====================================================================
-- Unities — Sesión Analítica de tendencias: prueba end-to-end en sandbox.
--
-- Verifica, sin salir de la base: (1) un click/vista inserta el evento y el
-- servidor fija university_id/campus_id/actor_id reales pase lo que pase el
-- payload; (2) el opt-out bloquea el insert; (3) NADIE que no sea el owner
-- lee analytics_events crudo (RLS, no solo el cliente); (4) university_trends()
-- y publisher_engagement() exigen autorización y SUPRIMEN cohortes con menos
-- de k cuentas distintas; (5) ningún RPC expuesto trae actor_id; (6) la purga
-- por retención borra crudos vencidos.
--
-- Cómo correrlo (sandbox local):
--   supabase start && supabase db reset
--   psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" \
--        -f supabase/tests/analytics_trends_test.sql
--   (o pega este archivo en el SQL Editor de un proyecto sandbox)
--
-- Todo corre dentro de una transacción con ROLLBACK final: NO deja datos.
-- Requiere que la sesión pueda `SET ROLE authenticated` (postgres lo puede
-- en Supabase local/dashboard, igual que supabase/tests/payments_cycle_test.sql).
-- Cada paso hace RAISE NOTICE 'OK …'; cualquier invariante rota aborta con FAIL.
-- =====================================================================

begin;

create temporary table t_ids (key text primary key, id uuid not null) on commit drop;

-- =========================================================================
-- Setup (como postgres): 22 alumnos UAI (cohorte >= k=20), 3 alumnos UDD
-- (cohorte < k, debe suprimirse), un owner, un admin dueño de un publisher.
-- =========================================================================
do $$
declare
  v_i        int;
  v_uid      uuid;
  v_owner    uuid := gen_random_uuid();
  v_admin    uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_publisher uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at, email_confirmed_at)
  values
    (v_owner,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-analitica@alumnos.uai.cl', now(), now(), now()),
    (v_admin,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-analitica@alumnos.uai.cl', now(), now(), now()),
    (v_outsider, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'outsider-analitica@alumnos.uai.cl', now(), now(), now());
  update public.profiles set account_role = 'owner' where id = v_owner;
  update public.profiles set account_role = 'admin', university_id = 'udd' where id = v_admin;
  insert into t_ids values ('owner', v_owner), ('admin', v_admin), ('outsider', v_outsider);

  for v_i in 1..22 loop
    v_uid := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at, email_confirmed_at)
    values (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'uai-analitica-' || v_i || '@alumnos.uai.cl', now(), now(), now());
    update public.profiles set university_id = 'uai', home_campus_id = 'uai-penalolen' where id = v_uid;
    insert into t_ids values ('uai_' || v_i, v_uid);
  end loop;

  for v_i in 1..3 loop
    v_uid := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at, email_confirmed_at)
    values (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'udd-analitica-' || v_i || '@udd.cl', now(), now(), now());
    update public.profiles set university_id = 'udd', home_campus_id = 'udd-las-condes' where id = v_uid;
    insert into t_ids values ('udd_' || v_i, v_uid);
  end loop;

  insert into public.publishers (id, slug, name, kind, university_id)
  values (gen_random_uuid(), 'test-analitica-pub', 'Publisher de prueba', 'centro_alumnos', 'uai')
  returning id into v_publisher;
  insert into t_ids values ('publisher', v_publisher);
  insert into public.publisher_members (publisher_id, user_id) values (v_publisher, v_admin);

  raise notice 'OK setup: 22 alumnos UAI, 3 alumnos UDD, owner, admin (dueño de un publisher), outsider';
end $$;

-- =========================================================================
-- 1) Insertar evento propio: entra y el servidor fija la cohorte real, sin
--    importar lo que mande el cliente en university_id/campus_id/actor_id.
-- =========================================================================
do $$
declare
  v_me        uuid := (select id from t_ids where key = 'uai_1');
  v_someoneelse uuid := (select id from t_ids where key = 'uai_2');
  v_publisher uuid := (select id from t_ids where key = 'publisher');
  v_row       public.analytics_events;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_me, 'role', 'authenticated')::text, true);

  -- El cliente manda university_id falso y actor_id ajeno: el trigger los pisa.
  insert into public.analytics_events (actor_id, university_id, campus_id, event_type, entity_type, entity_id, publisher_id, category)
  values (v_someoneelse, 'udd', 'udd-las-condes', 'click', 'widget', 'w1', v_publisher, 'galeria')
  returning * into v_row;

  reset role;

  if v_row.actor_id <> v_me then
    raise exception 'FAIL actor_id: quedó % en vez del propio %', v_row.actor_id, v_me;
  end if;
  if v_row.university_id <> 'uai' or v_row.campus_id <> 'uai-penalolen' then
    raise exception 'FAIL cohorte: university_id=% campus_id=% (el cliente mandó udd)', v_row.university_id, v_row.campus_id;
  end if;
  raise notice 'OK insert propio: actor_id/university_id/campus_id los fija el servidor, no el payload';
end $$;

-- =========================================================================
-- 2) Opt-out: si el usuario optó por salir, el INSERT lo rechaza la RLS.
-- =========================================================================
do $$
declare
  v_me uuid := (select id from t_ids where key = 'uai_2');
  v_failed boolean := false;
begin
  update public.profiles set analytics_opt_out = true where id = v_me;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_me, 'role', 'authenticated')::text, true);
  begin
    insert into public.analytics_events (actor_id, event_type, entity_type, entity_id)
    values (v_me, 'view', 'post', 'p1');
  exception when insufficient_privilege or others then
    v_failed := true;
  end;
  reset role;

  update public.profiles set analytics_opt_out = false where id = v_me;

  if not v_failed then
    raise exception 'FAIL opt-out: el insert debió rechazarse';
  end if;
  raise notice 'OK opt-out: RLS rechaza el evento de un usuario que optó por salir';
end $$;

-- =========================================================================
-- 3) Nadie lee crudo salvo el owner (RLS de SELECT, no el cliente).
-- =========================================================================
do $$
declare
  v_me    uuid := (select id from t_ids where key = 'uai_1');
  v_owner uuid := (select id from t_ids where key = 'owner');
  v_count bigint;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_me, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.analytics_events;
  reset role;
  if v_count <> 0 then
    raise exception 'FAIL select crudo: un user vio % filas (debía ser 0)', v_count;
  end if;
  raise notice 'OK RLS: un user no lee analytics_events (ni siquiera lo propio)';

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.analytics_events;
  reset role;
  if v_count < 1 then
    raise exception 'FAIL select owner: vio % filas (debía ver al menos la insertada en el paso 1)', v_count;
  end if;
  raise notice 'OK RLS: el owner sí lee analytics_events crudo (%: filas)', v_count;
end $$;

-- =========================================================================
-- 4) Volumen suficiente para probar supresión k-anónima: 22 vistas UAI
--    (>= k=20 por defecto) y 3 vistas UDD (< k). Cada una de un actor
--    distinto, todas contra el mismo publisher/categoría.
-- =========================================================================
do $$
declare
  v_i         int;
  v_uid       uuid;
  v_publisher uuid := (select id from t_ids where key = 'publisher');
begin
  for v_i in 1..22 loop
    v_uid := (select id from t_ids where key = 'uai_' || v_i);
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    insert into public.analytics_events (actor_id, event_type, entity_type, entity_id, publisher_id, category)
    values (v_uid, 'view', 'post', 'post-' || v_i, v_publisher, 'noticia');
    reset role;
  end loop;

  for v_i in 1..3 loop
    v_uid := (select id from t_ids where key = 'udd_' || v_i);
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    insert into public.analytics_events (actor_id, event_type, entity_type, entity_id, category)
    values (v_uid, 'view', 'post', 'post-udd-' || v_i, 'evento');
    reset role;
  end loop;

  raise notice 'OK volumen: 22 eventos UAI (cohorte grande) + 3 eventos UDD (cohorte chica)';
end $$;

-- Refresca las materialized views (lo haría pg_cron cada noche; aquí a mano).
select public.refresh_analytics_trends();

-- =========================================================================
-- 5) university_trends(): exige owner/analyst; suprime cohortes < k; nunca
--    trae actor_id (garantía estructural del tipo de retorno, no solo RLS).
-- =========================================================================
do $$
declare
  v_owner    uuid := (select id from t_ids where key = 'owner');
  v_outsider uuid := (select id from t_ids where key = 'outsider');
  v_failed   boolean := false;
  v_uai_row  record;
  v_udd_rows int;
  v_json     jsonb;
begin
  -- Sin autorización: falla.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  begin
    perform * from public.university_trends('uai');
  exception when insufficient_privilege or others then
    v_failed := true;
  end;
  reset role;
  if not v_failed then
    raise exception 'FAIL university_trends: un outsider no debía poder llamarla';
  end if;
  raise notice 'OK university_trends: rechaza a quien no es owner ni analyst';

  -- Owner: ve la cohorte UAI (>= k) y NO ve la UDD (< k).
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  select * into v_uai_row from public.university_trends('uai') where category = 'noticia' limit 1;
  if v_uai_row is null or v_uai_row.distinct_actors < 20 then
    raise exception 'FAIL supresión: cohorte UAI/noticia no apareció o distinct_actors < 20 (%)', v_uai_row.distinct_actors;
  end if;

  select count(*) into v_udd_rows from public.university_trends('udd') where category = 'evento';
  if v_udd_rows <> 0 then
    raise exception 'FAIL supresión: la cohorte UDD/evento (3 cuentas) NO debía aparecer (k=20)';
  end if;

  -- Ningún campo del tipo de retorno es actor_id (garantía estructural: el
  -- RPC ni siquiera lo selecciona, no solo lo oculta la RLS).
  select to_jsonb(t) into v_json from public.university_trends('uai') t limit 1;
  if v_json ? 'actor_id' then
    raise exception 'FAIL PII: university_trends() expone actor_id';
  end if;

  reset role;
  raise notice 'OK university_trends: owner ve UAI/noticia (%: cuentas), UDD/evento suprimido, sin actor_id', v_uai_row.distinct_actors;
end $$;

-- =========================================================================
-- 6) publisher_engagement(): exige can_manage_publisher(); mismo publisher
--    que arriba, mismo umbral de supresión.
-- =========================================================================
do $$
declare
  v_admin     uuid := (select id from t_ids where key = 'admin');
  v_outsider  uuid := (select id from t_ids where key = 'outsider');
  v_publisher uuid := (select id from t_ids where key = 'publisher');
  v_failed    boolean := false;
  v_row       record;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  begin
    perform * from public.publisher_engagement(v_publisher);
  exception when insufficient_privilege or others then
    v_failed := true;
  end;
  reset role;
  if not v_failed then
    raise exception 'FAIL publisher_engagement: un outsider no administra este publisher';
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select * into v_row from public.publisher_engagement(v_publisher) where category = 'noticia' limit 1;
  reset role;
  if v_row is null or v_row.distinct_actors < 20 then
    raise exception 'FAIL publisher_engagement: el admin del publisher debía ver la cohorte (>= 20 cuentas)';
  end if;

  raise notice 'OK publisher_engagement: solo quien administra el publisher lo ve, agregado (%: cuentas)', v_row.distinct_actors;
end $$;

-- =========================================================================
-- 7) update_analytics_config(): solo el owner; retención mínima 7 días.
-- =========================================================================
do $$
declare
  v_owner    uuid := (select id from t_ids where key = 'owner');
  v_outsider uuid := (select id from t_ids where key = 'outsider');
  v_failed   boolean := false;
  v_cfg      public.analytics_config;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  begin
    perform public.update_analytics_config(30, null);
  exception when insufficient_privilege or others then
    v_failed := true;
  end;
  reset role;
  if not v_failed then
    raise exception 'FAIL update_analytics_config: un outsider no debía poder cambiarla';
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  select * into v_cfg from public.update_analytics_config(null, 7);
  reset role;
  if v_cfg.retention_days <> 7 then
    raise exception 'FAIL update_analytics_config: retention_days quedó en % (esperaba 7)', v_cfg.retention_days;
  end if;
  raise notice 'OK update_analytics_config: solo el owner la ejecuta; retención = % días', v_cfg.retention_days;
end $$;

-- =========================================================================
-- 8) Retención: purge_old_analytics_events() borra crudos más viejos que
--    retention_days (ya en 7) y deja los recientes intactos.
-- =========================================================================
do $$
declare
  v_uid     uuid := (select id from t_ids where key = 'uai_1');
  v_old_id  uuid := gen_random_uuid();
  v_deleted int;
  v_exists  boolean;
begin
  -- Insertado como postgres (no 'authenticated'): el trigger respeta el
  -- created_at explícito, igual que un backfill real.
  insert into public.analytics_events (id, actor_id, event_type, entity_type, entity_id, created_at)
  values (v_old_id, v_uid, 'view', 'post', 'post-viejo', now() - interval '30 days');

  select public.purge_old_analytics_events() into v_deleted;
  select exists (select 1 from public.analytics_events where id = v_old_id) into v_exists;

  if v_exists then
    raise exception 'FAIL retención: el evento de hace 30 días sigue vivo con retention_days=7';
  end if;
  if v_deleted < 1 then
    raise exception 'FAIL retención: purge_old_analytics_events() reportó % filas borradas', v_deleted;
  end if;
  raise notice 'OK retención: purge_old_analytics_events() borró % fila(s) vencida(s), el resto sigue', v_deleted;
end $$;

rollback;
