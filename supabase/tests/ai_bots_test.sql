-- =====================================================================
-- Unities — Sesión Bots de IA: prueba end-to-end en sandbox.
--
-- Verifica, sin salir de la base ni llamar a la API de Claude: (1) solo quien
-- administra un publisher puede activar su bot (can_manage_publisher); (2)
-- solo el tutor asignado a un tema puede activar el bot de esa asignatura
-- (topic_assignees); (3) configurar dos veces el mismo bot actualiza, no
-- duplica, el perfil de servicio; (4) el bot creado pasa
-- enforce_university_email (email institucional sintético) y queda marcado
-- is_bot; (5) cualquier alumno abre un DM con el bot con el start_dm normal
-- (Sesión 6), sin RPC especial; (6) el trigger notify_ai_bot_on_message no
-- revienta el insert de mensajes en ninguna dirección (ni hacia el bot, ni
-- desde el bot).
--
-- Cómo correrlo (sandbox local):
--   supabase start && supabase db reset
--   psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" \
--        -f supabase/tests/ai_bots_test.sql
--   (o pega este archivo en el SQL Editor de un proyecto sandbox)
--
-- Todo corre dentro de una transacción con ROLLBACK final: NO deja datos.
-- Requiere que la sesión pueda `SET ROLE authenticated` (postgres lo puede en
-- Supabase local/dashboard, igual que supabase/tests/payments_cycle_test.sql).
-- Cada paso hace RAISE NOTICE 'OK …'; cualquier invariante rota aborta con FAIL.
-- =====================================================================

begin;

create temporary table t_ids (key text primary key, id uuid not null) on commit drop;

