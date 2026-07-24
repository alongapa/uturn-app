-- Unities — Sesión 9: funciones, triggers, RLS y endurecimiento de seguridad,
-- reportes/bloqueos, moderación de contenido, identidad, privacidad y anti-abuso.

-- ===========================================================================
-- Helpers de autorización
-- ===========================================================================

-- Moderar reportes/credenciales: tutor o superior (docs/sesiones/09, hooks
-- use-permissions.ts: canModerate / canVerifyUsers). Sanciones y borrado de
-- contenido exigen is_admin() (canManageUsers), un escalón más arriba.
create or replace function public.can_moderate()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and account_role in ('tutor', 'admin', 'owner')
  );
$$;

grant execute on function public.can_moderate() to authenticated, anon;

-- ¿a y b se tienen bloqueados (en cualquier dirección)? Simétrico a propósito:
-- el bloqueo es mutuo (docs/sesiones/09).
create or replace function public.are_blocked(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_blocks
    where (blocker_id = p_a and blocked_id = p_b) or (blocker_id = p_b and blocked_id = p_a)
  );
$$;

grant execute on function public.are_blocked(uuid, uuid) to authenticated, anon;

-- ¿Puede auth.uid() operar con normalidad? false si está baneado, o suspendido
-- y la suspensión sigue vigente. Gatea reservar viajes, publicar y mensajear.
create or replace function public.is_active_account()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles
    where id = auth.uid()
      and (moderation_status = 'baneado'
        or (moderation_status = 'suspendido' and moderation_until is not null and moderation_until > now()))
  );
$$;

grant execute on function public.is_active_account() to authenticated, anon;

-- ===========================================================================
-- 1) Seguridad en viaje: compartir en vivo + SOS
-- ===========================================================================

-- Empieza (o reinicia) el compartir en vivo de un viaje. Solo el conductor o
-- un pasajero con reserva no cancelada de ESE viaje puede compartirlo.
create or replace function public.start_trip_share(
  p_trip_id uuid,
  p_contact_name text,
  p_contact_phone text
)
returns public.trip_live_shares
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_trip  public.trips;
  v_share public.trip_live_shares;
begin
  if v_uid is null then
    raise exception 'Necesitas iniciar sesión';
  end if;
  if btrim(coalesce(p_contact_name, '')) = '' or btrim(coalesce(p_contact_phone, '')) = '' then
    raise exception 'Ingresa nombre y teléfono del contacto de confianza' using errcode = 'check_violation';
  end if;

  select * into v_trip from public.trips where id = p_trip_id;
  if not found then
    raise exception 'Viaje no encontrado' using errcode = 'no_data_found';
  end if;
  if v_trip.driver_id <> v_uid and not exists (
    select 1 from public.bookings where trip_id = p_trip_id and passenger_id = v_uid and status <> 'cancelled'
  ) then
    raise exception 'Solo el conductor o un pasajero del viaje pueden compartirlo' using errcode = 'insufficient_privilege';
  end if;

  update public.trip_live_shares set active = false, stopped_at = now()
  where trip_id = p_trip_id and sharer_id = v_uid and active;

  -- Token opaco sin depender de pgcrypto (gen_random_bytes vive en el schema
  -- extensions, fuera del search_path fijo): dos uuid sin guiones = 64 hex.
  insert into public.trip_live_shares (trip_id, sharer_id, share_token, contact_name, contact_phone)
  values (p_trip_id, v_uid,
          replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
          btrim(p_contact_name), btrim(p_contact_phone))
  returning * into v_share;

  return v_share;
end;
$$;

