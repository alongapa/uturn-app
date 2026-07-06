-- Unities — Sesión 6: endurecimiento post-advisors (mismo espíritu que la
-- migración ...000005 de la Sesión 3).
-- 1) search_path fijo en conversation_from_path (lint function_search_path_mutable).
-- 2) Los helpers security definer del chat no necesitan EXECUTE para anon:
--    todas las políticas que los evalúan son `to authenticated`.
-- 3) Índices para las FKs nuevas sin cobertura (lint unindexed_foreign_keys).
-- 4) topics/topic_assignees: la política de admin pasa de `for all` a
--    insert/update/delete para no solapar el SELECT (lint multiple_permissive_policies).

-- --- 1) search_path fijo ----------------------------------------------------
create or replace function public.conversation_from_path(p_name text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
begin
  return ((string_to_array(p_name, '/'))[1])::uuid;
exception when others then
  return null;
end;
$$;

-- --- 2) sin EXECUTE para anon (ni el implícito de PUBLIC) en los helpers -----
revoke execute on function public.is_conversation_member(uuid) from public, anon;
revoke execute on function public.can_access_conversation(uuid) from public, anon;
revoke execute on function public.can_answer_question(uuid, uuid) from public, anon;
revoke execute on function public.conversation_from_path(text) from public, anon;

-- --- 3) índices de FKs ------------------------------------------------------
create index if not exists conversations_created_by_idx
  on public.conversations (created_by) where created_by is not null;
create index if not exists conversations_last_sender_idx
  on public.conversations (last_message_sender) where last_message_sender is not null;
create index if not exists question_replies_publisher_idx
  on public.question_replies (publisher_id) where publisher_id is not null;

-- --- 4) políticas de admin sin solapar el SELECT -----------------------------
drop policy if exists topics_write_admin on public.topics;
drop policy if exists topics_insert_admin on public.topics;
create policy topics_insert_admin on public.topics
  for insert to authenticated with check (public.is_admin());
drop policy if exists topics_update_admin on public.topics;
create policy topics_update_admin on public.topics
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists topics_delete_admin on public.topics;
create policy topics_delete_admin on public.topics
  for delete to authenticated using (public.is_admin());

drop policy if exists topic_assignees_write_admin on public.topic_assignees;
drop policy if exists topic_assignees_insert_admin on public.topic_assignees;
create policy topic_assignees_insert_admin on public.topic_assignees
  for insert to authenticated with check (public.is_admin());
drop policy if exists topic_assignees_update_admin on public.topic_assignees;
create policy topic_assignees_update_admin on public.topic_assignees
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists topic_assignees_delete_admin on public.topic_assignees;
create policy topic_assignees_delete_admin on public.topic_assignees
  for delete to authenticated using (public.is_admin());
