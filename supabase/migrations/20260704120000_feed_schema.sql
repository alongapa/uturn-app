-- Unities — Sesión 4: esquema del feed social (Inicio).
-- Tablas: publishers (entidades que publican), posts (noticia/evento/
-- activacion/descuento), stories (expiran a 24 h server-side) e interacciones
-- post_likes/post_reposts/post_replies con constraints de unicidad.
-- Convención de la Sesión 3: snake_case, uuid, timestamptz created_at/updated_at.

-- ---------------------------------------------------------------------------
-- publishers — federaciones, departamentos, centros de alumnos, la propia
-- universidad y marcas auspiciadoras. Los alumnos no publican en el feed:
-- publican estas entidades a través de cuentas admin/owner (y tutor).
-- `slug` es el identificador estable para seed y deep links.
-- ---------------------------------------------------------------------------
create table if not exists public.publishers (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,
  kind          text not null
                  check (kind in ('federacion', 'departamento', 'centro_alumnos', 'universidad', 'marca')),
  university_id text,          -- catálogo constants/campuses.ts ('uai', 'udd', …)
  avatar_url    text,          -- ruta en el bucket feed-media o URL http(s)
  description   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- posts — publicación del feed. `media` es un arreglo jsonb de strings: rutas
-- dentro del bucket feed-media (se firman al leer) o URLs http(s) directas.
-- Un post con varias imágenes es un "carrete" (la tarjeta muestra galería).
-- Los contadores like/repost/reply se denormalizan aquí y los mantienen
-- triggers (misma técnica que los contadores de profiles en la Sesión 3).
-- `redeemable_id` enlaza descuentos con el catálogo de canjes de la Sesión 2.
-- ---------------------------------------------------------------------------
create table if not exists public.posts (
  id              uuid primary key default gen_random_uuid(),
  publisher_id    uuid not null references public.publishers (id) on delete cascade,
  author_id       uuid references public.profiles (id) on delete set null,
  post_type       text not null default 'noticia'
                    check (post_type in ('noticia', 'evento', 'activacion', 'descuento')),
  body            text not null default '',
  media           jsonb not null default '[]'::jsonb,
  event_starts_at timestamptz,  -- obligatorio para evento; opcional para activacion
  event_location  text,
  discount_code   text,
  discount_terms  text,
  redeemable_id   text references public.redeemables (id) on delete set null,
  like_count      integer not null default 0 check (like_count >= 0),
  repost_count    integer not null default 0 check (repost_count >= 0),
  reply_count     integer not null default 0 check (reply_count >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (post_type <> 'evento' or event_starts_at is not null)
);

-- Cursor keyset del feed: orden estable (created_at, id) descendente.
create index if not exists posts_feed_cursor_idx on public.posts (created_at desc, id desc);
-- Widget "Eventos de la semana": posts tipo evento por fecha del evento.
create index if not exists posts_event_week_idx on public.posts (event_starts_at)
  where post_type = 'evento';
create index if not exists posts_publisher_idx on public.posts (publisher_id);

-- ---------------------------------------------------------------------------
-- stories — historias de 24 h. La expiración la aplica el servidor: la
-- política RLS de lectura exige expires_at > now() (nadie ve historias
-- vencidas aunque el cliente mienta) y pg_cron purga las filas vencidas.
-- ---------------------------------------------------------------------------
create table if not exists public.stories (
  id           uuid primary key default gen_random_uuid(),
  publisher_id uuid not null references public.publishers (id) on delete cascade,
  author_id    uuid references public.profiles (id) on delete set null,
  media_path   text not null,   -- ruta en feed-media o URL http(s)
  caption      text,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '24 hours'
);

create index if not exists stories_active_idx on public.stories (expires_at desc);
create index if not exists stories_publisher_idx on public.stories (publisher_id);

-- ---------------------------------------------------------------------------
-- Interacciones — una por usuario por post (PK/unique compuesta).
-- ---------------------------------------------------------------------------
create table if not exists public.post_likes (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists post_likes_user_idx on public.post_likes (user_id);

create table if not exists public.post_reposts (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists post_reposts_user_idx on public.post_reposts (user_id);

-- Respuestas: hilo simple bajo el post. Única por (post, usuario) según la
-- definición de la Sesión 4 ("interacciones una por usuario").
create table if not exists public.post_replies (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create index if not exists post_replies_post_idx on public.post_replies (post_id, created_at);
create index if not exists post_replies_user_idx on public.post_replies (user_id);
