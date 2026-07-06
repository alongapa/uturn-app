-- Unities — Sesión 6: buckets de mensajería + seed del Q&A.
-- `guides`: material de tutores (PDF/imagen), privado, ruta `<uid>/<archivo>`;
-- lee cualquier autenticado (URL firmada), escribe solo tutor+ en su carpeta
-- (mismo patrón que feed-media). `chat-media`: fotos del chat, ruta
-- `<conversation_id>/<uid>/<archivo>`; solo quien accede a la conversación
-- puede leerlas — la privacidad del chat aplica también a sus imágenes.

insert into storage.buckets (id, name, public)
values ('guides', 'guides', false), ('chat-media', 'chat-media', false)
on conflict (id) do nothing;

-- --- guides ----------------------------------------------------------------

drop policy if exists guides_files_select on storage.objects;
create policy guides_files_select on storage.objects
  for select to authenticated using (bucket_id = 'guides');

drop policy if exists guides_files_insert_tutor on storage.objects;
create policy guides_files_insert_tutor on storage.objects
  for insert to authenticated with check (
    bucket_id = 'guides'
    and public.can_publish()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- El upsert de Storage necesita INSERT + SELECT + UPDATE (checklist Supabase).
drop policy if exists guides_files_update_tutor on storage.objects;
create policy guides_files_update_tutor on storage.objects
  for update to authenticated
  using (
    bucket_id = 'guides'
    and public.can_publish()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'guides'
    and public.can_publish()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists guides_files_delete_tutor on storage.objects;
create policy guides_files_delete_tutor on storage.objects
  for delete to authenticated using (
    bucket_id = 'guides'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = (select auth.uid())::text
    )
  );

-- --- chat-media ------------------------------------------------------------
-- conversation_from_path castea seguro el primer segmento (null si no es
-- uuid) y can_access_conversation aplica la misma regla que los mensajes.

drop policy if exists chat_media_select_member on storage.objects;
create policy chat_media_select_member on storage.objects
  for select to authenticated using (
    bucket_id = 'chat-media'
    and public.can_access_conversation(public.conversation_from_path(name))
  );

drop policy if exists chat_media_insert_member on storage.objects;
create policy chat_media_insert_member on storage.objects
  for insert to authenticated with check (
    bucket_id = 'chat-media'
    and public.can_access_conversation(public.conversation_from_path(name))
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

-- ===========================================================================
-- Seed: temas del Q&A y responsables oficiales. Los publishers asignados son
-- los de la Sesión 4 (ids estables del seed del feed); los tutores se asignan
-- después vía topic_assignees (política de admin). Idempotente.
-- ===========================================================================

insert into public.topics (id, name, emoji, description, sort_order)
values
  ('mallas',      'Mallas y ramos',      '📚', 'Mallas curriculares, tomas de ramos, convalidaciones y electivos.', 1),
  ('becas',       'Becas y beneficios',  '🎓', 'Becas internas, gratuidad, TNE y beneficios estudiantiles.',        2),
  ('deportes',    'Deportes',            '⚽', 'Selecciones, talleres deportivos y uso de instalaciones.',          3),
  ('fiestas',     'Fiestas y eventos',   '🎉', 'Carretes, fiestas de la federación y eventos del campus.',          4),
  ('intercambio', 'Intercambio',         '✈️', 'Programas de intercambio, requisitos y postulaciones.',             5),
  ('practicas',   'Prácticas y empleo',  '💼', 'Prácticas profesionales, bolsa de trabajo y CV.',                   6),
  ('vida-campus', 'Vida en el campus',   '🏫', 'Casinos, estacionamientos, salas de estudio y vida universitaria.', 7)
on conflict (id) do update set
  name        = excluded.name,
  emoji       = excluded.emoji,
  description = excluded.description,
  sort_order  = excluded.sort_order;

-- Federaciones/departamentos responsables por tema (seed de la Sesión 4):
-- FEUAI → fiestas y vida de campus; DAE → becas e intercambio;
-- Deportes UAI → deportes; CAI Ingeniería → mallas; DAE → prácticas.
insert into public.topic_assignees (topic_id, publisher_id)
values
  ('fiestas',     'c04f0001-0000-4000-8000-000000000001'),
  ('vida-campus', 'c04f0001-0000-4000-8000-000000000001'),
  ('becas',       'c04f0001-0000-4000-8000-000000000003'),
  ('intercambio', 'c04f0001-0000-4000-8000-000000000003'),
  ('practicas',   'c04f0001-0000-4000-8000-000000000003'),
  ('deportes',    'c04f0001-0000-4000-8000-000000000004'),
  ('mallas',      'c04f0001-0000-4000-8000-000000000005')
on conflict (topic_id, publisher_id) where publisher_id is not null do nothing;
