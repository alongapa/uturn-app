-- ===========================================================================
-- Feature flags (Sesión 10)
-- ===========================================================================
--
-- Para qué: poder apagar un módulo en producción sin publicar una versión nueva
-- ni esperar una OTA. Si los pagos con Fintoc fallan en pleno piloto, el owner
-- apaga la bandera y la app degrada al flujo manual en el próximo arranque.
--
-- Deliberadamente simple: una tabla de clave/valor booleano, legible por
-- cualquier usuario autenticado y escribible SOLO por el owner. No es un
-- sistema de segmentación ni de rollout por porcentaje — eso sería construir
-- una plataforma para un piloto universitario.
--
-- El default de cada bandera vive en el CLIENTE (constants/feature-flags.ts) y
-- no acá: si la tabla no responde (sin red, Supabase caído), la app tiene que
-- seguir funcionando con un valor conocido en vez de quedar en blanco.

create table if not exists public.feature_flags (
  key         text primary key,
  enabled     boolean not null default true,
  -- Para qué sirve la bandera. Se lee en el panel de admin, así que quien la
  -- apague a las 3 AM sepa qué está apagando.
  description text not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id) on delete set null
);

comment on table public.feature_flags is
  'Interruptores de módulos para producción (Sesión 10). Lee: authenticated. Escribe: solo owner.';

alter table public.feature_flags enable row level security;

-- Lectura: cualquier sesión iniciada. No hay nada sensible en una bandera, y
-- el cliente necesita leerlas al arrancar.
drop policy if exists feature_flags_select on public.feature_flags;
create policy feature_flags_select
  on public.feature_flags for select
  to authenticated
  using (true);

-- Escritura: solo owner. Un admin de federación no puede apagarle los pagos a
-- toda la plataforma.
drop policy if exists feature_flags_write on public.feature_flags;
create policy feature_flags_write
  on public.feature_flags for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.account_role = 'owner'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.account_role = 'owner'
    )
  );

-- Deja constancia de quién y cuándo tocó el interruptor.
--
-- security INVOKER, no definer: solo escribe dos columnas de la fila que el
-- trigger ya está modificando, y quien llega hasta acá ya pasó la RLS. Con
-- `security definer` quedaba además expuesta como RPC en /rest/v1/rpc para
-- anon y authenticated (lo detectó el advisor de Supabase); el revoke de abajo
-- cierra esa puerta igual.
create or replace function public.feature_flags_touch()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

-- Es una función de trigger: no tiene por qué ser invocable como RPC.
revoke execute on function public.feature_flags_touch() from public, anon, authenticated;

drop trigger if exists feature_flags_touch_trg on public.feature_flags;
create trigger feature_flags_touch_trg
  before update on public.feature_flags
  for each row execute function public.feature_flags_touch();

-- Semilla: las banderas que el piloto necesita poder apagar. `on conflict do
-- nothing` para que reaplicar la migración no reactive algo apagado a mano.
insert into public.feature_flags (key, enabled, description) values
  ('pagos_fintoc',   true,  'Verificación automática de transferencias con Fintoc. Apagado: el pago vuelve a confirmarlo el conductor a mano.'),
  ('pagos_creditos', true,  'Pagar parte del cupo con créditos Unities.'),
  ('feed',           true,  'Feed social: publicaciones, historias y widgets.'),
  ('mensajes',       true,  'Mensajería directa y chats de viaje.'),
  ('bots_ia',        true,  'Bots de tutoría con IA. Apagado: los bots dejan de responder (el costo por token se corta al tiro).'),
  ('canjes',         true,  'Catálogo de canjes y redenciones.'),
  ('tutorias',       true,  'Tutorías, preguntas y guías.')
on conflict (key) do nothing;

grant select on public.feature_flags to authenticated;
grant insert, update, delete on public.feature_flags to authenticated; -- filtrado por RLS
