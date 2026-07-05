-- Unities — Sesión 4: bucket feed-media + seed del feed.
-- Bucket privado (URL firmada al leer, como avatars/credentials). Solo los
-- roles que publican (can_publish) escriben, en su carpeta `<uid>/…`.

insert into storage.buckets (id, name, public)
values ('feed-media', 'feed-media', false)
on conflict (id) do nothing;

drop policy if exists feed_media_select on storage.objects;
create policy feed_media_select on storage.objects
  for select to authenticated using (bucket_id = 'feed-media');

drop policy if exists feed_media_insert_publisher on storage.objects;
create policy feed_media_insert_publisher on storage.objects
  for insert to authenticated with check (
    bucket_id = 'feed-media'
    and public.can_publish()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- El upsert de Storage necesita INSERT + SELECT + UPDATE (checklist Supabase).
drop policy if exists feed_media_update_publisher on storage.objects;
create policy feed_media_update_publisher on storage.objects
  for update to authenticated
  using (
    bucket_id = 'feed-media'
    and public.can_publish()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'feed-media'
    and public.can_publish()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists feed_media_delete_publisher on storage.objects;
create policy feed_media_delete_publisher on storage.objects
  for delete to authenticated using (
    bucket_id = 'feed-media'
    and (
      public.is_admin()
      or (public.can_publish() and (storage.foldername(name))[1] = (select auth.uid())::text)
    )
  );

-- ===========================================================================
-- Seed: entidades publicadoras reales de la UAI + contenido de demo.
-- ids fijos para que el seed sea idempotente. La media del seed usa URLs
-- http(s) (picsum) que la app muestra tal cual; el contenido real subirá
-- rutas del bucket feed-media. Las fechas de eventos son relativas a now()
-- para que el widget semanal siempre tenga datos al aplicar el seed.
-- ===========================================================================

insert into public.publishers (id, slug, name, kind, university_id, description)
values
  ('c04f0001-0000-4000-8000-000000000001', 'feuai',          'FEUAI',                             'federacion',     'uai', 'Federación de Estudiantes de la Universidad Adolfo Ibáñez.'),
  ('c04f0001-0000-4000-8000-000000000002', 'uai',            'Universidad Adolfo Ibáñez',         'universidad',    'uai', 'Cuenta oficial de la UAI.'),
  ('c04f0001-0000-4000-8000-000000000003', 'dae-uai',        'DAE UAI',                           'departamento',   'uai', 'Dirección de Asuntos Estudiantiles.'),
  ('c04f0001-0000-4000-8000-000000000004', 'deportes-uai',   'Deportes UAI',                      'departamento',   'uai', 'Selecciones, talleres y vida deportiva del campus.'),
  ('c04f0001-0000-4000-8000-000000000005', 'cai-ingenieria', 'CAI — Centro de Alumnos Ingeniería','centro_alumnos', 'uai', 'Centro de alumnos de la Facultad de Ingeniería y Ciencias.'),
  ('c04f0001-0000-4000-8000-000000000006', 'ca-derecho',     'CADe — Centro de Alumnos Derecho',  'centro_alumnos', 'uai', 'Centro de alumnos de la Facultad de Derecho.'),
  ('c04f0001-0000-4000-8000-000000000007', 'ca-negocios',    'CAN — Centro de Alumnos Negocios',  'centro_alumnos', 'uai', 'Centro de alumnos de la Escuela de Negocios.'),
  ('c04f0001-0000-4000-8000-000000000008', 'ca-psicologia',  'CAPs — Centro de Alumnos Psicología','centro_alumnos','uai', 'Centro de alumnos de la Escuela de Psicología.'),
  ('c04f0001-0000-4000-8000-000000000009', 'ca-diseno',      'CAD — Centro de Alumnos Diseño',    'centro_alumnos', 'uai', 'Centro de alumnos de Design Lab.'),
  ('c04f0001-0000-4000-8000-00000000000a', 'cafeteria-central', 'Cafetería Central',              'marca',          'uai', 'Café de especialidad en el campus. Auspiciador Unities.'),
  ('c04f0001-0000-4000-8000-00000000000b', 'copec',          'Copec',                             'marca',          null,  'Beneficios en bencina para conductores Unities.')
on conflict (slug) do update set
  name          = excluded.name,
  kind          = excluded.kind,
  university_id = excluded.university_id,
  description   = excluded.description;

insert into public.posts
  (id, publisher_id, post_type, body, media, event_starts_at, event_location, discount_code, discount_terms, redeemable_id, created_at)
values
  -- Noticia simple (FEUAI)
  ('d04f0002-0000-4000-8000-000000000001', 'c04f0001-0000-4000-8000-000000000001', 'noticia',
   '¡Partió el semestre! 📚 Revisa los horarios de atención de la FEUAI en la oficina del piso 2 del edificio C. Te esperamos con café.',
   '[]'::jsonb, null, null, null, null, null, now() - interval '6 hours'),

  -- Evento dentro de la semana (FEUAI) enlazado a un canjeable de la Sesión 2
  ('d04f0002-0000-4000-8000-000000000002', 'c04f0001-0000-4000-8000-000000000001', 'evento',
   'Fiesta Mechona 2026 🎉 La bienvenida oficial del semestre. Entradas limitadas: canjea la tuya con créditos Unities o cómprala en la puerta.',
   '["https://picsum.photos/seed/unities-mechona/900/600"]'::jsonb,
   now() + interval '3 days', 'Quincho Campus Peñalolén', null, null, 'redeem-evento', now() - interval '1 day'),

  -- Evento deportivo dentro de la semana (Deportes UAI)
  ('d04f0002-0000-4000-8000-000000000003', 'c04f0001-0000-4000-8000-000000000004', 'evento',
   'Corrida UAI 5K 🏃 Inscríbete gratis y corre por el parque del campus. Hidratación y frutas para todos los que lleguen a la meta.',
   '["https://picsum.photos/seed/unities-corrida/900/600"]'::jsonb,
   now() + interval '5 days', 'Entrada principal Campus Peñalolén', null, null, null, now() - interval '20 hours'),

  -- Carrete (galería de varias imágenes, CAI)
  ('d04f0002-0000-4000-8000-000000000004', 'c04f0001-0000-4000-8000-000000000005', 'noticia',
   'Así se vivió el Torneo de Programación de Ingeniería 💻 ¡Gracias a todos los equipos! Los resultados completos en nuestra bio.',
   '["https://picsum.photos/seed/unities-hack1/900/600","https://picsum.photos/seed/unities-hack2/900/600","https://picsum.photos/seed/unities-hack3/900/600"]'::jsonb,
   null, null, null, null, null, now() - interval '2 days'),

  -- Activación de marca (Cafetería Central)
  ('d04f0002-0000-4000-8000-000000000005', 'c04f0001-0000-4000-8000-00000000000a', 'activacion',
   'Mañana estaremos en el hall central con degustación gratis de cold brew ☕ Pasa después de clases y llévate un descuento sorpresa.',
   '["https://picsum.photos/seed/unities-cafe/900/600"]'::jsonb,
   now() + interval '1 day', 'Hall central, Campus Peñalolén', null, null, null, now() - interval '10 hours'),

  -- Descuento con código (Cafetería Central → canjeable de café)
  ('d04f0002-0000-4000-8000-000000000006', 'c04f0001-0000-4000-8000-00000000000a', 'descuento',
   '20% de descuento en cualquier café de especialidad para la comunidad Unities.',
   '[]'::jsonb, null, null, 'UNITIES20', 'Muestra este código en caja. Válido de lunes a viernes hasta fin de mes. Un uso por persona al día.',
   'redeem-cafe', now() - interval '3 days'),

  -- Descuento para conductores (Copec → canjeable de bencina)
  ('d04f0002-0000-4000-8000-000000000007', 'c04f0001-0000-4000-8000-00000000000b', 'descuento',
   '⛽ $3.000 de descuento en carga de bencina para conductores Unities con viajes completados este mes.',
   '[]'::jsonb, null, null, 'COPEC3000', 'Canjeable con créditos Unities en estaciones adheridas presentando el código QR de tu canje.',
   'redeem-bencina', now() - interval '4 days'),

  -- Noticia institucional (DAE)
  ('d04f0002-0000-4000-8000-000000000008', 'c04f0001-0000-4000-8000-000000000003', 'noticia',
   'Postulaciones abiertas a las becas de fotocopia y alimentación del semestre. Tienes plazo hasta el viernes en dae.uai.cl.',
   '[]'::jsonb, null, null, null, null, null, now() - interval '30 hours'),

  -- Evento cultural dentro de la semana (CADe)
  ('d04f0002-0000-4000-8000-000000000009', 'c04f0001-0000-4000-8000-000000000006', 'evento',
   'Ciclo de charlas: "Derecho y tecnología" con invitados de la industria. Cupos limitados, inscríbete en el link de la bio.',
   '[]'::jsonb, now() + interval '6 days', 'Auditorio Edificio D', null, null, null, now() - interval '8 hours')
on conflict (id) do nothing;

-- Historias activas (24 h desde que se aplica el seed).
insert into public.stories (id, publisher_id, media_path, caption, created_at, expires_at)
values
  ('e04f0003-0000-4000-8000-000000000001', 'c04f0001-0000-4000-8000-000000000001',
   'https://picsum.photos/seed/unities-story-feuai/720/1280', 'Semana de bienvenida 💙', now(), now() + interval '24 hours'),
  ('e04f0003-0000-4000-8000-000000000002', 'c04f0001-0000-4000-8000-000000000004',
   'https://picsum.photos/seed/unities-story-deportes/720/1280', 'Entrenamiento abierto hoy 18:00', now(), now() + interval '24 hours'),
  ('e04f0003-0000-4000-8000-000000000003', 'c04f0001-0000-4000-8000-000000000005',
   'https://picsum.photos/seed/unities-story-cai/720/1280', 'Resultados del torneo 👀', now(), now() + interval '24 hours')
on conflict (id) do nothing;
