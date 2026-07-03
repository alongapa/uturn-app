-- Uturn — Sesión 3: pg_cron (expiración de pagos server-side) + seed del catálogo.

-- ===========================================================================
-- pg_cron: expira pagos vencidos y emite strikes cada 15 minutos, sin que
-- nadie abra la app. Si tu proyecto usa la Edge Function `expire-payments`
-- en su lugar, puedes omitir este bloque (o dejar ambos: son idempotentes).
-- ===========================================================================
create extension if not exists pg_cron with schema extensions;

-- Reprograma de forma idempotente.
do $$
begin
  perform cron.unschedule('expire-overdue-payments')
  where exists (select 1 from cron.job where jobname = 'expire-overdue-payments');
exception when others then
  null;  -- pg_cron no disponible en algunos entornos locales; se ignora.
end;
$$;

do $$
begin
  perform cron.schedule(
    'expire-overdue-payments',
    '*/15 * * * *',
    $cron$ select public.expire_overdue_payments(); $cron$
  );
exception when others then
  raise notice 'pg_cron no disponible; programa expire_overdue_payments por Edge Function/scheduler externo.';
end;
$$;

-- ===========================================================================
-- Seed del catálogo de canjes (constants/mock-uturn.ts REDEEMABLE_ITEMS).
-- En la Sesión 4 lo publican los admins; aquí se siembra para el piloto.
-- ===========================================================================
insert into public.redeemables (id, title, description, category, cost_credits, sponsor, stock, validity_days, published_by_admin, active)
values
  ('redeem-cafe',            'Café gratis en Cafetería Central',       'Un café de especialidad a elección en la cafetería del campus.', 'comida',    80,  'Cafetería Central', 20, 7,  true, true),
  ('redeem-snack',           'Snack + bebida',                          'Combo de snack y bebida en los kioscos adheridos.',              'comida',    40,  null,                50, 5,  true, true),
  ('redeem-bencina',         'Descuento $3.000 en bencina',             'Descuento directo para conductores en estaciones adheridas.',    'servicios', 120, 'Copec',             null, 14, true, true),
  ('redeem-evento',          'Entrada Fiesta Mechona',                  'Una entrada general para la fiesta de bienvenida del semestre.', 'eventos',   150, null,                10, 3,  true, true),
  ('redeem-polera',          'Polera Uturn edición limitada',           'Merch oficial Uturn, retiro en punto de encuentro del campus.',  'merch',     250, null,                15, 30, true, true),
  ('redeem-estacionamiento', 'Semana de estacionamiento preferente',    'Estacionamiento reservado cerca del punto de encuentro por una semana.', 'servicios', 100, null,        null, 7,  true, true)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  cost_credits = excluded.cost_credits,
  sponsor = excluded.sponsor,
  stock = excluded.stock,
  validity_days = excluded.validity_days,
  published_by_admin = excluded.published_by_admin,
  active = excluded.active;
