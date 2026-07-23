-- =====================================================================
-- Unities — Sesión "Perfil novedades jóvenes": insignias y referidos.
--
-- Prueba, sin salir de la base: canje de código de invitación + antiabuso
-- (autorreferido, código repetido, código inválido); bono de referido
-- disparado SOLO en el primer viaje pagado del invitado (y no en el
-- segundo); y sincronización de insignias al alcanzar una racha.
--
-- Cómo correrlo (sandbox local):
--   supabase start
--   supabase db reset
--   psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" \
--        -f supabase/tests/gamification_referrals_test.sql
--
-- Todo corre dentro de una transacción con ROLLBACK final: NO deja datos.
-- Cada paso hace RAISE NOTICE 'OK …'; cualquier invariante rota aborta con FAIL.
-- =====================================================================

begin;

do $$
declare
  v_driver       uuid := gen_random_uuid();
  v_referrer     uuid := gen_random_uuid();
  v_invitee      uuid := gen_random_uuid();
  v_streak_user  uuid := gen_random_uuid();
  v_referrer_code text;
  v_trip1 uuid; v_trip2 uuid; v_trip3 uuid; v_trip4 uuid; v_trip5 uuid;
  v_booking uuid;
  v_referral public.referrals;
  v_credits int;
  v_bono_count int;
  v_caught boolean;
  v_tmp int;
