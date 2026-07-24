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

-- --- Bots de IA ---

-- 13) Tabla nueva presente (esperado: 1 fila).
select table_name
from information_schema.tables
where table_schema = 'public' and table_name = 'ai_bots';

-- 14) profiles.is_bot existe y default es false (esperado: 1 fila).
select column_name, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_bot';

-- 15) Funciones nuevas presentes (esperado: incluye todas).
select proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in ('_create_bot_profile','set_publisher_bot','set_tutor_topic_bot',
                  'notify_ai_bot_on_message')
order by proname;

-- 16) anon/authenticated NO pueden ejecutar las funciones internas
--     (esperado: 0 filas). set_publisher_bot/set_tutor_topic_bot SÍ deben
--     poder ejecutarlas authenticated (verifican autorización adentro).
select p.proname, r.rolname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join (values ('anon'), ('authenticated')) as r(rolname)
where n.nspname = 'public'
  and has_function_privilege(r.rolname, p.oid, 'execute')
  and (
    p.proname in ('_create_bot_profile', 'notify_ai_bot_on_message')
    or (r.rolname = 'anon' and p.proname in ('set_publisher_bot', 'set_tutor_topic_bot'))
  );

-- 17) RLS habilitado en ai_bots (esperado: rowsecurity = true).
select relname, relrowsecurity from pg_class where relname = 'ai_bots';

-- 18) pg_net disponible para el trigger de auto-respuesta (esperado: 1 fila).
select extname from pg_extension where extname = 'pg_net';

-- ===========================================================================
-- SESIÓN 9 — Seguridad, confianza y moderación
-- ===========================================================================

-- 19) Tablas nuevas presentes (esperado: 8 filas).
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('trip_live_shares','sos_alerts','reports','user_blocks',
                     'moderation_actions','blocked_words','driver_verifications','device_token_seen')
order by table_name;

-- 20) Columnas nuevas de profiles (esperado: incluye todas).
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name in ('emergency_contact_name','moderation_status','moderation_until',
                      'warnings_count','credential_review_status','credential_expires_at',
                      'profile_visibility')
order by column_name;

-- 21) Funciones nuevas presentes (esperado: incluye todas).
select proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in ('start_trip_share','get_live_share','trigger_sos','resolve_sos',
                  'report_target','apply_moderation_action','moderate_content',
                  'can_moderate','are_blocked','is_active_account','review_credential',
                  'submit_driver_verification','get_public_profile','export_my_data',
                  'admin_delete_account','list_duplicate_account_signals')
order by proname;

-- 22) get_live_share ejecutable por anon (esperado: 1 fila); admin_delete_account
--     NO ejecutable por authenticated/anon (esperado: 0 filas).
select 'get_live_share_anon' as check, count(*) as ok
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'get_live_share'
  and has_function_privilege('anon', p.oid, 'execute');

select p.proname, r.rolname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
cross join (values ('anon'), ('authenticated')) as r(rolname)
where n.nspname = 'public' and p.proname = 'admin_delete_account'
  and has_function_privilege(r.rolname, p.oid, 'execute');

-- 23) RLS habilitado en las tablas nuevas (esperado: rowsecurity = true en todas).
select relname, relrowsecurity
from pg_class where relname in ('trip_live_shares','sos_alerts','reports','user_blocks',
  'moderation_actions','blocked_words','driver_verifications','device_token_seen')
order by relname;

-- 24) Buckets privados nuevos (esperado: report-evidence y driver-documents, public=false).
select id, public from storage.buckets where id in ('report-evidence','driver-documents') order by id;
