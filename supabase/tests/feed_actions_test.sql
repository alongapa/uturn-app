-- =====================================================================
-- Unities — Sesión 10: prueba end-to-end de las acciones sobre
-- publicaciones del feed (eliminar, editar, reportar, silenciar).
--
-- Verifica, impersonando cuentas reales por RLS:
--   1) editar: solo el autor (ni un admin puede reescribir texto ajeno);
--   2) eliminar: autor sí; alumno no; admin de OTRO publisher no; admin
--      miembro del publisher sí; owner siempre;
--   3) borrado lógico: la fila sobrevive, el alumno no la ve, el moderador sí;
--   4) las respuestas de un post borrado se ocultan con él;
--   5) reportar: un alumno reporta; el mismo alumno no puede reportar dos
--      veces (índice único); nadie reporta lo propio;
--   6) silenciar: cada quien ve solo sus silencios;
--   7) moderate_content deja el post en blando, no lo borra en duro;
--   8) edited_at lo pone el trigger en CUALQUIER cambio de body (no solo por
--      edit_post) y NO se dispara al mover contadores (like).
--
-- Cómo correrlo (sandbox local):
--   supabase start && supabase db reset
--   psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" \
--        -f supabase/tests/feed_actions_test.sql
--
-- Todo corre dentro de una transacción con ROLLBACK final: NO deja datos.
-- =====================================================================

begin;

-- UUIDs fijos (literales, sin \set de psql: así el archivo corre igual por
-- psql, por el SQL Editor y por las herramientas MCP).
--   d001 owner · d002 admin miembro de A · d003 admin miembro de B
--   d004 autor (tutor) · d005 alumno · d006 tutor moderador
--   e001 publisher A · e002 publisher B · f001/f002/f003 posts

