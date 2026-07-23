# Backend Supabase de Unities

Migraciones versionadas, funciones de servidor y Edge Function de la **Sesión 3**.
El esquema y las convenciones están documentados en [`docs/backend.md`](../docs/backend.md).

## Estructura

```
supabase/
  config.toml                 Configuración de la CLI (auth por OTP, function)
  migrations/                 SQL versionado (se aplica en orden por timestamp)
    ...000000_schema.sql      Tablas: profiles, bank_details, vehicles, trips,
                              bookings, payments, ratings, penalties, strikes,
                              credit_transactions, redeemables, redemptions
    ...000001_functions.sql   Triggers + RPCs (reserve_seat, cancel_booking,
                              mark/confirm payment, complete_booking,
                              expire_overdue_payments, redeem_item, …)
    ...000002_rls.sql         Row Level Security por tabla
    ...000003_storage.sql     Buckets privados avatars/credentials + políticas
    ...000004_cron_seed.sql   pg_cron (expiración 48 h) + seed del catálogo
    ...120000_feed_schema.sql Sesión 4: publishers, posts, stories e interacciones
    ...120001_feed_functions_rls.sql  can_publish(), contadores, RLS del feed,
                              purga de historias (pg_cron) y realtime
    ...120002_feed_storage_seed.sql   Bucket feed-media + seed (FEUAI, centros, demo)
    ...06120000_messages_schema.sql   Sesión 6: conversations, members, messages,
                              topics, topic_assignees, questions/replies, guides
    ...06120001_messages_functions_rls.sql  start_dm/start_support/mark_read,
                              can_access_conversation, RLS del chat/Q&A, realtime
    ...06120002_messages_storage_seed.sql   Buckets guides y chat-media + seed de temas
    ...06120003_messages_hardening.sql      Endurecimiento post-advisors (grants,
                              search_path, índices FK, políticas sin solape)
    ...07120000_notifications_schema.sql    Sesión 7: push_tokens, notification_prefs,
                              notifications (historial + cola de push)
    ...07120001_notifications_functions_rls.sql  enqueue/claim, triggers de dominio,
                              recordatorios pg_cron, RLS y realtime
    ...08120000_payments_schema.sql         Sesión 8: platform_config, columnas de
                              proveedor/créditos en payments, disputes, payouts,
                              payment_events, estado de strikes
    ...08120001_payments_functions_rls.sql  Intención/verificación (Fintoc), disputas,
                              liquidaciones, panel financiero del owner, RLS
    ...08120002_payments_storage.sql        Bucket privado dispute-evidence
    ...12120000_ai_bots_schema.sql          Bots de IA: profiles.is_bot, ai_bots,
                              _create_bot_profile (perfil de servicio del bot)
    ...12120001_ai_bots_functions_rls.sql   set_publisher_bot/set_tutor_topic_bot,
                              trigger notify_ai_bot_on_message (pg_net), RLS
  functions/
    expire-payments/          Edge Function que corre expire_overdue_payments()
    send-push/                Envía la cola de notifications vía Expo Push API
    create-payment-intent/    Sesión 8: crea la intención de pago (Fintoc) del pasajero
    fintoc-webhook/           Sesión 8: webhook firmado → verificación automática
    ai-bot-reply/             Bots de IA: genera y publica la respuesta (API de Claude)
  tests/
    payments_cycle_test.sql   Sesión 8: prueba end-to-end del ciclo de pagos (rollback)
    ai_bots_test.sql          Bots de IA: RLS, autorización de configuración, trigger (rollback)
```

## Aplicar con el MCP de Supabase (recomendado)

Con el MCP autenticado (ver [`docs/setup-local.md`](../docs/setup-local.md):
`/mcp` → supabase → Authenticate), pídele a Claude que aplique las migraciones.
El flujo que debe seguir:

1. `list_tables` — ver qué existe. Si quedaron tablas de un intento a medias
   (p. ej. un `trips` con otra estructura), ejecutar [`reset.sql`](reset.sql)
   vía `execute_sql` (⚠️ destructivo, solo objetos de Unities).
2. Aplicar cada `migrations/*.sql` **en orden por timestamp** con
   `apply_migration` (así quedan registradas en el historial de migraciones).
   Si un statement falla, leer el error y corregir antes de seguir.
3. Ejecutar [`verify.sql`](verify.sql) vía `execute_sql` y revisar los checks
   (12 tablas, funciones, RLS, permisos de EXECUTE, seed, pg_cron).

## Aplicar sin CLI (más rápido)

Si no quieres instalar la CLI ni buscar tokens: abre el **SQL Editor** del
dashboard (Dashboard → SQL Editor → New query), pega **todo**
[`apply_all.sql`](apply_all.sql) y ejecútalo una vez. Corre como `postgres`, así
que crea también los triggers en `auth.users`, las políticas de Storage y
pg_cron. Luego pega [`verify.sql`](verify.sql) para comprobar el resultado.
(Solo la Edge Function `expire-payments` necesita la CLI; la expiración a 48 h ya
queda cubierta por pg_cron dentro del SQL.)

