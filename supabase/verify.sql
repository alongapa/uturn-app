-- =====================================================================
-- Unities — Sesión 3: verificación rápida tras aplicar las migraciones.
-- Pega en el SQL Editor de Supabase y ejecútalo. No modifica datos.
-- =====================================================================

-- 1) Todas las tablas del esquema existen (esperado: 12 filas).
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('profiles','bank_details','vehicles','trips','bookings','payments','ratings',
                     'penalties','strikes','credit_transactions','redeemables','redemptions')
order by table_name;

-- 2) Funciones de servidor presentes (esperado: incluye reserve_seat,
--    cancel_booking, expire_overdue_payments, confirm_payment_received, redeem_item…).
select proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in ('reserve_seat','cancel_booking','mark_payment_sent','confirm_payment_received',
                  'complete_booking','expire_overdue_payments','redeem_item','handle_new_user',
                  'enforce_university_email','is_university_email','credit_balance',
                  'get_driver_bank_details')
order by proname;

-- 2b) Los roles de cliente NO pueden ejecutar funciones internas ni anon los RPC
--     (esperado: 0 filas).
select p.proname, r.rolname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join (values ('anon'), ('authenticated')) as r(rolname)
where n.nspname = 'public'
  and has_function_privilege(r.rolname, p.oid, 'execute')
  and (
    r.rolname = 'anon' and p.proname in
      ('reserve_seat','cancel_booking','mark_payment_sent','confirm_payment_received',
       'complete_booking','redeem_item','credit_balance','get_driver_bank_details',
       'expire_overdue_payments')
    or r.rolname = 'authenticated' and p.proname in
      ('expire_overdue_payments','handle_new_user','gen_redemption_code')
  );

-- 3) RLS habilitado en las tablas sensibles (esperado: rowsecurity = true).
select relname, relrowsecurity
from pg_class
where relname in ('payments','strikes','credit_transactions','bookings','profiles')
order by relname;

-- 4) Catálogo de canjes sembrado (esperado: 6).
select count(*) as redeemables_seeded from public.redeemables;

-- 5) pg_cron programado (esperado: 1 fila 'expire-overdue-payments' cada 15 min).
--    Si pg_cron no está disponible, usa la Edge Function expire-payments.
select jobname, schedule from cron.job where jobname = 'expire-overdue-payments';

-- --- Sesión 8: pagos avanzados ---

-- 7) Tablas nuevas presentes (esperado: 4 filas).
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('platform_config','payment_events','disputes','payouts')
order by table_name;

-- 8) Config financiera sembrada (esperado: 1 fila 'default' con comisión 300).
select id, commission_clp, credit_clp_rate, max_credit_discount_pct from public.platform_config;

-- 9) Funciones nuevas presentes (esperado: incluye todas).
select proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in ('prepare_payment_intent','attach_provider_intent','apply_payment_verification',
                  'open_dispute','resolve_dispute','list_disputes','driver_earnings',
                  'create_payout','mark_payout_paid','owner_finance_summary','update_platform_config')
order by proname;

-- 10) Las funciones de servicio de pago NO son ejecutables por clientes
--     (esperado: 0 filas).
select p.proname, r.rolname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join (values ('anon'), ('authenticated')) as r(rolname)
where n.nspname = 'public'
  and has_function_privilege(r.rolname, p.oid, 'execute')
  and p.proname in ('prepare_payment_intent','attach_provider_intent','apply_payment_verification',
                    '_register_payment_strike');

-- 11) RLS habilitado en las tablas nuevas (esperado: rowsecurity = true).
select relname, relrowsecurity
from pg_class
where relname in ('platform_config','payment_events','disputes','payouts')
order by relname;

-- 12) El estado 'disputed' es válido en payments (esperado: no error).
select conname from pg_constraint where conname = 'payments_status_check';

-- 6) Prueba de RLS: un CLIENTE autenticado NO puede escribir credit_transactions.
--    Impersona el rol 'authenticated' con un sub cualquiera; debe FALLAR con
--    "new row violates row-level security policy" / permiso denegado.
--    (Descomenta para ejecutar; vuelve a 'reset role' al terminar.)
-- begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}';
--   insert into public.credit_transactions (user_id, entry_type, source, amount, description)
--   values ('00000000-0000-0000-0000-000000000000','abono','ajuste',9999,'hack');  -- debe fallar
-- rollback;

-- --- Analítica de tendencias ---

-- 13) Tablas nuevas presentes (esperado: 4 filas).
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('analytics_events','analytics_config','university_analysts')
order by table_name;

-- 14) Config sembrada (esperado: 1 fila 'default', k_anonymity 20, retention_days 90).
select id, k_anonymity, retention_days from public.analytics_config;

-- 15) Materialized views presentes (esperado: 2 filas).
select matviewname from pg_matviews
where schemaname = 'public' and matviewname in ('analytics_trends_daily', 'analytics_trends_weekly')
order by matviewname;

-- 16) Funciones nuevas presentes (esperado: incluye todas).
select proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in ('set_analytics_event_origin','is_university_analyst','update_analytics_config',
                  'university_trends','publisher_engagement','refresh_analytics_trends',
                  'purge_old_analytics_events')
order by proname;

-- 17) anon/authenticated NO pueden ejecutar las funciones de cron/trigger internas
--     (esperado: 0 filas). university_trends/publisher_engagement/update_analytics_config
--     SÍ deben poder ejecutarlas authenticated (verifican el rol adentro).
select p.proname, r.rolname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join (values ('anon'), ('authenticated')) as r(rolname)
where n.nspname = 'public'
  and has_function_privilege(r.rolname, p.oid, 'execute')
  and (
    p.proname in ('set_analytics_event_origin','refresh_analytics_trends','purge_old_analytics_events')
    or (r.rolname = 'anon' and p.proname in
        ('is_university_analyst','update_analytics_config','university_trends','publisher_engagement'))
  );

-- 18) RLS habilitado (esperado: rowsecurity = true en las 3).
select relname, relrowsecurity
from pg_class
where relname in ('analytics_events','analytics_config','university_analysts')
order by relname;

-- 19) Las materialized views NO son legibles por anon/authenticated (esperado: 0 filas).
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('analytics_trends_daily', 'analytics_trends_weekly')
  and grantee in ('anon', 'authenticated');

-- 20) pg_cron programado (esperado: 2 filas, refresco y purga nightly).
select jobname, schedule from cron.job
where jobname in ('analytics-refresh-trends', 'analytics-purge-old-events')
order by jobname;

-- 21) profiles.analytics_opt_out existe y default es false (esperado: 1 fila).
select column_name, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles' and column_name = 'analytics_opt_out';
