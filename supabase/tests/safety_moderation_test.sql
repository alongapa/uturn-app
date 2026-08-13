-- =====================================================================
-- Unities — Sesión 9: seguridad, confianza y moderación.
--
-- Prueba end-to-end, sin salir de la base:
--   1) Seguridad en viaje: compartir en vivo (token público) + SOS avisa a admins.
--   2) Reportar → moderar → sancionar (suspensión gatea reserve_seat) → levantar.
--   3) Moderación de contenido: filtro de palabras rechaza un post; moderate_content
--      elimina un post reportado.
--   4) Bloqueo mutuo: impide abrir DM en cualquier dirección.
--   5) Identidad: credencial pasa a revisión y review_credential la aprueba con
--      vencimiento semestral; verificación reforzada exigida gatea publicar viaje.
--   6) Privacidad: export_my_data del propio usuario; get_public_profile respeta
--      la visibilidad oculta.
--
-- Cómo correrlo (sandbox local):
--   supabase start && supabase db reset
--   psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" \
--        -f supabase/tests/safety_moderation_test.sql
--
-- Todo corre dentro de una transacción con ROLLBACK final: NO deja datos.
-- Cada paso hace RAISE NOTICE 'OK …'; cualquier invariante rota aborta con FAIL.
-- =====================================================================

begin;

do $$
declare
  v_owner    uuid := gen_random_uuid();
  v_driver   uuid := gen_random_uuid();
  v_pax      uuid := gen_random_uuid();
  v_other    uuid := gen_random_uuid();
  -- Usuario sin ninguna relación con el resto (ni viaje, ni reserva, ni rol):
  -- es el único actor válido para probar que un perfil oculto NO se ve.
  v_stranger uuid := gen_random_uuid();
  v_vehicle  uuid;
  v_trip     uuid;
  v_booking  uuid;
  v_share    public.trip_live_shares;
  v_share_json jsonb;
  v_alert    public.sos_alerts;
  v_report   public.reports;
  v_caught   boolean;
  v_tmp      int;
  v_export   jsonb;
  v_pubprofile jsonb;
  v_post     uuid;
