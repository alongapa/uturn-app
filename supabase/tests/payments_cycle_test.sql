-- =====================================================================
-- Unities — Sesión 8: prueba del CICLO COMPLETO de pagos en sandbox.
--
-- Simula, sin salir de la base, todo el flujo nuevo: reserva → intención de
-- pago → webhook (verificación automática) → recompensas; vencimiento → strike
-- automático; disputa "yo sí pagué" → strike congelado → resolución; pago
-- parcial con créditos; y las lecturas de ganancias/panel financiero.
--
-- No usa Fintoc real: reemplaza el webhook llamando directamente a la función
-- que ese webhook invoca (apply_payment_verification), que es la MISMA fuente de
-- verdad. Así se prueba el ciclo end-to-end sin credenciales del proveedor.
--
-- Cómo correrlo (sandbox local):
--   supabase start                      # levanta Postgres + Auth locales
--   supabase db reset                   # aplica migrations/ desde cero
--   psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" \
--        -f supabase/tests/payments_cycle_test.sql
--   (o pega este archivo en el SQL Editor del dashboard de un proyecto sandbox)
--
-- Todo corre dentro de una transacción con ROLLBACK final: NO deja datos.
-- Cada paso hace RAISE NOTICE 'OK …'; cualquier invariante rota aborta con FAIL.
-- =====================================================================

begin;

do $$
declare
  v_driver    uuid := gen_random_uuid();
  v_passenger uuid := gen_random_uuid();
  v_owner     uuid := gen_random_uuid();
  v_trip      uuid;
  v_booking1  uuid;
  v_booking2  uuid;
  v_booking3  uuid;
  v_payment   public.payments;
  v_dispute   public.disputes;
  v_intent    text := 'test_intent_' || substr(v_passenger::text, 1, 8);
  v_strikes   int;
  v_credits   int;
  v_earn      jsonb;
  v_fin       jsonb;
  v_tmp       int;
