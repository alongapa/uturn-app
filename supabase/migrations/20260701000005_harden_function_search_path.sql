-- Uturn — Sesión 3: endurecimiento. Fija search_path en las funciones que no lo
-- tenían (advisor function_search_path_mutable). Solo usan built-ins de pg_catalog
-- o referencias ya calificadas (public.*), así que un search_path vacío es seguro.

alter function public.set_updated_at()             set search_path = '';
alter function public.gen_redemption_code()        set search_path = '';
alter function public.is_university_email(text)     set search_path = '';
-- enforce_university_email llama a public.is_university_email (ya calificado):
alter function public.enforce_university_email()    set search_path = public;
