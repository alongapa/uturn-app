-- Unities — Sesión 8: Storage para comprobantes de disputa.
-- Bucket privado; ruta `<uid>/<archivo>`. Lo lee el dueño (pasajero) y admin/owner
-- (para revisar la disputa); lo escribe solo el dueño. Mismo patrón que credentials.

insert into storage.buckets (id, name, public)
values ('dispute-evidence', 'dispute-evidence', false)
on conflict (id) do nothing;

drop policy if exists dispute_evidence_select on storage.objects;
create policy dispute_evidence_select on storage.objects
  for select to authenticated using (
    bucket_id = 'dispute-evidence'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin())
  );

drop policy if exists dispute_evidence_insert_own on storage.objects;
create policy dispute_evidence_insert_own on storage.objects
  for insert to authenticated with check (
    bucket_id = 'dispute-evidence' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists dispute_evidence_update_own on storage.objects;
create policy dispute_evidence_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'dispute-evidence' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'dispute-evidence' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists dispute_evidence_delete_own on storage.objects;
create policy dispute_evidence_delete_own on storage.objects
  for delete to authenticated using (
    bucket_id = 'dispute-evidence' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
