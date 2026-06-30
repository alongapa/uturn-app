-- UTurn — esquema inicial
-- Ejecutar con: supabase db push  (o pegar en el SQL editor del proyecto)
-- Es idempotente: se puede correr varias veces sin error.

-- ============================================================
-- Teardown (borra lo de una corrida previa para poder re-ejecutar)
-- ============================================================
drop policy if exists "subir screenshot propio" on storage.objects;
drop policy if exists "ver screenshot propio o admin" on storage.objects;

drop trigger if exists on_auth_user_created on auth.users;

drop table if exists verification_requests cascade;
drop table if exists tutoring_sessions cascade;
drop table if exists ratings cascade;
drop table if exists bookings cascade;
drop table if exists trips cascade;
drop table if exists benefits cascade;
drop table if exists institutional_emails cascade;
drop table if exists profiles cascade;

drop function if exists is_admin() cascade;
drop function if exists is_email_registered(text) cascade;
drop function if exists handle_new_user() cascade;

drop type if exists user_role cascade;
drop type if exists reputation_tier cascade;
drop type if exists verify_status cascade;
drop type if exists trip_status cascade;
drop type if exists booking_status cascade;
drop type if exists tutoring_status cascade;

-- ============================================================
-- Tipos enumerados
-- ============================================================
create type user_role        as enum ('user', 'admin');
create type reputation_tier  as enum ('novato', 'habitual', 'confiable', 'elite');
create type verify_status     as enum ('unverified', 'pending', 'verified', 'rejected');
create type trip_status       as enum ('active', 'completed', 'cancelled');
create type booking_status    as enum ('reserved', 'cancelled', 'completed');
create type tutoring_status   as enum ('pending', 'confirmed', 'completed', 'cancelled');

-- ============================================================
-- profiles — extiende auth.users (1:1)
-- ============================================================
create table profiles (
  id                          uuid primary key references auth.users on delete cascade,
  name                        text not null,
  email                       text not null,
  university_id               text not null,
  role                        user_role not null default 'user',
  rating                      numeric(2,1) not null default 0,
  tier                        reputation_tier not null default 'novato',
  completed_trips_driver      int not null default 0,
  completed_trips_passenger   int not null default 0,
  completed_tutoring          int not null default 0,
  uturn_credits               int not null default 0,
  car_model                   text,
  bio                         text,
  verification_status         verify_status not null default 'unverified',
  created_at                  timestamptz not null default now()
);

-- ============================================================
-- trips
-- ============================================================
create table trips (
  id                     uuid primary key default gen_random_uuid(),
  driver_id              uuid not null references profiles on delete cascade,
  dest                   text not null,
  meet_point             text not null,
  price                  int not null,
  seats                  int not null,
  depart_at              timestamptz not null,
  route_notes            text,
  origin_campus_id       text not null,
  destination_campus_id  text,
  meeting_point_id       text not null,
  status                 trip_status not null default 'active',
  created_at             timestamptz not null default now()
);
create index trips_depart_at_idx on trips (depart_at);
create index trips_driver_idx on trips (driver_id);

-- ============================================================
-- bookings
-- ============================================================
create table bookings (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references trips on delete cascade,
  passenger_id  uuid not null references profiles on delete cascade,
  status        booking_status not null default 'reserved',
  seat          text,
  created_at    timestamptz not null default now(),
  unique (trip_id, passenger_id)
);

-- ============================================================
-- ratings (por categoría, alimentan la reputación)
-- ============================================================
create table ratings (
  id               uuid primary key default gen_random_uuid(),
  from_id          uuid not null references profiles on delete cascade,
  to_id            uuid not null references profiles on delete cascade,
  trip_id          uuid references trips on delete set null,
  stars            int not null check (stars between 1 and 5),
  punctuality      int check (punctuality between 1 and 5),
  driving_quality  int check (driving_quality between 1 and 5),
  price            int check (price between 1 and 5),
  disposition      int check (disposition between 1 and 5),
  note             text,
  created_at       timestamptz not null default now()
);

-- ============================================================
-- tutoring_sessions (asesorías)
-- ============================================================
create table tutoring_sessions (
  id                uuid primary key default gen_random_uuid(),
  tutor_id          uuid not null references profiles on delete cascade,
  student_id        uuid not null references profiles on delete cascade,
  subject_name      text not null,
  scheduled_at      timestamptz not null,
  duration_minutes  int not null default 60,
  price             int not null,
  paid_with_credits boolean not null default false,
  status            tutoring_status not null default 'pending',
  rating            int check (rating between 1 and 5),
  note              text,
  created_at        timestamptz not null default now()
);

-- ============================================================
-- benefits (recompensas por tier)
-- ============================================================
create table benefits (
  id            uuid primary key default gen_random_uuid(),
  partner       text not null,
  description   text not null,
  category      text not null,
  required_tier reputation_tier not null,
  discount      text,
  detail        text,
  icon          text,
  created_at    timestamptz not null default now()
);

