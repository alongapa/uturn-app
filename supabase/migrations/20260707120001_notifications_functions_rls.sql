-- Unities — Sesión 7: funciones, triggers, RLS y cron de notificaciones.
-- Diseño: cada evento de dominio (mensaje, respuesta Q&A, reserva, pago
-- confirmado, strike, baneo, historia, evento destacado) encola una fila en
-- public.notifications vía triggers de servidor. Las preferencias por
-- categoría se verifican AQUÍ (server-side) antes de encolar: lo desactivado
-- ni siquiera entra al historial. Los recordatorios con horario (pago 24 h/4 h,
-- viaje 1 h) los encola pg_cron; el envío push lo hace la Edge Function
-- send-push (Expo Push API), invocada cada minuto vía pg_net.

-- ===========================================================================
-- Helpers: preferencias y encolado
-- ===========================================================================

-- ¿Tiene el usuario activada esta categoría? Sin fila en notification_prefs =
-- todo activado. SECURITY DEFINER: lo consultan triggers sobre tablas ajenas.
create or replace function public.notification_category_enabled(p_user uuid, p_category text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select case p_category
        when 'pagos'    then np.pagos
        when 'viajes'   then np.viajes
        when 'social'   then np.social
        when 'mensajes' then np.mensajes
        else true
      end
      from public.notification_prefs np
      where np.user_id = p_user),
    true
  );
$$;