-- =========================================================================
-- Setup (como postgres): owner, dos admins (uno miembro del publisher, otro
-- no), dos tutores (uno asignado al tema, otro no), un alumno cualquiera.
-- =========================================================================
do $$
declare
  v_owner     uuid := gen_random_uuid();
  v_admin_ok  uuid := gen_random_uuid();
  v_admin_bad uuid := gen_random_uuid();
  v_tutor_ok  uuid := gen_random_uuid();
  v_tutor_bad uuid := gen_random_uuid();
  v_student   uuid := gen_random_uuid();
  v_publisher uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at, email_confirmed_at)
  values
    (v_owner,     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-bots@alumnos.uai.cl', now(), now(), now()),
    (v_admin_ok,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-ok-bots@alumnos.uai.cl', now(), now(), now()),
    (v_admin_bad, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-bad-bots@alumnos.uai.cl', now(), now(), now()),
    (v_tutor_ok,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tutor-ok-bots@alumnos.uai.cl', now(), now(), now()),
    (v_tutor_bad, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tutor-bad-bots@alumnos.uai.cl', now(), now(), now()),
    (v_student,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'estudiante-bots@alumnos.uai.cl', now(), now(), now());

  update public.profiles set account_role = 'owner' where id = v_owner;
  update public.profiles set account_role = 'admin', university_id = 'uai' where id in (v_admin_ok, v_admin_bad);
  update public.profiles set account_role = 'tutor', university_id = 'uai' where id in (v_tutor_ok, v_tutor_bad);

  insert into public.publishers (id, slug, name, kind, university_id)
  values (gen_random_uuid(), 'test-bots-pub', 'Publisher de prueba (bots)', 'centro_alumnos', 'uai')
  returning id into v_publisher;
  insert into public.publisher_members (publisher_id, user_id) values (v_publisher, v_admin_ok);

  -- 'becas' viene sembrado por la migración de mensajería (Sesión 6).
  insert into public.topic_assignees (topic_id, user_id) values ('becas', v_tutor_ok);

  insert into t_ids values
    ('owner', v_owner), ('admin_ok', v_admin_ok), ('admin_bad', v_admin_bad),
    ('tutor_ok', v_tutor_ok), ('tutor_bad', v_tutor_bad), ('student', v_student),
    ('publisher', v_publisher);

  raise notice 'OK setup: publisher con un admin miembro, tema "becas" con un tutor asignado';
end $$;

-- =========================================================================
-- 1) set_publisher_bot: rechaza a quien no administra el publisher; lo crea
--    quien sí; una segunda llamada actualiza en vez de duplicar.
-- =========================================================================
do $$
declare
  v_admin_bad uuid := (select id from t_ids where key = 'admin_bad');
  v_admin_ok  uuid := (select id from t_ids where key = 'admin_ok');
  v_publisher uuid := (select id from t_ids where key = 'publisher');
  v_failed    boolean := false;
  v_bot       public.ai_bots;
  v_bot2      public.ai_bots;
  v_email     text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_bad, 'role', 'authenticated')::text, true);
  begin
    perform public.set_publisher_bot(v_publisher, 'Bot intruso', '', true);
  exception when insufficient_privilege or others then
    v_failed := true;
  end;
  reset role;
  if not v_failed then
    raise exception 'FAIL set_publisher_bot: admin_bad no administra el publisher';
  end if;
  raise notice 'OK set_publisher_bot: rechaza a un admin que no es miembro del publisher';

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_ok, 'role', 'authenticated')::text, true);
  select * into v_bot from public.set_publisher_bot(v_publisher, 'Bot FEUAI', 'Las inscripciones abren en marzo.', true);
  reset role;

  if v_bot.id is null or not v_bot.enabled or v_bot.persona_name <> 'Bot FEUAI' then
    raise exception 'FAIL set_publisher_bot: no se creó el bot como se esperaba';
  end if;

  select email into v_email from auth.users where id = v_bot.profile_id;
  if v_email !~ '@(alumnos\.uai\.cl|udd\.cl|miuandes\.cl)$' then
    raise exception 'FAIL set_publisher_bot: email del bot no pasa enforce_university_email (%)', v_email;
  end if;
  if not exists (select 1 from public.profiles where id = v_bot.profile_id and is_bot and account_role = 'tutor') then
    raise exception 'FAIL set_publisher_bot: el perfil del bot no quedó is_bot=true';
  end if;
  raise notice 'OK set_publisher_bot: bot creado con perfil de servicio (email %)', v_email;

  -- Segunda llamada: actualiza el mismo bot, no crea uno nuevo.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_ok, 'role', 'authenticated')::text, true);
  select * into v_bot2 from public.set_publisher_bot(v_publisher, 'Bot FEUAI 2.0', 'Actualizado.', false);
  reset role;

  if v_bot2.id <> v_bot.id or v_bot2.profile_id <> v_bot.profile_id then
    raise exception 'FAIL set_publisher_bot: la segunda llamada debía actualizar el mismo bot, no crear otro';
  end if;
  if v_bot2.enabled or v_bot2.persona_name <> 'Bot FEUAI 2.0' then
    raise exception 'FAIL set_publisher_bot: la actualización no se reflejó';
  end if;
  if (select count(*) from public.ai_bots where publisher_id = v_publisher) <> 1 then
    raise exception 'FAIL set_publisher_bot: quedó más de un bot para el mismo publisher';
  end if;
  raise notice 'OK set_publisher_bot: reconfigurar el mismo publisher actualiza, no duplica';

  -- Vuelve a habilitarlo para los pasos siguientes.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_ok, 'role', 'authenticated')::text, true);
  perform public.set_publisher_bot(v_publisher, 'Bot FEUAI', 'Las inscripciones abren en marzo.', true);
  reset role;
end $$;