### Si falla con "column ... does not exist" / "already exists"

Significa que en `public` ya había una tabla previa (p. ej. `trips` de una
plantilla) con otra estructura, y `create table if not exists` la respeta. Si
esas tablas **no tienen datos que quieras conservar** (proyecto nuevo), ejecuta
[`reset.sql`](reset.sql) (borra solo los objetos de Unities) y vuelve a correr
`apply_all.sql`. Antes, confirma qué existe:

```sql
select table_name from information_schema.tables where table_schema='public' order by 1;
```

## Aplicar las migraciones (con CLI)

Requiere la [Supabase CLI](https://supabase.com/docs/guides/cli) y las claves de
servidor (NO la anon key). Nunca commitees estas credenciales.

```bash
# 1. Vincular el proyecto (ref = subdominio de la URL, p. ej. jkqzuddxahoamoygdrrb)
supabase link --project-ref <project-ref>

# 2. Empujar todas las migraciones
supabase db push

# 3. Desplegar las Edge Functions
supabase functions deploy expire-payments --no-verify-jwt
supabase functions deploy send-push --no-verify-jwt
supabase functions deploy create-payment-intent          # exige JWT (autentica al pasajero)
supabase functions deploy fintoc-webhook --no-verify-jwt # se valida por firma, no por JWT
supabase functions deploy ai-bot-reply --no-verify-jwt   # solo la invoca el trigger interno (pg_net)

# 4. Secretos de Fintoc (Sesión 8) — SANDBOX al probar; NUNCA en git ni en el cliente
supabase secrets set FINTOC_SECRET_KEY=sk_test_...
supabase secrets set FINTOC_WEBHOOK_SECRET=whsec_...
# Registra la URL del webhook (…/functions/v1/fintoc-webhook) en el dashboard de Fintoc.

# 5. Secreto de la API de Claude (Bots de IA) — NUNCA en git ni en el cliente
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

### Probar el ciclo de pagos (Sesión 8)

Contra el sandbox local, sin credenciales de Fintoc (el test reemplaza el webhook
por su misma función de verdad `apply_payment_verification`):

```bash
supabase start && supabase db reset      # aplica migrations/ desde cero
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" \
     -f supabase/tests/payments_cycle_test.sql   # todo OK y ROLLBACK final
```

La expiración de pagos se programa vía **pg_cron** (migración `...000004`) cada 15
minutos. Si prefieres la Edge Function, invócala desde un scheduler externo o
desde `cron.schedule(... net.http_post ...)`.

### Probar los bots de IA

Contra el sandbox local, sin llamar a la API de Claude — el test verifica RLS,
autorización de `set_publisher_bot`/`set_tutor_topic_bot` (solo quien
administra el publisher, o el tutor asignado al tema) y que el trigger
`notify_ai_bot_on_message` identifica al bot correcto de la conversación sin
disparar sobre los mensajes que escribe el propio bot:

```bash
supabase start && supabase db reset      # aplica migrations/ desde cero
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" \
     -f supabase/tests/ai_bots_test.sql   # todo OK y ROLLBACK final
```

Para probar el ciclo completo contra Claude real: configura `ANTHROPIC_API_KEY`,
despliega `ai-bot-reply`, ábrele un DM a un bot habilitado desde la app y
verifica que responde solo (revisa `supabase functions logs ai-bot-reply` si no
llega).

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
- **Feed (Sesión 4)**: un `user` **no** puede insertar en `posts`/`stories`
  (la política exige `can_publish()`, es decir rol `tutor`/`admin`/`owner`);
  sí puede dar like/repost/responder, y solo una vez por post (constraint).
  Un `admin` publica y el post aparece en el Inicio de la otra cuenta
  (realtime sobre `posts`).
- **Mensajes (Sesión 6)**: un `select * from messages` de la cuenta B **no**
  devuelve mensajes de conversaciones donde B no es miembro (la política es
  `can_access_conversation`); B tampoco puede insertar mensajes ahí ni con
  `sender_id` ajeno. Un `user` **no** puede marcar `is_official = true` en
  `question_replies` (solo asignados al tema vía `can_answer_question`) ni
  insertar en `guides` (exige `can_publish()`). Un mensaje enviado desde la
  cuenta A aparece en la B **sin recargar** (realtime sobre `messages`).
- **Bots de IA**: un `admin` que no administra un publisher **no** puede
  llamar `set_publisher_bot` sobre él (exige `can_manage_publisher`); un
  `tutor` **no** puede configurar el bot de una asignatura ajena (exige estar
  en `topic_assignees`). Cualquier alumno puede abrir un DM con un bot
  habilitado con el `start_dm` normal (el bot es un `profiles` más); el bot
  nunca puede tener sesión propia (su `auth.users` no tiene OTP a una casilla
  real).