-- Punto único de encolado: respeta las preferencias del destinatario y
-- deduplica recordatorios por dedupe_key. Devuelve el id creado (o null si
-- se silenció / dedupe). Server-only: lo llaman triggers y funciones cron.
create or replace function public.enqueue_notification(
  p_user       uuid,
  p_category   text,
  p_type       text,
  p_title      text,
  p_body       text,
  p_url        text default null,
  p_data       jsonb default '{}'::jsonb,
  p_dedupe_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_user is null then
    return null;
  end if;
  -- Preferencias respetadas en el servidor ANTES de encolar/enviar.
  if not public.notification_category_enabled(p_user, p_category) then
    return null;
  end if;

  insert into public.notifications (user_id, category, type, title, body, url, data, dedupe_key)
  values (p_user, p_category, p_type, p_title, coalesce(p_body, ''), p_url,
          coalesce(p_data, '{}'::jsonb), p_dedupe_key)
  on conflict do nothing
  returning id into v_id;

  return v_id;
end;
$$;

-- ===========================================================================
-- RPCs de cliente: registro de push tokens
-- ===========================================================================

-- Upsert por token: si otro usuario inicia sesión en el mismo dispositivo, la
-- fila se reasigna (el teléfono recibe los push de la cuenta activa, nunca de
-- la anterior). Por eso es RPC definer y no un INSERT directo con RLS.
create or replace function public.register_push_token(
  p_token       text,
  p_platform    text,
  p_device_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
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
end;
$$;

-- Al cerrar sesión el cliente da de baja el token del dispositivo (se llama
-- ANTES de signOut, con la sesión aún viva).
create or replace function public.unregister_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = 'insufficient_privilege';
  end if;
  delete from public.push_tokens
  where token = btrim(coalesce(p_token, '')) and user_id = auth.uid();
end;
$$;

-- ===========================================================================
-- Cola de envío: la Edge Function send-push reclama filas pendientes de forma
-- atómica (FOR UPDATE SKIP LOCKED evita corridas concurrentes duplicando push;
-- 'processing' con claim viejo se reintenta si una corrida murió a medias).
-- ===========================================================================

create or replace function public.claim_pending_push(p_limit integer default 100)
returns setof public.notifications
language sql
security definer
set search_path = public
as $$
  update public.notifications n
  set push_status = 'processing', push_claimed_at = now()
  where n.id in (
    select id from public.notifications
    where push_status = 'pending'
       or (push_status = 'processing' and push_claimed_at < now() - interval '5 minutes')
    order by created_at
    limit greatest(coalesce(p_limit, 100), 1)
    for update skip locked
  )
  returning n.*;
$$;

-- ===========================================================================
-- Triggers de eventos de dominio
-- ===========================================================================

-- Mensaje nuevo → notifica a los demás miembros de la conversación. El
-- cliente en primer plano suprime el banner (el chat ya es realtime); con la
-- app en segundo plano llega como push. Deep link: /chat/<conversación>.
create or replace function public.notify_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv    public.conversations;
  v_sender  text;
  v_preview text;
  v_title   text;
  v_member  record;
begin
  select * into v_conv from public.conversations where id = new.conversation_id;

  select coalesce(nullif(btrim(full_name), ''), 'Estudiante') into v_sender
  from public.profiles where id = new.sender_id;

  v_preview := coalesce(nullif(left(btrim(new.body), 120), ''),
                        case when new.image_path is not null then '📷 Foto' else '' end);
  v_title := case
    when v_conv.kind = 'soporte' then 'Soporte Unities · ' || v_sender
    else v_sender
  end;

  for v_member in
    select user_id from public.conversation_members
    where conversation_id = new.conversation_id and user_id <> new.sender_id
  loop
    perform public.enqueue_notification(
      v_member.user_id, 'mensajes', v_conv.kind, v_title, v_preview,
      '/chat/' || new.conversation_id,
      jsonb_build_object('conversationId', new.conversation_id, 'senderId', new.sender_id)
    );
  end loop;

  return null;
end;
$$;

drop trigger if exists messages_notify on public.messages;
create trigger messages_notify after insert on public.messages
  for each row execute function public.notify_on_message();

-- Respuesta en Q&A → notifica al autor de la pregunta (respuesta oficial de
-- tutor/federación destacada como tal). Deep link: /qa/<pregunta>.
create or replace function public.notify_on_question_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_question public.questions;
  v_replier  text;
begin
  select * into v_question from public.questions where id = new.question_id;
  if v_question.author_id is null or v_question.author_id = new.author_id then
    return null;
  end if;

  select coalesce(nullif(btrim(full_name), ''), 'Alguien') into v_replier
  from public.profiles where id = new.author_id;

  perform public.enqueue_notification(
    v_question.author_id,
    'social',
    case when new.is_official then 'qa_oficial' else 'qa_respuesta' end,
    case when new.is_official
      then '✅ Respuesta oficial a tu pregunta'
      else v_replier || ' respondió tu pregunta' end,
    left(btrim(new.body), 140),
    '/qa/' || new.question_id,
    jsonb_build_object('questionId', new.question_id, 'official', new.is_official)
  );
  return null;
end;
$$;

drop trigger if exists question_replies_notify on public.question_replies;
create trigger question_replies_notify after insert on public.question_replies
  for each row execute function public.notify_on_question_reply();

-- Reserva nueva → notifica al conductor. Deep link: /trip/<viaje>.
create or replace function public.notify_on_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip      public.trips;
  v_passenger text;
begin
  if new.status = 'cancelled' then
    return null;
  end if;

  select * into v_trip from public.trips where id = new.trip_id;
  select coalesce(nullif(btrim(full_name), ''), 'Un estudiante') into v_passenger
  from public.profiles where id = new.passenger_id;

  perform public.enqueue_notification(
    v_trip.driver_id, 'viajes', 'reserva_nueva',
    '🎟️ Nueva reserva en tu viaje',
    v_passenger || ' reservó un cupo ' ||
      coalesce(v_trip.origin_campus_name, 'origen') || ' → ' ||
      coalesce(v_trip.destination_campus_name, 'destino') || '.',
    '/trip/' || v_trip.id,
    jsonb_build_object('tripId', v_trip.id, 'bookingId', new.id)
  );
  return null;
end;
$$;

drop trigger if exists bookings_notify on public.bookings;
create trigger bookings_notify after insert on public.bookings
  for each row execute function public.notify_on_booking();

-- Pago confirmado por el conductor → avisa al pasajero.
create or replace function public.notify_on_payment_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
begin
  if new.status = 'confirmed' and old.status <> 'confirmed' then
    select * into v_booking from public.bookings where id = new.booking_id;
    perform public.enqueue_notification(
      v_booking.passenger_id, 'pagos', 'pago_confirmado',
      '✅ Pago confirmado',
      'El conductor confirmó tu pago de $' || new.total_clp || '. ¡Buen viaje!',
      '/my-trips',
      jsonb_build_object('bookingId', new.booking_id, 'paymentId', new.id)
    );
  end if;
  return null;
end;
$$;

drop trigger if exists payments_notify on public.payments;
create trigger payments_notify after update on public.payments
  for each row execute function public.notify_on_payment_update();

-- Strike por impago (los emite expire_overdue_payments, Sesión 3).
create or replace function public.notify_on_strike()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.enqueue_notification(
    new.user_id, 'pagos', 'strike',
    '⚠️ Recibiste un strike por pago vencido',
    'Se venció el plazo de 48 h de un pago. Al tercer strike quedas 2 días fuera de los turnos.',
    '/my-trips',
    jsonb_build_object('strikeId', new.id, 'bookingId', new.booking_id)
  );
  return null;
end;
$$;

drop trigger if exists strikes_notify on public.strikes;
create trigger strikes_notify after insert on public.strikes
  for each row execute function public.notify_on_strike();

-- Baneo de turnos (3.er strike): profiles.payment_ban_until avanza.
create or replace function public.notify_on_ban()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payment_ban_until is not null
     and new.payment_ban_until > now()
     and (old.payment_ban_until is null or new.payment_ban_until > old.payment_ban_until) then
    perform public.enqueue_notification(
      new.id, 'pagos', 'baneo',
      '🚫 Quedaste fuera de los turnos por 2 días',
      'Acumulaste 3 strikes por impago. Podrás volver a reservar el ' ||
        to_char(new.payment_ban_until at time zone 'America/Santiago', 'DD/MM "a las" HH24:MI') || '.',
      '/my-trips',
      jsonb_build_object('banUntil', new.payment_ban_until)
    );
  end if;
  return null;
end;
$$;

drop trigger if exists profiles_notify_ban on public.profiles;
create trigger profiles_notify_ban after update on public.profiles
  for each row execute function public.notify_on_ban();

-- Historia nueva de un publisher → notifica a la comunidad (no hay tabla de
-- follows todavía: va a todos los alumnos con la categoría social activa;
-- inserción masiva en un solo INSERT..SELECT). Deep link: feed.
create or replace function public.notify_on_story()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_publisher text;
begin
  select name into v_publisher from public.publishers where id = new.publisher_id;

  insert into public.notifications (user_id, category, type, title, body, url, data)
  select p.id, 'social', 'historia',
         '📸 ' || coalesce(v_publisher, 'Un publisher') || ' subió una historia',
         coalesce(nullif(btrim(new.caption), ''), 'Toca para verla antes de que expire.'),
         '/',
         jsonb_build_object('storyId', new.id, 'publisherId', new.publisher_id)
  from public.profiles p
  where p.id is distinct from new.author_id
    and public.notification_category_enabled(p.id, 'social');

  return null;
end;
$$;

drop trigger if exists stories_notify on public.stories;
create trigger stories_notify after insert on public.stories
  for each row execute function public.notify_on_story();

-- Evento destacado en el widget semanal (widget_config.featured, Sesión 5) →
-- notifica a la comunidad una sola vez por post (dedupe por usuario).
create or replace function public.notify_on_featured_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post      public.posts;
  v_publisher text;
begin
  if not new.featured or (tg_op = 'UPDATE' and old.featured) then
    return null;
  end if;

  select * into v_post from public.posts where id = new.post_id;
  if v_post.id is null then
    return null;
  end if;
  select name into v_publisher from public.publishers where id = v_post.publisher_id;

  insert into public.notifications (user_id, category, type, title, body, url, data, dedupe_key)
  select p.id, 'social', 'evento_destacado',
         '⭐ Evento destacado de ' || coalesce(v_publisher, 'la semana'),
         coalesce(nullif(left(btrim(v_post.body), 140), ''), 'Revisa el evento destacado de la semana.') ||
           coalesce(' · ' || to_char(v_post.event_starts_at at time zone 'America/Santiago', 'DD/MM HH24:MI'), ''),
         '/',
         jsonb_build_object('postId', v_post.id, 'publisherId', v_post.publisher_id),
         'evento_destacado:' || v_post.id || ':' || p.id
  from public.profiles p
  where public.notification_category_enabled(p.id, 'social')
  on conflict do nothing;

  return null;
end;
$$;

drop trigger if exists widget_config_notify on public.widget_config;
create trigger widget_config_notify after insert or update on public.widget_config
  for each row execute function public.notify_on_featured_event();

-- ===========================================================================
-- Recordatorios programados (pg_cron cada 5 min): son idempotentes gracias a
-- dedupe_key, así que da igual cuántas veces corran dentro de la ventana.
-- ===========================================================================

-- Pago por vencer: recordatorio a las 24 h y a las 4 h del plazo de 48 h.
create or replace function public.enqueue_payment_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_rec   record;
begin
  for v_rec in
    select pay.id as payment_id, pay.total_clp, pay.due_at, b.id as booking_id, b.passenger_id,
           case when pay.due_at <= now() + interval '4 hours' then '4h' else '24h' end as window
    from public.payments pay
    join public.bookings b on b.id = pay.booking_id
    where pay.status = 'pending'
      and b.status <> 'cancelled'
      and pay.due_at > now()
      and pay.due_at <= now() + interval '24 hours'
  loop
    if v_rec.window = '4h' then
      if public.enqueue_notification(
        v_rec.passenger_id, 'pagos', 'pago_4h',
        '🚨 Últimas 4 horas para pagar',
        'Tu pago de $' || v_rec.total_clp || ' vence a las ' ||
          to_char(v_rec.due_at at time zone 'America/Santiago', 'HH24:MI') ||
          '. Si no pagas recibirás un strike.',
        '/payment?bookingId=' || v_rec.booking_id,
        jsonb_build_object('bookingId', v_rec.booking_id, 'paymentId', v_rec.payment_id),
        'pago_4h:' || v_rec.payment_id
      ) is not null then
        v_count := v_count + 1;
      end if;
    else
      if public.enqueue_notification(
        v_rec.passenger_id, 'pagos', 'pago_24h',
        '⏳ Tu pago vence en menos de 24 horas',
        'Paga $' || v_rec.total_clp || ' de tu viaje antes del ' ||
          to_char(v_rec.due_at at time zone 'America/Santiago', 'DD/MM "a las" HH24:MI') ||
          ' para mantener tu racha y evitar strikes.',
        '/payment?bookingId=' || v_rec.booking_id,
        jsonb_build_object('bookingId', v_rec.booking_id, 'paymentId', v_rec.payment_id),
        'pago_24h:' || v_rec.payment_id
      ) is not null then
        v_count := v_count + 1;
      end if;
    end if;
  end loop;

  return v_count;
end;
$$;

-- Viaje que sale en 1 h: recordatorio a pasajeros confirmados y al conductor,
-- con el punto de encuentro en el cuerpo y deep link al detalle del viaje.
create or replace function public.enqueue_trip_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_rec   record;
  v_place text;
begin
  for v_rec in
    select t.id as trip_id, t.departs_at, t.origin_campus_name, t.meeting_point_id,
           t.driver_id, b.passenger_id
    from public.trips t
    join public.bookings b on b.trip_id = t.id and b.status = 'confirmed'
    where t.status in ('published', 'full')
      and t.departs_at > now()
      and t.departs_at <= now() + interval '1 hour'
  loop
    v_place := coalesce(v_rec.origin_campus_name, 'el punto de encuentro acordado');

    -- Pasajero
    if public.enqueue_notification(
      v_rec.passenger_id, 'viajes', 'viaje_1h',
      '🚗 Tu viaje sale en 1 hora',
      'Sale a las ' || to_char(v_rec.departs_at at time zone 'America/Santiago', 'HH24:MI') ||
        ' desde ' || v_place || '. Revisa el punto de encuentro en el detalle.',
      '/trip/' || v_rec.trip_id,
      jsonb_build_object('tripId', v_rec.trip_id, 'meetingPointId', v_rec.meeting_point_id),
      'viaje_1h:' || v_rec.trip_id || ':' || v_rec.passenger_id
    ) is not null then
      v_count := v_count + 1;
    end if;

    -- Conductor (dedupe por viaje: aunque haya varios pasajeros, un solo aviso)
    if public.enqueue_notification(
      v_rec.driver_id, 'viajes', 'viaje_1h',
      '🚗 Tu viaje como conductor sale en 1 hora',
      'Sale a las ' || to_char(v_rec.departs_at at time zone 'America/Santiago', 'HH24:MI') ||
        ' desde ' || v_place || '. Tus pasajeros ya fueron avisados.',
      '/trip/' || v_rec.trip_id,
      jsonb_build_object('tripId', v_rec.trip_id, 'meetingPointId', v_rec.meeting_point_id),
      'viaje_1h:' || v_rec.trip_id || ':' || v_rec.driver_id
    ) is not null then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

-- ===========================================================================
-- Protección de columnas: el cliente solo puede tocar read_at (marcar leído);
-- todo lo demás es del servidor (patrón protect_question_columns, Sesión 6).
-- ===========================================================================

create or replace function public.protect_notification_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;  -- contexto de servidor: confía en el cambio
  end if;
  new.user_id         := old.user_id;
  new.category        := old.category;
  new.type            := old.type;
  new.title           := old.title;
  new.body            := old.body;
  new.url             := old.url;
  new.data            := old.data;
  new.dedupe_key      := old.dedupe_key;
  new.push_status     := old.push_status;
  new.push_claimed_at := old.push_claimed_at;
  new.push_sent_at    := old.push_sent_at;
  new.created_at      := old.created_at;
  return new;
end;
$$;

drop trigger if exists notifications_protect_columns on public.notifications;
create trigger notifications_protect_columns before update on public.notifications
  for each row execute function public.protect_notification_columns();

drop trigger if exists push_tokens_set_updated_at on public.push_tokens;
create trigger push_tokens_set_updated_at before update on public.push_tokens
  for each row execute function public.set_updated_at();

drop trigger if exists notification_prefs_set_updated_at on public.notification_prefs;
create trigger notification_prefs_set_updated_at before update on public.notification_prefs
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- Row Level Security
-- ===========================================================================

alter table public.push_tokens        enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.notifications      enable row level security;

-- push_tokens: cada quien ve/borra los suyos; alta y reasignación SOLO por RPC.
drop policy if exists push_tokens_select_own on public.push_tokens;
create policy push_tokens_select_own on public.push_tokens
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists push_tokens_delete_own on public.push_tokens;
create policy push_tokens_delete_own on public.push_tokens
  for delete to authenticated using (user_id = (select auth.uid()));

-- notification_prefs: el dueño lee y hace upsert de sus switches.
drop policy if exists notification_prefs_select_own on public.notification_prefs;
create policy notification_prefs_select_own on public.notification_prefs
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists notification_prefs_insert_own on public.notification_prefs;
create policy notification_prefs_insert_own on public.notification_prefs
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists notification_prefs_update_own on public.notification_prefs;
create policy notification_prefs_update_own on public.notification_prefs
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- notifications: el dueño lee su historial y marca leído (protect trigger
-- limita el UPDATE a read_at); insertar es exclusivo del servidor.
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ===========================================================================
-- Permisos de ejecución (patrón Sesión 3: revocar todo, conceder lo mínimo)
-- ===========================================================================

revoke execute on function public.notification_category_enabled(uuid, text) from public, anon, authenticated;
revoke execute on function public.enqueue_notification(uuid, text, text, text, text, text, jsonb, text) from public, anon, authenticated;
revoke execute on function public.register_push_token(text, text, text)   from public, anon;
revoke execute on function public.unregister_push_token(text)             from public, anon;
revoke execute on function public.claim_pending_push(integer)             from public, anon, authenticated;
revoke execute on function public.enqueue_payment_reminders()             from public, anon, authenticated;
revoke execute on function public.enqueue_trip_reminders()                from public, anon, authenticated;
revoke execute on function public.notify_on_message()                     from public, anon, authenticated;
revoke execute on function public.notify_on_question_reply()              from public, anon, authenticated;
revoke execute on function public.notify_on_booking()                     from public, anon, authenticated;
revoke execute on function public.notify_on_payment_update()              from public, anon, authenticated;
revoke execute on function public.notify_on_strike()                      from public, anon, authenticated;
revoke execute on function public.notify_on_ban()                         from public, anon, authenticated;
revoke execute on function public.notify_on_story()                       from public, anon, authenticated;
revoke execute on function public.notify_on_featured_event()              from public, anon, authenticated;
revoke execute on function public.protect_notification_columns()          from public, anon, authenticated;

grant execute on function public.register_push_token(text, text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;
-- La Edge Function send-push (service role) reclama la cola.
grant execute on function public.claim_pending_push(integer) to service_role;

-- ===========================================================================
-- Realtime: el centro de notificaciones y el badge se actualizan en vivo.
-- La RLS filtra: cada cliente solo recibe sus propias notificaciones.
-- ===========================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
exception when undefined_object then
  raise notice 'La publicación supabase_realtime no existe; créala desde el dashboard.';
end;
$$;

-- ===========================================================================
-- pg_cron: encolar recordatorios cada 5 min y disparar el envío push cada
-- minuto. El envío HTTP usa pg_net → Edge Function send-push (Expo Push API).
-- ===========================================================================

create extension if not exists pg_net;

-- Invoca la Edge Function send-push. La URL del proyecto no es secreta (vive
-- en el .env del app como EXPO_PUBLIC_SUPABASE_URL); send-push se despliega
-- sin verify_jwt (como expire-payments): solo procesa la cola interna y
-- responde contadores, sin exponer datos.
create or replace function public.invoke_send_push()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url     := 'https://jkqzuddxahoamoygdrrb.supabase.co/functions/v1/send-push',
    body    := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 10000
  );
exception when others then
  raise notice 'pg_net no disponible (%): invoca send-push desde un scheduler externo.', sqlerrm;
end;
$$;

revoke execute on function public.invoke_send_push() from public, anon, authenticated;

-- Reprograma de forma idempotente (patrón 20260701000004_cron_seed.sql).
do $$
declare
  v_job text;
begin
  foreach v_job in array array['notifications-reminders', 'notifications-send-push']
  loop
    perform cron.unschedule(v_job)
    where exists (select 1 from cron.job where jobname = v_job);
  end loop;
exception when others then
  null;  -- pg_cron no disponible en algunos entornos locales; se ignora.
end;
$$;

do $$
begin
  perform cron.schedule(
    'notifications-reminders',
    '*/5 * * * *',
    $cron$ select public.enqueue_payment_reminders(), public.enqueue_trip_reminders(); $cron$
  );
  perform cron.schedule(
    'notifications-send-push',
    '* * * * *',
    $cron$ select public.invoke_send_push(); $cron$
  );
exception when others then
  raise notice 'pg_cron no disponible; programa los recordatorios y send-push con un scheduler externo.';
end;
$$;