-- =========================================================================
-- 2) set_tutor_topic_bot: rechaza a un tutor no asignado al tema; lo crea el
--    tutor asignado.
-- =========================================================================
do $$
declare
  v_tutor_bad uuid := (select id from t_ids where key = 'tutor_bad');
  v_tutor_ok  uuid := (select id from t_ids where key = 'tutor_ok');
  v_failed    boolean := false;
  v_bot       public.ai_bots;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_tutor_bad, 'role', 'authenticated')::text, true);
  begin
    perform public.set_tutor_topic_bot('becas', 'Bot intruso', '', true);
  exception when insufficient_privilege or others then
    v_failed := true;
  end;
  reset role;
  if not v_failed then
    raise exception 'FAIL set_tutor_topic_bot: tutor_bad no está asignado al tema "becas"';
  end if;
  raise notice 'OK set_tutor_topic_bot: rechaza a un tutor no asignado al tema';

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_tutor_ok, 'role', 'authenticated')::text, true);
  select * into v_bot from public.set_tutor_topic_bot('becas', 'Bot Becas', 'Postula antes del 30 de abril.', true);
  reset role;

  if v_bot.id is null or v_bot.owner_kind <> 'tutor_topic' or v_bot.tutor_id <> v_tutor_ok or v_bot.topic_id <> 'becas' then
    raise exception 'FAIL set_tutor_topic_bot: no se creó el bot del tutor como se esperaba';
  end if;
  insert into t_ids values ('tutor_bot_profile', v_bot.profile_id);
  raise notice 'OK set_tutor_topic_bot: bot creado para el tutor asignado';
end $$;

-- =========================================================================
-- 3) Cualquier alumno abre un DM con el bot con el start_dm normal (Sesión
--    6) — el bot es un profiles más, no necesita RPC propia.
-- =========================================================================
do $$
declare
  v_student   uuid := (select id from t_ids where key = 'student');
  v_bot_prof  uuid := (select id from t_ids where key = 'tutor_bot_profile');
  v_conv      public.conversations;
  v_members   int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_student, 'role', 'authenticated')::text, true);
  select * into v_conv from public.start_dm(v_bot_prof);
  reset role;

  if v_conv.id is null or v_conv.kind <> 'dm' then
    raise exception 'FAIL start_dm: no se abrió el DM con el bot';
  end if;
  select count(*) into v_members from public.conversation_members where conversation_id = v_conv.id;
  if v_members <> 2 then
    raise exception 'FAIL start_dm: el DM con el bot debía tener 2 miembros (%)', v_members;
  end if;
  insert into t_ids values ('conversation', v_conv.id);
  raise notice 'OK start_dm: el alumno abrió un DM normal con el bot (% miembros)', v_members;
end $$;

-- =========================================================================
-- 4) El trigger notify_ai_bot_on_message no rompe el insert en ninguna
--    dirección (hacia el bot, o del bot hacia el alumno) aunque pg_net no
--    esté disponible en este entorno de prueba.
-- =========================================================================
do $$
declare
  v_student  uuid := (select id from t_ids where key = 'student');
  v_bot_prof uuid := (select id from t_ids where key = 'tutor_bot_profile');
  v_conv     uuid := (select id from t_ids where key = 'conversation');
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_student, 'role', 'authenticated')::text, true);
  insert into public.messages (conversation_id, sender_id, body)
  values (v_conv, v_student, '¿Cuándo abren las postulaciones a becas?');
  reset role;
  raise notice 'OK notify_ai_bot_on_message: insertar hacia el bot no rompe (dispara el trigger)';

  -- Simula la respuesta del bot (lo que haría la Edge Function con la
  -- service_role): el trigger debe detectar sender_id = bot y NO reintentar.
  insert into public.messages (conversation_id, sender_id, body)
  values (v_conv, v_bot_prof, 'Las postulaciones abren el 1 de abril. Revisa las guías en el Q&A.');
  raise notice 'OK notify_ai_bot_on_message: insertar desde el bot no rompe (evita el loop)';

  if (select count(*) from public.messages where conversation_id = v_conv) <> 2 then
    raise exception 'FAIL: no quedaron los 2 mensajes esperados en la conversación';
  end if;
end $$;

rollback;