-- Actualiza la última posición del compartir activo de auth.uid() en ese viaje
-- (services/location.ts watchPosition la llama periódicamente).
create or replace function public.update_trip_share_location(
  p_trip_id uuid, p_lat double precision, p_lng double precision
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Necesitas iniciar sesión';
  end if;
  update public.trip_live_shares
  set last_lat = p_lat, last_lng = p_lng, last_update_at = now()
  where trip_id = p_trip_id and sharer_id = auth.uid() and active;
end;
$$;

create or replace function public.stop_trip_share(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Necesitas iniciar sesión';
  end if;
  update public.trip_live_shares set active = false, stopped_at = now()
  where trip_id = p_trip_id and sharer_id = auth.uid() and active;
end;
$$;

-- Lectura PÚBLICA (grant a anon) por token: el contacto de emergencia no
-- necesita cuenta Unities. Solo entrega lo necesario para identificar el auto
-- y ver la posición; nada si el token no existe, ya no está activo o es viejo.
create or replace function public.get_live_share(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'active', s.active,
    'sharerName', sp.full_name,
    'driverName', dp.full_name,
    'driverRating', dp.rating_avg,
    'vehiclePlate', v.plate,
    'vehicleBrand', v.brand,
    'vehicleModel', v.model,
    'vehicleColor', v.color,
    'originCampus', t.origin_campus_name,
    'destinationCampus', t.destination_campus_name,
    'lastLat', s.last_lat,
    'lastLng', s.last_lng,
    'lastUpdateAt', s.last_update_at,
    'startedAt', s.started_at
  )
  from public.trip_live_shares s
  join public.trips t on t.id = s.trip_id
  join public.profiles dp on dp.id = t.driver_id
  join public.profiles sp on sp.id = s.sharer_id
  left join public.vehicles v on v.id = t.vehicle_id
  where s.share_token = p_token
    and s.started_at > now() - interval '18 hours';
$$;

-- SOS: registra la alerta y avisa a TODO admin/owner sin pasar por
-- notification_prefs (una alerta de seguridad no debe poder silenciarse).
create or replace function public.trigger_sos(
  p_trip_id uuid default null, p_lat double precision default null, p_lng double precision default null
)
returns public.sos_alerts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_alert public.sos_alerts;
  v_name text;
  v_contact_name text;
  v_contact_phone text;
begin
  if v_uid is null then
    raise exception 'Necesitas iniciar sesión';
  end if;

  select full_name, emergency_contact_name, emergency_contact_phone
    into v_name, v_contact_name, v_contact_phone
  from public.profiles where id = v_uid;

  insert into public.sos_alerts (trip_id, user_id, lat, lng, contact_name, contact_phone)
  values (p_trip_id, v_uid, p_lat, p_lng, v_contact_name, v_contact_phone)
  returning * into v_alert;

  insert into public.notifications (user_id, category, type, title, body, url, data)
  select p.id, 'viajes', 'sos_alerta',
         '🆘 Alerta SOS activa',
         coalesce(v_name, 'Un usuario') || ' activó el botón SOS' ||
           case when p_trip_id is not null then ' durante un viaje' else '' end || '.',
         '/admin/safety',
         jsonb_build_object('alertId', v_alert.id, 'tripId', p_trip_id, 'userId', v_uid)
  from public.profiles p
  where p.account_role in ('admin', 'owner');

  return v_alert;
end;
$$;

create or replace function public.resolve_sos(p_alert_id uuid, p_status text, p_note text default null)
returns public.sos_alerts
language plpgsql
security definer
set search_path = public
as $$
declare v_alert public.sos_alerts;
begin
  if not public.is_admin() then
    raise exception 'Solo admin/owner resuelven alertas SOS' using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('atendida', 'falsa_alarma') then
    raise exception 'Estado inválido' using errcode = 'check_violation';
  end if;

  update public.sos_alerts
  set status = p_status, resolved_at = now(), resolved_by = auth.uid(), resolution_note = p_note
  where id = p_alert_id
  returning * into v_alert;
  if not found then
    raise exception 'Alerta no encontrada' using errcode = 'no_data_found';
  end if;
  return v_alert;
end;
$$;

create or replace function public.list_sos_alerts(p_only_active boolean default true)
returns table (
  id uuid, trip_id uuid, user_id uuid, user_name text, lat double precision, lng double precision,
  contact_name text, contact_phone text, status text, created_at timestamptz, resolved_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.trip_id, a.user_id, p.full_name, a.lat, a.lng, a.contact_name, a.contact_phone,
         a.status, a.created_at, a.resolved_at
  from public.sos_alerts a
  join public.profiles p on p.id = a.user_id
  where public.is_admin() and (not p_only_active or a.status = 'activa')
  order by a.created_at desc;
$$;

-- Retención limitada de ubicaciones: auto-detiene compartidos abandonados y
-- borra los ya detenidos hace más de 24 h (no se guarda historial de rutas).
create or replace function public.purge_expired_trip_shares()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  update public.trip_live_shares
  set active = false, stopped_at = now()
  where active and coalesce(last_update_at, started_at) < now() - interval '6 hours';

  delete from public.trip_live_shares
  where not active and coalesce(stopped_at, started_at) < now() - interval '24 hours';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ===========================================================================
-- 2) Reportes y bloqueos
-- ===========================================================================

create or replace function public.report_target(
  p_target_type text,
  p_reason text,
  p_target_user_id uuid default null,
  p_target_id uuid default null,
  p_description text default null,
  p_evidence_path text default null
)
returns public.reports
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_report public.reports;
begin
  if v_uid is null then
    raise exception 'Necesitas iniciar sesión';
  end if;
  if p_target_type not in ('usuario', 'viaje', 'mensaje', 'post', 'historia', 'post_respuesta', 'pregunta', 'qa_respuesta') then
    raise exception 'Tipo de reporte inválido' using errcode = 'check_violation';
  end if;
  if p_reason not in ('spam', 'acoso', 'contenido_inapropiado', 'seguridad', 'fraude', 'otro') then
    raise exception 'Motivo inválido' using errcode = 'check_violation';
  end if;
  if p_target_user_id = v_uid then
    raise exception 'No puedes reportarte a ti mismo' using errcode = 'check_violation';
  end if;

  insert into public.reports (reporter_id, target_type, target_user_id, target_id, reason, description, evidence_path)
  values (v_uid, p_target_type, p_target_user_id, p_target_id, p_reason,
          nullif(btrim(coalesce(p_description, '')), ''), p_evidence_path)
  returning * into v_report;

  return v_report;
end;
$$;

create or replace function public.list_reports(p_status text default null, p_target_type text default null)
returns table (
  id uuid, reporter_id uuid, reporter_name text, target_type text, target_user_id uuid,
  target_user_name text, target_id uuid, reason text, description text, evidence_path text,
  status text, resolution text, resolved_by uuid, resolved_at timestamptz, created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.reporter_id, rp.full_name, r.target_type, r.target_user_id, tp.full_name,
         r.target_id, r.reason, r.description, r.evidence_path, r.status, r.resolution,
         r.resolved_by, r.resolved_at, r.created_at
  from public.reports r
  left join public.profiles rp on rp.id = r.reporter_id
  left join public.profiles tp on tp.id = r.target_user_id
  where public.can_moderate()
    and (p_status is null or r.status = p_status)
    and (p_target_type is null or r.target_type = p_target_type)
  order by r.created_at desc;
$$;

-- Triaje ligero (tutor+): marcar en revisión o descartar sin sanción.
create or replace function public.triage_report(p_report_id uuid, p_status text)
returns public.reports
language plpgsql
security definer
set search_path = public
as $$
declare v_report public.reports;
begin
  if not public.can_moderate() then
    raise exception 'Sin permiso para moderar' using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('en_revision', 'descartado') then
    raise exception 'Estado inválido' using errcode = 'check_violation';
  end if;

  update public.reports
  set status = p_status,
      resolved_by = case when p_status = 'descartado' then auth.uid() else resolved_by end,
      resolved_at = case when p_status = 'descartado' then now() else resolved_at end
  where id = p_report_id
  returning * into v_report;
  if not found then
    raise exception 'Reporte no encontrado' using errcode = 'no_data_found';
  end if;
  return v_report;
end;
$$;

-- Sanciones sobre usuarios (admin+): advertencia, suspensión temporal, baneo o
-- levantar una sanción vigente. Deja auditoría en moderation_actions y cierra
-- el reporte de origen si se pasó uno.
create or replace function public.apply_moderation_action(
  p_target_user_id uuid,
  p_action text,
  p_reason text,
  p_suspend_days integer default null,
  p_report_id uuid default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_until timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Solo admin/owner aplican sanciones' using errcode = 'insufficient_privilege';
  end if;
  if p_action not in ('advertencia', 'suspension', 'baneo', 'levantar_sancion') then
    raise exception 'Acción inválida' using errcode = 'check_violation';
  end if;
  if p_target_user_id = auth.uid() then
    raise exception 'No puedes sancionarte a ti mismo' using errcode = 'check_violation';
  end if;

  if p_action = 'advertencia' then
    update public.profiles set warnings_count = warnings_count + 1
    where id = p_target_user_id returning * into v_profile;
  elsif p_action = 'suspension' then
    v_until := now() + (greatest(coalesce(p_suspend_days, 3), 1) || ' days')::interval;
    update public.profiles set moderation_status = 'suspendido', moderation_until = v_until
    where id = p_target_user_id returning * into v_profile;
  elsif p_action = 'baneo' then
    update public.profiles set moderation_status = 'baneado', moderation_until = null
    where id = p_target_user_id returning * into v_profile;
  elsif p_action = 'levantar_sancion' then
    update public.profiles set moderation_status = 'activo', moderation_until = null
    where id = p_target_user_id returning * into v_profile;
  end if;
  if not found then
    raise exception 'Usuario no encontrado' using errcode = 'no_data_found';
  end if;

  insert into public.moderation_actions (target_user_id, moderator_id, action, report_id, reason, suspended_until)
  values (p_target_user_id, auth.uid(), p_action, p_report_id,
          coalesce(nullif(btrim(p_reason), ''), 'Sin motivo especificado'), v_until);

  if p_report_id is not null then
    update public.reports
    set status = 'resuelto', resolution = p_action, resolved_by = auth.uid(), resolved_at = now()
    where id = p_report_id;
  end if;

  perform public.enqueue_notification(
    p_target_user_id, 'social', 'sancion_' || p_action,
    case p_action
      when 'advertencia' then '⚠️ Recibiste una advertencia'
      when 'suspension' then '🚫 Tu cuenta quedó suspendida temporalmente'
      when 'baneo' then '🚫 Tu cuenta fue baneada'
      else 'ℹ️ Se levantó una sanción de tu cuenta'
    end,
    coalesce(nullif(btrim(p_reason), ''), 'Revisa las reglas de la comunidad Unities.'),
    '/community-rules', jsonb_build_object('action', p_action)
  );

  return v_profile;
end;
$$;

-- Modera contenido reportado (admin+): elimina la fila referida (si aplica) y
-- cierra el reporte. Reutiliza las políticas DELETE ya existentes de
-- posts/stories/questions/question_replies (is_admin() ya puede borrar ahí).
create or replace function public.moderate_content(p_report_id uuid, p_delete boolean, p_note text default null)
returns public.reports
language plpgsql
security definer
set search_path = public
as $$
declare v_report public.reports;
begin
  if not public.is_admin() then
    raise exception 'Solo admin/owner moderan contenido' using errcode = 'insufficient_privilege';
  end if;

  select * into v_report from public.reports where id = p_report_id;
  if not found then
    raise exception 'Reporte no encontrado' using errcode = 'no_data_found';
  end if;

  if p_delete and v_report.target_id is not null then
    case v_report.target_type
      when 'post' then delete from public.posts where id = v_report.target_id;
      when 'historia' then delete from public.stories where id = v_report.target_id;
      when 'post_respuesta' then delete from public.post_replies where id = v_report.target_id;
      when 'pregunta' then delete from public.questions where id = v_report.target_id;
      when 'qa_respuesta' then delete from public.question_replies where id = v_report.target_id;
      else null;
    end case;
  end if;

  update public.reports
  set status = 'resuelto',
      resolution = case when p_delete then 'contenido_eliminado' else 'sin_accion' end,
      resolved_by = auth.uid(), resolved_at = coalesce(resolved_at, now())
  where id = p_report_id
  returning * into v_report;

  return v_report;
end;
$$;

-- ===========================================================================
-- 3) Moderación de contenido: filtro de palabras + rate limiting
-- ===========================================================================

create or replace function public.contains_blocked_word(p_text text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.blocked_words w
    where p_text is not null and p_text ilike '%' || w.word || '%'
  );
$$;

grant execute on function public.contains_blocked_word(text) to authenticated, anon;

create or replace function public.enforce_word_filter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_text text; v_row jsonb;
begin
  -- to_jsonb(new) evita referenciar columnas que no existen en cada tabla
  -- (posts no tiene caption, stories no tiene title): ->> devuelve null si falta.
  -- Un solo trigger sirve a posts/stories/post_replies/questions/question_replies.
  v_row := to_jsonb(new);
  v_text := concat_ws(' ', v_row->>'body', v_row->>'caption', v_row->>'title');
  if public.contains_blocked_word(v_text) then
    raise exception 'Tu publicación contiene palabras no permitidas por las reglas de la comunidad Unities'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_word_filter() from public, anon, authenticated;

-- Rate limiting básico anti-spam: máximo N publicaciones por autor en una
-- ventana de tiempo, por tabla. Umbrales pensados para uso humano normal.
create or replace function public.enforce_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_window interval;
  v_max integer;
  v_count integer;
  v_column text;
begin
  -- El autor se lee vía to_jsonb (post_replies usa user_id; el resto author_id),
  -- evitando el mismo problema de columnas ausentes que enforce_word_filter.
  case tg_table_name
    when 'posts'            then v_window := interval '10 minutes'; v_max := 5;  v_column := 'author_id';
    when 'stories'          then v_window := interval '1 hour';      v_max := 10; v_column := 'author_id';
    when 'post_replies'     then v_window := interval '5 minutes';   v_max := 10; v_column := 'user_id';
    when 'questions'        then v_window := interval '10 minutes';  v_max := 5;  v_column := 'author_id';
    when 'question_replies' then v_window := interval '5 minutes';   v_max := 15; v_column := 'author_id';
    else return new;
  end case;

  v_author := (to_jsonb(new)->>v_column)::uuid;

  execute format('select count(*) from public.%I where %I = $1 and created_at > now() - $2', tg_table_name, v_column)
    into v_count using v_author, v_window;

  if v_count >= v_max then
    raise exception 'Estás publicando muy rápido. Espera unos minutos e inténtalo de nuevo.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_rate_limit() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['posts', 'stories', 'post_replies', 'questions', 'question_replies']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_word_filter', t);
    execute format(
      'create trigger %I before insert on public.%I for each row execute function public.enforce_word_filter()',
      t || '_word_filter', t
    );
    execute format('drop trigger if exists %I on public.%I', t || '_rate_limit', t);
    execute format(
      'create trigger %I before insert on public.%I for each row execute function public.enforce_rate_limit()',
      t || '_rate_limit', t
    );
  end loop;
end;
$$;

drop trigger if exists driver_verifications_set_updated_at on public.driver_verifications;
create trigger driver_verifications_set_updated_at before update on public.driver_verifications
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- 4) Identidad: revisión de credenciales + verificación reforzada de conductor
-- ===========================================================================

-- El propio usuario ya subió su captura (uploadCredential, Storage); esto solo
-- avisa a la cola que hay algo nuevo por revisar. credential_verified/estado
-- quedan blindados por protect_profile_columns (más abajo).
create or replace function public.submit_credential_review()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_profile public.profiles;
begin
  if v_uid is null then
    raise exception 'Necesitas iniciar sesión';
  end if;
  update public.profiles
  set credential_review_status = 'en_revision', credential_submitted_at = now(), credential_review_note = null
  where id = v_uid
  returning * into v_profile;
  return v_profile;
end;
$$;

create or replace function public.review_credential(p_user_id uuid, p_approve boolean, p_note text default null)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare v_profile public.profiles;
begin
  if not public.can_moderate() then
    raise exception 'Sin permiso para revisar credenciales' using errcode = 'insufficient_privilege';
  end if;

  update public.profiles
  set credential_review_status = case when p_approve then 'aprobado' else 'rechazado' end,
      credential_verified = p_approve,
      credential_reviewed_by = auth.uid(),
      credential_reviewed_at = now(),
      credential_review_note = p_note,
      credential_expires_at = case when p_approve then now() + interval '6 months' else null end
  where id = p_user_id
  returning * into v_profile;
  if not found then
    raise exception 'Usuario no encontrado' using errcode = 'no_data_found';
  end if;

  perform public.enqueue_notification(
    p_user_id, 'social', 'credencial_revisada',
    case when p_approve then '✅ Tu credencial fue verificada' else '❌ Tu credencial fue rechazada' end,
    coalesce(nullif(btrim(p_note), ''),
      case when p_approve then 'Válida por un semestre.' else 'Vuelve a subir una captura clara de tu intranet.' end),
    '/', jsonb_build_object('approved', p_approve)
  );

  return v_profile;
end;
$$;

create or replace function public.list_credential_reviews(p_status text default 'en_revision')
returns table (
  id uuid, full_name text, email text, university_id text, credential_review_status text,
  credential_submitted_at timestamptz, credential_expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.email, p.university_id, p.credential_review_status,
         p.credential_submitted_at, p.credential_expires_at
  from public.profiles p
  where public.can_moderate() and (p_status is null or p.credential_review_status = p_status)
  order by p.credential_submitted_at nulls last;
$$;

-- Vencimiento semestral: si expiró, vuelve a pedir verificación (no se
-- auto-renueva sola).
create or replace function public.expire_credential_verifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  update public.profiles
  set credential_verified = false, credential_review_status = 'pendiente'
  where credential_review_status = 'aprobado'
    and credential_expires_at is not null
    and credential_expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Verificación reforzada de conductor: cédula + licencia (Storage privado
-- driver-documents), 1:1 con profiles vía upsert.
create or replace function public.submit_driver_verification(p_id_path text, p_license_path text)
returns public.driver_verifications
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_row public.driver_verifications;
begin
  if v_uid is null then
    raise exception 'Necesitas iniciar sesión';
  end if;
  if btrim(coalesce(p_id_path, '')) = '' or btrim(coalesce(p_license_path, '')) = '' then
    raise exception 'Sube ambos documentos: cédula y licencia' using errcode = 'check_violation';
  end if;

  insert into public.driver_verifications (user_id, id_document_path, license_document_path, status, submitted_at)
  values (v_uid, p_id_path, p_license_path, 'en_revision', now())
  on conflict (user_id) do update
    set id_document_path = excluded.id_document_path,
        license_document_path = excluded.license_document_path,
        status = 'en_revision',
        submitted_at = now(),
        reviewed_by = null, reviewed_at = null, review_note = null,
        updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.review_driver_verification(p_user_id uuid, p_approve boolean, p_note text default null)
returns public.driver_verifications
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.driver_verifications;
begin
  if not public.can_moderate() then
    raise exception 'Sin permiso para revisar verificaciones de conductor' using errcode = 'insufficient_privilege';
  end if;

  update public.driver_verifications
  set status = case when p_approve then 'aprobado' else 'rechazado' end,
      reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note, updated_at = now()
  where user_id = p_user_id
  returning * into v_row;
  if not found then
    raise exception 'No hay una verificación pendiente de este usuario' using errcode = 'no_data_found';
  end if;

  perform public.enqueue_notification(
    p_user_id, 'social', 'verificacion_conductor',
    case when p_approve then '✅ Verificación reforzada aprobada' else '❌ Verificación reforzada rechazada' end,
    coalesce(nullif(btrim(p_note), ''), 'Revisa el estado en tu perfil.'),
    '/', jsonb_build_object('approved', p_approve)
  );

  return v_row;
end;
$$;

create or replace function public.list_driver_verifications(p_status text default 'en_revision')
returns table (
  user_id uuid, full_name text, status text, submitted_at timestamptz,
  id_document_path text, license_document_path text
)
language sql
stable
security definer
set search_path = public
as $$
  select d.user_id, p.full_name, d.status, d.submitted_at, d.id_document_path, d.license_document_path
  from public.driver_verifications d
  join public.profiles p on p.id = d.user_id
  where public.can_moderate() and (p_status is null or d.status = p_status)
  order by d.submitted_at nulls last;
$$;

-- Si el owner activa require_reinforced_driver_verification, publicar un
-- viaje exige driver_verifications.status = 'aprobado'.
create or replace function public.enforce_driver_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_required boolean; v_status text;
begin
  select require_reinforced_driver_verification into v_required
  from public.platform_config where id = 'default';
  if not coalesce(v_required, false) then
    return new;
  end if;

  select status into v_status from public.driver_verifications where user_id = new.driver_id;
  if coalesce(v_status, 'pendiente') <> 'aprobado' then
    raise exception 'Necesitas completar la verificación reforzada de conductor (cédula + licencia) antes de publicar viajes'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists trips_enforce_driver_verification on public.trips;
create trigger trips_enforce_driver_verification before insert on public.trips
  for each row execute function public.enforce_driver_verification();

-- Extiende update_platform_config (Sesión 8) con el nuevo interruptor. Se
-- reemplaza la función completa (firma nueva) para no dejar dos overloads.
drop function if exists public.update_platform_config(integer, integer, integer);

create or replace function public.update_platform_config(
  p_commission_clp integer default null,
  p_credit_clp_rate integer default null,
  p_max_credit_discount_pct integer default null,
  p_require_reinforced_driver_verification boolean default null
)
returns public.platform_config
language plpgsql
security definer
set search_path = public
as $$
declare v_cfg public.platform_config;
begin
  if not public.is_owner() then
    raise exception 'Solo el owner ajusta la configuración' using errcode = 'insufficient_privilege';
  end if;

  update public.platform_config
    set commission_clp = coalesce(p_commission_clp, commission_clp),
        credit_clp_rate = coalesce(p_credit_clp_rate, credit_clp_rate),
        max_credit_discount_pct = coalesce(p_max_credit_discount_pct, max_credit_discount_pct),
        require_reinforced_driver_verification =
          coalesce(p_require_reinforced_driver_verification, require_reinforced_driver_verification),
        updated_by = auth.uid()
  where id = 'default'
  returning * into v_cfg;

  return v_cfg;
end;
$$;

-- ===========================================================================
-- 5) Privacidad y datos
-- ===========================================================================

-- Perfil público de un tercero, respetando profile_visibility y bloqueo.
-- Los companions de viaje (shares_confirmed_trip) siempre pueden verlo, igual
-- que en la regla de mensajería (Sesión DM híbrido).
create or replace function public.get_public_profile(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p.id = auth.uid() or public.is_admin() or p.profile_visibility = 'publico'
         or public.shares_confirmed_trip(auth.uid(), p.id) then
      jsonb_build_object(
        'id', p.id, 'fullName', p.full_name, 'avatarUrl', p.avatar_url,
        'ratingAvg', p.rating_avg, 'universityId', p.university_id,
        'credentialVerified', p.credential_verified,
        'completedTrips', p.best_streak_completed_trips,
        'memberSince', p.created_at,
        'isBlocked', public.are_blocked(auth.uid(), p.id)
      )
    else jsonb_build_object('id', p.id, 'hidden', true)
  end
  from public.profiles p
  where p.id = p_user_id;
$$;

grant execute on function public.get_public_profile(uuid) to authenticated;

-- Exporta TODOS los datos propios de auth.uid() en un solo jsonb (derecho de
-- portabilidad). SECURITY INVOKER a propósito (sin "security definer"): solo
-- puede leer lo que la RLS ya le permite ver de sus propias filas.
create or replace function public.export_my_data()
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'vehicles', (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) from public.vehicles v where v.owner_id = auth.uid()),
    'tripsAsDriver', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.trips t where t.driver_id = auth.uid()),
    'bookings', (select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) from public.bookings b where b.passenger_id = auth.uid()),
    'payments', (select coalesce(jsonb_agg(to_jsonb(pay)), '[]'::jsonb)
                 from public.payments pay join public.bookings b on b.id = pay.booking_id
                 where b.passenger_id = auth.uid()),
    'ratingsGiven', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from public.ratings r where r.from_id = auth.uid()),
    'ratingsReceived', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from public.ratings r where r.to_id = auth.uid()),
    'creditTransactions', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from public.credit_transactions c where c.user_id = auth.uid()),
    'redemptions', (select coalesce(jsonb_agg(to_jsonb(rd)), '[]'::jsonb) from public.redemptions rd where rd.user_id = auth.uid()),
    'reportsFiled', (select coalesce(jsonb_agg(to_jsonb(rp)), '[]'::jsonb) from public.reports rp where rp.reporter_id = auth.uid()),
    'exportedAt', now()
  );
