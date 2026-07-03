# Backend Supabase de Uturn

Migraciones versionadas, funciones de servidor y Edge Function de la **Sesión 3**.
El esquema y las convenciones están documentados en [`docs/backend.md`](../docs/backend.md).

## Estructura

```
supabase/
  config.toml                 Configuración de la CLI (auth por OTP, function)
  migrations/                 SQL versionado (se aplica en orden por timestamp)
    ...000000_schema.sql      Tablas: profiles, vehicles, trips, bookings,
                              payments, ratings, penalties, strikes,
                              credit_transactions, redeemables, redemptions
    ...000001_functions.sql   Triggers + RPCs (reserve_seat, cancel_booking,
                              mark/confirm payment, complete_booking,
                              expire_overdue_payments, redeem_item, …)
    ...000002_rls.sql         Row Level Security por tabla
    ...000003_storage.sql     Buckets privados avatars/credentials + políticas
    ...000004_cron_seed.sql   pg_cron (expiración 48 h) + seed del catálogo
  functions/
    expire-payments/          Edge Function que corre expire_overdue_payments()
```

## Aplicar las migraciones

Requiere la [Supabase CLI](https://supabase.com/docs/guides/cli) y las claves de
servidor (NO la anon key). Nunca commitees estas credenciales.

```bash
# 1. Vincular el proyecto (ref = subdominio de la URL, p. ej. jkqzuddxahoamoygdrrb)
supabase link --project-ref <project-ref>

# 2. Empujar todas las migraciones
supabase db push

# 3. Desplegar la Edge Function (expira pagos a las 48 h sin abrir la app)
supabase functions deploy expire-payments --no-verify-jwt
```

La expiración de pagos se programa vía **pg_cron** (migración `...000004`) cada 15
minutos. Si prefieres la Edge Function, invócala desde un scheduler externo o
desde `cron.schedule(... net.http_post ...)`.

## Auth

- Login/registro por **OTP / magic link** al correo institucional.
- Un trigger `enforce_university_email` (BEFORE INSERT en `auth.users`) rechaza
  dominios no institucionales — la validación vive en el servidor, no en el cliente.
- Un trigger `handle_new_user` (AFTER INSERT) crea el `profile` 1:1.
- Roles `user/tutor/admin/owner` en `profiles.account_role`; un usuario no puede
  auto-asignarse rol (trigger `protect_profile_columns`).

## Verificación de RLS (dos usuarios)

Con la anon key desde el SQL editor o el cliente:

- Un `user` **no** puede `update` de `payments`, `strikes` ni `credit_transactions`
  (no existen políticas de escritura para clientes: solo funciones de servidor).
- Un `user` **no** puede cambiar su `account_role`, saldos ni contadores de strikes.
- Reservar solo es posible vía `reserve_seat` (valida ban/bloqueo y asientos).
- Dos cuentas distintas ven los mismos `trips`/`bookings` (lectura autenticada).