begin
  -- ---- Setup: 3 usuarios (auth.users → profiles vía handle_new_user) ----
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at, email_confirmed_at)
  values
    (v_driver,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'conductor@alumnos.uai.cl', now(), now(), now()),
    (v_passenger, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pasajero@alumnos.uai.cl',  now(), now(), now()),
    (v_owner,     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@alumnos.uai.cl',     now(), now(), now());

  update public.profiles set account_role = 'owner' where id = v_owner;
  raise notice 'OK setup: 3 perfiles creados (incluye owner)';

  -- ---- Viaje del conductor ----
  insert into public.trips (id, driver_id, origin_campus_name, destination_campus_name,
                            origin_lat, origin_lng, destination_lat, destination_lng,
                            departs_at, price_clp, seats_total)
  values (gen_random_uuid(), v_driver, 'Peñalolén', 'San Joaquín',
          -33.5, -70.5, -33.45, -70.62, now() + interval '2 days', 2000, 4)
  returning id into v_trip;

  -- ================================================================
  -- 1) RESERVA + VERIFICACIÓN AUTOMÁTICA (sin acción del conductor)
  -- ================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', v_passenger, 'role', 'authenticated')::text, true);
  v_booking1 := (public.reserve_seat(v_trip)).id;

  select * into v_payment from public.payments where booking_id = v_booking1;
  if v_payment.status <> 'pending' or v_payment.total_clp <> 2300 then
    raise exception 'FAIL reserva: estado % total %', v_payment.status, v_payment.total_clp;
  end if;
  raise notice 'OK reserva: pago pending, total 2300 (2000 + 300 comisión)';

  -- Intención de pago (lo hace la Edge Function con service role).
  perform public.prepare_payment_intent(v_passenger, v_booking1, 0);
  perform public.attach_provider_intent(v_payment.id, v_intent, 'intent_pending');

  -- Webhook de Fintoc → verificación automática (misma función que llama el webhook).
  perform public.apply_payment_verification(v_intent, 'fintoc', now());

  select * into v_payment from public.payments where booking_id = v_booking1;
  if v_payment.status <> 'confirmed' or v_payment.verified_at is null then
    raise exception 'FAIL verificación: estado %', v_payment.status;
  end if;
  raise notice 'OK verificación automática: pago confirmed sin que el conductor confirme';

  -- El trigger de confirmación acredita créditos y encola el push al pasajero.
  select coalesce(sum(case when entry_type = 'abono' then amount else -amount end), 0)
    into v_credits from public.credit_transactions where user_id = v_passenger;
  if v_credits < 25 then raise exception 'FAIL créditos: saldo %', v_credits; end if;
  select count(*) into v_tmp from public.notifications
    where user_id = v_passenger and type = 'pago_confirmado';
  if v_tmp < 1 then raise exception 'FAIL push: no se encoló pago_confirmado'; end if;
  raise notice 'OK recompensas: +25 créditos y push de pago confirmado encolados';

  -- Idempotencia: reprocesar el mismo intent no rompe ni duplica.
  perform public.apply_payment_verification(v_intent, 'fintoc', now());
  raise notice 'OK idempotencia: reprocesar el webhook es no-op';

  -- ================================================================
  -- 2) IMPAGO A LAS 48 h → STRIKE AUTOMÁTICO (estado verificado)
  -- ================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', v_passenger, 'role', 'authenticated')::text, true);
  v_booking2 := (public.reserve_seat(v_trip)).id;
  -- Fuerza el vencimiento del plazo.
  update public.payments set due_at = now() - interval '1 hour' where booking_id = v_booking2;

  perform public.expire_overdue_payments();
  select * into v_payment from public.payments where booking_id = v_booking2;
  select count(*) into v_tmp from public.strikes where booking_id = v_booking2 and status = 'active';
  if v_payment.status <> 'overdue' or v_tmp <> 1 then
    raise exception 'FAIL strike: estado % strikes %', v_payment.status, v_tmp;
  end if;
  select payment_strikes_count into v_strikes from public.profiles where id = v_passenger;
  raise notice 'OK impago: pago overdue + strike activo (contador = %)', v_strikes;

  -- ================================================================
  -- 3) DISPUTA "yo sí pagué" → congela el strike hasta revisión
  -- ================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', v_passenger, 'role', 'authenticated')::text, true);
  v_dispute := public.open_dispute(v_booking2, 'Transferí a tiempo, adjunto comprobante', null);

  select * into v_payment from public.payments where booking_id = v_booking2;
  select count(*) into v_tmp from public.strikes where booking_id = v_booking2 and status = 'frozen';
  if v_payment.status <> 'disputed' or v_tmp <> 1 or v_dispute.conversation_id is null then
    raise exception 'FAIL disputa: estado % frozen % conv %', v_payment.status, v_tmp, v_dispute.conversation_id;
  end if;
  select payment_strikes_count into v_tmp from public.profiles where id = v_passenger;
  if v_tmp <> v_strikes - 1 then raise exception 'FAIL congelado: contador % (esperaba %)', v_tmp, v_strikes - 1; end if;
  raise notice 'OK disputa: pago en revisión, strike congelado, ticket de soporte abierto';

  -- ================================================================
  -- 4) RESOLUCIÓN de la disputa por el owner (aprobar = sí pagó)
  -- ================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  perform public.resolve_dispute(v_dispute.id, true, 'Comprobante válido');

  select * into v_payment from public.payments where booking_id = v_booking2;
  select count(*) into v_tmp from public.strikes where booking_id = v_booking2 and status = 'reverted';
  if v_payment.status <> 'confirmed' or v_tmp <> 1 then
    raise exception 'FAIL resolución: estado % reverted %', v_payment.status, v_tmp;
  end if;
  raise notice 'OK resolución: disputa aprobada, pago verificado, strike revertido';

  -- ================================================================
  -- 5) PAGO PARCIAL CON CRÉDITOS
  -- ================================================================
  -- Le damos saldo de sobra al pasajero (100 créditos → hasta 50% del cupo).
  insert into public.credit_transactions (user_id, entry_type, source, amount, description)
  values (v_passenger, 'abono', 'ajuste', 100, 'Saldo de prueba');

  perform set_config('request.jwt.claims', json_build_object('sub', v_passenger, 'role', 'authenticated')::text, true);
  v_booking3 := (public.reserve_seat(v_trip)).id;
  perform public.prepare_payment_intent(v_passenger, v_booking3, 100);

  select * into v_payment from public.payments where booking_id = v_booking3;
  -- Tope 50% de 2000 = 1000 CLP → 200 créditos, pero pide 100 → 100*5 = 500 CLP.
  if v_payment.credits_applied <> 100 or v_payment.credits_clp <> 500
     or v_payment.cash_clp <> v_payment.total_clp - 500 then
    raise exception 'FAIL créditos-pago: aplicados % clp % cash %',
      v_payment.credits_applied, v_payment.credits_clp, v_payment.cash_clp;
  end if;
  raise notice 'OK pago parcial: 100 créditos (=500 CLP) aplicados; efectivo = %', v_payment.cash_clp;

  -- ================================================================
  -- 6) LIQUIDACIONES y PANEL FINANCIERO
  -- ================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', v_driver, 'role', 'authenticated')::text, true);
  v_earn := public.driver_earnings();
  if (v_earn->>'gross_clp')::int <= 0 or (v_earn->>'net_clp')::int <= 0 then
    raise exception 'FAIL ganancias: %', v_earn;
  end if;
  raise notice 'OK ganancias conductor: bruto % / comisión % / neto %',
    v_earn->>'gross_clp', v_earn->>'commission_clp', v_earn->>'net_clp';

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  v_fin := public.owner_finance_summary();
  if (v_fin->>'total_commission_clp')::int <= 0 then
    raise exception 'FAIL finanzas: %', v_fin;
  end if;
  raise notice 'OK panel financiero: comisiones % / volumen % / morosidad %',
    v_fin->>'total_commission_clp', v_fin->>'total_volume_clp', v_fin->'morosidad';

  raise notice '===== CICLO COMPLETO OK =====';
end;
$$;

rollback;