$$;

-- Borrado de cuenta: anonimiza datos personales y deja la fila lista para que
-- la Edge Function delete-account borre auth.users (cascada sobre profiles).
-- Server-only: SOLO service_role la ejecuta (la llama la Edge Function tras
-- verificar el JWT del usuario), nunca el cliente directo.
create or replace function public.admin_delete_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set full_name = 'Usuario eliminado',
      avatar_url = null,
      emergency_contact_name = null,
      emergency_contact_phone = null,
      profile_visibility = 'oculto',
      deletion_requested_at = now()
  where id = p_user_id;

  delete from public.bank_details where user_id = p_user_id;
  delete from public.push_tokens where user_id = p_user_id;
end;
$$;

-- ===========================================================================
-- 6) Anti-abuso
-- ===========================================================================

-- redeem_item (Sesión 3) + límites anti-abuso: máx. 5 canjes/24h y no repetir
-- el mismo beneficio antes de 24h (evita vaciar stock/farmear un descuento).
create or replace function public.redeem_item(p_item_id text)
returns public.redemptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_item public.redeemables;
  v_redemption public.redemptions;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = 'insufficient_privilege';
  end if;

  perform pg_advisory_xact_lock(hashtext('redeem:' || v_uid::text));

  if (select count(*) from public.redemptions where user_id = v_uid and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'Alcanzaste el límite de canjes por día. Intenta mañana.' using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from public.redemptions
    where user_id = v_uid and item_id = p_item_id and created_at > now() - interval '24 hours'
  ) then
    raise exception 'Ya canjeaste este beneficio hoy; espera 24 h para repetirlo.' using errcode = 'check_violation';
  end if;

  select * into v_item from public.redeemables where id = p_item_id and active for update;
  if not found then
    raise exception 'Canje no disponible' using errcode = 'no_data_found';
  end if;
  if v_item.stock is not null and v_item.stock <= 0 then
    raise exception 'Este canje está agotado' using errcode = 'check_violation';
  end if;
  if public.credit_balance(v_uid) < v_item.cost_credits then
    raise exception 'No tienes créditos suficientes para este canje' using errcode = 'check_violation';
  end if;

  if v_item.stock is not null then
    update public.redeemables set stock = stock - 1 where id = v_item.id;
  end if;

  insert into public.redemptions (user_id, item_id, title, cost_credits, code, status, expires_at)
  values (
    v_uid, v_item.id, v_item.title, v_item.cost_credits, public.gen_redemption_code(),
    'disponible', now() + (v_item.validity_days || ' days')::interval
  )
  returning * into v_redemption;

  insert into public.credit_transactions (user_id, entry_type, source, amount, description, reference_id)
  values (v_uid, 'cargo', 'canje', v_item.cost_credits, 'Canje: ' || v_item.title, v_redemption.id::text);

  return v_redemption;