-- =========================================================================
-- Setup (como postgres, saltando RLS)
-- =========================================================================
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at, email_confirmed_at)
values
  ('00000000-0000-4000-a000-00000000d001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-s10@alumnos.uai.cl',    now(), now(), now()),
  ('00000000-0000-4000-a000-00000000d002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'adminok-s10@alumnos.uai.cl',  now(), now(), now()),
  ('00000000-0000-4000-a000-00000000d003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'adminbad-s10@alumnos.uai.cl', now(), now(), now()),
  ('00000000-0000-4000-a000-00000000d004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'autor-s10@alumnos.uai.cl',    now(), now(), now()),
  ('00000000-0000-4000-a000-00000000d005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alumno-s10@alumnos.uai.cl',   now(), now(), now()),
  ('00000000-0000-4000-a000-00000000d006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tutormod-s10@alumnos.uai.cl', now(), now(), now());

update public.profiles set account_role = 'owner' where id = '00000000-0000-4000-a000-00000000d001';
update public.profiles set account_role = 'admin', university_id = 'uai'
  where id in ('00000000-0000-4000-a000-00000000d002', '00000000-0000-4000-a000-00000000d003');
update public.profiles set account_role = 'tutor', university_id = 'uai'
  where id in ('00000000-0000-4000-a000-00000000d004', '00000000-0000-4000-a000-00000000d006');
update public.profiles set account_role = 'user', university_id = 'uai'
  where id = '00000000-0000-4000-a000-00000000d005';

insert into public.publishers (id, slug, name, kind, university_id) values
  ('00000000-0000-4000-b000-00000000e001', 'test-s10-pub-a', 'Federación A (test S10)', 'federacion', 'uai'),
  ('00000000-0000-4000-b000-00000000e002', 'test-s10-pub-b', 'Federación B (test S10)', 'federacion', 'uai');

-- admin_ok administra SOLO el publisher A; admin_bad SOLO el B.
insert into public.publisher_members (publisher_id, user_id) values
  ('00000000-0000-4000-b000-00000000e001', '00000000-0000-4000-a000-00000000d002'),
  ('00000000-0000-4000-b000-00000000e002', '00000000-0000-4000-a000-00000000d003');

insert into public.posts (id, publisher_id, author_id, post_type, body) values
  ('00000000-0000-4000-c000-00000000f001', '00000000-0000-4000-b000-00000000e001', '00000000-0000-4000-a000-00000000d004', 'noticia', 'Texto original de la publicación'),
  ('00000000-0000-4000-c000-00000000f002', '00000000-0000-4000-b000-00000000e001', '00000000-0000-4000-a000-00000000d004', 'noticia', 'Segunda publicación para el caso owner');

insert into public.post_replies (post_id, user_id, body)
values ('00000000-0000-4000-c000-00000000f001', '00000000-0000-4000-a000-00000000d005', 'Una respuesta del alumno');

-- =========================================================================
-- 1) EDITAR — solo el autor
-- =========================================================================
do $$
declare v_caught boolean;
begin
  -- El alumno no edita.
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-a000-00000000d005', 'role', 'authenticated')::text, true);
  v_caught := false;
  begin perform public.edit_post('00000000-0000-4000-c000-00000000f001', 'secuestro del post'); exception when others then v_caught := true; end;
  if not v_caught then raise exception 'FAIL edit: un alumno editó un post ajeno'; end if;

  -- Un admin TAMPOCO edita texto ajeno (moderar es borrar, no reescribir).
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-a000-00000000d002', 'role', 'authenticated')::text, true);
  v_caught := false;
  begin perform public.edit_post('00000000-0000-4000-c000-00000000f001', 'reescrito por admin'); exception when others then v_caught := true; end;
  if not v_caught then raise exception 'FAIL edit: un admin reescribió texto ajeno'; end if;

  -- El autor sí.
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-a000-00000000d004', 'role', 'authenticated')::text, true);
  perform public.edit_post('00000000-0000-4000-c000-00000000f001', 'Texto YA EDITADO por su autor');

  if not exists (
    select 1 from public.posts
    where id = '00000000-0000-4000-c000-00000000f001'
      and body = 'Texto YA EDITADO por su autor' and edited_at is not null
  ) then
    raise exception 'FAIL edit: el autor no pudo editar o no se marcó edited_at';
  end if;
  raise notice 'OK editar: solo el autor; admin y alumno rechazados; edited_at marcado';
end;
$$;

-- =========================================================================
-- 2) edited_at por trigger: cualquier cambio de body lo marca; los
--    contadores (like) NO.
-- =========================================================================
do $$
declare
  v_before timestamptz;
  v_after  timestamptz;
begin
  -- (a) UPDATE crudo, sin pasar por edit_post: igual debe marcar.
  update public.posts set edited_at = null where id = '00000000-0000-4000-c000-00000000f002';
  update public.posts set body = 'cambiado por SQL directo' where id = '00000000-0000-4000-c000-00000000f002';
  select edited_at into v_after from public.posts where id = '00000000-0000-4000-c000-00000000f002';
  if v_after is null then
    raise exception 'FAIL edited_at: un UPDATE directo de body no marcó edited_at';
  end if;

  -- (b) mover un contador NO es editar.
  select edited_at into v_before from public.posts where id = '00000000-0000-4000-c000-00000000f002';
  insert into public.post_likes (post_id, user_id)
  values ('00000000-0000-4000-c000-00000000f002', '00000000-0000-4000-a000-00000000d005');
  select edited_at into v_after from public.posts where id = '00000000-0000-4000-c000-00000000f002';
  if v_after is distinct from v_before then
    raise exception 'FAIL edited_at: dar like marcó el post como editado';
  end if;
  raise notice 'OK edited_at: lo marca cualquier cambio de body; un like no lo toca';
end;
$$;

-- =========================================================================
-- 3) ELIMINAR — alcance por rol y por publisher
-- =========================================================================
do $$
declare v_caught boolean;
begin
  -- Alumno: no.
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-a000-00000000d005', 'role', 'authenticated')::text, true);
  v_caught := false;
  begin perform public.delete_post('00000000-0000-4000-c000-00000000f001'); exception when others then v_caught := true; end;
  if not v_caught then raise exception 'FAIL delete: un alumno borró un post ajeno'; end if;

  -- Admin de OTRO publisher: no (este es el caso del alcance por membresía).
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-a000-00000000d003', 'role', 'authenticated')::text, true);
  v_caught := false;
  begin perform public.delete_post('00000000-0000-4000-c000-00000000f001'); exception when others then v_caught := true; end;
  if not v_caught then raise exception 'FAIL delete: un admin borró contenido de un publisher que no administra'; end if;

  -- Owner: siempre (lo probamos sobre el segundo post).
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-a000-00000000d001', 'role', 'authenticated')::text, true);
  perform public.delete_post('00000000-0000-4000-c000-00000000f002');
  if not exists (select 1 from public.posts where id = '00000000-0000-4000-c000-00000000f002' and deleted_at is not null) then
    raise exception 'FAIL delete: el owner no pudo borrar';
  end if;

  -- Admin MIEMBRO del publisher: sí.
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-a000-00000000d002', 'role', 'authenticated')::text, true);
  perform public.delete_post('00000000-0000-4000-c000-00000000f001');

  -- Borrado LÓGICO: la fila sigue existiendo y las interacciones no se cayeron.
  if not exists (select 1 from public.posts where id = '00000000-0000-4000-c000-00000000f001' and deleted_at is not null) then
    raise exception 'FAIL delete: el admin miembro no pudo borrar';
  end if;
  if not exists (select 1 from public.post_replies where post_id = '00000000-0000-4000-c000-00000000f001') then
    raise exception 'FAIL delete: el borrado se llevó las respuestas (debería ser lógico)';
  end if;
  raise notice 'OK eliminar: alumno y admin ajeno rechazados; owner y admin miembro sí; borrado lógico conserva respuestas';
