-- Unities — Sesión 10: acciones sobre publicaciones del feed (menú de tres
-- puntos): eliminar, editar, reportar y silenciar.
--
-- Decisión de diseño central: BORRADO LÓGICO, no físico. `posts`/`stories`
-- ganan `deleted_at`; nada se borra de la tabla. Motivos:
--   1) likes, reposts y respuestas apuntan al post por FK; borrarlo en duro
--      los arrastra en cascada y descuadra los contadores denormalizados.
--   2) queda rastro para moderación: un post reportado y borrado por su autor
--      sigue siendo auditable por tutor+ (ver posts_select en la migración
--      ...0001), que es justo el caso que más importa investigar.
--
-- Reportar NO estrena tabla: la Sesión 9 ya tiene `reports` polimórfica
-- (target_type incluye 'post' e 'historia'), su RPC report_target, y la
-- bandeja admin en app/admin/reports.tsx. Aquí solo se le agrega el índice
-- único que impide reportar dos veces lo mismo.

-- ---------------------------------------------------------------------------
-- posts: borrado lógico + marca de edición.
-- `edited_at` lo escribe un trigger (migración ...0001), no el RPC, para que
-- cualquier vía que cambie el texto quede marcada.
-- ---------------------------------------------------------------------------
alter table public.posts
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles (id),
  add column if not exists edited_at  timestamptz;

-- ---------------------------------------------------------------------------
-- stories: mismo borrado lógico. Sin `edited_at`: una historia vive 24 h y
-- editarle el caption no aporta (decisión de sesión).
-- ---------------------------------------------------------------------------
alter table public.stories
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles (id);

-- El cursor keyset del feed solo recorre publicaciones vivas: índice parcial
-- que reemplaza en la práctica a posts_feed_cursor_idx para la consulta del
-- feed (el viejo se conserva: lo usa el panel de moderación, que sí ve
-- borrados).
create index if not exists posts_feed_cursor_live_idx
  on public.posts (created_at desc, id desc) where deleted_at is null;

create index if not exists stories_active_live_idx
  on public.stories (expires_at desc) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Un reporte por usuario por objetivo. Índice parcial porque los reportes de
-- tipo 'usuario' pueden traer target_id null (el objetivo va en
-- target_user_id) y varios null no colisionan de todos modos.
-- ---------------------------------------------------------------------------
create unique index if not exists reports_one_per_target_uq
  on public.reports (reporter_id, target_type, target_id)
  where target_id is not null;

-- ---------------------------------------------------------------------------
-- muted_publishers — el usuario oculta una cuenta de SU feed. Es preferencia
-- personal, no un límite de seguridad: por eso se filtra en la consulta del
-- feed (services/api/feed.ts) y NO en la política posts_select. Meterlo en RLS
-- rompería el panel de moderación (un admin dejaría de ver el post reportado
-- de un publisher que silenció).
-- ---------------------------------------------------------------------------
create table if not exists public.muted_publishers (
  user_id      uuid not null references public.profiles (id)   on delete cascade,
  publisher_id uuid not null references public.publishers (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (user_id, publisher_id)
);

create index if not exists muted_publishers_user_idx on public.muted_publishers (user_id);
