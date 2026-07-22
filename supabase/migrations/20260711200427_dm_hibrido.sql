-- Unities — Sesión DM híbrido (anti-bullying).
-- Regla: un alumno solo puede ABRIR un DM con alguien si (a) comparten un
-- viaje con reserva CONFIRMADA (conductor↔pasajero en cualquier dirección, o
-- copasajeros del mismo trip) o (b) alguno de los dos es cuenta oficial
-- (tutor/admin/owner). Cero DM libre alumno↔alumno.
--
-- Piezas:
-- 1) can_start_dm(a, b) — la regla en un solo lugar (+ helpers).
-- 2) start_dm la exige antes de CREAR la conversación (las existentes se
--    devuelven tal cual: cerrar hilos históricos no es objetivo).
-- 3) Defensa en profundidad: triggers de INSERT en conversations y
--    conversation_members re-validan cualquier escritura de origen usuario
--    (auth.uid() presente), venga por el RPC o por cualquier vía futura.
--    conversations/messages siguen SIN políticas de INSERT/UPDATE/DELETE
--    directas para clientes: crear pasa únicamente por el RPC.
-- 4) list_dm_contacts() — directorio mínimo del composer "nuevo mensaje":
--    cuentas oficiales + compañeros de viaje confirmados. El resto del
--    alumnado no se expone (reemplaza la búsqueda libre sobre profiles).

-- ===========================================================================
-- 1) Helpers de la regla
-- ===========================================================================

-- ¿Es p_user una cuenta oficial (tutor/admin/owner)? Variante por-usuario de
-- can_publish(), que solo evalúa a auth.uid().
create or replace function public.is_official_account(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = p_user and account_role in ('tutor', 'admin', 'owner')
  );
$$;

-- Solo se evalúa en contexto de servidor (RPCs/triggers definer): sin EXECUTE
-- para roles de cliente, así nadie sondea roles ni relaciones ajenas.
revoke execute on function public.is_official_account(uuid) from public, anon, authenticated;

-- ¿Comparten p_a y p_b un viaje con reserva confirmada? Cuenta el par
-- conductor↔pasajero (cualquier dirección) y los copasajeros del mismo trip.
-- SECURITY DEFINER: necesita ver bookings ajenos que la RLS no muestra.
create or replace function public.shares_confirmed_trip(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bookings b
    join public.trips t on t.id = b.trip_id
    where b.status = 'confirmed'
      and ((t.driver_id = p_a and b.passenger_id = p_b)
        or (t.driver_id = p_b and b.passenger_id = p_a))
  ) or exists (
    select 1
    from public.bookings ba
    join public.bookings bb on bb.trip_id = ba.trip_id
    where ba.status = 'confirmed' and ba.passenger_id = p_a
      and bb.status = 'confirmed' and bb.passenger_id = p_b
  );
$$;

revoke execute on function public.shares_confirmed_trip(uuid, uuid) from public, anon, authenticated;

-- La regla del DM híbrido. Simétrica: si cualquiera de los dos es cuenta
-- oficial el DM procede (tutor→alumno y alumno→tutor), y entre alumnos exige
-- el viaje confirmado compartido.
create or replace function public.can_start_dm(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_a is not null and p_b is not null and p_a <> p_b and (
    public.is_official_account(p_a)
    or public.is_official_account(p_b)
    or public.shares_confirmed_trip(p_a, p_b)
  );
$$;

revoke execute on function public.can_start_dm(uuid, uuid) from public, anon, authenticated;

-- dm_key ('<uuid menor>:<uuid mayor>') → array [menor, mayor]; null si el
-- formato no calza (mismo estilo de cast seguro que conversation_from_path).
create or replace function public.dm_key_users(p_key text)
returns uuid[]
language plpgsql
immutable
set search_path = public
as $$
declare
  v_parts text[] := string_to_array(coalesce(p_key, ''), ':');
begin
  if coalesce(array_length(v_parts, 1), 0) <> 2 then
    return null;
  end if;
  return array[v_parts[1]::uuid, v_parts[2]::uuid];
exception when others then
  return null;
end;
$$;

revoke execute on function public.dm_key_users(text) from public, anon, authenticated;

-- ===========================================================================
-- 2) start_dm valida la regla antes de crear
-- ===========================================================================

-- DM 1-a-1: devuelve la conversación existente del par o la crea (validando
-- la regla del DM híbrido) con ambas membresías. dm_key = '<menor>:<mayor>'
-- evita duplicados, con on conflict para la carrera de aperturas simultáneas.
create or replace function public.start_dm(p_other_user uuid)
returns public.conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_key  text;
  v_conv public.conversations;
begin
  if v_uid is null then
    raise exception 'Necesitas iniciar sesión';
  end if;
  if p_other_user is null or p_other_user = v_uid then
    raise exception 'Elige a otra persona para chatear';
  end if;
  if not exists (select 1 from public.profiles where id = p_other_user) then
    raise exception 'El usuario no existe';
  end if;

  v_key := least(v_uid, p_other_user)::text || ':' || greatest(v_uid, p_other_user)::text;

  -- El DM existente se devuelve sin re-validar: la regla gobierna la
  -- APERTURA de hilos nuevos, no el acceso a los históricos (p. ej. escribir
  -- al conductor por un objeto olvidado tras completarse el viaje).
  select * into v_conv from public.conversations where dm_key = v_key;
  if found then
    return v_conv;
  end if;

  -- DM híbrido anti-bullying: compañeros de viaje confirmado o cuenta oficial.
  if not public.can_start_dm(v_uid, p_other_user) then
    raise exception 'Solo puedes chatear con compañeros de un viaje confirmado o con cuentas oficiales (tutores y equipo Unities)'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.conversations (kind, dm_key, created_by)
  values ('dm', v_key, v_uid)
  on conflict (dm_key) do nothing
  returning * into v_conv;

  if v_conv.id is null then
    -- Carrera: otro request la creó entre el select y el insert.
    select * into v_conv from public.conversations where dm_key = v_key;
  end if;

  insert into public.conversation_members (conversation_id, user_id)
  values (v_conv.id, v_uid), (v_conv.id, p_other_user)
  on conflict do nothing;

  return v_conv;