end;
$$;

-- =========================================================================
-- 4) VISIBILIDAD del borrado y de sus respuestas (RLS real, con SET ROLE)
-- =========================================================================
set local role authenticated;

-- --- como ALUMNO: no ve el post borrado ni su respuesta ---
set local request.jwt.claims = '{"sub":"00000000-0000-4000-a000-00000000d005","role":"authenticated"}';

do $$
begin
  if exists (select 1 from public.posts where id = '00000000-0000-4000-c000-00000000f001') then
    raise exception 'FAIL RLS: un alumno ve un post borrado';
  end if;
  if exists (select 1 from public.post_replies where post_id = '00000000-0000-4000-c000-00000000f001') then
    raise exception 'FAIL RLS: un alumno ve las respuestas de un post borrado';
  end if;
  raise notice 'OK RLS alumno: el post borrado y sus respuestas quedan ocultos';
end;
$$;

-- --- como TUTOR (moderador): sí los ve, para poder investigar ---
set local request.jwt.claims = '{"sub":"00000000-0000-4000-a000-00000000d006","role":"authenticated"}';

do $$
begin
  if not exists (select 1 from public.posts where id = '00000000-0000-4000-c000-00000000f001') then
    raise exception 'FAIL RLS: un moderador NO ve el post borrado (se pierde la auditoría)';
  end if;
  if not exists (select 1 from public.post_replies where post_id = '00000000-0000-4000-c000-00000000f001') then
    raise exception 'FAIL RLS: un moderador no ve las respuestas del post borrado';
  end if;
  raise notice 'OK RLS moderador: conserva la vista del contenido borrado';
end;
$$;

reset role;

