-- Unities — Sesión 5: seed del panel de administración.
-- ids fijos para que el seed sea idempotente (mismo patrón de la Sesión 4).
-- No siembra publisher_members ni propuestas de canjeables: dependen de
-- usuarios reales de auth.users (el owner los asigna desde su vista).

-- Marcas asociadas: co-firman promociones y activaciones (posts.brand_id).
insert into public.brands (id, publisher_id, name, logo_path)
values
  -- Red Bull auspicia eventos de la FEUAI ("¡Evento Red Bull!").
  ('b05f0001-0000-4000-8000-000000000001', 'c04f0001-0000-4000-8000-000000000001',
   'Red Bull', 'https://picsum.photos/seed/unities-brand-redbull/200/200'),
  -- La cafetería co-firma sus propias activaciones como marca.
  ('b05f0001-0000-4000-8000-000000000002', 'c04f0001-0000-4000-8000-00000000000a',
   'Cafetería Central', 'https://picsum.photos/seed/unities-brand-cafe/200/200')
on conflict (id) do nothing;

-- Widget "Eventos de la semana": la Fiesta Mechona queda fijada y destacada;
-- la Corrida ordenada después. Los eventos sin fila aquí siguen saliendo,
-- ordenados por fecha tras los configurados.
insert into public.widget_config (id, widget, post_id, sort_order, pinned, featured)
values
  ('a05f0002-0000-4000-8000-000000000001', 'eventos_semana',
   'd04f0002-0000-4000-8000-000000000002', 0, true, true),
  ('a05f0002-0000-4000-8000-000000000002', 'eventos_semana',
   'd04f0002-0000-4000-8000-000000000003', 1, false, false)
on conflict (widget, post_id) do nothing;

-- Carpetas de contenido: la de la FEUAI queda integrada al widget de galería
-- del feed; la de Deportes es interna del panel (linked_widget null).
insert into public.content_folders (id, publisher_id, name, description, linked_widget, sort_order)
values
  ('f05f0003-0000-4000-8000-000000000001', 'c04f0001-0000-4000-8000-000000000001',
   'Semana mechona 2026', 'Las mejores fotos de la bienvenida.', 'galeria', 0),
  ('f05f0003-0000-4000-8000-000000000002', 'c04f0001-0000-4000-8000-000000000004',
   'Selecciones 2026', 'Material interno para difusión deportiva.', null, 1)
on conflict (id) do nothing;

insert into public.content_items (id, folder_id, media_path, caption, sort_order)
values
  ('e05f0004-0000-4000-8000-000000000001', 'f05f0003-0000-4000-8000-000000000001',
   'https://picsum.photos/seed/unities-folder-mechona1/900/600', 'Bienvenida en el quincho', 0),
  ('e05f0004-0000-4000-8000-000000000002', 'f05f0003-0000-4000-8000-000000000001',
   'https://picsum.photos/seed/unities-folder-mechona2/900/600', 'Stands de bienvenida', 1),
  ('e05f0004-0000-4000-8000-000000000003', 'f05f0003-0000-4000-8000-000000000001',
   'https://picsum.photos/seed/unities-folder-mechona3/900/600', 'Tocata de cierre', 2),
  ('e05f0004-0000-4000-8000-000000000004', 'f05f0003-0000-4000-8000-000000000002',
   'https://picsum.photos/seed/unities-folder-deportes1/900/600', 'Selección de fútbol', 0)
on conflict (id) do nothing;
