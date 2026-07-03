-- =====================================================================
-- Uturn — Sesión 3: verificación rápida tras aplicar las migraciones.
-- Pega en el SQL Editor de Supabase y ejecútalo. No modifica datos.
-- =====================================================================

-- 1) Todas las tablas del esquema existen (esperado: 11 filas).
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('profiles','vehicles','trips','bookings','payments','ratings',
                     'penalties','strikes','credit_transactions','redeemables','redemptions')
order by table_name;

-- 2) Funciones de servidor presentes (esperado: incluye reserve_seat,
--    cancel_booking, expire_overdue_payments, confirm_payment_received, redeem_item…).
select proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in ('reserve_seat','cancel_booking','mark_payment_sent','confirm_payment_received',
                  'complete_booking','expire_overdue_payments','redeem_item','handle_new_user',
                  'enforce_university_email','is_university_email','credit_balance')
order by proname;

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