end;
$$;

-- register_push_token (Sesión 7) + bitácora de solo-inserción para detección
-- de cuentas duplicadas (push_tokens se reasigna y pierde el historial).
create or replace function public.register_push_token(
  p_token text, p_platform text, p_device_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = 'insufficient_privilege';
  end if;
  if p_platform not in ('ios', 'android', 'web') then
    raise exception 'Plataforma inválida' using errcode = 'check_violation';
  end if;
  if p_token is null or btrim(p_token) = '' then
    raise exception 'Token vacío' using errcode = 'check_violation';
  end if;

  insert into public.push_tokens (user_id, token, platform, device_name)
  values (v_uid, btrim(p_token), p_platform, nullif(btrim(coalesce(p_device_name, '')), ''))
  on conflict (token) do update
    set user_id     = excluded.user_id,
        platform    = excluded.platform,
        device_name = excluded.device_name,
        updated_at  = now();

  insert into public.device_token_seen (token, user_id, platform)
  values (btrim(p_token), v_uid, p_platform);
end;
$$;

create or replace function public.list_duplicate_account_signals(p_days integer default 90)
returns table (
  token text, user_ids uuid[], user_names text[], distinct_users bigint, last_seen_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select d.token,
         array_agg(distinct d.user_id) as user_ids,
         array_agg(distinct coalesce(p.full_name, p.email)) as user_names,
         count(distinct d.user_id) as distinct_users,
         max(d.seen_at) as last_seen_at
  from public.device_token_seen d
  join public.profiles p on p.id = d.user_id
  where public.is_owner() and d.seen_at > now() - (greatest(coalesce(p_days, 90), 1) || ' days')::interval
  group by d.token
  having count(distinct d.user_id) > 1
  order by max(d.seen_at) desc;
$$;

-- ===========================================================================
-- Bloqueo: endurece el DM híbrido (Sesión "DM híbrido") y el directorio
-- ===========================================================================

create or replace function public.can_start_dm(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_a is not null and p_b is not null and p_a <> p_b
    and not public.are_blocked(p_a, p_b)
    and (
      public.is_official_account(p_a)
      or public.is_official_account(p_b)
      or public.shares_confirmed_trip(p_a, p_b)
    );
$$;

revoke execute on function public.can_start_dm(uuid, uuid) from public, anon, authenticated;

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
    and not public.are_blocked(auth.uid(), p.id)
    and (
      p.account_role in ('tutor', 'admin', 'owner')
      or p.id in (select user_id from companions)
    )
  order by (p.account_role in ('tutor', 'admin', 'owner')) desc,
           lower(coalesce(p.full_name, p.email)) asc;
$$;

revoke execute on function public.list_dm_contacts() from public, anon;
grant execute on function public.list_dm_contacts() to authenticated;

-- Enviar mensajes exige, además del acceso a la conversación, no estar
-- sancionado y (en un DM) no tener bloqueo mutuo con la contraparte.
create or replace function public.can_send_message(p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_access_conversation(p_conversation)
    and public.is_active_account()
    and not exists (
      select 1 from public.conversations c
      where c.id = p_conversation
        and c.kind = 'dm'
        and public.are_blocked((public.dm_key_users(c.dm_key))[1], (public.dm_key_users(c.dm_key))[2])
    );
$$;

grant execute on function public.can_send_message(uuid) to authenticated, anon;

-- ===========================================================================
-- reserve_seat (Sesión 3) + gate de moderation_status (baneo/suspensión)
-- ===========================================================================

create or replace function public.reserve_seat(p_trip_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  c_commission_clp constant integer := 300;
  v_uid uuid := auth.uid();
  v_trip public.trips;
  v_profile public.profiles;
  v_booking public.bookings;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = 'insufficient_privilege';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if v_profile.moderation_status = 'baneado' then
    raise exception 'Tu cuenta está baneada' using errcode = 'check_violation';
  end if;
  if v_profile.moderation_status = 'suspendido' and v_profile.moderation_until is not null
     and v_profile.moderation_until > now() then
    raise exception 'Tu cuenta está suspendida hasta %', v_profile.moderation_until
      using errcode = 'check_violation';
  end if;
  if v_profile.payment_ban_until is not null and v_profile.payment_ban_until > now() then
    raise exception 'Baneado de los turnos por impago hasta %', v_profile.payment_ban_until
      using errcode = 'check_violation';
  end if;
  if v_profile.block_until is not null and v_profile.block_until > now() then
    raise exception 'Usuario bloqueado por cancelaciones tardías hasta %', v_profile.block_until
      using errcode = 'check_violation';
  end if;

  select * into v_trip from public.trips where id = p_trip_id for update;
  if not found then
    raise exception 'Viaje no encontrado' using errcode = 'no_data_found';
  end if;
  if v_trip.status = 'cancelled' then
    raise exception 'El viaje fue cancelado' using errcode = 'check_violation';
  end if;
  if v_trip.driver_id = v_uid then
    raise exception 'No puedes reservar tu propio viaje' using errcode = 'check_violation';
  end if;
  if v_trip.seats_taken >= v_trip.seats_total then
    raise exception 'No quedan asientos disponibles' using errcode = 'check_violation';
  end if;

  insert into public.bookings (trip_id, passenger_id, status)
  values (p_trip_id, v_uid, 'confirmed')
  returning * into v_booking;

  insert into public.payments (booking_id, status, price_clp, commission_clp, total_clp, due_at)
  values (
    v_booking.id, 'pending', v_trip.price_clp, c_commission_clp,
    v_trip.price_clp + c_commission_clp, now() + interval '48 hours'
  );

  update public.trips
    set seats_taken = seats_taken + 1,
        status = case when seats_taken + 1 >= seats_total then 'full' else status end
  where id = p_trip_id;

  return v_booking;
end;
$$;

-- ===========================================================================
-- protect_profile_columns (Sesión 3) + nuevas columnas server-managed
-- ===========================================================================

create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if public.is_admin() then
    return new;
  end if;
  new.email                       := old.email;
  new.account_role                := old.account_role;
  new.rating_avg                  := old.rating_avg;
  new.reward_points               := old.reward_points;
  new.streak_on_time_payments     := old.streak_on_time_payments;
  new.best_streak_on_time_payments:= old.best_streak_on_time_payments;
  new.streak_completed_trips      := old.streak_completed_trips;
  new.best_streak_completed_trips := old.best_streak_completed_trips;
  new.late_cancellations_count    := old.late_cancellations_count;
  new.last_late_cancellation_at   := old.last_late_cancellation_at;
  new.block_until                 := old.block_until;
  new.payment_strikes_count       := old.payment_strikes_count;
  new.last_payment_strike_at      := old.last_payment_strike_at;
  new.payment_ban_until           := old.payment_ban_until;
  -- Sesión 9: nadie se auto-verifica, auto-levanta una sanción ni se cambia
  -- la visibilidad de moderación desde el cliente. Enviar a revisión pasa por
  -- submit_credential_review (RPC definer, exento por el chequeo de arriba).
  new.credential_verified         := old.credential_verified;
  new.credential_review_status    := old.credential_review_status;
  new.credential_submitted_at     := old.credential_submitted_at;
  new.credential_reviewed_by      := old.credential_reviewed_by;
  new.credential_reviewed_at      := old.credential_reviewed_at;
  new.credential_review_note      := old.credential_review_note;
  new.credential_expires_at       := old.credential_expires_at;
  new.moderation_status           := old.moderation_status;
  new.moderation_until            := old.moderation_until;
  new.warnings_count              := old.warnings_count;
  return new;
end;
$$;

-- ===========================================================================
-- Endurece posts/stories/guides/questions/question_replies/post_replies:
-- exigir is_active_account() además de can_publish()/autoría propia.
-- ===========================================================================

drop policy if exists posts_insert_publisher on public.posts;
create policy posts_insert_publisher on public.posts
  for insert to authenticated
  with check (public.can_publish() and public.is_active_account() and author_id = (select auth.uid()));

drop policy if exists stories_insert_publisher on public.stories;
create policy stories_insert_publisher on public.stories
  for insert to authenticated
  with check (public.can_publish() and public.is_active_account() and author_id = (select auth.uid()));

drop policy if exists guides_insert_tutor on public.guides;
create policy guides_insert_tutor on public.guides
  for insert to authenticated
  with check (public.can_publish() and public.is_active_account() and author_id = (select auth.uid()));

drop policy if exists questions_insert_own on public.questions;
create policy questions_insert_own on public.questions
  for insert to authenticated
  with check (public.is_active_account() and author_id = (select auth.uid()));

drop policy if exists question_replies_insert on public.question_replies;
create policy question_replies_insert on public.question_replies
  for insert to authenticated
  with check (
    public.is_active_account()
    and author_id = (select auth.uid())
    and (
      (not is_official and publisher_id is null)
      or (is_official and public.can_answer_question(question_id, publisher_id))
    )
  );

drop policy if exists post_replies_insert_own on public.post_replies;
create policy post_replies_insert_own on public.post_replies
  for insert to authenticated
  with check (public.is_active_account() and user_id = (select auth.uid()));

-- Oculta respuestas entre usuarios bloqueados (mutuo, en ambos sentidos).
drop policy if exists post_replies_select on public.post_replies;
create policy post_replies_select on public.post_replies
  for select to authenticated using (not public.are_blocked((select auth.uid()), user_id));

drop policy if exists question_replies_select on public.question_replies;
create policy question_replies_select on public.question_replies
  for select to authenticated using (not public.are_blocked((select auth.uid()), author_id));

-- trips: publicar exige cuenta activa (no baneada/suspendida), además de ser
-- el propio conductor.
drop policy if exists trips_insert_driver on public.trips;
create policy trips_insert_driver on public.trips
  for insert to authenticated
  with check (driver_id = (select auth.uid()) and public.is_active_account());

-- messages: enviar exige acceso a la conversación, cuenta activa y no bloqueo
-- mutuo en un DM (can_send_message reemplaza can_access_conversation aquí).
drop policy if exists messages_insert_member on public.messages;
create policy messages_insert_member on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.can_send_message(conversation_id)
  );

-- ===========================================================================
-- RLS de las tablas nuevas
-- ===========================================================================

alter table public.trip_live_shares  enable row level security;
alter table public.sos_alerts        enable row level security;
alter table public.reports           enable row level security;
alter table public.user_blocks       enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.blocked_words     enable row level security;
alter table public.driver_verifications enable row level security;
alter table public.device_token_seen enable row level security;

-- trip_live_shares: el dueño del compartir (y admin, auditoría). El contacto
-- externo entra por get_live_share (security definer), no por esta tabla.
drop policy if exists trip_live_shares_select_own on public.trip_live_shares;
create policy trip_live_shares_select_own on public.trip_live_shares
  for select to authenticated using (sharer_id = (select auth.uid()) or public.is_admin());
-- Sin insert/update/delete: solo start/update/stop_trip_share (RPC).

-- sos_alerts: quien la disparó, y admin/owner (bandeja de seguridad).
drop policy if exists sos_alerts_select on public.sos_alerts;
create policy sos_alerts_select on public.sos_alerts
  for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
-- Sin insert/update: solo trigger_sos / resolve_sos (RPC).

-- reports: el reportante ve los suyos; tutor+ ve todos (bandeja de moderación).
drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports
  for select to authenticated using (reporter_id = (select auth.uid()) or public.can_moderate());
-- Sin insert/update: solo report_target / triage_report / apply_moderation_action / moderate_content (RPC).

-- user_blocks: cada quien administra los suyos directamente (sin RPC: es
-- simple, como ratings_insert_own).
drop policy if exists user_blocks_select_own on public.user_blocks;
create policy user_blocks_select_own on public.user_blocks
  for select to authenticated using (blocker_id = (select auth.uid()) or public.is_admin());

drop policy if exists user_blocks_insert_own on public.user_blocks;
create policy user_blocks_insert_own on public.user_blocks
  for insert to authenticated with check (blocker_id = (select auth.uid()));

drop policy if exists user_blocks_delete_own on public.user_blocks;
create policy user_blocks_delete_own on public.user_blocks
  for delete to authenticated using (blocker_id = (select auth.uid()));

-- moderation_actions: el sancionado ve su propio historial; admin/owner ven todo.
drop policy if exists moderation_actions_select on public.moderation_actions;
create policy moderation_actions_select on public.moderation_actions
  for select to authenticated using (target_user_id = (select auth.uid()) or public.is_admin());
-- Sin insert/update/delete: solo apply_moderation_action (RPC).

-- blocked_words: tutor+ puede ver la lista (para saber qué se filtra);
-- administrarla (crear/borrar) es admin+.
drop policy if exists blocked_words_select on public.blocked_words;
create policy blocked_words_select on public.blocked_words
  for select to authenticated using (public.can_moderate());

drop policy if exists blocked_words_write_admin on public.blocked_words;
create policy blocked_words_write_admin on public.blocked_words
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- driver_verifications: el propio conductor y tutor+ (revisión).
drop policy if exists driver_verifications_select on public.driver_verifications;
create policy driver_verifications_select on public.driver_verifications
  for select to authenticated using (user_id = (select auth.uid()) or public.can_moderate());
-- Sin insert/update: solo submit_driver_verification / review_driver_verification (RPC).

-- device_token_seen: señal de anti-abuso, solo admin/owner la audita.
drop policy if exists device_token_seen_select on public.device_token_seen;
create policy device_token_seen_select on public.device_token_seen
  for select to authenticated using (public.is_admin());
-- Sin insert: solo register_push_token (RPC).

-- ===========================================================================
-- Permisos de ejecución
-- ===========================================================================

revoke execute on function public.start_trip_share(uuid, text, text)              from public, anon;
revoke execute on function public.update_trip_share_location(uuid, double precision, double precision) from public, anon;
revoke execute on function public.stop_trip_share(uuid)                           from public, anon;
revoke execute on function public.get_live_share(text)                            from public;
revoke execute on function public.trigger_sos(uuid, double precision, double precision) from public, anon;
revoke execute on function public.resolve_sos(uuid, text, text)                   from public, anon;
revoke execute on function public.list_sos_alerts(boolean)                        from public, anon;
revoke execute on function public.purge_expired_trip_shares()                     from public, anon, authenticated;
revoke execute on function public.report_target(text, text, uuid, uuid, text, text) from public, anon;
revoke execute on function public.list_reports(text, text)                        from public, anon;
revoke execute on function public.triage_report(uuid, text)                       from public, anon;
revoke execute on function public.apply_moderation_action(uuid, text, text, integer, uuid) from public, anon;
revoke execute on function public.moderate_content(uuid, boolean, text)           from public, anon;
revoke execute on function public.submit_credential_review()                     from public, anon;
revoke execute on function public.review_credential(uuid, boolean, text)          from public, anon;
revoke execute on function public.list_credential_reviews(text)                   from public, anon;
revoke execute on function public.expire_credential_verifications()               from public, anon, authenticated;
revoke execute on function public.submit_driver_verification(text, text)          from public, anon;
revoke execute on function public.review_driver_verification(uuid, boolean, text) from public, anon;
revoke execute on function public.list_driver_verifications(text)                 from public, anon;
revoke execute on function public.enforce_driver_verification()                   from public, anon, authenticated;
revoke execute on function public.update_platform_config(integer, integer, integer, boolean) from public, anon;
revoke execute on function public.export_my_data()                               from public, anon;
revoke execute on function public.admin_delete_account(uuid)                      from public, anon, authenticated;
revoke execute on function public.redeem_item(text)                              from public, anon;
revoke execute on function public.register_push_token(text, text, text)          from public, anon;
revoke execute on function public.list_duplicate_account_signals(integer)         from public, anon;
revoke execute on function public.can_send_message(uuid)                          from public;
revoke execute on function public.reserve_seat(uuid)                              from public, anon;
revoke execute on function public.protect_profile_columns()                       from public, anon, authenticated;

grant execute on function public.start_trip_share(uuid, text, text)              to authenticated;
grant execute on function public.update_trip_share_location(uuid, double precision, double precision) to authenticated;
grant execute on function public.stop_trip_share(uuid)                           to authenticated;
grant execute on function public.get_live_share(text)                            to authenticated, anon;
grant execute on function public.trigger_sos(uuid, double precision, double precision) to authenticated;
grant execute on function public.resolve_sos(uuid, text, text)                   to authenticated;
grant execute on function public.list_sos_alerts(boolean)                        to authenticated;
grant execute on function public.report_target(text, text, uuid, uuid, text, text) to authenticated;
grant execute on function public.list_reports(text, text)                        to authenticated;
grant execute on function public.triage_report(uuid, text)                       to authenticated;
grant execute on function public.apply_moderation_action(uuid, text, text, integer, uuid) to authenticated;
grant execute on function public.moderate_content(uuid, boolean, text)           to authenticated;
grant execute on function public.submit_credential_review()                     to authenticated;
grant execute on function public.review_credential(uuid, boolean, text)          to authenticated;
grant execute on function public.list_credential_reviews(text)                   to authenticated;
grant execute on function public.submit_driver_verification(text, text)          to authenticated;
grant execute on function public.review_driver_verification(uuid, boolean, text) to authenticated;
grant execute on function public.list_driver_verifications(text)                 to authenticated;
grant execute on function public.update_platform_config(integer, integer, integer, boolean) to authenticated;
grant execute on function public.export_my_data()                               to authenticated;
grant execute on function public.admin_delete_account(uuid)                      to service_role;
grant execute on function public.redeem_item(text)                              to authenticated;
grant execute on function public.register_push_token(text, text, text)          to authenticated;
grant execute on function public.list_duplicate_account_signals(integer)         to authenticated;
grant execute on function public.reserve_seat(uuid)                              to authenticated;

-- ===========================================================================
-- Realtime: la bandeja de seguridad y las alertas SOS se actualizan en vivo.
-- ===========================================================================

do $$
declare t text;
begin
  foreach t in array array['sos_alerts', 'reports']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
exception when undefined_object then
  raise notice 'La publicación supabase_realtime no existe; créala desde el dashboard.';
end;
$$;

-- ===========================================================================
-- pg_cron: retención de ubicaciones y vencimiento semestral de credenciales.
-- ===========================================================================

do $$
declare v_job text;
begin
  foreach v_job in array array['safety-purge-trip-shares', 'safety-expire-credentials']
  loop
    perform cron.unschedule(v_job)
    where exists (select 1 from cron.job where jobname = v_job);
  end loop;
exception when others then
  null;
end;
$$;

do $$
begin
  perform cron.schedule(
    'safety-purge-trip-shares',
    '20 * * * *',
    $cron$ select public.purge_expired_trip_shares(); $cron$
  );
  perform cron.schedule(
    'safety-expire-credentials',
    '30 3 * * *',
    $cron$ select public.expire_credential_verifications(); $cron$
  );
exception when others then
  raise notice 'pg_cron no disponible; programa estas funciones con un scheduler externo.';
end;
$$;
