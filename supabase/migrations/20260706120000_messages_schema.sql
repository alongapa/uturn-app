-- Unities — Sesión 6: esquema de Mensajes, tutores y Q&A.
-- Tablas: conversations (dm/soporte) + conversation_members + messages (chat
-- realtime con imagen y leído), topics + topic_assignees (quién responde cada
-- tema: tutores o publishers), questions + question_replies (con respuesta
-- oficial destacada) y guides (material de tutores en Storage).
-- Convención de la Sesión 3: snake_case, uuid, timestamptz created_at/updated_at.

-- ---------------------------------------------------------------------------
-- conversations — hilo de chat. `kind` distingue DMs 1-a-1 de tickets de
-- soporte ("Soporte Unities", atendido por admin/owner). Para DMs, `dm_key`
-- (uuid menor:uuid mayor) garantiza una única conversación por par de
-- usuarios. `last_message_*` se denormaliza vía trigger para ordenar y
-- previsualizar la bandeja sin N+1.
-- ---------------------------------------------------------------------------
create table if not exists public.conversations (
  id                   uuid primary key default gen_random_uuid(),
  kind                 text not null check (kind in ('dm', 'soporte')),
  dm_key               text unique,
  support_category     text check (support_category in ('pagos', 'baneos', 'verificacion', 'otro')),
  support_status       text check (support_status in ('abierto', 'resuelto')),
  created_by           uuid references public.profiles (id) on delete set null,
  last_message_at      timestamptz,
  last_message_preview text,
  last_message_sender  uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (kind <> 'dm' or dm_key is not null),
  check (kind <> 'soporte' or (support_category is not null and support_status is not null))
);

-- Bandeja: conversaciones con actividad más reciente primero.
create index if not exists conversations_last_message_idx
  on public.conversations (last_message_at desc nulls last);
-- Bandeja de soporte de los admins: tickets abiertos primero.
create index if not exists conversations_support_idx
  on public.conversations (support_status, last_message_at desc)
  where kind = 'soporte';

-- ---------------------------------------------------------------------------
-- conversation_members — quién participa. `last_read_at` es el puntero de
-- lectura por miembro: mensajes posteriores cuentan como no leídos y sirven
-- de indicador "visto" en los DMs. Solo se escribe vía RPCs (start_dm,
-- start_support, mark_conversation_read): no hay política de escritura.
-- ---------------------------------------------------------------------------
create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists conversation_members_user_idx
  on public.conversation_members (user_id);

-- ---------------------------------------------------------------------------
-- messages — texto y/o imagen (`image_path`: ruta en el bucket chat-media,
-- `<conversation_id>/<uid>/<archivo>`). Inmutables: no hay UPDATE/DELETE de
-- clientes. El orden estable (created_at, id) pagina el historial.
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id) on delete cascade,
  body            text not null default '' check (char_length(body) <= 2000),
  image_path      text,
  created_at      timestamptz not null default now(),
  check (char_length(btrim(body)) > 0 or image_path is not null)
);

create index if not exists messages_conversation_idx
  on public.messages (conversation_id, created_at desc, id desc);
create index if not exists messages_sender_idx on public.messages (sender_id);

-- ---------------------------------------------------------------------------
-- topics — catálogo de temas del Q&A (mallas, becas, deportes…). id de texto
-- estable para seed y deep links, como redeemables.
-- ---------------------------------------------------------------------------
create table if not exists public.topics (
  id          text primary key,
  name        text not null,
  emoji       text,
  description text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- topic_assignees — responsables oficiales de cada tema: un tutor (user_id) o
-- una federación/publisher (publisher_id), exactamente uno de los dos. La RLS
-- de question_replies exige estar aquí para marcar una respuesta oficial.
-- ---------------------------------------------------------------------------
create table if not exists public.topic_assignees (
  id           uuid primary key default gen_random_uuid(),
  topic_id     text not null references public.topics (id) on delete cascade,
  user_id      uuid references public.profiles (id) on delete cascade,
  publisher_id uuid references public.publishers (id) on delete cascade,
  created_at   timestamptz not null default now(),
  check ((user_id is null) <> (publisher_id is null))
);

create unique index if not exists topic_assignees_user_uq
  on public.topic_assignees (topic_id, user_id) where user_id is not null;
create unique index if not exists topic_assignees_publisher_uq
  on public.topic_assignees (topic_id, publisher_id) where publisher_id is not null;
create index if not exists topic_assignees_topic_idx on public.topic_assignees (topic_id);
create index if not exists topic_assignees_user_idx
  on public.topic_assignees (user_id) where user_id is not null;
create index if not exists topic_assignees_publisher_idx
  on public.topic_assignees (publisher_id) where publisher_id is not null;

-- ---------------------------------------------------------------------------
-- questions — pregunta pública por tema. `reply_count` y `answered_at` los
-- mantiene el trigger de question_replies (el cliente no puede tocarlos:
-- trigger protect_question_columns).
-- ---------------------------------------------------------------------------
create table if not exists public.questions (
  id          uuid primary key default gen_random_uuid(),
  topic_id    text not null references public.topics (id),
  author_id   uuid not null references public.profiles (id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 1 and 200),
  body        text not null default '' check (char_length(body) <= 2000),
  reply_count integer not null default 0 check (reply_count >= 0),
  answered_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists questions_topic_idx on public.questions (topic_id, created_at desc);
create index if not exists questions_author_idx on public.questions (author_id);
create index if not exists questions_feed_idx on public.questions (created_at desc, id desc);

-- ---------------------------------------------------------------------------
-- question_replies — respuestas y comentarios. `is_official = true` solo lo
-- pueden poner los asignados al tema (RLS); si responden a nombre de una
-- federación llevan `publisher_id`. La respuesta oficial queda destacada en
-- la UI y marca `questions.answered_at`.
-- ---------------------------------------------------------------------------
create table if not exists public.question_replies (
  id           uuid primary key default gen_random_uuid(),
  question_id  uuid not null references public.questions (id) on delete cascade,
  author_id    uuid not null references public.profiles (id) on delete cascade,
  publisher_id uuid references public.publishers (id) on delete set null,
  body         text not null check (char_length(btrim(body)) between 1 and 2000),
  is_official  boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists question_replies_question_idx
  on public.question_replies (question_id, created_at);
create index if not exists question_replies_author_idx on public.question_replies (author_id);
create index if not exists question_replies_official_idx
  on public.question_replies (question_id) where is_official;

-- ---------------------------------------------------------------------------
-- guides — guías de estudio de los tutores (PDF o imagen en el bucket
-- privado `guides`, ruta `<uid>/<archivo>`), asociadas a un tema y
-- consultables desde el Q&A.
-- ---------------------------------------------------------------------------
create table if not exists public.guides (
  id          uuid primary key default gen_random_uuid(),
  topic_id    text not null references public.topics (id),
  author_id   uuid not null references public.profiles (id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 1 and 150),
  description text,
  file_path   text not null,
  file_kind   text not null check (file_kind in ('imagen', 'pdf')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists guides_topic_idx on public.guides (topic_id, created_at desc);
create index if not exists guides_author_idx on public.guides (author_id);