begin
  -- ---- Setup: owner + conductor + 2 pasajeros -------------------------------
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at, email_confirmed_at)
  values
    (v_owner,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner9@alumnos.uai.cl',  now(), now(), now()),
    (v_driver, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'driver9@alumnos.uai.cl', now(), now(), now()),
    (v_pax,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pax9@alumnos.uai.cl',    now(), now(), now()),
    (v_other,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other9@alumnos.uai.cl',  now(), now(), now()),
    (v_stranger, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stranger9@alumnos.uai.cl', now(), now(), now());

  update public.profiles set account_role = 'owner' where id = v_owner;

  insert into public.vehicles (id, owner_id, brand, model, year, color, plate, seat_capacity)
  values (gen_random_uuid(), v_driver, 'Mazda', '3', 2020, 'Rojo', 'ABCD12', 4)
  returning id into v_vehicle;

  insert into public.trips (id, driver_id, vehicle_id, origin_campus_name, destination_campus_name,
                            origin_lat, origin_lng, destination_lat, destination_lng,
                            departs_at, price_clp, seats_total)
  values (gen_random_uuid(), v_driver, v_vehicle, 'Peñalolén', 'San Joaquín',
          -33.5, -70.5, -33.45, -70.62, now() + interval '2 days', 2000, 4)
  returning id into v_trip;

  perform set_config('request.jwt.claims', json_build_object('sub', v_pax, 'role', 'authenticated')::text, true);
  v_booking := (public.reserve_seat(v_trip)).id;
  raise notice 'OK setup: owner, conductor, pasajero con reserva y un tercero';

  -- ================================================================
  -- 1) SEGURIDAD EN VIAJE: compartir en vivo + SOS
  -- ================================================================
  -- El pasajero comparte su viaje (tiene reserva no cancelada).
  v_share := public.start_trip_share(v_trip, 'Mamá', '+56900000000');
  if v_share.share_token is null then raise exception 'FAIL share: no se creó el token'; end if;
  perform public.update_trip_share_location(v_trip, -33.48, -70.55);

  -- Lectura pública por token (contexto anónimo, sin sub): ve conductor y patente.
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  v_share_json := public.get_live_share(v_share.share_token);
  if v_share_json->>'vehiclePlate' <> 'ABCD12' or (v_share_json->>'active')::boolean is not true then
    raise exception 'FAIL share: get_live_share no devolvió los datos del vehículo (%)', v_share_json;
  end if;
  raise notice 'OK share: token público muestra conductor/patente y última posición';

  -- SOS del pasajero: crea la alerta y notifica al owner (sin pasar por prefs).
  perform set_config('request.jwt.claims', json_build_object('sub', v_pax, 'role', 'authenticated')::text, true);
  v_alert := public.trigger_sos(v_trip, -33.48, -70.55);
  if v_alert.status <> 'activa' then raise exception 'FAIL SOS: la alerta no quedó activa'; end if;
  select count(*) into v_tmp from public.notifications where user_id = v_owner and type = 'sos_alerta';
  if v_tmp < 1 then raise exception 'FAIL SOS: el owner no fue notificado'; end if;

  -- El owner la resuelve; un no-admin no puede.
  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  v_caught := false;
  begin perform public.resolve_sos(v_alert.id, 'atendida'); exception when others then v_caught := true; end;
  if not v_caught then raise exception 'FAIL SOS: un no-admin resolvió la alerta'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  perform public.resolve_sos(v_alert.id, 'atendida', 'Todo bien');
  raise notice 'OK SOS: alerta activa notifica al owner; solo admin/owner la resuelve';

  -- ================================================================
  -- 2) REPORTE → MODERACIÓN → SANCIÓN → LEVANTAR
  -- ================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', v_pax, 'role', 'authenticated')::text, true);
  v_report := public.report_target('usuario', 'acoso', v_other, null, 'Me molestó por chat');
  if v_report.status <> 'pendiente' then raise exception 'FAIL reporte: no quedó pendiente'; end if;

  -- Un usuario común NO ve la bandeja.
  v_caught := false;
  begin perform public.list_reports(); exception when others then v_caught := true; end;
  -- list_reports no lanza excepción (can_moderate false → 0 filas), así que
  -- validamos que el pasajero solo ve SU propio reporte por RLS directa.
  select count(*) into v_tmp from public.reports;
  if v_tmp <> 1 then raise exception 'FAIL reporte: el reportante debería ver solo el suyo (vio %)', v_tmp; end if;

  -- El owner ve el reporte y sanciona con suspensión de 2 días.
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  select count(*) into v_tmp from public.list_reports('pendiente');
  if v_tmp <> 1 then raise exception 'FAIL bandeja: el owner no ve el reporte (%)', v_tmp; end if;
  perform public.apply_moderation_action(v_other, 'suspension', 'Acoso reiterado', 2, v_report.id);

  -- El reporte quedó resuelto y el usuario suspendido.
  select status into v_report.status from public.reports where id = v_report.id;
  if v_report.status <> 'resuelto' then raise exception 'FAIL sanción: el reporte no se cerró'; end if;
  select count(*) into v_tmp from public.profiles
   where id = v_other and moderation_status = 'suspendido' and moderation_until > now();
  if v_tmp <> 1 then raise exception 'FAIL sanción: el usuario no quedó suspendido'; end if;

  -- El suspendido NO puede reservar (reserve_seat lo bloquea).
  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  v_caught := false;
  begin perform public.reserve_seat(v_trip); exception when others then v_caught := true; end;
  if not v_caught then raise exception 'FAIL sanción: un usuario suspendido pudo reservar'; end if;
  raise notice 'OK sanción: reporte→suspensión cierra el reporte y bloquea reservar';

  -- El owner levanta la sanción.
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  perform public.apply_moderation_action(v_other, 'levantar_sancion', 'Apeló con éxito');
  select count(*) into v_tmp from public.profiles where id = v_other and moderation_status = 'activo';
  if v_tmp <> 1 then raise exception 'FAIL sanción: no se levantó la suspensión'; end if;
  raise notice 'OK sanción: levantar_sancion reactiva la cuenta';

  -- ================================================================
  -- 3) MODERACIÓN DE CONTENIDO: filtro de palabras + eliminar post
  -- ================================================================
  -- Seed de una palabra bloqueada y un publisher/post del owner.
  insert into public.blocked_words (word) values ('palabrota') on conflict do nothing;
  insert into public.publishers (id, slug, name, kind, university_id)
  values (gen_random_uuid(), 'test-fed-9', 'Fed Test 9', 'federacion', 'uai')
  returning id into v_post;  -- reutilizamos v_post como publisher_id temporal

  -- Post con palabra bloqueada → rechazado por el trigger.
  v_caught := false;
  begin
    insert into public.posts (publisher_id, author_id, post_type, body)
    values (v_post, v_owner, 'noticia', 'esto es una palabrota en el feed');
  exception when others then v_caught := true; end;
  if not v_caught then raise exception 'FAIL filtro: un post con palabra bloqueada se publicó'; end if;
  raise notice 'OK filtro: el filtro de palabras rechaza el post';

  -- Post limpio → se publica; se reporta; el owner lo elimina vía moderate_content.
  insert into public.posts (publisher_id, author_id, post_type, body)
  values (v_post, v_owner, 'noticia', 'post limpio')
  returning id into v_post;

  perform set_config('request.jwt.claims', json_build_object('sub', v_pax, 'role', 'authenticated')::text, true);
  v_report := public.report_target('post', 'spam', null, v_post, 'spam');

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  perform public.moderate_content(v_report.id, true);
  select count(*) into v_tmp from public.posts where id = v_post;
  if v_tmp <> 0 then raise exception 'FAIL moderación: el post reportado no se eliminó'; end if;
  raise notice 'OK moderación: moderate_content elimina el post reportado';

  -- ================================================================
  -- 4) BLOQUEO MUTUO: impide abrir DM en cualquier dirección
  -- ================================================================
  -- pax y other comparten viaje confirmado, así que sin bloqueo PODRÍAN chatear.
  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  perform public.reserve_seat(v_trip);  -- ya no está suspendido; comparte trip con pax

  -- pax bloquea a other.
  perform set_config('request.jwt.claims', json_build_object('sub', v_pax, 'role', 'authenticated')::text, true);
  insert into public.user_blocks (blocker_id, blocked_id) values (v_pax, v_other);

  -- other (el bloqueado) no puede abrir DM con pax.
  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  v_caught := false;
  begin perform public.start_dm(v_pax); exception when others then v_caught := true; end;
  if not v_caught then raise exception 'FAIL bloqueo: el bloqueado pudo abrir un DM'; end if;

  -- pax (el bloqueador) tampoco (bloqueo mutuo).
  perform set_config('request.jwt.claims', json_build_object('sub', v_pax, 'role', 'authenticated')::text, true);
  v_caught := false;
  begin perform public.start_dm(v_other); exception when others then v_caught := true; end;
  if not v_caught then raise exception 'FAIL bloqueo: el bloqueador pudo abrir un DM (no es mutuo)'; end if;
  raise notice 'OK bloqueo: el bloqueo impide abrir DM en ambos sentidos';

  -- ================================================================
  -- 5) IDENTIDAD: credencial a revisión + aprobación con vencimiento;
  --    verificación reforzada de conductor exigida gatea publicar viaje.
  -- ================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
  perform public.submit_credential_review();
  select count(*) into v_tmp from public.profiles
   where id = v_driver and credential_review_status = 'en_revision';
  if v_tmp <> 1 then raise exception 'FAIL credencial: no quedó en revisión'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  perform public.review_credential(v_driver, true, 'Todo ok');
  select count(*) into v_tmp from public.profiles
   where id = v_driver and credential_verified and credential_expires_at > now() + interval '5 months';
  if v_tmp <> 1 then raise exception 'FAIL credencial: no se aprobó con vencimiento semestral'; end if;
  raise notice 'OK credencial: submit→review aprueba con vencimiento semestral';

  -- El owner exige verificación reforzada de conductor.
  perform public.update_platform_config(null, null, null, true);
  -- El conductor (sin verificación aprobada) no puede publicar un viaje nuevo.
  perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
  v_caught := false;
  begin
    insert into public.trips (driver_id, origin_campus_name, destination_campus_name,
                              origin_lat, origin_lng, destination_lat, destination_lng,
                              departs_at, price_clp, seats_total)
    values (v_driver, 'A', 'B', -33.5, -70.5, -33.4, -70.6, now() + interval '1 day', 1000, 3);
  exception when others then v_caught := true; end;
  if not v_caught then raise exception 'FAIL conductor: publicó viaje sin verificación reforzada exigida'; end if;

  -- Sube y le aprueban la verificación → ya puede publicar.
  perform public.submit_driver_verification('driver/cedula.jpg', 'driver/licencia.jpg');
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  perform public.review_driver_verification(v_driver, true, 'ok');
  perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
  insert into public.trips (driver_id, origin_campus_name, destination_campus_name,
                            origin_lat, origin_lng, destination_lat, destination_lng,
                            departs_at, price_clp, seats_total)
  values (v_driver, 'A', 'B', -33.5, -70.5, -33.4, -70.6, now() + interval '1 day', 1000, 3);
  raise notice 'OK conductor: verificación reforzada exigida gatea publicar y su aprobación lo habilita';

  -- ================================================================
  -- 6) PRIVACIDAD: export + visibilidad de perfil
  -- ================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', v_pax, 'role', 'authenticated')::text, true);
  v_export := public.export_my_data();
  if v_export->'profile'->>'id' <> v_pax::text then
    raise exception 'FAIL export: export_my_data no devolvió el propio perfil';
  end if;
  if jsonb_array_length(v_export->'bookings') < 1 then
    raise exception 'FAIL export: faltan las reservas del usuario';
  end if;
  raise notice 'OK privacidad: export_my_data entrega los datos del propio usuario';

  -- other oculta su perfil; admin y compañeros de viaje igual lo ven;
  -- pero un tercero sin relación no.
  --
  -- Ojo: el tercero NO puede ser v_driver ni v_pax. Para entonces v_other ya
  -- reservó en el viaje de v_driver (paso 4), así que ambos comparten un viaje
  -- confirmado y shares_confirmed_trip() los deja ver el perfil con razón.
  -- Por eso el chequeo usa v_stranger, que no comparte viaje con nadie.
  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  update public.profiles set profile_visibility = 'oculto' where id = v_other;

  -- El owner (admin) siempre lo ve.
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  v_pubprofile := public.get_public_profile(v_other);
  if (v_pubprofile->>'hidden') is not null then
    raise exception 'FAIL privacidad: el admin no pudo ver el perfil oculto';
  end if;

  -- El conductor SÍ lo ve: v_other viaja en su auto (viaje confirmado).
  perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
  v_pubprofile := public.get_public_profile(v_other);
  if (v_pubprofile->>'hidden') is not null then
    raise exception 'FAIL privacidad: el conductor no vio el perfil de su propio pasajero';
  end if;

  -- El desconocido (sin viaje compartido) recibe hidden=true.
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger, 'role', 'authenticated')::text, true);
  v_pubprofile := public.get_public_profile(v_other);
  if (v_pubprofile->>'hidden')::boolean is not true then
    raise exception 'FAIL privacidad: un tercero sin relación vio un perfil oculto';
  end if;
  raise notice 'OK privacidad: perfil oculto solo visible para admin y compañeros de viaje';

  raise notice '===== SEGURIDAD + MODERACIÓN OK =====';
end;
$$;

rollback;
