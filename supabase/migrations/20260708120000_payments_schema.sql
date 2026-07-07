-- Unities — Sesión 8: pagos avanzados.
-- Pasarela/verificador chileno (Fintoc) + verificación automática por webhook,
-- disputas ("yo sí pagué"), liquidaciones al conductor, pago parcial con créditos
-- y configuración financiera del owner.
--
-- Cambio de fuente de verdad (docs/backend.md): la protección frente al strike de
-- 48 h deja de ser la palabra del pasajero (marcar pagado) y pasa a ser el estado
-- VERIFICADO ('confirmed', que fija el webhook del proveedor o el conductor). Un
-- pago sin verificar al vencer el plazo → strike; una disputa lo congela.
--
-- Convención de la Sesión 3: snake_case, uuid, timestamptz created_at/updated_at.

-- ---------------------------------------------------------------------------
-- platform_config — parámetros financieros que ajusta el owner (fila única).
--   commission_clp          → comisión de Unities por cupo (la fija reserve_seat).
--   credit_clp_rate         → cuántos CLP cubre 1 crédito al pagar parcialmente.
--   max_credit_discount_pct → tope del precio del cupo pagable con créditos.
-- Solo el owner escribe (RPC update_platform_config); lectura autenticada.
-- ---------------------------------------------------------------------------
create table if not exists public.platform_config (
  id                      text primary key default 'default' check (id = 'default'),
  commission_clp          integer not null default 300 check (commission_clp >= 0),
  credit_clp_rate         integer not null default 5   check (credit_clp_rate >= 1),
  max_credit_discount_pct integer not null default 50  check (max_credit_discount_pct between 0 and 100),
  updated_by              uuid references public.profiles (id) on delete set null,
  updated_at              timestamptz not null default now()
);

insert into public.platform_config (id) values ('default') on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- payments — columnas de proveedor, verificación y pago con créditos.
--   provider           → 'fintoc' | 'manual' | 'credits'.
--   provider_intent_id → id de la intención de pago del proveedor (webhook lo busca).
--   verified_at        → cuándo el webhook (o los créditos) verificaron el pago.
--   credits_applied    → créditos Unities aplicados; credits_clp su valor en CLP.
--   cash_clp           → parte a cobrar por la pasarela (total - credits_clp).
--   payout_id          → liquidación en la que se incluyó (null = aún sin liquidar).
-- ---------------------------------------------------------------------------
alter table public.payments
  add column if not exists provider           text
    check (provider is null or provider in ('fintoc', 'manual', 'credits')),
  add column if not exists provider_intent_id text,
  add column if not exists provider_status    text,
  add column if not exists verified_at        timestamptz,
  add column if not exists credits_applied    integer not null default 0 check (credits_applied >= 0),
  add column if not exists credits_clp        integer not null default 0 check (credits_clp >= 0),
  add column if not exists cash_clp           integer;

-- Se suma el estado 'disputed' (pago congelado mientras se revisa una disputa).
alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status in ('pending', 'marked', 'confirmed', 'overdue', 'disputed'));

-- El webhook resuelve el pago por su provider_intent_id: debe ser único.
create unique index if not exists payments_provider_intent_uq
  on public.payments (provider_intent_id)
  where provider_intent_id is not null;

-- ---------------------------------------------------------------------------
-- strikes — estado del strike para poder congelarlo/revertirlo en una disputa.
--   active  → cuenta para el baneo.
--   frozen  → congelado mientras se revisa la disputa (no cuenta).
--   reverted→ anulado porque la disputa dio la razón al pasajero.
-- ---------------------------------------------------------------------------
alter table public.strikes
  add column if not exists status     text not null default 'active'
    check (status in ('active', 'frozen', 'reverted')),
  add column if not exists dispute_id uuid;

-- ---------------------------------------------------------------------------
-- payment_events — bitácora de eventos del proveedor (auditoría + idempotencia).
-- El webhook inserta antes de procesar; el unique (provider, provider_event_id)
-- descarta reintentos/duplicados. Sin acceso de cliente (solo service_role/owner).
-- ---------------------------------------------------------------------------
create table if not exists public.payment_events (
  id                uuid primary key default gen_random_uuid(),
  payment_id        uuid references public.payments (id) on delete set null,
  provider          text not null,
  provider_event_id text not null,
  event_type        text not null,
  payload           jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create index if not exists payment_events_payment_idx on public.payment_events (payment_id);

-- ---------------------------------------------------------------------------
-- disputes — flujo "yo sí pagué": comprobante que congela el strike hasta que
-- admin/owner resuelva. Enlazada a un ticket de Soporte Unities (Sesión 6).
-- ---------------------------------------------------------------------------
create table if not exists public.disputes (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null references public.bookings (id) on delete cascade,
  payment_id      uuid references public.payments (id) on delete set null,
  opened_by       uuid not null references public.profiles (id) on delete cascade,
  reason          text not null default '',
  evidence_path   text,
  status          text not null default 'abierta'
                    check (status in ('abierta', 'resuelta_pagada', 'resuelta_rechazada')),
  conversation_id uuid references public.conversations (id) on delete set null,
  resolved_by     uuid references public.profiles (id) on delete set null,
  resolution_note text,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Una única disputa abierta por reserva.
create unique index if not exists disputes_open_unique
  on public.disputes (booking_id) where status = 'abierta';
create index if not exists disputes_status_idx on public.disputes (status, created_at desc);
create index if not exists disputes_opened_by_idx on public.disputes (opened_by);

-- Ahora que existe disputes, la FK del strike congelado.
alter table public.strikes drop constraint if exists strikes_dispute_fk;
alter table public.strikes add constraint strikes_dispute_fk
  foreign key (dispute_id) references public.disputes (id) on delete set null;

-- ---------------------------------------------------------------------------
-- payouts — liquidaciones al conductor. Agrupa pagos confirmados en un periodo:
-- bruto (lo que pagaron los pasajeros), comisión Unities y neto (lo que recibe
-- el conductor). El owner las crea/marca pagadas; el conductor las consulta.
-- ---------------------------------------------------------------------------
create table if not exists public.payouts (
  id             uuid primary key default gen_random_uuid(),
  driver_id      uuid not null references public.profiles (id) on delete cascade,
  period_start   timestamptz not null,
  period_end     timestamptz not null,
  gross_clp      integer not null default 0,
  commission_clp integer not null default 0,
  net_clp        integer not null default 0,
  payment_count  integer not null default 0,
  status         text not null default 'pendiente' check (status in ('pendiente', 'pagada')),
  note           text,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  paid_at        timestamptz
);

create index if not exists payouts_driver_idx on public.payouts (driver_id, created_at desc);

alter table public.payments
  add column if not exists payout_id uuid references public.payouts (id) on delete set null;
