-- Fix: las funciones SECURITY DEFINER que se disparan desde triggers en
-- auth.users (handle_new_user) corren en una sesión cuyo search_path NO
-- incluye "public" por defecto. Esto hacía fallar el registro de usuarios
-- con "Database error saving new user". Esta migración corrige las 3
-- funciones agregando "set search_path = public" y calificando las tablas.

create or replace function is_admin()
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function is_email_registered(p_email text)
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.institutional_emails where lower(email) = lower(p_email));
$$;

create or replace function handle_new_user()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, university_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'university_id', 'uai')
  );
  return new;
end;
$$;