-- =========================================================================
-- 5) REPORTAR — uno por usuario, nunca lo propio
-- =========================================================================
do $$
declare v_caught boolean;
begin
  -- El alumno reporta el post (aunque esté borrado: sigue siendo auditable).
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-a000-00000000d005', 'role', 'authenticated')::text, true);
  perform public.report_post('00000000-0000-4000-c000-00000000f001', 'spam', 'Se repite en todo el feed');

  if not exists (
    select 1 from public.reports
    where target_type = 'post' and target_id = '00000000-0000-4000-c000-00000000f001'
      and reporter_id = '00000000-0000-4000-a000-00000000d005' and status = 'pendiente'
  ) then
    raise exception 'FAIL report: el reporte no quedó registrado';
  end if;

  -- Segunda vez: rechazado por el índice único.
  v_caught := false;
  begin perform public.report_post('00000000-0000-4000-c000-00000000f001', 'acoso', null); exception when others then v_caught := true; end;
  if not v_caught then raise exception 'FAIL report: el mismo usuario reportó dos veces el mismo post'; end if;

  -- El autor no reporta lo suyo.
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-a000-00000000d004', 'role', 'authenticated')::text, true);
  v_caught := false;
  begin perform public.report_post('00000000-0000-4000-c000-00000000f001', 'spam', null); exception when others then v_caught := true; end;
  if not v_caught then raise exception 'FAIL report: el autor reportó su propia publicación'; end if;

  raise notice 'OK reportar: registrado una sola vez por usuario; el autor no puede reportarse';
end;
$$;

-- =========================================================================
-- 6) moderate_content deja el contenido en BLANDO (no borra la fila)
-- =========================================================================
do $$
declare
  v_report_id uuid;
  v_post_id   uuid := '00000000-0000-4000-c000-00000000f003';
begin
  insert into public.posts (id, publisher_id, author_id, post_type, body)
  values (v_post_id, '00000000-0000-4000-b000-00000000e001', '00000000-0000-4000-a000-00000000d004', 'noticia', 'Post que moderará un admin');

  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-a000-00000000d005', 'role', 'authenticated')::text, true);
  v_report_id := (public.report_post(v_post_id, 'contenido_inapropiado', null)).id;

  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-a000-00000000d002', 'role', 'authenticated')::text, true);
  perform public.moderate_content(v_report_id, true, 'retirado por el equipo');

  if not exists (select 1 from public.posts where id = v_post_id and deleted_at is not null) then
    raise exception 'FAIL moderate_content: el post no quedó en borrado lógico (¿se borró en duro?)';
  end if;
  if not exists (select 1 from public.reports where id = v_report_id and status = 'resuelto' and resolution = 'contenido_eliminado') then
    raise exception 'FAIL moderate_content: el reporte no se cerró correctamente';
  end if;
  raise notice 'OK moderate_content: borrado lógico + reporte resuelto, la fila sobrevive para auditoría';
end;
$$;

-- =========================================================================
-- 7) SILENCIAR — cada quien ve solo sus silencios
-- =========================================================================
do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-a000-00000000d005', 'role', 'authenticated')::text, true);
  perform public.mute_publisher('00000000-0000-4000-b000-00000000e001');
  perform public.mute_publisher('00000000-0000-4000-b000-00000000e001');  -- idempotente

  if (select count(*) from public.muted_publishers
      where user_id = '00000000-0000-4000-a000-00000000d005') <> 1 then
    raise exception 'FAIL mute: silenciar dos veces duplicó la fila';
  end if;
  raise notice 'OK silenciar: idempotente';
end;
$$;

set local role authenticated;

set local request.jwt.claims = '{"sub":"00000000-0000-4000-a000-00000000d004","role":"authenticated"}';
do $$
begin
  if exists (select 1 from public.muted_publishers where user_id = '00000000-0000-4000-a000-00000000d005') then
    raise exception 'FAIL RLS mute: un usuario ve los silencios de otro';
  end if;
  raise notice 'OK RLS silenciar: los silencios de un usuario son invisibles para el resto';
end;
$$;

reset role;

-- =========================================================================
-- 8) La escotilla de borrado FÍSICO quedó restringida al owner
-- =========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-a000-00000000d004","role":"authenticated"}';

do $$
declare v_deleted integer;
begin
  delete from public.posts where id = '00000000-0000-4000-c000-00000000f001';
  get diagnostics v_deleted = row_count;
  if v_deleted <> 0 then
    raise exception 'FAIL RLS: el autor pudo borrar la fila FÍSICAMENTE (debe ser lógico)';
  end if;
  raise notice 'OK RLS: el borrado físico ya no está al alcance del autor';
end;
$$;

reset role;

rollback;
