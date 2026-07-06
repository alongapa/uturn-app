-- Unities — Sesión 7: esquema de notificaciones push y centro de notificaciones.
-- Tablas: push_tokens (token Expo por dispositivo/usuario), notification_prefs
-- (preferencias por categoría, respetadas en el servidor ANTES de encolar) y
-- notifications (historial por usuario que además actúa de cola de envío push:
-- push_status pending → processing → sent/skipped/failed).
-- Convención de la Sesión 3: snake_case, uuid, timestamptz created_at/updated_at.

-- ---------------------------------------------------------------------------
-- push_tokens — un ExponentPushToken por dispositivo. `token` es único global:
-- si otro usuario inicia sesión en el mismo teléfono, register_push_token
-- reasigna la fila (el dispositivo recibe los push de la cuenta activa).
-- Escritura solo vía RPCs register/unregister_push_token (security definer).
-- ---------------------------------------------------------------------------
create table if not exists public.push_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  token       text not null unique check (char_length(token) between 10 and 400),
  platform    text not null check (platform in ('ios', 'android', 'web')),
  device_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

-- ---------------------------------------------------------------------------
-- notification_prefs — switch por categoría (pagos, viajes, social, mensajes).
-- Sin fila = todo activado (default true); el cliente hace upsert al togglear.
-- El servidor consulta esto en enqueue_notification: lo desactivado ni se
-- encola ni se envía (criterio "verificado server-side").
-- ---------------------------------------------------------------------------
create table if not exists public.notification_prefs (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  pagos      boolean not null default true,
  viajes     boolean not null default true,
  social     boolean not null default true,
  mensajes   boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- notifications — historial del centro de notificaciones Y cola de push.
--   category  → agrupa para preferencias y para el ícono de la UI.
--   type      → evento concreto (pago_24h, strike, reserva_nueva, dm, …).
--   url       → ruta expo-router que abre el deep link al tocar la push.
--   dedupe_key→ '<type>:<referencia>:<user>' evita duplicar recordatorios
--               cuando el cron corre cada pocos minutos (unique parcial).
--   push_*    → estado de la cola: la Edge Function send-push reclama filas
--               'pending' (claim_pending_push), envía vía Expo Push API y
--               marca sent/skipped/failed. processing + push_claimed_at
--               permiten reintentar si una corrida murió a medias.
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  category        text not null check (category in ('pagos', 'viajes', 'social', 'mensajes')),
  type            text not null,
  title           text not null check (char_length(btrim(title)) between 1 and 200),
  body            text not null default '' check (char_length(body) <= 1000),
  url             text,
  data            jsonb not null default '{}'::jsonb,
  dedupe_key      text,
  read_at         timestamptz,
  push_status     text not null default 'pending'
                    check (push_status in ('pending', 'processing', 'sent', 'skipped', 'failed')),
  push_claimed_at timestamptz,
  push_sent_at    timestamptz,
  created_at      timestamptz not null default now()
);

-- Historial del centro: más recientes primero.
create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);
-- Contador de no-leídos (badge del ícono).
create index if not exists notifications_unread_idx
  on public.notifications (user_id) where read_at is null;
-- Cola de la Edge Function: solo lo pendiente/en proceso.
create index if not exists notifications_push_queue_idx
  on public.notifications (created_at) where push_status in ('pending', 'processing');
-- Idempotencia de recordatorios programados.
create unique index if not exists notifications_dedupe_uq
  on public.notifications (dedupe_key) where dedupe_key is not null;
