-- Unities — Verificación de identidad por correo institucional + coincidencia
-- nombre↔correo (reemplaza la captura de intranet).
--
-- Decisión de producto: el código OTP al correo institucional ya prueba que la
-- persona es dueña de un correo @universidad válido (enforce_university_email,
-- Sesión 3). La única señal extra que necesitamos es que su NOMBRE COMPLETO se
-- parezca al correo (patrones compartidos entre nombre y local-part). Con eso
-- basta: se elimina la pantalla de captura de intranet.
--
-- La verificación la decide el SERVIDOR (fuente de verdad): estas funciones
-- corren en handle_new_user (al registrarse) y en la RPC
-- verify_credential_by_email_match (re-chequeo al iniciar sesión o al corregir
-- el nombre). El cliente solo muestra un adelanto y dispara la RPC.

-- ===========================================================================
-- Helpers de coincidencia nombre ↔ correo
-- ===========================================================================

-- minúsculas + sin tildes/ñ (sin depender de la extensión unaccent, que vive en
-- otro schema fuera del search_path fijo).
create or replace function public.unaccent_lower(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(translate(coalesce(p, ''),
    'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
    'aaaaaeeeeiiiiooooouuuuncaaaaaeeeeiiiiooooouuuunc'));
$$;

-- Cuenta los "patrones" que forman el nombre completo y el local-part del
-- correo: cada token del nombre (≥3 letras, sin partículas) que aparece dentro
-- del local-part suma 1, con dos bonos de +1:
--   · token largo (≥5), porque un apellido completo dentro del correo
--     (p. ej. "jgonzalez") ya es señal fuerte por sí solo;
--   · token que cubre casi todo el local-part (el correo es "inicial+apellido"
--     o el nombre de pila solo, p. ej. "psoto", "jose"): resto ≤ 2 letras.
-- Devuelve el puntaje total.
create or replace function public.name_email_match_score(p_name text, p_email text)
returns integer
language plpgsql
immutable
set search_path = public
as $$
declare
  v_local text;
  v_tok text;
  v_score int := 0;
  v_particles text[] := array['de','del','la','las','los','san','santa','y','da','do','di','von','van'];
begin
  -- Local-part sin dominio, solo letras (quita puntos, números y guiones).
  v_local := regexp_replace(public.unaccent_lower(split_part(coalesce(p_email, ''), '@', 1)), '[^a-z]', '', 'g');
  if v_local = '' then
    return 0;
  end if;

  foreach v_tok in array regexp_split_to_array(public.unaccent_lower(coalesce(p_name, '')), '\s+')
  loop
    v_tok := regexp_replace(v_tok, '[^a-z]', '', 'g');
    if length(v_tok) >= 3 and not (v_tok = any(v_particles)) then
      if position(v_tok in v_local) > 0 then
        v_score := v_score
          + 1
          + (case when length(v_tok) >= 5 then 1 else 0 end)
          + (case when length(v_tok) >= length(v_local) - 2 then 1 else 0 end);
      end if;
    end if;
  end loop;

  return v_score;
end;
$$;

-- Umbral de coincidencia: puntaje ≥ 2 (dos tokens cortos, o un apellido largo).
create or replace function public.name_matches_email(p_name text, p_email text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select public.name_email_match_score(p_name, p_email) >= 2;
$$;

grant execute on function public.unaccent_lower(text) to authenticated, anon;
grant execute on function public.name_email_match_score(text, text) to authenticated, anon;
grant execute on function public.name_matches_email(text, text) to authenticated, anon;

-- ===========================================================================
-- Verificación server-side de la propia cuenta
-- ===========================================================================

-- Re-evalúa la coincidencia nombre↔correo del usuario actual y fija el estado
-- de credencial. SECURITY DEFINER: corre como owner y por eso queda exento de
-- protect_profile_columns (que congela credential_* para clientes). No
-- pisa una verificación MANUAL de un admin (credential_reviewed_by not null).
create or replace function public.verify_credential_by_email_match()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_prof  public.profiles;
  v_score int;
  v_ok    boolean;
begin
  if v_uid is null then
    raise exception 'Necesitas iniciar sesión';
  end if;

  select * into v_prof from public.profiles where id = v_uid;
  if not found then
    raise exception 'Perfil no encontrado' using errcode = 'no_data_found';
  end if;

  -- Respeta una decisión humana previa (admin aprobó/rechazó a mano).
  if v_prof.credential_reviewed_by is not null then
    return jsonb_build_object('verified', v_prof.credential_verified,
                              'score', public.name_email_match_score(v_prof.full_name, v_prof.email),
                              'manual', true);
  end if;

  v_score := public.name_email_match_score(v_prof.full_name, v_prof.email);
  v_ok := v_score >= 2;

  update public.profiles
  set credential_verified = v_ok,
      credential_review_status = case when v_ok then 'aprobado' else 'pendiente' end,
      credential_reviewed_at = case when v_ok then now() else null end,
      credential_expires_at = case when v_ok then now() + interval '6 months' else null end
  where id = v_uid;

  return jsonb_build_object('verified', v_ok, 'score', v_score, 'manual', false);
end;
$$;

revoke execute on function public.verify_credential_by_email_match() from public, anon;
grant execute on function public.verify_credential_by_email_match() to authenticated;

-- ===========================================================================
-- Auto-verificación al registrarse (handle_new_user)
-- ===========================================================================

-- Extiende la versión vigente (con referral_code): al crear el profile, fija
-- credential_verified según la coincidencia nombre↔correo, para que la
-- verificación sea inmediata y sin pantallas extra.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_name text := nullif(meta->>'full_name', '');
  v_university text := case
    when lower(new.email) like '%@alumnos.uai.cl' then 'uai'
    when lower(new.email) like '%@udd.cl' then 'udd'
    when lower(new.email) like '%@miuandes.cl' then 'uandes'
    else null
  end;
  v_verified boolean := public.name_matches_email(v_name, new.email);
begin
  insert into public.profiles (id, email, full_name, university_id, home_campus_id, date_of_birth, referral_code,
                               credential_verified, credential_review_status, credential_reviewed_at, credential_expires_at)
  values (
    new.id,
    new.email,
    v_name,
    v_university,
    nullif(meta->>'home_campus_id', ''),
    (nullif(meta->>'date_of_birth', ''))::date,
    public.gen_referral_code(),
    v_verified,
    case when v_verified then 'aprobado' else 'pendiente' end,
    case when v_verified then now() else null end,
    case when v_verified then now() + interval '6 months' else null end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
