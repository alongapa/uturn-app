-- Unities — Sesión 5: esquema del panel de administración.
-- Tablas: publisher_members (qué usuarios administran qué publisher — la
-- restricción "cada admin opera solo sobre sus publishers" es RLS sobre esta
-- tabla), brands (marcas asociadas que co-firman posts), widget_config
-- (orden/fijado/destacado del widget de eventos), content_folders/
-- content_items (carpetas de contenido por publisher, integrables a un widget
-- del feed) y el flujo de postulación de canjeables (columnas de estado en
-- redeemables: el admin propone 'pendiente', solo el owner aprueba).
-- Convención de las Sesiones 3–4: snake_case, uuid, timestamptz.

-- ---------------------------------------------------------------------------
-- publisher_members — membresía: qué usuarios publican/administran en nombre
-- de qué publisher. El owner no necesita membresía (bypass en las políticas);
-- tutor/admin requieren fila aquí para operar sobre ese publisher.
-- ---------------------------------------------------------------------------
create table if not exists public.publisher_members (
  publisher_id uuid not null references public.publishers (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (publisher_id, user_id)
);

create index if not exists publisher_members_user_idx on public.publisher_members (user_id);

-- ---------------------------------------------------------------------------
-- brands — marcas asociadas a un publisher (logo en feed-media o URL http(s))
-- que co-firman promociones y activaciones vía posts.brand_id.
-- ---------------------------------------------------------------------------
create table if not exists public.brands (
  id           uuid primary key default gen_random_uuid(),
  publisher_id uuid not null references public.publishers (id) on delete cascade,
  name         text not null,
  logo_path    text,          -- ruta en el bucket feed-media o URL http(s)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists brands_publisher_idx on public.brands (publisher_id);

-- Co-firma: un post puede ir "junto a" una marca asociada.
alter table public.posts
  add column if not exists brand_id uuid references public.brands (id) on delete set null;

create index if not exists posts_brand_idx on public.posts (brand_id) where brand_id is not null;

-- ---------------------------------------------------------------------------
-- widget_config — configuración editorial del widget "Eventos de la semana":
-- una fila por post configurado. pinned va primero, luego sort_order asc y el
-- resto por fecha del evento; featured muestra el badge "Destacado".
-- El widget de la Sesión 4 (listWeekEvents) pasa a leer esta tabla.
-- ---------------------------------------------------------------------------
create table if not exists public.widget_config (
  id         uuid primary key default gen_random_uuid(),
  widget     text not null default 'eventos_semana' check (widget in ('eventos_semana')),
  post_id    uuid not null references public.posts (id) on delete cascade,
  sort_order integer not null default 0,
  pinned     boolean not null default false,
  featured   boolean not null default false,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (widget, post_id)
);

-- ---------------------------------------------------------------------------
-- content_folders / content_items — carpetas de contenido por publisher.
-- linked_widget integra la carpeta a un widget del feed ('galeria' = carrusel
-- de colecciones en Inicio); null = carpeta interna del panel.
-- ---------------------------------------------------------------------------
create table if not exists public.content_folders (
  id            uuid primary key default gen_random_uuid(),
  publisher_id  uuid not null references public.publishers (id) on delete cascade,
  name          text not null,
  description   text,
  linked_widget text check (linked_widget in ('galeria')),
  sort_order    integer not null default 0,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists content_folders_publisher_idx on public.content_folders (publisher_id);

create table if not exists public.content_items (
  id         uuid primary key default gen_random_uuid(),
  folder_id  uuid not null references public.content_folders (id) on delete cascade,
  media_path text not null,   -- ruta en feed-media o URL http(s)
  caption    text,
  sort_order integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists content_items_folder_idx on public.content_items (folder_id, sort_order);

-- ---------------------------------------------------------------------------
-- redeemables — flujo de postulación (Sesión 5): el admin inserta con estado
-- 'pendiente'; solo el owner aprueba/rechaza (review_redeemable + RLS). El
-- catálogo de canjes y redeem_item solo consideran 'aprobado'.
-- ---------------------------------------------------------------------------
alter table public.redeemables
  add column if not exists status text not null default 'pendiente'
    check (status in ('pendiente', 'aprobado', 'rechazado')),
  add column if not exists proposed_by  uuid references public.profiles (id) on delete set null,
  add column if not exists publisher_id uuid references public.publishers (id) on delete set null,
  add column if not exists reviewed_by  uuid references public.profiles (id) on delete set null,
  add column if not exists reviewed_at  timestamptz,
  add column if not exists review_note  text;

-- El catálogo existente (seed Sesión 3) ya estaba publicado: queda aprobado.
-- Guard proposed_by is null: las propuestas reales siempre llevan proponente,
-- así este UPDATE es re-ejecutable sin aprobar propuestas pendientes.
update public.redeemables set status = 'aprobado'
where status = 'pendiente' and proposed_by is null;

-- Bandeja del owner: solo filas pendientes.
create index if not exists redeemables_pending_idx on public.redeemables (created_at)
  where status = 'pendiente';
