-- Unities — Sesión 9: Storage (evidencia de reportes, documentos de conductor)
-- y seed del filtro de palabras. Mismo patrón que dispute-evidence (Sesión 8):
-- bucket privado, ruta `<uid>/<archivo>`, acceso por URL firmada.

insert into storage.buckets (id, name, public)
values ('report-evidence', 'report-evidence', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('driver-documents', 'driver-documents', false)
on conflict (id) do nothing;

-- --- report-evidence ---------------------------------------------------------
-- Quien reporta sube su propia evidencia; tutor+ la revisa (bandeja de reportes).
drop policy if exists report_evidence_select on storage.objects;
create policy report_evidence_select on storage.objects
  for select to authenticated using (
    bucket_id = 'report-evidence'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or public.can_moderate())
  );

drop policy if exists report_evidence_insert_own on storage.objects;
create policy report_evidence_insert_own on storage.objects
  for insert to authenticated with check (
    bucket_id = 'report-evidence' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- --- driver-documents (cédula + licencia, verificación reforzada) -----------
drop policy if exists driver_documents_select on storage.objects;
create policy driver_documents_select on storage.objects
  for select to authenticated using (
    bucket_id = 'driver-documents'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or public.can_moderate())
  );

drop policy if exists driver_documents_insert_own on storage.objects;
create policy driver_documents_insert_own on storage.objects
  for insert to authenticated with check (
    bucket_id = 'driver-documents' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists driver_documents_update_own on storage.objects;
create policy driver_documents_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'driver-documents' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'driver-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- --- credentials (Sesión 3): la revisión ahora es de tutor+, no solo admin --
drop policy if exists credentials_select_own on storage.objects;
create policy credentials_select_own on storage.objects
  for select to authenticated using (
    bucket_id = 'credentials'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or public.can_moderate())
  );

-- --- Seed: filtro de palabras básico (ampliable desde la cola de moderación) --
insert into public.blocked_words (word)
values ('puta'), ('maraco'), ('conchetumadre'), ('ctm'), ('weón culiao')
on conflict (word) do nothing;