-- ============================================================
-- institutional_emails — padrón oficial (sensible: solo admin/función)
-- ============================================================
create table institutional_emails (
  id            uuid primary key default gen_random_uuid(),
  university_id text not null,
  email         text not null unique,
  created_at    timestamptz not null default now()
);

-- ============================================================
-- verification_requests — cola de revisión de screenshots InfoAlumno
-- ============================================================
create table verification_requests (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles on delete cascade,
  university_id    text not null,
  screenshot_path  text not null,            -- ruta en el bucket 'intranet-screenshots'
  status           verify_status not null default 'pending',
  ocr_name         text,                     -- nombre extraído del screenshot
  name_match_score numeric(3,2),             -- 0..1 contra profiles.name
  reviewed_by      uuid references profiles,
  created_at       timestamptz not null default now()
);

-- ============================================================
-- Helpers
-- ============================================================
-- NOTA: las funciones SECURITY DEFINER que se disparan desde triggers en
-- auth.users (p.ej. handle_new_user) corren en una sesión cuyo search_path
-- NO incluye "public" por defecto. Sin "set search_path = public" y sin
-- calificar las tablas como "public.tabla", el insert falla con el error
-- genérico "Database error saving new user".

create or replace function is_admin()
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Chequea el padrón sin exponer la tabla completa al cliente.
create or replace function is_email_registered(p_email text)
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.institutional_emails where lower(email) = lower(p_email));
$$;

-- Crea el profile automáticamente al registrarse un usuario en auth.
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
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table profiles               enable row level security;
alter table trips                  enable row level security;
alter table bookings               enable row level security;
alter table ratings                enable row level security;
alter table tutoring_sessions      enable row level security;
alter table benefits               enable row level security;
alter table institutional_emails   enable row level security;
alter table verification_requests  enable row level security;

-- profiles: cualquiera autenticado puede ver perfiles (info de conductor);
-- cada uno edita el suyo; admin todo.
create policy profiles_select on profiles for select to authenticated using (true);
create policy profiles_update_self on profiles for update to authenticated using (id = auth.uid());
create policy profiles_admin_all on profiles for all to authenticated using (is_admin()) with check (is_admin());

-- trips: ver todos; crear/editar los propios (como conductor).
create policy trips_select on trips for select to authenticated using (true);
create policy trips_insert_own on trips for insert to authenticated with check (driver_id = auth.uid());
create policy trips_update_own on trips for update to authenticated using (driver_id = auth.uid());

-- bookings: ver las propias (pasajero) o de viajes que conduces; crear las propias.
create policy bookings_select on bookings for select to authenticated using (
  passenger_id = auth.uid()
  or exists (select 1 from trips t where t.id = trip_id and t.driver_id = auth.uid())
);
create policy bookings_insert_own on bookings for insert to authenticated with check (passenger_id = auth.uid());
create policy bookings_update_own on bookings for update to authenticated using (
  passenger_id = auth.uid()
  or exists (select 1 from trips t where t.id = trip_id and t.driver_id = auth.uid())
);

-- ratings: ver las propias; crear las que tú emites.
create policy ratings_select on ratings for select to authenticated using (from_id = auth.uid() or to_id = auth.uid());
create policy ratings_insert_own on ratings for insert to authenticated with check (from_id = auth.uid());

-- tutoring: ver/editar las propias (como tutor o alumno).
create policy tutoring_select on tutoring_sessions for select to authenticated using (tutor_id = auth.uid() or student_id = auth.uid());
create policy tutoring_insert on tutoring_sessions for insert to authenticated with check (student_id = auth.uid() or tutor_id = auth.uid());
create policy tutoring_update on tutoring_sessions for update to authenticated using (tutor_id = auth.uid() or student_id = auth.uid());

-- benefits: lectura pública para autenticados; gestión solo admin.
create policy benefits_select on benefits for select to authenticated using (true);
create policy benefits_admin on benefits for all to authenticated using (is_admin()) with check (is_admin());

-- institutional_emails: SOLO admin (el cliente usa is_email_registered()).
create policy emails_admin on institutional_emails for all to authenticated using (is_admin()) with check (is_admin());

-- verification_requests: crear/ver las propias; admin gestiona todo.
create policy verif_insert_own on verification_requests for insert to authenticated with check (user_id = auth.uid());
create policy verif_select_own on verification_requests for select to authenticated using (user_id = auth.uid() or is_admin());
create policy verif_admin on verification_requests for update to authenticated using (is_admin());

-- ============================================================
-- Storage: bucket privado para screenshots de intranet
-- ============================================================
insert into storage.buckets (id, name, public) values ('intranet-screenshots', 'intranet-screenshots', false)
on conflict (id) do nothing;

create policy "subir screenshot propio"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'intranet-screenshots' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "ver screenshot propio o admin"
  on storage.objects for select to authenticated
  using (bucket_id = 'intranet-screenshots' and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));
