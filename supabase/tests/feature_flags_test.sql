-- =====================================================================
-- Unities — Sesión 10: prueba end-to-end de los feature flags.
--
-- La pregunta que responde: ¿puede alguien que no es owner apagarle un
-- módulo a toda la plataforma? Si la respuesta fuera sí, un admin de
-- federación podría dejar sin pagos a toda la app.
--
-- Verifica, impersonando cuentas reales por RLS:
--   1) lectura: cualquier autenticado ve las banderas (el cliente las
--      necesita al arrancar);
--   2) escritura: un alumno NO puede apagar una bandera;
--   3) escritura: un admin (que no es owner) tampoco — el alcance de admin es
--      su publisher, no la plataforma;
--   4) escritura: el owner sí;
--   5) el trigger deja constancia de quién y cuándo tocó el interruptor;
--   6) nadie que no sea owner puede insertar ni borrar banderas;
--   7) anon no ve nada.
--
-- Cómo correrlo (sandbox local):
--   supabase start && supabase db reset
--   psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" \
--        -f supabase/tests/feature_flags_test.sql
--
-- Todo corre dentro de una transacción con ROLLBACK final: NO deja datos.
-- =====================================================================

begin;

-- UUIDs fijos:  a001 owner · a002 admin · a003 alumno
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at, email_confirmed_at)
values
  ('00000000-0000-4000-b000-00000000a001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-ff@alumnos.uai.cl',  now(), now(), now()),
  ('00000000-0000-4000-b000-00000000a002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-ff@alumnos.uai.cl',  now(), now(), now()),
  ('00000000-0000-4000-b000-00000000a003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alumno-ff@alumnos.uai.cl', now(), now(), now())
on conflict (id) do nothing;

-- El trigger de auth crea los profiles; acá solo se fijan los roles.
update public.profiles set account_role = 'owner' where id = '00000000-0000-4000-b000-00000000a001';
update public.profiles set account_role = 'admin' where id = '00000000-0000-4000-b000-00000000a002';
update public.profiles set account_role = 'user'  where id = '00000000-0000-4000-b000-00000000a003';

-- Bandera de prueba propia: no se toca ninguna real por si el ROLLBACK fallara.
insert into public.feature_flags (key, enabled, description)
values ('_test_flag', true, 'Bandera de prueba del test de la Sesión 10')
on conflict (key) do update set enabled = true;

-- =========================================================================
-- 1) Lectura: cualquier autenticado ve las banderas
-- =========================================================================
set local role authenticated;

do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-b000-00000000a003', 'role', 'authenticated')::text, true);

  if not exists (select 1 from public.feature_flags where key = '_test_flag') then
    raise exception 'FAIL lectura: un alumno autenticado no ve las banderas';
  end if;
end $$;

-- =========================================================================
-- 2) y 3) Escritura denegada a quien no es owner
--
-- Ojo con la forma de la aserción: la RLS de UPDATE no lanza excepción,
-- simplemente no afecta filas. Comprobar "no explotó" daría un falso verde;
-- lo que se mide es que el valor NO haya cambiado.
-- =========================================================================
do $$
declare
  v_enabled boolean;
begin
  -- Alumno
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-b000-00000000a003', 'role', 'authenticated')::text, true);
  update public.feature_flags set enabled = false where key = '_test_flag';

  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-b000-00000000a001', 'role', 'authenticated')::text, true);
  select enabled into v_enabled from public.feature_flags where key = '_test_flag';
  if v_enabled is distinct from true then
    raise exception 'FAIL escritura: un alumno apagó una bandera';
  end if;

  -- Admin (no owner)
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-b000-00000000a002', 'role', 'authenticated')::text, true);
  update public.feature_flags set enabled = false where key = '_test_flag';

  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-b000-00000000a001', 'role', 'authenticated')::text, true);
  select enabled into v_enabled from public.feature_flags where key = '_test_flag';
  if v_enabled is distinct from true then
    raise exception 'FAIL escritura: un admin de federación apagó un módulo de toda la plataforma';
  end if;
end $$;

-- =========================================================================
-- 4) y 5) El owner sí puede, y queda la huella
-- =========================================================================
do $$
declare
  v_enabled boolean;
  v_by      uuid;
  v_at      timestamptz;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-b000-00000000a001', 'role', 'authenticated')::text, true);

  update public.feature_flags set enabled = false where key = '_test_flag';

  select enabled, updated_by, updated_at
    into v_enabled, v_by, v_at
    from public.feature_flags where key = '_test_flag';

  if v_enabled is distinct from false then
    raise exception 'FAIL escritura: el owner no pudo apagar la bandera';
  end if;

  if v_by is distinct from '00000000-0000-4000-b000-00000000a001'::uuid then
    raise exception 'FAIL auditoría: updated_by no registró al owner (quedó %)', v_by;
  end if;

  if v_at < now() - interval '1 minute' then
    raise exception 'FAIL auditoría: updated_at no se actualizó';
  end if;
end $$;

-- =========================================================================
-- 6) Insertar y borrar banderas también es solo del owner
-- =========================================================================
do $$
declare
  v_caught boolean := false;
  v_count  int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-b000-00000000a002', 'role', 'authenticated')::text, true);

  begin
    insert into public.feature_flags (key, enabled, description)
    values ('_test_flag_admin', true, 'no debería existir');
  exception when others then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'FAIL insert: un admin creó una bandera';
  end if;

  -- Borrar: igual que el update, la RLS filtra en silencio.
  delete from public.feature_flags where key = '_test_flag';

  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-b000-00000000a001', 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.feature_flags where key = '_test_flag';
  if v_count <> 1 then
    raise exception 'FAIL delete: un admin borró una bandera';
  end if;
end $$;

-- =========================================================================
-- 7) anon no ve nada
-- =========================================================================
reset role;
set local role anon;

do $$
declare
  v_count int;
begin
  perform set_config('request.jwt.claims', null, true);
  select count(*) into v_count from public.feature_flags;
  if v_count <> 0 then
    raise exception 'FAIL anon: una sesión sin autenticar ve % banderas', v_count;
  end if;
end $$;

reset role;

select 'feature_flags: todas las aserciones pasaron' as resultado;

rollback;