begin
  -- ---- Setup: 4 usuarios (auth.users → profiles vía handle_new_user) ----
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at, email_confirmed_at)
  values
    (v_driver,      '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'conductor2@alumnos.uai.cl', now(), now(), now()),
    (v_referrer,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'referrer@alumnos.uai.cl',   now(), now(), now()),
    (v_invitee,     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'invitado@alumnos.uai.cl',   now(), now(), now()),
    (v_streak_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'racha@alumnos.uai.cl',      now(), now(), now());

  select referral_code into v_referrer_code from public.profiles where id = v_referrer;
  if v_referrer_code is null or length(v_referrer_code) <> 6 then
    raise exception 'FAIL setup: referral_code del referrer inválido (%)', v_referrer_code;
  end if;
  raise notice 'OK setup: 4 perfiles creados; código del referrer = %', v_referrer_code;

  -- ================================================================
  -- 1) CANJE DE CÓDIGO + ANTIABUSO
  -- ================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', v_invitee, 'role', 'authenticated')::text, true);
  v_referral := public.redeem_referral_code(v_referrer_code);
  if v_referral.status <> 'pendiente' or v_referral.referrer_id <> v_referrer then
    raise exception 'FAIL canje: estado % referrer %', v_referral.status, v_referral.referrer_id;
  end if;
  raise notice 'OK canje: referral pendiente creado (invitado=%, referrer=%)', v_invitee, v_referrer;

  -- Antiabuso: el mismo invitado no puede canjear un segundo código.
  v_caught := false;
  begin
    perform public.redeem_referral_code(v_referrer_code);
  exception when others then
    v_caught := true;
  end;
  if not v_caught then raise exception 'FAIL antiabuso: el invitado pudo canjear dos códigos'; end if;
  raise notice 'OK antiabuso: un invitado no puede canjear dos códigos';

  -- Antiabuso: autorreferido.
  perform set_config('request.jwt.claims', json_build_object('sub', v_referrer, 'role', 'authenticated')::text, true);
  v_caught := false;
  begin
    perform public.redeem_referral_code(v_referrer_code);
  exception when others then
    v_caught := true;
  end;
  if not v_caught then raise exception 'FAIL antiabuso: se pudo autorreferir'; end if;
  raise notice 'OK antiabuso: no se puede usar el propio código';

  -- Antiabuso: código inexistente.
  perform set_config('request.jwt.claims', json_build_object('sub', v_streak_user, 'role', 'authenticated')::text, true);
  v_caught := false;
  begin
    perform public.redeem_referral_code('ZZZZZZ');
  exception when others then
    v_caught := true;
  end;
  if not v_caught then raise exception 'FAIL antiabuso: código inexistente fue aceptado'; end if;
  raise notice 'OK antiabuso: código inexistente rechazado';

  -- ================================================================
  -- 2) VIAJES del conductor (5: 2 para el invitado, 3 para la racha)
  -- ================================================================
  insert into public.trips (id, driver_id, origin_campus_name, destination_campus_name,
                            origin_lat, origin_lng, destination_lat, destination_lng,
                            departs_at, price_clp, seats_total)
  values
    (gen_random_uuid(), v_driver, 'Peñalolén', 'San Joaquín', -33.5, -70.5, -33.45, -70.62, now() + interval '2 days', 2000, 4)
  returning id into v_trip1;
  insert into public.trips (id, driver_id, origin_campus_name, destination_campus_name,
                            origin_lat, origin_lng, destination_lat, destination_lng,
                            departs_at, price_clp, seats_total)
  values
    (gen_random_uuid(), v_driver, 'Peñalolén', 'San Joaquín', -33.5, -70.5, -33.45, -70.62, now() + interval '3 days', 2000, 4)
  returning id into v_trip2;
  insert into public.trips (id, driver_id, origin_campus_name, destination_campus_name,
                            origin_lat, origin_lng, destination_lat, destination_lng,
                            departs_at, price_clp, seats_total)
  values (gen_random_uuid(), v_driver, 'Peñalolén', 'San Joaquín', -33.5, -70.5, -33.45, -70.62, now() + interval '4 days', 2000, 4)
  returning id into v_trip3;
  insert into public.trips (id, driver_id, origin_campus_name, destination_campus_name,
                            origin_lat, origin_lng, destination_lat, destination_lng,
                            departs_at, price_clp, seats_total)
  values (gen_random_uuid(), v_driver, 'Peñalolén', 'San Joaquín', -33.5, -70.5, -33.45, -70.62, now() + interval '5 days', 2000, 4)
  returning id into v_trip4;
  insert into public.trips (id, driver_id, origin_campus_name, destination_campus_name,
                            origin_lat, origin_lng, destination_lat, destination_lng,
                            departs_at, price_clp, seats_total)
  values (gen_random_uuid(), v_driver, 'Peñalolén', 'San Joaquín', -33.5, -70.5, -33.45, -70.62, now() + interval '6 days', 2000, 4)
  returning id into v_trip5;
  raise notice 'OK viajes: 5 viajes creados por el conductor';

  -- ================================================================
  -- 3) PRIMER VIAJE PAGADO DEL INVITADO → dispara el bono de referido
  -- ================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', v_invitee, 'role', 'authenticated')::text, true);
  v_booking := (public.reserve_seat(v_trip1)).id;

  perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
  perform public.confirm_payment_received(v_booking);

  select * into v_referral from public.referrals where referred_user_id = v_invitee;
  if v_referral.status <> 'completado' or v_referral.credited_at is null then
    raise exception 'FAIL bono: referral no quedó completado (estado %)', v_referral.status;
  end if;

  select coalesce(sum(case when entry_type = 'abono' then amount else -amount end), 0)
    into v_credits from public.credit_transactions where user_id = v_invitee;
  if v_credits < 125 then  -- 25 por pago a tiempo + 100 de bono
    raise exception 'FAIL bono: saldo del invitado % (esperaba >= 125)', v_credits;
  end if;
  select coalesce(sum(case when entry_type = 'abono' then amount else -amount end), 0)
    into v_credits from public.credit_transactions where user_id = v_referrer;
  if v_credits < 100 then
    raise exception 'FAIL bono: saldo del referrer % (esperaba >= 100)', v_credits;
  end if;
  raise notice 'OK bono: +100 créditos para invitado y referrer en el primer viaje pagado';

  -- ================================================================
  -- 4) SEGUNDO VIAJE PAGADO DEL INVITADO → NO debe repetir el bono
  -- ================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', v_invitee, 'role', 'authenticated')::text, true);
  v_booking := (public.reserve_seat(v_trip2)).id;

  perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
  perform public.confirm_payment_received(v_booking);

  select count(*) into v_bono_count from public.credit_transactions
  where user_id = v_invitee and source = 'bono';
  if v_bono_count <> 1 then
    raise exception 'FAIL antiabuso: el invitado recibió el bono % veces (esperaba 1)', v_bono_count;
  end if;
  select count(*) into v_bono_count from public.credit_transactions
  where user_id = v_referrer and source = 'bono';
  if v_bono_count <> 1 then
    raise exception 'FAIL antiabuso: el referrer recibió el bono % veces (esperaba 1)', v_bono_count;
  end if;
  raise notice 'OK antiabuso: el segundo viaje pagado del invitado no repite el bono';

  -- ================================================================
  -- 5) INSIGNIAS: 3 pagos a tiempo seguidos → 'pagador-confiable'
  -- ================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', v_streak_user, 'role', 'authenticated')::text, true);
  v_booking := (public.reserve_seat(v_trip3)).id;
  perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
  perform public.confirm_payment_received(v_booking);

  perform set_config('request.jwt.claims', json_build_object('sub', v_streak_user, 'role', 'authenticated')::text, true);
  v_booking := (public.reserve_seat(v_trip4)).id;
  perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
  perform public.confirm_payment_received(v_booking);

  perform set_config('request.jwt.claims', json_build_object('sub', v_streak_user, 'role', 'authenticated')::text, true);
  v_booking := (public.reserve_seat(v_trip5)).id;
  perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
  perform public.confirm_payment_received(v_booking);

  select count(*) into v_tmp from public.user_badges
  where user_id = v_streak_user and badge_id = 'pagador-confiable';
  if v_tmp <> 1 then
    raise exception 'FAIL insignias: pagador-confiable no se desbloqueó tras 3 pagos a tiempo';
  end if;
  select count(*) into v_tmp from public.user_badges
  where user_id = v_streak_user and badge_id = 'puntualidad-oro';
  if v_tmp <> 0 then
    raise exception 'FAIL insignias: puntualidad-oro se desbloqueó antes de tiempo (umbral 10)';
  end if;
  raise notice 'OK insignias: pagador-confiable desbloqueada a los 3 pagos a tiempo; puntualidad-oro sigue bloqueada';

  raise notice '===== GAMIFICACIÓN + REFERIDOS OK =====';
end;
$$;

rollback;
