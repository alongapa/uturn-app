-- Uturn — Sesión 3: Storage.
-- Dos buckets privados; el acceso siempre por URL firmada (createSignedUrl).
-- Convención de rutas: `<uid>/<archivo>` — la primera carpeta es el id del dueño.
--   avatars/<uid>/avatar.jpg
--   credentials/<uid>/intranet.jpg

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('credentials', 'credentials', false)
on conflict (id) do nothing;

-- --- avatars ---------------------------------------------------------------
-- Cualquier autenticado puede ver avatares (fotos de conductores/pasajeros),
-- pero solo el dueño escribe en su carpeta.
drop policy if exists avatars_select on storage.objects;
create policy avatars_select on storage.objects
  for select using (bucket_id = 'avatars' and auth.role() = 'authenticated');

drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own on storage.objects
  for insert with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects
  for update using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects
  for delete using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- --- credentials -----------------------------------------------------------
-- Privado de verdad: solo el dueño (y admin/owner para moderar) puede leer las
-- capturas de credencial universitaria.
drop policy if exists credentials_select_own on storage.objects;
create policy credentials_select_own on storage.objects
  for select using (
    bucket_id = 'credentials'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

drop policy if exists credentials_insert_own on storage.objects;
create policy credentials_insert_own on storage.objects
  for insert with check (
    bucket_id = 'credentials' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists credentials_update_own on storage.objects;
create policy credentials_update_own on storage.objects
  for update using (
    bucket_id = 'credentials' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists credentials_delete_own on storage.objects;
create policy credentials_delete_own on storage.objects
  for delete using (
    bucket_id = 'credentials' and (storage.foldername(name))[1] = auth.uid()::text
  );