end;
$$;

-- Grants como en la Sesión 6 (create or replace los preserva; explícitos por
-- claridad).
revoke execute on function public.start_dm(uuid) from public, anon;
grant execute on function public.start_dm(uuid) to authenticated;

-- ===========================================================================
-- 3) Defensa en profundidad: la regla también se exige a nivel de fila
-- ===========================================================================

-- Guardia de INSERT en conversations. Para kind='dm': el dm_key debe ser un
-- par válido y ordenado; y si el insert nace de un request de usuario
-- (auth.uid() presente — también dentro de funciones security definer), el
-- creador debe ser parte del par y el par cumplir can_start_dm. Contextos
-- puros de servidor (migraciones, consola, service_role sin JWT de usuario)
-- no se bloquean.
create or replace function public.enforce_dm_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_pair uuid[];
begin
  if new.kind <> 'dm' then
    return new;
  end if;

  v_pair := public.dm_key_users(new.dm_key);
  if v_pair is null or v_pair[1] >= v_pair[2] then
    raise exception 'dm_key inválido' using errcode = 'check_violation';
  end if;

  if v_uid is not null then
    if v_uid <> v_pair[1] and v_uid <> v_pair[2] then
      raise exception 'Solo puedes abrir DMs de los que formas parte'
        using errcode = 'insufficient_privilege';
    end if;
    if new.created_by is distinct from v_uid then
      raise exception 'created_by debe ser quien abre el DM'
        using errcode = 'check_violation';
    end if;
    if not public.can_start_dm(v_pair[1], v_pair[2]) then
      raise exception 'Solo puedes chatear con compañeros de un viaje confirmado o con cuentas oficiales (tutores y equipo Unities)'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_dm_conversation() from public, anon, authenticated;

drop trigger if exists conversations_enforce_dm on public.conversations;
create trigger conversations_enforce_dm before insert on public.conversations
  for each row execute function public.enforce_dm_conversation();

-- Guardia de INSERT en conversation_members: en un DM solo pueden ser
-- miembros los dos usuarios del dm_key. Con la guardia de conversations,
-- cierra el circuito: las membresías (y por tanto la RLS de messages, que
-- exige membresía) solo existen para pares validados. Los tickets de soporte
-- mantienen su flujo (creador + agentes vía mark_conversation_read).
create or replace function public.enforce_dm_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv public.conversations;
  v_pair uuid[];
begin
  select * into v_conv from public.conversations where id = new.conversation_id;
  if not found or v_conv.kind <> 'dm' then
    return new;  -- inexistente lo rechaza la FK; soporte sigue su flujo
  end if;

  v_pair := public.dm_key_users(v_conv.dm_key);
  if v_pair is null or (new.user_id <> v_pair[1] and new.user_id <> v_pair[2]) then
    raise exception 'En un DM solo participan los dos usuarios del par'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_dm_membership() from public, anon, authenticated;

drop trigger if exists conversation_members_enforce_dm on public.conversation_members;
create trigger conversation_members_enforce_dm before insert on public.conversation_members
  for each row execute function public.enforce_dm_membership();

-- ===========================================================================
-- 4) Directorio mínimo del composer "nuevo mensaje"
-- ===========================================================================

-- Con quién puede iniciar DM el usuario actual: cuentas oficiales (tutores y
-- equipo) + compañeros de viaje con reserva confirmada (conductores de mis
-- reservas, pasajeros confirmados de mis viajes como conductor y copasajeros
-- de mis trips). No expone al resto del alumnado. SECURITY DEFINER: los
-- copasajeros no son visibles con la RLS de bookings del caller.
create or replace function public.list_dm_contacts()
returns table (id uuid, full_name text, avatar_url text, is_official boolean)
language sql
stable
security definer
set search_path = public
as $$
  with companions as (
    select t.driver_id as user_id
    from public.bookings b
    join public.trips t on t.id = b.trip_id
    where b.passenger_id = auth.uid() and b.status = 'confirmed'
    union
    select b.passenger_id
    from public.bookings b
    join public.trips t on t.id = b.trip_id
    where t.driver_id = auth.uid() and b.status = 'confirmed'
    union
    select b2.passenger_id
    from public.bookings b1
    join public.bookings b2 on b2.trip_id = b1.trip_id
    where b1.passenger_id = auth.uid()
      and b1.status = 'confirmed' and b2.status = 'confirmed'
  )
  select p.id, p.full_name, p.avatar_url,
         (p.account_role in ('tutor', 'admin', 'owner')) as is_official
  from public.profiles p
  where p.id <> auth.uid()
    and (
      p.account_role in ('tutor', 'admin', 'owner')
      or p.id in (select user_id from companions)
    )
  order by (p.account_role in ('tutor', 'admin', 'owner')) desc,
           lower(coalesce(p.full_name, p.email)) asc;
$$;

revoke execute on function public.list_dm_contacts() from public, anon;
grant execute on function public.list_dm_contacts() to authenticated;
